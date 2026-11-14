import type { BaseUnit, Product } from './types';

export interface ReceiptLine {
  name: string;
  quantity: number;
  pricePence: number | null; // line total
  ticked: boolean; // false for ignore-list lines
}

const IGNORE = /carrier|bag for life|\bbags?\b|discount|sub\s*-?total|\btotal\b|balance|loyalty|clubcard|nectar|points|change|\bcash\b|\bcard\b|visa|master\s*card|debit|credit|contactless|\bvat\b|saving|coupon|voucher|multibuy|price cut|deposit|rounding|\bdue\b|tender/i;

export const isIgnored = (name: string) => IGNORE.test(name);

/** One OCR text line with its position, as ML Kit reports it. */
export interface OcrLine { text: string; x: number; y: number; height: number }

/** Till receipts print name left and price right; OCR returns them as separate lines. Rejoin by row. */
export function rowsFromOcr(lines: OcrLine[]): string[] {
  const rows: { y: number; parts: OcrLine[] }[] = [];
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const mid = l.y + l.height / 2;
    const row = rows.find((r) => Math.abs(r.y - mid) < l.height * 0.6);
    if (row) row.parts.push(l);
    else rows.push({ y: mid, parts: [l] });
  }
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' '));
}

const pence = (s: string) => Math.round(parseFloat(s) * 100);

/** On-device parse: lines ending in a price are items; "2 x 1.50" style lines set the previous item's quantity. */
export function parseReceipt(rows: string[]): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const raw of rows) {
    const row = raw.replace(/\s+/g, ' ').trim();
    const qty = row.match(/^(\d+)\s*(?:x|@)\s*£?\d+[.,]\d{2}/i);
    if (qty && out.length) { out[out.length - 1].quantity = +qty[1]; continue; }
    if (/\d\s*kg\s*@/i.test(row)) continue; // loose-weight detail line
    const m = row.match(/^(.*?[A-Za-z].*?)\s+£?(-?\d+[.,]\d{2})\s*-?\s*[A-Z]?$/);
    if (!m) continue;
    const name = m[1].replace(/^\d{5,}\s+/, '').replace(/\s*£$/, '').trim(); // drop leading SKU codes
    const negative = /-/.test(row.slice(m[1].length));
    out.push({ name, quantity: 1, pricePence: pence(m[2].replace(',', '.').replace('-', '')), ticked: !negative && !isIgnored(name) });
  }
  return out;
}

/** Lines from the "Improve with AI" Edge Function, validated (it is outside input). */
export function linesFromAi(json: unknown): ReceiptLine[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('Unexpected AI response');
  return items
    .filter((i): i is { name: string; quantity?: unknown; price?: unknown } => typeof i?.name === 'string' && i.name.trim() !== '')
    .map((i) => {
      const price = typeof i.price === 'number' && isFinite(i.price) ? Math.round(i.price * 100) : null;
      const quantity = typeof i.quantity === 'number' && i.quantity >= 1 ? Math.round(i.quantity) : 1;
      return { name: i.name.trim(), quantity, pricePence: price, ticked: (price ?? 0) >= 0 && !isIgnored(i.name) };
    });
}

/** Key a Receipt alias is stored and looked up under. */
export const aliasKey = (line: string) => line.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** "chkn" abbreviates "chicken": same first letter, letters appear in order. */
function abbreviates(short: string, long: string): boolean {
  if (short === long) return true;
  if (short.length < 2 || short[0] !== long[0] || short.length > long.length) return false;
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

/**
 * Match a receipt line to one of the Household's own Products: remembered alias first,
 * then a fuzzy score (share of receipt words that abbreviate a word in the Product's name or brand).
 * ponytail: naive word-abbreviation score; swap for a proper string metric if matches disappoint.
 */
export function matchProduct(
  line: string,
  products: Pick<Product, 'id' | 'name' | 'brand'>[],
  aliases: { alias: string; productId: string }[],
): string | null {
  const key = aliasKey(line);
  const alias = aliases.find((a) => a.alias === key && products.some((p) => p.id === a.productId));
  if (alias) return alias.productId;

  const lineWords = words(line).filter((w) => !/^\d/.test(w));
  if (!lineWords.length) return null;
  let best: string | null = null;
  let bestScore = 0.6; // minimum to count as a match
  for (const p of products) {
    const target = words(`${p.brand ?? ''} ${p.name}`);
    const nameWords = words(p.name);
    if (!nameWords.length) continue;
    const hit = lineWords.filter((w) => target.some((t) => abbreviates(w, t))).length;
    const covered = nameWords.filter((t) => lineWords.some((w) => abbreviates(w, t))).length;
    const score = (hit / lineWords.length + covered / nameWords.length) / 2;
    if (score > bestScore) { bestScore = score; best = p.id; }
  }
  return best;
}

/** Base unit from a size in the name ("400g" = grams), else count. */
export function guessUnit(text: string): { baseUnit: BaseUnit; packAmount: number; size: string | null } {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|ltr|litres?|l)\b/i);
  if (!m) return { baseUnit: 'count', packAmount: 1, size: null };
  const n = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  const size = m[0].trim();
  if (u === 'g') return { baseUnit: 'g', packAmount: n, size };
  if (u === 'kg') return { baseUnit: 'g', packAmount: n * 1000, size };
  if (u === 'ml') return { baseUnit: 'ml', packAmount: n, size };
  if (u === 'cl') return { baseUnit: 'ml', packAmount: n * 10, size };
  return { baseUnit: 'ml', packAmount: n * 1000, size };
}
