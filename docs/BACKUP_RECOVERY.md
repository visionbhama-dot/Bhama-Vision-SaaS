# Backup & recovery

## Supabase

- **Automated backups:** enabled by Supabase per plan tier. The free tier has
  limited backup retention — treat it as a pilot-only safety net, not a
  production guarantee.
- **Independent logical backups:** run `pg_dump` on a schedule to storage you
  control (do not rely solely on the provider):

  ```bash
  pg_dump "$DATABASE_URL" --no-owner --format=custom --file backup-$(date +%F).dump
  # restore:
  pg_restore --no-owner --dbamed --clean --if-exists -d "$TARGET_URL" backup-YYYY-MM-DD.dump
  ```

- **Storage bucket backups:** periodically sync the `product-images` bucket to
  independent object storage.

## What to back up

- Full Postgres database (schema + data).
- Supabase Storage buckets (product images, logos).
- Infrastructure config: `wrangler.json`, migrations (in Git), and a **secure,
  offline** record of which secrets are set (never the secret values in Git).

## Restore drill (must be tested before launch)

1. Provision a fresh Supabase project.
2. Apply `db/migrations` in order.
3. `pg_restore` the latest dump.
4. Re-sync Storage.
5. Point a staging Worker at the restored project and smoke-test.

## Retention

- Keep ≥ 7 daily + ≥ 4 weekly logical backups to start; adjust to RPO/RTO needs.
- Delivery location pings have their own short retention (see DELIVERY_TRACKING).
- Honor data-deletion requests per the Privacy Policy.
