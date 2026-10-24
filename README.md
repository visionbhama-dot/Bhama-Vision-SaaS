# Bhama Vision Grocery Cloud

A multi-tenant grocery commerce **SaaS platform** by Bhama Vision. It lets local
grocery stores, supermarkets, kirana shops and marketplaces launch their own
branded online ordering business — storefront, merchant dashboard, delivery
operations and a marketplace — on one shared backend with strict tenant
isolation.

> This repository is being built in phases (see
> [`docs/PHASES.md`](docs/PHASES.md)). It is a real product, not a demo. Features
> that depend on external credentials (Supabase, payment gateways, DNS) are coded
> against environment configuration and clearly report when an integration is not
> yet connected — they are never faked.

## Current status

| Phase                  | Scope                                             | State                                                  |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| 0 — Foundation         | Framework, design system, env validation, tooling | ✅ Implemented                                         |
| 1 — Database & tenancy | Schema, RLS, entitlement model, isolation test    | ✅ Migrations written (apply to your Supabase project) |
| 2 — Marketing & leads  | Landing page, lead capture, SEO                   | ✅ Implemented (lead storage needs Supabase)           |
| 3–10                   | Onboarding → launch                               | ⏳ Not started                                         |

See [`docs/PHASES.md`](docs/PHASES.md) for the full tracker and acceptance
criteria.

## Tech stack

- **Frontend/SSR:** React 19 + React Router 7 (framework mode) + Vite 7
- **Styling:** Tailwind CSS v4, shadcn-style component primitives, Lucide icons
- **Forms/validation:** React Hook Form + Zod
- **Hosting/runtime:** Cloudflare Workers (`@cloudflare/vite-plugin` + Wrangler)
- **Backend data:** Supabase (PostgreSQL, Auth, Storage, Realtime) with Row Level Security
- **Testing:** Vitest (+ Testing Library)

Versions are pinned in `package.json` to a verified-compatible set.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The marketing site runs with **no** external services. To enable lead capture,
provide Supabase credentials (see [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md))
in a `.dev.vars` file and apply the migrations in `db/migrations`.

## Scripts

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Local dev server (Cloudflare Vite plugin)    |
| `npm run build`     | Production build                             |
| `npm run typecheck` | Generate route/CF types + `tsc`              |
| `npm run lint`      | ESLint                                       |
| `npm run format`    | Prettier write                               |
| `npm test`          | Vitest unit tests                            |
| `npm run deploy`    | Deploy to Cloudflare Workers (requires auth) |

## Repository layout

```
app/
  components/ui/            Shared design-system primitives
  config/brand.ts           Central, swappable brand configuration
  lib/                      env validation, Supabase clients, SEO, analytics, utils
  modules/
    marketing/              Landing page sections, pricing data, components
    leads/                  Lead schema (shared) + server service
  routes/                   Route modules (home, legal, login, sitemap, robots)
db/
  migrations/               Ordered Supabase SQL migrations (schema + RLS + seed)
  tests/                    RLS isolation harness (run against a live DB)
docs/                       Architecture, database, security, setup, deployment…
workers/app.ts              Cloudflare Worker entry (request handler)
tests/                      Vitest unit tests
```

## Documentation

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md). Security model is in
[`docs/SECURITY.md`](docs/SECURITY.md); the data model in
[`docs/DATABASE.md`](docs/DATABASE.md).
