# Local setup (Windows + VS Code / Kiro)

> The marketing site runs with **no** external services. Supabase is only needed
> to store leads and (later) power the app.

## 1. Prerequisites

- Node.js 20+ (`node -v`). Install from https://nodejs.org or via `nvm`.
- Git, and a code editor (VS Code or Kiro).

## 2. Install & run

```powershell
npm install
npm run dev
```

Open http://localhost:5173. On Windows, run commands in PowerShell or the VS
Code integrated terminal.

## 3. Create a Supabase project (for lead capture)

1. Sign up at https://supabase.com and create a project (free tier is fine for a
   pilot — see `docs/` notes on limits).
2. In **Project Settings → API**, copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

## 4. Configure local secrets

Copy `.dev.vars.example` to `.dev.vars` (git-ignored) and fill the values:

```
SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
ENVIRONMENT="development"
```

Public (non-secret) values live in `wrangler.json` under `vars`
(`PUBLIC_APP_NAME`, `PUBLIC_APP_DOMAIN`, `PUBLIC_WHATSAPP_NUMBER`, analytics IDs).

## 5. Apply database migrations

There are 11 migrations in `db/migrations` (`0001`–`0011`). **Apply them in
numeric order** — later files depend on earlier ones.

Option A — Supabase SQL editor: open each file in `db/migrations` in order and
run it (0001, 0002, … 0011).

Option B — Supabase CLI:

```powershell
npm i -g supabase
supabase link --project-ref YOUR-REF
# Copy db/migrations/*.sql into supabase/migrations (keep the numeric prefixes)
supabase db push
```

Sanity check (SQL editor): `select slug from public.subscription_plans;` should
return `starter, growth, marketplace`.

## 6. Configure Supabase Auth

Authentication is used from Phase 3 (signup, login, email verification, reset).

- **Authentication → URL Configuration → Site URL:** your app origin
  (`http://localhost:8788` for `wrangler dev`, or your deployed URL).
- **Redirect URLs:** add BOTH of these for each origin you use:
  - `http://localhost:8788/auth/callback`
  - `https://YOUR-DEPLOYED-DOMAIN/auth/callback`
    The email-confirmation and password-reset links return here to establish the
    session, then forward to onboarding / reset.
- **Email confirmations:** leave "Confirm email" ON for production (merchants
  verify before onboarding). For quick local testing you may temporarily turn it
  off so signup logs you straight in.
- **Storage:** create a `product-images` bucket (public read) when Phase 4
  begins. (Phase 3 accepts a logo via URL; direct upload arrives in Phase 4.)

> Note on `PUBLIC_APP_DOMAIN`: this seeds each store's subdomain
> (`slug.<PUBLIC_APP_DOMAIN>`) and is used to build the email redirect origin in
> some flows. Set it to your real apex domain in production.

## 7. Create the first superadmin (securely)

1. Sign up normally at `/signup` (or create a user in Supabase → Authentication).
2. Confirm the email so the account is active.
3. Promote it in the SQL editor:

```sql
update public.user_profiles
set platform_role = 'platform_admin'
where id = 'THE-AUTH-USER-UUID';   -- copy from Authentication → Users
```

The superadmin can then review merchants at `/admin/merchants`. Never ship a
hardcoded admin password; always promote a real, verified account.

## 8. Build-time verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## 9. Verify marketing leads are stored

1. Run the app (`npm run dev`) with Supabase configured.
2. On the homepage, scroll to **"Ready to Take Your Grocery Business Online?"**
   and submit the enquiry form.
3. You should see a success screen with a reference like `BV-YYMMDD-XXXX`.
4. Confirm the row landed in the database (SQL editor):

```sql
select reference, business_name, city, status, created_at
from public.leads
order by created_at desc
limit 5;

-- an internal notification is also queued for the superadmin inbox:
select topic, payload, status from public.notification_outbox
where topic = 'lead.created' order by created_at desc limit 5;
```

If the form returns "Lead storage is not connected yet", your
`SUPABASE_SERVICE_ROLE_KEY` is missing/incorrect in `.dev.vars`.

> Leads are **not** publicly readable: RLS exposes them only to platform admins.
> The insert works because the server uses the service-role key after validating
> the submission server-side.

## 10. Verify auth & onboarding (Phase 3)

1. Sign up at `/signup`, confirm your email (link → `/auth/callback` → onboarding).
2. Complete the wizard: business → store (pick a subdomain) → plan → setup →
   review → submit. Refreshing mid-way resumes at your current step.
3. Check the data:

```sql
select t.name, s.slug, s.status, sub.status as subscription_status
from public.tenants t
join public.stores s on s.tenant_id = t.id
left join public.tenant_subscriptions sub on sub.tenant_id = t.id
order by t.created_at desc;
```

Expect `s.status = 'pending_verification'` after submit and
`subscription_status = 'pending'` — entitlements are NOT active yet. 4. As the superadmin, open `/admin/merchants` and **Approve** the merchant.
Re-run the query: `s.status` becomes `active` and `subscription_status`
becomes `active`. An `audit_logs` row records the approval.

To run the database permission tests against your project:

```bash
psql "$DATABASE_URL" -f db/tests/rls_isolation.sql
psql "$DATABASE_URL" -f db/tests/onboarding_permissions.sql
```
