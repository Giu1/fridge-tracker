import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { textOn, tint } from '../lib/categories';
import { radius, useTheme } from '../lib/theme';
import type { Category } from '../lib/types';
import { tick } from './ui';

/** Small coloured label. `solid` for use on top of a photo. */
export function CategoryPill({ category, solid = false, size = 'md' }: { category: Category; solid?: boolean; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: solid ? category.color : tint(category.color), paddingHorizontal: small ? 7 : 9, paddingVertical: small ? 2 : 3 },
      ]}
    >
      {!solid && <View style={[styles.dot, { backgroundColor: category.color }]} />}
      <Text numberOfLines={1} style={{ color: solid ? textOn(category.color) : category.color, fontSize: small ? 11 : 12, fontWeight: '700' }}>
        {category.label}
      </Text>
    </View>
  );
}

/**
 * Horizontal chips with colour dots. Tapping the selected chip again clears it (value null).
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
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {allLabel !== undefined && (
        <Pressable
          onPress={() => {
            tick();
            onChange(null);
          }}
          style={[styles.chip, { backgroundColor: value === null ? t.text : t.chip }]}
        >
          <Text style={{ color: value === null ? t.bg : t.text, fontWeight: value === null ? '700' : '500', fontSize: 14 }}>{allLabel}</Text>
        </Pressable>
      )}
      {categories.map((c) => {
        const on = value === c.id;
        const n = counts?.get(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => {
              tick();
              onChange(on ? null : c.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? c.color : t.chip }]}
          >
            <View style={[styles.dot, { backgroundColor: on ? textOn(c.color) : c.color, width: 9, height: 9 }]} />
            <Text style={{ color: on ? textOn(c.color) : t.text, fontWeight: on ? '700' : '500', fontSize: 14 }}>
              {c.label}
              {n ? <Text style={{ opacity: 0.6 }}>{` ${n}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
      {trailing && (
        <Pressable onPress={trailing.onPress} style={[styles.chip, { borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' }]}>
          <Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>{trailing.label}</Text>
        </Pressable>
      )}
    </ScrollView>
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
  dot: { width: 7, height: 7, borderRadius: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 31, height: 31, borderRadius: 16, borderWidth: 2 },
});
