import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { describeDate, startOfToday, toIso } from '../lib/dates';
import { notify } from '../lib/dialog';
import { centsToInput, euros, parseMoney } from '../lib/money';
import { receiptDay, updateReceiptDetails, useReceipts } from '../lib/receipts';
import { radius, useTheme } from '../lib/theme';
import type { Receipt } from '../lib/types';
import { CalendarModal } from './DateField';
import { Button, styles as ui, tick } from './ui';

const daysAgo = (n: number) => {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return toIso(d);
};

/** Sheet to type what a receipt cost, where and when. Everything is optional and can be changed later. */
export function ReceiptDetails({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const t = useTheme();
  const { receipts } = useReceipts();
  const [total, setTotal] = useState('');
  const [shop, setShop] = useState('');
  const [day, setDay] = useState(toIso(startOfToday()));
  const [calendar, setCalendar] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setTotal(centsToInput(receipt.total_cents));
    setShop(receipt.shop ?? '');
    setDay(receiptDay(receipt));
  }, [receipt]);

  // Shops used before, most frequent first, as one-tap chips.
  const shops = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of receipts) if (r.shop) n.set(r.shop, (n.get(r.shop) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 6);
  }, [receipts]);

  const cents = parseMoney(total);
  const badTotal = total.trim() !== '' && cents == null;

  const save = async () => {
    if (!receipt || badTotal) return;
    setBusy(true);
    try {
      await updateReceiptDetails(receipt, {
        total_cents: total.trim() ? cents : null,
        shop: shop.trim().slice(0, 80) || null,
        purchased_on: day,
      });
      onClose();
    } catch (e) {
      notify('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quick: [string, string][] = [['Today', daysAgo(0)], ['Yesterday', daysAgo(1)], ['2 days ago', daysAgo(2)]];

  return (
    <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={[s.sheet, ui.shadow, { backgroundColor: t.elevated, borderColor: t.border }]} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 19, fontWeight: '800' }}>Receipt details</Text>
                <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={{ padding: 4 }}>
                  <Feather name="x" size={22} color={t.muted} />
                </Pressable>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[ui.label, { color: t.muted }]}>Amount paid</Text>
                <View style={[s.money, { backgroundColor: t.card, borderColor: badTotal ? t.danger : t.border }]}>
                  <TextInput
                    value={total}
                    onChangeText={setTotal}
                    placeholder="0,00"
                    placeholderTextColor={t.muted}
                    keyboardType="decimal-pad"
                    autoFocus={!receipt?.total_cents}
                    onSubmitEditing={save}
                    style={[s.moneyInput, { color: t.text }]}
                  />
                  <Text style={{ color: t.muted, fontSize: 26, fontWeight: '700' }}>€</Text>
                </View>
                {badTotal ? <Text style={{ color: t.danger, fontSize: 13 }}>Type an amount like 42,37.</Text> : null}
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[ui.label, { color: t.muted }]}>Day of purchase</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {quick.map(([label, iso]) => (
                    <Chip key={label} label={label} on={day === iso} onPress={() => setDay(iso)} />
                  ))}
                  <Chip label="Pick a day" icon="calendar" on={!quick.some(([, iso]) => iso === day)} onPress={() => setCalendar(true)} />
                </View>
                <Text style={{ color: t.muted, fontSize: 13 }}>{describeDate(day)}</Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[ui.label, { color: t.muted }]}>Shop</Text>
                <TextInput
                  value={shop}
                  onChangeText={setShop}
                  placeholder="e.g. Pingo Doce"
                  placeholderTextColor={t.muted}
                  maxLength={80}
                  style={[ui.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }]}
                />
                {shops.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {shops.map((x) => (
                      <Chip key={x} label={x} on={shop.trim() === x} onPress={() => setShop(x)} />
                    ))}
                  </View>
                )}
              </View>

              <Button
                title={cents != null && total.trim() ? `Save ${euros(cents)}` : 'Save'}
                onPress={save}
                busy={busy}
                disabled={badTotal}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <CalendarModal
        visible={calendar}
        value={day}
        pastOnly
        onClose={() => setCalendar(false)}
        onPick={(iso) => {
          setDay(iso);
          setCalendar(false);
        }}
      />
    </Modal>
  );
}

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: 'calendar' }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        tick();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[s.chip, { backgroundColor: on ? t.accent : t.chip }]}
    >
      {icon ? <Feather name={icon} size={14} color={on ? t.accentText : t.text} /> : null}
      <Text style={{ color: on ? t.accentText : t.text, fontWeight: on ? '700' : '500', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '92%', borderRadius: radius.lg, borderWidth: 1, padding: 18 },
  money: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 16 },
  moneyInput: { flex: 1, fontSize: 30, fontWeight: '800', paddingVertical: 12, minWidth: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
});
