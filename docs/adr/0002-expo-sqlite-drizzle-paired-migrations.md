# expo-sqlite with Drizzle, and hand-written paired migrations for SQLite and Postgres

The app is a single Expo (SDK 58) dev-build project. Local storage is `expo-sqlite` with Drizzle ORM on top; the cloud is Supabase Postgres. The two schemas are separate dialects, kept in step by hand: one numbered migration per schema change, with a SQLite file (applied by `drizzle-kit`) and a Postgres file (applied by the Supabase CLI) sharing the same number. Every schema change must touch both.

## Considered Options

- **op-sqlite:** faster, but it was only attractive for PowerSync, which ticket 05 rejected. An extra native module for no benefit at two-user scale.
- **Plain SQL repositories without Drizzle:** fewer dependencies, but loses typed queries and generated local migrations, which matter for an agent building unattended.
- **Generate the Postgres schema from Drizzle too:** two schema files to maintain and generated Postgres SQL that still needs RLS and triggers by hand. Not worth the magic.

## Consequences

- Screens read via Drizzle `useLiveQuery`; the sync engine writes into the same database, so pulled changes appear without a second cache.
- A schema change that touches only one dialect is a bug.
