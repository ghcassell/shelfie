import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// enableChangeListener powers Drizzle's useLiveQuery: sync writes show up on screen with no second cache.
export const sqlite = openDatabaseSync('shelfie.db', { enableChangeListener: true });
export const db = drizzle(sqlite);
/** Only the browser has to wait for its database: see client.web.ts. */
export const dbReady: Promise<void> | null = null;
