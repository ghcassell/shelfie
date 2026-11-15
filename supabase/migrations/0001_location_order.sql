-- Postgres side of src/db/migrations/0001_location_order.sql (ADR 0002).
alter table locations add column sort_order integer not null default 0;
