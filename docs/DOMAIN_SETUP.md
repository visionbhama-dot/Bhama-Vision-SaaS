# Domain & multi-tenant subdomains

## Goal

Each active store is reachable at `store-slug.yourdomain.com`, resolved to a
single tenant server-side. Unknown hosts are rejected; reserved names
(`www`, `admin`, `api`, `app`, `support`, …) are blocked.

## Production (Cloudflare Workers)

1. Add your domain to Cloudflare and use Cloudflare DNS.
2. Create a DNS record for the apex/root and a **wildcard**: `*  CNAME  @`
   (proxied / orange cloud).
3. Add Worker **routes** so the Worker handles both:
   - `yourdomain.com/*`
   - `*.yourdomain.com/*`
4. SSL: enable **Total TLS** / advanced certificate so the wildcard hostname is
   covered by HTTPS. (Universal SSL alone does not cover multi-level wildcards.)

> Cloudflare **Pages** does not support wildcard custom domains the same way —
> this project deploys as a **Worker** specifically for that reason.

## Tenant resolution (how it works)

The Worker reads the request `Host`, looks it up in `tenant_domains`, and:

- unknown host → 404 / marketing redirect;
- host maps to a `suspended`/`closed` store → suspended-store page;
- host maps to an `active` store → load only that tenant's public catalogue.

Resolution and authorization are identical in dev and prod. Locally, use the
path form `localhost:5173/store/:slug`, which runs the same logic without needing
wildcard DNS.

## Custom merchant domains (optional, later)

Supporting a merchant's own domain (e.g. `shop.theirbrand.com`) requires:

1. The merchant adds a CNAME to our target.
2. Ownership verification (TXT record or file).
3. TLS provisioning for that hostname.

Until implemented per account, we do **not** claim universal custom-domain
support.
