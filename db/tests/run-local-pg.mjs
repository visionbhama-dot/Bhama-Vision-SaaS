/**
 * Local / CI database test runner (real PostgreSQL via PGlite — no Docker,
 * no hosted account needed).
 *
 * PGlite is PostgreSQL compiled to WASM; this runs the ACTUAL migrations and
 * the SQL test suites against a real Postgres engine. It provides a small
 * Supabase-compatibility shim (the `auth` schema + `auth.uid()`, the
 * `anon`/`authenticated`/`service_role` roles, and the default table grants
 * Supabase applies) so the migrations and RLS behave as they do on Supabase.
 *
 * This is an APPROXIMATION of the hosted Supabase environment for fast local
 * verification. Supabase remains the real target — see docs/STAGING_RUNBOOK.md.
 *
 * Usage: npm run test:db
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

// --- Supabase-compatibility shim (created BEFORE the migrations run) --------
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

-- Mirrors Supabase's auth.uid(): reads the verified JWT subject from GUCs.
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$fn$;
grant usage on schema auth to anon, authenticated, service_role;
`;

// Grants Supabase applies so anon/authenticated reach tables (RLS then guards).
const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
`;

function migrationFiles() {
	return readdirSync(migrationsDir)
		.filter((f) => /^\d+_.*\.sql$/.test(f))
		.sort();
}

async function buildDb() {
	const db = await PGlite.create({ extensions: { citext, pgcrypto } });
	await db.exec(PRELUDE);
	for (const f of migrationFiles()) {
		const sql = readFileSync(join(migrationsDir, f), "utf8");
		try {
			await db.exec(sql);
		} catch (e) {
			throw new Error(`migration ${f} failed: ${e.message}`);
		}
	}
	await db.exec(GRANTS);
	return db;
}

let failures = 0;
const log = (s) => console.log(s);

async function main() {
	// 1. Migrations apply cleanly.
	log(
		"── Applying migrations 0001–" +
			migrationFiles().at(-1).slice(0, 4) +
			" to a fresh PostgreSQL ──",
	);
	const db = await buildDb();
	log(`✓ ${migrationFiles().length} migrations applied`);

	// 2. Schema introspection (evidence).
	const q = async (sql) => (await db.query(sql)).rows[0].n;
	log(
		`  tables:   ${await q("select count(*)::int n from pg_tables where schemaname='public'")}`,
	);
	log(
		`  enums:    ${await q("select count(*)::int n from pg_type where typtype='e'")}`,
	);
	log(
		`  policies: ${await q("select count(*)::int n from pg_policies where schemaname='public'")}`,
	);
	log(
		`  funcs(app): ${await q("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='app'")}`,
	);
	const seed = await q("select count(*)::int n from public.master_products");
	log(`  master_products seeded: ${seed}`);
	if (seed !== 227) {
		failures++;
		log(`✗ expected 227 seeded master products, got ${seed}`);
	} else log("✓ master catalogue seed integrity (227)");

	// 3. SECURITY DEFINER abuse check: anon/authenticated must NOT be able to
	//    call the privileged RPCs directly (execute revoked).
	for (const fn of [
		"select public.place_order('00000000-0000-0000-0000-000000000000'::uuid,'k','cod'::payment_method,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,0,null)",
		"select public.create_merchant('00000000-0000-0000-0000-000000000000'::uuid,'x','single_store'::tenant_kind,'x'::citext,'x',null,'x')",
		"select public.cancel_order('00000000-0000-0000-0000-000000000000'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'x')",
	]) {
		await db.exec("set role authenticated;");
		let denied = false;
		try {
			await db.query(fn);
		} catch (e) {
			denied = /permission denied/i.test(e.message);
		}
		await db.exec("reset role;");
		const name = fn.match(/public\.(\w+)/)[1];
		if (denied)
			log(`✓ ${name}: not callable by 'authenticated' (execute revoked)`);
		else {
			failures++;
			log(`✗ SECURITY: ${name} is callable by 'authenticated'`);
		}
	}

	// 4. Run each SQL test suite on a fresh database (self-asserting; a failed
	//    ASSERT raises and is caught here).
	for (const file of [
		"rls_isolation.sql",
		"onboarding_permissions.sql",
		"checkout_orders.sql",
	]) {
		const testDb = await buildDb();
		const sql = readFileSync(join(here, file), "utf8");
		try {
			await testDb.exec(sql);
			log(`✓ ${file} — all assertions passed`);
		} catch (e) {
			failures++;
			log(`✗ ${file} — ${e.message}`);
		}
		await testDb.close();
	}

	await db.close();
	log(
		failures === 0
			? "\nALL DB TESTS PASSED"
			: `\n${failures} DB TEST(S) FAILED`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("runner error:", e.message);
	process.exit(1);
});
