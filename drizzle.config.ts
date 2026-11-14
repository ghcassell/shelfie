import { defineConfig } from 'drizzle-kit';

// Local (SQLite) migrations. Every change here needs the same-numbered Postgres
// migration in supabase/migrations/ (ADR 0002).
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
