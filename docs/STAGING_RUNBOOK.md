# Staging verification runbook (Phase 6)

This phase was implemented without hosted Supabase/Postgres or Razorpay
credentials, so the database and payment flows below were **not executed** here.
Follow this runbook on a real (free-tier) Supabase project + Cloudflare Worker
to verify end-to-end before onboarding a paying merchant.

## 0. Prerequisites

- A Supabase project (free tier).
- A Cloudflare account for `wrangler dev`/deploy (free tier).
- Optional: a Razorpay **test** account for online payments (COD needs none).

## 1. Apply migrations

Apply `db/migrations/0001` → `0018` in order (Supabase SQL editor or
`supabase db push`). Confirm no errors. `0017` seeds the master catalogue.

## 2. Configure secrets

Local `.dev.vars` (see `.dev.vars.example`):

```
SUPABASE_URL=...            SUPABASE_ANON_KEY=...       SUPABASE_SERVICE_ROLE_KEY=...
PAYMENTS_ENC_KEY=$(openssl rand -base64 32)   # only needed for online payments
```

Production: `wrangler secret put SUPABASE_URL` (etc.) and `PAYMENTS_ENC_KEY`.

## 3. Database security suite

```
psql "$DATABASE_URL" -f db/tests/rls_isolation.sql        # tenant isolation
psql "$DATABASE_URL" -f db/tests/onboarding_permissions.sql
psql "$DATABASE_URL" -f db/tests/checkout_orders.sql      # COD: dedup, oversell, cancel-restores-stock
```

All three should print only `PASS:` notices and roll back.

## 4. COD end-to-end (manual)

1. Create a merchant (signup → onboarding), then **superadmin → approve** so the
   store is `active`.
2. `/dashboard/products/import` → import a pack; set prices + stock; publish a
   few via bulk actions.
3. `/dashboard/settings` → set delivery fee / min order / accepting orders.
4. Visit `/store/<slug>`, add items, go to checkout, place a **COD** order.
5. Confirm: confirmation page shows the order number; `/dashboard/orders` shows
   it as **New**.
6. Accept → Preparing → Ready; add a rider in `/dashboard/delivery`; assign;
   Picked up → Delivered; then **Mark COD paid**.
7. Verify stock decreased by the ordered quantity; cancel a different order and
   verify stock is restored.

## 5. Concurrency / duplicate checks

- Submit the checkout twice quickly (or refresh the POST) → exactly one order
  (idempotency key).
- With a product at stock = 1, place two orders in parallel → only one succeeds.

## 6. Razorpay test mode (optional)

1. `/dashboard/payments` → connect with **test** key id + key secret (+ webhook
   secret). It must call Razorpay and only then show `connected`.
2. In the Razorpay dashboard, add the webhook `https://<host>/api/payments/webhook/<tenantId>`
   using the same webhook secret; subscribe to `payment.captured`.
3. Place an **online** order with Razorpay test cards; confirm the order is
   marked paid only after signature + capture verification, and that a replayed
   webhook does not double-process.

## What remains untested until the above is run

- All DB-dependent behaviour (checkout, orders, delivery, isolation) — code +
  SQL harnesses written, not executed here.
- Any real Razorpay transaction, webhook delivery, or signature round-trip
  against the live API.

---

## Phase 7 — real-PostgreSQL verification (executed) + deployment readiness

### Fast local DB verification (no hosting needed)

A real PostgreSQL engine runs in-process via PGlite (WASM) with a small
Supabase-compatibility shim (the `auth` schema + `auth.uid()`, the
`anon`/`authenticated`/`service_role` roles, and Supabase's default table
grants). This runs the ACTUAL migrations + SQL suites:

```
npm run test:db
```

It applies migrations `0001`→`0019` to a fresh database and runs
`rls_isolation.sql`, `onboarding_permissions.sql`, and `checkout_orders.sql`,
plus a privileged-RPC lockdown check. **This is an approximation of hosted
Supabase for speed; Supabase remains the real target** — still run the `psql`
suite (section 3) against your Supabase staging DB before a live pilot.

### Results recorded in Phase 7 (executed here)

- ✅ 19 migrations apply cleanly to an empty PostgreSQL 18 database.
- ✅ Master catalogue seed integrity: 227 products.
- ✅ Privileged RPCs (`place_order`, `create_merchant`, `cancel_order`) are NOT
  callable by `authenticated` (execute revoked) — this surfaced + fixed a real
  gap where `create_merchant` was still callable via `PUBLIC` (migration 0019).
- ✅ `rls_isolation.sql` — tenant isolation across customers, leads, payment
  accounts, pharmacy, products, orders and imports.
- ✅ `onboarding_permissions.sql` — atomic merchant creation + duplicate-slug
  rejection + cross-tenant write blocked.
- ✅ `checkout_orders.sql` — COD idempotency, last-unit oversell guard, and
  cancel-restores-stock.
- ✅ Running against real PostgreSQL also caught a **critical** `place_order`
  ambiguous-column bug that would have failed every checkout — fixed in 0019.

### Deployment readiness (executed here)

- ✅ `npm run build` + `npx wrangler deploy --dry-run` succeed. Worker upload is
  ~2.4 MB raw / ~465 KiB gzip — within the Workers **Free** 3 MB limit. Checkout
  makes a single Supabase subrequest, far under the 50-subrequest limit.
- ⛔ Not deployed: no Cloudflare/Supabase credentials in this environment.

### Highest applied migration: **0019**.
