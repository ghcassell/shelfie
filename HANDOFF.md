# Shelfie handoff

Written 2026-11-14 at the end of the first build session. Read this first, then `SPEC.md` and `README.md`.

## Where things stand

All app code for `SPEC.md` is written. Nothing has run on a phone yet, because no release APK has been produced.

| Area | State |
|---|---|
| `src/domain/` (pure rules, parsers) | Written. Jest passes. |
| `src/sync/engine.ts` (push/pull, merge) | Written. Jest passes against in-memory SQLite. |
| `src/db/`, `src/features/`, `src/ui/`, `src/app/` | Written. Typecheck clean. **Never executed.** |
| `supabase/` (SQL, RLS, Edge Function) | Written. **Never applied or deployed.** |
| Release APK spike (SPEC section 7, first task) | **Blocked**, see below. |

Checks that pass today: `npm test` (74 tests) and `npm run typecheck`.

Not done: any on-device run, camera, OCR, notifications, sign-in, live sync, the Edge Function, `npx expo lint`. The folder is not a git repository and nothing is committed.

### The blocker

`gradlew assembleRelease` fails in the native C++ step with:

```
ninja: error: mkdir(.../react_codegen_safeareacontext.dir/C_/src/shelfie/node_modules/...): No such file or directory
```

Cause: Windows' 260-character path limit. `LongPathsEnabled` is `0` on this machine and the Android SDK's CMake 3.22.1 bundles Ninja 1.10.2, which cannot use long paths even when they are enabled. Both must change.

This is not one of the risks SPEC section 7 lists. Those (the `@expo/config-plugins` peer warning, ML Kit duplicate classes) are still unverified: the build never reached linking or packaging. All libraries, including VisionCamera, the barcode plugin and the OCR plugin, did compile once their build folders were shortened.

---

## Part 1: what you need to do

Steps 1 to 3 unblock the build. Steps 4 to 6 are needed before the app can sign in. Steps 7 and 8 can wait.

### 1. Enable Windows long paths (needs admin, 1 minute)

Open PowerShell **as Administrator** and run:

```powershell
Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' LongPathsEnabled 1
```

Close and reopen any terminals afterwards.

### 2. Decide how Ninja gets upgraded (pick one)

- **Option A (you do it):** Android Studio > Settings > Languages & Frameworks > Android SDK > SDK Tools tab > tick "Show Package Details" > under CMake tick the newest 3.31.x or 4.x > Apply.
- **Option B (Claude does it):** tell the next session "you may replace ninja.exe in my Android SDK". It will download Ninja 1.12+ from the official ninja-build GitHub releases, back up the original as `ninja.exe.bak`, and swap it into `C:\Users\mr_m_\AppData\Local\Android\Sdk\cmake\3.22.1\bin`.

Option B is quicker and is the one most likely to work without further fiddling.

### 3. Connect a phone

- On the Android phone: Settings > About phone > tap "Build number" seven times, then Settings > Developer options > turn on "USB debugging".
- Plug it into this PC by USB and accept the "Allow USB debugging" prompt.
- Have a food pack with a barcode and a printed date to hand for the scan test.

### 4. Create the Supabase project

1. Sign in at supabase.com, create a new project on the Free plan. Note the database password.
2. Left menu > SQL Editor > paste the whole of `supabase/migrations/0000_init.sql` > Run. It should finish with no errors.
3. Left menu > Authentication > Email Templates: in **both** "Magic Link" and "Confirm signup" (a first-time email gets Confirm signup), make sure the body contains `{{ .Token }}` so the email shows a 6-digit code. Save.

### 5. Fill in `.env`

Copy `.env.example` to `.env` in `C:\src\shelfie` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase dashboard > Project Settings > API. Use the Project URL, not the RESTful endpoint (no `/rest/v1/` on the end).
- `EXPO_PUBLIC_OFF_CONTACT`: optional contact email shown to Open Food Facts.

The APK must be rebuilt after `.env` changes (the values are baked in at build time).

### 6. Tell the new session what is ready

Start a new Claude Code session in `C:\src\shelfie` and say something like:

> Continue from HANDOFF.md. Long paths are enabled. Ninja: option B, you may replace ninja.exe. Phone is connected. Supabase is set up and .env is filled in.

Leave out whatever is not done yet; the session will work with what it has.

### 7. Later: optional "Improve with AI" for receipts

Needs the Supabase CLI (`npx supabase ...` works) and a free Gemini API key from aistudio.google.com:

```sh
supabase login
supabase link --project-ref <your project ref>
supabase secrets set GEMINI_API_KEY=<key>
supabase functions deploy receipt-ai
```

Leave billing off the key so it stays on the free tier (Google may use free-tier inputs to improve its products). Skip this and the app still works; only the "Improve with AI" button fails.

### 8. Later: household tasks

- Create one signing keystore and back it up (`README.md`, "Signing"). Until then each build is signed with this PC's debug key, which is fine for testing.
- Collect about 10 real till receipts and a handful of real date-label strings. The corpora in `src/domain/parsers.test.ts` are placeholders written in the style of UK packs.
- Once both of you have joined the Household, run through `supabase/rls-check.sql`.

---

## Part 2: what Claude needs to do in the new context window

Work in order. Stop and report if a step needs something from Part 1 that has not been done.

### 0. Orient

1. Read `SPEC.md`, `README.md`, `AGENTS.md`, this file. `AGENTS.md` says to check versioned Expo docs before using Expo APIs; follow it.
2. Run `npm test` and `npm run typecheck`. Both must pass before changing anything.
3. Check the environment:
   - `(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem').LongPathsEnabled` must be `1`.
   - `adb devices` (at `$ANDROID_HOME\platform-tools\adb.exe`) lists a device.
   - `.env` exists.

### 1. Ninja

- Option A chosen: confirm a newer CMake folder exists under `$ANDROID_HOME\cmake` and its `ninja.exe --version` is 1.12 or higher. Check which CMake the build actually uses; React Native may still select 3.22.1, in which case fall back to option B with the user's agreement.
- Option B chosen: download the Windows Ninja release (1.12+) into its own empty folder, back up `cmake\3.22.1\bin\ninja.exe` to `ninja.exe.bak`, replace it, confirm `--version`.

### 2. Spike: release APK (SPEC section 7, first task)

```sh
npx expo prebuild --platform android --no-install
cd android && ./gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

Run the Gradle build in the background; it takes 5 minutes or more. `android/` was deleted at the end of the last session and is regenerated by prebuild; never hand-edit it.

If it fails, in this order:
1. Path-length error again: recheck steps 0 and 1. Things already tried that do **not** work: `subst` to a drive root (Expo autolinking cannot find `package.json` from a drive root), `CMAKE_OBJECT_PATH_MAX` (CMake only warns), and `buildStagingDirectory` alone (fixes the libraries, not the app module).
2. `Duplicate class com.google.mlkit...`: exclude the clashing module via config, per SPEC section 7. The OCR plugin is already configured with `barcodeScanning: false` in `app.json` so only the Margelo plugin brings barcode ML Kit.
3. Otherwise fork the OCR plugin into `packages/` (SPEC section 7). Floor is manual date entry, which already works without the camera.

Then `adb install -r android/app/build/outputs/apk/release/app-release.apk` and confirm with the user on the phone: the app opens, the add wizard's camera reads a barcode, and "Scan date" reads text. That closes the spike.

### 3. First real run and fixes

No screen has ever executed, so expect runtime bugs. Use `adb logcat` (filter `ReactNativeJS`) while the user taps through. Suspect first:

- `src/features/add/camera.tsx`: VisionCamera v5 photo capture (`capturePhoto({}, {})`, `saveToTemporaryFileAsync`), the path format handed to `processImageTextRecognition`, and `CodeScanner` props. Written from the packages' type definitions, never run.
- `src/app/_layout.tsx`: Drizzle `useMigrations` with the inlined `.sql` file (needs `babel.config.js` and `metro.config.js` as they are), and the sign-in gate that waits on `useLiveQuery(...).updatedAt`.
- `src/sync/supabase.ts`: `expo-sqlite/kv-store` as the auth session storage.
- `src/features/settings/digest.ts`: daily trigger and channel on a real device.
- `src/features/settings/exportData.ts`: `expo-file-system` `File` write and share, document picker restore.

Walk the user through, in order: sign in with email code and create the Household; add a Location; add one item by barcode; add one by hand; use some, throw some away, open part of a pack; shopping list auto-add and prompt; Needs attention and the tab badge; "Add several"; receipt scan; Fill in dates; Waste report; export JSON and CSV; second phone joins with the invite code and both phones sync.

### 4. Remaining items

- `npx expo lint` (not run yet; it may ask to install ESLint config).
- If the Supabase CLI is linked: `supabase gen types typescript --project-id <id> > src/sync/database.types.ts` (SPEC section 7).
- Replace the placeholder parser corpora when the user supplies real strings, and fix whatever fails.
- Offer to `git init` and make a first commit; do not commit without being asked.

### Notes that save time

- Windows PowerShell 5.1 writes a BOM with `Set-Content -Encoding utf8`, which breaks `package.json` and `app.json`. Edit JSON with the Edit tool or Node.
- Dependencies install with `legacy-peer-deps` (`.npmrc`); use `npx expo install <pkg>` for Expo packages.
- Jest uses plain `babel-jest` in a Node environment, not the `jest-expo` preset (it demands an extra React Native preset package and the tests do not need it).
- `JAVA_HOME` is `C:\src\.tools\jdk17\jdk-17.0.20.1+1`; `ANDROID_HOME` is `C:\Users\mr_m_\AppData\Local\Android\sdk`. The SDK has no `cmdline-tools`, so `sdkmanager` is not available.
- After changing `.env`, Gradle still treats the JS bundle as up to date. Delete `android/app/build/generated/assets/react`, `android/app/build/intermediates/assets/release` and `$env:TEMP\metro-*` before `assembleRelease`, or the old values ship.
- Without `.env` the Supabase client uses a placeholder URL so the app still opens; sign-in then fails with a network error.

### Decisions made where the spec was silent (keep unless the user objects)

- Date and receipt OCR photograph then read, rather than reading live frames. Avoids `react-native-worklets`; barcode scanning is live.
- Product has `packAmount` (base units per pack), used for "low at N packs" and for pack count to starting amount.
- A Location is treated as a freezer if its name contains "freez".
- On a barcode or Location-name clash, the row already on the server is "the older row" and wins.
- A Household is capped at two Members.
- `dirty` is `0` or the local time of the last change, so a push only clears it if the row was not edited mid-push.
