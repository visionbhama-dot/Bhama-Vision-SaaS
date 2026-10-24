# Architecture

## Overview

Bhama Vision Grocery Cloud is a **modular monolith**: one React Router 7
application deployed as a single Cloudflare Worker, backed by one shared Supabase
project. There is **no** per-merchant project or per-merchant codebase — tenancy
is a data concept enforced in the database, not duplicated infrastructure.

```
                 ┌──────────────────────────────────────────┐
  Browser  ──▶   │ Cloudflare Worker (React Router SSR)       │
  (any host)     │  • resolves hostname → tenant (server-side)│
                 │  • loaders/actions call Supabase           │
                 └───────────────┬────────────────────────────┘
                                 │  supabase-js (anon = RLS, service = trusted)
                                 ▼
                 ┌──────────────────────────────────────────┐
                 │ Supabase: PostgreSQL + Auth + Storage +   │
                 │ Realtime, with Row Level Security          │
                 └──────────────────────────────────────────┘
```

## Surfaces (planned)

A. Public marketing site · B. Merchant onboarding · C. Merchant dashboard ·
D. Customer storefront · E. Delivery dashboard/PWA · F. Marketplace owner ·
G. Vendor dashboard · H. Superadmin · I. Customer account/tracking.

Phase 2 delivers **A** and the lead pipeline into **H**. Later phases add the rest.

## Module boundaries (`app/modules`)

- `marketing/` — landing page, pricing data, public components.
- `leads/` — shared lead schema + server persistence service.
- Future: `storefront/`, `merchant/`, `delivery/`, `marketplace/`, `platform/`.

Shared concerns live in `app/lib` (env, Supabase, SEO, analytics, utils),
`app/components/ui` (design system) and `app/config` (brand).

## Server vs client

- `*.server.ts` files only run on the Worker. Secrets (service-role key) never
  reach the browser; `toPublicConfig()` is the only channel of runtime values to
  the client, and it exposes non-secret fields exclusively.
- Loaders fetch data server-side; actions perform mutations. The lead form posts
  to the home route `action` via a React Router fetcher.

## Tenant resolution (design)

Production storefronts resolve by hostname against `tenant_domains` (a central
mapping), reject unknown hosts, and load only the active tenant's public
catalogue. Reserved names (`www`, `admin`, `api`, `app`, `support`, …) are
blocked via `reserved_slugs`. Local development uses a path route
(`/store/:slug`) that runs the **same** resolution + authorization logic — no
hardcoded front-end-only tenant data. See `docs/DOMAIN_SETUP.md`.

## Money

All monetary values are stored and computed as integer **paise** (minor units)
in `bigint` columns. `formatInrMinor()` is the single formatting boundary.
No floating point is used for accounting.

## Entitlements

Plan capabilities live in `subscription_plans` / `plan_features` and resolve via
`app.tenant_has_feature(tenant, feature)` (honoring admin overrides). All gating
is enforced server-side; the front end never decides entitlement.
