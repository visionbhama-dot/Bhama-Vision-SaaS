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

-- Products (0016): private DRAFT products for each tenant. (Published products
-- of an active store are intentionally world-readable for the storefront, so
-- isolation is proven with private draft rows, not public listings.)
insert into public.products (tenant_id, slug, name, price_paise, status, is_visible) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a-item', 'A Draft Item', 1000, 'draft', false),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b-item', 'B Draft Item', 2000, 'draft', false)
on conflict do nothing;

-- Import summaries (0016) — tenant-scoped.
insert into public.merchant_catalogue_imports (tenant_id, source, total_requested, created_count) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'catalogue', 5, 5),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'catalogue', 9, 9)
on conflict do nothing;

-- Orders (0018) — one per tenant. Customer order details must never leak.
insert into public.orders (tenant_id, number, status, payment_method, payment_state, subtotal_paise, delivery_paise, total_paise)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ORD-A-0001', 'placed', 'cod', 'pending', 1000, 0, 1000),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'ORD-B-0001', 'placed', 'cod', 'pending', 2000, 0, 2000)
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

-- EXPECT: Owner A sees only their own products, never Store B's.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.products
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.products
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count >= 1, 'Owner A should see their own product';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B products';
  raise notice 'PASS: Owner A sees % own product(s), % of Store B (expected 0)', a_count, b_leak;
end $$;

-- EXPECT: Owner A cannot modify Store B's product (RLS filters update to 0 rows).
do $$
declare rows_changed int;
begin
  update public.products set price_paise = 1 where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics rows_changed = row_count;
  assert rows_changed = 0, 'ISOLATION FAILURE: Owner A modified Store B products';
  raise notice 'PASS: Owner A cannot modify Store B products (0 rows affected)';
end $$;

-- EXPECT: import summaries are isolated per tenant.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.merchant_catalogue_imports
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.merchant_catalogue_imports
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count = 1, 'Owner A should see their own import summary';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B import summaries';
  raise notice 'PASS: import summaries isolated (% own, % of B)', a_count, b_leak;
end $$;

-- EXPECT: the shared master catalogue IS readable by a signed-in merchant
-- (it is platform-owned, not tenant-scoped). Requires seed 0017 applied.
do $$
declare packs int;
begin
  select count(*) into packs from public.catalogue_packs where is_active;
  assert packs >= 1, 'Merchant should be able to read active catalogue packs';
  raise notice 'PASS: merchant can read % active catalogue pack(s)', packs;
end $$;

-- EXPECT: Owner A sees only their own orders, never Store B's.
do $$
declare a_count int; b_leak int;
begin
  select count(*) into a_count from public.orders where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into b_leak from public.orders where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert a_count = 1, 'Owner A should see their own order';
  assert b_leak = 0, 'ISOLATION FAILURE: Owner A can read Store B orders';
  raise notice 'PASS: Owner A sees % own order(s), % of Store B (expected 0)', a_count, b_leak;
end $$;

-- EXPECT: Owner A cannot modify Store B's order (RLS filters update to 0 rows).
do $$
declare rows_changed int;
begin
  update public.orders set status = 'delivered' where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics rows_changed = row_count;
  assert rows_changed = 0, 'ISOLATION FAILURE: Owner A modified Store B order';
  raise notice 'PASS: Owner A cannot modify Store B orders (0 rows affected)';
end $$;

reset role;
rollback; -- never persist test fixtures
