-- =============================================================================
-- rls_isolation.sql — tenant isolation proof (run against a provisioned DB)
--
-- This harness demonstrates the critical isolation guarantees from the master
-- spec section 14. It is NOT run in CI by default because it needs a live
-- Postgres with the migrations applied. Run it with pgTAP:
--
--   psql "$DATABASE_URL" -f db/migrations/0001_... (apply all migrations)
--   psql "$DATABASE_URL" -f db/tests/rls_isolation.sql
--
-- It uses set_config('request.jwt.claims', ...) to simulate two different
-- authenticated users the same way Supabase/PostgREST does, then asserts that
-- Merchant A cannot read Merchant B's private rows.
-- =============================================================================

begin;

-- Simulate the PostgREST runtime roles.
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

-- --- Fixtures ----------------------------------------------------------------
-- Two tenants, two owners. (auth.users is managed by Supabase; we insert
-- directly here for the test only.)
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

insert into public.user_profiles (id, full_name, platform_role) values
  ('00000000-0000-0000-0000-00000000000a', 'Owner A', 'merchant_user'),
  ('00000000-0000-0000-0000-00000000000b', 'Owner B', 'merchant_user')
on conflict do nothing;

insert into public.tenants (id, name, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Store A', '00000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Store B', '00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'owner', 'active')
on conflict do nothing;

insert into public.stores (tenant_id, slug, display_name, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'store-a', 'Store A', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'store-b', 'Store B', 'active')
on conflict do nothing;

-- Private customer rows for each tenant.
insert into public.customers (tenant_id, full_name, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Customer A1', '+910000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Customer B1', '+910000000002')
on conflict do nothing;

-- Merchant-owned payment connections (0014) — highly sensitive.
insert into public.merchant_payment_accounts (tenant_id, provider, status, key_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'razorpay', 'connected', 'rzp_test_AAA1111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'razorpay', 'connected', 'rzp_test_BBB2222222')
on conflict do nothing;

-- Pharmacy verifications (0015) — licence data must not leak across tenants.
insert into public.pharmacy_verifications (tenant_id, status, license_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pending', 'DL-A-123'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'pending', 'DL-B-456')
on conflict do nothing;

-- --- Act as Owner A ----------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

-- EXPECT: Owner A sees exactly their own tenant's customers (1 row), never B's.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.customers
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.customers
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count = 1, 'Owner A should see their own customer';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B customers';
  raise notice 'PASS: Owner A sees % own customer(s), % of Store B (expected 0)', a_count, b_leak;
end $$;

-- EXPECT: leads are invisible to a non-admin merchant.
do $$
declare visible int;
begin
  select count(*) into visible from public.leads;
  assert visible = 0, 'ISOLATION FAILURE: merchant can read leads';
  raise notice 'PASS: merchant sees % leads (expected 0)', visible;
end $$;

-- EXPECT: Owner A sees only their own payment connection, never Store B's.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.merchant_payment_accounts
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.merchant_payment_accounts
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count = 1, 'Owner A should see their own payment connection';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B payment connection';
  raise notice 'PASS: Owner A sees % own payment connection(s), % of Store B (expected 0)', a_count, b_leak;
end $$;

-- EXPECT: Owner A sees only their own pharmacy verification, never Store B's.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.pharmacy_verifications
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.pharmacy_verifications
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count = 1, 'Owner A should see their own pharmacy verification';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B pharmacy verification';
  raise notice 'PASS: Owner A sees % own pharmacy verification(s), % of Store B (expected 0)', a_count, b_leak;
end $$;

-- EXPECT: medicine ordering is OFF by default on a freshly created store.
do $$
declare med boolean;
begin
  select medicine_ordering_enabled into med from public.stores
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert med = false, 'SAFETY FAILURE: medicine ordering should default to false';
  raise notice 'PASS: medicine ordering defaults to disabled';
end $$;

reset role;
rollback; -- never persist test fixtures
