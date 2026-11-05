import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { NutriScore } from '../../components/NutriScore';
import { Photo } from '../../components/Photo';
import { StoreDots } from '../../components/StoreChips';
import { Button, Card, tick } from '../../components/ui';
import { acceptDetection, bestCandidate, discardJob, kickWorker, rejectDetection, retryJob, useJobs } from '../../lib/jobs';
import { notify } from '../../lib/dialog';
import { radius, useTheme } from '../../lib/theme';
import type { Detection, PhotoJob } from '../../lib/types';

type Choice = string; // product code, or 'none' = keep the AI's name only

export default function Review() {
  const t = useTheme();
  const { jobs, loading } = useJobs();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const kicked = useRef(false);

  const waiting = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
  const ready = jobs.filter((j) => j.status === 'ready');

  // If photos are waiting (e.g. the phone went offline after uploading), make sure the worker runs.
  useEffect(() => {
    if (!kicked.current && jobs.some((j) => j.status === 'pending')) {
      kicked.current = true;
      kickWorker().catch(() => {});
    }
  }, [jobs]);

  const keyOf = (job: PhotoJob, i: number) => `${job.id}:${i}`;
  const chosen = (job: PhotoJob, i: number, d: Detection): Choice => choice[keyOf(job, i)] ?? bestCandidate(d)?.code ?? 'none';

  const act = async (k: string, fn: () => Promise<void>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const accept = (job: PhotoJob, i: number, d: Detection) => {
    const c = chosen(job, i, d);
    const product = c === 'none' ? null : d.candidates.find((p) => p.code === c) ?? null;
    return act(keyOf(job, i), () => acceptDetection(job, i, product));
  };

  const acceptAll = async () => {
    setBusy('all');
    try {
      for (const job of ready) {
        let current = job;
        for (const [i, d] of (job.detections ?? []).entries()) {
          if (current.decisions?.[i]) continue;
          const c = chosen(job, i, d);
          await acceptDetection(current, i, c === 'none' ? null : d.candidates.find((p) => p.code === c) ?? null);
          current = { ...current, decisions: Object.assign([...(current.decisions ?? [])], { [i]: { status: 'accepted', item_id: '' } }) };
        }
        if (!job.detections?.length) await discardJob(job);
      }
    } catch (e) {
      notify('Stopped', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const undecidedCount = ready.reduce((n, j) => n + (j.detections ?? []).filter((_, i) => !j.decisions?.[i]).length, 0);

  return (
    <FlatList
      data={jobs.filter((j) => j.status !== 'pending' && j.status !== 'processing')}
      keyExtractor={(j) => j.id}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {waiting.length > 0 && (
            <View style={[styles.status, { backgroundColor: t.accentSoft }]}>
              <ActivityIndicator color={t.accent} />
              <Text style={{ color: t.accent, fontWeight: '700', flex: 1 }}>
                AI is looking at {waiting.length} photo{waiting.length === 1 ? '' : 's'}… you can close the app.
              </Text>
            </View>
          )}
          {undecidedCount > 1 && (
            <Button
              title={`Accept all ${undecidedCount} best guesses`}
              icon={<Feather name="check" size={18} color={t.accentText} />}
              onPress={acceptAll}
              busy={busy === 'all'}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        loading || waiting.length ? undefined : (
          <View style={{ alignItems: 'center', marginTop: 70, gap: 10 }}>
            <Feather name="inbox" size={44} color={t.muted} />
            <Text style={{ color: t.muted, fontSize: 16, textAlign: 'center' }}>Nothing to review.{'\n'}Add photos and they will show up here.</Text>
          </View>
        )
      }
      renderItem={({ item: job }) => (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' }}>
            <Photo path={job.photo_path} style={styles.jobPhoto} />
            <View style={{ flex: 1, gap: 2 }}>
              {job.status === 'failed' ? (
                <>
                  <Text style={{ color: t.danger, fontWeight: '700' }}>Could not analyse</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={2}>{job.error}</Text>
                </>
              ) : job.detections?.length ? (
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>
                  {job.detections.length === 1 ? '1 food found' : `${job.detections.length} foods found`}
                </Text>
              ) : (
                <Text style={{ color: t.muted, fontWeight: '600' }}>No food found in this photo</Text>
              )}
            </View>
            {job.status === 'failed' && (
              <Pressable onPress={() => act(job.id, () => retryJob(job))} hitSlop={8} style={styles.iconBtn}>
                <Feather name="rotate-cw" size={18} color={t.text} />
              </Pressable>
            )}
            <Pressable onPress={() => act(job.id, () => discardJob(job))} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Discard photo">
              <Feather name="trash-2" size={18} color={t.muted} />
            </Pressable>
          </View>

          {(job.detections ?? []).map((d, i) => {
            if (job.decisions?.[i]) return null;
            const sel = chosen(job, i, d);
            const k = keyOf(job, i);
            return (
              <View key={k} style={[styles.detection, { borderTopColor: t.border }]}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>
                  AI SEES · {Math.round(d.confidence * 100)}% SURE
                </Text>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>
                  {d.name_pt}
                  {d.brand ? <Text style={{ color: t.muted, fontWeight: '600' }}>  {d.brand}</Text> : null}
                </Text>

                <View style={{ gap: 6, marginTop: 4 }}>
                  {d.candidates.map((p) => {
                    const on = sel === p.code;
                    return (
                      <Pressable
                        key={p.code}
                        onPress={() => {
                          tick();
                          setChoice((c) => ({ ...c, [k]: p.code }));
                        }}
                        style={[styles.option, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accentSoft : 'transparent' }]}
                      >
                        {p.image_url ? (
                          <Image source={{ uri: p.image_url }} style={styles.optImg} contentFit="contain" />
                        ) : (
                          <View style={[styles.optImg, { backgroundColor: t.chip }]} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={2} style={{ color: t.text, fontWeight: '600' }}>{p.name}</Text>
                          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{[p.brand, p.quantity].filter(Boolean).join(' · ')}</Text>
                          <StoreDots stores={p.stores} size={20} />
                        </View>
                        <NutriScore grade={p.nutriscore} />
                        <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? t.accent : t.border} />
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => {
                      tick();
                      setChoice((c) => ({ ...c, [k]: 'none' }));
                    }}
                    style={[styles.option, { borderColor: sel === 'none' ? t.accent : t.border, backgroundColor: sel === 'none' ? t.accentSoft : 'transparent' }]}
                  >
                    <View style={[styles.optImg, { backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }]}>
                      <Feather name="tag" size={18} color={t.muted} />
                    </View>
                    <Text style={{ color: t.text, flex: 1 }}>
                      {d.candidates.length ? 'None of these, just ' : 'Save as '}
                      <Text style={{ fontWeight: '700' }}>{d.name_pt}</Text>
                    </Text>
                    <Feather name={sel === 'none' ? 'check-circle' : 'circle'} size={20} color={sel === 'none' ? t.accent : t.border} />
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Button
                    title="Refuse"
                    kind="secondary"
                    icon={<Feather name="x" size={18} color={t.text} />}
                    onPress={() => act(k, () => rejectDetection(job, i))}
                    style={{ flex: 1 }}
                    disabled={busy === k}
                  />
                  <Button
                    title="Accept"
                    icon={<Feather name="check" size={18} color={t.accentText} />}
                    onPress={() => accept(job, i, d)}
                    busy={busy === k}
                    style={{ flex: 2 }}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  jobPhoto: { width: 64, height: 64, borderRadius: 14 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  detection: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1.5 },
  optImg: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff' },
});
