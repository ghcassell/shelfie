import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, dbReady } from '../db/client';
import migrations from '../db/migrations/migrations';
import { syncState } from '../db/schema';
import { rescheduleDigest, useDigestTap } from '../features/settings/digest';
import SignInScreen from '../features/settings/SignInScreen';
import { onAfterSync, startSyncTriggers } from '../sync';
import { s } from '../ui/components';
import { color } from '../ui/theme';

export default function RootLayout() {
  const [opened, setOpened] = useState<true | Error | null>(dbReady ? null : true);
  useEffect(() => { dbReady?.then(() => setOpened(true), setOpened); }, []);
  if (opened instanceof Error) {
    return <View style={[s.screen, s.empty]}><Text style={s.error}>Shelfie could not open its database: {opened.message} If Shelfie is open in another tab, close that one and reload.</Text></View>;
  }
  return opened ? <Migrated /> : null;
}

function Migrated() {
  const { success, error } = useMigrations(db, migrations);
  if (error) return <View style={[s.screen, s.empty]}><Text style={s.error}>Shelfie could not open its database: {error.message}</Text></View>;
  if (!success) return null;
  return <App />;
}

function App() {
  const session = useLiveQuery(db.select().from(syncState));
  const signedIn = session.data.length > 0;
  const insets = useSafeAreaInsets();

  // Sync on open/foreground and after local changes; reschedule the Daily digest after every open and sync.
  useEffect(() => {
    if (!signedIn) return;
    const stopSync = startSyncTriggers();
    const stopDigest = onAfterSync(rescheduleDigest);
    return () => { stopSync(); stopDigest(); };
  }, [signedIn]);

  useDigestTap(signedIn);

  if (!session.updatedAt) return null; // first read not back yet
  return (
    // Android is edge-to-edge, so the window no longer resizes for the keyboard. Padding it here shrinks every screen's
    // ScrollView, and a shrinking ScrollView scrolls its focused input into view.
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, Platform.OS === 'web' && WEB_COLUMN]}>
      <StatusBar style="dark" />
      {signedIn ? (
        // Top inset: ScreenHeader / WizardStep. Bottom inset: here for every pushed screen; the tab bar pads itself.
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surface, paddingBottom: insets.bottom } }}>
          <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: color.surface } }} />
        </Stack>
      ) : <SignInScreen />}
    </KeyboardAvoidingView>
  );
}

// ponytail: the phone layout in a centred column. A wide table view for bulk tidying is the upgrade.
const WEB_COLUMN = { width: '100%', maxWidth: 720, alignSelf: 'center' } as const;
