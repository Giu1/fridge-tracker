import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { useJobs } from '../../lib/jobs';
import { useReceipts } from '../../lib/receipts';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { jobs } = useJobs();
  const toName = jobs.length;
  const { receipts } = useReceipts();
  const toCheck = receipts.filter((r) => r.status === 'drafts').length;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 22 },
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
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Send receipt',
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color as string} />,
          tabBarBadge: toCheck || undefined,
        }}
      />
    </Tabs>
  );
}
