import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { canUndo, planSplit, remaining, reversalOf } from '../domain/amount';
import { toDay } from '../domain/dates';
import type { BackupData } from '../domain/export';
import { buildRows, type LarderRow } from '../domain/larder';
import type { ProductDraft } from '../domain/off';
import { aliasKey } from '../domain/receipt';
import { shoppingTrigger, type StockLine } from '../domain/stock';
import type { WasteReason } from '../domain/types';
import { db } from './client';
import {
  batches, type BatchRow, householdSettings, locations, type ProductRow, products, receiptAliases, shoppingEntries,
  syncState, usageEntries,
} from './schema';

// Every write marks its row dirty (local time of change) for the next push.
const dirty = () => ({ dirty: Date.now() });
const nowIso = () => new Date().toISOString();

export function session() {
  const s = db.select().from(syncState).get();
  if (!s) throw new Error('Not signed in');
  return s;
}
const base = () => ({ id: randomUUID(), householdId: session().householdId, ...dirty() });

// --- Reads -------------------------------------------------------------------------------

export const warningDays = () => db.select().from(householdSettings).get()?.warningDays ?? 3;

/** All live Batches joined and in Larder order; the non-hook twin of useLarder(). */
export function loadRows(today = toDay()): LarderRow<BatchRow, ProductRow>[] {
  return buildRows(
    db.select().from(batches).where(isNull(batches.deletedAt)).all(),
    db.select().from(products).all(),
    db.select().from(locations).all(),
    db.select().from(usageEntries).all(),
    warningDays(),
    today,
  );
}

const stockLines = (productId: string): StockLine[] => loadRows().filter((r) => r.batch.productId === productId);

export const findProductByBarcode = (barcode: string) =>
  db.select().from(products).where(and(eq(products.barcode, barcode), isNull(products.deletedAt))).get();

// --- Locations ---------------------------------------------------------------------------

/** Unique per Household, case-insensitive: returns the existing Location when the name is taken. */
export function addLocation(name: string): string {
  const clean = name.trim();
  const existing = db.select().from(locations)
    .where(and(isNull(locations.deletedAt), sql`lower(${locations.name}) = ${clean.toLowerCase()}`)).get();
  if (existing) return existing.id;
  const last = db.select({ n: sql<number | null>`max(${locations.sortOrder})` }).from(locations).get()?.n ?? -1;
  const row = { ...base(), name: clean, sortOrder: last + 1 };
  db.insert(locations).values(row).run();
  return row.id;
}

/** Live Locations in the order the Household chose; ties (never reordered) keep the order they were added. */
export const locationOrder = [locations.sortOrder, sql`rowid`] as const;

/** Moves a Location one place up (-1) or down (1), renumbering so every live Location has its own place. */
export function moveLocation(id: string, by: -1 | 1) {
  const live = db.select().from(locations).where(isNull(locations.deletedAt)).orderBy(...locationOrder).all();
  const from = live.findIndex((l) => l.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= live.length) return;
  [live[from], live[to]] = [live[to], live[from]];
  db.transaction((tx) => {
    live.forEach((l, i) => {
      if (l.sortOrder !== i) tx.update(locations).set({ sortOrder: i, ...dirty() }).where(eq(locations.id, l.id)).run();
    });
  });
}

export const renameLocation = (id: string, name: string) =>
  db.update(locations).set({ name: name.trim(), ...dirty() }).where(eq(locations.id, id)).run();

/** Refuses while Batches still live there. */
export function deleteLocation(id: string): boolean {
  if (loadRows().some((r) => r.batch.locationId === id && r.remaining > 0)) return false;
  db.update(locations).set({ deletedAt: nowIso(), ...dirty() }).where(eq(locations.id, id)).run();
  return true;
}

// --- Products ----------------------------------------------------------------------------

export type ProductInput = Partial<Omit<ProductRow, 'id' | 'householdId' | 'updatedAt' | 'deletedAt' | 'dirty'>> & { name: string };

export function addProduct(input: ProductInput): string {
  const row = { ...base(), ...input };
  db.insert(products).values(row).run();
  return row.id;
}

/** Changing packAmount re-sizes the Product's Batches, unless something was already used (then only future packs change). */
export function updateProduct(id: string, patch: Partial<ProductInput>) {
  db.transaction((tx) => {
    tx.update(products).set({ ...patch, ...dirty() }).where(eq(products.id, id)).run();
    if (patch.packAmount == null) return;
    const own = tx.select().from(batches).where(eq(batches.productId, id)).all();
    if (tx.select().from(usageEntries).all().some((e) => own.some((b) => b.id === e.batchId))) return;
    for (const b of own) tx.update(batches).set({ startingAmount: b.packCount * patch.packAmount, ...dirty() }).where(eq(batches.id, b.id)).run();
  });
}

/**
 * A Product with no barcode (a receipt made it) gets its barcode and, when Open Food Facts knows it, the photo and details.
 * Base unit and pack amount change only while nothing has been used: its Batches are then re-sized to match.
 */
export function linkBarcode(id: string, barcode: string, found?: ProductDraft) {
  if (!found) return void updateProduct(id, { barcode });
  const { baseUnit, packAmount, ...details } = found;
  const filled = Object.fromEntries(Object.entries(details).filter(([, v]) => v != null)); // never blank what is already there
  const own = db.select().from(batches).where(eq(batches.productId, id)).all();
  const used = db.select().from(usageEntries).all().some((e) => own.some((b) => b.id === e.batchId));
  db.transaction((tx) => {
    tx.update(products).set({ ...filled, barcode, ...(used ? {} : { baseUnit, packAmount }), ...dirty() }).where(eq(products.id, id)).run();
    if (!used) for (const b of own) tx.update(batches).set({ startingAmount: b.packCount * packAmount, ...dirty() }).where(eq(batches.id, b.id)).run();
  });
}

/** Testing reset: tombstones all Products and their Batches and receipt aliases in this Household. */
export function deleteAllProducts() {
  const deletedAt = nowIso();
  db.transaction((tx) => {
    tx.update(products).set({ deletedAt, ...dirty() }).where(isNull(products.deletedAt)).run();
    tx.update(batches).set({ deletedAt, ...dirty() }).where(isNull(batches.deletedAt)).run();
    tx.update(receiptAliases).set({ deletedAt, ...dirty() }).where(isNull(receiptAliases.deletedAt)).run();
  });
}

// --- Batches -----------------------------------------------------------------------------

export interface BatchInput {
  productId: string;
  locationId: string | null; // null: To put away
  startingAmount: number;
  packCount: number;
  expiryDate: string | null;
  noExpiry: boolean;
  dateKind: 'use_by' | 'best_before';
  pricePence: number | null;
}

/** Adding a Batch of a Product removes every shopping list entry linked to it, ticked or not. */
export function addBatch(input: BatchInput): string {
  const row = { ...base(), ...input, addedBy: session().memberId, addedAt: nowIso() };
  db.transaction((tx) => {
    tx.insert(batches).values(row).run();
    tx.update(shoppingEntries).set({ deletedAt: nowIso(), ...dirty() })
      .where(and(eq(shoppingEntries.productId, input.productId), isNull(shoppingEntries.deletedAt))).run();
  });
  return row.id;
}

/** Same barcode and date as the Batch just saved: more packs on it instead of a new Batch. */
export function bumpPackCount(batchId: string, packAmount: number, packs = 1) {
  db.update(batches)
    .set({ packCount: sql`${batches.packCount} + ${packs}`, startingAmount: sql`${batches.startingAmount} + ${packAmount * packs}`, ...dirty() })
    .where(eq(batches.id, batchId)).run();
}

export const updateBatch = (
  id: string,
  patch: Partial<Pick<BatchRow, 'expiryDate' | 'noExpiry' | 'dateKind' | 'locationId' | 'openedOn' | 'pricePence'>>,
) => db.update(batches).set({ ...patch, ...dirty() }).where(eq(batches.id, id)).run();

/** Mistaken adds only: a tombstone, synced and kept. */
export const deleteBatch = (id: string) =>
  db.update(batches).set({ deletedAt: nowIso(), ...dirty() }).where(eq(batches.id, id)).run();

// --- Usage entries (append-only) ---------------------------------------------------------

/**
 * Runs a stock change for one Product and applies the shopping list rules to it.
 * Returns 'prompt' when the UI should ask "Add to shopping list?".
 */
function withShoppingRules(productId: string, change: () => void): 'prompt' | null {
  const product = db.select().from(products).where(eq(products.id, productId)).get()!;
  const before = stockLines(productId);
  change();
  const hasEntry = !!db.select().from(shoppingEntries)
    .where(and(eq(shoppingEntries.productId, productId), isNull(shoppingEntries.deletedAt))).get();
  const trigger = shoppingTrigger(product, before, stockLines(productId), hasEntry);
  if (trigger === 'add') addShoppingEntry(product.name, productId, null, 'auto');
  return trigger === 'prompt' ? 'prompt' : null;
}

export function addUsage(
  batch: Pick<BatchRow, 'id' | 'productId'>,
  kind: 'used' | 'wasted' | 'corrected',
  amount: number,
  wasteReason: WasteReason | null = null,
): { entryId: string; shopping: 'prompt' | null } {
  const row = {
    ...base(), batchId: batch.id, kind, amount, memberId: session().memberId, createdAt: nowIso(),
    wasteReason: kind === 'wasted' ? wasteReason : null,
  };
  return { entryId: row.id, shopping: withShoppingRules(batch.productId, () => { db.insert(usageEntries).values(row).run(); }) };
}

/** Undo: a corrected entry that reverses the original in full, at most once. */
export function undoEntry(entryId: string) {
  const entry = db.select().from(usageEntries).where(eq(usageEntries.id, entryId)).get();
  if (!entry) return;
  const all = db.select().from(usageEntries).where(eq(usageEntries.batchId, entry.batchId)).all();
  if (!canUndo(entry, all)) return;
  const reversal = reversalOf(entry, { id: randomUUID(), memberId: session().memberId, now: nowIso() });
  db.insert(usageEntries).values({ ...reversal, householdId: entry.householdId, ...dirty() }).run();
}

/** Opening the whole Batch just sets opened-on; opening part of it splits off a new opened Batch. */
export function openBatch(batch: BatchRow, portion: number) {
  const entries = db.select().from(usageEntries).where(eq(usageEntries.batchId, batch.id)).all();
  if (portion >= remaining(batch, entries)) return updateBatch(batch.id, { openedOn: toDay() });
  const { newBatch, entry } = planSplit(batch, portion, {
    newBatchId: randomUUID(), entryId: randomUUID(), memberId: session().memberId, today: toDay(), now: nowIso(),
  });
  db.transaction((tx) => {
    tx.insert(batches).values({ ...newBatch, householdId: batch.householdId, updatedAt: null, deletedAt: null, ...dirty() }).run();
    tx.insert(usageEntries).values({ ...entry, householdId: batch.householdId, ...dirty() }).run();
  });
}

// --- Shopping list -----------------------------------------------------------------------

/** Never duplicates an existing entry for the same Product. */
export function addShoppingEntry(name: string, productId: string | null = null, quantity: string | null = null, addedBy?: string) {
  if (productId && db.select().from(shoppingEntries)
    .where(and(eq(shoppingEntries.productId, productId), isNull(shoppingEntries.deletedAt))).get()) return;
  db.insert(shoppingEntries).values({ ...base(), name: name.trim(), productId, quantity, addedBy: addedBy ?? session().memberId }).run();
}

export const setTicked = (id: string, ticked: boolean) =>
  db.update(shoppingEntries).set({ ticked, ...dirty() }).where(eq(shoppingEntries.id, id)).run();

export const deleteShoppingEntry = (id: string) =>
  db.update(shoppingEntries).set({ deletedAt: nowIso(), ...dirty() }).where(eq(shoppingEntries.id, id)).run();

export const clearTicked = () =>
  db.update(shoppingEntries).set({ deletedAt: nowIso(), ...dirty() })
    .where(and(eq(shoppingEntries.ticked, true), isNull(shoppingEntries.deletedAt))).run();

/**
 * Every ticked entry linked to a Product becomes a Batch (To put away, Needs a date); addBatch removes the entry.
 * Unlinked entries stay ticked. Returns how many Batches were added.
 * ponytail: always one pack; the quantity is free text ("2 tins", "500g"). Parse it if that proves annoying.
 */
export function putTickedInLarder(): number {
  const ticked = db.select({ product: products }).from(shoppingEntries)
    .innerJoin(products, eq(products.id, shoppingEntries.productId))
    .where(and(eq(shoppingEntries.ticked, true), isNull(shoppingEntries.deletedAt), isNull(products.deletedAt))).all();
  for (const { product } of ticked) {
    addBatch({
      productId: product.id, locationId: null, packCount: 1, startingAmount: product.packAmount,
      expiryDate: null, noExpiry: false, dateKind: 'best_before', pricePence: null,
    });
  }
  return ticked.length;
}

// --- Settings and aliases ----------------------------------------------------------------

export function setWarningDays(days: number) {
  const { householdId } = session();
  db.insert(householdSettings).values({ id: householdId, householdId, warningDays: days, ...dirty() })
    .onConflictDoUpdate({ target: householdSettings.id, set: { warningDays: days, ...dirty() } }).run();
}

/** Remember a confirmed receipt match so the same line maps next time. */
export function saveAlias(line: string, productId: string) {
  const alias = aliasKey(line);
  if (!alias) return;
  const existing = db.select().from(receiptAliases).where(and(eq(receiptAliases.alias, alias), isNull(receiptAliases.deletedAt))).get();
  if (existing) db.update(receiptAliases).set({ productId, ...dirty() }).where(eq(receiptAliases.id, existing.id)).run();
  else db.insert(receiptAliases).values({ ...base(), alias, productId }).run();
}

// --- Export / restore --------------------------------------------------------------------

const BACKUP = {
  products, batches, locations, usageEntries, shoppingEntries, receiptAliases, householdSettings,
} as const;

export function readBackupData(): BackupData {
  const strip = (rows: Record<string, unknown>[]) => rows.map(({ dirty: _d, updatedAt: _u, householdId: _h, ...r }) => r);
  return Object.fromEntries(
    Object.entries(BACKUP).map(([name, table]) => [name, strip(db.select().from(table).all())]),
  ) as BackupData;
}

/** Restore is only allowed into an empty Household: no Products, Batches or Usage entries. */
export const isEmptyForRestore = () =>
  [products, batches, usageEntries].every((t) => db.select({ n: sql<number>`count(*)` }).from(t).get()!.n === 0);

/** One transaction, original ids kept, every row dirty so it is pushed to the Household. */
export function restoreBackup(data: BackupData) {
  const { householdId } = session();
  db.transaction((tx) => {
    for (const [name, table] of Object.entries(BACKUP)) {
      for (const r of data[name as keyof typeof BACKUP]) {
        const row = { ...r, householdId, updatedAt: null, ...dirty() } as any;
        // The Household settings record keeps this Household's id.
        if (table === householdSettings) row.id = householdId;
        tx.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row }).run();
      }
    }
  });
}
