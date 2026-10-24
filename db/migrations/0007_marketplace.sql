-- =============================================================================
-- 0007_marketplace.sql
-- Vendors for the Marketplace plan + the FKs for vendor_id columns declared
-- earlier. Vendors are isolated from one another (enforced by RLS in 0009).
-- =============================================================================

do $$ begin
  create type vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.vendors (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  slug          citext not null,
  status        vendor_status not null default 'pending',
  contact_email text,
  contact_phone text,
  -- Default commission; per-vendor overrides live in vendor_commissions.
  commission_type  text not null default 'percent' check (commission_type in ('percent','fixed')),
  commission_value int not null default 0 check (commission_value >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint vendors_tenant_slug unique (tenant_id, slug)
);
create index if not exists idx_vendors_tenant on public.vendors(tenant_id);
create trigger trg_vendors_updated
  before update on public.vendors
  for each row execute function app.set_updated_at();

-- Wire up vendor_id foreign keys declared in earlier migrations.
alter table public.tenant_memberships
  drop constraint if exists fk_membership_vendor,
  add constraint fk_membership_vendor
    foreign key (vendor_id) references public.vendors(id) on delete cascade;

alter table public.products
  drop constraint if exists fk_product_vendor,
  add constraint fk_product_vendor
    foreign key (vendor_id) references public.vendors(id) on delete set null;

alter table public.orders
  drop constraint if exists fk_order_vendor,
  add constraint fk_order_vendor
    foreign key (vendor_id) references public.vendors(id) on delete set null;

alter table public.order_items
  drop constraint if exists fk_order_item_vendor,
  add constraint fk_order_item_vendor
    foreign key (vendor_id) references public.vendors(id) on delete set null;

-- Commission records and settlement statements.
create table if not exists public.vendor_commissions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  vendor_id      uuid not null references public.vendors(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  gross_paise    bigint not null check (gross_paise >= 0),
  commission_paise bigint not null check (commission_paise >= 0),
  net_paise      bigint not null check (net_paise >= 0),
  created_at     timestamptz not null default now()
);
create index if not exists idx_commissions_vendor on public.vendor_commissions(vendor_id);

create table if not exists public.vendor_settlements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  vendor_id      uuid not null references public.vendors(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  gross_paise    bigint not null default 0,
  commission_paise bigint not null default 0,
  net_paise      bigint not null default 0,
  -- Manual settlement tracking is the initial, clearly-labeled mode until an
  -- approved marketplace payout integration is connected.
  status         text not null default 'pending',
  settled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_settlements_vendor on public.vendor_settlements(vendor_id);
