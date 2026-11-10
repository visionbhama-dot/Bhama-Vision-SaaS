-- =============================================================================
-- 0001_extensions_and_helpers.sql
-- Extensions, shared trigger functions, and authorization helpers.
--
-- These migrations target Supabase PostgreSQL. Apply them with the Supabase CLI
-- (`supabase db push`) or paste into the SQL editor in order. See
-- docs/LOCAL_SETUP.md. They are written to be idempotent where practical.
-- =============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid(), digest()
create extension if not exists citext;   -- case-insensitive text (emails, slugs)

-- Dedicated schema for helper functions we don't want exposed via PostgREST.
create schema if not exists app;

-- The authorization helpers below reference public.user_profiles and
-- public.tenant_memberships, which are created in 0002. PostgreSQL validates
-- `language sql` function bodies at creation time, so disable that check while
-- this migration runs (the functions are only invoked at query time, after
-- 0002 has created the tables). This mirrors what pg_dump emits for the same
-- forward-reference reason and is session-scoped.
set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Authorization helpers.
--
-- IMPORTANT: a client-supplied tenant_id must NEVER by itself grant access.
-- Every RLS policy derives the acting user from auth.uid() (the verified JWT
-- subject) and checks membership/role via these helpers. Helper functions are
-- STABLE and run with the caller's privileges (NOT security definer) so they
-- cannot be abused to escalate.
-- -----------------------------------------------------------------------------

-- The authenticated user id (NULL for anonymous requests).
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- True when the current user is a Bhama Vision platform administrator.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.platform_role = 'platform_admin'
  );
$$;

-- True when the current user belongs to the given tenant (any active role).
create or replace function app.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- True when the current user holds one of the given roles within the tenant.
create or replace function app.has_tenant_role(target_tenant uuid, roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = target_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(roles)
  );
$$;
