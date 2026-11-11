-- =============================================================================
-- 0020_secure_reserved_slugs.sql  (Phase 8 — security hardening)
--
-- Finding (Supabase advisor + Phase 8 preflight): public.reserved_slugs had
-- Row Level Security DISABLED while anon/authenticated held full DML grants, so
-- anyone with the anon key could INSERT/UPDATE/DELETE the reserved-slug list.
--
-- Constraint: the slug-availability check is read through is_slug_available()
-- and create_merchant(), both SECURITY INVOKER — they read reserved_slugs as the
-- CALLING role. So anon/authenticated must keep SELECT, or signup slug checks
-- would silently treat reserved slugs as available.
--
-- Fix: enable RLS, allow public SELECT (the reserved list is not sensitive), and
-- revoke write privileges from anon/authenticated. Writes remain possible only
-- via the service role (bypasses RLS) and migrations. Forward-only, idempotent.
-- =============================================================================

alter table public.reserved_slugs enable row level security;

drop policy if exists reserved_slugs_read on public.reserved_slugs;
create policy reserved_slugs_read on public.reserved_slugs
  for select using (true);

-- Defence in depth: remove ALL non-SELECT grants (RLS blocks row writes with no
-- write policy, but RLS does NOT guard TRUNCATE — so revoke it explicitly along
-- with the other DML/DDL-ish privileges). anon/authenticated keep SELECT only.
revoke insert, update, delete, truncate, references, trigger
  on public.reserved_slugs from anon, authenticated;
