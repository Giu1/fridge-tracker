import { Feather } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CategoryChips } from '../../components/Category';
import { ItemCard } from '../../components/ItemCard';
import { StoreFilter } from '../../components/StoreChips';
import { Chips, Tap, tick } from '../../components/ui';
import { useCategories } from '../../lib/categories';
import { useSession } from '../../lib/session';
import { daysUntil, useItems } from '../../lib/items';
import { placeLabel, usePlaces } from '../../lib/places';
import { storesFromLabels } from '../../lib/stores';
import { radius, useTheme } from '../../lib/theme';
import type { Location } from '../../lib/types';
import { useViewMode, type ViewMode } from '../../lib/viewMode';

type Filter = 'all' | Location;
type Sort = 'recent' | 'expiry' | 'health' | 'category';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'expiry', label: 'Expiring' },
  { key: 'health', label: 'Healthiest' },
  { key: 'category', label: 'Category' },
];
const VIEWS: { key: ViewMode; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { key: 'grid', icon: 'grid', label: 'Grid view' },
  { key: 'list', icon: 'list', label: 'List view' },
  { key: 'compact', icon: 'menu', label: 'Compact view' },
];

export default function Inventory() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [view, setView] = useViewMode();
  const columns = view === 'grid' ? (width >= 1000 ? 4 : width >= 700 ? 3 : 2) : width >= 900 ? 2 : 1;
  const gap = view === 'grid' ? 12 : view === 'list' ? 10 : 6;
  const { items, loading, offline, reload } = useItems();
  const { demo } = useSession();
  const { places, byId } = usePlaces();
  const { categories, byId: catById } = useCategories();
  const [catSel, setCatSel] = useState<string | null>(null);
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
    if (catSel) list = list.filter((i) => i.category_id === catSel);
    if (storeSel.length) list = list.filter((i) => (storesOf.get(i.id) ?? []).some((k) => storeSel.includes(k)));
    if (sort === 'expiry') list.sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999'));
    if (sort === 'health') list.sort((a, b) => (a.nutriscore ?? 'z').localeCompare(b.nutriscore ?? 'z'));
    if (sort === 'category') {
      const rank = (id: string | null | undefined) => (id ? catById.get(id)?.sort ?? 1e6 : 1e6);
      list.sort((a, b) => rank(a.category_id) - rank(b.category_id));
    }
    return list;
  }, [items, fuse, query, filter, sort, storeSel, storesOf, catSel, catById]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.category_id) m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1);
    return m;
  }, [items]);

  const placeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.location, (counts.get(i.location) ?? 0) + 1);
    const known = places.map((p) => ({ key: p.id, label: `${placeLabel(byId, p.id)}${counts.get(p.id) ? ` ${counts.get(p.id)}` : ''}` }));
    // Items in a place that no longer exists (deleted on another device, or the old "pantry").
    const orphans = [...counts.keys()].filter((k) => !byId.has(k)).map((k) => ({ key: k, label: `${placeLabel(byId, k)} ${counts.get(k)}` }));
    return [{ key: 'all', label: `All ${items.length || ''}`.trim() }, ...known, ...orphans];
  }, [items, places, byId]);

  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expires_on);
    return d !== null && d <= 2;
  }).length;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={`${view}-${columns}`}
        data={[...shown, ...Array.from({ length: (columns - (shown.length % columns)) % columns }, () => null)]}
        keyExtractor={(i, n) => i?.id ?? `pad-${n}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap } : undefined}
        initialNumToRender={view === 'compact' ? 24 : 10}
        windowSize={7}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap, paddingBottom: 110, width: '100%', maxWidth: 1100, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={t.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
              <View>
                <Text style={{ color: t.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.6 }}>
                  {filter === 'all' ? 'All food' : byId.get(filter)?.label ?? placeLabel(byId, filter)}
                </Text>
                <Text style={{ color: t.muted, fontSize: 15 }}>
                  {items.length} item{items.length === 1 ? '' : 's'}
                  {offline ? ' · offline copy' : ''}
                  {demo ? ' · demo, saved in this browser' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
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
              <Tap onPress={() => router.push('/recipe/find')} style={[styles.banner, { backgroundColor: t.accentSoft }]}>
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
            <Chips<Filter> value={filter} onChange={setFilter} options={placeOptions} trailing={{ label: '+ Place', onPress: () => router.push('/places') }} />
            <CategoryChips
              value={catSel}
              onChange={setCatSel}
              categories={categories}
              counts={catCounts}
              allLabel="Any kind"
              trailing={{ label: categories.length ? '+ Category' : '+ Add categories', onPress: () => router.push('/categories') }}
            />
            {presentStores.length > 0 && <StoreFilter selected={storeSel} onChange={setStoreSel} only={presentStores} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
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
            </ScrollView>
            <View style={[styles.views, { backgroundColor: t.chip }]}>
              {VIEWS.map((v) => {
                const on = view === v.key;
                return (
                  <Pressable
                    key={v.key}
                    onPress={() => {
                      tick();
                      setView(v.key);
                    }}
                    accessibilityLabel={v.label}
                    accessibilityState={{ selected: on }}
                    hitSlop={4}
                    style={[styles.viewBtn, on && { backgroundColor: t.elevated }]}
                  >
                    <Feather name={v.icon} size={16} color={on ? t.text : t.muted} />
                  </Pressable>
                );
              })}
            </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
              <Text style={{ fontSize: 48 }}>🥕</Text>
              <Text style={{ color: t.muted, fontSize: 16, textAlign: 'center' }}>
                {items.length ? 'Nothing here.' : 'Nothing stored yet.\nAdd photos to fill it.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item ? (
            <View style={{ flex: 1 }}>
              <ItemCard
                item={item}
                mode={view}
                category={item.category_id ? catById.get(item.category_id) : undefined}
                placeText={placeLabel(byId, item.location)}
                stores={storesOf.get(item.id) ?? []}
              />
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )
        }
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
  views: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, gap: 2 },
  viewBtn: { width: 34, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
});
