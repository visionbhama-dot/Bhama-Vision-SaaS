-- =============================================================================
-- 0015_pharmacy_verification.sql  (Phase 3+ — Licensed Pharmacy scaffolding)
--
-- Adds a Licensed Pharmacy merchant category WITHOUT breaking existing stores,
-- plus a licence-verification workflow for platform review.
--
-- CRITICAL SAFETY RULES encoded here:
--   * stores.medicine_ordering_enabled defaults to FALSE and is turned on ONLY
--     by an explicit platform action after the applicable online-pharmacy legal
--     review — NOT automatically when documents are uploaded or a licence is
--     verified. Platform verification is NOT government approval.
--   * Uploading documents never auto-approves. Only a platform admin can move a
--     verification to 'verified' (recorded in audit_logs by the application).
--
-- Forward-only; earlier migrations untouched. Idempotent where practical.
-- =============================================================================

-- --- Store category (non-breaking: default keeps existing stores unchanged) --
alter table public.stores
  add column if not exists category text not null default 'general';

do $$ begin
  alter table public.stores
    add constraint stores_category_check
    check (category in ('general','grocery','pharmacy','bakery','personal_care','home_essentials'));
exception when duplicate_object then null; end $$;

-- Medicine ordering/checkout guard. Off by default; see rules above.
alter table public.stores
  add column if not exists medicine_ordering_enabled boolean not null default false;

-- --- Verification workflow ---------------------------------------------------
do $$ begin
  create type pharmacy_verification_status as enum (
    'pending', 'under_review', 'verified', 'rejected', 'needs_correction'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.pharmacy_verifications (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  status          pharmacy_verification_status not null default 'pending',
  license_number  text,
  license_authority text,         -- issuing authority / state drug control dept
  license_expiry  date,
  pharmacist_name text,
  pharmacist_reg_number text,      -- registered pharmacist registration no.
  contact_phone   text,
  notes           text,            -- merchant-provided context
  -- Review fields (set by platform admins only, via the application).
  review_notes    text,
  reviewer_id     uuid references public.user_profiles(id),
  reviewed_at     timestamptz,
  -- Target turnaround (e.g. now()+24h). Informational SLA, not a guarantee.
  review_due_at   timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_pharmacy_verifications_status
  on public.pharmacy_verifications(status, review_due_at);
create trigger trg_pharmacy_verifications_updated
  before update on public.pharmacy_verifications
  for each row execute function app.set_updated_at();

-- Supporting documents. We store METADATA + a private storage path only; the
-- binary lives in a private Supabase Storage bucket ('pharmacy-docs') whose
-- access is restricted to the owning tenant + platform admins. Never public.
create table if not exists public.pharmacy_documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  doc_type     text not null,      -- 'drug_license','premises_proof','pharmacist_cert','other'
  storage_path text,               -- path within the private bucket
  external_ref text,               -- optional reference when a path isn't used yet
  file_name    text,
  uploaded_by  uuid references public.user_profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_pharmacy_documents_tenant
  on public.pharmacy_documents(tenant_id);

-- --- RLS ---------------------------------------------------------------------
alter table public.pharmacy_verifications enable row level security;
alter table public.pharmacy_documents     enable row level security;

-- Owner can read + submit/update their OWN verification while it is still open
-- (status is enforced in the application; RLS enforces tenant ownership). Review
-- fields are only written by the server via the service role for admin actions.
drop policy if exists pharmacy_verifications_owner on public.pharmacy_verifications;
create policy pharmacy_verifications_owner on public.pharmacy_verifications
  for all
  using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

drop policy if exists pharmacy_documents_owner on public.pharmacy_documents;
create policy pharmacy_documents_owner on public.pharmacy_documents
  for all
  using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());
