import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sql-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import initSqlJs from 'sql.js';
import { batches, locations, products, shoppingEntries, syncState, usageEntries } from '../db/schema';
import { type Db, DuplicateError, hasDirty, type Remote, syncOnce } from './engine';

type Row = Record<string, any>;

/** Stand-in for Supabase: server clock, unique barcode / Location name per Household. */
class FakeRemote implements Remote {
  tables = new Map<string, Map<string, Row>>();
  tick = 0;
  onUpsert?: () => void;
  private now = () => new Date(Date.UTC(2026, 10, 14, 10, 0, ++this.tick)).toISOString();
  private rows = (t: string) => this.tables.get(t) ?? this.tables.set(t, new Map()).get(t)!;
  seed(table: string, row: Row) { this.rows(table).set(row.id, { ...row, updated_at: this.now() }); }
  get = (table: string, id: string) => this.rows(table).get(id);

  async findClash(table: string, row: Row) {
    for (const r of this.rows(table).values()) {
      if (r.id === row.id || r.deleted_at || row.deleted_at) continue;
      if (table === 'products' && row.barcode && r.barcode === row.barcode) return r;
      if (table === 'locations' && r.name.toLowerCase() === row.name.toLowerCase()) return r;
    }
    return null;
  }
  async upsert(table: string, rows: Row[], insertOnly: boolean) {
    this.onUpsert?.();
    const out: Row[] = [];
    for (const row of rows) {
      if (await this.findClash(table, row)) throw new DuplicateError();
      if (insertOnly && this.rows(table).has(row.id)) continue;
      const stored = { ...row, updated_at: this.now() };
      this.rows(table).set(row.id, stored);
      out.push(stored);
    }
    return out;
  }
  async pull(table: string, since: string | null) {
    return [...this.rows(table).values()].filter((r) => !since || r.updated_at >= since);
  }
}

const H = 'house';
const product = (id: string, over: Row = {}) => ({ id, householdId: H, name: id, dirty: 1, ...over });
const location = (id: string, name: string, over: Row = {}) => ({ id, householdId: H, name, dirty: 1, ...over });
const batch = (id: string, over: Row = {}) => ({
  id, householdId: H, productId: 'p1', locationId: 'l1', startingAmount: 1, addedBy: 'm1', addedAt: 'x', dirty: 1, ...over,
});
const entry = (id: string, over: Row = {}) => ({
  id, householdId: H, batchId: 'b1', kind: 'used' as const, amount: 1, memberId: 'm1', createdAt: 'x', dirty: 1, ...over,
});

let db: Db;
let remote: FakeRemote;

beforeEach(async () => {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  const dir = join(__dirname, '../db/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  db = drizzle(sqlite);
  db.insert(syncState).values({ id: 1, householdId: H, memberId: 'm1' }).run();
  remote = new FakeRemote();
});

const one = (table: any, id: string): Row => db.select().from(table).where(eq(table.id, id)).get()!;

describe('push then pull', () => {
  test('push clears dirty and stores the server timestamp', async () => {
    db.insert(products).values(product('p1', { barcode: '5000' })).run();
    await syncOnce(db, remote);
    expect(remote.get('products', 'p1')).toMatchObject({ household_id: H, barcode: '5000', base_unit: 'count' });
    expect(remote.get('products', 'p1')).not.toHaveProperty('dirty');
    expect(one(products, 'p1')).toMatchObject({ dirty: 0, updatedAt: remote.get('products', 'p1')!.updated_at });
    expect(hasDirty(db)).toBe(false);
  });

  test('pull inserts rows from the other phone and moves the cursor', async () => {
    remote.seed('products', { id: 'p9', household_id: H, name: 'Milk', base_unit: 'ml', pack_amount: 1000, low_threshold_unit: 'base' });
    await syncOnce(db, remote);
    expect(one(products, 'p9')).toMatchObject({ name: 'Milk', baseUnit: 'ml', packAmount: 1000, dirty: 0 });
    expect(db.select().from(syncState).get()!.cursor).toBe(remote.get('products', 'p9')!.updated_at);
  });

  test('field edits are last-write-wins on the server timestamp', async () => {
    db.insert(products).values(product('p1', { name: 'Old' })).run();
    await syncOnce(db, remote);
    remote.seed('products', { ...remote.get('products', 'p1'), name: 'Renamed on the other phone' });
    await syncOnce(db, remote);
    expect(one(products, 'p1').name).toBe('Renamed on the other phone');
  });

  test('an edit made while a push is in flight stays dirty and is not overwritten by the pull', async () => {
    db.insert(products).values(product('p1', { name: 'First' })).run();
    remote.onUpsert = () => {
      remote.onUpsert = undefined;
      db.update(products).set({ name: 'Edited mid-push', dirty: 2 }).where(eq(products.id, 'p1')).run();
    };
    await syncOnce(db, remote);
    expect(one(products, 'p1')).toMatchObject({ name: 'Edited mid-push', dirty: 2 });
    await syncOnce(db, remote);
    expect(remote.get('products', 'p1')!.name).toBe('Edited mid-push');
    expect(one(products, 'p1').dirty).toBe(0);
  });

  test('tombstones sync both ways', async () => {
    db.insert(batches).values(batch('b1', { deletedAt: '2026-11-14T09:00:00Z' })).run();
    remote.seed('batches', { id: 'b2', household_id: H, product_id: 'p1', location_id: 'l1', starting_amount: 1, added_by: 'm1', added_at: 'x', deleted_at: '2026-11-14T09:00:00Z' });
    await syncOnce(db, remote);
    expect(remote.get('batches', 'b1')!.deleted_at).toBeTruthy();
    expect(one(batches, 'b2').deletedAt).toBeTruthy();
  });
});

describe('Usage entries are append-only', () => {
  test('both phones using the last tin offline leaves two entries', async () => {
    db.insert(usageEntries).values(entry('mine')).run();
    remote.seed('usage_entries', { id: 'theirs', household_id: H, batch_id: 'b1', kind: 'used', amount: 1, member_id: 'm2', created_at: 'x' });
    await syncOnce(db, remote);
    expect(db.select().from(usageEntries).all().map((e) => e.id).sort()).toEqual(['mine', 'theirs']);
    expect(remote.get('usage_entries', 'mine')).toBeTruthy();
  });

  test('sync never rewrites an existing entry; it only records the server timestamp', async () => {
    db.insert(usageEntries).values(entry('e1', { amount: 5, dirty: 0 })).run();
    remote.seed('usage_entries', { id: 'e1', household_id: H, batch_id: 'b1', kind: 'wasted', amount: 99, member_id: 'm2', created_at: 'y' });
    await syncOnce(db, remote);
    expect(one(usageEntries, 'e1')).toMatchObject({ kind: 'used', amount: 5, updatedAt: remote.get('usage_entries', 'e1')!.updated_at });
  });
});

describe('duplicate merge on push', () => {
  test('barcode clash: keep the older (server) Product, repoint references, tombstone the local one', async () => {
    remote.seed('products', { id: 'theirs', household_id: H, name: 'Beans', barcode: '5000', base_unit: 'g', pack_amount: 415, low_threshold_unit: 'base' });
    db.insert(products).values(product('mine', { name: 'Baked beans', barcode: '5000' })).run();
    db.insert(batches).values(batch('b1', { productId: 'mine' })).run();
    db.insert(shoppingEntries).values({ id: 's1', householdId: H, name: 'Beans', productId: 'mine', addedBy: 'm1', dirty: 1 }).run();

    await syncOnce(db, remote);

    expect(one(products, 'theirs')).toMatchObject({ name: 'Beans', dirty: 0 });
    expect(one(products, 'mine').deletedAt).toBeTruthy();
    expect(one(batches, 'b1').productId).toBe('theirs');
    expect(one(shoppingEntries, 's1').productId).toBe('theirs');
    expect(remote.get('batches', 'b1')!.product_id).toBe('theirs');
    expect(remote.get('products', 'mine')!.deleted_at).toBeTruthy();
    expect(hasDirty(db)).toBe(false);
  });

  test('Location name clash is case-insensitive', async () => {
    remote.seed('locations', { id: 'theirs', household_id: H, name: 'Fridge' });
    db.insert(locations).values(location('mine', 'fridge')).run();
    db.insert(batches).values(batch('b1', { locationId: 'mine' })).run();
    await syncOnce(db, remote);
    expect(one(batches, 'b1').locationId).toBe('theirs');
    expect(one(locations, 'mine').deletedAt).toBeTruthy();
    expect(remote.get('batches', 'b1')!.location_id).toBe('theirs');
  });

  test('Products without a barcode never merge', async () => {
    remote.seed('products', { id: 'theirs', household_id: H, name: 'Bananas', base_unit: 'count', pack_amount: 1, low_threshold_unit: 'base' });
    db.insert(products).values(product('mine', { name: 'Bananas' })).run();
    await syncOnce(db, remote);
    expect(one(products, 'mine').deletedAt).toBeNull();
    expect(db.select().from(products).all()).toHaveLength(2);
  });

  test('one clash does not block other rows in the same push', async () => {
    remote.seed('products', { id: 'theirs', household_id: H, name: 'Beans', barcode: '5000', base_unit: 'count', pack_amount: 1, low_threshold_unit: 'base' });
    db.insert(products).values([product('mine', { barcode: '5000' }), product('other', { barcode: '6000' })]).run();
    await syncOnce(db, remote);
    expect(remote.get('products', 'other')).toBeTruthy();
  });
});
