import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Page, Tap } from '../../components/ui';
import { kickWorker, queuePhoto } from '../../lib/jobs';
import { useSession } from '../../lib/session';
import { notify } from '../../lib/dialog';
import { radius, useTheme } from '../../lib/theme';

type Upload = { uri: string; state: 'waiting' | 'uploading' | 'done' | 'error' };
const PARALLEL = 3;

export default function UploadPhotos() {
  const t = useTheme();
  const { demo } = useSession();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const running = useRef(false);

  const setState = (uri: string, state: Upload['state']) =>
    setUploads((list) => list.map((u) => (u.uri === uri ? { ...u, state } : u)));

  const run = async (uris: string[]) => {
    setUploads((list) => [...list, ...uris.map((uri) => ({ uri, state: 'waiting' as const }))]);
    if (running.current) return;
    running.current = true;
    const queue = [...uris];
    const worker = async () => {
      for (let uri = queue.shift(); uri; uri = queue.shift()) {
        setState(uri, 'uploading');
        try {
          await queuePhoto(uri);
          setState(uri, 'done');
        } catch {
          setState(uri, 'error');
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    running.current = false;
    kickWorker().catch(() => notify('Uploaded', 'Photos are saved. The AI will pick them up next time you open Review.'));
  };

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 60, quality: 0.8 });
    if (!res.canceled) run(res.assets.map((a) => a.uri));
  };

  // Keep the camera open shot after shot until the user cancels.
  const shoot = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return notify('Camera permission is needed.');
    const shots: string[] = [];
    for (;;) {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled || !res.assets[0]) break;
      shots.push(res.assets[0].uri);
      if (Platform.OS === 'web') break; // browsers can't reopen the camera without a tap
    }
    if (shots.length) run(shots);
  };

  const done = uploads.filter((u) => u.state === 'done').length;
  const failed = uploads.filter((u) => u.state === 'error').length;
  const busy = uploads.some((u) => u.state === 'waiting' || u.state === 'uploading');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Page style={{ gap: 16 }}>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          {demo
            ? 'Demo mode: photos are kept in this browser and go straight to Review, where you type what each one is and pick the supermarket product.'
            : 'Snap or pick as many photos as you like. They upload now and the AI sorts them out in the background, matching each food to real supermarket products. You approve them in Review.'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Tap onPress={shoot} style={[styles.big, { backgroundColor: t.accent }]}>
            <Feather name="camera" size={30} color={t.accentText} />
            <Text style={[styles.bigText, { color: t.accentText }]}>Take photos</Text>
          </Tap>
          <Tap onPress={pick} style={[styles.big, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1 }]}>
            <Feather name="image" size={30} color={t.text} />
            <Text style={[styles.bigText, { color: t.text }]}>From gallery</Text>
          </Tap>
        </View>

        {uploads.length > 0 && (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
                {busy ? `Uploading ${done}/${uploads.length}…` : `${done} photo${done === 1 ? '' : 's'} ready to review`}
              </Text>
              {failed > 0 && <Text style={{ color: t.danger, fontWeight: '600' }}>{failed} failed</Text>}
            </View>
            <View style={[styles.progress, { backgroundColor: t.chip }]}>
              <View style={{ width: `${(100 * (done + failed)) / uploads.length}%`, height: '100%', backgroundColor: t.accent, borderRadius: 4 }} />
            </View>
            <View style={styles.grid}>
              {uploads.map((u) => (
                <View key={u.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: u.uri }} style={[styles.thumb, { opacity: u.state === 'done' ? 1 : 0.5 }]} contentFit="cover" />
                  {u.state === 'done' && <Feather name="check-circle" size={18} color="#fff" style={styles.thumbIcon} />}
                  {u.state === 'error' && <Feather name="alert-circle" size={18} color={t.danger} style={styles.thumbIcon} />}
                </View>
              ))}
            </View>
            {!busy && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Go to Review" onPress={() => router.navigate('/review')} style={{ flex: 1 }} />
                <Button title="Clear" kind="secondary" onPress={() => setUploads([])} />
              </View>
            )}
          </Card>
        )}

        <Button
          title="Add one item by hand"
          kind="ghost"
          icon={<Feather name="edit-3" size={16} color={t.accent} />}
          onPress={() => router.push('/add')}
        />
      </Page>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  big: { flex: 1, height: 130, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  bigText: { fontWeight: '700', fontSize: 16 },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbIcon: { position: 'absolute', right: 4, bottom: 4 },
});
