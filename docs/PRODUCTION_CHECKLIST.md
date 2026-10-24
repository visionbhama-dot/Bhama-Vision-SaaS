# Production checklist

Nothing here may be ticked on the basis of a UI rendering alone. Verify behavior.

## Infrastructure

- [ ] Supabase project provisioned; all migrations applied in order.
- [ ] Cloudflare Worker deployed; apex + wildcard routes configured.
- [ ] Wildcard TLS active for `*.yourdomain.com`.
- [ ] All secrets set via `wrangler secret put` (none committed).

## Data & security

- [ ] RLS enabled on every data table; `db/tests/rls_isolation.sql` passes.
- [ ] Service-role key used only server-side.
- [ ] Rate limiting on lead + auth + payment endpoints.
- [ ] Security headers + CSP; CSRF protection on cookie mutations.
- [ ] File-upload validation for product images.

## Payments (before live sales)

- [ ] SaaS gateway connected; webhook signature verification live.
- [ ] Merchant gateway connection flow tested end-to-end.
- [ ] Idempotency verified: duplicate webhook does not double-charge/double-fulfil.
- [ ] COD works; online methods show "unavailable" when no gateway.
- [ ] A **failed** payment never produces a paid-order receipt.

## Commerce correctness

- [ ] Server-side total calculation verified against tampered client payloads.
- [ ] Stock reservation concurrency tested (no negative stock unless allowed).
- [ ] Coupon usage limits enforced.
- [ ] Reports distinguish paid/pending/cancelled/refunded/COD.

## Legal / compliance

- [ ] Privacy, Terms, Refund, Merchant Agreement reviewed by counsel (not drafts).
- [ ] GST + FSSAI/food-licensing capture confirmed with merchants.
- [ ] Data retention + deletion procedures operational.
- [ ] No unearned compliance certifications claimed anywhere.

## Operations

- [ ] Monitoring + error logging (`wrangler tail`, Supabase logs, alerting).
- [ ] Backups automated and **restore tested** (see BACKUP_RECOVERY.md).
- [ ] Free-tier capacity limits documented; upgrade thresholds identified.
- [ ] Go-live test transactions executed on production config.
