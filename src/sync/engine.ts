import { and, eq, getTableColumns, ne, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  batches, householdSettings, households, locations, members, products, receiptAliases, shoppingEntries, syncState, usageEntries,
} from '../db/schema';

export type Db = BaseSQLiteDatabase<'sync', any, any>;
type Row = Record<string, any>;

/** The server side of sync. Implemented over Supabase in remote.ts and by a fake in tests. */
export interface Remote {
  /** Upsert by id; returns the stored rows with their server updated_at. Throws DuplicateError on a unique clash. */
  upsert(table: string, rows: Row[], insertOnly: boolean): Promise<Row[]>;
  /** Rows with updated_at >= since (all rows when null). */
  pull(table: string, since: string | null): Promise<Row[]>;
  /** The live server row that `row` clashed with (same barcode / same Location name). */
  findClash(table: string, row: Row): Promise<Row | null>;
}

export class DuplicateError extends Error {}

/**
 * The server caps one response (Supabase: 1000 rows), so a pull goes page by page, each starting at the last
 * timestamp seen. `fetchPage` returns up to `pageSize` rows with updated_at >= since, oldest first.
 */
export async function pullPages(fetchPage: (since: string | null) => Promise<Row[]>, since: string | null, pageSize: number): Promise<Row[]> {
  const rows = new Map<string, Row>();
  for (;;) {
    const page = await fetchPage(since);
    const before = rows.size;
    for (const r of page) rows.set(r.id, r);
    // ponytail: stops early if a whole page shares one timestamp; the server stamps rows one by one, so that cannot happen.
    if (page.length < pageSize || rows.size === before) return [...rows.values()];
    since = page[page.length - 1].updated_at;
  }
}

interface SyncTable {
  name: string;
  table: SQLiteTable;
  push: boolean;
  insertOnly?: boolean; // Usage entries: never updated or deleted, including by sync
  /** Unique per Household: a clash on push is merged into the row already on the server. */
  references?: { table: SQLiteTable; column: string }[];
}

// Push order respects references.
export const TABLES: SyncTable[] = [
  { name: 'households', table: households, push: false },
  { name: 'members', table: members, push: false },
  { name: 'household_settings', table: householdSettings, push: true },
  { name: 'locations', table: locations, push: true, references: [{ table: batches, column: 'locationId' }] },
  {
    name: 'products', table: products, push: true,
    references: [
      { table: batches, column: 'productId' },
      { table: shoppingEntries, column: 'productId' },
      { table: receiptAliases, column: 'productId' },
    ],
  },
  { name: 'batches', table: batches, push: true },
  { name: 'usage_entries', table: usageEntries, push: true, insertOnly: true },
  { name: 'shopping_entries', table: shoppingEntries, push: true },
  { name: 'receipt_aliases', table: receiptAliases, push: true },
];

const toRemote = (table: SQLiteTable, row: Row): Row => {
  const out: Row = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (key !== 'dirty' && key !== 'updatedAt') out[col.name] = row[key];
  }
  return out;
};

const fromRemote = (table: SQLiteTable, row: Row): Row => {
  const out: Row = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (key === 'dirty') out.dirty = 0;
    else if (col.name in row) out[key] = row[col.name];
  }
  return out;
};

const col = (table: SQLiteTable, key: string) => (getTableColumns(table) as Row)[key];

/**
 * A local row clashed with one already on the server (same barcode or Location name).
 * Keep the older (server) row: store it, repoint references to it, tombstone the local one.
 */
export function mergeDuplicate(db: Db, t: SyncTable, loserId: string, winner: Row, now: number, nowIso: string) {
  db.transaction((tx) => {
    const row = fromRemote(t.table, winner);
    tx.insert(t.table).values(row).onConflictDoUpdate({ target: col(t.table, 'id'), set: row }).run();
    for (const ref of t.references ?? []) {
      tx.update(ref.table).set({ [ref.column]: winner.id, dirty: now }).where(eq(col(ref.table, ref.column), loserId)).run();
    }
    tx.update(t.table).set({ deletedAt: nowIso, dirty: now }).where(eq(col(t.table, 'id'), loserId)).run();
  });
}

async function pushTable(db: Db, remote: Remote, t: SyncTable) {
  const dirty: Row[] = db.select().from(t.table).where(ne(col(t.table, 'dirty'), 0)).all();
  if (!dirty.length) return;
  // Tables that can clash go row by row so one duplicate does not block the rest.
  const groups = t.references ? dirty.map((r) => [r]) : [dirty];
  for (const group of groups) {
    let stored: Row[];
    try {
      stored = await remote.upsert(t.name, group.map((r) => toRemote(t.table, r)), !!t.insertOnly);
    } catch (e) {
      if (!(e instanceof DuplicateError) || !t.references) throw e;
      const winner = await remote.findClash(t.name, toRemote(t.table, group[0]));
      if (!winner) throw e;
      mergeDuplicate(db, t, group[0].id, winner, Date.now(), new Date().toISOString());
      // The tombstone goes up on this same pass.
      const tomb: Row = db.select().from(t.table).where(eq(col(t.table, 'id'), group[0].id)).get()!;
      stored = await remote.upsert(t.name, [toRemote(t.table, tomb)], false);
      group[0] = tomb;
    }
    const serverTime = new Map(stored.map((r) => [r.id, r.updated_at]));
    for (const r of group) {
      // Only clear the flag if the row was not edited again while the push was in flight.
      db.update(t.table)
        .set({ dirty: 0, ...(serverTime.has(r.id) ? { updatedAt: serverTime.get(r.id) } : {}) })
        .where(and(eq(col(t.table, 'id'), r.id), eq(col(t.table, 'dirty'), r.dirty)))
        .run();
    }
  }
}

async function pullTable(db: Db, remote: Remote, t: SyncTable, since: string | null): Promise<string | null> {
  const rows = await remote.pull(t.name, since);
  let max: string | null = null;
  for (const remoteRow of rows) {
    if (!max || remoteRow.updated_at > max) max = remoteRow.updated_at;
    const row = fromRemote(t.table, remoteRow);
    const idCol = col(t.table, 'id');
    const local: Row | undefined = db.select().from(t.table).where(eq(idCol, row.id)).get();
    if (!local) db.insert(t.table).values(row).run();
    else if (t.insertOnly) db.update(t.table).set({ updatedAt: row.updatedAt }).where(eq(idCol, row.id)).run();
    else if (!local.dirty) db.update(t.table).set(row).where(eq(idCol, row.id)).run(); // server timestamp wins
    // else: a local edit is waiting; it goes up on the next push and wins by arriving later.
  }
  return max;
}

/**
 * A minute before the cursor. The server's timestamps carry microseconds ("…01.123456+00:00"), which the phone's
 * JavaScript engine may not parse, so they are cut to milliseconds first; if it still cannot be read, the cursor itself.
 */
export function overlapStart(cursor: string | null): string | null {
  if (!cursor) return cursor;
  const t = Date.parse(cursor.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(t) ? cursor : new Date(t - 60_000).toISOString();
}

/** Push dirty rows by UUID upsert, then pull rows newer than the cursor. */
export async function syncOnce(db: Db, remote: Remote) {
  for (const t of TABLES) if (t.push) await pushTable(db, remote, t);
  const state = db.select().from(syncState).get();
  if (!state) return;
  let max = state.cursor;
  // A row the other phone stamped just before the cursor can commit just after our pull, so re-pull the last minute.
  const since = overlapStart(state.cursor);
  for (const t of TABLES) {
    const seen = await pullTable(db, remote, t, since);
    if (seen && (!max || seen > max)) max = seen;
  }
  db.update(syncState).set({ cursor: max }).run();
}

export const hasDirty = (db: Db) =>
  TABLES.some((t) => t.push && db.select({ n: sql<number>`count(*)` }).from(t.table).where(ne(col(t.table, 'dirty'), 0)).get()!.n > 0);
