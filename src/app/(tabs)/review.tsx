import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NutriScore } from '../../components/NutriScore';
import { Photo } from '../../components/Photo';
import { StoreDots } from '../../components/StoreChips';
import { BarcodeModal } from '../../components/BarcodeModal';
import { ItemPicker } from '../../components/ItemPicker';
import { Button, Card, Chips, tick } from '../../components/ui';
import { acceptDetection, addFoodToPhoto, discardJob, linkDetectionToItem, rejectDetection, useJobs } from '../../lib/jobs';
import { useItems } from '../../lib/items';
import { placeLabel, usePlaces } from '../../lib/places';
import { itemFuse } from '../../lib/recipes';
import { notify } from '../../lib/dialog';
import { localSuggestions, lookupBarcode, searchRemote, rankSuggestions } from '../../lib/products';
import { radius, useTheme } from '../../lib/theme';
import type { Detection, Item, PhotoJob, Product } from '../../lib/types';

type Choice = string; // product code, or 'none' = just the name you typed

export default function Review() {
  const t = useTheme();
  const { jobs, loading } = useJobs();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { items } = useItems();
  const { places, byId } = usePlaces();
  const fuse = useMemo(() => itemFuse(items), [items]);
  // Per food: the place you picked and the open "link to an item" picker.
  const [place, setPlace] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<{ job: PhotoJob; i: number; d: Detection } | null>(null);
  const placeOptions = places.map((p) => ({ key: p.id, label: placeLabel(byId, p.id) }));
  // Your search per food in a photo (typed, or found by barcode).
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [found, setFound] = useState<Record<string, (Product & { match: number })[]>>({});
  const [searching, setSearching] = useState<string | null>(null);
  const [scanFor, setScanFor] = useState<string | null>(null);

  const onScanned = async (code: string) => {
    const k = scanFor;
    setScanFor(null);
    if (!k) return;
    setSearching(k);
    try {
      const p = await lookupBarcode(code);
      if (!p) return notify('Not found', `Barcode ${code} is not in Open Food Facts yet. Type the name instead.`);
      setTyped((m) => ({ ...m, [k]: p.name }));
      setFound((m) => ({ ...m, [k]: [{ ...p, match: 1 }] }));
      setChoice((c) => ({ ...c, [k]: p.code }));
    } catch {
      notify('Offline', 'Could not look up the barcode right now.');
    } finally {
      setSearching((cur) => (cur === k ? null : cur));
    }
  };
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const search = (k: string, q: string) => {
    setTyped((m) => ({ ...m, [k]: q }));
    clearTimeout(timers.current[k]);
    if (q.trim().length < 2) {
      setFound((m) => {
        const { [k]: _drop, ...rest } = m;
        return rest;
      });
      return;
    }
    timers.current[k] = setTimeout(async () => {
      setSearching(k);
      const toCandidates = (list: { score: number }[]) =>
        list.slice(0, 6).map((p) => ({ ...(p as unknown as Product), match: Math.max(0, 1 - p.score) }));
      setFound((m) => ({ ...m, [k]: [] }));
      localSuggestions(q, []).then((l) => setFound((m) => ({ ...m, [k]: toCandidates(l) })));
      try {
        const remote = await searchRemote(q);
        setFound((m) => ({ ...m, [k]: toCandidates(rankSuggestions(q, remote, [])) }));
      } catch {
        // offline: local results stay
      } finally {
        setSearching((cur) => (cur === k ? null : cur));
      }
    }, 450);
  };
  const keyOf = (job: PhotoJob, i: number) => `${job.id}:${i}`;
  // Photos uploaded before the app dropped AI may have no foods listed yet: treat them as one food to name.
  const foodsOf = (job: PhotoJob): Detection[] =>
    job.detections?.length ? job.detections : [{ name_pt: '', brand: null, quantity: null, location: 'fridge', shelf_life_days: null, confidence: 0, candidates: [] }];
  const optionsFor = (job: PhotoJob, i: number, d: Detection) => found[keyOf(job, i)] ?? d.candidates;
  const chosen = (job: PhotoJob, i: number, d: Detection): Choice => {
    const k = keyOf(job, i);
    if (choice[k]) return choice[k];
    if (found[k]) return found[k][0]?.code ?? 'none';
    return d.candidates[0]?.code ?? 'none';
  };

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
    const product = c === 'none' ? null : optionsFor(job, i, d).find((p) => p.code === c) ?? null;
    return act(keyOf(job, i), () => acceptDetection(job, i, product, typed[keyOf(job, i)], placeFor(job, i, d)));
  };

  const placeFor = (job: PhotoJob, i: number, d: Detection) => {
    const p = place[keyOf(job, i)] ?? d.location;
    // A place deleted meanwhile (or the old "pantry") falls back to Emergency supplies / the first place.
    return byId.has(p) ? p : p === 'pantry' && byId.has('emergency') ? 'emergency' : places[0]?.id ?? 'fridge';
  };

  /** Items already stored that look like this photo: link the photo to one of them instead of adding a duplicate. */
  const lookalikes = (job: PhotoJob, i: number, d: Detection): Item[] => {
    const q = typed[keyOf(job, i)]?.trim() || d.name_pt;
    if (!q || q.length < 2) return [];
    return fuse
      .search(q, { limit: 3 })
      .filter((r) => (r.score ?? 1) <= 0.35)
      .map((r) => r.item);
  };

  const link = (job: PhotoJob, i: number, d: Detection, item: Item) => {
    const c = chosen(job, i, d);
    const product = c === 'none' ? null : optionsFor(job, i, d).find((p) => p.code === c) ?? null;
    return act(keyOf(job, i), () => linkDetectionToItem(job, i, item, product));
  };

  return (
    <>
    <FlatList
      data={jobs}
      keyExtractor={(j) => j.id}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      ListEmptyComponent={
        loading ? undefined : (
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
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>
                {foodsOf(job).length > 1 ? `${foodsOf(job).length} foods in this photo` : 'New photo'}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{new Date(job.created_at).toLocaleString('pt-PT')}</Text>
            </View>
            <Pressable onPress={() => act(job.id, () => discardJob(job))} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Discard photo">
              <Feather name="trash-2" size={18} color={t.muted} />
            </Pressable>
          </View>

          {foodsOf(job).map((d, i) => {
            if (job.decisions?.[i]) return null;
            const sel = chosen(job, i, d);
            const k = keyOf(job, i);
            return (
              <View key={k} style={[styles.detection, { borderTopColor: t.border }]}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>
                  {foodsOf(job).length > 1 ? `Food ${i + 1}: what is it?` : 'What is this?'}
                </Text>
                <View style={[styles.searchBox, { backgroundColor: t.bg, borderColor: t.border }]}>
                  <Feather name="search" size={16} color={t.muted} />
                  <TextInput
                    value={typed[k] ?? ''}
                    onChangeText={(v) => search(k, v)}
                    placeholder="Type it, e.g. leite mimosa"
                    placeholderTextColor={t.muted}
                    style={{ flex: 1, color: t.text, fontSize: 15, paddingVertical: 10 }}
                    autoCorrect={false}
                  />
                  {searching === k && <ActivityIndicator size="small" color={t.accent} />}
                  <Pressable onPress={() => setScanFor(k)} hitSlop={8} accessibilityLabel="Scan barcode">
                    <Text style={{ fontSize: 20, color: t.text }}>▥</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 6, marginTop: 4 }}>
                  {optionsFor(job, i, d).map((p) => {
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
                      {optionsFor(job, i, d).length ? 'None of these, just ' : 'Save as '}
                      <Text style={{ fontWeight: '700' }}>{typed[k]?.trim() || d.name_pt || 'Food'}</Text>
                    </Text>
                    <Feather name={sel === 'none' ? 'check-circle' : 'circle'} size={20} color={sel === 'none' ? t.accent : t.border} />
                  </Pressable>
                </View>

                {(() => {
                  const same = lookalikes(job, i, d);
                  return (
                    <View style={{ gap: 6, marginTop: 8 }}>
                      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>
                        {same.length ? 'ALREADY IN THE HOUSE? ADD THE PHOTO TO IT' : 'OR MATCH IT TO AN ITEM YOU CREATED'}
                      </Text>
                      {same.map((it) => (
                        <Pressable
                          key={it.id}
                          onPress={() => link(job, i, d, it)}
                          disabled={busy === k}
                          style={[styles.option, { borderColor: t.border }]}
                        >
                          <Photo path={it.photo_path} fallbackUrl={it.off_image_url} style={styles.optImg} label={it.name} />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>{it.name}</Text>
                            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                              {[placeLabel(byId, it.location), it.quantity, it.photo_path ? 'has a photo' : 'no photo yet'].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Feather name="link" size={18} color={t.accent} />
                        </Pressable>
                      ))}
                      {items.length > 0 && (
                        <Pressable onPress={() => setLinking({ job, i, d })} hitSlop={6}>
                          <Text style={{ color: t.accent, fontWeight: '600' }}>Pick another item…</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })()}

                <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 8 }}>OR ADD AS NEW, IN</Text>
                <Chips value={placeFor(job, i, d)} onChange={(v) => setPlace((m) => ({ ...m, [k]: v }))} options={placeOptions} />

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
                    title="Add new"
                    icon={<Feather name="check" size={18} color={t.accentText} />}
                    onPress={() => accept(job, i, d)}
                    busy={busy === k}
                    style={{ flex: 2 }}
                  />
                </View>
              </View>
            );
          })}
          <Pressable
            onPress={() => act(job.id, () => addFoodToPhoto({ ...job, detections: foodsOf(job) }))}
            style={[styles.more, { borderTopColor: t.border }]}
          >
            <Feather name="plus" size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: '600' }}>Another food in this photo</Text>
          </Pressable>
        </Card>
      )}
    />
    <BarcodeModal visible={!!scanFor} onClose={() => setScanFor(null)} onCode={onScanned} />
    <ItemPicker
      visible={!!linking}
      title="Which item is in this photo?"
      items={items}
      initial={linking ? typed[keyOf(linking.job, linking.i)]?.trim() || linking.d.name_pt : ''}
      onPick={(item) => {
        const l = linking;
        setLinking(null);
        if (l && item) link(l.job, l.i, l.d, item);
      }}
      onClose={() => setLinking(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  jobPhoto: { width: 64, height: 64, borderRadius: 14 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  detection: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1.5 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 6 },
  optImg: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff' },
});
