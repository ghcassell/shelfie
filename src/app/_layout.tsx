import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { db } from '../db/client';
import migrations from '../db/migrations/migrations';
import { syncState } from '../db/schema';
import { rescheduleDigest } from '../features/settings/digest';
import SignInScreen from '../features/settings/SignInScreen';
import { onAfterSync, startSyncTriggers } from '../sync';
import { s } from '../ui/components';
import { color } from '../ui/theme';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  if (error) return <View style={[s.screen, s.empty]}><Text style={s.error}>Shelfie could not open its database: {error.message}</Text></View>;
  if (!success) return null;
  return <App />;
}

function App() {
  const session = useLiveQuery(db.select().from(syncState));
  const signedIn = session.data.length > 0;
  const tapped = Notifications.useLastNotificationResponse();

  // Sync on open/foreground and after local changes; reschedule the Daily digest after every open and sync.
  useEffect(() => {
    if (!signedIn) return;
    const stopSync = startSyncTriggers();
    const stopDigest = onAfterSync(rescheduleDigest);
    return () => { stopSync(); stopDigest(); };
  }, [signedIn]);

  // Tapping the Daily digest opens Needs attention.
  useEffect(() => {
    const url = tapped?.notification.request.content.data?.url;
    if (signedIn && typeof url === 'string') router.push('/attention');
  }, [tapped, signedIn]);

  if (!session.updatedAt) return null; // first read not back yet
  return (
    <>
      <StatusBar style="dark" />
      {signedIn ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surface } }} /> : <SignInScreen />}
    </>
  );
}
