-- =============================================================================
-- 0006_delivery.sql
-- Delivery partners (riders), assignments, and location updates (Growth plan).
-- Location data is sensitive: it is only readable for the assigned active
-- delivery by authorized parties (merchant staff, the rider, the order's
-- customer) — enforced by RLS in 0009.
-- =============================================================================

do $$ begin
  create type rider_status as enum ('invited', 'active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum (
    'offered', 'accepted', 'rejected', 'picked_up', 'delivering', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.delivery_partners (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references public.user_profiles(id) on delete set null,
  full_name   text not null,
  phone       text,
  status      rider_status not null default 'invited',
  is_available boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_riders_tenant on public.delivery_partners(tenant_id);
create trigger trg_riders_updated
  before update on public.delivery_partners
  for each row execute function app.set_updated_at();

create table if not exists public.delivery_assignments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  rider_id      uuid references public.delivery_partners(id) on delete set null,
  status        assignment_status not null default 'offered',
  assigned_at   timestamptz not null default now(),
  accepted_at   timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists idx_assignments_order on public.delivery_assignments(order_id);
create index if not exists idx_assignments_rider on public.delivery_assignments(rider_id);
-- Only one active assignment per order.
create unique index if not exists uq_active_assignment
  on public.delivery_assignments(order_id)
  where status in ('offered','accepted','picked_up','delivering');
create trigger trg_assignments_updated
  before update on public.delivery_assignments
  for each row execute function app.set_updated_at();

-- Foreground GPS pings for an active delivery. Throttled at the client; old
-- rows are purged per retention policy (see docs/DELIVERY_TRACKING.md).
create table if not exists public.delivery_location_updates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null references public.delivery_assignments(id) on delete cascade,
  rider_id      uuid not null references public.delivery_partners(id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    double precision,
  recorded_at   timestamptz not null default now()
);
create index if not exists idx_loc_assignment on public.delivery_location_updates(assignment_id, recorded_at desc);
