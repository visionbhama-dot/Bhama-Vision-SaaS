import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";
import { getEnv } from "~/lib/env.server";
import { RESERVED_SLUGS, SLUG_RE } from "./schema";
import type { BusinessInput, SetupInput } from "./schema";

/**
 * Onboarding mutations. Every write runs through the service-role client AFTER
 * the calling route has authenticated the user; each function re-verifies that
 * the user owns the tenant it touches, so the service role is never used to
 * cross a tenant boundary. Dashboard READS use the RLS-scoped client elsewhere.
 */

export type Result<T = object> =
	({ ok: true } & T) | { ok: false; error: string; code?: string };

function admin(env: unknown): SupabaseClient | null {
	return getAdminClient(env);
}

const NOT_CONFIGURED: { ok: false; error: string; code: string } = {
	ok: false,
	code: "not_configured",
	error:
		"The database is not connected yet. Configure Supabase to continue onboarding.",
};

export async function ownedTenantId(
	client: SupabaseClient,
	userId: string,
): Promise<string | null> {
	const { data } = await client
		.from("tenant_memberships")
		.select("tenant_id")
		.eq("user_id", userId)
		.eq("role", "owner")
		.eq("status", "active")
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();
	return (data?.tenant_id as string) ?? null;
}

export type SlugStatus =
	"available" | "taken" | "reserved" | "invalid" | "unconfigured";

export async function getSlugStatus(
	env: unknown,
	rawSlug: string,
): Promise<SlugStatus> {
	const slug = rawSlug.trim().toLowerCase();
	if (!SLUG_RE.test(slug)) return "invalid";
	if (RESERVED_SLUGS.includes(slug)) return "reserved";
	const a = admin(env);
	if (!a) return "unconfigured";
	const [{ data: reserved }, { data: store }] = await Promise.all([
		a.from("reserved_slugs").select("slug").eq("slug", slug).maybeSingle(),
		a.from("stores").select("id").eq("slug", slug).maybeSingle(),
	]);
	if (reserved) return "reserved";
	if (store) return "taken";
	return "available";
}

function slugify(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return base.length >= 3 ? base : `store-${base}`.slice(0, 40);
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 6);
}

async function advanceStep(
	a: SupabaseClient,
	tenantId: string,
	next: string,
	completed: string[],
	dataPatch: Record<string, unknown>,
) {
	const { data: row } = await a
		.from("merchant_onboarding")
		.select("completed_steps, data")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	const set = new Set<string>([...(row?.completed_steps ?? []), ...completed]);
	const data = { ...(row?.data ?? {}), ...dataPatch };
	await a
		.from("merchant_onboarding")
		.update({ current_step: next, completed_steps: [...set], data })
		.eq("tenant_id", tenantId);
}

/**
 * Create the merchant (if needed) and save business profile details. On first
 * run this creates the tenant/store with an auto-generated available subdomain;
 * the merchant confirms/changes it in the next step.
 */
export async function saveBusiness(
	env: unknown,
	userId: string,
	input: BusinessInput,
): Promise<Result<{ tenantId: string }>> {
	const a = admin(env);
	if (!a) return NOT_CONFIGURED;
	const apex = getEnv(env).PUBLIC_APP_DOMAIN;

	let tenantId = await ownedTenantId(a, userId);

	if (!tenantId) {
		// Create with an auto subdomain, retrying on rare collisions.
		const base = slugify(input.businessName);
		const candidates = [
			base,
			`${base}-${randomSuffix()}`,
			`${base}-${randomSuffix()}`,
		];
		let lastErr = "Could not create your store. Please try again.";
		for (const slug of candidates) {
			const { data, error } = await a.rpc("create_merchant", {
				p_owner: userId,
				p_tenant_name: input.businessName,
				p_kind: input.kind,
				p_slug: slug,
				p_display_name: input.businessName,
				p_plan_slug: null,
				p_apex_domain: apex,
			});
			if (!error) {
				tenantId = data as string;
				break;
			}
			lastErr = error.message;
			if (!/SLUG_TAKEN|duplicate|unique/i.test(error.message)) {
				return {
					ok: false,
					error: "Could not create your store.",
					code: error.message,
				};
			}
		}
		if (!tenantId) return { ok: false, error: lastErr };
	} else {
		await a
			.from("tenants")
			.update({ name: input.businessName, kind: input.kind })
			.eq("id", tenantId);
	}

	const { error: bpErr } = await a.from("business_profiles").upsert(
		{
			tenant_id: tenantId,
			legal_name: input.legalName || null,
			business_type: input.businessType,
			address_line1: input.addressLine1,
			address_line2: input.addressLine2 || null,
			city: input.city,
			state: input.state,
			pincode: input.pincode,
			contact_phone: input.contactPhone,
			contact_email: input.contactEmail || null,
			description: input.description || null,
			gst_number: input.gstNumber || null,
			fssai_license: input.fssaiLicense || null,
		},
		{ onConflict: "tenant_id" },
	);
	if (bpErr) return { ok: false, error: "Could not save business details." };

	await advanceStep(a, tenantId, "store", ["account", "business"], {
		business: input,
	});
	return { ok: true, tenantId };
}

export async function setStoreSlug(
	env: unknown,
	userId: string,
	rawSlug: string,
): Promise<Result<{ slug: string }>> {
	const a = admin(env);
	if (!a) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(a, userId);
	if (!tenantId)
		return { ok: false, error: "Complete the business step first." };

	const slug = rawSlug.trim().toLowerCase();
	const status = await getSlugStatus(env, slug);
	if (status === "invalid")
		return {
			ok: false,
			error: "Use lowercase letters, numbers and hyphens (3–63).",
		};
	if (status === "reserved")
		return { ok: false, error: "This name is reserved." };

	// Allow keeping the current slug; otherwise it must be available.
	const { data: current } = await a
		.from("stores")
		.select("id, slug")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!current) return { ok: false, error: "Store not found." };
	if (current.slug !== slug && status === "taken")
		return { ok: false, error: "That subdomain is already taken." };

	const apex = getEnv(env).PUBLIC_APP_DOMAIN;
	const { error: upErr } = await a
		.from("stores")
		.update({ slug })
		.eq("id", current.id);
	if (upErr) {
		if (/duplicate|unique/i.test(upErr.message))
			return { ok: false, error: "That subdomain is already taken." };
		return { ok: false, error: "Could not reserve that subdomain." };
	}
	await a
		.from("tenant_domains")
		.update({ hostname: `${slug}.${apex}` })
		.eq("tenant_id", tenantId)
		.eq("kind", "subdomain");

	await advanceStep(a, tenantId, "plan", ["store"], {});
	return { ok: true, slug };
}

export async function selectPlan(
	env: unknown,
	userId: string,
	planSlug: string,
	cycle: "monthly" | "annual",
): Promise<Result> {
	const a = admin(env);
	if (!a) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(a, userId);
	if (!tenantId)
		return { ok: false, error: "Complete the earlier steps first." };

	const { data: plan } = await a
		.from("subscription_plans")
		.select("id")
		.eq("slug", planSlug)
		.maybeSingle();
	if (!plan) return { ok: false, error: "Unknown plan." };

	const { data: existing } = await a
		.from("tenant_subscriptions")
		.select("id, status")
		.eq("tenant_id", tenantId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	// IMPORTANT: selecting a plan keeps entitlements PENDING. We never set an
	// active/trialing status here — that requires verified payment (Phase 5) or
	// explicit superadmin activation.
	if (existing) {
		const keepPending = ["pending", "canceled", "expired"].includes(
			existing.status,
		);
		await a
			.from("tenant_subscriptions")
			.update({
				plan_id: plan.id,
				cycle,
				...(keepPending ? { status: "pending" } : {}),
			})
			.eq("id", existing.id);
	} else {
		await a.from("tenant_subscriptions").insert({
			tenant_id: tenantId,
			plan_id: plan.id,
			cycle,
			status: "pending",
		});
	}

	await advanceStep(a, tenantId, "setup", ["plan"], {
		plan: { planSlug, cycle },
	});
	return { ok: true };
}

export async function saveSetup(
	env: unknown,
	userId: string,
	input: SetupInput,
): Promise<Result> {
	const a = admin(env);
	if (!a) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(a, userId);
	if (!tenantId)
		return { ok: false, error: "Complete the earlier steps first." };

	const { data: store } = await a
		.from("stores")
		.select("id, theme")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!store) return { ok: false, error: "Store not found." };

	const theme = {
		...(store.theme ?? {}),
		brandColor: input.brandColor
			? `#${input.brandColor.replace("#", "")}`
			: undefined,
		payments: { cod: input.codEnabled, online: false },
	};

	const update: Record<string, unknown> = {
		theme,
		min_order_paise: Math.round((input.minOrderRupees || 0) * 100),
	};
	if (input.logoUrl) update.logo_url = input.logoUrl;

	const { error: upErr } = await a
		.from("stores")
		.update(update)
		.eq("id", store.id);
	if (upErr) return { ok: false, error: "Could not save store setup." };

	// Optional first delivery zone.
	if (input.zoneName && input.zonePincodes) {
		const pincodes = input.zonePincodes
			.split(/[\s,]+/)
			.map((p) => p.trim())
			.filter((p) => /^[1-9][0-9]{5}$/.test(p));
		await a.from("delivery_zones").insert({
			tenant_id: tenantId,
			name: input.zoneName,
			pincodes,
			fee_paise: Math.round((input.zoneFeeRupees || 0) * 100),
		});
	}

	await advanceStep(a, tenantId, "review", ["setup"], { setup: input });
	return { ok: true };
}

/**
 * Submit the store for Bhama Vision review. This does NOT activate the store or
 * grant entitlements — it moves it to `pending_verification`. A superadmin
 * activation (or a verified payment later) is required to go live.
 */
export async function submitForReview(
	env: unknown,
	userId: string,
): Promise<Result> {
	const a = admin(env);
	if (!a) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(a, userId);
	if (!tenantId) return { ok: false, error: "Complete onboarding first." };

	const { data: store } = await a
		.from("stores")
		.select("id, status, display_name")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!store) return { ok: false, error: "Store not found." };

	if (
		["draft", "pending_payment", "pending_verification"].includes(store.status)
	) {
		await a
			.from("stores")
			.update({ status: "pending_verification" })
			.eq("id", store.id);
	}
	await advanceStep(a, tenantId, "submitted", ["review"], {});

	await a
		.from("notification_outbox")
		.insert({
			tenant_id: tenantId,
			channel: "internal",
			topic: "merchant.submitted",
			payload: { store: store.display_name },
			status: "pending",
		})
		.then(
			() => undefined,
			() => undefined,
		);

	return { ok: true };
}
