-- =============================================================================
-- onboarding_permissions.sql — Phase 3 permission & integrity proof
--
-- Run against a provisioned DB with ALL migrations applied (0001–0011):
--   psql "$DATABASE_URL" -f db/tests/onboarding_permissions.sql
--
-- Proves:
--   1. create_merchant is atomic and reserves a unique subdomain.
--   2. Duplicate subdomains are rejected (SLUG_TAKEN).
--   3. A merchant can only see their OWN tenant's onboarding/business rows.
--   4. A merchant cannot mutate another merchant's store (RLS blocks it).
-- =============================================================================

begin;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

-- Two auth users + profiles.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1')
on conflict do nothing;
insert into public.user_profiles (id, full_name, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Owner A', 'customer'),
  ('00000000-0000-0000-0000-0000000000b1', 'Owner B', 'customer')
on conflict do nothing;

-- Create two merchants (as the server/service role would) + duplicate check.
do $$
declare
  ta uuid;
  tb uuid;
  v_blocked boolean := false;
begin
  ta := public.create_merchant(
    '00000000-0000-0000-0000-0000000000a1', 'Store A', 'single_store',
    'store-a'::citext, 'Store A', null, 'test.example');
  tb := public.create_merchant(
    '00000000-0000-0000-0000-0000000000b1', 'Store B', 'single_store',
    'store-b'::citext, 'Store B', null, 'test.example');
  assert ta is not null and tb is not null, 'merchants should be created';
  raise notice 'PASS: two merchants created (% , %)', ta, tb;

  -- Duplicate subdomain must be rejected.
  begin
    perform public.create_merchant(
      '00000000-0000-0000-0000-0000000000b1', 'Dupe', 'single_store',
      'store-a'::citext, 'Dupe', null, 'test.example');
  exception when others then
    if sqlerrm = 'SLUG_TAKEN' then v_blocked := true; else raise; end if;
  end;
  assert v_blocked, 'duplicate subdomain should be rejected';
  raise notice 'PASS: duplicate subdomain rejected (SLUG_TAKEN)';
end $$;

-- Act as Owner B and verify isolation.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}',
  true
);

do $$
declare onboarding_visible int; business_visible int; rows_changed int;
begin
  -- B must see ONLY their own onboarding + business rows (1 each of two).
  select count(*) into onboarding_visible from public.merchant_onboarding;
  select count(*) into business_visible from public.business_profiles;
  assert onboarding_visible = 1,
    format('ISOLATION FAILURE: B sees %s onboarding rows (expected 1)', onboarding_visible);
  assert business_visible = 1,
    format('ISOLATION FAILURE: B sees %s business rows (expected 1)', business_visible);
  raise notice 'PASS: Owner B sees only their own onboarding/business row';

  -- B cannot mutate Store A (RLS filters the update to 0 rows).
  update public.stores set status = 'active' where slug = 'store-a'::citext;
  get diagnostics rows_changed = row_count;
  assert rows_changed = 0, 'ISOLATION FAILURE: B modified Store A';
  raise notice 'PASS: Owner B cannot modify Store A (0 rows affected)';
end $$;

reset role;
rollback; -- never persist test fixtures
