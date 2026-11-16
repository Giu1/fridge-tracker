import { Feather } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Label, Page } from '../../components/ui';
import { confirmAsk, notify } from '../../lib/dialog';
import { expiryLabel } from '../../lib/expiry';
import { deleteItem, useItems } from '../../lib/items';
import { placeLabel, usePlaces } from '../../lib/places';
import { cookidooSearchUrl, deleteRecipe, isCookidoo, itemFuse, markCooked, safeHost, setPlanned, stockFor, useRecipes } from '../../lib/recipes';
import { radius, useTheme } from '../../lib/theme';

export default function RecipeDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, loading } = useRecipes();
  const { items } = useItems();
  const { byId } = usePlaces();
  const fuse = useMemo(() => itemFuse(items), [items]);
  const [busy, setBusy] = useState<string | null>(null);
  const recipe = recipes.find((r) => r.id === id);

  if (!recipe) return <Text style={{ color: t.muted, padding: 20 }}>{loading ? 'Loading…' : 'This recipe was deleted.'}</Text>;

  const stock = recipe.ingredients.map((g) => ({ g, s: stockFor(g, items, fuse) }));
  const have = stock.filter((x) => x.s).length;
  const missing = stock.filter((x) => !x.s).map((x) => x.g.name);

  const act = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cooked = () =>
    act('cooked', async () => {
      await markCooked(recipe);
      const used = stock.flatMap((x) => (x.s ? [x.s.item] : []));
      if (used.length && (await confirmAsk('Used anything up?', `Remove from the house: ${used.map((i) => i.name).join(', ')}?`, 'Remove'))) {
        for (const item of used) await deleteItem(item);
      }
    });

  const remove = async () => {
    if (!(await confirmAsk('Delete recipe?', recipe.title, 'Delete'))) return;
    await act('delete', () => deleteRecipe(recipe));
    router.back();
  };

  const openLink = () => Linking.openURL(recipe.url ?? cookidooSearchUrl([recipe.title])).catch(() => notify('Could not open the link'));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: '' }} />
      <Page style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{recipe.title}</Text>
          <Text style={{ color: t.muted }}>
            {[recipe.times_cooked ? `Cooked ${recipe.times_cooked}×` : 'Not cooked yet', recipe.last_cooked_on ? `last on ${recipe.last_cooked_on}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <Button
          title={recipe.url ? (isCookidoo(recipe.url) ? 'Open in Cookidoo' : `Open on ${safeHost(recipe.url)}`) : 'Search Cookidoo for it'}
          icon={<Text>🍲</Text>}
          onPress={openLink}
        />

        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Label>Ingredients</Label>
            {recipe.ingredients.length > 0 && (
              <Text style={{ color: have === recipe.ingredients.length ? t.accent : t.muted, fontWeight: '700' }}>
                {have} of {recipe.ingredients.length} in the house
              </Text>
            )}
          </View>
          {stock.map(({ g, s }, i) => {
            const exp = s ? expiryLabel(s.item, t) : null;
            return (
              <Pressable
                key={i}
                disabled={!s}
                onPress={() => s && router.push({ pathname: '/item/[id]', params: { id: s.item.id } })}
                style={[styles.ing, { borderTopColor: t.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}
              >
                <Feather name={s ? 'check-circle' : 'circle'} size={18} color={s ? t.accent : t.border} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>{g.name}</Text>
                  <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                    {s
                      ? `${s.how === 'match' ? 'Probably ' : ''}${s.item.name} · ${placeLabel(byId, s.item.location)}`
                      : g.item_id
                        ? 'Used up'
                        : 'Not in the house'}
                    {exp ? <Text style={{ color: exp.color, fontWeight: '700' }}>{`  ${exp.text}`}</Text> : null}
                  </Text>
                </View>
                {s && <Feather name="chevron-right" size={16} color={t.muted} />}
              </Pressable>
            );
          })}
          {!recipe.ingredients.length && <Text style={{ color: t.muted }}>No ingredients yet. Edit to link them to what you have.</Text>}
        </Card>

        {missing.length > 0 && (
          <Card style={[styles.shop, { backgroundColor: t.warnSoft, borderColor: 'transparent' }]}>
            <Label>To buy</Label>
            <Text selectable style={{ color: t.text }}>{missing.join(', ')}</Text>
          </Card>
        )}

        {recipe.notes ? (
          <Card>
            <Text style={{ color: t.text }}>{recipe.notes}</Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title={recipe.planned ? 'Off the menu' : 'On the menu'}
            kind="secondary"
            icon={<Feather name="calendar" size={16} color={t.text} />}
            onPress={() => act('plan', () => setPlanned(recipe, !recipe.planned))}
            busy={busy === 'plan'}
            style={{ flex: 1 }}
          />
          <Button
            title="Cooked it"
            icon={<Feather name="check" size={16} color={t.accentText} />}
            onPress={cooked}
            busy={busy === 'cooked'}
            style={{ flex: 1 }}
          />
        </View>
        <Button title="Edit" kind="secondary" onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })} />
        <Button title="Delete recipe" kind="danger" onPress={remove} busy={busy === 'delete'} />
      </Page>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ing: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  shop: { gap: 6, borderRadius: radius.lg },
});
