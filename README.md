# Shelfie

Shared, offline-first Android pantry app for one Household. Spec: `SPEC.md`. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`, `.wayfinder/tickets/`.

## Layout

- `src/domain/` pure TypeScript rules (remaining amount, expiry, urgency, low stock, date and receipt parsers, waste, export). Jest-tested, no React or SQLite imports.
- `src/db/` Drizzle schema, migrations, repositories (every write goes through here and marks rows dirty).
- `src/sync/` push/pull engine, Supabase client, auth. The only place `supabase-js` is used.
- `src/features/` screens: larder, add, receipt, shopping, settings. `src/app/` holds only thin Expo Router route files.
- `src/ui/` theme tokens and shared components.
- `supabase/` Postgres migrations (tables, RLS, Household functions), the `receipt-ai` Edge Function, `rls-check.sql`.

## Commands

```sh
npm test            # Jest: domain rules + sync engine (in-memory SQLite)
npm run typecheck
npm run db:generate # after editing src/db/schema.ts; then hand-write the same-numbered file in supabase/migrations/
npm run apk         # release APK onto a connected phone (npx expo run:android --variant release)
```

Dependencies install with `legacy-peer-deps` (set in `.npmrc`) because `react-native-vision-camera-mlkit` asks for `@expo/config-plugins ^57`.

## One-time setup

1. **Supabase project** (Free plan). In the SQL editor run `supabase/migrations/0000_init.sql`, or `supabase db push` with the CLI.
2. **Email code sign-in.** Authentication > Email Templates > Magic Link: put `{{ .Token }}` in the body so the email carries a 6-digit code rather than only a link. The built-in email sender is heavily rate-limited (a few emails an hour); fine for two people.
3. **App env.** Copy `.env.example` to `.env` and fill in the project URL and anon key.
4. **Receipt AI (optional).** `supabase secrets set GEMINI_API_KEY=...` (free-tier key from aistudio.google.com, no billing attached) then `supabase functions deploy receipt-ai`. The key is never in the app or this repo.
5. **Types (optional).** `supabase gen types typescript --project-id <id> > src/sync/database.types.ts`.
6. **Check RLS** once both people have joined: follow `supabase/rls-check.sql`.

## Build and install

`npm run apk` with a phone connected over USB, or build without a phone and side-load the file:

```sh
npm run android:prebuild
cd android && ./gradlew assembleRelease     # android/app/build/outputs/apk/release/app-release.apk
adb install app/build/outputs/apk/release/app-release.apk
```

**Windows path limit.** The native (C++) step fails on Windows with `ninja: error: mkdir(...): No such file or directory` because object paths exceed 260 characters. It needs both: long paths enabled (admin PowerShell: `Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled 1`, then restart the terminal) and Ninja 1.12 or newer (the SDK's CMake 3.22.1 ships 1.10.2; install a newer CMake from the Android Studio SDK Manager, or replace `ninja.exe` in `<sdk>/cmake/3.22.1/bin`). Not yet verified on this machine.

`android/` is generated; never edit it by hand. `expo run:android` (and every `android:*` script) only generates it when the folder is missing, so after changing `app.json`, a config plugin (`plugins/`), or adding a package with native code, run `npm run android:prebuild` before the next install. If you skip it, the change silently doesn't reach the app. Prebuild wipes `android/`, so the next build is a full native rebuild (several minutes).

**Signing.** Out of the box the release APK is signed with the Android debug keystore, which differs per computer. For one stable keystore kept outside the repo, create it once and point Gradle at it from your user-level `~/.gradle/gradle.properties`:

```sh
keytool -genkeypair -v -keystore ~/shelfie.keystore -alias shelfie -keyalg RSA -keysize 2048 -validity 10000
```

```properties
android.injected.signing.store.file=C:/Users/you/shelfie.keystore
android.injected.signing.store.password=...
android.injected.signing.key.alias=shelfie
android.injected.signing.key.password=...
```

Back the keystore up. Losing it means uninstalling to update, which wipes local data: Export a backup first (cloud data re-pulls on sign-in).

## Operating notes

- Supabase pauses a Free project after about a week without activity. The app shows "Sync unavailable" and keeps working; resume the project from the Supabase dashboard.
- No automatic backups: use Settings > Export.
- Parser test corpora (`src/domain/parsers.test.ts`) are placeholder strings until real label and receipt text is collected (SPEC section 9).
