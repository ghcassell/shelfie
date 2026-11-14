import type { BaseUnit, Batch, Day, UsageEntry } from './types';

/** Server timestamp order; entries not yet synced sort last. */
const byServerTime = (a: UsageEntry, b: UsageEntry) =>
  (a.updatedAt ?? '9999').localeCompare(b.updatedAt ?? '9999') ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

/** Drops duplicate reversals: only the earliest reversal of an entry counts. */
export function countedEntries(entries: UsageEntry[]): UsageEntry[] {
  const seen = new Set<string>();
  const dropped = new Set<string>();
  for (const e of [...entries].sort(byServerTime)) {
    if (e.kind !== 'corrected' || !e.reversesEntryId) continue;
    if (seen.has(e.reversesEntryId)) dropped.add(e.id);
    else seen.add(e.reversesEntryId);
  }
  return entries.filter((e) => !dropped.has(e.id));
}

/** Starting amount minus all counted entries of this Batch; never below zero. */
export function remaining(batch: Pick<Batch, 'id' | 'startingAmount'>, entries: UsageEntry[]): number {
  const used = countedEntries(entries.filter((e) => e.batchId === batch.id)).reduce((s, e) => s + e.amount, 0);
  return Math.max(0, batch.startingAmount - used);
}

export const isFinished = (batch: Pick<Batch, 'id' | 'startingAmount'>, entries: UsageEntry[]) =>
  remaining(batch, entries) <= 0;

export const packSize = (batch: Pick<Batch, 'startingAmount' | 'packCount'>) =>
  batch.startingAmount / Math.max(1, batch.packCount);

/** Packs still on the shelf, counting a part-used pack as one. */
export const packsRemaining = (batch: Pick<Batch, 'startingAmount' | 'packCount'>, rem: number) =>
  Math.max(0, Math.ceil(rem / packSize(batch) - 1e-9));

export const isReversed = (entry: UsageEntry, entries: UsageEntry[]) =>
  entries.some((e) => e.kind === 'corrected' && e.reversesEntryId === entry.id);

/** Undo is in full, at most once; splits and reversals themselves cannot be undone. */
export const canUndo = (entry: UsageEntry, entries: UsageEntry[]) =>
  entry.kind !== 'split' && !entry.reversesEntryId && !isReversed(entry, entries);

type NewEntry = Omit<UsageEntry, 'updatedAt'>;

export function reversalOf(entry: UsageEntry, ids: { id: string; memberId: string; now: string }): NewEntry {
  return {
    id: ids.id, batchId: entry.batchId, kind: 'corrected', amount: -entry.amount, memberId: ids.memberId,
    createdAt: ids.now, wasteReason: null, reversesEntryId: entry.id, splitBatchId: null,
  };
}

/**
 * Opening part of a Batch: a new opened Batch plus a `split` entry on the original.
 * The original's starting amount and price are never edited.
 */
export function planSplit(
  batch: Batch,
  portion: number,
  ids: { newBatchId: string; entryId: string; memberId: string; today: Day; now: string },
): { newBatch: Batch; entry: NewEntry } {
  return {
    newBatch: {
      ...batch,
      id: ids.newBatchId,
      startingAmount: portion,
      packCount: Math.max(1, Math.round(portion / packSize(batch))),
      openedOn: ids.today,
      pricePence: batch.pricePence == null ? null : Math.round((batch.pricePence * portion) / batch.startingAmount),
      splitFromBatchId: batch.id,
    },
    entry: {
      id: ids.entryId, batchId: batch.id, kind: 'split', amount: portion, memberId: ids.memberId,
      createdAt: ids.now, wasteReason: null, reversesEntryId: null, splitBatchId: ids.newBatchId,
    },
  };
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "400 g", "1.5 kg", "1 litre", "6" */
export function formatAmount(amount: number, unit: BaseUnit): string {
  if (unit === 'count') return trim(amount);
  if (amount < 1000) return `${trim(amount)} ${unit}`;
  const big = trim(amount / 1000);
  return unit === 'g' ? `${big} kg` : `${big} ${big === '1' ? 'litre' : 'litres'}`;
}

export const stepFor = (unit: BaseUnit) => (unit === 'count' ? 1 : 50);
