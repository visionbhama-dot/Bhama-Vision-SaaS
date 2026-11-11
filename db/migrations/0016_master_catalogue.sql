-- =============================================================================
-- 0016_master_catalogue.sql  (Phase 5 — master catalogue + import + listing status)
--
-- Adds a PLATFORM-OWNED master catalogue that is completely separate from each
-- merchant's own product inventory, plus the columns a merchant product needs to
-- (a) start life as a DRAFT after import and (b) be deduplicated against the
-- master item it came from.
--
-- Hard rules encoded here:
--   * Merchant price / stock / SKU / visibility / listing status live ONLY on
--     public.products (per-tenant). They never touch master_products.
--   * A tenant can hold a given master product at most once — the unique partial
--     index makes "import this pack" idempotent at the DATABASE level, so a
--     double-click or retry can never create duplicates.
--   * Imported products default to status 'draft' + is_visible=false, so nothing
--     reaches a storefront until the merchant confirms price/stock and publishes.
--
-- Forward-only; earlier migrations (0001–0015) untouched. Idempotent where
-- practical.
-- =============================================================================

do $$ begin
  create type master_classification as enum ('generic', 'branded');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'illustrative' = clearly-labelled sample data (our seeded generics).
  create type master_verification as enum ('illustrative', 'unverified', 'verified');
exception when duplicate_object then null; end $$;

-- --- master_products: the shared, platform-owned catalogue -------------------
create table if not exists public.master_products (
  id             uuid primary key default gen_random_uuid(),
  -- Stable business key used for idempotent seeding + import dedup.
  code           text not null unique,
  name           text not null,
  category       text not null,
  subcategory    text,
  brand          text,
  classification master_classification not null default 'generic',
  pack_size      text,
  unit           text,
  variant_label  text,
  barcode        text,                 -- GTIN; only when legitimately known
  description    text,
  image_ref      text,                 -- reference only; no copyrighted scraping
  data_source    text not null default 'bhama_vision_sample',
  verification_status master_verification not null default 'illustrative',
  metadata       jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_master_products_category
  on public.master_products(category) where is_active;
create index if not exists idx_master_products_name on public.master_products(name);
create trigger trg_master_products_updated
  before update on public.master_products
  for each row execute function app.set_updated_at();

-- --- catalogue_packs: curated ready-made bundles -----------------------------
create table if not exists public.catalogue_packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  category    text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.catalogue_pack_items (
  pack_id           uuid not null references public.catalogue_packs(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete cascade,
  position          int not null default 0,
  primary key (pack_id, master_product_id)
);
create index if not exists idx_pack_items_master
  on public.catalogue_pack_items(master_product_id);

-- --- merchant_catalogue_imports: per-batch summary (audit + reporting) -------
create table if not exists public.merchant_catalogue_imports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  pack_id         uuid references public.catalogue_packs(id) on delete set null,
  source          text not null default 'catalogue',  -- catalogue | csv
  status          text not null default 'completed',  -- completed | partial | failed
  total_requested int not null default 0,
  created_count   int not null default 0,
  skipped_count   int not null default 0,              -- duplicates / already owned
  failed_count    int not null default 0,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_catalogue_imports_tenant
  on public.merchant_catalogue_imports(tenant_id);

-- --- products: listing status, source, denormalized category, master link ----
do $$ begin
  create type product_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

alter table public.products
  add column if not exists status product_status not null default 'published',
  add column if not exists source text not null default 'manual',       -- manual|catalogue|csv
  add column if not exists category text,
  add column if not exists master_product_id uuid references public.master_products(id) on delete set null;

-- Database-level idempotency: one row per (tenant, master product).
create unique index if not exists uq_products_tenant_master
  on public.products(tenant_id, master_product_id)
  where master_product_id is not null;

-- --- RLS ---------------------------------------------------------------------
alter table public.master_products            enable row level security;
alter table public.catalogue_packs            enable row level security;
alter table public.catalogue_pack_items       enable row level security;
alter table public.merchant_catalogue_imports enable row level security;

-- Master catalogue is readable by any signed-in/anon caller (so merchants can
-- browse packs before importing). Only platform admins may write it.
drop policy if exists master_products_read on public.master_products;
create policy master_products_read on public.master_products
  for select using (is_active or app.is_platform_admin());
drop policy if exists master_products_admin on public.master_products;
create policy master_products_admin on public.master_products
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

drop policy if exists catalogue_packs_read on public.catalogue_packs;
create policy catalogue_packs_read on public.catalogue_packs
  for select using (is_active or app.is_platform_admin());
drop policy if exists catalogue_packs_admin on public.catalogue_packs;
create policy catalogue_packs_admin on public.catalogue_packs
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

drop policy if exists catalogue_pack_items_read on public.catalogue_pack_items;
create policy catalogue_pack_items_read on public.catalogue_pack_items
  for select using (true);
drop policy if exists catalogue_pack_items_admin on public.catalogue_pack_items;
create policy catalogue_pack_items_admin on public.catalogue_pack_items
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Import summaries are tenant-scoped.
drop policy if exists imports_member_read on public.merchant_catalogue_imports;
create policy imports_member_read on public.merchant_catalogue_imports
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
drop policy if exists imports_member_write on public.merchant_catalogue_imports;
create policy imports_member_write on public.merchant_catalogue_imports
  for all
  using (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());
