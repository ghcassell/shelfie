# Ideas

Things worth doing later. Nothing here is decided or scheduled.

## Choose the emoji for a Product by hand

Today a Product with no photo shows an emoji guessed from its name and category (`src/domain/emoji.ts`). Both phones make the same guess, so nothing is stored. A wrong guess is fixed for everyone by adding a word to that list.

The idea: let the user pick the emoji on the Product screen, with the guess as the default until they do.

- Supabase: `alter table products add column emoji text;` (no change to the row-level security rules).
- App: the matching column in the local database (paired migration, see `docs/adr/0002`), a picker on the Product screen, and `ProductTile` using the stored emoji before the guess.
- Order: add the Supabase column first, then update both phones. A new build would otherwise sync a field the server does not have.

## Choose a Product photo from the gallery

Own photos are camera-only for now. `expo-document-picker` is already installed and can pick an image; it would feed the same shrink-to-data-URI step as `PhotoCamera` in `src/features/add/camera.tsx`.

## Wording and lookup for things that are not food

Medication, pet food and household items get their own emoji, but the rest of the app still assumes food: Open Food Facts will not find their barcodes (manual entry), and the wording ("Use", "Throw away", the waste reasons) is unchanged.

## From the November 2026 review

Found while reviewing the whole app. The first three are faults rather than features; fix those before the rest.

### Sync can skip a row the other phone wrote at the same moment

The pull cursor (`syncOnce` in `src/sync/engine.ts`) is the newest server timestamp seen, including this phone's own pushes. A row the other phone wrote a moment earlier but committed just after this phone's pull is older than the cursor and never arrives. Fix: pull from the cursor minus a minute. The pull is already safe to repeat.

### No way back in if the Supabase session is lost

"Signed in" means the local `sync_state` row exists (`src/app/_layout.tsx`). If the Supabase session is revoked or lost, sync shows "Sync unavailable" for ever and there is no sign-in screen. Fix: when sync fails on auth, offer "Sign in again" in Settings (email code only; the Household is already known).

### Sync failure only shows in Settings

The two phones can drift apart for days unnoticed (the Supabase project pauses after about a week idle). Fix: a small icon in the Larder header when `useSyncStatus()` is `unavailable`, tapping through to Settings.

### Shopping list to Larder

"Put ticked in the larder" on the Shopping screen: a Batch (To put away, Needs a date) for every ticked entry linked to a Product, the same as `addTicked` in `ReceiptScreen`. Today ticked entries are only cleared and everything is scanned again.

### A Products list

A Product is only reachable through a live Batch. Once it is Finished its threshold, history and details cannot be reached, and it cannot be re-added without the pack in hand. A searchable list (from the Larder menu) opening the Product screen, with "Add a Batch" on it.

### Name the items in the Daily digest

"Milk expires today, 2 more expiring soon" rather than counts alone. A small change to `digestText` in `src/domain/expiry.ts`, which would take names as well as states.

### Used versus wasted in the Waste report

The Usage entries are already there: "you used 92% of what you bought" and last month's total beside this month's.

### Undo does not take back a shopping list entry

Undoing a use (the toast, or the Product's history) gives the stock back but leaves any entry the use added to the shopping list.

### Housekeeping

`HANDOFF.md` describes the first build session (no git repository, nothing run on a phone). Delete it or bring it up to date.

### Other toasts shown right after closing a Sheet

`logUsage`'s toast now waits out the Sheet's close animation so Undo is tappable (see the comment in `BatchItem.tsx`). `BatchScreen.tsx`'s "Date saved", "Moved to …" and "Price saved" toasts have the same Sheet-covers-toast moment on Android; harmless since they are not tappable, but worth the same fix if one of them ever gets a button.
