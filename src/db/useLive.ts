import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState } from 'react';

/**
 * Drop-in for Drizzle's useLiveQuery(...).data. Drizzle's hook starts at [] and fills in after the first effect, so every
 * screen flashed its empty state on mount. The database is synchronous, so read the first result during render instead.
 */
export function useLive<T>(query: { all(): T[] }): T[] {
  const [data, setData] = useState(() => query.all());
  useEffect(() => {
    // ponytail: reads Drizzle's internal query.config; the same thing its own useLiveQuery does
    const table = getTableConfig((query as unknown as { config: { table: SQLiteTable } }).config.table).name;
    const listener = addDatabaseChangeListener(({ tableName }) => { if (tableName === table) setData(query.all()); });
    return () => listener.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the query is rebuilt every render; the first one is enough
  return data;
}
