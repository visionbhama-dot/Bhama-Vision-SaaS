import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, isSupabaseConfigured, type AppEnv } from "./env.server";

/**
 * Server-side Supabase clients.
 *
 * - {@link getAnonClient} uses the anon key and is subject to Row Level Security.
 *   Use it for anything that should run with the caller's authorization.
 * - {@link getAdminClient} uses the service-role key and BYPASSES RLS. It must
 *   never be constructed in browser code and should only be used by trusted
 *   server endpoints that have already performed their own validation and
 *   authorization (e.g. inserting a public lead after server-side validation
 *   and rate limiting).
 *
 * Both return `null` when the relevant credentials are not configured so callers
 * can report an honest "integration unavailable" state rather than crashing or
 * faking success.
 */

export class SupabaseNotConfiguredError extends Error {
	constructor(message = "Supabase is not configured") {
		super(message);
		this.name = "SupabaseNotConfiguredError";
	}
}

const baseOptions = {
	auth: { persistSession: false, autoRefreshToken: false },
};

export function getAnonClient(raw: unknown): SupabaseClient | null {
	const env = getEnv(raw);
	if (!isSupabaseConfigured(env)) return null;
	return createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, baseOptions);
}

export function getAdminClient(raw: unknown): SupabaseClient | null {
	const env = getEnv(raw);
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
	return createClient(
		env.SUPABASE_URL,
		env.SUPABASE_SERVICE_ROLE_KEY,
		baseOptions,
	);
}

export type { AppEnv };
