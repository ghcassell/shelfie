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

Found while reviewing the whole app. What is left after the three sync faults, Shopping list to Larder and the named Daily digest were done.





### A Products list

A Product is only reachable through a live Batch. Once it is Finished its threshold, history and details cannot be reached, and it cannot be re-added without the pack in hand. A searchable list (from the Larder menu) opening the Product screen, with "Add a Batch" on it.


### Used versus wasted in the Waste report

The Usage entries are already there: "you used 92% of what you bought" and last month's total beside this month's.

### Undo does not take back a shopping list entry

Undoing a use (the toast, or the Product's history) gives the stock back but leaves any entry the use added to the shopping list.

### Housekeeping

`HANDOFF.md` describes the first build session (no git repository, nothing run on a phone). Delete it or bring it up to date.

### Other toasts shown right after closing a Sheet

`logUsage`'s toast now waits out the Sheet's close animation so Undo is tappable (see the comment in `BatchItem.tsx`). `BatchScreen.tsx`'s "Date saved", "Moved to …" and "Price saved" toasts have the same Sheet-covers-toast moment on Android; harmless since they are not tappable, but worth the same fix if one of them ever gets a button.
