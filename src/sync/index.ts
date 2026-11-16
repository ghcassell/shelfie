import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { db } from '../db/client';
import { syncState } from '../db/schema';
import { hasDirty, syncOnce } from './engine';
import { supabaseRemote } from './remote';
import { supabase } from './supabase';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'unavailable';

let status: SyncStatus = 'idle';
let lastSynced: Date | null = null;
let snapshot: { status: SyncStatus; lastSynced: Date | null; signedOut: boolean } = { status, lastSynced, signedOut: false };
const listeners = new Set<() => void>();
const afterSync = new Set<() => void>();
/** `signedOut`: sync is unavailable because the Supabase session is gone, so only signing in again will fix it. */
const setStatus = (s: SyncStatus, signedOut = false) => {
  status = s;
  if (s === 'ok') lastSynced = new Date();
  snapshot = { status, lastSynced, signedOut };
  listeners.forEach((l) => l());
};

/** No session, and not merely because the token refresh could not reach the server. */
async function sessionLost() {
  const { data, error } = await supabase.auth.getSession();
  return !data.session && !(error && isAuthRetryableFetchError(error));
}

export const useSyncStatus = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snapshot);

/** Runs after every sync attempt (success or not), e.g. to reschedule the Daily digest. */
export const onAfterSync = (fn: () => void) => (afterSync.add(fn), () => afterSync.delete(fn));

let running: Promise<void> | null = null;

/** Push then pull. Failure (offline, or the Supabase project paused) just shows "sync unavailable". */
export function sync(): Promise<void> {
  return (running ??= (async () => {
    setStatus('syncing');
    try {
      // Checked first: without a session the server answers a pull with no rows rather than an error.
      if (await sessionLost()) return setStatus('unavailable', true);
      await syncOnce(db, supabaseRemote);
      setStatus('ok');
    } catch (e) {
      console.warn('Sync failed', e);
      setStatus('unavailable', await sessionLost().catch(() => false));
    } finally {
      running = null;
      afterSync.forEach((fn) => fn());
    }
  })());
}

/** App open/foreground, and a few seconds (debounced) after a local change. No background sync. */
export function startSyncTriggers() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const change = addDatabaseChangeListener(() => {
    clearTimeout(timer);
    // Sync's own writes land here too; hasDirty() keeps that from looping.
    timer = setTimeout(() => { if (hasDirty(db)) sync(); }, 3000);
  });
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
  sync();
  return () => { clearTimeout(timer); change.remove(); app.remove(); };
}

// --- Auth and Household ------------------------------------------------------------------

export const sendCode = async (email: string, shouldCreateUser = true) => {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser } });
  if (error) throw new Error(error.message);
};

export const verifyCode = async (email: string, token: string) => {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw new Error(error.message);
};

/** The email this phone is signed in with, read from the stored session (works offline); null when signed out. */
export const signedInEmail = async () => (await supabase.auth.getSession()).data.session?.user.email ?? null;

/** "Sign in again" after a lost session. The Household is already known, so it must be the same person. */
export async function signInAgain(email: string, token: string) {
  await verifyCode(email, token);
  const { data } = await supabase.auth.getUser();
  if (data.user?.id !== db.select().from(syncState).get()?.memberId) {
    await supabase.auth.signOut();
    throw new Error('That is a different account. Use the email this phone first signed in with.');
  }
  await sync();
}

/** Records who is signed in on this phone, then pulls the Household. False if not in a Household yet. */
export async function adoptMembership(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in');
  const { data, error } = await supabase.from('members').select('household_id').eq('id', auth.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  db.insert(syncState).values({ id: 1, householdId: data.household_id, memberId: auth.user.id })
    .onConflictDoNothing().run();
  await sync();
  return true;
}

export async function createHousehold(displayName: string) {
  const { error } = await supabase.rpc('create_household', { display_name: displayName.trim() });
  if (error) throw new Error(error.message);
  await adoptMembership();
}

export async function joinHousehold(code: string, displayName: string) {
  const { error } = await supabase.rpc('join_household', { code, display_name: displayName.trim() });
  if (error) throw new Error(error.message);
  await adoptMembership();
}

/** "Improve with AI": the only place a receipt photo leaves the phone. */
export async function improveReceipt(imageBase64: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('receipt-ai', { body: { image: imageBase64 } });
  if (error) throw new Error('Could not reach the AI service. Check your connection.');
  return data;
}
