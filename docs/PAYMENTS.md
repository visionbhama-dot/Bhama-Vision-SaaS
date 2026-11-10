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
