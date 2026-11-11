/**
 * Backup restore verification (Phase 8 preflight).
 *
 * Proves the logical backup (db/backup/backup-*.json) can be restored into an
 * isolated throwaway database. Builds a fresh PostgreSQL (PGlite) at the SAME
 * schema level the backup was taken from (migrations 0001..0013), loads every
 * backed-up row (pg_restore-style: triggers/FKs deferred via
 * session_replication_role=replica), then asserts row counts match and spot
 * checks referential integrity. Nothing here touches the hosted database.
 *
 * Usage: node db/backup/restore-verify.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

// Schema level the backup was taken at (override with --max=NN if needed).
const MAX = parseInt(
	(process.argv.find((a) => a.startsWith("--max=")) || "--max=13").split("=")[1],
	10,
);

// Auto-discover the newest local export (these JSON files are gitignored and
// are produced out-of-band; never committed because they hold tenant data).
const backups = readdirSync(here)
	.filter((f) => /^backup-.*\.json$/.test(f) && !f.endsWith(".plan_features.json"))
	.sort();
if (backups.length === 0) {
	console.error(
		"No backup-*.json export found in db/backup/. Produce one first (see db/backup/README.md); exports are intentionally gitignored.",
	);
	process.exit(2);
}
const backupFile = backups.at(-1);
const planFile = backupFile.replace(/\.json$/, ".plan_features.json");
console.log(`Using export: ${backupFile}`);
const backup = JSON.parse(readFileSync(join(here, backupFile), "utf8"));
const planFeatures = JSON.parse(readFileSync(join(here, planFile), "utf8"));

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

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f.slice(0, 4), 10) <= MAX)
    .sort();
}

const keysOf = (rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

let failures = 0;
const log = (s) => console.log(s);

async function main() {
  const db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(PRELUDE);
  for (const f of migrationFiles()) {
    await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  log(`✓ isolated DB built from migrations 0001-00${MAX}`);

  // pg_restore-style load: defer triggers + FK checks during bulk insert.
  await db.exec("set session_replication_role = replica;");

  // Migrations 0002/0010 seed reference data (plans, plan_features,
  // reserved_slugs, platform_settings) with their OWN generated ids. A real
  // restore targets empty tables, so clear seed rows before loading the backup.
  await db.exec(`do $$ declare r record; begin
    for r in select tablename from pg_tables where schemaname='public' loop
      execute format('truncate table public.%I restart identity cascade', r.tablename);
    end loop; end $$;`);
  await db.exec("truncate table auth.users cascade;");

  // Parent rows the public FKs point at (minimal auth.users).
  for (const u of backup.tables["auth.users_identity_nonsecret"] || []) {
    await db.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [u.id, u.email]);
  }

  // All public.* tables from the main backup, plus plan_features companion.
  const datasets = [];
  for (const [key, rows] of Object.entries(backup.tables)) {
    if (!key.startsWith("public.")) continue;
    datasets.push([key.slice("public.".length), rows]);
  }
  datasets.push(["plan_features", planFeatures.rows]);

  for (const [table, rows] of datasets) {
    if (!rows || rows.length === 0) continue;
    const cols = keysOf(rows);
    const collist = cols.map((c) => `"${c}"`).join(", ");
    const sql = `insert into public.${table} (${collist}) select ${collist} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`;
    try {
      await db.query(sql, [JSON.stringify(rows)]);
    } catch (e) {
      failures++;
      log(`✗ load public.${table}: ${e.message}`);
    }
  }
  await db.exec("set session_replication_role = origin;");

  // 1. Row-count assertions vs backup manifest.
  log("── Row counts (restored vs backup) ──");
  const expected = { ...backup.row_counts };
  expected["public.plan_features"] = planFeatures.rows.length;
  for (const [table] of datasets) {
    const key = `public.${table}`;
    const got = Number((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n);
    const exp = expected[key];
    const ok = got === exp;
    if (!ok) failures++;
    log(`  ${ok ? "✓" : "✗"} ${key.padEnd(30)} restored=${got} expected=${exp}`);
  }

  // 2. Referential-integrity spot checks (orphans must be zero).
  log("── Referential integrity ──");
  const fkChecks = [
    ["stores -> tenants", "select count(*) n from public.stores s left join public.tenants t on t.id=s.tenant_id where t.id is null"],
    ["tenant_subscriptions -> subscription_plans", "select count(*) n from public.tenant_subscriptions x left join public.subscription_plans p on p.id=x.plan_id where p.id is null"],
    ["plan_features -> subscription_plans", "select count(*) n from public.plan_features f left join public.subscription_plans p on p.id=f.plan_id where p.id is null"],
    ["tenant_memberships -> tenants", "select count(*) n from public.tenant_memberships m left join public.tenants t on t.id=m.tenant_id where t.id is null"],
    ["tenant_domains -> stores", "select count(*) n from public.tenant_domains d left join public.stores s on s.id=d.store_id where s.id is null"],
  ];
  for (const [label, sql] of fkChecks) {
    const orphans = Number((await db.query(sql)).rows[0].n);
    if (orphans !== 0) failures++;
    log(`  ${orphans === 0 ? "✓" : "✗"} ${label}: ${orphans} orphan(s)`);
  }

  await db.close();
  log(failures === 0 ? "\nRESTORE VERIFICATION PASSED — backup is complete and restorable." : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("runner error:", e.message); process.exit(1); });
