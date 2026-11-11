/**
 * Computes the reference fingerprint of the 0017 master-catalogue seed by
 * building a fresh PGlite from migrations 0001..0017 (the real seed file) and
 * printing row counts + a content md5. The hosted apply of 0017 self-guards
 * against these exact values, rolling back if they do not match.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const PRELUDE = `
create schema if not exists auth;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $fn$;
create or replace function auth.role() returns text language sql stable as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $fn$;
grant usage on schema auth to anon, authenticated, service_role;`;

const MD5_EXPR = `md5(string_agg(
  code||'|'||name||'|'||category||'|'||coalesce(subcategory,'')||'|'||coalesce(brand,'')||'|'||
  classification::text||'|'||coalesce(pack_size,'')||'|'||coalesce(unit,'')||'|'||
  coalesce(variant_label,'')||'|'||coalesce(barcode,'')||'|'||coalesce(description,'')||'|'||
  coalesce(image_ref,'')||'|'||data_source||'|'||verification_status::text||'|'||is_active::text||'|'||metadata::text,
  chr(10) order by code))`;

const db = await PGlite.create({ extensions: { citext, pgcrypto } });
await db.exec(PRELUDE);
for (const f of readdirSync(migrationsDir).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f.slice(0,4),10) <= 17).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}
const mp = (await db.query(`select count(*)::int n, ${MD5_EXPR} as md5 from public.master_products`)).rows[0];
const packs = (await db.query(`select count(*)::int n from public.catalogue_packs`)).rows[0];
const items = (await db.query(`select count(*)::int n from public.catalogue_pack_items`)).rows[0];
console.log("master_products.count =", mp.n);
console.log("master_products.md5   =", mp.md5);
console.log("catalogue_packs.count =", packs.n);
console.log("catalogue_pack_items.count =", items.n);
await db.close();
