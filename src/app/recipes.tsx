import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/ui';
import { expiryLabel } from '../lib/expiry';
import { useItems } from '../lib/items';
import { byUrgency, cookidooSearchUrl, defaultPick, ingredientWord } from '../lib/recipes';
import { notify } from '../lib/dialog';
import { useTheme } from '../lib/theme';

/** Pick a few fridge items and open a Cookidoo (Bimby, pt-PT) search for them. */
export default function Recipes() {
  const t = useTheme();
  const { items, loading } = useItems();
  const sorted = useMemo(() => byUrgency(items), [items]);

  const [picked, setPicked] = useState<string[]>([]);
  const [words, setWords] = useState<Record<string, string>>({});
  const [inited, setInited] = useState(false);

  useEffect(() => {
    if (inited || loading || !items.length) return;
    setPicked(defaultPick(sorted));
    setInited(true);
  }, [inited, loading, items.length, sorted]);

  const wordFor = (id: string) => {
    if (words[id] !== undefined) return words[id];
    const item = items.find((i) => i.id === id);
    return item ? ingredientWord(item) : '';
  };
  const terms = picked.map(wordFor).filter((w) => w.trim());
  const url = cookidooSearchUrl(terms);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const open = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      notify('Could not open Cookidoo', url);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 150, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        ListHeaderComponent={
          <Text style={{ color: t.muted, marginBottom: 6, fontSize: 14 }}>
            Pick what you want to use up. Expiring items are ticked for you. Edit a word if the product name is too specific,
            then search Cookidoo for Bimby recipes. Best results with 2 or 3 ingredients.
          </Text>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <Text style={{ color: t.muted, textAlign: 'center', marginTop: 40 }}>Add some food first.</Text>
          )
        }
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          const exp = expiryLabel(item, t);
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              style={[styles.row, { backgroundColor: t.card, borderColor: on ? t.accent : t.border }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <View style={[styles.box, { borderColor: on ? t.accent : t.muted, backgroundColor: on ? t.accent : 'transparent' }]}>
                {on && <Text style={{ color: t.accentText, fontWeight: '800', fontSize: 13 }}>✓</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>{item.name}</Text>
                {exp && <Text style={{ color: exp.color, fontSize: 12, fontWeight: '700' }}>{exp.text}</Text>}
              </View>
              {on && (
                <TextInput
                  value={wordFor(item.id)}
                  onChangeText={(v) => setWords((w) => ({ ...w, [item.id]: v }))}
                  style={[styles.word, { color: t.text, backgroundColor: t.chip }]}
                  autoCapitalize="none"
                  accessibilityLabel={`Search word for ${item.name}`}
                />
              )}
            </Pressable>
          );
        }}
      />
      <View style={[styles.footer, { backgroundColor: t.bg, borderColor: t.border }]}>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>
          {terms.length ? `Cookidoo: “${terms.join(' ')}”` : 'Nothing picked: opens Cookidoo search'}
        </Text>
        <Button title="Receitas Bimby no Cookidoo" onPress={open} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  word: { minWidth: 90, maxWidth: 140, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, fontSize: 14 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, gap: 8, borderTopWidth: 1 },
});
