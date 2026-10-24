import { z } from "zod";
import type { PublicRuntimeConfig } from "~/config/brand";

/**
 * Environment validation (server only).
 *
 * The Cloudflare Worker receives configuration through `context.cloudflare.env`.
 * We validate it with zod so that a missing/misconfigured value fails loudly and
 * early rather than surfacing as a confusing runtime error deep in a request.
 *
 * Design choice: integration secrets (Supabase, email, payments) are OPTIONAL at
 * boot. The marketing site must render and be deployable before those providers
 * are connected. Features that need an integration check for it explicitly and
 * return an honest "not configured" result instead of pretending to succeed.
 */
const envSchema = z.object({
	// --- Public, non-secret runtime values (safe to send to the browser) ---
	PUBLIC_APP_NAME: z.string().min(1).default("Bhama Vision Grocery Cloud"),
	PUBLIC_APP_DOMAIN: z.string().min(1).default("localhost:5173"),
	PUBLIC_SUPPORT_EMAIL: z.string().default("hello@bhamavision.example"),
	PUBLIC_WHATSAPP_NUMBER: z.string().default(""),
	PUBLIC_META_PIXEL_ID: z.string().default(""),
	PUBLIC_GA_MEASUREMENT_ID: z.string().default(""),
	PUBLIC_GOOGLE_ADS_CONVERSION_ID: z.string().default(""),

	// --- Supabase (server-side). Optional until the project is provisioned. ---
	SUPABASE_URL: z.string().url().optional(),
	SUPABASE_ANON_KEY: z.string().optional(),
	// Service role bypasses RLS — server only, never exposed to the browser.
	SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

	// --- Operational toggles ---
	ENVIRONMENT: z
		.enum(["development", "preview", "production"])
		.default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Pure parse + validate of a raw env object. Throws with a readable message on
 * invalid configuration. Side-effect free so it is straightforward to unit test.
 */
export function parseEnv(raw: unknown): AppEnv {
	const parsed = envSchema.safeParse(raw ?? {});
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `${i.path.join(".")}: ${i.message}`)
			.join("; ");
		throw new Error(`Invalid environment configuration: ${issues}`);
	}
	return parsed.data;
}

let cached: AppEnv | null = null;

/**
 * Parse + validate the raw Cloudflare env. Cached per isolate after first call.
 */
export function getEnv(raw: unknown): AppEnv {
	if (cached) return cached;
	cached = parseEnv(raw);
	return cached;
}

/** True when Supabase credentials are present and the DB-backed features work. */
export function isSupabaseConfigured(env: AppEnv): boolean {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/** Extract only the values that are safe to expose to the browser. */
export function toPublicConfig(env: AppEnv): PublicRuntimeConfig {
	return {
		appName: env.PUBLIC_APP_NAME,
		appDomain: env.PUBLIC_APP_DOMAIN,
		supportEmail: env.PUBLIC_SUPPORT_EMAIL,
		whatsappNumber: env.PUBLIC_WHATSAPP_NUMBER,
		analytics: {
			metaPixelId: env.PUBLIC_META_PIXEL_ID,
			gaMeasurementId: env.PUBLIC_GA_MEASUREMENT_ID,
			googleAdsConversionId: env.PUBLIC_GOOGLE_ADS_CONVERSION_ID,
		},
	};
}
