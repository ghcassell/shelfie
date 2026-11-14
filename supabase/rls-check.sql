-- Manual RLS check. Run in the Supabase SQL editor after both Members have joined, with a
-- THIRD auth user that belongs to no Household (create one under Authentication > Users).
-- Replace the uuid below with that user's id. Every count must be 0 and the insert must fail.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

select 'households' as t, count(*) from households
union all select 'members', count(*) from members
union all select 'household_settings', count(*) from household_settings
union all select 'locations', count(*) from locations
union all select 'products', count(*) from products
union all select 'batches', count(*) from batches
union all select 'usage_entries', count(*) from usage_entries
union all select 'shopping_entries', count(*) from shopping_entries
union all select 'receipt_aliases', count(*) from receipt_aliases;

-- Must fail with "new row violates row-level security policy":
insert into locations (id, household_id, name)
  select gen_random_uuid(), id, 'intruder' from (select id from households limit 1) h;
-- (As an outsider the subquery returns no rows, so 0 rows inserted is also a pass.)

rollback;

-- Then repeat with a real Member's id: counts are that Household's rows only, and
--   update usage_entries set amount = 0;   -- must change 0 rows (entries are immutable)
