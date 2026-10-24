-- =============================================================================
-- 0004_catalog.sql
-- Categories, products, variants, images, inventory.
-- Every row carries tenant_id for isolation; marketplace rows also carry
-- vendor_id (FK wired up in 0007).
-- =============================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        citext not null,
  position    int not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_tenant_slug_key unique (tenant_id, slug)
);
create index if not exists idx_categories_tenant on public.categories(tenant_id);
create trigger trg_categories_updated
  before update on public.categories
  for each row execute function app.set_updated_at();

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid, -- marketplace ownership (FK in 0007)
  category_id   uuid references public.categories(id) on delete set null,
  name          text not null,
  slug          citext not null,
  description   text,
  brand         text,
  sku           text,
  barcode       text,
  -- base pricing in paise; variants may override
  mrp_paise     bigint check (mrp_paise >= 0),
  price_paise   bigint not null check (price_paise >= 0),
  tax_rate_bps  int not null default 0 check (tax_rate_bps between 0 and 10000), -- basis points
  unit          text,          -- e.g. 'kg', 'litre', 'piece'
  purchase_limit int,          -- per-order cap (null = none)
  is_visible    boolean not null default true,
  -- Logical deletion: archived products stay for historical order integrity.
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint products_tenant_slug_key unique (tenant_id, slug)
);
create index if not exists idx_products_tenant on public.products(tenant_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_visible on public.products(tenant_id, is_visible) where archived_at is null;
create trigger trg_products_updated
  before update on public.products
  for each row execute function app.set_updated_at();

create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  label         text not null,            -- e.g. '1 kg', '500 ml'
  pack_size     text,
  sku           text,
  mrp_paise     bigint check (mrp_paise >= 0),
  price_paise   bigint not null check (price_paise >= 0),
  position      int not null default 0,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_variants_product on public.product_variants(product_id);

create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  url         text not null,
  alt         text,
  position    int not null default 0
);
create index if not exists idx_images_product on public.product_images(product_id);

-- Inventory tracked at variant granularity (or product when no variants).
create table if not exists public.inventory_levels (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete cascade,
  on_hand         int not null default 0,
  reserved        int not null default 0,
  low_stock_at    int not null default 5,
  allow_oversell  boolean not null default false,
  updated_at      timestamptz not null default now(),
  constraint inventory_unique unique (product_id, variant_id),
  -- Stock cannot go negative unless overselling is explicitly allowed.
  constraint inventory_non_negative check (allow_oversell or (on_hand - reserved) >= 0)
);
create index if not exists idx_inventory_tenant on public.inventory_levels(tenant_id);
create trigger trg_inventory_updated
  before update on public.inventory_levels
  for each row execute function app.set_updated_at();

create table if not exists public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  inventory_id  uuid not null references public.inventory_levels(id) on delete cascade,
  delta         int not null,
  reason        text not null,            -- 'sale','restock','adjustment','cancel'
  reference     text,                     -- order id etc.
  created_by    uuid references public.user_profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_movements_inventory on public.inventory_movements(inventory_id);
