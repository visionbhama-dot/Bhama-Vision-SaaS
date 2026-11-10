-- =============================================================================
-- 0014_merchant_payments.sql  (Phase 3+ — merchant-owned payments)
--
-- Bhama Vision provides SOFTWARE ONLY. Each merchant is the seller of record and
-- collects their customers' payments into THEIR OWN approved payment provider
-- account. The platform never pools customer payments into a single account.
--
-- This migration adds the connection record for a merchant's own provider
-- account. Two hard rules are encoded here:
--   1. Raw provider API secrets are NEVER stored in this table. We keep only the
--      non-secret key id/account id, plus `secret_ref` — the NAME of a Cloudflare
--      Worker secret (set out-of-band with `wrangler secret put`) that holds the
--      real secret. Env-based secrets, consistent with the rest of the app.
--   2. This is strictly SEPARATE from SaaS subscription billing (System A:
--      `tenant_subscriptions` / `subscription_payments`). That is money merchants
--      pay Bhama Vision; this is money customers pay the merchant (System B).
--
-- Forward-only; earlier migrations (0001–0013) are untouched. Idempotent where
-- practical.
-- =============================================================================

do $$ begin
  -- Connection lifecycle shown to the merchant + superadmin.
  create type merchant_payment_status as enum (
    'not_connected', 'pending', 'connected', 'error', 'disconnected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_environment as enum ('test', 'live');
exception when duplicate_object then null; end $$;

create table if not exists public.merchant_payment_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- Provider id handled by an application-side adapter registry (e.g. 'razorpay').
  -- Intentionally text (not an enum) so adding a provider needs no migration.
  provider      text not null,
  environment   payment_environment not null default 'test',
  status        merchant_payment_status not null default 'not_connected',
  -- NON-SECRET identifiers only (safe to store + display, masked).
  key_id        text,            -- e.g. Razorpay key_id (publishable)
  account_ref   text,            -- provider account/merchant id, if any
  -- Pointer to where the real secret lives (a Worker secret name), NEVER the
  -- secret itself. The payments code resolves the secret from env at call time.
  secret_ref    text,
  last_error    text,
  connected_at  timestamptz,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint merchant_payment_accounts_tenant_provider unique (tenant_id, provider)
);
create index if not exists idx_merchant_payment_accounts_tenant
  on public.merchant_payment_accounts(tenant_id);
create trigger trg_merchant_payment_accounts_updated
  before update on public.merchant_payment_accounts
  for each row execute function app.set_updated_at();

alter table public.merchant_payment_accounts enable row level security;

-- Only the tenant OWNER manages the connection; platform admins can view/manage
-- for support. Managers/staff are deliberately excluded — payment connection is
-- owner-sensitive. No anon/public policy exists, so it is never world-readable.
-- (Even a reader sees no usable secret, because none is stored here.)
drop policy if exists merchant_payment_accounts_owner on public.merchant_payment_accounts;
create policy merchant_payment_accounts_owner on public.merchant_payment_accounts
  for all
  using (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin());
