-- =============================================================================
-- 0005_customers_orders.sql
-- Customers, carts, orders, order payments, refunds, coupons.
-- (Payment System B: grocery customers paying their store/marketplace.)
-- Order money fields are immutable snapshots preserved for audit.
-- =============================================================================

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references public.user_profiles(id) on delete set null,
  full_name   text not null default '',
  phone       text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customers_tenant_phone unique (tenant_id, phone)
);
create index if not exists idx_customers_tenant on public.customers(tenant_id);
create trigger trg_customers_updated
  before update on public.customers
  for each row execute function app.set_updated_at();

create table if not exists public.customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  label        text,
  line1        text not null,
  line2        text,
  city         text,
  pincode      text,
  lat          double precision,
  lng          double precision,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_addresses_customer on public.customer_addresses(customer_id);

create table if not exists public.delivery_zones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  pincodes      text[] not null default '{}',
  fee_paise     bigint not null default 0 check (fee_paise >= 0),
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_zones_tenant on public.delivery_zones(tenant_id);

create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  code           citext not null,
  discount_type  text not null check (discount_type in ('percent','fixed')),
  discount_value int not null check (discount_value >= 0), -- percent (bps) or paise
  min_order_paise bigint not null default 0,
  usage_limit    int,
  used_count     int not null default 0,
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint coupons_tenant_code unique (tenant_id, code)
);

create table if not exists public.carts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  session_token text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_carts_updated
  before update on public.carts
  for each row execute function app.set_updated_at();

create table if not exists public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references public.carts(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  variant_id  uuid references public.product_variants(id),
  quantity    int not null check (quantity > 0),
  created_at  timestamptz not null default now(),
  constraint cart_items_unique unique (cart_id, product_id, variant_id)
);

-- --- orders ------------------------------------------------------------------
do $$ begin
  create type order_status as enum (
    'placed', 'accepted', 'preparing', 'packed', 'out_for_delivery',
    'delivered', 'cancelled', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cod', 'online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_state as enum (
    'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  -- For marketplace: parent order; vendor suborders reference this.
  parent_order_id  uuid references public.orders(id) on delete cascade,
  vendor_id        uuid, -- FK in 0007; null for single-store / parent order
  number           text not null,
  customer_id      uuid references public.customers(id),
  status           order_status not null default 'placed',
  payment_method   payment_method not null,
  payment_state    payment_state not null default 'pending',
  -- Immutable monetary snapshot (paise). Totals are computed server-side.
  subtotal_paise   bigint not null check (subtotal_paise >= 0),
  discount_paise   bigint not null default 0 check (discount_paise >= 0),
  delivery_paise   bigint not null default 0 check (delivery_paise >= 0),
  tax_paise        bigint not null default 0 check (tax_paise >= 0),
  total_paise      bigint not null check (total_paise >= 0),
  coupon_code      citext,
  delivery_address jsonb,
  notes            text,
  placed_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_tenant_number unique (tenant_id, number)
);
create index if not exists idx_orders_tenant on public.orders(tenant_id);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(tenant_id, status);
create index if not exists idx_orders_parent on public.orders(parent_order_id);
create trigger trg_orders_updated
  before update on public.orders
  for each row execute function app.set_updated_at();

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid, -- line-item ownership for marketplace (FK in 0007)
  product_id    uuid references public.products(id),
  variant_id    uuid references public.product_variants(id),
  -- Snapshot of name/price at purchase time (immutable).
  name_snapshot text not null,
  unit_snapshot text,
  price_paise   bigint not null check (price_paise >= 0),
  tax_rate_bps  int not null default 0,
  quantity      int not null check (quantity > 0),
  line_total_paise bigint not null check (line_total_paise >= 0)
);
create index if not exists idx_order_items_order on public.order_items(order_id);

create table if not exists public.order_status_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  status      order_status not null,
  note        text,
  created_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_status_events_order on public.order_status_events(order_id);

create table if not exists public.order_payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  method             payment_method not null,
  provider           text,
  provider_order_id  text,
  provider_payment_id text,
  amount_paise       bigint not null check (amount_paise >= 0),
  state              payment_state not null default 'pending',
  idempotency_key    text,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  -- Duplicate webhook protection.
  constraint uq_order_payment_idem unique (provider, idempotency_key)
);
create index if not exists idx_order_payments_order on public.order_payments(order_id);

create table if not exists public.refunds (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  amount_paise  bigint not null check (amount_paise >= 0),
  reason        text,
  provider_refund_id text,
  status        text not null default 'requested',
  approved_by   uuid references public.user_profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_refunds_order on public.refunds(order_id);

create table if not exists public.coupon_redemptions (
  id           uuid primary key default gen_random_uuid(),
  coupon_id    uuid not null references public.coupons(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  customer_id  uuid references public.customers(id),
  created_at   timestamptz not null default now()
);
