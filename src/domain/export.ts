// JSON backup (restorable) and CSV (reading only). Pure: the db layer supplies and applies rows.

export const SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;
export const BACKUP_TABLES = [
  'products', 'batches', 'locations', 'usageEntries', 'shoppingEntries', 'receiptAliases', 'householdSettings',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupData = Record<BackupTable, Row[]>;
export interface Backup extends BackupData { schemaVersion: number; exportedAt: string }

export const buildBackup = (data: BackupData, exportedAt: string): Backup => ({
  schemaVersion: SCHEMA_VERSION, exportedAt, ...data,
});

/** Upgrades from version N to N+1, keyed by N. Empty while the schema is at version 1. */
const MIGRATIONS: Record<number, (b: Backup) => Backup> = {};

/**
 * Checks a backup before restore: schemaVersion, then referential integrity.
 * Returns the (migrated) data, or one plain error; nothing is written on error.
 */
export function checkBackup(text: string): { ok: true; data: BackupData } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  let b: Backup;
  try { b = JSON.parse(text); } catch { return fail('This file is not a Shelfie backup.'); }
  if (!b || typeof b !== 'object' || !Number.isInteger(b.schemaVersion)) return fail('This file is not a Shelfie backup.');
  if (b.schemaVersion > SCHEMA_VERSION) return fail('This backup was made by a newer version of Shelfie. Update the app first.');
  for (let v = b.schemaVersion; v < SCHEMA_VERSION; v++) {
    if (!MIGRATIONS[v]) return fail('This backup is too old to restore.');
    b = MIGRATIONS[v](b);
  }
  for (const t of BACKUP_TABLES) {
    if (!Array.isArray(b[t]) || b[t].some((r) => !r || typeof r.id !== 'string')) return fail('This backup is damaged and cannot be restored.');
  }
  const ids = (t: BackupTable) => new Set(b[t].map((r) => r.id));
  const products = ids('products'), batches = ids('batches'), entries = ids('usageEntries');
  const broken =
    b.batches.some((r) => !products.has(r.productId)) ||
    b.usageEntries.some((r) => !batches.has(r.batchId)) ||
    b.usageEntries.some((r) => r.reversesEntryId != null && !entries.has(r.reversesEntryId));
  if (broken) return fail('This backup is damaged and cannot be restored.');
  return { ok: true, data: Object.fromEntries(BACKUP_TABLES.map((t) => [t, b[t]])) as BackupData };
}

type Cell = string | number | null | undefined;

/** RFC 4180 CSV, UTF-8 with BOM so spreadsheets read it correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (c: Cell) => {
    const s = c == null ? '' : String(c);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
