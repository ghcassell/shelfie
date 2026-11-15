import { isNull } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { db } from '../../db/client';
import { isEmptyForRestore, loadRows, readBackupData, restoreBackup } from '../../db/repositories';
import { shoppingEntries, usageEntries } from '../../db/schema';
import { toDay } from '../../domain/dates';
import { pillText } from '../../domain/expiry';
import { buildBackup, checkBackup, toCsv } from '../../domain/export';
import { WASTE_REASONS } from '../../domain/types';
import { wasteCost } from '../../domain/waste';
import { pickJsonText, shareFile } from '../../ui/platform';

/** JSON backup, for restore. */
export const exportJson = () =>
  shareFile(`shelfie-backup-${toDay()}.json`, JSON.stringify(buildBackup(readBackupData(), new Date().toISOString())), 'application/json');

const pounds = (pence: number | null) => (pence == null ? null : (pence / 100).toFixed(2));

/** CSV, for reading only (never imported): a zip of larder.csv, usage.csv and shopping-list.csv. */
export function exportCsv() {
  const today = toDay();
  const rows = loadRows(today);
  const byBatch = new Map(rows.map((r) => [r.batch.id, r]));

  const larder = toCsv(
    ['Product', 'Brand', 'Location', 'Remaining', 'Unit', 'Expiry date', 'Date kind', 'Opened on', 'Added', 'Status', 'Price'],
    rows.map((r) => [
      r.product.name, r.product.brand, r.locationName, r.remaining, r.product.baseUnit, r.batch.expiryDate,
      r.batch.noExpiry ? 'no expiry' : r.batch.dateKind === 'use_by' ? 'use by' : 'best before', r.batch.openedOn, toDay(r.batch.addedAt),
      r.remaining <= 0 ? 'Finished' : pillText(r.urgency, r.date, today) ?? (r.urgency === 'no_expiry' ? 'No expiry' : 'Fine'), pounds(r.batch.pricePence),
    ]),
  );
  const usage = toCsv(
    ['Date', 'Product', 'Kind', 'Amount', 'Unit', 'Waste reason', 'Cost'],
    db.select().from(usageEntries).all().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((e) => {
      const r = byBatch.get(e.batchId);
      return [
        toDay(e.createdAt), r?.product.name, e.kind, e.amount, r?.product.baseUnit,
        WASTE_REASONS.find((w) => w.value === e.wasteReason)?.label, e.kind === 'wasted' && r ? pounds(wasteCost(e, r.batch)) : null,
      ];
    }),
  );
  const shopping = toCsv(
    ['Name', 'Quantity', 'In basket'],
    db.select().from(shoppingEntries).where(isNull(shoppingEntries.deletedAt)).all().map((e) => [e.name, e.quantity, e.ticked ? 'yes' : 'no']),
  );
  const zip = zipSync({ 'larder.csv': strToU8(larder), 'usage.csv': strToU8(usage), 'shopping-list.csv': strToU8(shopping) });
  return shareFile(`shelfie-${today}.zip`, zip, 'application/zip');
}

/** Restore a JSON backup. Returns one plain error, or null on success (or if the picker was cancelled). */
export async function restoreFromFile(): Promise<string | null> {
  if (!isEmptyForRestore()) return 'Restore only works into an empty Household: this one already has Products, Batches or history.';
  const text = await pickJsonText();
  if (text == null) return null;
  const checked = checkBackup(text);
  if (!checked.ok) return checked.error;
  try {
    restoreBackup(checked.data);
    return null;
  } catch {
    return 'This backup is damaged and cannot be restored.'; // the transaction rolled back: nothing changed
  }
}