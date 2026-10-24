-- =============================================================================
-- 0003_subscriptions.sql
-- Platform subscription plans, entitlements, and billing records.
-- (Payment System A: merchants paying Bhama Vision for SaaS plans.)
-- All money is stored as integer paise (bigint).
-- =============================================================================

do $$ begin
  create type billing_cycle as enum ('monthly', 'annual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum (
    'trialing', 'active', 'past_due', 'grace', 'canceled', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');
exception when duplicate_object then null; end $$;

-- --- subscription_plans ------------------------------------------------------
create table if not exists public.subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  tagline         text,
  monthly_paise   bigint not null check (monthly_paise >= 0),
  annual_paise    bigint not null check (annual_paise >= 0),
  setup_fee_paise bigint not null default 0 check (setup_fee_paise >= 0),
  trial_days      int not null default 0 check (trial_days >= 0),
  -- Limits (null = unlimited within fair-use).
  max_products    int,
  max_staff       int,
  max_vendors     int,
  is_public       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_plans_updated
  before update on public.subscription_plans
  for each row execute function app.set_updated_at();

-- --- plan_features (entitlements) --------------------------------------------
-- Authoritative source of what a plan unlocks. Entitlement checks are enforced
-- server-side against these rows (via the active tenant_subscription), NEVER by
-- the frontend. A Starter merchant cannot unlock Growth-only features by
-- editing the URL or an API payload.
create table if not exists public.plan_features (
  plan_id     uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null default true,
  primary key (plan_id, feature_key)
);

-- --- tenant_subscriptions ----------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  plan_id              uuid not null references public.subscription_plans(id),
  status               subscription_status not null default 'trialing',
  cycle                billing_cycle not null default 'monthly',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_until          timestamptz,
  trial_end            timestamptz,
  -- Admin-entered override of entitlements (JSON of feature_key -> bool).
  entitlement_overrides jsonb not null default '{}'::jsonb,
  canceled_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists uq_active_subscription
  on public.tenant_subscriptions(tenant_id)
  where status in ('trialing','active','past_due','grace');
create trigger trg_subscriptions_updated
  before update on public.tenant_subscriptions
  for each row execute function app.set_updated_at();

-- --- subscription_invoices ---------------------------------------------------
create table if not exists public.subscription_invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.tenant_subscriptions(id),
  number          text unique,
  amount_paise    bigint not null check (amount_paise >= 0),
  tax_paise       bigint not null default 0 check (tax_paise >= 0),
  status          invoice_status not null default 'open',
  due_at          timestamptz,
  issued_at       timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists idx_invoices_tenant on public.subscription_invoices(tenant_id);

-- --- subscription_payments ---------------------------------------------------
-- Gateway payments against SaaS invoices. Webhook-driven; idempotent.
create table if not exists public.subscription_payments (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  invoice_id         uuid references public.subscription_invoices(id),
  provider           text not null default 'razorpay',
  provider_payment_id text,
  amount_paise       bigint not null check (amount_paise >= 0),
  status             text not null default 'created',
  -- Idempotency guard against duplicate webhook delivery.
  idempotency_key    text,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  constraint uq_subscription_payment_idem unique (provider, idempotency_key)
);
create index if not exists idx_sub_payments_tenant on public.subscription_payments(tenant_id);

-- -----------------------------------------------------------------------------
-- Entitlement resolver: effective feature flag for a tenant's active plan,
-- honoring admin overrides. Used by server code to authorize gated features.
-- -----------------------------------------------------------------------------
create or replace function app.tenant_has_feature(target_tenant uuid, feature text)
returns boolean
language sql
stable
as $$
  with sub as (
    select ts.plan_id, ts.entitlement_overrides, ts.status
    from public.tenant_subscriptions ts
    where ts.tenant_id = target_tenant
      and ts.status in ('trialing','active','grace')
    order by ts.created_at desc
    limit 1
  )
  select coalesce(
    -- admin override wins when present
    (select (sub.entitlement_overrides ->> feature)::boolean
       from sub where sub.entitlement_overrides ? feature),
    -- otherwise the plan's feature flag
    (select pf.enabled
       from sub join public.plan_features pf
         on pf.plan_id = sub.plan_id and pf.feature_key = feature),
    false
  );
$$;
