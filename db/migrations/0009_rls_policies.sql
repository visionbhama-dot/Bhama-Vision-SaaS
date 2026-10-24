-- =============================================================================
-- 0009_rls_policies.sql
-- Row Level Security. Default-deny everywhere; access is granted only through
-- the helper functions, which derive the actor from the verified JWT. A
-- client-supplied tenant_id never grants access on its own. The service-role
-- key (server-only) bypasses RLS and is used by trusted endpoints that perform
-- their own validation.
-- =============================================================================

-- Enable RLS on every table holding tenant/user data.
alter table public.user_profiles          enable row level security;
alter table public.tenants                 enable row level security;
alter table public.stores                  enable row level security;
alter table public.tenant_domains          enable row level security;
alter table public.business_profiles       enable row level security;
alter table public.tenant_memberships      enable row level security;
alter table public.merchant_onboarding     enable row level security;
alter table public.subscription_plans      enable row level security;
alter table public.plan_features           enable row level security;
alter table public.tenant_subscriptions    enable row level security;
alter table public.subscription_invoices   enable row level security;
alter table public.subscription_payments   enable row level security;
alter table public.categories              enable row level security;
alter table public.products                enable row level security;
alter table public.product_variants        enable row level security;
alter table public.product_images          enable row level security;
alter table public.inventory_levels        enable row level security;
alter table public.inventory_movements     enable row level security;
alter table public.customers               enable row level security;
alter table public.customer_addresses      enable row level security;
alter table public.delivery_zones          enable row level security;
alter table public.coupons                 enable row level security;
alter table public.carts                   enable row level security;
alter table public.cart_items              enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.order_status_events     enable row level security;
alter table public.order_payments          enable row level security;
alter table public.refunds                 enable row level security;
alter table public.coupon_redemptions      enable row level security;
alter table public.delivery_partners       enable row level security;
alter table public.delivery_assignments    enable row level security;
alter table public.delivery_location_updates enable row level security;
alter table public.vendors                 enable row level security;
alter table public.vendor_commissions      enable row level security;
alter table public.vendor_settlements      enable row level security;
alter table public.support_tickets         enable row level security;
alter table public.support_messages        enable row level security;
alter table public.leads                   enable row level security;
alter table public.lead_activities         enable row level security;
alter table public.notification_outbox     enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.platform_settings       enable row level security;

-- --- identity ----------------------------------------------------------------
create policy user_profiles_self_read on public.user_profiles
  for select using (id = auth.uid() or app.is_platform_admin());
create policy user_profiles_self_update on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- --- tenants & tenant-scoped config -----------------------------------------
create policy tenants_member_read on public.tenants
  for select using (app.is_tenant_member(id) or app.is_platform_admin());
create policy tenants_owner_write on public.tenants
  for update using (app.has_tenant_role(id, array['owner']) or app.is_platform_admin())
  with check (app.has_tenant_role(id, array['owner']) or app.is_platform_admin());

-- Public can view ACTIVE storefronts; members manage their store.
create policy stores_public_read on public.stores
  for select using (status = 'active' or app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy stores_member_write on public.stores
  for all using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

create policy domains_read on public.tenant_domains
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy domains_write on public.tenant_domains
  for all using (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin());

create policy business_profiles_member on public.business_profiles
  for all using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

-- Members can see memberships in their tenant; only owners manage them.
create policy memberships_read on public.tenant_memberships
  for select using (user_id = auth.uid() or app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy memberships_write on public.tenant_memberships
  for all using (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner']) or app.is_platform_admin());

create policy onboarding_member on public.merchant_onboarding
  for all using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.is_tenant_member(tenant_id) or app.is_platform_admin());

-- --- subscriptions -----------------------------------------------------------
-- Public plan catalogue is world-readable (needed for pricing); admins write.
create policy plans_public_read on public.subscription_plans
  for select using (is_public or app.is_platform_admin());
create policy plans_admin_write on public.subscription_plans
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy plan_features_read on public.plan_features
  for select using (true);
create policy plan_features_admin_write on public.plan_features
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy subscriptions_member_read on public.tenant_subscriptions
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy subscriptions_admin_write on public.tenant_subscriptions
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy invoices_member_read on public.subscription_invoices
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy sub_payments_member_read on public.subscription_payments
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());

-- --- catalog: public read of active-store catalog, member write -------------
create policy categories_public_read on public.categories
  for select using (
    is_visible and exists (select 1 from public.stores s where s.tenant_id = categories.tenant_id and s.status = 'active')
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy categories_member_write on public.categories
  for all using (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());

create policy products_public_read on public.products
  for select using (
    (is_visible and archived_at is null and exists (
      select 1 from public.stores s where s.tenant_id = products.tenant_id and s.status = 'active'))
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy products_member_write on public.products
  for all using (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());

create policy variants_public_read on public.product_variants
  for select using (
    exists (select 1 from public.products p where p.id = product_variants.product_id
            and p.is_visible and p.archived_at is null
            and exists (select 1 from public.stores s where s.tenant_id = p.tenant_id and s.status='active'))
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy variants_member_write on public.product_variants
  for all using (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());

create policy images_public_read on public.product_images
  for select using (
    exists (select 1 from public.products p where p.id = product_images.product_id and p.is_visible
            and exists (select 1 from public.stores s where s.tenant_id = p.tenant_id and s.status='active'))
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy images_member_write on public.product_images
  for all using (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());

create policy inventory_member on public.inventory_levels
  for all using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager','catalog_editor']) or app.is_platform_admin());
create policy movements_member on public.inventory_movements
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());

create policy zones_public_read on public.delivery_zones
  for select using (is_active or app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy zones_member_write on public.delivery_zones
  for all using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

create policy coupons_member on public.coupons
  for all using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

-- --- customers & orders: customer sees own; staff see tenant ----------------
create policy customers_scope on public.customers
  for select using (user_id = auth.uid() or app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy customers_staff_write on public.customers
  for all using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.is_tenant_member(tenant_id) or app.is_platform_admin());

create policy addresses_scope on public.customer_addresses
  for all using (
    exists (select 1 from public.customers c where c.id = customer_addresses.customer_id and c.user_id = auth.uid())
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  ) with check (
    exists (select 1 from public.customers c where c.id = customer_addresses.customer_id and c.user_id = auth.uid())
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );

create policy orders_scope on public.orders
  for select using (
    exists (select 1 from public.customers c where c.id = orders.customer_id and c.user_id = auth.uid())
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy orders_staff_write on public.orders
  for update using (app.is_tenant_member(tenant_id) or app.is_platform_admin())
  with check (app.is_tenant_member(tenant_id) or app.is_platform_admin());

create policy order_items_scope on public.order_items
  for select using (
    exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
            where o.id = order_items.order_id and c.user_id = auth.uid())
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy status_events_scope on public.order_status_events
  for select using (
    exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
            where o.id = order_status_events.order_id and c.user_id = auth.uid())
    or app.is_tenant_member(tenant_id) or app.is_platform_admin()
  );
create policy order_payments_staff on public.order_payments
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy refunds_staff on public.refunds
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy coupon_redemptions_staff on public.coupon_redemptions
  for select using (app.is_tenant_member(tenant_id) or app.is_platform_admin());

-- --- delivery: coordinates never public -------------------------------------
create policy riders_scope on public.delivery_partners
  for select using (user_id = auth.uid() or app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy riders_manage on public.delivery_partners
  for all using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

create policy assignments_scope on public.delivery_assignments
  for select using (
    app.is_tenant_member(tenant_id)
    or exists (select 1 from public.delivery_partners dp where dp.id = delivery_assignments.rider_id and dp.user_id = auth.uid())
    or exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id
               where o.id = delivery_assignments.order_id and c.user_id = auth.uid())
    or app.is_platform_admin()
  );

-- Location pings: only the assigned rider, tenant staff, the order's customer.
create policy location_authorized_read on public.delivery_location_updates
  for select using (
    app.is_tenant_member(tenant_id)
    or exists (select 1 from public.delivery_partners dp where dp.id = delivery_location_updates.rider_id and dp.user_id = auth.uid())
    or exists (
      select 1 from public.delivery_assignments da
      join public.orders o on o.id = da.order_id
      join public.customers c on c.id = o.customer_id
      where da.id = delivery_location_updates.assignment_id and c.user_id = auth.uid()
    )
    or app.is_platform_admin()
  );
create policy location_rider_insert on public.delivery_location_updates
  for insert with check (
    exists (select 1 from public.delivery_partners dp where dp.id = delivery_location_updates.rider_id and dp.user_id = auth.uid())
  );

-- --- marketplace: vendor isolation ------------------------------------------
-- A vendor member sees only their own vendor; marketplace owner/manager see all
-- vendors in the tenant.
create policy vendors_scope on public.vendors
  for select using (
    app.has_tenant_role(tenant_id, array['owner','manager'])
    or exists (select 1 from public.tenant_memberships m
               where m.tenant_id = vendors.tenant_id and m.user_id = auth.uid()
                 and m.status='active' and m.vendor_id = vendors.id)
    or app.is_platform_admin()
  );
create policy vendors_owner_write on public.vendors
  for all using (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin())
  with check (app.has_tenant_role(tenant_id, array['owner','manager']) or app.is_platform_admin());

create policy commissions_scope on public.vendor_commissions
  for select using (
    app.has_tenant_role(tenant_id, array['owner','manager'])
    or exists (select 1 from public.tenant_memberships m
               where m.tenant_id = vendor_commissions.tenant_id and m.user_id = auth.uid()
                 and m.status='active' and m.vendor_id = vendor_commissions.vendor_id)
    or app.is_platform_admin()
  );
create policy settlements_scope on public.vendor_settlements
  for select using (
    app.has_tenant_role(tenant_id, array['owner','manager'])
    or exists (select 1 from public.tenant_memberships m
               where m.tenant_id = vendor_settlements.tenant_id and m.user_id = auth.uid()
                 and m.status='active' and m.vendor_id = vendor_settlements.vendor_id)
    or app.is_platform_admin()
  );

-- --- support -----------------------------------------------------------------
create policy tickets_scope on public.support_tickets
  for select using (
    opened_by = auth.uid()
    or (tenant_id is not null and app.is_tenant_member(tenant_id))
    or app.is_platform_admin()
  );
create policy messages_scope on public.support_messages
  for select using (
    author_id = auth.uid()
    or (tenant_id is not null and app.is_tenant_member(tenant_id))
    or app.is_platform_admin()
  );

-- --- leads: NEVER publicly readable; platform admins only -------------------
-- Inserts happen via the service role (server, after validation + rate limit),
-- which bypasses RLS. No anon/authenticated insert or select policy exists, so
-- leads are invisible to everyone except platform admins.
create policy leads_admin_read on public.leads
  for select using (app.is_platform_admin() or owner_id = auth.uid());
create policy leads_admin_write on public.leads
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy lead_activities_admin on public.lead_activities
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- --- platform-only tables ----------------------------------------------------
create policy outbox_admin on public.notification_outbox
  for select using (app.is_platform_admin() or (tenant_id is not null and app.is_tenant_member(tenant_id)));
create policy audit_admin on public.audit_logs
  for select using (app.is_platform_admin());
create policy settings_admin on public.platform_settings
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
