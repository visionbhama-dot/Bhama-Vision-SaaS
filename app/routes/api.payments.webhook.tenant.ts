import type { Route } from "./+types/api.payments.webhook.tenant";
import { processWebhook } from "~/modules/payments/online.server";

/**
 * Razorpay webhook endpoint, scoped per tenant: /api/payments/webhook/:tenant.
 * Reads the ORIGINAL raw body (required for HMAC), verifies the signature with
 * THIS tenant's webhook secret, deduplicates by event id and marks the matching
 * order paid. A tenant path + per-tenant secret means one merchant's webhook can
 * never affect another's orders.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const tenantId = params.tenant ?? "";
	if (!tenantId) return new Response("missing_tenant", { status: 400 });

	// Raw body is required: the HMAC is computed over the exact bytes sent.
	const rawBody = await request.text();
	const signature = request.headers.get("x-razorpay-signature");
	const eventId = request.headers.get("x-razorpay-event-id");

	const result = await processWebhook(
		context.cloudflare.env,
		tenantId,
		rawBody,
		signature,
		eventId,
	);
	return new Response(result.body, { status: result.status });
}

// A GET is not a valid webhook delivery.
export function loader() {
	return new Response("method_not_allowed", { status: 405 });
}
