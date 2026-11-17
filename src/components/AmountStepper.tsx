import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, useTheme } from '../lib/theme';
import { tick } from './ui';

/** Whole-number amount: − / + buttons, or type it. */
export function AmountStepper({ value, onChange, size = 'md' }: { value: number; onChange: (n: number) => void; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const h = size === 'sm' ? 34 : 44;
  const commit = (n: number) => {
    const v = Math.max(0, Math.min(99999, Math.round(n)));
    setText(String(v));
    if (v !== value) onChange(v);
  };
  const btn = (icon: 'minus' | 'plus', d: number, label: string) => (
    <Pressable
      onPress={() => {
        tick();
        commit(value + d);
      }}
      disabled={d < 0 && value <= 0}
      hitSlop={4}
      accessibilityLabel={label}
      style={[styles.btn, { width: h, height: h, backgroundColor: t.chip, opacity: d < 0 && value <= 0 ? 0.4 : 1 }]}
    >
      <Feather name={icon} size={size === 'sm' ? 15 : 18} color={t.text} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {btn('minus', -1, 'One less')}
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.replace(/\D/g, '').slice(0, 5))}
        onBlur={() => commit(text === '' ? value : Number(text))}
        onSubmitEditing={() => commit(text === '' ? value : Number(text))}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel="Amount"
        style={[styles.input, { height: h, width: size === 'sm' ? 48 : 64, color: t.text, backgroundColor: t.card, borderColor: t.border, fontSize: size === 'sm' ? 15 : 17 }]}
      />
      {btn('plus', 1, 'One more')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontWeight: '700', paddingHorizontal: 6 },
});
