import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '../lib/theme';
import { Tap } from './ui';

/**
 * Compact floating tab bar: a centered rounded pill (capped width so it stays
 * thumb-sized on wide web screens), with a soft accent pill behind the active tab.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View role="tablist" style={[styles.bar, { backgroundColor: t.card, borderColor: t.border }]}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          const color = focused ? t.accent : t.muted;
          const badge = options.tabBarBadge;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Tap
              key={route.key}
              role="tab"
              aria-selected={focused}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              scaleTo={0.94}
              style={[styles.tab, focused && { backgroundColor: t.accentSoft }]}
            >
              <View>
                {options.tabBarIcon?.({ focused, color, size: 21 })}
                {badge != null && (
                  <View style={[styles.badge, { backgroundColor: t.accent, borderColor: focused ? t.accentSoft : t.card }]}>
                    <Text style={[styles.badgeText, { color: t.accentText }]}>{badge}</Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '700' : '600' }]}>
                {label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  bar: {
    flexDirection: 'row', gap: 4, padding: 5, width: '100%', maxWidth: 440, alignSelf: 'center',
    borderRadius: radius.lg + 4, borderWidth: StyleSheet.hairlineWidth, elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderRadius: radius.lg },
  label: { fontSize: 11.5, letterSpacing: 0.1 },
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, paddingHorizontal: 4,
    borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
