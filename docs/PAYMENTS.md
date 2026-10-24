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
