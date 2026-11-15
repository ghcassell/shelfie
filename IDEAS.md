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
