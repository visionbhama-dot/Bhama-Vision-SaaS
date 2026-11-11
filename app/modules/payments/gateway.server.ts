import { hmacSha256Hex, timingSafeEqualHex } from "~/lib/crypto.server";

/**
 * Razorpay server-side gateway helpers.
 *
 * Implements the actual integration contract from Razorpay's docs:
 *  - credential verification by calling the API (not just key-id format),
 *  - order creation with a server-calculated amount in paise,
 *  - checkout signature verification: HMAC_SHA256(order_id|payment_id, key_secret),
 *  - webhook signature verification: HMAC_SHA256(rawBody, webhook_secret) — a
 *    DIFFERENT secret from the API key secret — compared in constant time,
 *  - payment state fetch for reconciliation.
 *
 * Secrets are passed in by the caller (decrypted momentarily from the DB) and
 * never logged. Every merchant uses THEIR OWN key pair, so funds settle to the
 * merchant, never to a platform account.
 *
 * NOTE: these make live network calls to api.razorpay.com. They are implemented
 * to spec but, without real merchant test credentials, have NOT been exercised
 * end-to-end in this environment.
 */

const API_BASE = "https://api.razorpay.com/v1";

function basicAuth(keyId: string, keySecret: string): string {
	return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

export interface GatewayResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
	status?: number;
}

/** Verify a key_id/key_secret pair actually works by calling the API. */
export async function verifyRazorpayCredentials(
	keyId: string,
	keySecret: string,
): Promise<GatewayResult<true>> {
	try {
		const res = await fetch(`${API_BASE}/orders?count=1`, {
			headers: { Authorization: basicAuth(keyId, keySecret) },
		});
		if (res.status === 200) return { ok: true, data: true, status: 200 };
		if (res.status === 401)
			return {
				ok: false,
				error: "Razorpay rejected these credentials (unauthorized).",
				status: 401,
			};
		return {
			ok: false,
			error: `Razorpay returned an unexpected status (${res.status}).`,
			status: res.status,
		};
	} catch {
		return {
			ok: false,
			error: "Could not reach Razorpay to verify the credentials.",
		};
	}
}

export interface RazorpayOrder {
	id: string;
	amount: number;
	currency: string;
	status: string;
}

/** Create a Razorpay order for a server-calculated amount (paise). */
export async function createRazorpayOrder(
	keyId: string,
	keySecret: string,
	params: {
		amountPaise: number;
		receipt: string;
		notes?: Record<string, string>;
	},
): Promise<GatewayResult<RazorpayOrder>> {
	try {
		const res = await fetch(`${API_BASE}/orders`, {
			method: "POST",
			headers: {
				Authorization: basicAuth(keyId, keySecret),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				amount: params.amountPaise, // integer paise
				currency: "INR",
				receipt: params.receipt,
				payment_capture: 1,
				notes: params.notes ?? {},
			}),
		});
		const body = (await res.json()) as RazorpayOrder & {
			error?: { description?: string };
		};
		if (!res.ok)
			return {
				ok: false,
				error:
					body?.error?.description ?? "Could not create the payment order.",
				status: res.status,
			};
		return { ok: true, data: body, status: res.status };
	} catch {
		return {
			ok: false,
			error: "Could not reach Razorpay to create the order.",
		};
	}
}

/** Verify the Razorpay Checkout callback signature. */
export async function verifyCheckoutSignature(
	keySecret: string,
	razorpayOrderId: string,
	razorpayPaymentId: string,
	signature: string,
): Promise<boolean> {
	const expected = await hmacSha256Hex(
		keySecret,
		`${razorpayOrderId}|${razorpayPaymentId}`,
	);
	return timingSafeEqualHex(expected, signature);
}

/** Verify a webhook HMAC against the ORIGINAL raw request body. */
export async function verifyWebhookSignature(
	webhookSecret: string,
	rawBody: string,
	signature: string,
): Promise<boolean> {
	const expected = await hmacSha256Hex(webhookSecret, rawBody);
	return timingSafeEqualHex(expected, signature);
}

export interface RazorpayPayment {
	id: string;
	status: string; // created|authorized|captured|refunded|failed
	order_id: string;
	amount: number;
}

/** Fetch a payment to reconcile its true captured state. */
export async function fetchRazorpayPayment(
	keyId: string,
	keySecret: string,
	paymentId: string,
): Promise<GatewayResult<RazorpayPayment>> {
	try {
		const res = await fetch(
			`${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
			{
				headers: { Authorization: basicAuth(keyId, keySecret) },
			},
		);
		const body = (await res.json()) as RazorpayPayment & {
			error?: { description?: string };
		};
		if (!res.ok)
			return {
				ok: false,
				error: body?.error?.description ?? "Could not fetch payment.",
				status: res.status,
			};
		return { ok: true, data: body, status: res.status };
	} catch {
		return { ok: false, error: "Could not reach Razorpay." };
	}
}
