import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { daysInMonth, describeDate, fromIso, MONTH_NAMES, parseDateInput, startOfToday, toIso } from '../lib/dates';
import { radius, useTheme } from '../lib/theme';
import { styles as ui, tick } from './ui';

const QUICK: [string, number][] = [['Today', 0], ['+3 days', 3], ['+1 week', 7], ['+2 weeks', 14], ['+1 month', 30]];
const inDays = (n: number) => {
  const d = startOfToday();
  d.setDate(d.getDate() + n);
  return toIso(d);
};

/**
 * Expiry date input: type it loosely (20271212, 202712, 1212, 2027-12-12…), pick it on a calendar,
 * or tap a quick button. `value` is the raw text; read the date with parseDateInput(value).
 */
export function DateField({ label, value, onChange, placeholder = 'e.g. 20271212, 1212 or pick a day' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const parsed = parseDateInput(value);
  const iso = parsed && 'iso' in parsed ? parsed.iso : null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={[ui.label, { color: t.muted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onBlur={() => iso && iso !== value && onChange(iso)}
          placeholder={placeholder}
          placeholderTextColor={t.muted}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          style={[ui.input, { flex: 1, backgroundColor: t.card, borderColor: parsed && 'error' in parsed ? t.danger : t.border, color: t.text }]}
        />
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityLabel="Pick a date on the calendar"
          style={[s.calBtn, { backgroundColor: t.accentSoft, borderColor: t.border }]}
        >
          <Feather name="calendar" size={22} color={t.accent} />
        </Pressable>
      </View>
      {parsed ? (
        <Text style={{ fontSize: 13, color: 'error' in parsed ? t.danger : t.muted }}>
          {'error' in parsed ? parsed.error : describeDate(parsed.iso)}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {QUICK.map(([l, n]) => (
          <Pressable key={l} onPress={() => onChange(inDays(n))} style={[s.quick, { backgroundColor: t.chip }]}>
            <Text style={{ color: t.text, fontSize: 13 }}>{l}</Text>
          </Pressable>
        ))}
        {value ? (
          <Pressable onPress={() => onChange('')} style={[s.quick, { backgroundColor: t.chip }]}>
            <Text style={{ color: t.danger, fontSize: 13 }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <CalendarModal
        visible={open}
        value={iso}
        onClose={() => setOpen(false)}
        onPick={(d) => {
          onChange(d);
          setOpen(false);
        }}
      />
    </View>
  );
}

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month-grid calendar in a centered sheet. Pure JS, so it behaves the same on web and Android. */
export function CalendarModal({ visible, value, onClose, onPick, pastOnly }: {
  visible: boolean; value: string | null; onClose: () => void; onPick: (iso: string) => void;
  /** for days that already happened (a purchase): future days are greyed out and can't be picked */
  pastOnly?: boolean;
}) {
  const t = useTheme();
  const todayIso = toIso(startOfToday());
  const start = value ? fromIso(value) : startOfToday();
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Re-center on the selected date each time the sheet opens.
  const key = visible ? value ?? todayIso : null;
  if (key !== shownFor) {
    setShownFor(key);
    if (key) setCursor({ y: start.getFullYear(), m: start.getMonth() });
  }

  const cells = useMemo(() => {
    const lead = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // Monday first
    const n = daysInMonth(cursor.y, cursor.m + 1);
    const out: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  const shift = (months: number) => {
    tick();
    const d = new Date(cursor.y, cursor.m + months, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const isoOf = (day: number) => toIso(new Date(cursor.y, cursor.m, day));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, ui.shadow, { backgroundColor: t.elevated, borderColor: t.border }]} onPress={() => {}}>
          <View style={s.head}>
            <NavBtn icon="chevrons-left" label="Previous year" onPress={() => shift(-12)} />
            <NavBtn icon="chevron-left" label="Previous month" onPress={() => shift(-1)} />
            <Text style={{ flex: 1, textAlign: 'center', color: t.text, fontSize: 17, fontWeight: '700' }}>
              {MONTH_NAMES[cursor.m]} {cursor.y}
            </Text>
            <NavBtn icon="chevron-right" label="Next month" onPress={() => shift(1)} />
            <NavBtn icon="chevrons-right" label="Next year" onPress={() => shift(12)} />
          </View>

          <View style={s.grid}>
            {WEEK.map((w, i) => (
              <View key={i} style={s.cell}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }}>{w}</Text>
              </View>
            ))}
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={s.cell} />;
              const iso = isoOf(day);
              const selected = iso === value;
              const isToday = iso === todayIso;
              const past = pastOnly ? iso > todayIso : iso < todayIso;
              return (
                <Pressable key={i} style={s.cell} disabled={pastOnly && past} onPress={() => { tick(); onPick(iso); }} accessibilityLabel={iso}>
                  {({ pressed }) => (
                    <View
                      style={[
                        s.day,
                        selected && { backgroundColor: t.accent },
                        !selected && isToday && { borderWidth: 1.5, borderColor: t.accent },
                        !selected && pressed && { backgroundColor: t.chip },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: selected || isToday ? '700' : '500',
                          color: selected ? t.accentText : past ? t.muted : t.text,
                          opacity: past && !selected ? 0.55 : 1,
                        }}
                      >
                        {day}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={s.foot}>
            <Pressable onPress={() => { const d = startOfToday(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }} style={[s.quick, { backgroundColor: t.chip }]}>
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>This month</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[s.quick, { backgroundColor: t.chip }]}>
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NavBtn({ icon, label, onPress }: { icon: 'chevron-left' | 'chevron-right' | 'chevrons-left' | 'chevrons-right'; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [s.nav, { backgroundColor: pressed ? t.chip : 'transparent' }]}>
      <Feather name={icon} size={20} color={t.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  calBtn: { width: 50, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quick: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 380, borderRadius: radius.lg, borderWidth: 1, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: '84%', height: '84%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
