import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { useJobs } from '../../lib/jobs';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { jobs } = useJobs();
  const toReview = jobs.filter((j) => j.status === 'ready').length;

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
      <Tabs.Screen name="index" options={{ title: 'Fridge', headerShown: false, tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color as string} /> }} />
      <Tabs.Screen
        name="upload"
        options={{ title: 'Add photos', tabBarIcon: ({ color }) => <Feather name="camera" size={22} color={color as string} /> }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: ({ color }) => <Feather name="check-circle" size={22} color={color as string} />,
          tabBarBadge: toReview || undefined,
          tabBarBadgeStyle: { backgroundColor: t.accent, color: t.accentText, fontWeight: '700' },
        }}
      />
    </Tabs>
  );
}
