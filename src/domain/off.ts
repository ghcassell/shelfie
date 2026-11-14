import { guessUnit } from './receipt';
import type { Product } from './types';

export type ProductDraft = Pick<Product, 'name' | 'brand' | 'size' | 'category' | 'imageUrl' | 'baseUnit' | 'packAmount'>;

/** Maps an Open Food Facts product response to Product fields; null when not found or unnamed. */
export function productFromOff(json: any): ProductDraft | null {
  const p = json?.product;
  const name = (p?.product_name_en || p?.product_name || '').trim();
  if (!p || json.status === 0 || !name) return null;
  const size = (p.quantity || '').trim() || null;
  const firstOf = (s: unknown) => (typeof s === 'string' ? s.split(',')[0].trim() || null : null);
  const category = firstOf(p.categories)?.replace(/^[a-z]{2}:/, '') ?? null;
  return {
    name,
    brand: firstOf(p.brands),
    size,
    category,
    imageUrl: p.image_front_small_url || p.image_front_url || null,
    ...pick(guessUnit(size ?? '')),
  };
}
const pick = ({ baseUnit, packAmount }: ReturnType<typeof guessUnit>) => ({ baseUnit, packAmount });

/**
 * The product number (GTIN) in a scanned or typed code, or null when there is none. Reads plain barcodes,
 * GS1 QR links (https://…/01/05012345678900/…) and GS1 DataMatrix ((01)05012345678900…). The check digit must add up.
 */
export function gtinFromScan(raw: string): string | null {
  const s = raw.trim();
  const digits = /^\d+$/.test(s) ? s : (s.match(/\/01\/(\d{8,14})(?!\d)/) ?? s.match(/^(?:\][A-Za-z]\d|)?\(?01\)?(\d{14})/))?.[1];
  if (!digits || ![8, 12, 13, 14].includes(digits.length)) return null;
  const sum = [...digits].reverse().reduce((t, d, i) => t + +d * (i % 2 ? 3 : 1), 0);
  if (sum % 10) return null;
  // One form per product: UPC-A and zero-padded GTIN-14 both become the 13 digits printed on UK packs.
  return digits.length === 8 ? digits : digits.replace(/^0(?=\d{13}$)/, '').padStart(13, '0');
}

/** Numbers each shop hands out for itself (own-brand, loose and weighed items). Two shops can use the same one for different things. */
export const isShopCode = (gtin: string) => (gtin.length === 8 ? /^[02]/ : /^(2|02|04)/).test(gtin);

/** Open Food Facts allows 15 product lookups a minute. Returns the kept timestamps, or null if over the limit. */
export function allowLookup(recent: number[], now: number, perMinute = 15): number[] | null {
  const kept = recent.filter((t) => now - t < 60000);
  return kept.length >= perMinute ? null : [...kept, now];
}
