import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// enableChangeListener powers Drizzle's useLiveQuery: sync writes show up on screen with no second cache.
export const sqlite = openDatabaseSync('shelfie.db', { enableChangeListener: true });
export const db = drizzle(sqlite);
