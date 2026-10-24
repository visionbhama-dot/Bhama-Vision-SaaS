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

Option A — Supabase SQL editor: open each file in `db/migrations` in numeric
order and run it.

Option B — Supabase CLI:

```powershell
npm i -g supabase
supabase link --project-ref YOUR-REF
# apply each migration in order, or copy them into supabase/migrations
```

## 6. Configure Supabase Auth (for later phases)

- **Authentication → URL Configuration:** add `http://localhost:5173` and your
  deployed URL(s) to redirect URLs.
- **Storage:** create a `product-images` bucket (public read) when Phase 4 begins.

## 7. Create the first superadmin (securely)

After Auth is wired (Phase 3), create a user via Supabase Auth, then in SQL:

```sql
update public.user_profiles
set platform_role = 'platform_admin'
where id = 'THE-AUTH-USER-UUID';
```

Never ship a hardcoded admin password; promote a real, verified account.

## 8. Verify

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Submit the lead form on the homepage — with Supabase configured you should get a
success screen with a reference like `BV-YYMMDD-XXXX`, and a row in
`public.leads` + `public.notification_outbox`.
