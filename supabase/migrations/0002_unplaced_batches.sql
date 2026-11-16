-- Postgres side of src/db/migrations/0002_unplaced_batches.sql (ADR 0002).
-- A Batch with no Location is "To put away": added without saying where it is kept.
alter table batches alter column location_id drop not null;
