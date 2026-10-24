import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";

/**
 * Superadmin merchant operations. Writes use the service-role client and always
 * record an audit_logs entry. Approval is the ONLY path (besides a verified
 * payment in Phase 5) that activates a store and grants plan entitlements — it
 * is the "explicitly authorized administrative activation" the spec requires.
 */

export interface MerchantRow {
	tenant_id: string;
	tenant_name: string;
	kind: string;
	store_id: string | null;
	slug: string | null;
	display_name: string | null;
	status: string | null;
	created_at: string;
	plan_slug: string | null;
	subscription_status: string | null;
	city: string | null;
}

async function logAudit(
	admin: SupabaseClient,
	actorId: string,
	tenantId: string,
	action: string,
	detail: Record<string, unknown> = {},
) {
	await admin.from("audit_logs").insert({
		actor_id: actorId,
		tenant_id: tenantId,
		action,
		target_type: "tenant",
		target_id: tenantId,
		detail,
	});
}

export async function listMerchants(env: unknown): Promise<MerchantRow[]> {
	const admin = getAdminClient(env);
	if (!admin) return [];
	const { data: tenants } = await admin
		.from("tenants")
		.select(
			`id, name, kind, created_at,
			 stores(id, slug, display_name, status),
			 business_profiles(city),
			 tenant_subscriptions(status, subscription_plans(slug))`,
		)
		.order("created_at", { ascending: false })
		.limit(200);

	return (tenants ?? []).map((t): MerchantRow => {
		const store = Array.isArray(t.stores) ? t.stores[0] : t.stores;
		const bp = Array.isArray(t.business_profiles)
			? t.business_profiles[0]
			: t.business_profiles;
		const sub = Array.isArray(t.tenant_subscriptions)
			? t.tenant_subscriptions[0]
			: t.tenant_subscriptions;
		const planRel = sub?.subscription_plans;
		const plan = Array.isArray(planRel) ? planRel[0] : planRel;
		return {
			tenant_id: t.id,
			tenant_name: t.name,
			kind: t.kind,
			store_id: store?.id ?? null,
			slug: store?.slug ?? null,
			display_name: store?.display_name ?? null,
			status: store?.status ?? null,
			created_at: t.created_at,
			plan_slug: plan?.slug ?? null,
			subscription_status: sub?.status ?? null,
			city: bp?.city ?? null,
		};
	});
}

export async function approveMerchant(
	env: unknown,
	actorId: string,
	tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Database not configured." };

	const { data: store } = await admin
		.from("stores")
		.select("id, status")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!store) return { ok: false, error: "Store not found." };

	await admin.from("stores").update({ status: "active" }).eq("id", store.id);
	await admin
		.from("tenant_domains")
		.update({ verified: true })
		.eq("tenant_id", tenantId)
		.eq("kind", "subdomain");

	// Explicit administrative activation of entitlements.
	const now = new Date();
	const periodEnd = new Date(now);
	periodEnd.setMonth(periodEnd.getMonth() + 1);
	const { data: sub } = await admin
		.from("tenant_subscriptions")
		.select("id")
		.eq("tenant_id", tenantId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (sub) {
		await admin
			.from("tenant_subscriptions")
			.update({
				status: "active",
				current_period_start: now.toISOString(),
				current_period_end: periodEnd.toISOString(),
			})
			.eq("id", sub.id);
	}

	await logAudit(admin, actorId, tenantId, "merchant.approve", {
		previous_store_status: store.status,
		note: "Store activated and entitlements granted by administrator.",
	});
	return { ok: true };
}

export async function suspendMerchant(
	env: unknown,
	actorId: string,
	tenantId: string,
	reason: string,
): Promise<{ ok: boolean; error?: string }> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Database not configured." };
	const { data: store } = await admin
		.from("stores")
		.select("id, status")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!store) return { ok: false, error: "Store not found." };

	// Suspension blocks new orders but preserves all historical/financial data.
	await admin.from("stores").update({ status: "suspended" }).eq("id", store.id);
	await logAudit(admin, actorId, tenantId, "merchant.suspend", {
		previous_store_status: store.status,
		reason,
	});
	return { ok: true };
}

export async function reactivateMerchant(
	env: unknown,
	actorId: string,
	tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Database not configured." };
	const { data: store } = await admin
		.from("stores")
		.select("id, status")
		.eq("tenant_id", tenantId)
		.maybeSingle();
	if (!store) return { ok: false, error: "Store not found." };
	await admin.from("stores").update({ status: "active" }).eq("id", store.id);
	await logAudit(admin, actorId, tenantId, "merchant.reactivate", {
		previous_store_status: store.status,
	});
	return { ok: true };
}
