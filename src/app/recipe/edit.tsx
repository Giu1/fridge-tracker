import { Feather } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ItemPicker } from '../../components/ItemPicker';
import { Button, Card, Field, Label } from '../../components/ui';
import { notify } from '../../lib/dialog';
import { useItems } from '../../lib/items';
import { cookidooSearchUrl, ingredientWord, itemFuse, saveRecipe, stockFor, useRecipes } from '../../lib/recipes';
import { radius, useTheme } from '../../lib/theme';
import type { Item, Recipe, RecipeIngredient } from '../../lib/types';

/** Save (or edit) a Cookidoo recipe and link its ingredients to what is stored at home. */
export default function EditRecipe() {
  const t = useTheme();
  const { id, items: itemParam } = useLocalSearchParams<{ id?: string; items?: string }>();
  const { items } = useItems();
  const { recipes } = useRecipes();
  const fuse = useMemo(() => itemFuse(items), [items]);

  const [existing, setExisting] = useState<Recipe | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [newName, setNewName] = useState('');
  const [picking, setPicking] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [inited, setInited] = useState(false);

  // Fill the form once: from the recipe being edited, or from the items picked on the previous screen.
  useEffect(() => {
    if (inited) return;
    if (id) {
      const r = recipes.find((x) => x.id === id);
      if (!r) return;
      setExisting(r);
      setTitle(r.title);
      setUrl(r.url ?? '');
      setNotes(r.notes ?? '');
      setIngredients(r.ingredients);
      setInited(true);
    } else if (itemParam) {
      if (!items.length) return;
      const picked = itemParam.split(',').map((x) => items.find((i) => i.id === x)).filter((i): i is Item => !!i);
      setIngredients(picked.map((i) => ({ name: ingredientWord(i), item_id: i.id })));
      setInited(true);
    } else setInited(true);
  }, [id, itemParam, items, recipes, inited]);

  const update = (i: number, patch: Partial<RecipeIngredient>) =>
    setIngredients((list) => list.map((g, n) => (n === i ? { ...g, ...patch } : g)));

  const addTyped = () => {
    const name = newName.trim();
    if (!name) return;
    // Link automatically when something in the house clearly matches.
    const hit = stockFor({ name, item_id: null }, items, fuse);
    setIngredients((list) => [...list, { name, item_id: hit?.item.id ?? null }]);
    setNewName('');
  };

  const onPick = (item: Item | null) => {
    if (picking === 'new' && item) setIngredients((list) => [...list, { name: ingredientWord(item), item_id: item.id }]);
    else if (typeof picking === 'number') update(picking, { item_id: item?.id ?? null });
    setPicking(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const pending = newName.trim() ? [...ingredients, { name: newName.trim(), item_id: null }] : ingredients;
      const r = await saveRecipe({ title, url, notes, ingredients: pending }, existing);
      if (existing) router.back();
      else router.replace({ pathname: '/recipe/[id]', params: { id: r.id } });
    } catch (e) {
      notify('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const searchTerms = ingredients.slice(0, 3).map((g) => g.name);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: existing ? 'Edit recipe' : 'Save recipe' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Field label="Recipe" value={title} onChangeText={setTitle} placeholder="e.g. Risotto de cogumelos" maxLength={200} />

        <View style={{ gap: 6 }}>
          <Field
            label="Cookidoo link"
            value={url}
            onChangeText={setUrl}
            placeholder="https://cookidoo.pt/recipes/recipe/pt-PT/r…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable onPress={() => Linking.openURL(cookidooSearchUrl(searchTerms)).catch(() => {})}>
            <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13 }}>
              Open Cookidoo{searchTerms.length ? ` for “${searchTerms.join(' ')}”` : ''}, then Share › Copy link →
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 8 }}>
          <Label>Ingredients</Label>
          {ingredients.map((g, i) => {
            const stock = stockFor(g, items, fuse);
            return (
              <Card key={i} style={{ padding: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={g.name}
                    onChangeText={(v) => update(i, { name: v })}
                    style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
                    accessibilityLabel={`Ingredient ${i + 1}`}
                  />
                  <Pressable onPress={() => setIngredients((l) => l.filter((_, n) => n !== i))} hitSlop={8} accessibilityLabel={`Remove ${g.name}`}>
                    <Feather name="x" size={18} color={t.muted} />
                  </Pressable>
                </View>
                <Pressable onPress={() => setPicking(i)} style={[styles.link, { backgroundColor: stock ? t.accentSoft : t.chip }]}>
                  <Feather name={stock ? 'link' : 'link-2'} size={14} color={stock ? t.accent : t.muted} />
                  <Text numberOfLines={1} style={{ color: stock ? t.accent : t.muted, fontSize: 13, flex: 1, fontWeight: stock ? '600' : '400' }}>
                    {stock
                      ? `${stock.how === 'match' ? 'Probably ' : ''}${stock.item.name}`
                      : g.item_id
                        ? 'Linked item was used up · link another'
                        : 'Not in the house · link an item'}
                  </Text>
                </Pressable>
              </Card>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={addTyped}
              placeholder="Add ingredient, e.g. natas"
              placeholderTextColor={t.muted}
              returnKeyType="done"
              style={[styles.input, { color: t.text, backgroundColor: t.card, borderColor: t.border }]}
            />
            <Button title="Add" kind="secondary" onPress={addTyped} disabled={!newName.trim()} />
          </View>
          <Button title="Add from the house" kind="ghost" icon={<Feather name="plus" size={16} color={t.accent} />} onPress={() => setPicking('new')} />
        </View>

        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Serves 4, use less salt…" multiline style={{ minHeight: 70 }} />

        <Button title={existing ? 'Save changes' : 'Save recipe'} onPress={save} busy={saving} disabled={!title.trim()} />
      </ScrollView>

      <ItemPicker
        visible={picking !== null}
        items={items}
        initial={typeof picking === 'number' ? ingredients[picking]?.name ?? '' : ''}
        allowUnlink={typeof picking === 'number' && !!ingredients[picking]?.item_id}
        onPick={onPick}
        onClose={() => setPicking(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm },
});
