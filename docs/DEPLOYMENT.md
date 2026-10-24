# Deployment (Cloudflare Workers)

## Prerequisites

- A Cloudflare account.
- Wrangler authenticated: `npx wrangler login`.
- A Supabase project with migrations applied (see `docs/LOCAL_SETUP.md`).

## 1. Configure public vars

Edit `wrangler.json` → `vars`:

```json
"vars": {
  "PUBLIC_APP_NAME": "Bhama Vision Grocery Cloud",
  "PUBLIC_APP_DOMAIN": "yourdomain.com",
  "PUBLIC_SUPPORT_EMAIL": "hello@yourdomain.com",
  "PUBLIC_WHATSAPP_NUMBER": "9199XXXXXXXX",
  "PUBLIC_META_PIXEL_ID": "",
  "PUBLIC_GA_MEASUREMENT_ID": "",
  "PUBLIC_GOOGLE_ADS_CONVERSION_ID": ""
}
```

## 2. Set secrets (never commit these)

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ENVIRONMENT   # production
```

## 3. Build & deploy

```bash
npm run build
npm run deploy     # wrangler deploy
```

`npm run check` runs typecheck + build + `wrangler deploy --dry-run` to validate
before a real deploy.

## 4. Custom domain & wildcard subdomains

Merchant storefronts use wildcard subdomains (`*.yourdomain.com`). Cloudflare
**Workers** (not Pages) support wildcard routing. See `docs/DOMAIN_SETUP.md` for
DNS, routes and SSL. Do not assume Cloudflare Pages supports wildcard domains.

## 5. Post-deploy checks

- Visit the site; confirm SSR works and `/sitemap.xml`, `/robots.txt` respond.
- Submit a lead and confirm a row in `public.leads`.
- Inspect logs: `npx wrangler tail`.

## CI (optional)

Add a GitHub Actions workflow running `npm ci && npm run typecheck && npm run
lint && npm test && npm run build` on PRs. Deploy on merge to `main` with the
Cloudflare API token stored as a repo secret.
