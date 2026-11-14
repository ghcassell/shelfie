import { createClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

// URL and anon key come from Expo public env (.env); see .env.example.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://not-configured.invalid', // placeholder so a build without .env still opens
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'not-configured',
  { auth: { storage: Storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);
