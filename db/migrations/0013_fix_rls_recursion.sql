-- =============================================================================
-- 0013_fix_rls_recursion.sql
-- Fix: infinite recursion in Row Level Security.
--
-- app.is_tenant_member() / app.has_tenant_role() query public.tenant_memberships,
-- and are themselves invoked INSIDE that table's RLS policy (memberships_read in
-- 0009). As SECURITY INVOKER their internal SELECT re-applies the same policy,
-- which calls the helper again. The moment tenant_memberships holds more than one
-- row Postgres aborts the query with:
--   "infinite recursion detected in policy for relation tenant_memberships"
-- The visible symptom: a signed-in merchant can't read back their own
-- tenant/store/onboarding, so the onboarding wizard silently bounces to step 1
-- and the dashboard shows nothing.
--
-- Making these helpers SECURITY DEFINER lets their internal reads run as the
-- function owner and bypass RLS, breaking the cycle. This introduces NO
-- privilege escalation: each function still filters strictly by auth.uid(), so
-- a caller can only ever observe their OWN membership/roles. search_path is
-- pinned to '' and every object is schema-qualified, per Supabase guidance for
-- SECURITY DEFINER functions. Idempotent (create or replace).
-- =============================================================================

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.platform_role = 'platform_admin'
  );
$$;

create or replace function app.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function app.has_tenant_role(target_tenant uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role::text = any(roles)
  );
$$;

-- Keep the PostgREST roles able to call them (0012 granted this; re-assert in
-- case these functions were recreated).
grant execute on function
  app.is_platform_admin(),
  app.is_tenant_member(uuid),
  app.has_tenant_role(uuid, text[])
to anon, authenticated;
