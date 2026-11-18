import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ReceiptDetails } from '../../components/ReceiptDetails';
import { Button, Card, Tap } from '../../components/ui';
import { fromIso, MONTH_NAMES } from '../../lib/dates';
import { confirmAsk, notify } from '../../lib/dialog';
import { euros } from '../../lib/money';
import { deleteReceipt, downloadReceipt, receiptDay, receiptPreviewUrl, sendReceipt, useReceiptLines, useReceipts } from '../../lib/receipts';
import { useSession } from '../../lib/session';
import { radius, useTheme } from '../../lib/theme';
import type { Receipt } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Tue 17 Nov" (adds the year when it is not this year) */
const shortDay = (iso: string) => {
  const d = fromIso(iso);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}${y}`;
};
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string, withYear = true) => {
  const [y, m] = key.split('-').map(Number);
  return withYear ? `${MONTH_NAMES[m - 1]} ${y}` : MONTH_NAMES[m - 1];
};
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

interface Month {
  key: string;
  total: number;
  count: number;
  /** receipts in this month with no amount yet */
  missing: number;
}
type Row = { kind: 'month'; month: Month } | { kind: 'receipt'; receipt: Receipt };

const kb = (n: number | null) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function Receipts() {
  const t = useTheme();
  const { demo } = useSession();
  const { receipts, loading, offline, reload } = useReceipts();
  const { all: lines } = useReceiptLines(undefined);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);

  // Timeline: receipts (newest purchase first) under a header per month with what that month cost.
  const { rows, months } = useMemo(() => {
    const months = new Map<string, Month>();
    for (const r of receipts) {
      const k = monthKey(receiptDay(r));
      const m = months.get(k) ?? { key: k, total: 0, count: 0, missing: 0 };
      m.count++;
      if (r.total_cents != null) m.total += r.total_cents;
      else m.missing++;
      months.set(k, m);
    }
    const rows: Row[] = [];
    let last = '';
    for (const r of receipts) {
      const k = monthKey(receiptDay(r));
      if (k !== last) rows.push({ kind: 'month', month: months.get(k)! });
      last = k;
      rows.push({ kind: 'receipt', receipt: r });
    }
    return { rows, months };
  }, [receipts]);

  const send = async (files: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }[]) => {
    if (!files.length) return;
    setSending(true);
    try {
      for (const f of files) await sendReceipt(f);
    } catch (e) {
      notify('Could not send the receipt', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const camera = async () => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return notify('Camera permission is needed.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!res.canceled) send(res.assets.map((a) => ({ uri: a.uri, name: a.fileName, mimeType: a.mimeType, size: a.fileSize })));
  };
  const file = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
    if (!res.canceled) send(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size })));
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => (row.kind === 'month' ? `m-${row.month.key}` : row.receipt.id)}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={t.accent} />}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}
      ListHeaderComponent={
        <View style={{ gap: 14, marginBottom: 6 }}>
          <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
            {demo ? 'Demo mode: receipts are kept in this browser. ' : ''}
            Send the receipt, download it wherever you turn it into a list (any AI you like), then upload the list here. The
            app creates every item as a draft so you can correct the whole list on one page before saving.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Tap onPress={camera} disabled={sending} style={[styles.big, { backgroundColor: t.accent }]}>
              <Feather name="camera" size={28} color={t.accentText} />
              <Text style={[styles.bigText, { color: t.accentText }]}>Photo of receipt</Text>
            </Tap>
            <Tap onPress={file} disabled={sending} style={[styles.big, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1 }]}>
              <Feather name="upload" size={28} color={t.text} />
              <Text style={[styles.bigText, { color: t.text }]}>Photo or PDF file</Text>
            </Tap>
          </View>
          {sending && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator color={t.accent} />
              <Text style={{ color: t.muted }}>Sending…</Text>
            </View>
          )}
          <Button
            title="Upload a list without a receipt"
            kind="ghost"
            icon={<Feather name="list" size={16} color={t.accent} />}
            onPress={() => router.push('/receipt/import')}
          />
          {offline && <Text style={{ color: t.warn }}>Offline: showing the copy on this device.</Text>}
          {receipts.length > 0 && <Spending months={months} />}
          <ReceiptDetails receipt={editing} onClose={() => setEditing(null)} />
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
            <Feather name="file-text" size={40} color={t.muted} />
            <Text style={{ color: t.muted, fontSize: 16, textAlign: 'center' }}>No receipts yet.</Text>
          </View>
        )
      }
      renderItem={({ item: row }) =>
        row.kind === 'month' ? (
          <MonthHeader month={row.month} />
        ) : (
          <ReceiptCard
            receipt={row.receipt}
            drafts={lines.filter((l) => l.receipt_id === row.receipt.id).length}
            onEdit={() => setEditing(row.receipt)}
          />
        )
      }
    />
  );
}

/** This month's spending, compared with last month, and a small bar chart of the last six months. */
function Spending({ months }: { months: Map<string, Month> }) {
  const t = useTheme();
  const now = new Date();
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const k = keyOf(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    return months.get(k) ?? { key: k, total: 0, count: 0, missing: 0 };
  });
  const cur = last6[5];
  const prev = last6[4];
  const max = Math.max(...last6.map((m) => m.total), 1);
  const anyTotal = [...months.values()].some((m) => m.total > 0);
  const avgOf = last6.slice(0, 5).filter((m) => m.total > 0);
  const avg = avgOf.length ? Math.round(avgOf.reduce((n, m) => n + m.total, 0) / avgOf.length) : null;

  let compare: { text: string; color: string } | null = null;
  if (prev.total > 0 && cur.total > 0) {
    const diff = cur.total - prev.total;
    const pct = Math.round((Math.abs(diff) / prev.total) * 100);
    compare =
      pct === 0
        ? { text: `Same as ${monthLabel(prev.key, false)}`, color: t.muted }
        : { text: `${euros(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${monthLabel(prev.key, false)} (${diff > 0 ? '+' : '−'}${pct}%)`, color: diff > 0 ? t.warn : t.accent };
  }

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Spent in {monthLabel(cur.key, false)}
        </Text>
        <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }}>{euros(cur.total)}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>
          {cur.count} receipt{cur.count === 1 ? '' : 's'}
          {cur.missing ? ` · ${cur.missing} without an amount` : ''}
          {avg != null ? ` · usual month ${euros(avg, { whole: true })}` : ''}
        </Text>
        {compare && <Text style={{ color: compare.color, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{compare.text}</Text>}
      </View>
      {anyTotal ? (
        <View style={s.chart} accessibilityLabel="Spending in the last six months">
          {last6.map((m, i) => {
            const isCur = i === 5;
            return (
              <View key={m.key} style={s.col}>
                <Text numberOfLines={1} style={{ color: isCur ? t.text : t.muted, fontSize: 11, fontWeight: isCur ? '700' : '500' }}>
                  {m.total ? euros(m.total, { whole: true }).replace(' €', '') : ''}
                </Text>
                <View style={s.track}>
                  <View
                    style={{
                      height: `${Math.max(m.total ? 6 : 2, (m.total / max) * 100)}%`,
                      borderRadius: 6,
                      backgroundColor: m.total ? t.accent : t.chip,
                      opacity: isCur || !m.total ? 1 : 0.4,
                    }}
                  />
                </View>
                <Text style={{ color: isCur ? t.text : t.muted, fontSize: 12, fontWeight: isCur ? '700' : '500' }}>
                  {monthLabel(m.key, false).slice(0, 3)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
          Tap “+ Amount” on a receipt to note what you paid. Totals per month show up here.
        </Text>
      )}
    </Card>
  );
}

function MonthHeader({ month: m }: { month: Month }) {
  const t = useTheme();
  return (
    <View style={s.monthRow}>
      <Text style={{ flex: 1, color: t.text, fontSize: 17, fontWeight: '800' }}>{monthLabel(m.key)}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{euros(m.total)}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {m.count} receipt{m.count === 1 ? '' : 's'}
          {m.missing ? ` · ${m.missing} without amount` : ''}
        </Text>
      </View>
    </View>
  );
}

function ReceiptCard({ receipt: r, drafts, onEdit }: { receipt: Receipt; drafts: number; onEdit: () => void }) {
  const t = useTheme();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    receiptPreviewUrl(r).then((u) => alive && setPreview(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [r]);

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const status =
    drafts > 0
      ? { text: `${drafts} to check`, color: t.warn, bg: t.warnSoft }
      : r.status === 'done'
        ? { text: `${r.item_count} item${r.item_count === 1 ? '' : 's'} added`, color: t.accent, bg: t.accentSoft }
        : { text: 'No list yet', color: t.muted, bg: t.chip };
  const isPdf = r.mime_type === 'application/pdf';

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }]}>
            <Feather name={r.file_path ? (isPdf ? 'file-text' : 'image') : 'list'} size={24} color={t.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{r.shop || r.title || r.file_name || 'Receipt'}</Text>
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
            {[shortDay(receiptDay(r)), isPdf ? 'PDF' : null, kb(r.size_bytes)].filter(Boolean).join(' · ')}
          </Text>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={{ color: status.color, fontWeight: '700', fontSize: 12 }}>{status.text}</Text>
          </View>
        </View>
        <Tap onPress={onEdit} accessibilityLabel="Amount, day and shop" style={{ alignItems: 'flex-end' }}>
          {r.total_cents != null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{euros(r.total_cents)}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>Edit</Text>
            </View>
          ) : (
            <View style={[s.addAmount, { backgroundColor: t.accentSoft }]}>
              <Feather name="plus" size={14} color={t.accent} />
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>Amount</Text>
            </View>
          )}
        </Tap>
        <Pressable
          hitSlop={8}
          accessibilityLabel="Delete receipt"
          onPress={async () => {
            const msg = drafts ? `Its ${drafts} unchecked lines go too. Items already added stay.` : 'Items already added stay.';
            if (await confirmAsk('Delete this receipt?', msg, 'Delete')) run('del', () => deleteReceipt(r));
          }}
          style={{ padding: 6 }}
        >
          {busy === 'del' ? <ActivityIndicator color={t.muted} /> : <Feather name="trash-2" size={18} color={t.muted} />}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {r.file_path ? (
          <Button
            title="Download"
            kind="secondary"
            icon={<Feather name="download" size={16} color={t.text} />}
            busy={busy === 'dl'}
            onPress={() => run('dl', () => downloadReceipt(r))}
            style={{ flexGrow: 1 }}
          />
        ) : null}
        {drafts > 0 ? (
          <Button
            title="Check the list"
            icon={<Feather name="edit-3" size={16} color={t.accentText} />}
            onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: r.id } })}
            style={{ flexGrow: 1 }}
          />
        ) : (
          <Button
            title={r.status === 'done' ? 'Upload more' : 'Upload its list'}
            kind={r.status === 'done' ? 'secondary' : 'primary'}
            icon={<Feather name="list" size={16} color={r.status === 'done' ? t.text : t.accentText} />}
            onPress={() => router.push({ pathname: '/receipt/import', params: { receipt: r.id } })}
            style={{ flexGrow: 1 }}
          />
        )}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  chart: { flexDirection: 'row', gap: 8, height: 120, alignItems: 'stretch' },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  track: { flex: 1, width: '100%', maxWidth: 38, justifyContent: 'flex-end' },
  monthRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4, marginTop: 10 },
  addAmount: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill },
});

const styles = StyleSheet.create({
  big: { flex: 1, height: 116, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  bigText: { fontWeight: '700', fontSize: 15, textAlign: 'center' },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 2 },
});
