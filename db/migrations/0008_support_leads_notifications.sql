-- =============================================================================
-- 0008_support_leads_notifications.sql
-- Support tickets, marketing leads, notification outbox, audit log, settings.
-- =============================================================================

do $$ begin
  create type ticket_scope as enum ('merchant_to_platform', 'customer_to_store', 'vendor_to_marketplace');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'pending', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade, -- null for platform-level
  scope       ticket_scope not null,
  subject     text not null,
  status      ticket_status not null default 'open',
  opened_by   uuid references public.user_profiles(id),
  vendor_id   uuid references public.vendors(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tickets_tenant on public.support_tickets(tenant_id);
create trigger trg_tickets_updated
  before update on public.support_tickets
  for each row execute function app.set_updated_at();

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  author_id   uuid references public.user_profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_ticket on public.support_messages(ticket_id);

-- --- leads (marketing enquiries) ---------------------------------------------
do $$ begin
  create type lead_status as enum (
    'new', 'contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'won', 'lost'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  name          text not null,
  business_name text not null,
  phone         text,
  email         text,
  city          text,
  business_type text,
  product_count int,
  preferred_plan text,
  message       text,
  status        lead_status not null default 'new',
  owner_id      uuid references public.user_profiles(id),
  follow_up_at  timestamptz,
  -- Campaign attribution (stored with consent).
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  referrer      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint leads_contactable check (phone is not null or email is not null)
);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_created on public.leads(created_at desc);
create trigger trg_leads_updated
  before update on public.leads
  for each row execute function app.set_updated_at();

create table if not exists public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  author_id   uuid references public.user_profiles(id),
  kind        text not null, -- 'note','status_change','contact'
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_lead_activities_lead on public.lead_activities(lead_id);

-- --- notification_outbox -----------------------------------------------------
-- Durable outbox. 'internal' notifications power the in-app notification center
-- and superadmin lead inbox immediately; email/sms/whatsapp/push rows are only
-- delivered when the corresponding provider is configured. We never mark a row
-- 'sent' unless a provider actually accepted it.
create table if not exists public.notification_outbox (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  channel     text not null default 'internal', -- internal|email|sms|whatsapp|push
  topic       text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending',   -- pending|sent|failed|skipped
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists idx_outbox_status on public.notification_outbox(status, created_at);

-- --- audit_logs --------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.user_profiles(id),
  tenant_id   uuid references public.tenants(id) on delete set null,
  action      text not null,       -- 'merchant.suspend','plan.override', etc.
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_action on public.audit_logs(action, created_at desc);

-- --- platform_settings -------------------------------------------------------
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger trg_settings_updated
  before update on public.platform_settings
  for each row execute function app.set_updated_at();
