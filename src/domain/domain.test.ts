import { canUndo, countedEntries, formatAmount, packsRemaining, planSplit, remaining, reversalOf } from './amount';
import { addDays, addMonths, diffDays } from './dates';
import { compareUrgency, digestText, effectiveExpiry, pillText, rowLabel, spokenStatus, urgency } from './expiry';
import { buildBackup, checkBackup, toCsv } from './export';
import { allowLookup, productFromOff } from './off';
import { shoppingTrigger, totalStock } from './stock';
import type { Batch, UsageEntry } from './types';
import { wasteReport, wasteTotalText } from './waste';

const TODAY = '2026-11-14';

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', productId: 'p1', locationId: 'l1', startingAmount: 1600, packCount: 4, expiryDate: '2026-12-01',
  noExpiry: false, dateKind: 'best_before', openedOn: null, pricePence: 400, addedBy: 'm1',
  addedAt: '2026-11-01T10:00:00Z', splitFromBatchId: null, ...over,
});
let n = 0;
const entry = (over: Partial<UsageEntry> = {}): UsageEntry => ({
  id: `e${++n}`, batchId: 'b1', kind: 'used', amount: 400, memberId: 'm1', createdAt: '2026-11-10T12:00:00',
  wasteReason: null, reversesEntryId: null, splitBatchId: null, updatedAt: null, ...over,
});
const product = { openedShelfLifeDays: null as number | null, warningDays: null as number | null };

describe('dates', () => {
  test('day arithmetic', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-11-16', TODAY)).toBe(2);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-14', 12)).toBe('2027-11-14');
  });
});

describe('remaining amount', () => {
  test('starting amount minus all entries; used, wasted and split all reduce', () => {
    const es = [entry(), entry({ kind: 'wasted', amount: 100 }), entry({ kind: 'split', amount: 400 })];
    expect(remaining(batch(), es)).toBe(700);
  });
  test('corrected is signed: negative gives stock back', () => {
    expect(remaining(batch(), [entry(), entry({ kind: 'corrected', amount: -400 })])).toBe(1600);
    expect(remaining(batch(), [entry({ kind: 'corrected', amount: 100 })])).toBe(1500);
  });
  test('below zero shows as zero (both used the last tin offline)', () => {
    expect(remaining(batch({ startingAmount: 400, packCount: 1 }), [entry(), entry()])).toBe(0);
  });
  test('ignores entries of other Batches', () => {
    expect(remaining(batch(), [entry({ batchId: 'other' })])).toBe(1600);
  });
  test('duplicate reversals: only the earliest by server timestamp counts', () => {
    const used = entry({ id: 'u' });
    const late = entry({ id: 'r-late', kind: 'corrected', amount: -400, reversesEntryId: 'u', updatedAt: '2026-11-11T09:00:00Z' });
    const early = entry({ id: 'r-early', kind: 'corrected', amount: -400, reversesEntryId: 'u', updatedAt: '2026-11-11T08:00:00Z' });
    const unsynced = entry({ id: 'r-new', kind: 'corrected', amount: -400, reversesEntryId: 'u' });
    expect(countedEntries([used, late, early, unsynced]).map((e) => e.id)).toEqual(['u', 'r-early']);
    expect(remaining(batch(), [used, late, early, unsynced])).toBe(1600);
  });
  test('pack count shown = remaining / pack size', () => {
    expect(packsRemaining(batch(), 1600)).toBe(4);
    expect(packsRemaining(batch(), 1000)).toBe(3);
    expect(packsRemaining(batch(), 0)).toBe(0);
  });
  test('undo: in full, at most once, never for splits or reversals', () => {
    const used = entry({ id: 'u' });
    const rev = { ...reversalOf(used, { id: 'r', memberId: 'm2', now: 'now' }), updatedAt: null };
    expect(rev).toMatchObject({ kind: 'corrected', amount: -400, reversesEntryId: 'u', batchId: 'b1', memberId: 'm2' });
    expect(canUndo(used, [used])).toBe(true);
    expect(canUndo(used, [used, rev])).toBe(false);
    expect(canUndo(rev, [used, rev])).toBe(false);
    expect(canUndo(entry({ kind: 'split' }), [])).toBe(false);
  });
  test('formatAmount', () => {
    expect([formatAmount(400, 'g'), formatAmount(1500, 'g'), formatAmount(1000, 'ml'), formatAmount(2000, 'ml'), formatAmount(6, 'count')])
      .toEqual(['400 g', '1.5 kg', '1 litre', '2 litres', '6']);
  });
});

describe('split on open', () => {
  const ids = { newBatchId: 'b2', entryId: 's1', memberId: 'm2', today: TODAY, now: 'now' };
  const { newBatch, entry: split } = planSplit(batch(), 400, ids);
  test('new Batch copies Product, Location, date, Date kind, added-by; own opened-on', () => {
    expect(newBatch).toMatchObject({
      id: 'b2', productId: 'p1', locationId: 'l1', expiryDate: '2026-12-01', dateKind: 'best_before', addedBy: 'm1',
      openedOn: TODAY, splitFromBatchId: 'b1', startingAmount: 400, packCount: 1,
    });
  });
  test('new price = price x portion / starting amount', () => expect(newBatch.pricePence).toBe(100));
  test('unknown price stays unknown', () => expect(planSplit(batch({ pricePence: null }), 400, ids).newBatch.pricePence).toBeNull());
  test('split entry on the original carries amount and split_batch_id', () => {
    expect(split).toMatchObject({ batchId: 'b1', kind: 'split', amount: 400, splitBatchId: 'b2' });
    expect(remaining(batch(), [{ ...split, updatedAt: null }])).toBe(1200);
  });
});

describe('effective expiry and urgency', () => {
  test('earlier of printed date and opened-on + N days; opened limit counts as use-by', () => {
    const opened = batch({ openedOn: '2026-11-10' });
    expect(effectiveExpiry(opened, { ...product, openedShelfLifeDays: 3 })).toEqual({ date: '2026-11-13', kind: 'use_by' });
    expect(effectiveExpiry(opened, { ...product, openedShelfLifeDays: 60 })).toEqual({ date: '2026-12-01', kind: 'best_before' });
    expect(effectiveExpiry(opened, product)).toEqual({ date: '2026-12-01', kind: 'best_before' });
  });
  test('states', () => {
    const u = (b: Partial<Batch>, p = product) => urgency(batch(b), p, 3, TODAY);
    expect(u({ expiryDate: '2026-11-13', dateKind: 'use_by' })).toBe('expired');
    expect(u({ expiryDate: '2026-11-13' })).toBe('past_best');
    expect(u({ expiryDate: TODAY, dateKind: 'use_by' })).toBe('expiring_soon'); // not passed until tomorrow
    expect(u({ expiryDate: '2026-11-17' })).toBe('expiring_soon');
    expect(u({ expiryDate: '2026-11-18' })).toBe('fine');
    expect(u({ expiryDate: null })).toBe('needs_date');
    expect(u({ expiryDate: null, noExpiry: true })).toBe('no_expiry');
    expect(u({ openedOn: '2026-11-01' }, { ...product, openedShelfLifeDays: 5 })).toBe('expired');
    expect(u({ expiryDate: null, noExpiry: true, openedOn: '2026-11-13' }, { ...product, openedShelfLifeDays: 3 })).toBe('expiring_soon');
  });
  test('per-Product warning days override the Household window', () => {
    expect(urgency(batch({ expiryDate: '2026-11-20' }), { ...product, warningDays: 7 }, 3, TODAY)).toBe('expiring_soon');
    expect(urgency(batch({ expiryDate: '2026-11-16' }), { ...product, warningDays: 1 }, 3, TODAY)).toBe('fine');
  });
  test('Larder order: Expired, Past best, Expiring soon, rest by date, no-expiry last', () => {
    const rows = [
      { urgency: 'no_expiry', date: null, name: 'Salt' },
      { urgency: 'fine', date: '2027-01-01', name: 'Rice' },
      { urgency: 'needs_date', date: null, name: 'Eggs' },
      { urgency: 'fine', date: '2026-12-01', name: 'Beans' },
      { urgency: 'expiring_soon', date: '2026-11-15', name: 'Milk' },
      { urgency: 'past_best', date: '2026-11-01', name: 'Crisps' },
      { urgency: 'expired', date: '2026-11-12', name: 'Ham' },
    ] as const;
    expect([...rows].sort(compareUrgency).map((r) => r.name)).toEqual(['Ham', 'Crisps', 'Milk', 'Beans', 'Rice', 'Eggs', 'Salt']);
  });
  test('pill and screen-reader text', () => {
    expect(pillText('expiring_soon', '2026-11-17', TODAY)).toBe('3 days left');
    expect(pillText('expiring_soon', '2026-11-15', TODAY)).toBe('1 day left');
    expect(pillText('fine', '2027-01-01', TODAY)).toBeNull();
    expect(pillText('no_expiry', null, TODAY)).toBeNull();
    expect(rowLabel('Semi-skimmed milk', '1 litre', 'Fridge', spokenStatus('expiring_soon', '2026-11-16', TODAY)))
      .toBe('Semi-skimmed milk, 1 litre, fridge, expires in 2 days');
  });
  test('Daily digest text; Needs a date never triggers it', () => {
    expect(digestText(['expiring_soon', 'expiring_soon', 'expiring_soon', 'expired', 'fine'])).toBe('3 expiring soon, 1 expired');
    expect(digestText(['past_best'])).toBe('1 past best');
    expect(digestText(['needs_date', 'fine', 'no_expiry'])).toBeNull();
  });
});

describe('shopping list triggers', () => {
  const withThreshold = { lowThreshold: 2, lowThresholdUnit: 'packs' as const, packAmount: 400 };
  const none = { lowThreshold: null, lowThresholdUnit: 'base' as const, packAmount: 400 };
  const line = (remaining: number, urgency: any = 'fine') => ({ remaining, urgency });
  test('total stock excludes Expired, includes Past best', () => {
    expect(totalStock([line(400), line(400, 'past_best'), line(400, 'expired')])).toBe(800);
  });
  test('auto-add only when crossing from above to at-or-below the threshold', () => {
    expect(shoppingTrigger(withThreshold, [line(1200)], [line(800)], false)).toBe('add');
    expect(shoppingTrigger(withThreshold, [line(800)], [line(400)], false)).toBeNull(); // already below: deleted entry stays deleted
    expect(shoppingTrigger(withThreshold, [line(1600)], [line(1200)], false)).toBeNull();
  });
  test('never duplicates an existing entry', () => {
    expect(shoppingTrigger(withThreshold, [line(1200)], [line(800)], true)).toBeNull();
  });
  test('no threshold: prompt when the last Batch finishes', () => {
    expect(shoppingTrigger(none, [line(400)], [line(0)], false)).toBe('prompt');
    expect(shoppingTrigger(none, [line(400), line(400)], [line(0), line(400)], false)).toBeNull();
    expect(shoppingTrigger(none, [line(0)], [line(0)], false)).toBeNull();
  });
});

describe('waste report', () => {
  const batches = [batch(), batch({ id: 'b2', productId: 'p2', pricePence: null, startingAmount: 6, packCount: 6 })];
  const w = (over: Partial<UsageEntry>) => entry({ kind: 'wasted', wasteReason: 'expired', ...over });
  test('cost = wasted amount / Batch size x price; unpriced counts but adds nothing', () => {
    const r = wasteReport('2026-11', [w({ amount: 800 }), w({ batchId: 'b2', amount: 2, wasteReason: 'didnt_like_it' })], batches);
    expect(r).toMatchObject({ totalPence: 200, wastedBatches: 2, unpricedBatches: 1 });
    expect(r.byProduct.map((p) => p.productId)).toEqual(['p1', 'p2']);
    expect(r.byReason).toEqual([{ reason: 'expired', pence: 200, entries: 1 }, { reason: 'didnt_like_it', pence: 0, entries: 1 }]);
    expect(wasteTotalText(r)).toBe('at least £2.00, 1 wasted Batch has no price');
  });
  test('net of corrections, current month only, used entries ignored', () => {
    const undone = w({ id: 'undone' });
    const es = [undone, entry({ kind: 'corrected', amount: -400, reversesEntryId: 'undone' }), w({ createdAt: '2026-10-31T12:00:00' }), entry()];
    expect(wasteReport('2026-11', es, batches)).toMatchObject({ totalPence: 0, wastedBatches: 0 });
    expect(wasteReport('2026-10', es, batches)).toMatchObject({ totalPence: 100, wastedBatches: 1 });
  });
});

describe('export and restore checks', () => {
  const data = {
    products: [{ id: 'p1' }], batches: [{ id: 'b1', productId: 'p1' }], locations: [{ id: 'l1' }],
    usageEntries: [{ id: 'e1', batchId: 'b1', reversesEntryId: null }, { id: 'e2', batchId: 'b1', reversesEntryId: 'e1' }],
    shoppingEntries: [], receiptAliases: [], householdSettings: [],
  };
  const json = (over: object = {}) => JSON.stringify({ ...buildBackup(data, '2026-11-14T10:00:00Z'), ...over });
  test('round trip', () => expect(checkBackup(json())).toEqual({ ok: true, data }));
  test('refuses a higher schemaVersion', () => expect(checkBackup(json({ schemaVersion: 2 })).ok).toBe(false));
  test('refuses junk', () => {
    expect(checkBackup('not json').ok).toBe(false);
    expect(checkBackup('{}').ok).toBe(false);
    expect(checkBackup(json({ products: 'x' })).ok).toBe(false);
  });
  test('referential integrity: Batch to Product, Usage to Batch, reverses_entry_id to entry', () => {
    expect(checkBackup(json({ batches: [{ id: 'b1', productId: 'gone' }] })).ok).toBe(false);
    expect(checkBackup(json({ usageEntries: [{ id: 'e1', batchId: 'gone' }] })).ok).toBe(false);
    expect(checkBackup(json({ usageEntries: [{ id: 'e1', batchId: 'b1', reversesEntryId: 'gone' }] })).ok).toBe(false);
  });
  test('CSV: BOM, quoting', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"'], [1, null]])).toBe('﻿a,b\r\n"x, y","say ""hi"""\r\n1,\r\n');
  });
});

describe('Open Food Facts', () => {
  test('maps a hit, guessing the Base unit from the quantity', () => {
    const hit = { status: 1, product: { product_name: 'Baked Beans', brands: 'Heinz,Kraft', quantity: '415 g', categories: 'Canned foods, Beans', image_front_small_url: 'https://x/y.jpg' } };
    expect(productFromOff(hit)).toEqual({ name: 'Baked Beans', brand: 'Heinz', size: '415 g', category: 'Canned foods', imageUrl: 'https://x/y.jpg', baseUnit: 'g', packAmount: 415 });
  });
  test('not found or unnamed is null', () => {
    expect(productFromOff({ status: 0 })).toBeNull();
    expect(productFromOff({ status: 1, product: { brands: 'x' } })).toBeNull();
  });
  test('15 lookups a minute', () => {
    const recent = Array.from({ length: 15 }, (_, i) => i * 1000);
    expect(allowLookup(recent, 30000)).toBeNull();
    expect(allowLookup(recent, 61000)).toHaveLength(14); // 13 still inside the minute, plus this one
  });
});
