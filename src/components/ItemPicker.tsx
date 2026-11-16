import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { placeLabel, usePlaces } from '../lib/places';
import { itemFuse } from '../lib/recipes';
import { radius, useTheme } from '../lib/theme';
import type { Item } from '../lib/types';

/** Search the household and pick one item. */
export function ItemPicker({ visible, items, initial, allowUnlink, onPick, onClose, title }: {
  visible: boolean; items: Item[]; initial: string; allowUnlink?: boolean; onPick: (i: Item | null) => void; onClose: () => void; title?: string;
}) {
  const t = useTheme();
  const { byId } = usePlaces();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ(initial);
  }, [visible, initial]);
  const fuse = useMemo(() => itemFuse(items), [items]);
  const shown = q.trim() ? fuse.search(q, { limit: 30 }).map((r) => r.item) : items.slice(0, 30);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.bg }]}>
          {title ? <Text style={{ color: t.text, fontWeight: '800', fontSize: 18, marginBottom: 10 }}>{title}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.searchBox, { backgroundColor: t.card, borderColor: t.border }]}>
              <Feather name="search" size={16} color={t.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search what you have"
                placeholderTextColor={t.muted}
                autoFocus
                style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 10 }}
              />
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: t.accent, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingVertical: 10 }}>
            {allowUnlink && (
              <Pressable onPress={() => onPick(null)} style={[styles.pickRow, { borderColor: t.border }]}>
                <Feather name="slash" size={16} color={t.danger} />
                <Text style={{ color: t.danger, fontWeight: '600' }}>Unlink</Text>
              </Pressable>
            )}
            {shown.map((i) => (
              <Pressable key={i.id} onPress={() => onPick(i)} style={[styles.pickRow, { borderColor: t.border, backgroundColor: t.card }]}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>{i.name}</Text>
                  <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                    {[placeLabel(byId, i.location), i.quantity, i.expires_on ? `exp. ${i.expires_on}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))}
            {!shown.length && <Text style={{ color: t.muted, textAlign: 'center', marginTop: 20 }}>Nothing stored matches.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', minHeight: '60%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
});
