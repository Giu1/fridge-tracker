import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Label, Page } from '../components/ui';
import { confirmAsk, notify } from '../lib/dialog';
import { useItems } from '../lib/items';
import { PLACE_ICONS, addPlace, movePlace, removePlace, renamePlace, usePlaces } from '../lib/places';
import { radius, useTheme } from '../lib/theme';
import type { Place } from '../lib/types';

/** Add, rename, reorder and remove the places where food is kept. Shared by both accounts. */
export default function Places() {
  const t = useTheme();
  const { places } = usePlaces();
  const { items } = useItems();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.location, (m.get(i.location) ?? 0) + 1);
    return m;
  }, [items]);

  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<string>(PLACE_ICONS[4]);
  const [editing, setEditing] = useState<{ id: string; label: string; icon: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      notify('Could not save', (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (await run(() => addPlace(label, icon))) setLabel('');
  };

  const remove = async (p: Place) => {
    const n = counts.get(p.id) ?? 0;
    if (n) return notify(`${p.label} is not empty`, `Move or remove its ${n} item${n === 1 ? '' : 's'} first.`);
    if (await confirmAsk(`Remove ${p.label}?`, 'It disappears for both of you.', 'Remove')) run(() => removePlace(p, n));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Page style={{ gap: 16 }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>
          Where you keep food. Fridge, Freezer and Emergency supplies come ready; add your own, like a wine rack or the garage
          shelf. Changes show up on both devices.
        </Text>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {places.map((p, i) => {
            const isEditing = editing?.id === p.id;
            return (
              <View key={p.id} style={[styles.row, { borderColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}>
                {isEditing ? (
                  <View style={{ flex: 1, gap: 8 }}>
                    <IconPicker value={editing.icon} onChange={(v) => setEditing({ ...editing, icon: v })} />
                    <Field value={editing.label} onChangeText={(v) => setEditing({ ...editing, label: v })} autoFocus maxLength={40} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                      <Button
                        title="Save"
                        busy={busy}
                        style={{ flex: 1 }}
                        onPress={async () => {
                          if (await run(() => renamePlace(p, editing.label, editing.icon))) setEditing(null);
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 22, width: 30, textAlign: 'center' }}>{p.icon ?? '📦'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{p.label}</Text>
                      <Text style={{ color: t.muted, fontSize: 13 }}>
                        {counts.get(p.id) ?? 0} item{counts.get(p.id) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <IconBtn name="arrow-up" label={`Move ${p.label} up`} disabled={i === 0} onPress={() => run(() => movePlace(p, -1))} />
                    <IconBtn name="arrow-down" label={`Move ${p.label} down`} disabled={i === places.length - 1} onPress={() => run(() => movePlace(p, 1))} />
                    <IconBtn name="edit-2" label={`Rename ${p.label}`} onPress={() => setEditing({ id: p.id, label: p.label, icon: p.icon })} />
                    <IconBtn name="trash-2" label={`Remove ${p.label}`} onPress={() => remove(p)} />
                  </>
                )}
              </View>
            );
          })}
        </Card>

        <Card style={{ gap: 10 }}>
          <Label>New place</Label>
          <IconPicker value={icon} onChange={setIcon} />
          <Field value={label} onChangeText={setLabel} placeholder="e.g. Wine rack, Garage shelf, Fruit bowl" maxLength={40} onSubmitEditing={create} />
          <Button title="Add place" onPress={create} busy={busy} disabled={!label.trim()} />
        </Card>
      </Page>
    </ScrollView>
  );
}

function IconPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {PLACE_ICONS.map((e) => (
        <Pressable
          key={e}
          onPress={() => onChange(e)}
          accessibilityLabel={`Icon ${e}`}
          style={[styles.icon, { backgroundColor: value === e ? t.accentSoft : t.chip, borderColor: value === e ? t.accent : 'transparent' }]}
        >
          <Text style={{ fontSize: 20 }}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function IconBtn({ name, label, onPress, disabled }: { name: keyof typeof Feather.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label} style={[styles.btn, { opacity: disabled ? 0.25 : 1 }]}>
      <Feather name={name} size={17} color={t.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
