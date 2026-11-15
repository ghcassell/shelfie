import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Every synced row: UUID id, server-assigned updated_at, deleted_at tombstone, local dirty flag.
// `dirty` is 0 when clean, else the local time of the last change, so a push only clears
// the flag if the row was not edited again while the push was in flight.
const synced = {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  updatedAt: text('updated_at'), // null until first pushed
  deletedAt: text('deleted_at'),
  dirty: integer('dirty').notNull().default(0),
};

export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  inviteCode: text('invite_code').notNull(),
  updatedAt: text('updated_at'),
});

export const members = sqliteTable('members', {
  id: text('id').primaryKey(), // Supabase auth user id
  householdId: text('household_id').notNull(),
  displayName: text('display_name').notNull(),
  updatedAt: text('updated_at'),
});

export const householdSettings = sqliteTable('household_settings', {
  ...synced, // id = household id: a single record
  warningDays: integer('warning_days').notNull().default(3),
});

export const locations = sqliteTable('locations', {
  ...synced,
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const products = sqliteTable('products', {
  ...synced,
  name: text('name').notNull(),
  brand: text('brand'),
  size: text('size'),
  category: text('category'),
  imageUrl: text('image_url'),
  barcode: text('barcode'),
  baseUnit: text('base_unit', { enum: ['g', 'ml', 'count'] }).notNull().default('count'),
  packAmount: real('pack_amount').notNull().default(1),
  openedShelfLifeDays: integer('opened_shelf_life_days'),
  warningDays: integer('warning_days'),
  lowThreshold: real('low_threshold'),
  lowThresholdUnit: text('low_threshold_unit', { enum: ['base', 'packs'] }).notNull().default('base'),
});

export const batches = sqliteTable('batches', {
  ...synced,
  productId: text('product_id').notNull(),
  locationId: text('location_id').notNull(),
  startingAmount: real('starting_amount').notNull(),
  packCount: integer('pack_count').notNull().default(1),
  expiryDate: text('expiry_date'),
  noExpiry: integer('no_expiry', { mode: 'boolean' }).notNull().default(false),
  dateKind: text('date_kind', { enum: ['use_by', 'best_before'] }).notNull().default('best_before'),
  openedOn: text('opened_on'),
  pricePence: integer('price_pence'),
  addedBy: text('added_by').notNull(),
  addedAt: text('added_at').notNull(),
  splitFromBatchId: text('split_from_batch_id'),
});

// Immutable and append-only: never updated or deleted, including by sync. No deleted_at.
export const usageEntries = sqliteTable('usage_entries', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  updatedAt: text('updated_at'),
  dirty: integer('dirty').notNull().default(0),
  batchId: text('batch_id').notNull(),
  kind: text('kind', { enum: ['used', 'wasted', 'corrected', 'split'] }).notNull(),
  amount: real('amount').notNull(),
  memberId: text('member_id').notNull(),
  createdAt: text('created_at').notNull(),
  wasteReason: text('waste_reason', { enum: ['expired', 'went_off_early', 'didnt_like_it', 'other'] }),
  reversesEntryId: text('reverses_entry_id'),
  splitBatchId: text('split_batch_id'),
});

export const shoppingEntries = sqliteTable('shopping_entries', {
  ...synced,
  name: text('name').notNull(),
  productId: text('product_id'),
  quantity: text('quantity'),
  addedBy: text('added_by').notNull(), // Member id or 'auto'
  ticked: integer('ticked', { mode: 'boolean' }).notNull().default(false),
});

export const receiptAliases = sqliteTable('receipt_aliases', {
  ...synced,
  alias: text('alias').notNull(),
  productId: text('product_id').notNull(),
});

// Device only, one row: who is signed in on this phone and the pull cursor.
export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  householdId: text('household_id').notNull(),
  memberId: text('member_id').notNull(),
  cursor: text('cursor'), // highest server updated_at seen
});

export type ProductRow = typeof products.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type UsageEntryRow = typeof usageEntries.$inferSelect;
export type ShoppingEntryRow = typeof shoppingEntries.$inferSelect;
