import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { useJobs } from '../../lib/jobs';
import { useReceipts } from '../../lib/receipts';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { jobs } = useJobs();
  const toName = jobs.length;
  const { receipts } = useReceipts();
  const toCheck = receipts.filter((r) => r.status === 'drafts').length;
  const badgeStyle = { backgroundColor: t.accent, color: t.accentText, fontWeight: '700' as const };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 22 },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12, marginBottom: 6 },
        sceneStyle: { backgroundColor: t.bg },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Food', headerShown: false, tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color as string} /> }} />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Add photos',
          tabBarIcon: ({ color }) => <Feather name="camera" size={22} color={color as string} />,
          tabBarBadge: toName || undefined,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Send receipt',
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color as string} />,
          tabBarBadge: toCheck || undefined,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
    </Tabs>
  );
}
