import { StyleSheet, Text, View } from 'react-native';
import { NUTRI_COLORS, useTheme } from '../lib/theme';
import type { NutriScore as Grade } from '../lib/types';

/** Compact Nutri-Score badge; `full` shows the whole A–E scale with the grade highlighted. */
export function NutriScore({ grade, full = false }: { grade: Grade | null; full?: boolean }) {
  const t = useTheme();
  if (!full) {
    if (!grade) return null;
    return (
      <View style={[styles.badge, { backgroundColor: NUTRI_COLORS[grade] }]}>
        <Text style={[styles.badgeText, grade === 'c' && { color: '#3A2E00' }]}>{grade.toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={styles.row} accessibilityLabel={grade ? `Nutri-Score ${grade.toUpperCase()}` : 'No Nutri-Score'}>
      {(['a', 'b', 'c', 'd', 'e'] as Grade[]).map((g) => {
        const on = g === grade;
        return (
          <View
            key={g}
            style={[
              styles.cell,
              { backgroundColor: NUTRI_COLORS[g], opacity: grade && !on ? 0.35 : 1 },
              on && styles.cellOn,
            ]}
          >
            <Text style={[styles.cellText, on && { fontSize: 20 }]}>{g.toUpperCase()}</Text>
          </View>
        );
      })}
      {!grade && <Text style={{ color: t.muted, marginLeft: 8 }}>no score</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cell: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  cellOn: { width: 40, height: 44, borderRadius: 8, zIndex: 1 },
  cellText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
