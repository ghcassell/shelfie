import { isReversed } from './amount';
import { toDay } from './dates';
import type { Batch, UsageEntry, WasteReason } from './types';

export interface WasteReport {
  totalPence: number;
  wastedBatches: number;
  unpricedBatches: number; // wasted Batches with no price: total is "at least"
  byProduct: { productId: string; pence: number; entries: number }[]; // most wasted first
  byReason: { reason: WasteReason | null; pence: number; entries: number }[];
}

/** Cost of one wasted entry: amount / Batch size x price; null when the Batch has no price. */
export const wasteCost = (entry: UsageEntry, batch: Pick<Batch, 'startingAmount' | 'pricePence'>) =>
  batch.pricePence == null ? null : Math.round((entry.amount / batch.startingAmount) * batch.pricePence);

/** One calendar month ('YYYY-MM', device time) of wasted entries, net of corrections. */
export function wasteReport(
  month: string,
  entries: UsageEntry[],
  batches: Pick<Batch, 'id' | 'productId' | 'startingAmount' | 'pricePence'>[],
): WasteReport {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const wasted = entries.filter(
    (e) => e.kind === 'wasted' && toDay(e.createdAt).startsWith(month) && !isReversed(e, entries) && batchById.has(e.batchId),
  );
  const byProduct = new Map<string, { productId: string; pence: number; entries: number }>();
  const byReason = new Map<WasteReason | null, { reason: WasteReason | null; pence: number; entries: number }>();
  const seen = new Set<string>();
  const unpriced = new Set<string>();
  let totalPence = 0;
  for (const e of wasted) {
    const batch = batchById.get(e.batchId)!;
    const cost = wasteCost(e, batch);
    seen.add(batch.id);
    if (cost == null) unpriced.add(batch.id);
    totalPence += cost ?? 0;
    const p = byProduct.get(batch.productId) ?? { productId: batch.productId, pence: 0, entries: 0 };
    byProduct.set(batch.productId, { ...p, pence: p.pence + (cost ?? 0), entries: p.entries + 1 });
    const r = byReason.get(e.wasteReason) ?? { reason: e.wasteReason, pence: 0, entries: 0 };
    byReason.set(e.wasteReason, { ...r, pence: r.pence + (cost ?? 0), entries: r.entries + 1 });
  }
  const most = (a: { pence: number; entries: number }, b: { pence: number; entries: number }) =>
    b.pence - a.pence || b.entries - a.entries;
  return {
    totalPence,
    wastedBatches: seen.size,
    unpricedBatches: unpriced.size,
    byProduct: [...byProduct.values()].sort(most),
    byReason: [...byReason.values()].sort(most),
  };
}

export const formatPence = (p: number) => `£${(p / 100).toFixed(2)}`;

/** "£4.20" or "at least £4.20, 2 wasted Batches have no price" */
export const wasteTotalText = (r: WasteReport) =>
  r.unpricedBatches
    ? `at least ${formatPence(r.totalPence)}, ${r.unpricedBatches} wasted ${r.unpricedBatches === 1 ? 'Batch has' : 'Batches have'} no price`
    : formatPence(r.totalPence);
