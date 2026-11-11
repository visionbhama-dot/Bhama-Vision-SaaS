-- =============================================================================
-- 0021_harden_function_security.sql  (Phase 8 — security advisor hardening)
--
-- Resolves outstanding Supabase security advisories ahead of public COD testing.
-- Forward-only, idempotent, behaviour-preserving.
--
--  1. handle_new_user() is SECURITY DEFINER and was EXECUTE-able by
--     PUBLIC/anon/authenticated via PostgREST (/rest/v1/rpc/handle_new_user).
--     It is only ever meant to run as the auth.users INSERT trigger, which
--     fires as the table owner regardless of EXECUTE grants. Revoke the grants
--     so it can no longer be invoked directly over the API. Trigger unaffected.
--
--  2. "Function search_path mutable": pin search_path on the flagged helper/RPC
--     functions. All are SECURITY INVOKER (run with the caller's privileges —
--     non-escalating by design, see 0001) and fully schema-qualify their refs,
--     so pinning to `public, app` is behaviour-preserving. `public` MUST be in
--     the path so the citext operators resolve (the extension lives in public).
--
--  3. reserved_slugs: 0020 revoked DML + TRUNCATE from anon/authenticated but
--     left the residual MAINTAIN privilege. Remove it — anon/authenticated keep
--     SELECT only (required by the SECURITY INVOKER slug check).
-- =============================================================================

-- 1. Close the RPC exposure of the auth trigger function.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Pin search_path on the SECURITY INVOKER helpers/RPCs.
alter function app.set_updated_at() set search_path = public, app;
alter function app.current_user_id() set search_path = public, app;
alter function app.tenant_has_feature(uuid, text) set search_path = public, app;
alter function app.is_slug_available(citext) set search_path = public, app;
alter function public.create_merchant(uuid, text, tenant_kind, citext, text, text, text)
  set search_path = public, app;

-- 3. Drop the residual MAINTAIN grant on reserved_slugs.
revoke maintain on public.reserved_slugs from anon, authenticated;
