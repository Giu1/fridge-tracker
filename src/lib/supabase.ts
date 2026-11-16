import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Only the project origin (https://<ref>.supabase.co): a URL copied from the dashboard with a path such as
// /rest/v1/ would otherwise break every request.
const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const url = (() => {
  try {
    return rawUrl ? new URL(rawUrl).origin : '';
  } catch {
    return '';
  }
})();
// The *publishable* key (sb_publishable_…) is meant to be public: row level security does the protecting.
// The old "anon" key still works until Supabase retires it. Never put the secret key (sb_secret_…) in the app:
// anyone could read it from the APK or the website and bypass every rule.
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const isSecretKey = rawKey.startsWith('sb_secret_') || rawKey.includes('service_role');
if (isSecretKey) console.error('Refusing to use a Supabase SECRET key in the app. Use the publishable key (sb_publishable_…).');
const key = isSecretKey ? '' : rawKey;

export const isConfigured = url.startsWith('https://') && key.length > 20;

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const PHOTO_BUCKET = 'fridge-photos';
