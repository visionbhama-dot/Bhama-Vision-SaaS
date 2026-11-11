-- =============================================================================
-- 0022_fix_place_order_extensions_search_path.sql  (Phase 8 — hosted checkout fix)
--
-- CRITICAL: place_order() pinned `search_path = public, app` (since 0018) but
-- generates the order number with gen_random_bytes() from the pgcrypto
-- extension. On hosted Supabase pgcrypto lives in the `extensions` schema (NOT
-- public), so the call failed at runtime with:
--     ERROR: function gen_random_bytes(integer) does not exist
-- breaking EVERY checkout. The PGlite test harness masked this because its
-- pgcrypto contrib module loads into `public`.
--
-- Fix: recreate place_order with `search_path = public, app, extensions` so the
-- pgcrypto function resolves on Supabase. Harmless on PGlite (a missing schema
-- in search_path is ignored; gen_random_bytes still resolves from public there).
-- Body is otherwise identical to 0019 (qualified orders.public_token).
-- Forward-only; EXECUTE remains service_role-only (re-asserted).
-- =============================================================================

create or replace function public.place_order(
  p_tenant          uuid,
  p_idempotency     text,
  p_payment_method  payment_method,
  p_customer        jsonb,
  p_address         jsonb,
  p_items           jsonb,
  p_delivery_paise  bigint,
  p_notes           text
)
returns table (order_id uuid, order_number text, public_token uuid, total_paise bigint, created boolean)
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_store        public.stores;
  v_existing     public.orders;
  v_customer_id  uuid;
  v_order_id     uuid;
  v_number       text;
  v_token        uuid;
  v_subtotal     bigint := 0;
  v_total        bigint := 0;
  v_delivery     bigint := greatest(coalesce(p_delivery_paise, 0), 0);
  v_item         jsonb;
  v_product      public.products;
  v_qty          int;
  v_variant      uuid;
  v_inv          public.inventory_levels;
  v_line_total   bigint;
  v_phone        text := nullif(trim(p_customer ->> 'phone'), '');
  v_attempts     int := 0;
begin
  if p_idempotency is not null then
    select * into v_existing from public.orders
      where tenant_id = p_tenant and idempotency_key = p_idempotency
      limit 1;
    if found then
      return query select v_existing.id, v_existing.number, v_existing.public_token, v_existing.total_paise, false;
      return;
    end if;
  end if;

  select * into v_store from public.stores where tenant_id = p_tenant limit 1;
  if not found then raise exception 'store_not_found'; end if;
  if v_store.status <> 'active' then raise exception 'store_not_active'; end if;
  if v_store.accepting_orders is false then raise exception 'not_accepting_orders'; end if;

  if v_store.category = 'pharmacy' and coalesce(v_store.medicine_ordering_enabled, false) = false then
    raise exception 'medicine_ordering_disabled';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest((v_item ->> 'quantity')::int, 0);
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    if v_qty <= 0 then raise exception 'invalid_quantity'; end if;

    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and tenant_id = p_tenant
      for update;
    if not found then raise exception 'product_not_found'; end if;
    if v_product.status <> 'published' or v_product.is_visible = false or v_product.archived_at is not null then
      raise exception 'product_unavailable:%', v_product.name;
    end if;

    select * into v_inv from public.inventory_levels
      where product_id = v_product.id and variant_id is not distinct from v_variant
      for update;
    if found then
      if v_inv.allow_oversell = false and (v_inv.on_hand - v_inv.reserved) < v_qty then
        raise exception 'insufficient_stock:%', v_product.name;
      end if;
      update public.inventory_levels set on_hand = on_hand - v_qty where id = v_inv.id;
      insert into public.inventory_movements (tenant_id, inventory_id, delta, reason, reference)
        values (p_tenant, v_inv.id, -v_qty, 'sale', 'order:pending');
    end if;

    v_line_total := v_product.price_paise * v_qty;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_total := v_subtotal + v_delivery;

  if v_phone is not null then
    select id into v_customer_id from public.customers
      where tenant_id = p_tenant and phone = v_phone limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (tenant_id, full_name, phone, email)
      values (p_tenant, coalesce(p_customer ->> 'full_name', ''), v_phone, nullif(p_customer ->> 'email', ''))
      returning id into v_customer_id;
  else
    update public.customers set full_name = coalesce(p_customer ->> 'full_name', full_name)
      where id = v_customer_id;
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_number := 'ORD-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
                || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    begin
      insert into public.orders (
        tenant_id, number, customer_id, status, payment_method, payment_state,
        subtotal_paise, discount_paise, delivery_paise, tax_paise, total_paise,
        delivery_address, notes, idempotency_key
      ) values (
        p_tenant, v_number, v_customer_id, 'placed', p_payment_method, 'pending',
        v_subtotal, 0, v_delivery, 0, v_total,
        p_address || p_customer, p_notes, p_idempotency
      ) returning orders.id, orders.public_token into v_order_id, v_token;
      exit;
    exception when unique_violation then
      if v_attempts >= 5 then raise; end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest((v_item ->> 'quantity')::int, 0);
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    insert into public.order_items (
      order_id, tenant_id, product_id, variant_id, name_snapshot, unit_snapshot,
      price_paise, tax_rate_bps, quantity, line_total_paise
    ) values (
      v_order_id, p_tenant, v_product.id, v_variant, v_product.name, v_product.unit,
      v_product.price_paise, coalesce(v_product.tax_rate_bps, 0), v_qty, v_product.price_paise * v_qty
    );
  end loop;

  insert into public.order_status_events (order_id, tenant_id, status, note)
    values (v_order_id, p_tenant, 'placed', 'Order placed by customer');

  insert into public.order_payments (order_id, tenant_id, method, provider, amount_paise, state, idempotency_key)
    values (v_order_id, p_tenant, p_payment_method,
            case when p_payment_method = 'online' then 'razorpay' else null end,
            v_total, 'pending', p_idempotency);

  return query select v_order_id, v_number, v_token, v_total, true;
end;
$$;

revoke all on function public.place_order(uuid, text, payment_method, jsonb, jsonb, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, text, payment_method, jsonb, jsonb, jsonb, bigint, text) to service_role;
