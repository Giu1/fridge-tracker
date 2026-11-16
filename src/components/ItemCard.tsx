import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expiryLabel } from '../lib/expiry';
import { radius, useTheme, type Theme } from '../lib/theme';
import type { Category, Item } from '../lib/types';
import type { ViewMode } from '../lib/viewMode';
import { CategoryPill } from './Category';
import { NutriScore } from './NutriScore';
import { Photo } from './Photo';
import { StoreDots } from './StoreChips';
import { Tap } from './ui';

type Props = {
  item: Item;
  mode: ViewMode;
  category?: Category;
  placeText: string;
  stores: string[];
};

const open = (id: string) => router.push({ pathname: '/item/[id]', params: { id } });

function Expiry({ item, t, compact }: { item: Item; t: Theme; compact?: boolean }) {
  const exp = expiryLabel(item, t);
  if (!exp) return null;
  return (
    <View style={[styles.exp, { backgroundColor: exp.bg }, compact && { paddingHorizontal: 7, paddingVertical: 2 }]}>
      <Text numberOfLines={1} style={{ color: exp.tone === 'ok' ? t.text : exp.color, fontSize: compact ? 11 : 12, fontWeight: '700' }}>
        {exp.text}
      </Text>
    </View>
  );
}

/** One food on the home list, drawn for the chosen view (grid, list or compact). */
export const ItemCard = memo(function ItemCard({ item, mode, category, placeText, stores }: Props) {
  const t = useTheme();
  const meta = [item.quantity, item.brand].filter(Boolean).join(' · ') || placeText;
  const accent = category?.color ?? t.border;

  if (mode === 'compact') {
    return (
      <Tap onPress={() => open(item.id)} haptic={false} scaleTo={0.985} style={[styles.compact, { backgroundColor: t.card }]}>
        <View style={[styles.bar, { backgroundColor: accent }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600', fontSize: 15 }}>
            {item.name}
            {item.quantity ? <Text style={{ color: t.muted, fontWeight: '400' }}>{`  ${item.quantity}`}</Text> : null}
          </Text>
        </View>
        <NutriScore grade={item.nutriscore} />
        <Expiry item={item} t={t} compact />
      </Tap>
    );
  }

  if (mode === 'list') {
    return (
      <Tap onPress={() => open(item.id)} haptic={false} scaleTo={0.985} style={[styles.row, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={[styles.strip, { backgroundColor: category?.color ?? 'transparent' }]} />
        <View>
          <Photo path={item.photo_path} fallbackUrl={item.off_image_url} style={styles.thumb} label={item.name} color={category?.color} />
          {item.nutriscore ? (
            <View style={styles.thumbBadge}>
              <NutriScore grade={item.nutriscore} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>{meta}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {category && <CategoryPill category={category} size="sm" />}
            <StoreDots stores={stores} size={14} />
          </View>
        </View>
        <Expiry item={item} t={t} />
      </Tap>
    );
  }

  return (
    <Tap onPress={() => open(item.id)} haptic={false} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View>
        <Photo path={item.photo_path} fallbackUrl={item.off_image_url} style={styles.photo} label={item.name} color={category?.color} />
        {category && (
          <View style={styles.photoTL}>
            <CategoryPill category={category} solid size="sm" />
          </View>
        )}
        {item.nutriscore ? (
          <View style={styles.photoTR}>
            <NutriScore grade={item.nutriscore} />
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
        <View style={{ gap: 2 }}>
          <Text numberOfLines={2} style={{ color: t.text, fontWeight: '700', fontSize: 15, lineHeight: 19 }}>{item.name}</Text>
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{meta}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 22 }}>
          <Expiry item={item} t={t} compact />
          <StoreDots stores={stores.slice(0, 3)} size={14} />
        </View>
      </View>
      <View style={[styles.underline, { backgroundColor: category?.color ?? 'transparent' }]} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 1 },
  photoTL: { position: 'absolute', top: 8, left: 8, right: 40 },
  photoTR: { position: 'absolute', top: 8, right: 8 },
  underline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 12,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  bar: { width: 4, height: 28, borderRadius: 2 },
  strip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  thumbBadge: { position: 'absolute', bottom: -4, right: -4, transform: [{ scale: 0.85 }] },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingLeft: 10, paddingRight: 12, borderRadius: radius.sm },
  exp: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, flexShrink: 0 },
});
