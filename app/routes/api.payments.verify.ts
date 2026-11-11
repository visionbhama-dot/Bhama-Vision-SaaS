import type { Route } from "./+types/api.payments.verify";
import { getAdminClient } from "~/lib/supabase.server";
import { confirmCheckout } from "~/modules/payments/online.server";

/**
 * Razorpay Checkout callback verification: /api/payments/verify (POST).
 *
 * The browser posts razorpay_order_id / razorpay_payment_id / razorpay_signature.
 * We resolve the tenant + our order SERVER-SIDE from the stored
 * provider_order_id (never trusting a client-supplied tenant/order), verify the
 * signature and the real captured state, then mark the order paid. The webhook
 * is the authoritative backstop; this gives the customer a fast confirmation.
 */
export async function action({ request, context }: Route.ActionArgs) {
	const form = await request.formData();
	const razorpayOrderId = String(form.get("razorpay_order_id") ?? "");
	const razorpayPaymentId = String(form.get("razorpay_payment_id") ?? "");
	const signature = String(form.get("razorpay_signature") ?? "");
	if (!razorpayOrderId || !razorpayPaymentId || !signature) {
		return Response.json(
			{ ok: false, error: "Missing payment parameters." },
			{ status: 400 },
		);
	}

	const admin = getAdminClient(context.cloudflare.env);
	if (!admin)
		return Response.json(
			{ ok: false, error: "Not configured." },
			{ status: 503 },
		);

	const { data: op } = await admin
		.from("order_payments")
		.select("order_id, tenant_id")
		.eq("provider_order_id", razorpayOrderId)
		.maybeSingle();
	if (!op?.order_id)
		return Response.json(
			{ ok: false, error: "Unknown payment order." },
			{ status: 404 },
		);

	const result = await confirmCheckout(
		context.cloudflare.env,
		op.tenant_id as string,
		{
			orderId: op.order_id as string,
			razorpayOrderId,
			razorpayPaymentId,
			signature,
		},
	);
	return Response.json(result, { status: result.ok ? 200 : 400 });
}
