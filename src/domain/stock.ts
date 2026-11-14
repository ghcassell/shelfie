import type { Product, Urgency } from './types';

export interface StockLine { remaining: number; urgency: Urgency }

/** Unfinished Batches in base unit, excluding Expired, including Past best. */
export const totalStock = (lines: StockLine[]) =>
  lines.filter((l) => l.urgency !== 'expired').reduce((s, l) => s + l.remaining, 0);

export const thresholdInBase = (p: Pick<Product, 'lowThreshold' | 'lowThresholdUnit' | 'packAmount'>) =>
  p.lowThreshold == null ? null : p.lowThresholdUnit === 'packs' ? p.lowThreshold * p.packAmount : p.lowThreshold;

/**
 * What a stock change does to the shopping list:
 * - 'add': total crossed the Running-low threshold (above to at-or-below)
 * - 'prompt': the last Batch of a Product with no threshold just finished
 * Never duplicates an existing entry for the Product.
 */
export function shoppingTrigger(
  product: Pick<Product, 'lowThreshold' | 'lowThresholdUnit' | 'packAmount'>,
  before: StockLine[],
  after: StockLine[],
  hasEntry: boolean,
): 'add' | 'prompt' | null {
  if (hasEntry) return null;
  const threshold = thresholdInBase(product);
  if (threshold != null) return totalStock(before) > threshold && totalStock(after) <= threshold ? 'add' : null;
  const unfinished = (ls: StockLine[]) => ls.filter((l) => l.remaining > 0).length;
  return unfinished(before) > 0 && unfinished(after) === 0 ? 'prompt' : null;
}
