import type { Day } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (day: Day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

export const makeDay = (y: number, m: number, d: number): Day => `${y}-${pad(m)}-${pad(d)}`;

/** Local calendar day of a Date or ISO timestamp. */
export function toDay(d: Date | string = new Date()): Day {
  const date = typeof d === 'string' ? new Date(d) : d;
  return makeDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(day: Day, n: number): Day {
  return new Date(utc(day) + n * 86400000).toISOString().slice(0, 10);
}

export function addMonths(day: Day, n: number): Day {
  const y = +day.slice(0, 4), m = +day.slice(5, 7) - 1 + n, d = +day.slice(8, 10);
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12 + 1;
  return makeDay(ty, tm, Math.min(d, lastDayOfMonth(ty, tm)));
}

/** a - b in whole days. */
export const diffDays = (a: Day, b: Day) => Math.round((utc(a) - utc(b)) / 86400000);

export const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const isValidDate = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m);

/** "14 Nov 2026" */
export function formatDay(day: Day): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${+day.slice(8, 10)} ${months[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}`;
}
