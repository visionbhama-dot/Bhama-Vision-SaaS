import { getAdminClient } from "~/lib/supabase.server";
import { getVerifiedConnection } from "./service.server";
import {
	createRazorpayOrder,
	fetchRazorpayPayment,
	verifyCheckoutSignature,
	verifyWebhookSignature,
} from "./gateway.server";

/**
 * Online payment flow (Razorpay). Every operation uses the specific merchant's
 * own verified, decrypted credentials and is scoped to their tenant, so one
 * tenant's payment traffic can never affect another. An order is marked paid
 * ONLY after a server-verified signature + a confirmed captured payment (via
 * the browser callback) or a signature-verified webhook — never because the
 * customer merely returned to a success URL.
 *
 * NOT exercised against Razorpay in this environment (no merchant credentials).
 */

export interface OnlineOrderInit {
	ok: boolean;
	error?: string;
	keyId?: string;
	razorpayOrderId?: string;
	amountPaise?: number;
}

/** Create the provider order for one of our orders and store its id. */
export async function createOnlinePayment(
	env: unknown,
	tenantId: string,
	orderId: string,
): Promise<OnlineOrderInit> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };
	const conn = await getVerifiedConnection(env, tenantId);
	if (!conn)
		return {
			ok: false,
			error: "Online payment is not available for this store.",
		};

	const { data: order } = await admin
		.from("orders")
		.select("id, number, total_paise, payment_state")
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.maybeSingle();
	if (!order) return { ok: false, error: "Order not found." };
	if (order.payment_state === "paid")
		return { ok: false, error: "This order is already paid." };

	const rp = await createRazorpayOrder(conn.keyId, conn.keySecret, {
		amountPaise: Number(order.total_paise), // server-calculated
		receipt: order.number as string,
		notes: { tenant_id: tenantId, order_id: orderId },
	});
	if (!rp.ok || !rp.data)
		return { ok: false, error: rp.error ?? "Could not start the payment." };

	await admin
		.from("order_payments")
		.update({ provider_order_id: rp.data.id })
		.eq("tenant_id", tenantId)
		.eq("order_id", orderId);
	return {
		ok: true,
		keyId: conn.keyId,
		razorpayOrderId: rp.data.id,
		amountPaise: Number(order.total_paise),
	};
}

async function markPaid(
	env: unknown,
	tenantId: string,
	orderId: string,
	providerPaymentId: string,
	raw: unknown,
): Promise<void> {
	const admin = getAdminClient(env);
	if (!admin) return;
	// Idempotent: only transition a not-yet-paid order.
	const { data: updated } = await admin
		.from("orders")
		.update({ payment_state: "paid", paid_at: new Date().toISOString() })
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.neq("payment_state", "paid")
		.select("id")
		.maybeSingle();
	if (!updated) return; // already paid — do nothing (once-only)
	await admin
		.from("order_payments")
		.update({
			state: "paid",
			provider_payment_id: providerPaymentId,
			raw: raw as object,
		})
		.eq("tenant_id", tenantId)
		.eq("order_id", orderId);
	await admin.from("order_status_events").insert({
		order_id: orderId,
		tenant_id: tenantId,
		status: "placed",
		note: "Online payment received",
	});
	await admin.from("audit_logs").insert({
		tenant_id: tenantId,
		action: "order.online_paid",
		target_type: "order",
		target_id: orderId,
	});
}

export interface ConfirmInput {
	orderId: string;
	razorpayOrderId: string;
	razorpayPaymentId: string;
	signature: string;
}

/** Verify a Checkout callback and mark the order paid if genuinely captured. */
export async function confirmCheckout(
	env: unknown,
	tenantId: string,
	input: ConfirmInput,
): Promise<{ ok: boolean; error?: string }> {
	const conn = await getVerifiedConnection(env, tenantId);
	if (!conn) return { ok: false, error: "Online payment is not available." };

	const validSig = await verifyCheckoutSignature(
		conn.keySecret,
		input.razorpayOrderId,
		input.razorpayPaymentId,
		input.signature,
	);
	if (!validSig)
		return { ok: false, error: "Payment signature verification failed." };

	// Confirm the real captured state + that it belongs to our order/amount.
	const payment = await fetchRazorpayPayment(
		conn.keyId,
		conn.keySecret,
		input.razorpayPaymentId,
	);
	if (!payment.ok || !payment.data)
		return {
			ok: false,
			error: payment.error ?? "Could not verify the payment.",
		};
	if (payment.data.order_id !== input.razorpayOrderId)
		return { ok: false, error: "Payment does not match the order." };
	if (
		payment.data.status !== "captured" &&
		payment.data.status !== "authorized"
	) {
		return { ok: false, error: "Payment was not completed." };
	}

	await markPaid(
		env,
		tenantId,
		input.orderId,
		input.razorpayPaymentId,
		payment.data,
	);
	return { ok: true };
}

/**
 * Process a Razorpay webhook for a specific tenant. Verifies the HMAC against
 * the ORIGINAL raw body using that tenant's webhook secret, deduplicates by
 * event id (atomic unique insert), and marks the matching order paid on a
 * captured payment. Returns an HTTP status for the handler.
 */
export async function processWebhook(
	env: unknown,
	tenantId: string,
	rawBody: string,
	signature: string | null,
	eventId: string | null,
): Promise<{ status: number; body: string }> {
	const admin = getAdminClient(env);
	if (!admin) return { status: 503, body: "not_configured" };
	if (!signature) return { status: 400, body: "missing_signature" };

	const conn = await getVerifiedConnection(env, tenantId);
	if (!conn || !conn.webhookSecret)
		return { status: 400, body: "no_webhook_secret" };

	const valid = await verifyWebhookSignature(
		conn.webhookSecret,
		rawBody,
		signature,
	);
	if (!valid) return { status: 401, body: "invalid_signature" };

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return { status: 400, body: "bad_json" };
	}

	// Dedup: atomic unique insert on (provider, event_id). A duplicate delivery
	// hits the unique constraint and is ignored.
	const dedupeId = eventId ?? (payload.id as string) ?? crypto.randomUUID();
	const { error: insErr } = await admin.from("payment_webhook_events").insert({
		provider: "razorpay",
		event_id: dedupeId,
		tenant_id: tenantId,
		status: "received",
		raw: payload as object,
	});
	if (insErr) {
		// Unique violation => already seen. Acknowledge so Razorpay stops retrying.
		return { status: 200, body: "duplicate_ignored" };
	}

	const event = payload.event as string | undefined;
	if (event === "payment.captured" || event === "order.paid") {
		const entity = (
			(payload.payload as Record<string, unknown> | undefined)?.payment as
				Record<string, unknown> | undefined
		)?.entity as { id?: string; order_id?: string } | undefined;
		const rpOrderId = entity?.order_id;
		const rpPaymentId = entity?.id;
		if (rpOrderId) {
			const { data: op } = await admin
				.from("order_payments")
				.select("order_id")
				.eq("tenant_id", tenantId)
				.eq("provider_order_id", rpOrderId)
				.maybeSingle();
			if (op?.order_id) {
				await markPaid(
					env,
					tenantId,
					op.order_id as string,
					rpPaymentId ?? "",
					entity,
				);
			}
		}
	}

	await admin
		.from("payment_webhook_events")
		.update({ status: "processed", processed_at: new Date().toISOString() })
		.eq("provider", "razorpay")
		.eq("event_id", dedupeId);
	return { status: 200, body: "ok" };
}
