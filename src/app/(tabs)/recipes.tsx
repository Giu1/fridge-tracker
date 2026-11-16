import { Feather } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chips, Tap } from '../../components/ui';
import { useItems } from '../../lib/items';
import { itemFuse, stockFor, useRecipes } from '../../lib/recipes';
import { radius, useTheme } from '../../lib/theme';

type View_ = 'all' | 'menu' | 'ready';

/** Saved Cookidoo recipes, with how many of their ingredients are in the house right now. */
export default function RecipesTab() {
  const t = useTheme();
  const { recipes, loading } = useRecipes();
  const { items } = useItems();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View_>('all');

  const fuse = useMemo(() => itemFuse(items), [items]);
  const withStock = useMemo(
    () =>
      recipes.map((r) => {
        const have = r.ingredients.filter((g) => stockFor(g, items, fuse)).length;
        return { r, have, total: r.ingredients.length };
      }),
    [recipes, items, fuse],
  );
  const search = useMemo(() => new Fuse(withStock, { keys: ['r.title', 'r.ingredients.name', 'r.notes'], threshold: 0.4, ignoreDiacritics: true, ignoreLocation: true }), [withStock]);

  const shown = useMemo(() => {
    let list = query.trim() ? search.search(query).map((x) => x.item) : withStock;
    if (view === 'menu') list = list.filter((x) => x.r.planned);
    if (view === 'ready') list = list.filter((x) => x.total > 0 && x.have === x.total).sort((a, b) => b.have - a.have);
    return list;
  }, [withStock, search, query, view]);

  const planned = recipes.filter((r) => r.planned).length;
  const ready = withStock.filter((x) => x.total > 0 && x.have === x.total).length;

  return (
    <FlatList
      data={shown}
      keyExtractor={(x) => x.r.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cookidoo" icon={<Text>🍲</Text>} onPress={() => router.push('/recipe/find')} style={{ flex: 1 }} />
            <Button
              title="Save recipe"
              kind="secondary"
              icon={<Feather name="plus" size={18} color={t.text} />}
              onPress={() => router.push('/recipe/edit')}
              style={{ flex: 1 }}
            />
          </View>
          {recipes.length > 0 && (
            <>
              <View style={[styles.search, { backgroundColor: t.card, borderColor: t.border }]}>
                <Feather name="search" size={18} color={t.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search recipes or ingredients"
                  placeholderTextColor={t.muted}
                  style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
                />
              </View>
              <Chips<View_>
                value={view}
                onChange={setView}
                options={[
                  { key: 'all', label: `All ${recipes.length}` },
                  { key: 'menu', label: `On the menu ${planned || ''}`.trim() },
                  { key: 'ready', label: `Can cook now ${ready || ''}`.trim() },
                ]}
              />
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : (
          <View style={{ alignItems: 'center', marginTop: 50, gap: 10, paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 44 }}>📖</Text>
            <Text style={{ color: t.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
              {recipes.length
                ? 'Nothing here.'
                : 'Keep the Cookidoo recipes you like here.\nLink each ingredient to what you have, and the app tells you what you can cook now.'}
            </Text>
          </View>
        )
      }
      renderItem={({ item: { r, have, total } }) => {
        const full = total > 0 && have === total;
        return (
          <Tap
            haptic={false}
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}
            style={[styles.card, { backgroundColor: t.card, borderColor: r.planned ? t.accent : t.border }]}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={2} style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{r.title}</Text>
              <Text style={{ color: full ? t.accent : t.muted, fontSize: 13, fontWeight: full ? '700' : '500' }}>
                {total ? `${have} of ${total} ingredients in the house` : 'No ingredients linked yet'}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {[r.planned ? 'On the menu' : null, r.times_cooked ? `Cooked ${r.times_cooked}×` : null, r.last_cooked_on ? `last ${r.last_cooked_on}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {total > 0 && (
              <View style={[styles.ring, { borderColor: full ? t.accent : t.border }]}>
                <Text style={{ color: full ? t.accent : t.text, fontWeight: '800' }}>
                  {have}/{total}
                </Text>
              </View>
            )}
            <Feather name="chevron-right" size={18} color={t.muted} />
          </Tap>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.5 },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
