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

## Phase 3 — Merchant onboarding ✅ (apply migrations + connect Supabase to run)

| Item                                                         | State | Notes                                                                    |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------------ |
| Supabase Auth: signup, login, logout, sessions               | ✅    | cookie sessions via `@supabase/ssr` (`lib/auth.server.ts`)               |
| Email verification + password reset                          | ✅    | `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/callback` |
| Profile auto-provisioning                                    | ✅    | `handle_new_user` trigger (migration 0011)                               |
| Merchant registration + business profile                     | ✅🧪  | wizard `business` step; schemas unit tested                              |
| Unique subdomain reservation + collision/reserved guard      | ✅🧪  | `create_merchant` + UNIQUE constraint; `getSlugStatus` tested            |
| Plan selection (entitlements stay PENDING)                   | ✅🧪  | `selectPlan` never activates; invariant unit tested                      |
| Save-and-resume wizard                                       | ✅    | `merchant_onboarding` drives current step                                |
| Store setup (min order, COD, brand colour, logo URL, zone)   | ✅    | `setup` step                                                             |
| Merchant dashboard (real tenant data + checklist)            | ✅    | RLS-scoped counts prove isolation                                        |
| Superadmin merchant review / approve / suspend               | ✅    | `/admin/merchants`, audited; approval is the explicit activation         |
| Store statuses (draft→pending_verification→active/suspended) | ✅    | enforced server-side                                                     |
| Loading/validation/error states + mobile UI                  | ✅    | server-validated forms, `useNavigation`                                  |
| Tenant-permission + duplicate-slug DB test                   | ✅    | `db/tests/onboarding_permissions.sql` (live DB)                          |
| Live run against a real Supabase project                     | 🔒    | needs your Supabase project + migrations (see LOCAL_SETUP)               |

**Not activated automatically:** selecting a plan or submitting for review never
grants paid entitlements. A store goes live only via superadmin approval (the
explicit admin activation) or, from Phase 5, a verified payment.

## Phase 3+ — Merchant-owned payments & pharmacy verification 🚧 (apply migrations + connect Supabase to run)

| Item                                                                     | State | Notes                                                                   |
| ------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------- |
| Merchant payment-account connection model                                | ✅    | `merchant_payment_accounts` (migration 0014), owner+admin RLS           |
| Provider adapter architecture (Razorpay first, extensible)               | ✅🧪  | `modules/payments/providers/*`; adapter validation unit tested          |
| Merchant payment settings page                                           | ✅    | `/dashboard/payments`: connect/disconnect, test vs live, masked key     |
| Connection statuses (not_connected/pending/connected/error/disconnected) | ✅    | enum in 0014; shown to merchant + superadmin                            |
| No raw secrets in DB (secret_ref → Worker secret)                        | ✅    | only public key id stored; secret provisioned out-of-band               |
| Superadmin visibility of connection status                               | ✅    | surfaced on `/admin/merchants`                                          |
| Live charge/verification (create order, webhook)                         | 🔒    | Phase 5 — needs merchant's provider secret + webhook registration       |
| Licensed Pharmacy category (non-breaking)                                | ✅    | `stores.category` (migration 0015); default keeps existing stores       |
| Pharmacy verification workflow + documents                               | ✅    | `pharmacy_verifications` / `pharmacy_documents`; `/dashboard/pharmacy`  |
| Superadmin pharmacy review (pending→under_review→verified/…)             | ✅    | `/admin/pharmacy`, audited; 24h review target recorded                  |
| Medicine ordering DISABLED by default + explicit gate                    | ✅🧪  | `stores.medicine_ordering_enabled=false`; separate audited admin toggle |
| Secure binary document upload (private Storage bucket)                   | 🔒    | needs a private `pharmacy-docs` Supabase Storage bucket (see below)     |
| Payment + pharmacy tenant-isolation DB test                              | ✅    | extended `db/tests/rls_isolation.sql` (live DB)                         |
| Live run against a real Supabase project                                 | 🔒    | needs your Supabase project + migrations (see LOCAL_SETUP)              |

**Safety invariants:** uploading documents or verifying a licence never enables
medicine ordering, and platform verification is never presented as government
approval. Medicine ordering is a separate, explicit, audited admin action gated
on a prior `verified` status and intended to follow the applicable legal review.

## Phase 4a — Master catalogue, one-click import & bulk products 🚧 (apply migrations + connect Supabase to run)

Advances the Phase 4 "catalog" item below.

| Item                                                           | State   | Notes                                                                      |
| -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| Platform master catalogue (separate from merchant inventory)   | ✅      | `master_products`, `catalogue_packs`, `catalogue_pack_items` (0016)        |
| 5 ready-made packs seeded with generic products                | ✅      | 227 illustrative generics (0017); repeatable via `db/seed/*`               |
| One-click "Add from catalogue" with multi-select/search/filter | ✅      | `/dashboard/products/import`; drafts only                                  |
| Import idempotency + DB-level dedup                            | ✅🧪    | unique `(tenant_id, master_product_id)`; on-conflict-do-nothing; batched   |
| CSV template / upload / validate / preview / import / export   | ✅🧪    | `/dashboard/products/csv` + `/export`; parser + validation unit tested     |
| CSV formula-injection-safe export + row-level error report     | ✅🧪    | `sanitizeCell`; downloadable error CSV                                     |
| Bulk price/stock/category/publish/unpublish/archive/restore    | ✅      | bounded to 500/op; destructive actions confirmed                           |
| Search / status + stock filters / sort / pagination / stats    | ✅      | `/dashboard/products`                                                      |
| Draft-by-default; storefront shows only published+visible      | ✅      | `products.status`; storefront query filters `status='published'`           |
| Catalogue + product tenant-isolation DB test                   | ✅ / 🔒 | extended `db/tests/rls_isolation.sql` — **NOT executed** (no live PG here) |
| Live run against a real Supabase project                       | 🔒      | needs your Supabase project + migrations 0016/0017                         |

**Known limitation to address next:** the merchant payment _connection_ currently
validates key-id **format** only and marks a test key `connected` without calling
the provider to verify the account. Real payment acceptance (order creation +
signature-verified webhooks) is still required before claiming live payments.

## Phases 4–10 — ⏳ Not started

4. Single-store commerce (catalog ✅ via Phase 4a; storefront, cart, checkout, COD, orders, reports)
5. Payment integration (SaaS billing + merchant gateway, webhooks, refunds)
6. Delivery management (riders, assignment, foreground live tracking)
7. Marketplace (vendors, multi-vendor orders, commissions, settlements)
8. Superadmin completion (merchants, plans, billing, support, analytics, audit)
9. Production hardening (security/pen tests, indexes, backups, monitoring, load)
10. Launch (prod config, live domain, verified webhooks, go-live checklist)

Each later phase has acceptance criteria in the master spec (section 21) and
will be tracked here as work begins.
