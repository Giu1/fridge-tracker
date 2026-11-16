import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarcodeModal } from '../components/BarcodeModal';
import { DateField } from '../components/DateField';
import { NutriScore } from '../components/NutriScore';
import { Photo } from '../components/Photo';
import { StoreDots, StoreFilter } from '../components/StoreChips';
import { Button, Card, Chips, Field } from '../components/ui';
import { addItem, itemsStore, updateItem } from '../lib/items';
import { parseDateInput } from '../lib/dates';
import { kvGet, kvSet } from '../lib/localdb';
import { placeLabel, usePlaces } from '../lib/places';
import { localSuggestions, lookupBarcode, rankSuggestions, searchRemote, type Suggestion } from '../lib/products';
import { storeLabels } from '../lib/stores';
import { notify } from '../lib/dialog';
import { useTheme } from '../lib/theme';
import type { Item, Location, Product } from '../lib/types';


export default function AddOrEdit() {
  const t = useTheme();
  const { id, place } = useLocalSearchParams<{ id?: string; place?: string }>();
  const { places, byId } = usePlaces();
  const [editing, setEditing] = useState<Item | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState<Location>(place || 'fridge');
  const [expires, setExpires] = useState('');
  const [notes, setNotes] = useState('');
  const [product, setProduct] = useState<Product | null>(null);

  const [stores, setStores] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Remember which supermarkets you shop at.
  useEffect(() => {
    kvGet('stores').then((v) => v && setStores(JSON.parse(v)));
  }, []);
  const changeStores = (s: string[]) => {
    setStores(s);
    kvSet('stores', JSON.stringify(s));
  };

  // Load the item when editing.
  useEffect(() => {
    if (!id) return;
    const load = () => {
      const it = itemsStore.rows().find((i) => i.id === id);
      if (!it) return false;
      setEditing(it);
      setName(it.name);
      setQuantity(it.quantity ?? '');
      setLocation(it.location);
      setExpires(it.expires_on ?? '');
      setNotes(it.notes ?? '');
      if (it.barcode || it.nutriscore) {
        setProduct({
          code: it.barcode ?? '', name: it.product_name ?? it.name, brand: it.brand, quantity: it.quantity,
          nutriscore: it.nutriscore, nova_group: it.nova_group, kcal_100g: it.kcal_100g, image_url: it.off_image_url,
          stores: [], categories: null,
        });
      }
      return true;
    };
    if (load()) return;
    // Opened straight from a link before the list was loaded: wait for it once.
    const off = itemsStore.subscribe(() => {
      if (load()) off();
    });
    return off;
  }, [id]);

  // Fuzzy suggestions: local DB instantly, then Open Food Facts (Portugal) after a short pause.
  useEffect(() => {
    const q = name.trim();
    if (!showSuggestions || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    localSuggestions(q, stores).then((s) => alive && setSuggestions(s));
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const remote = await searchRemote(q, ctrl.signal);
        const local = await localSuggestions(q, stores);
        if (alive) setSuggestions(rankSuggestions(q, [...local, ...remote], stores));
      } catch {
        // offline or aborted: local suggestions stay
      } finally {
        if (alive) setSearching(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [name, stores, showSuggestions]);

  const pick = (p: Product) => {
    setProduct(p);
    setName(p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} ${p.brand}` : p.name);
    if (!quantity && p.quantity) setQuantity(p.quantity);
    setShowSuggestions(false);
  };

  const takePhoto = async (fromLibrary: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, allowsEditing: true, aspect: [1, 1] };
    if (!fromLibrary) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return notify('Camera permission is needed to take photos.');
    }
    const res = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  };

  const onScanned = async (code: string) => {
    setScanning(false);
    setSearching(true);
    try {
      const p = await lookupBarcode(code);
      if (p) pick(p);
      else {
        notify('Not found', `Barcode ${code} is not in Open Food Facts yet. Type the name instead.`);
        setProduct({ code, name: name || code, brand: null, quantity: null, nutriscore: null, nova_group: null, kcal_100g: null, image_url: null, stores: [], categories: null });
      }
    } catch {
      notify('Offline', 'Could not look up the barcode right now.');
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    const exp = parseDateInput(expires);
    if (exp && 'error' in exp) return notify('Expiry date', `${exp.error} You can also pick it on the calendar.`);
    setSaving(true);
    const draft = {
      name: name.trim(),
      quantity: quantity.trim() || null,
      location,
      expires_on: exp ? exp.iso : null,
      notes: notes.trim() || null,
      photo_path: editing?.photo_path ?? null,
      barcode: product?.code || null,
      brand: product?.brand ?? null,
      product_name: product?.name ?? null,
      stores: product?.stores.length ? storeLabels(product.stores) : editing?.stores ?? null,
      nutriscore: product?.nutriscore ?? null,
      nova_group: product?.nova_group ?? null,
      kcal_100g: product?.kcal_100g ?? null,
      off_image_url: product?.image_url ?? null,
    };
    try {
      if (editing) await updateItem(editing, draft, photoUri);
      else await addItem(draft, photoUri);
      router.back();
    } catch (e) {
      notify('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: editing ? 'Edit' : 'Add food' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
          ) : (
            <Photo path={editing?.photo_path ?? null} fallbackUrl={product?.image_url} style={styles.photo} label={name || undefined} />
          )}
          <View style={{ flex: 1, gap: 8 }}>
            <Button title="📷  Take photo" onPress={() => takePhoto(false)} />
            <Button title="Choose from library" kind="secondary" onPress={() => takePhoto(true)} />
          </View>
        </View>

        {/* Name + fuzzy suggestions */}
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Food"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setShowSuggestions(true);
                }}
                onFocus={() => name.length >= 2 && setShowSuggestions(true)}
                placeholder="e.g. iogurte grego, leite meio gordo"
                autoCorrect={false}
              />
            </View>
            <Pressable onPress={() => setScanning(true)} style={[styles.scanBtn, { backgroundColor: t.chip, borderColor: t.border }]} accessibilityLabel="Scan barcode">
              <Text style={{ fontSize: 22 }}>▥</Text>
            </Pressable>
          </View>
          <StoreFilter selected={stores} onChange={changeStores} />

          {showSuggestions && name.trim().length >= 2 && (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={[styles.sugHeader, { borderColor: t.border }]}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>
                  {stores.length ? `PRODUCTS AT ${storeLabels(stores).toUpperCase()} FIRST` : 'PRODUCTS SOLD IN PORTUGAL'}
                </Text>
                {searching ? <ActivityIndicator size="small" color={t.accent} /> : (
                  <Pressable onPress={() => setShowSuggestions(false)} hitSlop={10}><Text style={{ color: t.muted }}>Hide</Text></Pressable>
                )}
              </View>
              {suggestions.length === 0 && !searching && (
                <Text style={{ color: t.muted, padding: 12 }}>No matches. You can still save it with just the name.</Text>
              )}
              {suggestions.slice(0, 12).map((s) => (
                <Pressable
                  key={s.code}
                  onPress={() => pick(s)}
                  style={({ pressed }) => [styles.sugRow, { borderColor: t.border, backgroundColor: pressed ? t.chip : 'transparent', opacity: s.inStore ? 1 : 0.7 }]}
                >
                  {s.image_url ? <Image source={{ uri: s.image_url }} style={styles.sugImg} contentFit="contain" /> : <View style={[styles.sugImg, { backgroundColor: t.chip }]} />}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: t.text, fontWeight: '600' }}>{s.name}</Text>
                    <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{[s.brand, s.quantity].filter(Boolean).join(' · ')}</Text>
                    <StoreDots stores={s.stores} />
                  </View>
                  <NutriScore grade={s.nutriscore} />
                </Pressable>
              ))}
            </Card>
          )}
        </View>

        {/* Selected product reference */}
        {product && !showSuggestions && (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>PRODUCT REFERENCE</Text>
              <Pressable onPress={() => setProduct(null)} hitSlop={10}><Text style={{ color: t.danger }}>Remove</Text></Pressable>
            </View>
            <Text style={{ color: t.text, fontWeight: '700' }}>{product.name}</Text>
            <Text style={{ color: t.muted }}>
              {[product.brand, product.quantity, product.kcal_100g != null ? `${product.kcal_100g} kcal/100g` : null].filter(Boolean).join(' · ')}
            </Text>
            <NutriScore grade={product.nutriscore} full />
            {product.code ? <Text style={{ color: t.muted, fontSize: 12 }}>Ref. {product.code}</Text> : null}
          </Card>
        )}

        <Field label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="e.g. 1 L, 4 units, half" />

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>WHERE</Text>
          <Chips
            value={location}
            onChange={setLocation}
            options={[
              ...places.map((p) => ({ key: p.id, label: placeLabel(byId, p.id) })),
              ...(byId.has(location) ? [] : [{ key: location, label: placeLabel(byId, location) }]),
            ]}
            trailing={{ label: '+ Place', onPress: () => router.push('/places') }}
          />
        </View>

        <DateField label="Expires" value={expires} onChange={setExpires} />

        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Opened on Monday, for the soup…" multiline style={{ minHeight: 70 }} />

        <Button title={editing ? 'Save changes' : `Add to ${byId.get(location)?.label ?? 'the house'}`} onPress={save} busy={saving} disabled={!name.trim()} />
      </ScrollView>

      <BarcodeModal visible={scanning} onClose={() => setScanning(false)} onCode={onScanned} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photo: { width: 120, height: 120, borderRadius: 14 },
  scanBtn: { width: 50, height: 50, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sugHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sugImg: { width: 44, height: 44, borderRadius: 8 },
});
