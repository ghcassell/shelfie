import { remaining } from './amount';
import { compareUrgency, effectiveExpiry, urgency } from './expiry';
import type { Batch, Day, Product, Urgency, UsageEntry } from './types';

export interface LarderRow<B extends Batch = Batch, P extends Product = Product> {
  batch: B;
  product: P;
  locationName: string;
  remaining: number;
  urgency: Urgency;
  date: Day | null; // effective expiry
}

/**
 * Every live Batch (Finished ones included, flagged by remaining 0) joined to its Product
 * and Location, in Larder order.
 * ponytail: joins everything in memory on each change; fine for one household's pantry,
 * move to SQL if it ever gets slow.
 */
export function buildRows<B extends Batch, P extends Product>(
  batches: B[],
  products: P[],
  locations: { id: string; name: string }[],
  entries: UsageEntry[],
  warningDays: number,
  today: Day,
): LarderRow<B, P>[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const locationById = new Map(locations.map((l) => [l.id, l.name]));
  const entriesByBatch = new Map<string, UsageEntry[]>();
  for (const e of entries) entriesByBatch.set(e.batchId, [...(entriesByBatch.get(e.batchId) ?? []), e]);
  const rows: LarderRow<B, P>[] = [];
  for (const batch of batches) {
    const product = productById.get(batch.productId);
    if (!product) continue;
    rows.push({
      batch,
      product,
      locationName: locationById.get(batch.locationId) ?? '',
      remaining: remaining(batch, entriesByBatch.get(batch.id) ?? []),
      urgency: urgency(batch, product, warningDays, today),
      date: effectiveExpiry(batch, product)?.date ?? null,
    });
  }
  return rows.sort((a, b) =>
    compareUrgency({ ...a, name: a.product.name }, { ...b, name: b.product.name }),
  );
}

/** The Larder hides Finished Batches. */
export const inLarder = (rows: LarderRow[]) => rows.filter((r) => r.remaining > 0);

export const ATTENTION: Urgency[] = ['expired', 'past_best', 'expiring_soon', 'needs_date'];

/** Case-insensitive substring on Product name and brand. */
export const matchesSearch = (row: LarderRow, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || row.product.name.toLowerCase().includes(q) || (row.product.brand ?? '').toLowerCase().includes(q);
};
