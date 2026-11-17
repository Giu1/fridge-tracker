import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AmountStepper } from '../../components/AmountStepper';
import { CategoryChips } from '../../components/Category';
import { CalendarModal } from '../../components/DateField';
import { Photo } from '../../components/Photo';
import { Button, Chips, tick } from '../../components/ui';
import { useCategories } from '../../lib/categories';
import { describeDate, parseDateInput } from '../../lib/dates';
import { confirmAsk, notify } from '../../lib/dialog';
import { removePhotoIfUnused, uploadPhoto } from '../../lib/items';
import { placeLabel, usePlaces } from '../../lib/places';
import { addBlankLine, removeLine, saveLines, suggestPhotos, updateLine, useReceiptLines, useReceipts } from '../../lib/receipts';
import { radius, useTheme } from '../../lib/theme';
import type { Category, PhotoMatch, Place, ReceiptLine } from '../../lib/types';

/** Bulk edit: every line of an imported receipt list, corrected on one page, then saved as items in one go. */
export default function CheckList() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { receipts } = useReceipts();
  const receipt = receipts.find((r) => r.id === id);
  const { lines, loading } = useReceiptLines(id);
  const { places, byId } = usePlaces();
  const { categories } = useCategories();
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, PhotoMatch[]>>({});
  const fallbackPlace = places[0]?.id ?? 'fridge';

  // Fuzzy photo suggestions from the database for every name on the list (again when a name is corrected).
  const names = useMemo(() => [...new Set(lines.map((l) => l.name.trim()).filter((n) => n.length >= 2))], [lines]);
  const namesKey = names.join('\n');
  useEffect(() => {
    const missing = names.filter((n) => !(n in suggestions));
    if (!missing.length) return;
    let alive = true;
    const timer = setTimeout(() => {
      suggestPhotos(missing, 6)
        .then((res) => alive && setSuggestions((s) => ({ ...s, ...Object.fromEntries(missing.map((n, i) => [n, res[i] ?? []])) })))
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const blank = lines.filter((l) => !l.name.trim()).length;
  const withoutPhoto = lines.filter((l) => !l.photo_path && suggestions[l.name.trim()]?.length).length;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      notify('Could not save that change', (e as Error).message);
    }
  };

  const setAllPlaces = (location: string) => run(async () => {
    for (const l of lines) if (l.location !== location) await updateLine(l, { location });
  });

  const useBestPhotos = () => run(async () => {
    for (const l of lines) {
      const best = suggestions[l.name.trim()]?.[0];
      if (!l.photo_path && best) await updateLine(l, { photo_path: best.photo_path });
    }
  });

  const save = async () => {
    if (!receipt) return;
    setSaving(true);
    try {
      // A place removed meanwhile (on the other device) falls back to the first place.
      const fixed = lines.map((l) => (l.location && byId.has(l.location) ? l : { ...l, location: fallbackPlace }));
      const n = await saveLines(receipt, fixed, fallbackPlace);
      notify(`${n} item${n === 1 ? '' : 's'} added`, 'Photos you add later on an item are remembered for future receipts.');
      router.replace('/');
    } catch (e) {
      notify('Could not save', `${(e as Error).message}\nNothing was lost: the list is still here.`);
    } finally {
      setSaving(false);
    }
  };

  if (!receipt) {
    return <Text style={{ color: t.muted, padding: 20 }}>{loading ? 'Loading…' : 'This receipt was removed.'}</Text>;
  }

  const allPlace = lines.length && lines.every((l) => l.location === lines[0].location) ? lines[0].location ?? '' : '';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `Check ${lines.length} item${lines.length === 1 ? '' : 's'}` }} />
      <FlatList
        data={lines}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 140, width: '100%', maxWidth: 820, alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Text style={{ color: t.muted, lineHeight: 20 }}>
              Correct names and amounts, pick where each goes and a photo. Photos are suggested from earlier items with a
              similar name. Nothing is added until you press Save.
            </Text>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>PUT EVERYTHING IN</Text>
            <Chips value={allPlace} onChange={setAllPlaces} options={places.map((p) => ({ key: p.id, label: placeLabel(byId, p.id) }))} />
            {withoutPhoto > 0 && (
              <Button
                title={`Use the best photo for ${withoutPhoto} line${withoutPhoto === 1 ? '' : 's'}`}
                kind="secondary"
                icon={<Feather name="image" size={16} color={t.text} />}
                onPress={useBestPhotos}
              />
            )}
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={t.accent} /> : <Text style={{ color: t.muted, textAlign: 'center', marginTop: 30 }}>No lines left.</Text>}
        renderItem={({ item: line, index }) => (
          <LineEditor
            line={line}
            index={index}
            places={places}
            categories={categories}
            placeText={(pid) => placeLabel(byId, pid)}
            suggestions={suggestions[line.name.trim()] ?? []}
          />
        )}
        ListFooterComponent={
          <Button
            title="Add a line"
            kind="ghost"
            icon={<Feather name="plus" size={16} color={t.accent} />}
            onPress={() => run(() => addBlankLine(receipt.id, allPlace || fallbackPlace))}
          />
        }
      />
      <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
        <Button
          title={blank ? `${blank} line${blank === 1 ? ' has' : 's have'} no name` : `Save ${lines.length} item${lines.length === 1 ? '' : 's'}`}
          icon={<Feather name="check" size={18} color={t.accentText} />}
          onPress={save}
          busy={saving}
          disabled={!lines.length || blank > 0}
          style={{ width: '100%', maxWidth: 820, alignSelf: 'center' }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const LineEditor = memo(function LineEditor({ line, index, places, categories, placeText, suggestions }: {
  line: ReceiptLine;
  index: number;
  places: Place[];
  categories: Category[];
  placeText: (id: string) => string;
  suggestions: PhotoMatch[];
}) {
  const t = useTheme();
  const [name, setName] = useState(line.name);
  const [exp, setExp] = useState(line.expires_on ?? '');
  const [calendar, setCalendar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editingName = useRef(false);
  // Follow changes from the other device unless you are typing in that field.
  useEffect(() => {
    if (!editingName.current) setName(line.name);
  }, [line.name]);
  useEffect(() => setExp(line.expires_on ?? ''), [line.expires_on]);

  const patch = async (p: Partial<ReceiptLine>) => {
    try {
      await updateLine(line, p);
    } catch (e) {
      notify('Could not save that change', (e as Error).message);
    }
  };
  const parsedExp = exp && exp !== line.expires_on ? parseDateInput(exp) : null;
  const commitExp = () => {
    if (!exp.trim()) return line.expires_on && patch({ expires_on: null });
    const p = parseDateInput(exp);
    if (p && 'iso' in p && p.iso !== line.expires_on) patch({ expires_on: p.iso });
  };

  const setPhoto = async (photo_path: string | null) => {
    const old = line.photo_path;
    if (old === photo_path) return;
    await patch({ photo_path });
    if (old) removePhotoIfUnused(old).catch(() => {});
  };
  const newPhoto = async (fromLibrary: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [1, 1] };
    if (!fromLibrary && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return notify('Camera permission is needed.');
    const res = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      await setPhoto(await uploadPhoto(res.assets[0].uri));
    } catch (e) {
      notify('Could not upload the photo', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const options = line.photo_path && !suggestions.some((s) => s.photo_path === line.photo_path)
    ? [{ name: 'Chosen photo', photo_path: line.photo_path, score: 1 }, ...suggestions]
    : suggestions;
  const placeOptions = [
    ...places.map((p) => ({ key: p.id, label: placeText(p.id) })),
    ...(line.location && !places.some((p) => p.id === line.location) ? [{ key: line.location, label: placeText(line.location) }] : []),
  ];

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View>
          <Photo path={line.photo_path} style={styles.photo} label={name} />
          {uploading && (
            <View style={[styles.photo, styles.overlay]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            onFocus={() => (editingName.current = true)}
            onBlur={() => {
              editingName.current = false;
              const v = name.replace(/\s+/g, ' ').trim();
              if (v !== line.name) patch({ name: v || line.name });
              if (!v) setName(line.name);
            }}
            placeholder={`Item ${index + 1}`}
            placeholderTextColor={t.muted}
            style={[styles.name, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AmountStepper size="sm" value={line.amount} onChange={(amount) => patch({ amount })} />
            <View style={[styles.expBox, { borderColor: parsedExp && 'error' in parsedExp ? t.danger : t.border, backgroundColor: t.bg }]}>
              <TextInput
                value={exp}
                onChangeText={setExp}
                onBlur={commitExp}
                onSubmitEditing={commitExp}
                placeholder="Expires"
                placeholderTextColor={t.muted}
                keyboardType="numbers-and-punctuation"
                style={{ color: t.text, flex: 1, paddingVertical: 6, fontSize: 14, minWidth: 70 }}
              />
              <Pressable onPress={() => setCalendar(true)} hitSlop={6} accessibilityLabel="Pick expiry date">
                <Feather name="calendar" size={16} color={t.accent} />
              </Pressable>
            </View>
          </View>
          {line.expires_on ? <Text style={{ color: t.muted, fontSize: 12 }}>{describeDate(line.expires_on)}</Text> : null}
        </View>
        <Pressable
          hitSlop={8}
          accessibilityLabel="Remove this line"
          onPress={async () => {
            if (await confirmAsk('Remove this line?', line.name, 'Remove')) removeLine(line).catch((e) => notify('Could not remove', (e as Error).message));
          }}
          style={{ padding: 4, alignSelf: 'flex-start' }}
        >
          <Feather name="x" size={20} color={t.muted} />
        </Pressable>
      </View>

      <Chips value={line.location ?? ''} onChange={(location) => patch({ location })} options={placeOptions} />
      {categories.length > 0 && (
        <CategoryChips value={line.category_id} onChange={(category_id) => patch({ category_id })} categories={categories} allLabel="No category" />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FlatList
          horizontal
          data={options}
          keyExtractor={(s) => s.photo_path}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          style={{ flex: 1 }}
          ListEmptyComponent={<Text style={{ color: t.muted, fontSize: 12, paddingVertical: 14 }}>No photo of a similar item yet</Text>}
          renderItem={({ item: s }) => {
            const on = line.photo_path === s.photo_path;
            return (
              <Pressable
                onPress={() => {
                  tick();
                  setPhoto(on ? null : s.photo_path);
                }}
                accessibilityLabel={on ? `Remove photo of ${s.name}` : `Use photo of ${s.name}`}
                style={[styles.sug, { borderColor: on ? t.accent : 'transparent' }]}
              >
                <Photo path={s.photo_path} style={styles.sugImg} label={s.name} />
                <Text numberOfLines={1} style={{ color: on ? t.accent : t.muted, fontSize: 10, width: 56, textAlign: 'center' }}>{s.name}</Text>
                {on && <Feather name="check-circle" size={16} color={t.accent} style={styles.sugTick} />}
              </Pressable>
            );
          }}
        />
        <Pressable onPress={() => newPhoto(false)} style={[styles.camBtn, { backgroundColor: t.chip }]} accessibilityLabel="Take a photo">
          <Feather name="camera" size={18} color={t.text} />
        </Pressable>
        <Pressable onPress={() => newPhoto(true)} style={[styles.camBtn, { backgroundColor: t.chip }]} accessibilityLabel="Photo from gallery">
          <Feather name="image" size={18} color={t.text} />
        </Pressable>
      </View>

      <CalendarModal
        visible={calendar}
        value={line.expires_on}
        onClose={() => setCalendar(false)}
        onPick={(iso) => {
          setCalendar(false);
          setExp(iso);
          patch({ expires_on: iso });
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  overlay: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  name: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontWeight: '600' },
  expBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, flexGrow: 1, flexBasis: 120 },
  sug: { alignItems: 'center', gap: 2, borderWidth: 2, borderRadius: 12, padding: 2 },
  sugImg: { width: 52, height: 52, borderRadius: 9 },
  sugTick: { position: 'absolute', top: 2, right: 2 },
  camBtn: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth },
});
