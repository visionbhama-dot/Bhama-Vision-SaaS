# Development phases & progress tracker

Legend: ✅ Implemented · 🧪 Tested · 🚧 In progress · ⏳ Not started · 🔒 Blocked
(needs external credentials/approval) · 🚫 Not production-ready (mock only)

> Rule: an integration is **never** marked production-ready while it only uses
> mock data. Items needing human action (API keys, DNS, gateway approval) are
> marked 🔒 with the exact blocker.

## Phase 0 — Foundation ✅

| Item                                               | State | Notes                                |
| -------------------------------------------------- | ----- | ------------------------------------ |
| React Router 7 + Vite + Cloudflare Worker scaffold | ✅    | Builds via `npm run build`           |
| TypeScript strict, path aliases                    | ✅🧪  | `npm run typecheck` passes           |
| Tailwind v4 design tokens + UI primitives          | ✅    | `app/components/ui`, `app.css`       |
| Central brand config                               | ✅    | `app/config/brand.ts`                |
| Env validation (zod)                               | ✅🧪  | `app/lib/env.server.ts`, unit tested |
| Lint + Prettier + Vitest                           | ✅🧪  | `npm run lint` / `test` pass         |

## Phase 1 — Database & auth ✅ (apply to your project to activate)

| Item                                               | State | Notes                                         |
| -------------------------------------------------- | ----- | --------------------------------------------- |
| Core schema migrations                             | ✅    | `db/migrations/0001–0008`                     |
| Tenancy model (tenants/stores/domains/memberships) | ✅    | `0002`                                        |
| Subscription plans + entitlement resolver          | ✅🧪  | `0003`, mirrored in `plans.ts` (tested)       |
| RLS policies (default-deny, helper-based)          | ✅    | `0009`                                        |
| Plan seed                                          | ✅    | `0010`                                        |
| Tenant isolation test                              | ✅    | `db/tests/rls_isolation.sql` (run on live DB) |
| Supabase Auth wiring (sign-up/in, roles)           | ⏳    | Phase 3                                       |
| Migrations applied to a real project               | 🔒    | Needs your Supabase project (see LOCAL_SETUP) |

## Phase 2 — Marketing & leads ✅

| Item                                                | State   | Notes                                                  |
| --------------------------------------------------- | ------- | ------------------------------------------------------ |
| Landing page (all 13 sections)                      | ✅      | `routes/home.tsx` + `modules/marketing`                |
| Interactive pricing + comparison table              | ✅🧪    | monthly/annual toggle; plan data tested                |
| Lead capture form (RHF + zod, honeypot, consent)    | ✅🧪    | schema unit tested                                     |
| Lead persistence to Supabase + reference number     | ✅ / 🔒 | code done; storage needs Supabase creds                |
| Superadmin lead inbox                               | ⏳      | Phase 8 (rows land in `leads` + `notification_outbox`) |
| SEO (meta, OG, JSON-LD, sitemap, robots, canonical) | ✅      | `lib/seo.ts`, `sitemap.xml`, `robots.txt`              |
| Consent-gated analytics (Pixel/GA/Ads)              | ✅ / 🔒 | loads only with IDs + consent                          |
| Legal pages (privacy/terms/refund/merchant)         | ✅      | Draft templates pending legal review                   |
| WhatsApp click-to-chat                              | ✅ / 🔒 | needs `PUBLIC_WHATSAPP_NUMBER`                         |

**Phase 2 deployability:** the site builds and runs publicly now. Lead capture
becomes live once Supabase is connected and migrations applied.

## Phases 3–10 — ⏳ Not started

3. Merchant onboarding (account → store → slug reservation → plan → checklist)
4. Single-store commerce (catalog, storefront, cart, checkout, COD, orders, reports)
5. Payment integration (SaaS billing + merchant gateway, webhooks, refunds)
6. Delivery management (riders, assignment, foreground live tracking)
7. Marketplace (vendors, multi-vendor orders, commissions, settlements)
8. Superadmin completion (merchants, plans, billing, support, analytics, audit)
9. Production hardening (security/pen tests, indexes, backups, monitoring, load)
10. Launch (prod config, live domain, verified webhooks, go-live checklist)

Each later phase has acceptance criteria in the master spec (section 21) and
will be tracked here as work begins.
