import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";
import { ownedTenantId } from "~/modules/onboarding/service.server";
import { getProvider } from "./providers/registry";
import type { ConnectInput } from "./schema";

/**
 * Merchant-owned payment connection operations.
 *
 * Writes use the service-role client AFTER the route has authenticated the user,
 * and every function re-verifies the user OWNS the tenant it touches (via
 * ownedTenantId) — the service role is never used to cross a tenant boundary.
 * We only ever persist non-secret fields; the real provider secret is a Worker
 * secret named by the adapter and set out-of-band.
 */

export type Result<T = object> =
	({ ok: true } & T) | { ok: false; error: string; code?: string };

export interface PaymentAccount {
	provider: string;
	environment: "test" | "live";
	status: "not_connected" | "pending" | "connected" | "error" | "disconnected";
	keyId: string | null;
	accountRef: string | null;
	secretRef: string | null;
	lastError: string | null;
	connectedAt: string | null;
	verifiedAt: string | null;
}

const NOT_CONFIGURED: { ok: false; error: string; code: string } = {
	ok: false,
	code: "not_configured",
	error:
		"The database is not connected yet. Configure Supabase to manage payment connections.",
};

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
		target_type: "payment_account",
		target_id: tenantId,
		detail,
	});
}

function mapRow(row: Record<string, unknown>): PaymentAccount {
	return {
		provider: row.provider as string,
		environment: row.environment as "test" | "live",
		status: row.status as PaymentAccount["status"],
		keyId: (row.key_id as string | null) ?? null,
		accountRef: (row.account_ref as string | null) ?? null,
		secretRef: (row.secret_ref as string | null) ?? null,
		lastError: (row.last_error as string | null) ?? null,
		connectedAt: (row.connected_at as string | null) ?? null,
		verifiedAt: (row.verified_at as string | null) ?? null,
	};
}

/** All connection rows for a tenant (service role; caller must authorize). */
export async function getPaymentAccounts(
	env: unknown,
	tenantId: string,
): Promise<PaymentAccount[]> {
	const admin = getAdminClient(env);
	if (!admin) return [];
	const { data } = await admin
		.from("merchant_payment_accounts")
		.select(
			"provider, environment, status, key_id, account_ref, secret_ref, last_error, connected_at, verified_at",
		)
		.eq("tenant_id", tenantId)
		.order("created_at", { ascending: true });
	return (data ?? []).map(mapRow);
}

/**
 * Connect (or update) the merchant's own provider account.
 *
 * Test-mode: a validated test key is marked `connected` — it is immediately
 * usable for test flows and needs no live verification. Live-mode: we store the
 * public key and mark the connection `pending` because going live requires the
 * provider secret (a Worker secret) and a real verification call, which is a
 * later phase. We never fabricate a live "connected" state.
 */
export async function connectProvider(
	env: unknown,
	userId: string,
	input: ConnectInput,
): Promise<Result<{ status: string; secretRef: string }>> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;

	const adapter = getProvider(input.provider);
	if (!adapter) return { ok: false, error: "Unsupported payment provider." };

	const tenantId = await ownedTenantId(admin, userId);
	if (!tenantId)
		return { ok: false, error: "Only the store owner can manage payments." };

	const validation = adapter.validate({
		keyId: input.keyId,
		environment: input.environment,
	});
	if (!validation.ok) return { ok: false, error: validation.error };

	const secretRef = adapter.secretEnvVar(tenantId);
	const nowIso = new Date().toISOString();
	const isTest = input.environment === "test";
	const status = isTest ? "connected" : "pending";

	const { error } = await admin.from("merchant_payment_accounts").upsert(
		{
			tenant_id: tenantId,
			provider: input.provider,
			environment: input.environment,
			status,
			key_id: validation.normalized.keyId,
			account_ref: validation.normalized.accountRef,
			secret_ref: secretRef,
			last_error: null,
			connected_at: isTest ? nowIso : null,
			verified_at: isTest ? nowIso : null,
		},
		{ onConflict: "tenant_id,provider" },
	);
	if (error) {
		return {
			ok: false,
			error: "Could not save your payment connection.",
			code: error.message,
		};
	}

	await logAudit(admin, userId, tenantId, "merchant.payment.connect", {
		provider: input.provider,
		environment: input.environment,
		status,
	});
	return { ok: true, status, secretRef };
}

export async function disconnectProvider(
	env: unknown,
	userId: string,
	provider: string,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(admin, userId);
	if (!tenantId)
		return { ok: false, error: "Only the store owner can manage payments." };

	const { error } = await admin
		.from("merchant_payment_accounts")
		.update({ status: "disconnected", connected_at: null, verified_at: null })
		.eq("tenant_id", tenantId)
		.eq("provider", provider);
	if (error) return { ok: false, error: "Could not disconnect." };

	await logAudit(admin, userId, tenantId, "merchant.payment.disconnect", {
		provider,
	});
	return { ok: true };
}

/** Superadmin visibility: connection status per tenant. */
export interface TenantPaymentSummary {
	tenantId: string;
	provider: string;
	status: string;
	environment: string;
}

export async function listAllConnections(
	env: unknown,
): Promise<Map<string, TenantPaymentSummary>> {
	const admin = getAdminClient(env);
	const map = new Map<string, TenantPaymentSummary>();
	if (!admin) return map;
	const { data } = await admin
		.from("merchant_payment_accounts")
		.select("tenant_id, provider, status, environment")
		.order("updated_at", { ascending: false });
	for (const row of data ?? []) {
		// First row per tenant wins (most recently updated).
		if (!map.has(row.tenant_id as string)) {
			map.set(row.tenant_id as string, {
				tenantId: row.tenant_id as string,
				provider: row.provider as string,
				status: row.status as string,
				environment: row.environment as string,
			});
		}
	}
	return map;
}
