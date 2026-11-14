import { addDays, diffDays, isValidDate, lastDayOfMonth, makeDay } from './dates';
import type { DateKind, Day } from './types';

export interface ParsedDate {
  date: Day;
  kind: DateKind | null; // set when an expiry keyword says so
  warning: 'past' | 'far' | null; // flagged at confirmation, never rejected
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthNo = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
const year = (s: string) => (s.length === 2 ? 2000 + +s : +s);

type KeywordKind = DateKind | null | 'not'; // 'not' = a date that is printed on packs but is not the expiry
const KEYWORDS: [RegExp, KeywordKind][] = [
  [/use\s*by/gi, 'use_by'],
  [/best\s*before(?:\s*end)?/gi, 'best_before'],
  [/\bbbe?\b/gi, 'best_before'],
  [/\bexp(?:iry|ires)?\b/gi, null],
  [/\b(?:packed|pkd|produced|mfg|mfd|baked|frozen)\b|display\s*until|sell\s*by/gi, 'not'],
];

interface Candidate { date: Day; start: number; weak: boolean; key?: { dist: number; kind: KeywordKind } }

// OCR swaps O for 0 and I/l/| for 1. Fixed only where the letter touches a digit and no other letter; same length, so positions still line up.
const digitise = (t: string) =>
  t.replace(/(^|[^a-zA-Z])([oOIl|])(?=\d)|(\d)([oOIl|])(?![a-zA-Z])/g, (_, a, x, b, y) => (a ?? b) + (/o/i.test(x ?? y) ? '0' : '1'));

// OCR misreads month letters as lookalikes (NOU, 0CT, JU1). Lookalikes are folded together, and a three-character word that then spells a month is that month.
const LOOKALIKE: Record<string, string> = { v: 'u', 0: 'o', 1: 'l', i: 'l', 5: 's', 8: 'b', 6: 'g' };
const fold = (w: string) => w.toLowerCase().replace(/[v01i586]/g, (c) => LOOKALIKE[c]);
const FOLDED = MONTHS.map(fold);
const fixMonths = (t: string) =>
  t.replace(/\b[a-z0-9]{3}\b/gi, (w) => { const i = FOLDED.indexOf(fold(w)); return i < 0 ? w : MONTHS[i]; });

/**
 * Every plausible expiry date in the text, best guess first (at most 4).
 * UK only: day-first always, two-digit year = 20YY, month-only = last day of month.
 */
export function parseExpiryDates(text: string, today: Day): ParsedDate[] {
  const found: Candidate[] = [];
  let rest = digitise(fixMonths(text));
  // Each pattern consumes its matches so a looser one cannot re-read the same digits.
  // toDates gives every reading of a match; a second reading (or a weak pattern) is a long shot.
  const scan = (re: RegExp, toDates: (m: RegExpExecArray) => (Day | null)[], weak = false) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const start = args[args.length - 2] as number;
      // An impossible date (31/02) is still consumed, so its digits are not re-read as something else.
      const dates = toDates(m).filter((d): d is Day => !!d);
      dates.forEach((date, i) => found.push({ date, start, weak: weak || i > 0 }));
      return ' '.repeat(m[0].length);
    });
  };
  const full = (y: number, m: number, d: number) => (isValidDate(y, m, d) ? makeDay(y, m, d) : null);
  const monthEnd = (y: number, m: number) => (m >= 1 && m <= 12 ? makeDay(y, m, lastDayOfMonth(y, m)) : null);
  // No year printed: the next occurrence, unless it only just passed (then flag it as past).
  const guessYear = (m: number, d: number) => {
    const y = +today.slice(0, 4);
    const thisYear = full(y, m, d);
    return thisYear && diffDays(thisYear, today) < -183 ? full(y + 1, m, d) : thisYear;
  };

  // OCR splits a date across lines and pads the punctuation, so any one mark with space around it, or just space, separates.
  const SEP = '(?:\\s*[\\/.\\-]\\s*|\\s+)';
  scan(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => [full(+m[1], +m[2], +m[3])]); // ISO
  // Four-digit years first: in "08 06 08 08 2026" the year pins down which numbers are the date.
  for (const y of ['\\d{4}', '\\d{2}']) {
    scan(new RegExp(`\\b(\\d{1,2})${SEP}(\\d{1,2})${SEP}(${y})\\b`, 'g'), (m) => [full(year(m[3]), +m[2], +m[1])]);
    scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?${SEP}?${MON}${SEP}?(${y})\\b`, 'gi'), (m) => [full(year(m[3]), monthNo(m[2]), +m[1])]);
  }
  scan(new RegExp(`\\b${MON}${SEP}?(\\d{4})\\b`, 'gi'), (m) => [monthEnd(+m[2], monthNo(m[1]))]);
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?${SEP}?${MON}\\b`, 'gi'), (m) => [guessYear(monthNo(m[2]), +m[1])]);
  scan(new RegExp(`\\b${MON}${SEP}?(\\d{2})\\b`, 'gi'), (m) => [monthEnd(year(m[2]), monthNo(m[1]))]);
  scan(/\b(\d{1,2})[\/.\-](\d{4})\b/g, (m) => [monthEnd(+m[2], +m[1])]); // MM/YYYY
  scan(/\b(\d{1,2})[\/.\-](\d{2})\b/g, (m) => [guessYear(+m[2], +m[1]), monthEnd(year(m[2]), +m[1])]); // DD/MM, and MM/YY
  // ponytail: DDMMYY with no separators also matches lot codes, so it is a long shot. Teach it real codes if they keep showing up.
  scan(/\b(\d{2})(\d{2})(\d{4}|\d{2})\b/g, (m) => [full(year(m[3]), +m[2], +m[1])], true);

  // A keyword labels the first date printed after it; an expiry keyword with none after it labels the date just before.
  for (const [re, kind] of KEYWORDS) for (const k of text.matchAll(re)) {
    const end = k.index + k[0].length;
    const after = found.filter((c) => c.start >= end).sort((a, b) => a.start - b.start)[0];
    const before = kind === 'not' ? undefined : found.filter((c) => c.start < end).sort((a, b) => b.start - a.start)[0];
    const target = after ?? before;
    if (!target) continue;
    const dist = after ? after.start - end : 1000 + (end - target.start);
    for (const c of found) if (c.start === target.start && (!c.key || dist < c.key.dist)) c.key = { dist, kind };
  }

  const warn = (d: Day) => (d < today ? 'past' : d > addDays(today, 3653) ? 'far' : null);
  const score = (c: Candidate) =>
    (c.key ? (c.key.kind === 'not' ? -100 : 100) : 0) - (warn(c.date) ? 50 : 0) - (c.weak ? 20 : 0);
  const seen = new Set<Day>();
  return found
    .filter((c) => !(c.weak && warn(c.date))) // a long shot that is also implausible is noise
    // Ties go to the later date: a pack with two dates shows production then expiry.
    .sort((a, b) => score(b) - score(a) || (a.date < b.date ? 1 : -1))
    .filter((c) => !seen.has(c.date) && seen.add(c.date))
    .slice(0, 4)
    .map((c) => ({ date: c.date, kind: c.key && c.key.kind !== 'not' ? c.key.kind : null, warning: warn(c.date) }));
}
