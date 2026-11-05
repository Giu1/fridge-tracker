import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PT_STORES, storeByKey, storeLogoUrl, type Store } from '../lib/stores';
import { useTheme } from '../lib/theme';
import { tick } from './ui';

/** The chain's real logo (falls back to a coloured initial when offline). */
export function StoreLogo({ store, size = 20 }: { store: Store; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: store.color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.55 }}>{store.label.charAt(0)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: storeLogoUrl(store) }}
      style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: '#fff' }}
      contentFit="contain"
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityLabel={store.label}
    />
  );
}

/** Toggle chips with logos. `only` limits the list (e.g. to stores present in the fridge). */
export function StoreFilter({ selected, onChange, only }: { selected: string[]; onChange: (s: string[]) => void; only?: string[] }) {
  const t = useTheme();
  const list = only ? PT_STORES.filter((s) => only.includes(s.key)) : PT_STORES;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {list.map((s) => {
        const on = selected.includes(s.key);
        return (
          <Pressable
            key={s.key}
            onPress={() => {
              tick();
              onChange(on ? selected.filter((k) => k !== s.key) : [...selected, s.key]);
            }}
            style={[styles.chip, { backgroundColor: on ? t.accentSoft : t.card, borderColor: on ? t.accent : t.border }]}
          >
            <StoreLogo store={s} size={20} />
            <Text style={{ color: on ? t.accent : t.text, fontWeight: on ? '700' : '500', fontSize: 13 }}>{s.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Logos of the supermarkets that sell a product. `labels` shows names next to the logos. */
export function StoreDots({ stores, labels = false, size = 18 }: { stores: string[]; labels?: boolean; size?: number }) {
  const t = useTheme();
  const known = stores.map(storeByKey).filter((s): s is Store => !!s);
  if (!known.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: labels ? 10 : 4, marginTop: 4, alignItems: 'center' }}>
      {known.slice(0, labels ? 9 : 5).map((s) => (
        <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StoreLogo store={s} size={size} />
          {labels && <Text style={{ color: t.text, fontWeight: '600' }}>{s.label}</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 7, paddingRight: 13, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
