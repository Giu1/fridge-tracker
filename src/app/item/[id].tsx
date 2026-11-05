import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { NutriScore } from '../../components/NutriScore';
import { Photo } from '../../components/Photo';
import { StoreDots } from '../../components/StoreChips';
import { Button, Card, Page } from '../../components/ui';
import { confirmAsk, notify } from '../../lib/dialog';
import { expiryLabel } from '../../lib/expiry';
import { deleteItem, useItems } from '../../lib/items';
import { useSession } from '../../lib/session';
import { storesFromLabels } from '../../lib/stores';
import { useTheme } from '../../lib/theme';
import { LOCATIONS } from '../../lib/types';

export default function ItemDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { items } = useItems();
  const item = items.find((i) => i.id === id);

  if (!item) return <Text style={{ color: t.muted, padding: 20 }}>Loading…</Text>;
  const exp = expiryLabel(item, t);

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
      <Photo path={item.photo_path} fallbackUrl={item.off_image_url} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 22 }} label={item.name} />
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{item.name}</Text>
          {exp && <Text style={{ color: exp.color, fontWeight: '700' }}>{exp.text}</Text>}
        </View>

        <Card style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>NUTRI-SCORE</Text>
          <NutriScore grade={item.nutriscore} full />
        </Card>

        <Card>
          {row('Quantity', item.quantity)}
          {row('Where', LOCATIONS.find((l) => l.key === item.location)?.label)}
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

        <Button title="Edit" kind="secondary" onPress={() => router.push({ pathname: '/add', params: { id: item.id } })} />
        <Button title="Used it up / remove" kind="danger" onPress={remove} />
      </View>
      </Page>
    </ScrollView>
  );
}
