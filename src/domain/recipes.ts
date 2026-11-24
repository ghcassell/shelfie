import { spokenStatus } from './expiry';
import type { LarderRow } from './larder';
import type { Day } from './types';

export interface Recipe { title: string; uses: string[]; missing: string[]; steps: string[] }

const MAX_ITEMS = 80;

/** One line per Product in stock, most urgent first, e.g. "Milk (expires in 2 days)". Past use-by is left out: not safe to eat. */
export function larderForAi(rows: LarderRow[], today: Day): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rows) {
    if (r.remaining <= 0 || r.urgency === 'expired' || seen.has(r.product.id)) continue;
    seen.add(r.product.id);
    lines.push(`${r.product.name} (${spokenStatus(r.urgency, r.date, today)})`);
  }
  return lines.slice(0, MAX_ITEMS);
}

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

export function recipesFromAi(json: unknown): Recipe[] {
  const recipes = (json as { recipes?: unknown })?.recipes;
  if (!Array.isArray(recipes)) throw new Error('Unexpected AI response');
  return recipes
    .filter((r) => typeof r?.title === 'string' && r.title.trim())
    .map((r) => ({ title: r.title.trim(), uses: strings(r.uses), missing: strings(r.missing), steps: strings(r.steps) }));
}
