import * as Haptics from 'expo-haptics';
import { useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { radius, useTheme } from '../lib/theme';

export const tick = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/** Pressable that gently shrinks while pressed: the "fluid" feel used everywhere. */
export function Tap({ style, children, onPress, scaleTo = 0.97, haptic = true, ...rest }: PressableProps & {
  style?: StyleProp<ViewStyle>; children: ReactNode; scaleTo?: number; haptic?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // Layout props (flex, width, alignSelf, margins) must sit on the outer Pressable to affect the parent row/grid.
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: Record<string, unknown> = { ...flat };
  for (const k of ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'maxWidth', 'minWidth', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'right', 'bottom', 'left', 'zIndex'] as const) {
    if (k in flat) {
      (outer as Record<string, unknown>)[k] = (flat as Record<string, unknown>)[k];
      delete inner[k];
    }
  }
  if ('flex' in outer || 'flexGrow' in outer || 'width' in outer) inner.flexGrow = 1;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      {...rest}
      style={outer}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      onPress={(e) => {
        if (haptic) tick();
        onPress?.(e);
      }}
    >
      <Animated.View style={[inner as ViewStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', busy, disabled, style, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; icon?: ReactNode;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, secondary: t.chip, danger: t.dangerSoft, ghost: 'transparent' }[kind];
  const fg = { primary: t.accentText, secondary: t.text, danger: t.danger, ghost: t.accent }[kind];
  return (
    <Tap onPress={onPress} disabled={disabled || busy} style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Tap>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }, props.style]}
      />
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: t.chip }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              tick();
              onChange(o.key);
            }}
            style={[styles.segItem, on && { backgroundColor: t.elevated, ...styles.shadow }]}
          >
            <Text style={{ color: on ? t.text : t.muted, fontWeight: on ? '700' : '500', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

/** Centre content and cap its width so the web version looks good on a laptop too. */
export function Page({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: 720, alignSelf: 'center' }, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  btn: { minHeight: 50, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: '700', fontSize: 16 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 4 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: radius.sm + 2, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
});
