/**
 * Demo mode: the whole app runs in this browser/phone only (no Supabase, no login, no AI).
 * On automatically when the app is built without Supabase keys; can also be chosen on the login screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfigured } from './supabase';

const KEY = 'fridge.demo';
let demo = !isConfigured;

export const isDemo = () => demo;
export const canLeaveDemo = () => isConfigured;

export async function initMode() {
  if (!isConfigured) return true;
  demo = (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';
  return demo;
}

export async function setDemo(on: boolean) {
  demo = on || !isConfigured;
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
}
