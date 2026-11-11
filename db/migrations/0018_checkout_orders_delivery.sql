-- =============================================================================
-- 0018_checkout_orders_delivery.sql  (Phase 6 — customer checkout, orders, COD)
--
-- Adds store-level checkout/delivery settings, order idempotency + a public
-- tracking token, encrypted merchant payment secrets, a webhook-event dedup
-- table, and two transactional functions:
--   * place_order     — atomic, oversell-safe, duplicate-safe order creation
--                       (COD or online), with server-side price snapshots.
--   * cancel_order     — atomic cancellation that restores stock.
--
-- Both functions are SECURITY DEFINER with a pinned search_path and EXECUTE
-- revoked from anon/authenticated — only the trusted server (service role) may
-- call them. Checkout never trusts browser-supplied prices or totals; the
-- function recomputes everything from the products table under row locks.
--
-- Forward-only; earlier migrations (0001–0017) untouched.
-- =============================================================================

-- --- Store checkout / delivery settings -------------------------------------
alter table public.stores
  add column if not exists accepting_orders boolean not null default true,
  add column if not exists delivery_fee_paise bigint not null default 0 check (delivery_fee_paise >= 0),
  add column if not exists free_delivery_threshold_paise bigint check (free_delivery_threshold_paise >= 0),
  add column if not exists prep_minutes int check (prep_minutes >= 0),
  add column if not exists delivery_minutes int check (delivery_minutes >= 0),
  add column if not exists serviceable_pincodes text[] not null default '{}',
  add column if not exists opening_hours jsonb not null default '{}'::jsonb;

-- --- Orders: idempotency + public tracking token + paid timestamp ------------
alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create unique index if not exists uq_orders_tenant_idem
  on public.orders(tenant_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists uq_orders_public_token on public.orders(public_token);

-- --- Payment secrets at rest: encrypted, never plaintext ---------------------
-- key_id (publishable) is already stored. The API secret + webhook secret are
-- stored as AES-GCM ciphertext (encrypted by the Worker with PAYMENTS_ENC_KEY);
-- the plaintext never touches the database, the browser, or logs.
alter table public.merchant_payment_accounts
  add column if not exists secret_ciphertext text,
  add column if not exists secret_iv text,
  add column if not exists webhook_secret_ciphertext text,
  add column if not exists webhook_secret_iv text;

-- --- Webhook event dedup (atomic once-only processing) -----------------------
create table if not exists public.payment_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  tenant_id    uuid references public.tenants(id) on delete set null,
  order_id     uuid references public.orders(id) on delete set null,
  status       text not null default 'received',  -- received|processed|ignored
  raw          jsonb,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  constraint uq_webhook_provider_event unique (provider, event_id)
);
create index if not exists idx_webhook_events_order on public.payment_webhook_events(order_id);
alter table public.payment_webhook_events enable row level security;
-- No anon/authenticated policy: only the service role (webhook handler) touches it.
drop policy if exists webhook_events_admin on public.payment_webhook_events;
create policy webhook_events_admin on public.payment_webhook_events
  for select using (app.is_platform_admin());

-- --- place_order -------------------------------------------------------------
create or replace function public.place_order(
  p_tenant          uuid,
  p_idempotency     text,
  p_payment_method  payment_method,
  p_customer        jsonb,   -- { full_name, phone, email }
  p_address         jsonb,   -- { line1, landmark, city, pincode, instructions }
  p_items           jsonb,   -- [ { product_id, variant_id, quantity } ]
  p_delivery_paise  bigint,
  p_notes           text
)
returns table (order_id uuid, order_number text, public_token uuid, total_paise bigint, created boolean)
language plpgsql
security definer
set search_path = public, app
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
  -- Idempotency: return the existing order for a repeated submission.
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

  -- Medicine safety: a pharmacy store cannot take orders unless medicine
  -- ordering has been explicitly enabled after review.
  if v_store.category = 'pharmacy' and coalesce(v_store.medicine_ordering_enabled, false) = false then
    raise exception 'medicine_ordering_disabled';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  -- Validate each line against live, published data under a row lock.
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

    -- Stock check + decrement when inventory is tracked for this line.
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

  -- Find or create the customer by (tenant, phone).
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

  -- Unique order number (retry on the rare collision).
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
      ) returning id, public_token into v_order_id, v_token;
      exit;
    exception when unique_violation then
      if v_attempts >= 5 then raise; end if;
    end;
  end loop;

  -- Order items with immutable price snapshots.
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

-- --- cancel_order (restores stock) ------------------------------------------
create or replace function public.cancel_order(
  p_order uuid,
  p_tenant uuid,
  p_actor uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_order public.orders;
  v_item  public.order_items;
  v_inv   public.inventory_levels;
begin
  select * into v_order from public.orders where id = p_order and tenant_id = p_tenant for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status in ('delivered', 'cancelled', 'rejected') then
    raise exception 'order_not_cancellable';
  end if;

  for v_item in select * from public.order_items where order_id = p_order loop
    select * into v_inv from public.inventory_levels
      where product_id = v_item.product_id and variant_id is not distinct from v_item.variant_id
      for update;
    if found then
      update public.inventory_levels set on_hand = on_hand + v_item.quantity where id = v_inv.id;
      insert into public.inventory_movements (tenant_id, inventory_id, delta, reason, reference, created_by)
        values (p_tenant, v_inv.id, v_item.quantity, 'cancel', 'order:' || p_order::text, p_actor);
    end if;
  end loop;

  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order;
  insert into public.order_status_events (order_id, tenant_id, status, note, created_by)
    values (p_order, p_tenant, 'cancelled', coalesce(p_reason, 'Cancelled'), p_actor);
  insert into public.audit_logs (actor_id, tenant_id, action, target_type, target_id, detail)
    values (p_actor, p_tenant, 'order.cancel', 'order', p_order::text, jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

revoke all on function public.cancel_order(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, uuid, uuid, text) to service_role;
