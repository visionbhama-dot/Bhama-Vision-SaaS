# Security

## Principles

- **Default-deny RLS** on every data table; access only through audited helper
  functions that derive identity from the verified JWT (`auth.uid()`).
- **No client-trusted authorization.** A `tenant_id` from the browser never
  grants access. Store/tenant identity is resolved server-side.
- **Secrets stay server-side.** The Supabase service-role key is only used in
  `*.server.ts` on the Worker. The browser receives only `toPublicConfig()`
  values. `.dev.vars` / Cloudflare secrets hold credentials; nothing secret is
  committed (`.gitignore` covers `.env`, `.dev.vars`).
- **Honest integration states.** When an integration (Supabase, gateway, SMS,
  WhatsApp, maps) is not configured, the code returns an explicit
  "not configured" result instead of faking success.

## Implemented in Phase 0–2

- Zod validation of environment (`env.server.ts`) and of all lead input
  (`modules/leads/schema.ts`) on both client and server.
- Lead endpoint anti-abuse: honeypot field + server-side re-validation; inserts
  use the service role so `leads` is never world-readable.
- Consent-gated analytics: Pixel/GA/Ads load only after explicit consent and
  only when IDs are configured.
- `noindex` on legal/auth pages; `robots.txt` disallows `/app`, `/admin`, `/api`.

## Planned (later phases, tracked in PHASES.md)

- Supabase Auth: strong passwords, email/phone verification, secure sessions,
  password reset, RBAC via `tenant_memberships`.
- Rate limiting on sensitive endpoints (Cloudflare rate limiting / KV / Durable
  Objects) — the lead endpoint is the first to receive it.
- CSRF protection for cookie-based mutations; CSP + security headers.
- File-upload validation (type/size/scan) for product images.
- Payment security: server-created orders, webhook signature verification,
  idempotency keys (schema already enforces uniqueness), reconciliation.
- Secure, fully-audited support impersonation (never an unlogged backdoor).
- PII minimization, retention policies, and jurisdiction-appropriate privacy
  controls.

## Compliance checklist (must be completed before live sales)

- [ ] Legal review of Privacy, Terms, Refund/Cancellation, Merchant Agreement
      (current pages are drafts clearly marked as such).
- [ ] Confirm merchant obligations: GST, FSSAI/food-business licensing capture.
- [ ] Payment gateway KYC/approval (Razorpay or equivalent).
- [ ] Data retention + deletion procedures operational.
- [ ] Do **not** claim any compliance certification that has not been obtained.
