-- =============================================================================
-- 0002_identity_and_tenancy.sql
-- Identity, tenants, stores, domains, memberships, onboarding.
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
do $$ begin
  create type platform_role as enum ('customer', 'merchant_user', 'platform_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tenant_kind as enum ('single_store', 'marketplace');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Lifecycle for a store/tenant. Suspension blocks NEW orders but keeps data.
  create type store_status as enum (
    'draft', 'pending_verification', 'pending_payment', 'active', 'suspended', 'closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_role as enum (
    'owner', 'manager', 'catalog_editor', 'order_processor',
    'delivery_rider', 'vendor_owner', 'vendor_staff'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- --- user_profiles (1:1 with auth.users) -------------------------------------
create table if not exists public.user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  phone         text,
  platform_role platform_role not null default 'customer',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_user_profiles_updated
  before update on public.user_profiles
  for each row execute function app.set_updated_at();

-- --- tenants -----------------------------------------------------------------
-- A tenant is one merchant account (single store) or one marketplace operator.
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  kind        tenant_kind not null default 'single_store',
  name        text not null,
  created_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tenants_updated
  before update on public.tenants
  for each row execute function app.set_updated_at();

-- --- stores ------------------------------------------------------------------
-- The customer-facing storefront for a tenant (one per single-store tenant;
-- the marketplace storefront for a marketplace tenant).
create table if not exists public.stores (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  slug            citext not null,
  display_name    text not null,
  status          store_status not null default 'draft',
  logo_url        text,
  theme           jsonb not null default '{}'::jsonb,
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  currency        text not null default 'INR',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint stores_slug_key unique (slug)
);
create index if not exists idx_stores_tenant on public.stores(tenant_id);
create trigger trg_stores_updated
  before update on public.stores
  for each row execute function app.set_updated_at();

-- Reserved slugs that cannot be claimed as a store subdomain.
create table if not exists public.reserved_slugs (
  slug citext primary key
);
insert into public.reserved_slugs(slug) values
  ('www'), ('admin'), ('api'), ('app'), ('support'), ('help'),
  ('mail'), ('status'), ('dashboard'), ('superadmin'), ('bhama'),
  ('bhamavision'), ('static'), ('cdn'), ('assets')
on conflict do nothing;

-- --- tenant_domains ----------------------------------------------------------
-- Centralized hostname -> tenant/store mapping used for secure resolution.
-- 'subdomain' entries are auto-managed; 'custom' entries require verification.
do $$ begin
  create type domain_kind as enum ('subdomain', 'custom');
exception when duplicate_object then null; end $$;

create table if not exists public.tenant_domains (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  hostname    citext not null,
  kind        domain_kind not null default 'subdomain',
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint tenant_domains_hostname_key unique (hostname)
);
create index if not exists idx_tenant_domains_tenant on public.tenant_domains(tenant_id);

-- --- business_profiles -------------------------------------------------------
create table if not exists public.business_profiles (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  legal_name      text,
  business_type   text,
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  pincode         text,
  contact_phone   text,
  contact_email   text,
  description     text,
  gst_number      text,
  fssai_license   text,     -- food-business licensing (India)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_business_profiles_updated
  before update on public.business_profiles
  for each row execute function app.set_updated_at();

-- --- tenant_memberships ------------------------------------------------------
create table if not exists public.tenant_memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  role       membership_role not null,
  status     membership_status not null default 'active',
  vendor_id  uuid, -- set for vendor_* roles (FK added in marketplace migration)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_unique unique (tenant_id, user_id, role)
);
create index if not exists idx_memberships_user on public.tenant_memberships(user_id);
create index if not exists idx_memberships_tenant on public.tenant_memberships(tenant_id);
create trigger trg_memberships_updated
  before update on public.tenant_memberships
  for each row execute function app.set_updated_at();

-- --- merchant_onboarding -----------------------------------------------------
-- Resumable onboarding state so a half-finished signup survives refresh.
create table if not exists public.merchant_onboarding (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  current_step   text not null default 'account',
  completed_steps text[] not null default '{}',
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_onboarding_updated
  before update on public.merchant_onboarding
  for each row execute function app.set_updated_at();
