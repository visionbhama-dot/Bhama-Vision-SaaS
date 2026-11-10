-- =============================================================================
-- 0012_grant_app_schema.sql
-- Fix: let the PostgREST roles use the `app` helper schema.
--
-- The authorization helpers (app.is_tenant_member, app.has_tenant_role,
-- app.is_platform_admin, app.current_user_id) are invoked INSIDE the RLS
-- policies created in 0009. Those policies are evaluated as the querying role
-- (`authenticated` for a logged-in user, `anon` for public storefront reads).
--
-- Creating a schema grants USAGE only to its owner, so without the grants below
-- every policy that calls an `app.*` function fails with "permission denied for
-- schema app". The visible symptom is that a merchant cannot read back their
-- own tenant/store/onboarding rows after sign-up: the onboarding wizard silently
-- bounces to the first step and the dashboard shows nothing.
--
-- These helpers are SECURITY INVOKER and only ever check the caller's own
-- membership via auth.uid(), so exposing EXECUTE to these roles grants no
-- privilege escalation — it is exactly how they are designed to be used.
-- Idempotent and safe to re-run.
-- =============================================================================

grant usage on schema app to anon, authenticated;

grant execute on all functions in schema app to anon, authenticated;

-- Cover any helper functions added to the schema later.
alter default privileges in schema app
  grant execute on functions to anon, authenticated;
