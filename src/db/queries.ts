import { isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { toDay } from '../domain/dates';
import { ATTENTION, buildRows, type LarderRow } from '../domain/larder';
import { db } from './client';
import { batches, type BatchRow, householdSettings, locations, type ProductRow, products, usageEntries } from './schema';

export type Row = LarderRow<BatchRow, ProductRow>;

/** Live view of every Batch joined to its Product and Location, in Larder order. Sync writes show up here too. */
export function useLarder() {
  const b = useLiveQuery(db.select().from(batches).where(isNull(batches.deletedAt))).data;
  const p = useLiveQuery(db.select().from(products)).data;
  const l = useLiveQuery(db.select().from(locations).where(isNull(locations.deletedAt))).data;
  const allLocations = useLiveQuery(db.select().from(locations)).data;
  const e = useLiveQuery(db.select().from(usageEntries)).data;
  const settings = useLiveQuery(db.select().from(householdSettings)).data;
  const warningDays = settings[0]?.warningDays ?? 3;
  const today = toDay();
  return useMemo(() => {
    const all = buildRows(b, p, allLocations, e, warningDays, today);
    const larder = all.filter((r) => r.remaining > 0);
    return {
      all, // includes Finished Batches (history)
      larder,
      attention: larder.filter((r) => ATTENTION.includes(r.urgency)),
      products: p.filter((x) => !x.deletedAt),
      locations: l,
      entries: e,
      warningDays,
      today,
    };
  }, [b, p, l, allLocations, e, warningDays, today]);
}
