# Database backup & verification tooling

Reusable, dependency-light scripts for safely verifying the hosted Supabase
schema and data against the committed migrations. They run a **real** PostgreSQL
engine locally via [PGlite](https://github.com/electric-sql/pglite) (WASM) — no
Docker, no hosted credentials, no network.

> **Never commit database exports.** The `backup-*.json` files these scripts
> read contain tenant/merchant/customer data and are git-ignored
> (`db/backup/*.json`). Keep them local only.

## Scripts

| Script | Purpose | Run |
|---|---|---|
| `schema-fingerprint.mjs` | Build the schema from migrations `0001..MAX` and print md5 fingerprints (columns, enums, migration-defined functions, RLS policies, tables). Run the same fingerprint SQL against a hosted DB to prove it matches the migrations. | `node db/backup/schema-fingerprint.mjs --max=0020` |
| `restore-verify.mjs` | Load the newest local `backup-*.json` export into a throwaway PGlite built at the backup's schema level and assert row counts + referential integrity — proves a logical export is complete and restorable. | `node db/backup/restore-verify.mjs [--max=13]` |
| `seed-0017-check.mjs` | Print the reference row counts + content md5 of the `0017` master-catalogue seed (used to self-guard a hosted re-seed). | `node db/backup/seed-0017-check.mjs` |

## Producing a logical export

There is no `pg_dump` dependency. A logical export is a JSON document of
`{ "tables": { "public.<name>": [ ...rows ] } }` plus a companion
`*.plan_features.json`. Generate it however you access the DB (e.g. the Supabase
MCP `execute_sql` with `json_agg(to_jsonb(t))`), writing to
`db/backup/backup-<ISO8601>.json`. `restore-verify.mjs` picks up the newest one.
