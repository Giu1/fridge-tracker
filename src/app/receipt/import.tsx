import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Chips, Label, Page } from '../../components/ui';
import { useCategories } from '../../lib/categories';
import { notify } from '../../lib/dialog';
import { readText } from '../../lib/files';
import { placeLabel, usePlaces } from '../../lib/places';
import { AI_PROMPT, parseReceiptList } from '../../lib/receiptList';
import { importLines, useReceipts } from '../../lib/receipts';
import { radius, useTheme } from '../../lib/theme';

const EXAMPLE = `[
  {"name": "Leite meio gordo Mimosa", "amount": 6, "place": "Fridge", "category": "Dairy"},
  {"name": "Pão de forma", "amount": 1, "expires_in_days": 5}
]`;

/** Upload the list made from a receipt: paste it or pick the file. Every line becomes a draft to check. */
export default function ImportList() {
  const t = useTheme();
  const { receipt: receiptId } = useLocalSearchParams<{ receipt?: string }>();
  const { receipts } = useReceipts();
  const receipt = receiptId ? receipts.find((r) => r.id === receiptId) : undefined;
  const { places, byId } = usePlaces();
  const { categories } = useCategories();
  const [text, setText] = useState('');
  const [place, setPlace] = useState<string>('fridge');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const parsed = useMemo(() => parseReceiptList(text), [text]);
  const defaultPlace = byId.has(place) ? place : places[0]?.id ?? 'fridge';

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      setText(await readText(res.assets[0].uri));
    } catch (e) {
      notify('Could not read that file', (e as Error).message);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const id = await importLines(receiptId ?? null, parsed.lines, { places, categories, defaultPlace });
      router.replace({ pathname: '/receipt/[id]', params: { id } });
    } catch (e) {
      notify('Could not create the drafts', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Page style={{ gap: 14 }}>
          <Text style={{ color: t.muted, lineHeight: 20 }}>
            {receipt ? `For ${receipt.title || receipt.file_name || 'this receipt'}. ` : ''}
            Paste the list or pick the file (JSON, CSV or one product per line). You will check and correct every line
            before anything is added.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Pick a file" kind="secondary" icon={<Feather name="paperclip" size={16} color={t.text} />} onPress={pickFile} style={{ flex: 1 }} />
            {text ? <Button title="Clear" kind="ghost" onPress={() => setText('')} /> : null}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={`Paste the list here, e.g.\n\n${EXAMPLE}\n\nor\n6 x Leite meio gordo\n2 x Pão`}
            placeholderTextColor={t.muted}
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              minHeight: 200, maxHeight: 360, borderWidth: 1, borderRadius: radius.md, padding: 12, textAlignVertical: 'top',
              color: t.text, backgroundColor: t.card, borderColor: t.border, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13,
            }}
          />

          {text.trim() ? (
            <Card style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontWeight: '700' }}>
                {parsed.lines.length} product{parsed.lines.length === 1 ? '' : 's'} found ({parsed.format === 'lines' ? 'one per line' : parsed.format.toUpperCase()})
              </Text>
              {parsed.lines.slice(0, 6).map((l, i) => (
                <Text key={i} numberOfLines={1} style={{ color: t.muted }}>
                  {l.amount} × {l.name}
                </Text>
              ))}
              {parsed.lines.length > 6 && <Text style={{ color: t.muted }}>…and {parsed.lines.length - 6} more</Text>}
              {parsed.skipped.length > 0 && (
                <Text style={{ color: t.warn }}>
                  {parsed.skipped.length} line{parsed.skipped.length === 1 ? '' : 's'} not understood: {parsed.skipped.slice(0, 3).join(' | ')}
                </Text>
              )}
            </Card>
          ) : null}

          <View style={{ gap: 6 }}>
            <Label>Place, when the list doesn't say</Label>
            <Chips value={defaultPlace} onChange={setPlace} options={places.map((p) => ({ key: p.id, label: placeLabel(byId, p.id) }))} />
          </View>

          <Button
            title={parsed.lines.length ? `Create ${parsed.lines.length} draft${parsed.lines.length === 1 ? '' : 's'} and check them` : 'Create drafts'}
            onPress={create}
            busy={busy}
            disabled={!parsed.lines.length}
          />

          <Pressable onPress={() => setShowHelp((v) => !v)} hitSlop={6}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>{showHelp ? 'Hide' : 'Show'} the list format and a prompt for your AI</Text>
          </Pressable>
          {showHelp && (
            <Card style={{ gap: 8 }}>
              <Label>Prompt (copy it with the receipt)</Label>
              <Text selectable style={{ color: t.text, fontSize: 13, lineHeight: 19 }}>{AI_PROMPT}</Text>
              <Label>Formats</Label>
              <Text selectable style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>
                JSON: an array of objects with name (required), amount (whole number, default 1), place, category, expires
                (a date) or expires_in_days, notes.{'\n'}
                CSV: a header line with those names, separated by , ; tab or |.{'\n'}
                Lines: "6 x Leite", "Leite x6", "Leite; 6" or just "Leite".{'\n'}
                Place and category are matched to yours by name; anything unknown is left for you to set.
              </Text>
            </Card>
          )}
        </Page>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
