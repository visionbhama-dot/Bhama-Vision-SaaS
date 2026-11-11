# Catalogue, import & bulk product management (Phase 4a)

## Master catalogue (platform-owned)

A shared catalogue, separate from any merchant's inventory:

- `master_products` — generic, illustrative sample products. **No brands, no
  fabricated MRP/GTIN/manufacturer/images, no medicines.** Each has a stable
  `code` for idempotent seeding + import dedup.
- `catalogue_packs` + `catalogue_pack_items` — curated ready-made bundles.

Merchant price/stock/SKU/visibility/status live **only** on `public.products`
(per tenant). Importing never mutates `master_products`.

### Seed pipeline (repeatable)

Data lives in `db/seed/catalogue-data.mjs` (curated, auditable). Regenerate the
seed migration with:

```bash
node db/seed/build-catalogue-seed.mjs   # writes db/migrations/0017_seed_master_catalogue.sql
```

Current seed: **227 generic products** across 5 packs — Grocery Essentials
(123), Snacks & Beverages (30), Sweets & Bakery (28), Personal Care (24),
Household Cleaning (22). The count is deliberately honest rather than padded to
500 with junk; add more items to the data file and re-run to grow a pack past
500 (the import path is batched and handles it).

## One-click import (`/dashboard/products/import`)

Pick a pack, search/filter/multi-select, and import. Imported products are
**drafts** (`status='draft'`, `is_visible=false`) so nothing reaches a storefront
until the merchant sets a price and publishes.

**Idempotency:** a unique partial index `(tenant_id, master_product_id)` plus
`on conflict do nothing` means a double-click or retry never duplicates rows.
Imports run in bounded batches of 100 (cap 1000 per request) and report
created / skipped (already owned) / failed.

## CSV (`/dashboard/products/csv`, `/dashboard/products/export`)

- Download a template; upload a file; **preview** with per-row validation; then
  import valid rows (invalid rows are listed and downloadable as an error CSV).
- "Update existing" matches by SKU (else exact name) to update instead of
  inserting duplicates; otherwise new rows are created as drafts.
- Safety: 2 MB / 2000-row caps, a quote-based **CSV formula-injection** guard on
  export (`sanitizeCell`), in-file duplicate detection, and every write scoped by
  the authenticated tenant (RLS blocks cross-tenant writes regardless of input).

## Bulk management (`/dashboard/products`)

Search, status (all/published/draft/archived) + stock (all/out/low) filters,
sort, pagination, and stats (total / published / drafts / out-of-stock /
low-stock). Multi-select supports bulk price, stock, category, publish,
unpublish, archive and restore — bounded to 500 items per action, with a
confirmation on archive. Archiving sets `archived_at` and never deletes order
references.

## ⚠️ Payment connection caveat (flagged for the next phase)

The merchant payment _connection_ (`/dashboard/payments`, Phase 3+) currently
validates the **key-id format only** and marks a valid test key `connected`
without calling the provider to verify the account. **Do not treat this as the
platform being able to accept real payments.** Live acceptance requires order
creation, payment confirmation and signature-verified webhooks (next phase); a
live key is intentionally left `pending` until then.

## Not yet executed / needs infrastructure

- DB isolation tests (`db/tests/rls_isolation.sql`, extended for products +
  imports + master catalogue) require a live Postgres/Supabase and were **not
  executed** in this environment.
- Product images: the catalogue stores an optional `image_ref` only. Real images
  need a storage/CDN source and explicit authorisation; none are fabricated.
