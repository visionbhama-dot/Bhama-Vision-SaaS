/**
 * Schema fingerprint tool (Phase 8 preflight — reconcile live DB vs migrations).
 *
 * Builds a fresh PostgreSQL (PGlite) from migrations 0001..MAX and prints md5
 * fingerprints of its structural schema (columns, enums, migration-defined
 * functions, RLS policies). The SAME fingerprint SQL is run against the hosted
 * DB via MCP, so matching md5s prove the hosted schema equals the migrations.
 *
 * Extension-owned functions (citext/pgcrypto) are excluded via pg_depend so the
 * comparison is not polluted by Supabase placing extensions in a different
 * schema than PGlite's contrib modules.
 *
 * Usage: node db/backup/schema-fingerprint.mjs --max=0013
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const maxArg = (process.argv.find((a) => a.startsWith("--max=")) || "--max=9999").split("=")[1];
const MAX = parseInt(maxArg, 10);

const PRELUDE = `
create schema if not exists auth;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $fn$;
grant usage on schema auth to anon, authenticated, service_role;
`;
const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
`;

// Identical fingerprint SQL is also run on the hosted DB via MCP.
export const FP = {
  cols: `select coalesce(md5(string_agg(sig, ',' order by sig)),'EMPTY') f, count(*) n from (
    select table_schema||'.'||table_name||'.'||column_name||'|'||udt_name||'|'||is_nullable as sig
    from information_schema.columns where table_schema in ('public','app')) q`,
  enums: `select coalesce(md5(string_agg(sig, ',' order by sig)),'EMPTY') f, count(*) n from (
    select t.typname||'='||e.lbls as sig from pg_type t
    join (select enumtypid, string_agg(enumlabel,'|' order by enumsortorder) lbls from pg_enum group by enumtypid) e
      on e.enumtypid=t.oid where t.typtype='e') q`,
  funcs: `select coalesce(md5(string_agg(sig, ',' order by sig)),'EMPTY') f, count(*) n from (
    select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','app')
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')) q`,
  policies: `select coalesce(md5(string_agg(sig, ',' order by sig)),'EMPTY') f, count(*) n from (
    select schemaname||'.'||tablename||'.'||policyname||':'||cmd as sig
    from pg_policies where schemaname in ('public','app')) q`,
  tables: `select coalesce(md5(string_agg(sig, ',' order by sig)),'EMPTY') f, count(*) n from (
    select schemaname||'.'||tablename as sig from pg_tables where schemaname in ('public','app')) q`,
};

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f.slice(0, 4), 10) <= MAX)
    .sort();
}

async function main() {
  const db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(PRELUDE);
  const files = migrationFiles();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
    } catch (e) {
      console.error(`migration ${f} FAILED: ${e.message}`);
      process.exit(1);
    }
  }
  await db.exec(GRANTS);

  const out = { max: MAX, applied: files.length, fingerprints: {} };
  console.log(`PGlite schema built from ${files.length} migrations (<= ${MAX})`);
  for (const [k, sql] of Object.entries(FP)) {
    const r = (await db.query(sql)).rows[0];
    out.fingerprints[k] = { md5: r.f, n: Number(r.n) };
    console.log(`  ${k.padEnd(10)} n=${String(r.n).padStart(4)}  md5=${r.f}`);
  }
  writeFileSync(join(here, `fp_pglite_${String(MAX)}.json`), JSON.stringify(out, null, 2));
  await db.close();
}
main().catch((e) => { console.error("runner error:", e.message); process.exit(1); });
