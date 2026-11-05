import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { isConfigured } from '../lib/supabase';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const t = useTheme();
  const { ready, session, needsMfa } = useSession();

  if (!isConfigured) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>Almost there</Text>
        <Text style={{ color: t.muted, fontSize: 16 }}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a .env file (see README), then restart.
        </Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const signedIn = !!session && !needsMfa;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.bg },
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && needsMfa}>
        <Stack.Screen name="mfa" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Add food' }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="recipes" options={{ title: 'Receitas Bimby' }} />
      </Stack.Protected>
    </Stack>
  );
}
