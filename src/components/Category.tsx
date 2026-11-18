import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { textOn, tint } from '../lib/categories';
import { CATEGORY_ICONS, iconFor } from '../lib/categoryIcons';
import { radius, useTheme } from '../lib/theme';
import type { Category } from '../lib/types';
import { tick } from './ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** A category's icon in its colour (or `color`). */
export function CategoryIcon({ category, size = 16, color }: { category: Pick<Category, 'icon' | 'label' | 'color'>; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={iconFor(category) as IconName} size={size} color={color ?? category.color} />;
}

/** Small coloured label with the category's icon. `solid` for use on top of a photo. */
export function CategoryPill({ category, solid = false, size = 'md' }: { category: Category; solid?: boolean; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  const fg = solid ? textOn(category.color) : category.color;
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: solid ? category.color : tint(category.color), paddingLeft: small ? 6 : 8, paddingRight: small ? 8 : 10, paddingVertical: small ? 2 : 3 },
      ]}
    >
      <CategoryIcon category={category} size={small ? 12 : 14} color={fg} />
      <Text numberOfLines={1} style={{ color: fg, fontSize: small ? 11 : 12, fontWeight: '700', flexShrink: 1 }}>
        {category.label}
      </Text>
    </View>
  );
}

/** Round icon badge at the start of a chip. */
function Badge({ name, fg, bg }: { name: IconName; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={name} size={16} color={fg} />
    </View>
  );
}

/**
 * Horizontal chips, each with the category's icon. Tapping the selected chip again clears it (value null).
 * `counts` adds a number after each label; `allLabel` adds a leading "all" chip (value null).
 */
export function CategoryChips({ value, onChange, categories, counts, allLabel, trailing }: {
  value: string | null;
  onChange: (id: string | null) => void;
  categories: Category[];
  counts?: Map<string, number>;
  allLabel?: string;
  trailing?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  const allOn = value === null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {allLabel !== undefined && (
        <Pressable
          onPress={() => {
            tick();
            onChange(null);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: allOn }}
          style={[styles.chip, { backgroundColor: allOn ? t.text : t.chip, borderColor: allOn ? t.text : t.border }]}
        >
          <Badge name="silverware-fork-knife" fg={allOn ? t.text : t.muted} bg={allOn ? t.bg : t.card} />
          <Text style={{ color: allOn ? t.bg : t.text, fontWeight: allOn ? '700' : '600', fontSize: 14 }}>{allLabel}</Text>
        </Pressable>
      )}
      {categories.map((c) => {
        const on = value === c.id;
        const n = counts?.get(c.id);
        const fg = on ? textOn(c.color) : t.text;
        return (
          <Pressable
            key={c.id}
            onPress={() => {
              tick();
              onChange(on ? null : c.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={n ? `${c.label}, ${n}` : c.label}
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? c.color : t.chip, borderColor: on ? c.color : t.border }]}
          >
            <Badge name={iconFor(c) as IconName} fg={c.color} bg={on ? textOn(c.color) : tint(c.color, 0.2)} />
            <Text style={{ color: fg, fontWeight: on ? '700' : '600', fontSize: 14 }}>{c.label}</Text>
            {n ? (
              <View style={[styles.count, { backgroundColor: on ? tint(textOn(c.color), 0.22) : t.card }]}>
                <Text style={{ color: fg, fontSize: 11, fontWeight: '700', opacity: on ? 1 : 0.7 }}>{n}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {trailing && (
        <Pressable
          onPress={trailing.onPress}
          accessibilityRole="button"
          style={[styles.chip, { paddingLeft: 12, borderColor: t.border, borderStyle: 'dashed' }]}
        >
          <MaterialCommunityIcons name="plus" size={16} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>{trailing.label.replace(/^\+\s*/, '')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** Grid of food icons; the picked one is drawn in the category colour. */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (icon: string) => void; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {CATEGORY_ICONS.map((name) => {
        const on = name === value;
        return (
          <Pressable
            key={name}
            onPress={() => {
              tick();
              onChange(name);
            }}
            accessibilityLabel={`Icon ${name.replace(/-/g, ' ')}`}
            accessibilityState={{ selected: on }}
            style={[styles.iconCell, { backgroundColor: on ? color : t.chip }]}
          >
            <MaterialCommunityIcons name={name} size={20} color={on ? textOn(color) : t.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row of colour swatches. */
export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {colors.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => {
              tick();
              onChange(c);
            }}
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected: on }}
            style={[styles.swatchRing, { borderColor: on ? c : 'transparent' }]}
          >
            <View style={[styles.swatch, { backgroundColor: c, borderColor: t.card }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, alignSelf: 'flex-start', maxWidth: '100%' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 5, paddingRight: 14, paddingVertical: 5,
    minHeight: 38, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent',
  },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: -2, marginRight: -6 },
  iconCell: { width: 42, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 31, height: 31, borderRadius: 16, borderWidth: 2 },
});
