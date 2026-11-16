import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { confirmAsk, notify } from '../lib/dialog';
import { updateItem } from '../lib/items';
import {
  formatPrice, itemPatchFromLink, itemQuery, openUrl, refreshLink, removeLink, saveLink, shopSearchUrl, storeForUrl, useItemLinks,
} from '../lib/links';
import { PT_STORES, storeByKey, storesFromLabels } from '../lib/stores';
import { useTheme } from '../lib/theme';
import type { Item, ProductLink } from '../lib/types';
import { StoreLogo } from './StoreChips';
import { Button, Card, Field, Label } from './ui';

const NUT_LABELS: [string, string, string][] = [
  ['energy_kcal', 'Energy', 'kcal'],
  ['fat', 'Fat', 'g'],
  ['saturated_fat', '  of which saturates', 'g'],
  ['carbohydrates', 'Carbohydrates', 'g'],
  ['sugars', '  of which sugars', 'g'],
  ['fiber', 'Fibre', 'g'],
  ['proteins', 'Protein', 'g'],
  ['salt', 'Salt', 'g'],
];

/**
 * "Shops" card on an item: every supermarket, with its saved product page (tap to open) or a search for the item
 * there, and a field to paste a product link. Saved links show everything the app read from the page.
 */
export function ShopLinks({ item }: { item: Item }) {
  const t = useTheme();
  const { links } = useItemLinks(item.id);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const soldAt = storesFromLabels(item.stores);
  const byStore = new Map(links.map((l) => [l.store, l]));
  // Linked shops first, then shops Open Food Facts says sell it, then the rest.
  const order = [...PT_STORES].sort((a, b) => rank(a.key) - rank(b.key));
  function rank(k: string) {
    return byStore.has(k) ? 0 : soldAt.includes(k) ? 1 : 2;
  }

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const link = await saveLink(item, url);
      setUrl('');
      setOpen(link.store);
      if (link.status === 'failed') notify('Link saved, but the page could not be read', link.error ?? '');
    } catch (e) {
      notify('Could not add the link', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const detected = url.trim() ? storeForUrl(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`) : null;

  return (
    <Card style={{ gap: 10 }}>
      <Label>Shops</Label>
      <Text style={{ color: t.muted, fontSize: 13 }}>
        Tap a shop to open this product there (or search for it). Paste a product page to keep it and read its details.
      </Text>
      {order.map((s) => {
        const link = byStore.get(s.key);
        return (
          <View key={s.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => openUrl(link?.url ?? shopSearchUrl(s.key, itemQuery(item)))}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
                accessibilityRole="link"
                accessibilityLabel={link ? `Open ${s.label} product page` : `Search ${s.label}`}
              >
                <StoreLogo store={s} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>
                    {s.label}
                    {!link && soldAt.includes(s.key) ? <Text style={{ color: t.muted, fontWeight: '400' }}>  · sold here</Text> : null}
                  </Text>
                  {link ? <LinkSummary link={link} /> : null}
                </View>
                {!link ? <Text style={{ color: t.accent, fontWeight: '600' }}>Search ↗</Text> : null}
              </Pressable>
              {link ? (
                <Pressable onPress={() => setOpen(open === s.key ? null : s.key)} hitSlop={8} accessibilityRole="button">
                  <Text style={{ color: t.accent, fontWeight: '600' }}>{open === s.key ? 'Hide' : 'Details'}</Text>
                </Pressable>
              ) : null}
            </View>
            {link && open === s.key ? <LinkDetails item={item} link={link} /> : null}
          </View>
        );
      })}
      <Field
        label="Add a product link"
        value={url}
        onChangeText={setUrl}
        placeholder="https://www.continente.pt/produto/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onSubmitEditing={add}
      />
      {url.trim() ? (
        <Text style={{ color: detected ? t.accent : t.danger, fontSize: 13 }}>
          {detected ? `${storeByKey(detected)?.label} product page${byStore.has(detected) ? ' (replaces the saved one)' : ''}` : 'Not one of the supported shops'}
        </Text>
      ) : null}
      <Button title="Save link and read the page" kind="secondary" onPress={add} busy={busy} disabled={!url.trim()} />
    </Card>
  );
}

function LinkSummary({ link }: { link: ProductLink }) {
  const t = useTheme();
  if (link.status === 'pending')
    return (
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={t.muted} />
        <Text style={{ color: t.muted, fontSize: 13 }}>Reading the page…</Text>
      </View>
    );
  if (link.status === 'failed') return <Text style={{ color: t.warn, fontSize: 13 }} numberOfLines={2}>Link saved · details not read</Text>;
  const price = formatPrice(link.price, link.currency);
  return (
    <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>
      {[price && <Text key="p" style={{ color: t.text, fontWeight: '700' }}>{price}</Text>, link.unit_price, link.name].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))}
    </Text>
  );
}

function LinkDetails({ item, link }: { item: Item; link: ProductLink }) {
  const t = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const d = link.data;
  const row = (label: string, value: string | number | null | undefined) =>
    value == null || value === '' ? null : (
      <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
        <Text style={{ color: t.muted }}>{label}</Text>
        <Text style={{ color: t.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
      </View>
    );
  const para = (label: string, value: string | null | undefined) =>
    value ? (
      <View key={label} style={{ gap: 2, paddingVertical: 3 }}>
        <Text style={{ color: t.muted }}>{label}</Text>
        <Text style={{ color: t.text }}>{value}</Text>
      </View>
    ) : null;

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const patch = itemPatchFromLink(item, link);
  const nutrition = d?.nutrition as Record<string, number | undefined> | null | undefined;

  return (
    <View style={{ marginLeft: 36, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: t.chip, gap: 4 }}>
      {link.status === 'failed' ? <Text style={{ color: t.warn }}>{link.error ?? 'The page could not be read.'}</Text> : null}
      {d ? (
        <>
          {d.image_url ? <Image source={{ uri: d.image_url }} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: '#fff' }} contentFit="contain" /> : null}
          {row('Name', d.name)}
          {row('Brand', d.brand)}
          {row('Price', formatPrice(d.price, d.currency))}
          {row('Regular price', formatPrice(d.regular_price, d.currency))}
          {row('Unit price', d.unit_price)}
          {row('Size', d.quantity)}
          {row('EAN', d.ean)}
          {row('Shop reference', d.sku)}
          {row('Availability', d.availability)}
          {row('Nutri-Score', d.nutriscore?.toUpperCase())}
          {row('NOVA group', d.nova_group)}
          {row('Origin', d.origin)}
          {row('Rating', d.rating != null ? `${d.rating}${d.rating_count ? ` (${d.rating_count})` : ''}` : null)}
          {nutrition && Object.keys(nutrition).length ? (
            <View style={{ paddingVertical: 3 }}>
              <Text style={{ color: t.muted }}>Nutrition per 100 g / ml</Text>
              {NUT_LABELS.map(([k, label, unit]) => (nutrition[k] != null ? row(label, `${nutrition[k]} ${unit}`) : null))}
            </View>
          ) : (
            para('Nutrition', d.nutrition_text)
          )}
          {para('Ingredients', d.ingredients)}
          {para('Allergens', d.allergens)}
          {para('Storage', d.storage)}
          {para('Category', d.category)}
          {para('Description', d.description)}
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
            Read {link.fetched_at ? new Date(link.fetched_at).toLocaleString('pt-PT') : ''} from: {d.sources.join(', ') || 'nothing'}
          </Text>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 }}>
        <Pressable onPress={() => openUrl(link.url)}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>Open page ↗</Text>
        </Pressable>
        <Pressable onPress={() => run('refresh', () => refreshLink(link))} disabled={!!busy}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>{busy === 'refresh' ? 'Reading…' : 'Read again'}</Text>
        </Pressable>
        {Object.keys(patch).length ? (
          <Pressable onPress={() => run('apply', () => updateItem(item, patch))} disabled={!!busy}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>{busy === 'apply' ? 'Saving…' : 'Fill in item details'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() =>
            run('remove', async () => {
              if (await confirmAsk('Remove link?', `${storeByKey(link.store)?.label ?? link.store}: ${link.url}`, 'Remove')) await removeLink(link);
            })
          }
          disabled={!!busy}
        >
          <Text style={{ color: t.danger, fontWeight: '600' }}>Remove link</Text>
        </Pressable>
      </View>
    </View>
  );
}
