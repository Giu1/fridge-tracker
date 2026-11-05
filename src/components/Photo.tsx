import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ImageStyle } from 'react-native';
import { photoUrls } from '../lib/items';
import { useTheme } from '../lib/theme';

/** Shows a fridge photo from the private bucket (falls back to the product image, then a placeholder). */
export function Photo({ path, fallbackUrl, style, label }: { path: string | null; fallbackUrl?: string | null; style: StyleProp<ImageStyle>; label?: string }) {
  const t = useTheme();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (path) photoUrls([path]).then((m) => alive && setUrl(m[path] ?? null)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  if (path || fallbackUrl) {
    return (
      <Image
        style={style}
        // cacheKey = storage path, so the photo stays on disk and shows offline even when the signed URL changes
        source={path ? (url ? { uri: url, cacheKey: path } : { cacheKey: path }) : { uri: fallbackUrl! }}
        contentFit="cover"
        cachePolicy="disk"
        transition={150}
      />
    );
  }
  return (
    <View style={[style as object, styles.placeholder, { backgroundColor: t.chip }]}>
      <Text style={{ fontSize: 28 }}>{label ? label.trim().charAt(0).toUpperCase() : '🍽'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ placeholder: { alignItems: 'center', justifyContent: 'center' } });
