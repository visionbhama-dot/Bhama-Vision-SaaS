-- =============================================================================
-- 0011_auth_onboarding.sql  (Phase 3)
-- Auth profile provisioning, a non-entitling 'pending' subscription status,
-- slug availability, and an atomic merchant-creation function.
-- =============================================================================

-- --- Auto-provision a profile row for every new auth user -------------------
-- Canonical, narrowly-scoped SECURITY DEFINER trigger (the accepted Supabase
-- pattern). It only inserts the caller's own profile row; search_path is pinned.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- 'pending' subscription status ------------------------------------------
-- A plan can be SELECTED during onboarding, but entitlements must stay locked
-- until a verified payment (Phase 5) or an explicit superadmin activation.
-- 'pending' is deliberately NOT in the set the entitlement resolver treats as
-- active ('trialing','active','grace'), so selecting a plan grants nothing.
alter type subscription_status add value if not exists 'pending';

-- --- Slug availability -------------------------------------------------------
-- A slug is available when it is well-formed, not reserved, and not already
-- used by a store. (A UNIQUE constraint on stores.slug is the hard backstop
-- against race conditions; this function gives a friendly pre-check.)
create or replace function app.is_slug_available(p_slug citext)
returns boolean
language sql
stable
as $$
  select
    p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'
    and not exists (select 1 from public.reserved_slugs r where r.slug = p_slug)
    and not exists (select 1 from public.stores s where s.slug = p_slug);
$$;

-- --- Atomic merchant creation ------------------------------------------------
-- Creates tenant + owner membership + draft store + business profile +
-- onboarding row + subdomain mapping + a PENDING subscription, all in one
-- transaction. SECURITY INVOKER (default): it is exposed via PostgREST rpc but
-- EXECUTE is revoked from anon/authenticated below, so ONLY the server
-- (service role, which has already authenticated the user) can call it. No
-- definer escalation is introduced. Raises a typed error on slug problems so
-- the application can map them to friendly messages.
create or replace function public.create_merchant(
  p_owner        uuid,
  p_tenant_name  text,
  p_kind         tenant_kind,
  p_slug         citext,
  p_display_name text,
  p_plan_slug    text,
  p_apex_domain  text
)
returns uuid
language plpgsql
as $$
declare
  v_tenant uuid;
  v_store  uuid;
  v_plan   uuid;
begin
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$' then
    raise exception 'SLUG_INVALID';
  end if;
  if exists (select 1 from public.reserved_slugs r where r.slug = p_slug) then
    raise exception 'SLUG_RESERVED';
  end if;
  if exists (select 1 from public.stores s where s.slug = p_slug) then
    raise exception 'SLUG_TAKEN';
  end if;

  insert into public.tenants (kind, name, created_by)
  values (p_kind, p_tenant_name, p_owner)
  returning id into v_tenant;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant, p_owner, 'owner', 'active');

  insert into public.stores (tenant_id, slug, display_name, status)
  values (v_tenant, p_slug, p_display_name, 'draft')
  returning id into v_store;

  insert into public.business_profiles (tenant_id) values (v_tenant);

  insert into public.merchant_onboarding (tenant_id, current_step, completed_steps)
  values (v_tenant, 'business', array['account']);

  insert into public.tenant_domains (tenant_id, store_id, hostname, kind, verified)
  values (v_tenant, v_store, (p_slug || '.' || p_apex_domain)::citext, 'subdomain', false)
  on conflict do nothing;

  select id into v_plan from public.subscription_plans where slug = p_plan_slug;
  if v_plan is not null then
    insert into public.tenant_subscriptions (tenant_id, plan_id, status, cycle)
    values (v_tenant, v_plan, 'pending', 'monthly');
  end if;

  -- mark the merchant user's platform role
  update public.user_profiles set platform_role = 'merchant_user'
  where id = p_owner and platform_role = 'customer';

  return v_tenant;
end;
$$;

-- Only the server (service role) may create merchants. Block direct client rpc.
revoke execute on function public.create_merchant(
  uuid, text, tenant_kind, citext, text, text, text
) from anon, authenticated;
