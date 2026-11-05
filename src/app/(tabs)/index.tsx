import { Feather } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { NutriScore } from '../../components/NutriScore';
import { Photo } from '../../components/Photo';
import { StoreDots, StoreFilter } from '../../components/StoreChips';
import { Segmented, Tap, tick } from '../../components/ui';
import { expiryLabel } from '../../lib/expiry';
import { useSession } from '../../lib/session';
import { daysUntil, useItems } from '../../lib/items';
import { storesFromLabels } from '../../lib/stores';
import { radius, useTheme } from '../../lib/theme';
import { LOCATIONS, type Location } from '../../lib/types';

type Filter = 'all' | Location;
type Sort = 'recent' | 'expiry' | 'health';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'expiry', label: 'Expiring' },
  { key: 'health', label: 'Healthiest' },
];

export default function Inventory() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const columns = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const { items, loading, offline, reload } = useItems();
  const { demo } = useSession();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [storeSel, setStoreSel] = useState<string[]>([]);
  const storesOf = useMemo(() => new Map(items.map((i) => [i.id, storesFromLabels(i.stores)])), [items]);
  const presentStores = useMemo(() => [...new Set([...storesOf.values()].flat())], [storesOf]);

  const fuse = useMemo(
    () => new Fuse(items, { keys: ['name', 'brand', 'product_name', 'notes'], threshold: 0.4, ignoreDiacritics: true, ignoreLocation: true }),
    [items],
  );

  const shown = useMemo(() => {
    let list = query.trim() ? fuse.search(query).map((r) => r.item) : [...items];
    if (filter !== 'all') list = list.filter((i) => i.location === filter);
    if (storeSel.length) list = list.filter((i) => (storesOf.get(i.id) ?? []).some((k) => storeSel.includes(k)));
    if (sort === 'expiry') list.sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999'));
    if (sort === 'health') list.sort((a, b) => (a.nutriscore ?? 'z').localeCompare(b.nutriscore ?? 'z'));
    return list;
  }, [items, fuse, query, filter, sort, storeSel, storesOf]);

  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expires_on);
    return d !== null && d <= 2;
  }).length;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={columns}
        data={[...shown, ...Array.from({ length: (columns - (shown.length % columns)) % columns }, () => null)]}
        keyExtractor={(i, n) => i?.id ?? `pad-${n}`}
        numColumns={columns}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12, paddingBottom: 110, width: '100%', maxWidth: 1100, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={t.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
              <View>
                <Text style={{ color: t.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.6 }}>Fridge</Text>
                <Text style={{ color: t.muted, fontSize: 15 }}>
                  {items.length} item{items.length === 1 ? '' : 's'}
                  {offline ? ' · offline copy' : ''}
                  {demo ? ' · demo, saved in this browser' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tap onPress={() => router.push('/recipes')} style={[styles.iconBtn, { backgroundColor: t.chip }]} accessibilityLabel="Receitas Bimby">
                <Text style={{ fontSize: 20 }}>🍲</Text>
              </Tap>
              <Tap onPress={() => router.push('/settings')} style={[styles.iconBtn, { backgroundColor: t.chip }]} accessibilityLabel="Settings">
                <Feather name="settings" size={20} color={t.text} />
              </Tap>
              </View>
            </View>

            {expiringSoon > 0 && (
              <Tap onPress={() => setSort('expiry')} style={[styles.banner, { backgroundColor: t.warnSoft }]}>
                <Feather name="clock" size={16} color={t.warn} />
                <Text style={{ color: t.warn, fontWeight: '700', flex: 1 }}>
                  {expiringSoon} expiring within 2 days
                </Text>
                <Feather name="chevron-right" size={16} color={t.warn} />
              </Tap>
            )}

            {items.length > 0 && (
              <Tap onPress={() => router.push('/recipes')} style={[styles.banner, { backgroundColor: t.accentSoft }]}>
                <Text style={{ fontSize: 16 }}>🍲</Text>
                <Text style={{ color: t.accent, fontWeight: '700', flex: 1 }}>Receitas Bimby com o que tens</Text>
                <Feather name="chevron-right" size={16} color={t.accent} />
              </Tap>
            )}

            <View style={[styles.search, { backgroundColor: t.card, borderColor: t.border }]}>
              <Feather name="search" size={18} color={t.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={t.muted}
                style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                  <Feather name="x" size={18} color={t.muted} />
                </Pressable>
              ) : null}
            </View>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[{ key: 'all', label: 'All' }, ...LOCATIONS]} />
            {presentStores.length > 0 && <StoreFilter selected={storeSel} onChange={setStoreSel} only={presentStores} />}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SORTS.map((s) => {
                const on = sort === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => {
                      tick();
                      setSort(s.key);
                    }}
                    style={[styles.pill, { backgroundColor: on ? t.text : 'transparent', borderColor: on ? t.text : t.border }]}
                  >
                    <Text style={{ color: on ? t.bg : t.muted, fontWeight: '600', fontSize: 13 }}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
              <Text style={{ fontSize: 48 }}>🥕</Text>
              <Text style={{ color: t.muted, fontSize: 16, textAlign: 'center' }}>
                {items.length ? 'Nothing matches.' : 'The fridge is empty.\nAdd photos to fill it.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          if (!item) return <View style={{ flex: 1 }} />;
          const exp = expiryLabel(item, t);
          return (
            <Tap
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
              haptic={false}
            >
              <Photo path={item.photo_path} fallbackUrl={item.off_image_url} style={styles.photo} label={item.name} />
              <View style={styles.badge}>
                <NutriScore grade={item.nutriscore} />
              </View>
              <View style={{ padding: 12, gap: 3 }}>
                <Text numberOfLines={2} style={{ color: t.text, fontWeight: '700', fontSize: 15, lineHeight: 19 }}>{item.name}</Text>
                <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                  {[item.quantity, item.brand].filter(Boolean).join(' · ') || LOCATIONS.find((l) => l.key === item.location)?.label}
                </Text>
                {exp && <Text style={{ color: exp.color, fontSize: 12, fontWeight: '700' }}>{exp.text}</Text>}
                <StoreDots stores={storesOf.get(item.id) ?? []} size={16} />
              </View>
            </Tap>
          );
        }}
      />
      <Tap onPress={() => router.push('/add')} style={[styles.fab, { backgroundColor: t.accent }]} accessibilityLabel="Add one item by hand">
        <Feather name="plus" size={28} color={t.accentText} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 1 },
  badge: { position: 'absolute', top: 10, right: 10 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
});
