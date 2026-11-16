import type { LarderRow } from './larder';

export type SortKey = 'name' | 'brand' | 'size' | 'category' | 'location' | 'date' | 'price';

const sortValue: Record<SortKey, (r: LarderRow) => string | number | null> = {
  name: (r) => r.product.name.toLowerCase(),
  brand: (r) => r.product.brand?.toLowerCase() || null,
  size: (r) => r.product.size?.toLowerCase() || null,
  category: (r) => r.product.category?.toLowerCase() || null,
  location: (r) => (r.batch.locationId ? r.locationName.toLowerCase() : null), // To put away counts as blank
  date: (r) => r.batch.expiryDate,
  price: (r) => r.batch.pricePence,
};

/** Sorted copy for the tidy table. Blanks always go last, so the rows that still need filling in sit together. */
export function sortRows<R extends LarderRow>(rows: R[], key: SortKey, descending: boolean): R[] {
  const value = sortValue[key];
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const order = typeof x === 'number' ? x - (y as number) : x.localeCompare(y as string);
    return descending ? -order : order;
  });
}

/** Pounds typed into a cell, as pence. '' clears the price (null); anything that is not a price is refused (undefined). */
export function parsePrice(text: string): number | null | undefined {
  const clean = text.trim().replace(/^£/, '').replace(',', '.');
  if (!clean) return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Math.round(parseFloat(clean) * 100) : undefined;
}
