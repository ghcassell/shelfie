import { addDays, diffDays } from './dates';
import type { Batch, DateKind, Day, Product, Urgency } from './types';

type BatchDates = Pick<Batch, 'expiryDate' | 'noExpiry' | 'dateKind' | 'openedOn'>;
type ProductDates = Pick<Product, 'openedShelfLifeDays' | 'warningDays'>;

/** Earlier of the printed date and opened-on + N days. The opened limit counts as use-by. */
export function effectiveExpiry(batch: BatchDates, product: ProductDates): { date: Day; kind: DateKind } | null {
  const printed = batch.noExpiry ? null : batch.expiryDate;
  const opened =
    batch.openedOn && product.openedShelfLifeDays != null ? addDays(batch.openedOn, product.openedShelfLifeDays) : null;
  if (opened && (!printed || opened <= printed)) return { date: opened, kind: 'use_by' };
  return printed ? { date: printed, kind: batch.dateKind } : null;
}

/** A date has "passed" from the day after it. */
export function urgency(batch: BatchDates, product: ProductDates, householdWarningDays: number, today: Day): Urgency {
  const eff = effectiveExpiry(batch, product);
  if (!eff) return batch.noExpiry ? 'no_expiry' : 'needs_date';
  const left = diffDays(eff.date, today);
  if (left < 0) return eff.kind === 'use_by' ? 'expired' : 'past_best';
  return left <= (product.warningDays ?? householdWarningDays) ? 'expiring_soon' : 'fine';
}

const RANK: Record<Urgency, number> = { expired: 0, past_best: 1, expiring_soon: 2, fine: 3, needs_date: 4, no_expiry: 5 };

/** Larder order: Expired, Past best, Expiring soon, rest by date, no-expiry last. */
export function compareUrgency(
  a: { urgency: Urgency; date: Day | null; name: string },
  b: { urgency: Urgency; date: Day | null; name: string },
): number {
  return (
    RANK[a.urgency] - RANK[b.urgency] ||
    (a.date ?? '').localeCompare(b.date ?? '') ||
    a.name.localeCompare(b.name)
  );
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Pill text; null means no pill (Fine, No expiry). */
export function pillText(state: Urgency, date: Day | null, today: Day): string | null {
  switch (state) {
    case 'expired': return 'Expired';
    case 'past_best': return 'Past best';
    case 'needs_date': return 'Needs a date';
    case 'expiring_soon': {
      const left = diffDays(date!, today);
      return left === 0 ? 'Today' : `${days(left)} left`;
    }
    default: return null;
  }
}

/** Screen-reader status, e.g. "expires in 2 days". */
export function spokenStatus(state: Urgency, date: Day | null, today: Day): string {
  if (state === 'needs_date') return 'needs a date';
  if (state === 'no_expiry' || !date) return 'no expiry';
  const left = diffDays(date, today);
  if (state === 'expired') return 'expired';
  if (state === 'past_best') return 'past best';
  return left === 0 ? 'expires today' : `expires in ${days(left)}`;
}

/** "Semi-skimmed milk, 1 litre, fridge, expires in 2 days" */
export const rowLabel = (name: string, amount: string, location: string, status: string) =>
  [name, amount, location.toLowerCase(), status].filter(Boolean).join(', ');

/** "3 expiring soon, 1 expired"; null when the Daily digest should not fire. */
export function digestText(states: Urgency[]): string | null {
  const n = (u: Urgency) => states.filter((s) => s === u).length;
  const parts = [
    [n('expiring_soon'), 'expiring soon'],
    [n('expired'), 'expired'],
    [n('past_best'), 'past best'],
  ].filter(([c]) => c) as [number, string][];
  return parts.length ? parts.map(([c, l]) => `${c} ${l}`).join(', ') : null;
}
