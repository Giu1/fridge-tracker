import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { CategoryChips, CategoryPill } from '../../components/Category';
import { NutriScore } from '../../components/NutriScore';
import { Photo } from '../../components/Photo';
import { StoreDots } from '../../components/StoreChips';
import { Button, Card, Chips, Label, Page } from '../../components/ui';
import { useCategories } from '../../lib/categories';
import { confirmAsk, notify } from '../../lib/dialog';
import { expiryLabel } from '../../lib/expiry';
import { deleteItem, updateItem, useItem } from '../../lib/items';
import { placeLabel, usePlaces } from '../../lib/places';
import { recipesUsing, useRecipes } from '../../lib/recipes';
import { useSession } from '../../lib/session';
import { storesFromLabels } from '../../lib/stores';
import { useTheme } from '../../lib/theme';

export default function ItemDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { item, loading } = useItem(id);
  const { places, byId } = usePlaces();
  const { recipes } = useRecipes();
  const { categories, byId: catById } = useCategories();

  if (!item) return <Text style={{ color: t.muted, padding: 20 }}>{loading ? 'Loading…' : 'This item was removed.'}</Text>;
  const usedIn = recipesUsing(item, recipes);

  const move = async (location: string) => {
    if (location === item.location) return;
    try {
      await updateItem(item, { location });
    } catch (e) {
      notify('Could not move', (e as Error).message);
    }
  };
  const exp = expiryLabel(item, t);
  const category = item.category_id ? catById.get(item.category_id) : undefined;
  const setCategory = async (category_id: string | null) => {
    try {
      await updateItem(item, { category_id });
    } catch (e) {
      notify('Could not change category', (e as Error).message);
    }
  };

  const remove = async () => {
    if (!(await confirmAsk('Remove from fridge?', item.name, 'Remove'))) return;
    try {
      await deleteItem(item);
      router.back();
    } catch (e) {
      notify('Could not remove', (e as Error).message);
    }
  };

  const row = (label: string, value: string | number | null | undefined) =>
    value == null || value === '' ? null : (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 }}>
        <Text style={{ color: t.muted }}>{label}</Text>
        <Text style={{ color: t.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: '' }} />
      <Page>
      <Photo path={item.photo_path} fallbackUrl={item.off_image_url} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 22 }} label={item.name} color={category?.color} />
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{item.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {category && <CategoryPill category={category} />}
            {exp && <Text style={{ color: exp.color, fontWeight: '700' }}>{exp.text}</Text>}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Label>Category</Label>
          <CategoryChips
            value={item.category_id ?? null}
            onChange={setCategory}
            categories={categories}
            trailing={{ label: categories.length ? '+ Category' : '+ Add a category', onPress: () => router.push('/categories') }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Label>Where</Label>
          <Chips
            value={item.location}
            onChange={move}
            options={[
              ...places.map((p) => ({ key: p.id, label: placeLabel(byId, p.id) })),
              ...(byId.has(item.location) ? [] : [{ key: item.location, label: placeLabel(byId, item.location) }]),
            ]}
          />
        </View>

        <Card style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>NUTRI-SCORE</Text>
          <NutriScore grade={item.nutriscore} full />
        </Card>

        <Card>
          {row('Quantity', item.quantity)}
          {row('Expires', item.expires_on)}
          {row('Brand', item.brand)}
          {row('Product', item.product_name !== item.name ? item.product_name : null)}
          {row('Energy', item.kcal_100g != null ? `${item.kcal_100g} kcal / 100 g` : null)}
          {row('NOVA group', item.nova_group ? `${item.nova_group} of 4` : null)}
          {row('Reference', item.barcode)}
          {row('Added', `${new Date(item.created_at).toLocaleDateString('pt-PT')}${item.added_by === session?.user.id ? ' by you' : ''}`)}
        </Card>

        {item.stores ? (
          <Card style={{ gap: 4 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>SOLD AT</Text>
            <StoreDots stores={storesFromLabels(item.stores)} labels size={26} />
          </Card>
        ) : null}

        {item.notes ? <Card><Text style={{ color: t.text }}>{item.notes}</Text></Card> : null}

        {item.barcode ? (
          <Pressable onPress={() => Linking.openURL(`https://pt.openfoodfacts.org/produto/${item.barcode}`)}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>See full product on Open Food Facts →</Text>
          </Pressable>
        ) : null}

        <Card style={{ gap: 8 }}>
          <Label>Bimby recipes</Label>
          {usedIn.map((r) => (
            <Pressable key={r.id} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}>
              <Text style={{ color: t.text, fontWeight: '600' }}>
                🍲 {r.title}
                {r.planned ? <Text style={{ color: t.accent }}>  · on the menu</Text> : null}
              </Text>
            </Pressable>
          ))}
          {!usedIn.length && <Text style={{ color: t.muted }}>None of your saved recipes use this yet.</Text>}
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
            <Pressable onPress={() => router.push({ pathname: '/recipe/find', params: { with: item.id } })}>
              <Text style={{ color: t.accent, fontWeight: '600' }}>Find on Cookidoo →</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/recipe/edit', params: { items: item.id } })}>
              <Text style={{ color: t.accent, fontWeight: '600' }}>Save a recipe with it →</Text>
            </Pressable>
          </View>
        </Card>

        <Button title="Edit" kind="secondary" onPress={() => router.push({ pathname: '/add', params: { id: item.id } })} />
        <Button title="Used it up / remove" kind="danger" onPress={remove} />
      </View>
      </Page>
    </ScrollView>
  );
}
