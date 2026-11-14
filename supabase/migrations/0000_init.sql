-- Postgres side of src/db/migrations/0000_init.sql. Every schema change touches both (ADR 0002).

create extension if not exists pgcrypto;

-- Server clock decides conflicts: phone clocks never do.
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end $$;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  updated_at timestamptz not null default now()
);

create table members (
  id uuid primary key references auth.users (id),
  household_id uuid not null references households (id),
  display_name text not null,
  updated_at timestamptz not null default now()
);

create table household_settings (
  id uuid primary key references households (id), -- single record per Household
  household_id uuid not null references households (id),
  warning_days integer not null default 3,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table locations (
  id uuid primary key,
  household_id uuid not null references households (id),
  name text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index locations_name_unique on locations (household_id, lower(name)) where deleted_at is null;

create table products (
  id uuid primary key,
  household_id uuid not null references households (id),
  name text not null,
  brand text,
  size text,
  category text,
  image_url text,
  barcode text,
  base_unit text not null default 'count' check (base_unit in ('g', 'ml', 'count')),
  pack_amount real not null default 1,
  opened_shelf_life_days integer,
  warning_days integer,
  low_threshold real,
  low_threshold_unit text not null default 'base' check (low_threshold_unit in ('base', 'packs')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index products_barcode_unique on products (household_id, barcode)
  where barcode is not null and deleted_at is null;

-- No foreign keys between synced rows: phones push whatever they hold, and a
-- reference may point at a row merged away or not yet arrived.
create table batches (
  id uuid primary key,
  household_id uuid not null references households (id),
  product_id uuid not null,
  location_id uuid not null,
  starting_amount real not null,
  pack_count integer not null default 1,
  expiry_date date,
  no_expiry boolean not null default false,
  date_kind text not null default 'best_before' check (date_kind in ('use_by', 'best_before')),
  opened_on date,
  price_pence integer,
  added_by uuid not null,
  added_at text not null, -- device time
  split_from_batch_id uuid,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Immutable, append-only: insert and select only (no update/delete policy below).
create table usage_entries (
  id uuid primary key,
  household_id uuid not null references households (id),
  batch_id uuid not null,
  kind text not null check (kind in ('used', 'wasted', 'corrected', 'split')),
  amount real not null,
  member_id uuid not null,
  created_at text not null, -- device time, for display and waste month
  waste_reason text check (waste_reason in ('expired', 'went_off_early', 'didnt_like_it', 'other')),
  reverses_entry_id uuid,
  split_batch_id uuid,
  updated_at timestamptz not null default now()
);

create table shopping_entries (
  id uuid primary key,
  household_id uuid not null references households (id),
  name text not null,
  product_id uuid,
  quantity text,
  added_by text not null, -- Member id or 'auto'
  ticked boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table receipt_aliases (
  id uuid primary key,
  household_id uuid not null references households (id),
  alias text not null,
  product_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['households', 'members', 'household_settings', 'locations', 'products',
                           'batches', 'usage_entries', 'shopping_entries', 'receipt_aliases'] loop
    execute format('create trigger %I_updated_at before insert or update on %I for each row execute function set_updated_at()', t, t);
    execute format('create index %I on %I (updated_at)', t || '_pull', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Row Level Security on household_id. Security definer avoids recursing into members' own policy.
create function my_household() returns uuid language sql stable security definer set search_path = public as $$
  select household_id from members where id = auth.uid()
$$;

create policy households_select on households for select to authenticated using (id = my_household());
create policy members_select on members for select to authenticated using (household_id = my_household());

do $$
declare t text;
begin
  foreach t in array array['household_settings', 'locations', 'products', 'batches', 'shopping_entries', 'receipt_aliases'] loop
    execute format('create policy %I_all on %I for all to authenticated using (household_id = my_household()) with check (household_id = my_household())', t, t);
  end loop;
end $$;

create policy usage_entries_select on usage_entries for select to authenticated using (household_id = my_household());
create policy usage_entries_insert on usage_entries for insert to authenticated with check (household_id = my_household());

-- Joining: one Household per person, no leaving or switching.
create function create_household(display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from members where id = auth.uid()) then raise exception 'Already in a Household'; end if;
  insert into households (name, invite_code)
    values ('Household', upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)))
    returning id into hid;
  insert into members (id, household_id, display_name) values (auth.uid(), hid, display_name);
  insert into household_settings (id, household_id) values (hid, hid);
  return hid;
end $$;

create function join_household(code text, display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from members where id = auth.uid()) then raise exception 'Already in a Household'; end if;
  select id into hid from households where invite_code = upper(trim(code));
  if hid is null then raise exception 'Invite code not found'; end if;
  if (select count(*) from members where household_id = hid) >= 2 then raise exception 'This Household is full'; end if;
  insert into members (id, household_id, display_name) values (auth.uid(), hid, display_name);
  return hid;
end $$;

revoke execute on function create_household(text), join_household(text, text) from public, anon;
grant execute on function create_household(text), join_household(text, text) to authenticated;
