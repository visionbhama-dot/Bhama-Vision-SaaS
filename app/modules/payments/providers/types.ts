/**
 * Merchant payment provider adapters.
 *
 * Bhama Vision is software-only: each merchant connects THEIR OWN payment
 * provider account and receives customer payments directly. An adapter captures
 * everything provider-specific (id, labels, how to validate the connection
 * fields, where its secret lives) behind one interface, so adding a provider
 * later is a new file + a registry entry — no schema change, no churn in the
 * routes or services.
 *
 * Security: adapters deal ONLY with non-secret, publishable fields (e.g. a
 * Razorpay key_id). The real API secret is never handled here or stored in the
 * database; it lives in a Worker secret named by `secretEnvVar(tenantId)` and
 * is read from env at charge time (a future phase).
 */

export type PaymentEnvironment = "test" | "live";

export interface PaymentProviderInfo {
	/** Stable id stored in merchant_payment_accounts.provider. */
	id: string;
	label: string;
	description: string;
	docsUrl: string;
	/** Human hint describing the public key the merchant must paste. */
	keyLabel: string;
}

export interface ConnectionInput {
	keyId: string;
	environment: PaymentEnvironment;
}

export interface NormalizedConnection {
	keyId: string;
	environment: PaymentEnvironment;
	accountRef: string | null;
}

export type ValidationResult =
	{ ok: true; normalized: NormalizedConnection } | { ok: false; error: string };

export interface PaymentProviderAdapter {
	info: PaymentProviderInfo;
	/**
	 * Validate the public connection fields (format + environment match). Pure
	 * and synchronous — no network, so it is safe to unit test and never leaks.
	 */
	validate(input: ConnectionInput): ValidationResult;
	/**
	 * Name of the Worker secret expected to hold this tenant's provider secret
	 * key. The value is provisioned out-of-band (`wrangler secret put <name>`);
	 * we only ever store this NAME, never the secret.
	 */
	secretEnvVar(tenantId: string): string;
}

/** Turn a tenant UUID into a safe uppercase env-var suffix (A–Z, 0–9, _). */
export function envSuffix(tenantId: string): string {
	return tenantId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

/** Mask a public key for display, e.g. rzp_test_ABCD…WXYZ. */
export function maskKey(keyId: string | null | undefined): string {
	if (!keyId) return "—";
	if (keyId.length <= 12) return keyId;
	return `${keyId.slice(0, 10)}…${keyId.slice(-4)}`;
}
