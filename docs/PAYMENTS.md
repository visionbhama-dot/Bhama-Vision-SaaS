# Payments

There are **two separate** payment systems. Keeping them distinct is essential.

## System A — Bhama Vision subscriptions

Merchants paying Bhama Vision for a SaaS plan. Tables: `subscription_plans`,
`tenant_subscriptions`, `subscription_invoices`, `subscription_payments`.
Flow (Phase 5): server-created gateway order → hosted checkout → **webhook** with
signature verification → mark invoice paid → grant entitlements. A browser
returning from checkout is **never** the sole proof of payment.

## System B — Grocery customer payments

Customers paying **their store** (or marketplace). Tables: `order_payments`,
`refunds`. Money goes to the **merchant's** connected account — never funnelled
into Bhama Vision's bank account.

- Single store: merchant connects their own approved gateway credentials /
  provider-connected account.
- Marketplace: an approved connected-account / marketplace-settlement model
  (e.g. Razorpay Route), subject to provider approval. Until then, settlements
  are tracked manually and clearly labeled as such (`vendor_settlements.status`).

## Money handling

- All amounts are integer **paise** in `bigint`. No floating point.
- Reports distinguish paid / pending / cancelled / refunded / COD orders.

## Security (enforced / planned)

- Server-created payment orders; secret keys never in browser code.
- Webhook **signature verification** (planned Phase 5).
- Idempotency: `order_payments` and `subscription_payments` have a unique
  `(provider, idempotency_key)` so duplicate webhooks cannot create duplicate
  paid orders.
- Refunds are authorized and audited (`refunds.approved_by`, `audit_logs`).

## When no gateway is connected

Cash on Delivery is fully operational. Online payment methods are shown as
**unavailable** rather than simulated. We never simulate a successful live
payment.

## Human setup required (🔒)

- Create/approve a Razorpay (or equivalent) account; complete KYC.
- Store API keys as Cloudflare secrets.
- Register webhook endpoints (added in Phase 5) in the gateway dashboard.

## Merchant payment-account connections (System B wiring)

Each merchant connects **their own** provider account from
`/dashboard/payments`. Implemented in migration `0014` + `app/modules/payments`.

- **Model.** One `merchant_payment_accounts` row per `(tenant, provider)`.
  Statuses: `not_connected`, `pending`, `connected`, `error`, `disconnected`.
  Owner-only + platform-admin RLS; never world-readable.
- **Adapters.** `app/modules/payments/providers/` defines a `PaymentProviderAdapter`
  interface with a registry. Razorpay ships first; adding a provider is a new
  adapter file + a registry entry (no schema change).
- **Secret handling.** We store **only** the public key id (e.g. Razorpay
  `key_id`). The real secret key is **never** stored in the database. Each
  tenant's secret is a Worker secret named by the adapter —
  `RZP_SECRET_<TENANT_ID_UNDERSCORED>` — set out-of-band with
  `wrangler secret put`. The connection row keeps that name in `secret_ref`.
- **Test vs live.** A validated **test** key is marked `connected` immediately
  (usable for sandbox flows). A **live** key is stored and marked `pending`
  because going live additionally requires the provider secret and a real
  verification/charge call (Phase 5). We never fabricate a live `connected`
  state.

### To activate live customer payments (🔒 owner action)

1. In the merchant's Razorpay dashboard, complete KYC and generate **live** API
   keys.
2. Paste the live **Key ID** on `/dashboard/payments` (Mode = Live).
3. An operator sets the matching secret as a Worker secret:
   `wrangler secret put RZP_SECRET_<TENANT_ID_UNDERSCORED>`.
4. The create-order + signature-verified webhook flow (Phase 5) then flips the
   connection to `connected` after a real verification.

## Pharmacy document storage (🔒 setup)

Licensed-pharmacy supporting documents are intended for a **private** Supabase
Storage bucket named `pharmacy-docs` (no public access; readable only by the
owning tenant + platform admins). Until that bucket is created, the UI records
document **references/metadata** only — it never publishes files and never fakes
an upload. See `db/migrations/0015` and `/dashboard/pharmacy`.

## Phase 6 update — COD journey + hardened online payments

### Cash on Delivery (the working path)

COD is fully implemented and is the recommended way to take the first real
orders. Checkout → `place_order()` (atomic, oversell-safe, duplicate-safe) →
customer confirmation → merchant dashboard → self-delivery → merchant marks COD
paid on collection. Fulfilment status (`orders.status`) and payment status
(`orders.payment_state`) are tracked separately — delivering an order never
auto-marks it paid, and vice versa.

### Secret storage — supersedes the per-tenant Worker-secret idea

Earlier notes suggested a Worker secret per tenant (`RZP_SECRET_<tenant>`). That
does **not** scale: Cloudflare limits the number of environment
variables/secret bindings per Worker (dozens, not thousands), so a secret per
merchant would cap the platform at a handful of stores and require a redeploy to
add one.

**Implemented approach:** one platform key `PAYMENTS_ENC_KEY` (a 256-bit Worker
secret) encrypts each merchant's API secret + webhook secret with AES-256-GCM
(`app/lib/crypto.server.ts`). The ciphertext lives in
`merchant_payment_accounts.secret_ciphertext` / `webhook_secret_ciphertext`;
plaintext never touches the database, the browser or logs. This scales to many
merchants with a single secret and is appropriate for the first two merchants
and beyond. (A future upgrade path is a managed KMS/Vault — the storage shape
doesn't need to change.)

### Real credential verification (fixes the format-only limitation)

Connecting a provider now calls the Razorpay API to verify the key pair before
marking the connection `connected`/`verified`. A key that only _looks_ valid is
never treated as operational; it stays `pending` (public key only) or `error`
(verification failed). Online checkout is offered **only** when a verified,
decryptable connection exists (`getVerifiedConnection`).

### Online order lifecycle (implemented, not yet exercised)

1. Server creates a Razorpay order for the **server-calculated** paise amount
   using the merchant's own credentials; stores `provider_order_id`.
2. Browser completes Razorpay Checkout; the callback posts to
   `/api/payments/verify`, which verifies `HMAC(order_id|payment_id, key_secret)`
   AND fetches the payment to confirm it is actually captured before marking
   paid. Returning to a success URL alone never marks an order paid.
3. The authoritative confirmation is the webhook at
   `/api/payments/webhook/:tenant`: it verifies `HMAC(rawBody, webhook_secret)`
   (a secret **separate** from the API key) in constant time, deduplicates by
   event id via an atomic unique insert, and marks the order paid **once**.
   The per-tenant path + per-tenant secret mean one merchant's webhook cannot
   affect another's orders.

> ⚠️ Not exercised against Razorpay in this environment (no merchant test
> credentials). The code is implemented to Razorpay's contract and unit-tested
> for signature/HMAC correctness, but a real sandbox transaction has not been
> run. Keep online payments disabled until verified against a real test account.
