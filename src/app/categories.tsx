import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryIcon, ColorPicker, IconPicker } from '../components/Category';
import { Button, Card, Field, Label, Page } from '../components/ui';
import { CATEGORY_COLORS, addCategory, editCategory, moveCategory, removeCategory, textOn, useCategories } from '../lib/categories';
import { iconFor } from '../lib/categoryIcons';
import { confirmAsk, notify } from '../lib/dialog';
import { useItems } from '../lib/items';
import { radius, useTheme } from '../lib/theme';
import type { Category } from '../lib/types';

/** Create, rename, recolour, reorder and remove categories. Shared by both accounts. */
export default function Categories() {
  const t = useTheme();
  const { categories, missing } = useCategories();
  const { items } = useItems();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.category_id) m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1);
    return m;
  }, [items]);

  const unused = CATEGORY_COLORS.find((c) => !categories.some((x) => x.color.toLowerCase() === c.toLowerCase()));
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string | null>(null);
  // icon null = not picked yet: follows the name (Meat -> steak, ...).
  const [icon, setIcon] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string; color: string; icon: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const newColor = color ?? unused ?? CATEGORY_COLORS[0];

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
    if (await run(() => addCategory(label, newColor, icon))) {
      setLabel('');
      setColor(null);
      setIcon(null);
    }
  };

  const remove = async (c: Category) => {
    const n = counts.get(c.id) ?? 0;
    const msg = n ? `Its ${n} item${n === 1 ? '' : 's'} stay, just without a category. Removed for both of you.` : 'Removed for both of you.';
    if (await confirmAsk(`Remove ${c.label}?`, msg, 'Remove')) run(() => removeCategory(c));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Page style={{ gap: 16 }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>
          What kind of food it is, shown as a coloured icon tag on each card. Separate from where it is kept.
        </Text>

        {missing && (
          <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
            <Text style={{ color: t.warn, fontWeight: '600' }}>
              Categories are not set up on the server yet. Run the updated supabase/schema.sql in Supabase (SQL Editor) once.
            </Text>
          </Card>
        )}

        {categories.length > 0 && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {categories.map((c, i) => {
              const isEditing = editing?.id === c.id;
              const n = counts.get(c.id) ?? 0;
              return (
                <View key={c.id} style={[styles.row, { borderColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}>
                  {isEditing ? (
                    <View style={{ flex: 1, gap: 10 }}>
                      <Field value={editing.label} onChangeText={(v) => setEditing({ ...editing, label: v })} autoFocus maxLength={40} />
                      <ColorPicker value={editing.color} onChange={(v) => setEditing({ ...editing, color: v })} colors={CATEGORY_COLORS} />
                      <IconPicker
                        value={iconFor({ icon: editing.icon, label: editing.label })}
                        onChange={(v) => setEditing({ ...editing, icon: v })}
                        color={editing.color}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                        <Button
                          title="Save"
                          busy={busy}
                          style={{ flex: 1 }}
                          onPress={async () => {
                            if (await run(() => editCategory(c, editing.label, editing.color, editing.icon))) setEditing(null);
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.swatch, { backgroundColor: c.color }]}>
                        <CategoryIcon category={c} size={20} color={textOn(c.color)} />
                      </View>
                      <Pressable style={{ flex: 1 }} onPress={() => setEditing({ id: c.id, label: c.label, color: c.color, icon: c.icon ?? null })}>
                        <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{c.label}</Text>
                        <Text style={{ color: t.muted, fontSize: 13 }}>
                          {n} item{n === 1 ? '' : 's'}
                        </Text>
                      </Pressable>
                      <IconBtn name="arrow-up" label={`Move ${c.label} up`} disabled={i === 0} onPress={() => run(() => moveCategory(c, -1))} />
                      <IconBtn name="arrow-down" label={`Move ${c.label} down`} disabled={i === categories.length - 1} onPress={() => run(() => moveCategory(c, 1))} />
                      <IconBtn name="edit-2" label={`Edit ${c.label}`} onPress={() => setEditing({ id: c.id, label: c.label, color: c.color, icon: c.icon ?? null })} />
                      <IconBtn name="trash-2" label={`Remove ${c.label}`} onPress={() => remove(c)} />
                    </>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <Label>New category</Label>
          <Field value={label} onChangeText={setLabel} placeholder="e.g. Cheese, Snacks, Baby food" maxLength={40} onSubmitEditing={create} />
          <ColorPicker value={newColor} onChange={setColor} colors={CATEGORY_COLORS} />
          <IconPicker value={iconFor({ icon, label })} onChange={setIcon} color={newColor} />
          <Button title="Add category" onPress={create} busy={busy} disabled={!label.trim()} />
        </Card>
      </Page>
    </ScrollView>
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
  swatch: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
