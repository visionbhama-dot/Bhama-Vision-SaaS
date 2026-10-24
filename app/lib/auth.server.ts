import {
	createServerClient,
	parseCookieHeader,
	serializeCookieHeader,
} from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "react-router";
import { getEnv, isSupabaseConfigured } from "./env.server";

/**
 * Cookie-based Supabase Auth for the Cloudflare Worker.
 *
 * `createAuthClient` builds a request-scoped Supabase client that reads the
 * session from the incoming `Cookie` header and writes refreshed session
 * cookies onto a `Headers` object the caller must attach to its Response. The
 * client runs queries AS THE AUTHENTICATED USER, so Row Level Security applies —
 * this is how merchant dashboards prove tenant isolation.
 *
 * Security notes:
 * - We always validate the session with `auth.getUser()` (which verifies the
 *   JWT with Supabase) rather than trusting the cookie contents via getSession.
 * - Session cookies are httpOnly + Secure + SameSite=Lax.
 */

export interface AuthContext {
	supabase: SupabaseClient;
	headers: Headers;
}

const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: true,
	sameSite: "lax" as const,
	path: "/",
};

export function isAuthConfigured(rawEnv: unknown): boolean {
	return isSupabaseConfigured(getEnv(rawEnv));
}

export function createAuthClient(
	request: Request,
	rawEnv: unknown,
): AuthContext {
	const env = getEnv(rawEnv);
	if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
		throw new Response("Authentication is not configured", { status: 503 });
	}

	const headers = new Headers();
	const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		cookies: {
			getAll() {
				return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
					(c) => ({ name: c.name, value: c.value ?? "" }),
				);
			},
			setAll(cookiesToSet) {
				for (const { name, value, options } of cookiesToSet) {
					headers.append(
						"Set-Cookie",
						serializeCookieHeader(name, value, {
							...COOKIE_OPTIONS,
							...options,
						}),
					);
				}
			},
		},
	});

	return { supabase, headers };
}

/** Return the verified user or null (does not redirect). */
export async function getOptionalUser(
	request: Request,
	rawEnv: unknown,
): Promise<{ auth: AuthContext; user: User | null }> {
	const auth = createAuthClient(request, rawEnv);
	const {
		data: { user },
	} = await auth.supabase.auth.getUser();
	return { auth, user };
}

/** Require an authenticated user; redirect to /login otherwise. */
export async function requireUser(
	request: Request,
	rawEnv: unknown,
	redirectTo = "/login",
): Promise<{ auth: AuthContext; user: User }> {
	// If Supabase isn't connected yet, there's nothing to authenticate against —
	// send the user to login, which explains the integration isn't configured.
	if (!isAuthConfigured(rawEnv)) {
		throw redirect(redirectTo);
	}
	const { auth, user } = await getOptionalUser(request, rawEnv);
	if (!user) {
		const url = new URL(request.url);
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(`${redirectTo}?next=${next}`, { headers: auth.headers });
	}
	return { auth, user };
}

export interface MerchantContext {
	tenant: {
		id: string;
		name: string;
		kind: "single_store" | "marketplace";
	} | null;
	membership: { role: string; status: string } | null;
	store: {
		id: string;
		slug: string;
		display_name: string;
		status: string;
		logo_url: string | null;
		min_order_paise: number;
	} | null;
	onboarding: {
		current_step: string;
		completed_steps: string[];
		data: Record<string, unknown>;
	} | null;
	subscription: {
		status: string;
		cycle: string;
		plan: { slug: string; name: string } | null;
	} | null;
}

/**
 * Load the merchant's own tenant context via the RLS-scoped client. Because the
 * client runs as the user, RLS guarantees they can only ever see a tenant they
 * belong to. Returns the first owned/active membership (one tenant per owner for
 * now).
 */
export async function getMerchantContext(
	supabase: SupabaseClient,
	userId: string,
): Promise<MerchantContext> {
	const empty: MerchantContext = {
		tenant: null,
		membership: null,
		store: null,
		onboarding: null,
		subscription: null,
	};

	const { data: membership } = await supabase
		.from("tenant_memberships")
		.select("role, status, tenant_id")
		.eq("user_id", userId)
		.eq("status", "active")
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();

	if (!membership) return empty;

	const tenantId = membership.tenant_id as string;

	const [tenantRes, storeRes, onboardingRes, subRes] = await Promise.all([
		supabase
			.from("tenants")
			.select("id, name, kind")
			.eq("id", tenantId)
			.maybeSingle(),
		supabase
			.from("stores")
			.select("id, slug, display_name, status, logo_url, min_order_paise")
			.eq("tenant_id", tenantId)
			.maybeSingle(),
		supabase
			.from("merchant_onboarding")
			.select("current_step, completed_steps, data")
			.eq("tenant_id", tenantId)
			.maybeSingle(),
		supabase
			.from("tenant_subscriptions")
			.select("status, cycle, subscription_plans(slug, name)")
			.eq("tenant_id", tenantId)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
	]);

	const planRel = subRes.data?.subscription_plans as
		| { slug: string; name: string }
		| { slug: string; name: string }[]
		| null
		| undefined;
	const plan = Array.isArray(planRel)
		? (planRel[0] ?? null)
		: (planRel ?? null);

	return {
		tenant: tenantRes.data as MerchantContext["tenant"],
		membership: { role: membership.role, status: membership.status },
		store: storeRes.data as MerchantContext["store"],
		onboarding: onboardingRes.data as MerchantContext["onboarding"],
		subscription: subRes.data
			? { status: subRes.data.status, cycle: subRes.data.cycle, plan }
			: null,
	};
}

/** Require a platform administrator (superadmin). */
export async function requirePlatformAdmin(
	request: Request,
	rawEnv: unknown,
): Promise<{ auth: AuthContext; user: User }> {
	const { auth, user } = await requireUser(request, rawEnv);
	const { data: profile } = await auth.supabase
		.from("user_profiles")
		.select("platform_role")
		.eq("id", user.id)
		.maybeSingle();
	if (profile?.platform_role !== "platform_admin") {
		throw new Response("Forbidden", { status: 403 });
	}
	return { auth, user };
}
