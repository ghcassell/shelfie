// Domain shapes. The Drizzle rows in db/schema.ts are structural supersets of these
// (they add household_id and sync fields), so rows can be passed straight in.

export type Day = string; // 'YYYY-MM-DD'
export type BaseUnit = 'g' | 'ml' | 'count';
export type DateKind = 'use_by' | 'best_before';
export type EntryKind = 'used' | 'wasted' | 'corrected' | 'split';
export type WasteReason = 'expired' | 'went_off_early' | 'didnt_like_it' | 'other';
export type Urgency = 'expired' | 'past_best' | 'expiring_soon' | 'fine' | 'needs_date' | 'no_expiry';

export const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'went_off_early', label: 'Went off early' },
  { value: 'didnt_like_it', label: "Didn't like it" },
  { value: 'other', label: 'Other' },
];

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  size: string | null; // display text, e.g. "400 g"
  category: string | null;
  imageUrl: string | null;
  barcode: string | null;
  baseUnit: BaseUnit;
  packAmount: number; // base units in one pack (1 for count)
  openedShelfLifeDays: number | null;
  warningDays: number | null; // per-Product override of the Household window
  lowThreshold: number | null;
  lowThresholdUnit: 'base' | 'packs';
}

export interface Batch {
  id: string;
  productId: string;
  locationId: string | null; // null = To put away: added without saying where it is kept
  startingAmount: number;
  packCount: number;
  expiryDate: Day | null; // null + !noExpiry = Needs a date
  noExpiry: boolean;
  dateKind: DateKind;
  openedOn: Day | null;
  pricePence: number | null; // null = unknown, not zero
  addedBy: string;
  addedAt: string; // ISO timestamp
  splitFromBatchId: string | null;
}

export interface UsageEntry {
  id: string;
  batchId: string;
  kind: EntryKind;
  amount: number; // positive except corrected (negative gives stock back)
  memberId: string;
  createdAt: string; // device time, ISO
  wasteReason: WasteReason | null;
  reversesEntryId: string | null;
  splitBatchId: string | null;
  updatedAt: string | null; // server timestamp; null until first synced
}

export interface ShoppingEntry {
  id: string;
  name: string;
  productId: string | null;
  quantity: string | null;
  addedBy: string; // Member id or 'auto'
  ticked: boolean;
}
