import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

// In the browser SQLite runs in a worker. A synchronous open while the page loads times out before the worker has
// started, so the first open is async and the root layout waits for dbReady. After that Drizzle's sync calls work.
export let sqlite: SQLiteDatabase;
export let db: ReturnType<typeof drizzle>;
export const dbReady: Promise<void> | null = openDatabaseAsync('shelfie.db', { enableChangeListener: true })
  .then((opened) => { sqlite = opened; db = drizzle(opened); });
