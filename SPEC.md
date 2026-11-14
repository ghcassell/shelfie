# Shelfie: build spec

Status: final hand-off spec, assembled from the closed wayfinder tickets. Everything is locked. Terms are defined in `GLOSSARY.md` (capitalised terms below). Decision detail lives in `.wayfinder/tickets/`; ADRs in `docs/adr/`.

## 1. Product

A shared, offline-first Android pantry app for two people (one Household). Private use, side-loaded APK, never published. Know what is in the Larder and use it before it goes off.

Hard constraints: Android only; no or minimal running cost (free tiers only); local SQLite is the app's source of truth and everything works offline after first sign-in; receipt photos leave the device only on an explicit "Improve with AI" tap; no LLM key in the app or repo.

Out of scope: iOS, Play Store, branding assets, monetisation, recipe suggestions, nutrition overview, home-screen widget, dark mode, user-taken Product photos.

## 2. Stack

Single Expo app (no monorepo), Expo SDK 58 (RN 0.88.1), Expo Router, TypeScript. `expo-sqlite` + Drizzle (`useLiveQuery`; no Zustand, no TanStack Query). `react-native-vision-camera` 5.x + Margelo ML Kit barcode plugin + `react-native-vision-camera-mlkit` 2.0.1 (OCR); pin exact versions. Plain `StyleSheet` (NativeWind dropped). `@expo/vector-icons` (MaterialCommunityIcons). `expo-notifications` (local only). `supabase-js` only in `sync/` and auth. Open Food Facts for lookup (custom User-Agent, 15 product lookups/min, ODbL attribution in Settings/About).

Layout under `src/`: `db/` (schema, migrations, repositories), `domain/` (pure TS, no React/SQLite imports), `sync/`, `features/` (larder, add, receipt, shopping, settings), `ui/` (theme + shared components). `supabase/` at repo root: Postgres migrations, RLS, Edge Function.

## 3. Data model

- **Product**: shared catalogue entry: name, brand, size, category, image (OFF URL, cached locally), barcode (unique per Household when present), one Base unit (g, ml or count), optional opened shelf life ("use within N days"), optional per-Product warning-days override, optional Running-low threshold (in base unit or "N packs").
- **Batch**: stock of one Product bought together: starting amount (base unit), pack count, one Location, date (or "needs a date" or explicit no-expiry flag), Date kind (use-by / best-before; default best-before), optional opened-on, optional price (blank = unknown), added by Member, added date. Multi-packs are one Batch with a pack count.
- **Location**: user-defined, unique per Household (case-insensitive). Exactly one per Batch; moved by hand. Moving to a freezer prompts for a new date; no automatic rules.
- **Usage entry**: immutable, append-only; four kinds (used / wasted / corrected / split). Remaining amount = starting amount minus all entries (corrected entries are signed), never stored overwritten; below zero shows as zero. Finished Batch (zero) is kept as history and hidden from the Larder. Delete is for mistaken adds only (tombstone).
- **Shopping list entry**, **Household settings** (single record: warning N days, default 3), **Household**, **Member** (display name), **Receipt alias** (synced, LWW).
- Effective expiry = earlier of printed date and opened-on + N days. Opened limit counts as use-by.
- Urgency state: Expired (use-by or opened limit passed) / Past best (best-before passed) / Expiring soon (within N days) / Fine / Needs a date / No expiry.
- Every synced row: UUID, server `updated_at` (Postgres trigger), `deleted_at`. Local rows add a `dirty` flag; one-row `sync_state` holds the pull cursor.

**Usage entry fields:** `id`, `batch_id`, `kind`, `amount` (base unit; positive except corrected), `member_id`, `created_at` (device time, for display and waste month), `waste_reason` (wasted only), `reverses_entry_id` (corrected only), `split_batch_id` (split only). Sync fields as above but no `deleted_at`. Batch gains `split_from_batch_id`.
- **Partial use never splits:** it appends a `used` entry to the same Batch; pack count shown = remaining / pack size.
- **Split on open:** opening part of a Batch creates a new Batch (own opened-on, `split_from_batch_id`; copies Product, Location, date, Date kind, added-by) and appends a `split` entry to the original (amount, `split_batch_id`). `split` counts as neither used nor wasted. Original starting amount and price are never edited; new Batch price = price x portion / starting amount. Opening a whole Batch just sets opened-on. Split entries cannot be reversed (clear opened-on on the new Batch instead); merging Batches is out of scope.
- **Corrections:** `corrected` has a signed amount (negative gives stock back) and optional `reverses_entry_id`. Undo reverses an entry in full, at most once. Plain amount fix = reverse, then append a new entry. Stock-take fix = `corrected` with no `reverses_entry_id`. Waste report counts a wasted entry only if no correction reverses it.
- **Offline:** both phones just append, no reconciliation (two splits of the last pack leave two opened Batches and a Finished original; fix by hand). Duplicate reversals of one entry: only the earliest (server timestamp) counts.

## 4. Sync, auth and household

- Backend: Supabase Free only (Postgres, Auth, one Edge Function). No Storage.
- Sign-in: email OTP code. First person creates the Household and gets a short invite code; second joins with it. One Household per person, no leaving or switching. RLS on `household_id`. First launch needs a connection; after that the session persists.
- Sync: push dirty rows by UUID upsert, then pull rows newer than the cursor. Field edits LWW on server timestamp (phone clocks never decide). Triggers: app open/foreground, a few seconds (debounced) after a local change, pull-to-refresh. No background sync.
- Duplicates: barcode and Location name clashes merge on push (keep older row, repoint references). Products without barcode never merge.
- Synced: Products, Batches, Locations, Usage entries, shopping list, Receipt aliases, Household settings, Households, Members. Device only: receipt photos (deleted after extraction), per-phone settings (digest on/off and time).
- Idle pause (about one week) accepted; app shows "sync unavailable" and keeps working; resume by hand in the Supabase dashboard. No automated backups.
- Migrations: one numbered migration per change, hand-written in both dialects; every change touches both.
- Supabase email OTP must be configured to send a code (template), and the built-in email sender is heavily rate-limited; note for setup, fine for two users.

## 5. Screens and flows

Tabs: **Larder**, **Shopping**, **Needs attention** (badge). Overflow menu: **Settings**, **Waste report**. FAB on Larder.

**Larder** (prototype Variant A): flat list sorted by urgency (Expired, Past best, Expiring soon, rest by date, no-expiry last), filter chips (Location etc.; no sort picker), Needs-attention banner at top (red-tinted if anything Expired, else amber). Rows: product image or tint tile with first letter, name, StatusPill, 4dp state-colour left edge. Screen-reader label e.g. "Semi-skimmed milk, 1 litre, fridge, expires in 2 days". Search: case-insensitive substring on Product name and brand, combined with the chips. Empty: "Your larder is empty. Scan your first item." [Scan].

**Add wizard** (stepped, WizardStep "Step n of m", fixed bottom bar): scan barcode or manual, then OFF lookup (cache every hit; manual Products cached by barcode and synced), not-found path is first-class (manual entry), then Product details, quantity, Location, date step.

**Date step:** scan date (ML Kit OCR, never saved unconfirmed), picker with quick options (+3 days, +1 week, +1 month, +1 year), "no expiry", or "skip for now" (Needs a date). Parser is UK-only: DD/MM day-first always; two-digit year = 20YY; month names/abbreviations; month-only = last day of month; several candidates: pick nearest expiry keywords ("USE BY", "BB", "BEST BEFORE", which also set Date kind, toggleable); flag results in the past or more than 10 years out at confirmation. Ships with a test corpus of real label strings. Floor if OCR plugin fails: manual entry.

**Batch detail / mark as used:** quantity picker (numeric in base unit, -/+ step 1 for count, 50 for g/ml, chips quarter / half / All), use, throw away (Waste reason one-tap: Expired default, Went off early, Didn't like it, Other; skippable; partial waste allowed), set opened (opened-on, "use within N days" remembered per Product), edit, move Location, delete (mistaken adds). Quick-use lives on detail only. Expired rows offer a one-tap "wasted" prompt. Product history lists Usage entries; waste undo is offered here as a corrected entry.

**Needs attention:** groups: Expired, Past best, Expiring soon, Needs a date (with "Fill in dates" entry). Empty: "All clear. Nothing needs using up."

**Daily digest:** one local notification per phone, inexact daily trigger (no exact-alarm permission), default 08:00. Fires only if something is Expiring soon, Expired or Past best ("3 expiring soon, 1 expired"); repeats daily until each Batch is used, wasted or re-dated; deep-links to Needs attention. Needs a date never triggers it. After every app open and sync: cancel and reschedule from local data (stale if app unopened for days; accepted). Permission requested on first dated Batch save; if denied, the tab badge stands in.

**Shopping list:** one shared synced list, offline-capable. Entry: name, optional Product link, optional free-text quantity, added by (Member or "auto"). Triggers: manual; auto when a Product's total stock crosses (above to at-or-below) its threshold (total = unfinished Batches in base unit, excluding Expired, including Past best); prompt "Add to shopping list?" when the last Batch of a Product with no threshold finishes. Never duplicates an existing entry. Tick = in basket (stays). Adding a Batch of a linked Product removes all its entries; "Clear ticked". Share unticked entries as plain text via the share sheet. Empty: "Nothing to buy."

**Receipt scanning:** capture photo, on-device ML Kit OCR + regex (sends nothing). Optional per-receipt "Improve with AI" (needs connection): downscaled photo to Claude Haiku 5.5 via the Edge Function holding the key (Supabase secret), `max_tokens` capped, hard monthly spend cap in the Anthropic Console. Lines fuzzy-match the Household's own Products only (never OFF), confirmed matches saved as Receipt aliases; unmatched lines create a Product (base unit guessed from size in the name, else count). One-screen checklist (tick, editable name, changeable match, quantity, price), all ticked except an ignore list (carrier bag, discount, total, loyalty, ...). "Add ticked" creates Batches with no date (Needs a date), price recorded; photo deleted, no receipt record. Parser ships with a corpus of about 10 real receipts from the household's usual shops (user to collect).

**Batch add ("Add several"):** the normal wizard with "Save & scan next"; each Batch saves immediately, no draft. Location and Date kind carry over ("Adding to: <Location>" chip); quantity resets to 1; date never carries. Unknown barcode: name-only quick create (count), keeps barcode; brand and size completed later on the Product screen (user photos out of scope; tint tile stays). Date step opens in the date-scanning camera. Same barcode and date as the last saved Batch bumps its pack count. "Fill in dates" mode walks Batches needing a date ("Next"; scanning a pack barcode jumps to its Batch). Summary on exit when 2 or more added: "Added N Batches · M need a date · K new Products with no details" + button to Needs attention.

**Waste report:** Settings/overflow row. Current calendar month with arrows: total cost, wasted Batch count, most-wasted Products, split by Waste reason. Cost = wasted amount / Batch size x price; shown "at least £X, N wasted Batches have no price" when prices are missing. Counts wasted entries net of corrections. Empty: "No waste this month."

**Settings:** Locations, warning days (Household), digest on/off and time (per phone), per-Product overrides (on Product), Waste report, Export, About (OFF attribution), sync status.

**Export** (manual, via share sheet):
- JSON backup (restore): single file with `schemaVersion` (int, starts 1), `exportedAt`, one array per synced table (Products, Batches, Locations, Usage entries incl. reasons and reversals, shopping list entries, Receipt aliases, Household settings). No Members, cursors or encryption. Restore refuses a higher `schemaVersion`; lower runs a migration chain.
- CSV (reading only, never imported): zip of `larder.csv` (one row per Batch: Product, brand, Location, remaining amount and unit, dates, status, price), `usage.csv` (date, Product, kind, amount, Waste reason, cost), `shopping-list.csv`. ISO dates, UTF-8 with BOM.
- Restore only when the local DB and signed-in Household have no Products, Batches or Usage entries. Checks `schemaVersion`, then referential integrity (Batch to Product, Usage to Batch, `reverses_entry_id` to entry). One transaction, all rows `dirty`, original ids kept. Any failed check changes nothing and shows one plain error.

## 6. Design system

Light only (`userInterfaceStyle: "light"`). Tokens in `src/ui/theme.ts`: primary `#0E7C5A`, brand `#1D9E75` (accents/large icons only), dark `#085041` (titles), tint `#E1F5EE`, ink `#16302a`, inkMuted `#5d7068`, line `#dfe8e5`, surface `#fff`, red `#C62828`, amber `#F5B335`. System sans; generic `serif` for titles and wordmark; scale 12/14/16/20/24sp. Spacing 4/8/12/16/24/32, screen padding 16; radii 8 / 12 / full; elevation only on FAB and sheets. Urgency pills always colour + icon + text: Expired (red, white, X), Expiring soon (amber, dark, clock, "3 days left"), Past best (amber, dark, half-circle), Needs a date (grey outline, ?), Fine and No expiry have no pill. Components in `src/ui/`: ScreenHeader, ListRow, Chip, StatusPill, Banner, Button (min 48dp), WizardStep, QuantityPicker, EmptyState, FAB, BottomTabs; add a shared component only when a third screen needs it. Accessibility: AA contrast, 48dp targets, labels on icon-only buttons, rows grow with font scale, no swipe-only actions.

## 7. Build, test, distribute

- First task is a spike: a release APK scans a barcode and reads text. Fix order: `@expo/config-plugins` peer warning (`--legacy-peer-deps` or overrides), ML Kit duplicate classes (exclude in config), else fork the OCR plugin into `packages/`. Both risks unverified until built.
- Local release APK: `npx expo run:android --variant release`; side-load by file share or `adb install`. No EAS, no OTA. One keystore outside the repo, backed up by the user; losing it means uninstall and local data loss (Export first; cloud data re-pulls on sign-in).
- Jest on `domain/` and sync merge/duplicate-merge (in-memory SQLite). No UI or e2e tests. RLS verified with a short manual script. Rules in tickets are written as testable cases.
- Env: Supabase URL and anon key in Expo public env; types via `supabase gen types` into `src/sync/`.

## 8. Cost

Zero expected. Optional AI receipt improvement about $0.005 a month (estimate), capped in the Anthropic Console.

## 9. Known open items

None for the builder. Household tasks (not decisions):

1. Collect about 10 real receipts and label strings for parser corpora (household task, not a decision).
