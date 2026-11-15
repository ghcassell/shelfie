import { createClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

// URL and anon key come from Expo public env (.env); see .env.example.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://not-configured.invalid', // placeholder so a build without .env still opens
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'not-configured',
  // In the browser the session lives in localStorage (supabase-js's default). The kv-store would open SQLite while
  // the app database is still opening, and expo-sqlite's web worker cannot start two opens at once.
  { auth: { storage: Platform.OS === 'web' ? undefined : Storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);
