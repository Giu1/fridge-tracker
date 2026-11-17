import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Tap } from '../../components/ui';
import { confirmAsk, notify } from '../../lib/dialog';
import { deleteReceipt, downloadReceipt, receiptPreviewUrl, sendReceipt, useReceiptLines, useReceipts } from '../../lib/receipts';
import { useSession } from '../../lib/session';
import { radius, useTheme } from '../../lib/theme';
import type { Receipt } from '../../lib/types';

const kb = (n: number | null) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function Receipts() {
  const t = useTheme();
  const { demo } = useSession();
  const { receipts, loading, offline, reload } = useReceipts();
  const { all: lines } = useReceiptLines(undefined);
  const [sending, setSending] = useState(false);

  const send = async (files: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }[]) => {
    if (!files.length) return;
    setSending(true);
    try {
      for (const f of files) await sendReceipt(f);
    } catch (e) {
      notify('Could not send the receipt', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const camera = async () => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return notify('Camera permission is needed.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!res.canceled) send(res.assets.map((a) => ({ uri: a.uri, name: a.fileName, mimeType: a.mimeType, size: a.fileSize })));
  };
  const file = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
    if (!res.canceled) send(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size })));
  };

  return (
    <FlatList
      data={receipts}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={t.accent} />}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      ListHeaderComponent={
        <View style={{ gap: 14, marginBottom: 6 }}>
          <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
            {demo ? 'Demo mode: receipts are kept in this browser. ' : ''}
            Send the receipt, download it wherever you turn it into a list (any AI you like), then upload the list here. The
            app creates every item as a draft so you can correct the whole list on one page before saving.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Tap onPress={camera} disabled={sending} style={[styles.big, { backgroundColor: t.accent }]}>
              <Feather name="camera" size={28} color={t.accentText} />
              <Text style={[styles.bigText, { color: t.accentText }]}>Photo of receipt</Text>
            </Tap>
            <Tap onPress={file} disabled={sending} style={[styles.big, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1 }]}>
              <Feather name="upload" size={28} color={t.text} />
              <Text style={[styles.bigText, { color: t.text }]}>Photo or PDF file</Text>
            </Tap>
          </View>
          {sending && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator color={t.accent} />
              <Text style={{ color: t.muted }}>Sending…</Text>
            </View>
          )}
          <Button
            title="Upload a list without a receipt"
            kind="ghost"
            icon={<Feather name="list" size={16} color={t.accent} />}
            onPress={() => router.push('/receipt/import')}
          />
          {offline && <Text style={{ color: t.warn }}>Offline: showing the copy on this device.</Text>}
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
            <Feather name="file-text" size={40} color={t.muted} />
            <Text style={{ color: t.muted, fontSize: 16, textAlign: 'center' }}>No receipts yet.</Text>
          </View>
        )
      }
      renderItem={({ item: r }) => <ReceiptCard receipt={r} drafts={lines.filter((l) => l.receipt_id === r.id).length} />}
    />
  );
}

function ReceiptCard({ receipt: r, drafts }: { receipt: Receipt; drafts: number }) {
  const t = useTheme();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    receiptPreviewUrl(r).then((u) => alive && setPreview(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [r]);

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const status =
    drafts > 0
      ? { text: `${drafts} to check`, color: t.warn, bg: t.warnSoft }
      : r.status === 'done'
        ? { text: `${r.item_count} item${r.item_count === 1 ? '' : 's'} added`, color: t.accent, bg: t.accentSoft }
        : { text: 'Waiting for its list', color: t.muted, bg: t.chip };
  const isPdf = r.mime_type === 'application/pdf';

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }]}>
            <Feather name={r.file_path ? (isPdf ? 'file-text' : 'image') : 'list'} size={24} color={t.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{r.title || r.file_name || 'Receipt'}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {[new Date(r.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }), isPdf ? 'PDF' : null, kb(r.size_bytes)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={{ color: status.color, fontWeight: '700', fontSize: 12 }}>{status.text}</Text>
          </View>
        </View>
        <Pressable
          hitSlop={8}
          accessibilityLabel="Delete receipt"
          onPress={async () => {
            const msg = drafts ? `Its ${drafts} unchecked lines go too. Items already added stay.` : 'Items already added stay.';
            if (await confirmAsk('Delete this receipt?', msg, 'Delete')) run('del', () => deleteReceipt(r));
          }}
          style={{ padding: 6 }}
        >
          {busy === 'del' ? <ActivityIndicator color={t.muted} /> : <Feather name="trash-2" size={18} color={t.muted} />}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {r.file_path ? (
          <Button
            title="Download"
            kind="secondary"
            icon={<Feather name="download" size={16} color={t.text} />}
            busy={busy === 'dl'}
            onPress={() => run('dl', () => downloadReceipt(r))}
            style={{ flexGrow: 1 }}
          />
        ) : null}
        {drafts > 0 ? (
          <Button
            title="Check the list"
            icon={<Feather name="edit-3" size={16} color={t.accentText} />}
            onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: r.id } })}
            style={{ flexGrow: 1 }}
          />
        ) : (
          <Button
            title={r.status === 'done' ? 'Upload more' : 'Upload its list'}
            kind={r.status === 'done' ? 'secondary' : 'primary'}
            icon={<Feather name="list" size={16} color={r.status === 'done' ? t.text : t.accentText} />}
            onPress={() => router.push({ pathname: '/receipt/import', params: { receipt: r.id } })}
            style={{ flexGrow: 1 }}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  big: { flex: 1, height: 116, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  bigText: { fontWeight: '700', fontSize: 15, textAlign: 'center' },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 2 },
});
