import { isNull } from 'drizzle-orm';
import { useLive } from './useLive';
import { useMemo } from 'react';
import { toDay } from '../domain/dates';
import { ATTENTION, buildRows, type LarderRow } from '../domain/larder';
import { db } from './client';
import { locationOrder } from './repositories';
import { batches, type BatchRow, householdSettings, locations, type ProductRow, products, usageEntries } from './schema';

export type Row = LarderRow<BatchRow, ProductRow>;

/** Live view of every Batch joined to its Product and Location, in Larder order. Sync writes show up here too. */
export function useLarder() {
  const b = useLive(db.select().from(batches).where(isNull(batches.deletedAt)));
  const p = useLive(db.select().from(products));
  const l = useLive(db.select().from(locations).where(isNull(locations.deletedAt)).orderBy(...locationOrder));
  const allLocations = useLive(db.select().from(locations));
  const e = useLive(db.select().from(usageEntries));
  const settings = useLive(db.select().from(householdSettings));
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
