-- =============================================================================
-- checkout_orders.sql — COD checkout correctness proof (run on a provisioned DB)
--
-- Exercises the Phase 6 transactional functions directly. NOT run in CI (needs a
-- live Postgres with all migrations 0001–0018 applied):
--   psql "$DATABASE_URL" -f db/tests/checkout_orders.sql
--
-- Proves:
--   1. place_order is idempotent — same idempotency key returns the SAME order
--      (created=false) and never creates a duplicate.
--   2. Stock is decremented on order; the last unit cannot be oversold.
--   3. cancel_order restores stock atomically.
-- =============================================================================

begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1') on conflict do nothing;
insert into public.user_profiles (id, full_name, platform_role) values
  ('00000000-0000-0000-0000-0000000000c1', 'Owner C', 'merchant_user') on conflict do nothing;
insert into public.tenants (id, name, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'Store C', '00000000-0000-0000-0000-0000000000c1') on conflict do nothing;
insert into public.stores (tenant_id, slug, display_name, status, accepting_orders) values
  ('cccccccc-0000-0000-0000-000000000001', 'store-c', 'Store C', 'active', true) on conflict do nothing;

-- One published product with exactly ONE unit in stock.
insert into public.products (id, tenant_id, slug, name, price_paise, status, is_visible)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'rice-1kg', 'Rice 1kg', 5000, 'published', true)
on conflict do nothing;
insert into public.inventory_levels (tenant_id, product_id, variant_id, on_hand, reserved)
values ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', null, 1, 0)
on conflict do nothing;

-- 1 + 2. First order consumes the unit.
do $$
declare r record; on_hand_after int;
begin
  select * into r from public.place_order(
    'cccccccc-0000-0000-0000-000000000001', 'idem-001', 'cod',
    '{"full_name":"Asha","phone":"9876500001"}'::jsonb,
    '{"line1":"1 Main Rd","pincode":"560001"}'::jsonb,
    '[{"product_id":"dddddddd-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    0, null);
  assert r.created = true, 'first order should be created';
  select on_hand into on_hand_after from public.inventory_levels
    where product_id = 'dddddddd-0000-0000-0000-000000000001';
  assert on_hand_after = 0, format('stock should be 0 after sale, got %s', on_hand_after);
  raise notice 'PASS: first order created, stock decremented to 0';
end $$;

-- 1. Idempotent repeat: same key => same order, created=false, no duplicate.
do $$
declare r record; order_count int;
begin
  select * into r from public.place_order(
    'cccccccc-0000-0000-0000-000000000001', 'idem-001', 'cod',
    '{"full_name":"Asha","phone":"9876500001"}'::jsonb,
    '{"line1":"1 Main Rd","pincode":"560001"}'::jsonb,
    '[{"product_id":"dddddddd-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    0, null);
  assert r.created = false, 'repeat with same idempotency key must not create a new order';
  select count(*) into order_count from public.orders where tenant_id = 'cccccccc-0000-0000-0000-000000000001';
  assert order_count = 1, format('should still be exactly 1 order, got %s', order_count);
  raise notice 'PASS: duplicate submission returned the same order (no duplicate)';
end $$;

-- 2. Oversell guard: a new order for the (now zero) last unit must fail.
do $$
declare blocked boolean := false;
begin
  begin
    perform public.place_order(
      'cccccccc-0000-0000-0000-000000000001', 'idem-002', 'cod',
      '{"full_name":"Ravi","phone":"9876500002"}'::jsonb,
      '{"line1":"2 Main Rd","pincode":"560001"}'::jsonb,
      '[{"product_id":"dddddddd-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      0, null);
  exception when others then
    if sqlerrm like 'insufficient_stock%' then blocked := true; else raise; end if;
  end;
  assert blocked, 'oversell of the last unit must be rejected';
  raise notice 'PASS: cannot oversell the last unit';
end $$;

-- 3. Cancel restores stock.
do $$
declare oid uuid; on_hand_after int;
begin
  select id into oid from public.orders where tenant_id = 'cccccccc-0000-0000-0000-000000000001' limit 1;
  perform public.cancel_order(oid, 'cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'test');
  select on_hand into on_hand_after from public.inventory_levels
    where product_id = 'dddddddd-0000-0000-0000-000000000001';
  assert on_hand_after = 1, format('stock should be restored to 1 after cancel, got %s', on_hand_after);
  raise notice 'PASS: cancel restored stock to 1';
end $$;

rollback; -- never persist test fixtures
