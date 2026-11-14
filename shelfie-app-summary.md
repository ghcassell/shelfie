# Shelfie: Project Summary & Spec Seed

**Status:** Concept / pre-spec
**Platform:** Android first (React Native + Expo), iOS later
**Working name:** Shelfie (alternatives considered: Stockt, Pantri, Best Before, Eat Me First, Shelf Life)
**One-liner:** Know what's in your larder, and use it before it goes off.

---

## 1. Problem & Goal

Households lose food and money to forgotten items and missed expiry dates. Shelfie is a fast, offline-first pantry tracker that makes adding stock nearly effortless (barcode, OCR, receipt scan), keeps quantities current as items are used, and alerts users before things expire.

---

## 2. Core Features (MVP scope)

| # | Feature | Summary |
|---|---|---|
| 1 | **Scan & record items** | Barcode scan, then product lookup, auto-filling name, brand, category, weight/volume, image. Manual entry fallback. |
| 2 | **Expiry / use-by capture** | OCR scan of the printed date, with the user confirming the parsed value. Manual date picker with quick options (+1 week, +1 month, etc.) and a "no expiry" option. |
| 3 | **Larder view** | Searchable, filterable list by name, type, location and expiry status. Sort by expiry, name, date added. Colour-coded urgency (green/amber/red). |
| 4 | **Custom alerts** | Global default, per-category and per-item thresholds, multi-stage (e.g. 7 days and 1 day). Local notifications, optional daily digest, deep link to the item. |
| 5 | **Mark as used** | Swipe or tap to use all, use some (by weight, volume or count), or throw away (logs waste). Full usage history per item. |
| 6 | **Receipt scanning** | Photo of a till receipt, then structured item extraction, then a checklist where the user deselects non-food or edits, then add to larder. |

---

## 3. Additional Features (post-MVP)

- **Storage locations:** user-defined (fridge, freezer, pantry, cupboard) with filtering
- **Shopping list:** auto-generated from low or used-up items, plus manual entries, shareable as text
- **"Running low" thresholds** per item
- **Waste tracker:** monthly report of what was thrown away and its estimated cost
- **Batch add mode:** continuous scanning after a big shop
- **Item photos:** user-taken when no product image exists
- **Household sharing / cloud sync** (Supabase or Firebase)
- **Recipe suggestions** from soon-to-expire stock ("use it up" mode)
- **Nutritional overview** from Open Food Facts data
- **Data export** (JSON/CSV) and backup
- **Home screen widget** showing items expiring soon

---

## 4. Technical Approach

### Stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo (TypeScript) |
| Navigation | Expo Router |
| Local DB | SQLite (`expo-sqlite`), offline-first |
| State | Zustand |
| Styling | NativeWind |
| Camera | `react-native-vision-camera` |
| Barcode + OCR | Google ML Kit (on-device, free) |
| Product lookup | Open Food Facts API (free, no key) |
| Receipt parsing | Vision LLM (Claude Haiku class), on demand |
| Notifications | `expo-notifications` (local) |

### What ML Kit can and can't do (key finding)

- **Barcode:** reads EAN-13/8, UPC-A/E, QR etc. and returns **the number only**. It does not know what the product is. Product identity comes from the Open Food Facts lookup.
- **Text recognition (OCR):** works for printed dates and weights. It struggles with embossed or stamped dates (common on cans and bottles). Raw text needs regex parsing.
- **Image labeling:** only generic categories ("food", "bottle"). It can't identify specific products.
- **Fallbacks:** products with no barcode, or not in Open Food Facts, need manual entry or a vision-LLM fallback.

### Data flow (core add-item path)

```
Barcode scan (ML Kit) -> barcode number -> Open Food Facts lookup
   -> prefilled item (name, brand, size, category, image)
   -> expiry OCR (ML Kit) or manual date -> user confirms -> save to SQLite
   -> schedule local notification(s)
```

### Draft data model

```
items:             id, barcode, name, brand, category, storage_location_id,
                   quantity, quantity_unit, weight_g, volume_ml,
                   expiry_date, no_expiry, image_uri, off_id,
                   date_added, date_updated, alert_days_before, notes
usage_log:         id, item_id, action (used | all_used | wasted), amount, unit, date, notes
storage_locations: id, name, icon, sort_order
shopping_list:     id, name, quantity, unit, linked_item_id, added_date, checked
receipt_scans:     id, image_uri, scan_date, items_found, items_added
```

### Screen map

Home/dashboard, Larder (list + detail), Add item (scan / manual), Receipt scanner (capture, checklist, confirm), Shopping list, Needs attention (expiring/expired), Settings (locations, alert defaults, units, notification schedule, export).

---

## 5. Technical Flags for Spec Agents

These are things to verify or decide before building:

1. **Expo Go won't work.** `react-native-vision-camera` and ML Kit plugins are native modules, so a **development build** (EAS Build / `expo-dev-client`) is required from day one.
2. **Verify the ML Kit integration path.** Check the current maintained vision-camera frame-processor plugins for barcode and text recognition (some older packages are abandoned). Alternatives include `expo-camera` barcode scanning for the barcode feature and a dedicated ML Kit text-recognition package for OCR.
3. **Never ship an LLM API key inside the app.** Receipt scanning needs a thin backend or proxy (e.g. a serverless function) that holds the key, rate-limits, and forwards images. This is the one place a server is unavoidable in the MVP+ scope.
4. **Check current model IDs and pricing** at build time (docs.claude.com) rather than relying on figures quoted in this chat (~£0.004 per receipt was a rough estimate).
5. **Open Food Facts coverage varies by country.** UK coverage is decent but not complete, and data quality is crowdsourced. Plan the "not found" path as a first-class flow.
6. **Date parsing needs care:** UK `DD/MM/YYYY` vs US formats, two-digit years, "BB" vs "Use by" vs "Best before" semantics (use-by is a safety date, best-before is quality). Consider treating these differently in alerts.
7. **Android notification reliability:** scheduled local notifications can be affected by battery optimisation and exact-alarm permissions (Android 12+/13+). Notification permission is a runtime prompt on Android 13+.
8. **Data loss on uninstall:** SQLite is local only, so export or backup should be planned before any public release.

---

## 6. Phased Roadmap

**Phase 1: MVP**
Project setup (dev build) -> SQLite schema -> barcode scan + Open Food Facts lookup -> manual entry -> expiry OCR + manual date -> Larder list with search/filter -> item detail/edit -> mark as used -> local expiry notifications -> settings (locations, alert defaults)

**Phase 2: Enhanced**
Receipt scanning (needs backend proxy) -> shopping list -> waste tracking -> batch add mode -> UI polish and onboarding -> data export

**Phase 3: Extended**
Cloud sync / household sharing -> recipe suggestions -> iOS release -> nutrition overview -> widget

---

## 7. Cost Picture

| Item | Cost |
|---|---|
| ML Kit, Open Food Facts, Expo dev tooling, local notifications | Free |
| Receipt scanning (vision LLM) | Small per-scan cost, only when used |
| Google Play developer account | One-off ~$25 |
| Cloud sync (optional) | Free tiers likely sufficient initially |
| Backend proxy for receipts | Free/low tier on serverless platforms |

---

## 8. Branding Direction

- **Name:** Shelfie. Playful, memorable, shelf + "selfie" (scanning) double meaning, searchable.
- **Logo concept:** a shelf with small product silhouettes, overlaid with a camera viewfinder lens in the corner.
- **Palette:** teal family, roughly `#1D9E75` (primary), `#085041` (dark), `#9FE1CB` and `#E1F5EE` (light tints).
- **Type:** friendly serif wordmark. Tone is warm, practical and kitchen-friendly rather than cold or logistical.
- **Tagline ideas:** "Know what you have. Use it before it's gone."
- **To check:** trademark and App Store / Play Store name availability for "Shelfie".

---

## 9. Open Questions to Resolve in the Spec

- Single user only for v1, or design the schema for households from the start?
- Units model: how to handle mixed units (a 400g tin used by "half"), percentages and counts cleanly?
- Should opened items get a shortened "use within X days of opening" date?
- Multiple units of the same product: one record with quantity, or separate records per batch with different expiry dates? (Recommend batch-level records.)
- Receipt-to-item matching: attempt Open Food Facts lookup by name, or keep receipt items as lightweight entries until completed by the user?
- Privacy stance: what leaves the device (receipt images only, on explicit action)?
- Monetisation, if any: free, one-off purchase, or premium sync/household tier?

---

## 10. Suggested Next Steps for Agent Specs

1. **Architecture spec:** project structure, dev build setup, DB layer and migrations.
2. **Scanning spec:** barcode + OFF lookup flow, OCR date parser (with a test corpus of date formats).
3. **Larder UX spec:** list, search, filters, detail, use-item flows.
4. **Notifications spec:** scheduling model, rescheduling on edit/use, Android permission handling.
5. **Receipt pipeline spec:** capture, upload, proxy, extraction schema, review checklist.
6. **Design system spec:** palette, type, components, icon and logo assets.
