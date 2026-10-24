-- =============================================================================
-- 0010_seed_plans.sql
-- Seed the public subscription plans + entitlements. Kept in sync with
-- app/modules/marketing/data/plans.ts. Safe to re-run (upserts). These are the
-- DEFAULT/seed values; superadmin edits in the DB are authoritative thereafter.
-- Prices are integer paise.
-- =============================================================================

insert into public.subscription_plans
  (slug, name, tagline, monthly_paise, annual_paise, setup_fee_paise, trial_days, max_products, max_staff, max_vendors, is_public, sort_order)
values
  ('starter',     'Starter',     'For independent stores beginning online operations.',          149900,  124900, 0, 0,  500,  2,   0,   true, 1),
  ('growth',      'Growth',      'For stores operating their own delivery teams.',               349900,  291600, 0, 0, 5000, 15,   0,   true, 2),
  ('marketplace', 'Marketplace', 'For businesses launching a local multi-seller platform.',      799900,  666600, 0, 0, null, 50, 100,  true, 3)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  monthly_paise = excluded.monthly_paise,
  annual_paise = excluded.annual_paise,
  max_products = excluded.max_products,
  max_staff = excluded.max_staff,
  max_vendors = excluded.max_vendors,
  is_public = excluded.is_public,
  sort_order = excluded.sort_order;

-- Helper to set a plan's features from an array of keys.
do $$
declare
  starter uuid; growth uuid; marketplace uuid;
  base text[] := array[
    'branded_subdomain','storefront','merchant_dashboard','product_management',
    'categories','inventory','checkout','online_payments','cash_on_delivery',
    'coupons','order_processing','customer_records','basic_reports',
    'delivery_zones','support_tickets'
  ];
  growth_extra text[] := array[
    'delivery_staff','delivery_dashboard','rider_assignment','live_location_tracking',
    'customer_delivery_tracking','operational_analytics','team_permissions',
    'order_preparation_workflow'
  ];
  marketplace_extra text[] := array[
    'marketplace','vendor_onboarding','vendor_dashboards','vendor_commissions',
    'vendor_settlements','advanced_reporting'
  ];
  k text;
begin
  select id into starter from public.subscription_plans where slug='starter';
  select id into growth from public.subscription_plans where slug='growth';
  select id into marketplace from public.subscription_plans where slug='marketplace';

  -- Reset features for a clean, idempotent seed.
  delete from public.plan_features where plan_id in (starter, growth, marketplace);

  foreach k in array base loop
    insert into public.plan_features(plan_id, feature_key, enabled) values
      (starter, k, true), (growth, k, true), (marketplace, k, true)
      on conflict do nothing;
  end loop;

  foreach k in array growth_extra loop
    insert into public.plan_features(plan_id, feature_key, enabled) values
      (growth, k, true), (marketplace, k, true)
      on conflict do nothing;
  end loop;

  foreach k in array marketplace_extra loop
    insert into public.plan_features(plan_id, feature_key, enabled) values
      (marketplace, k, true)
      on conflict do nothing;
  end loop;
end $$;

-- Default platform settings (editable from superadmin).
insert into public.platform_settings(key, value) values
  ('branding', '{"name":"Bhama Vision Grocery Cloud","company":"Bhama Vision"}'::jsonb),
  ('billing',  '{"currency":"INR","trials_enabled":false}'::jsonb)
on conflict (key) do nothing;
