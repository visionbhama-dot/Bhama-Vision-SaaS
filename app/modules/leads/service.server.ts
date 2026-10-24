import { getAdminClient } from "~/lib/supabase.server";
import type { LeadInput, UtmInput } from "./schema";

export type LeadResult =
	| { ok: true; reference: string }
	| { ok: false; reason: "not_configured" | "error"; message: string };

/**
 * Generate a human-friendly, non-sequential reference number for a lead, e.g.
 * BV-250124-7F3K. Used on the success screen and for support follow-up.
 */
export function generateReference(now = new Date()): string {
	const y = String(now.getUTCFullYear()).slice(-2);
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
	let suffix = "";
	for (let i = 0; i < 4; i++) {
		suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return `BV-${y}${m}${d}-${suffix}`;
}

/**
 * Persist a lead to Supabase. Returns an explicit, honest result:
 *  - `not_configured` when Supabase credentials are absent (so the UI can tell
 *    the operator the integration is not yet connected rather than faking a
 *    success);
 *  - `error` on a genuine DB failure;
 *  - `ok` with the stored reference number otherwise.
 *
 * A matching `notification_outbox` row is created best-effort so the superadmin
 * lead inbox / notification center can surface the new lead. Email/SMS/WhatsApp
 * delivery is handled separately by outbox workers only when those providers are
 * configured — we never pretend a message was sent here.
 */
export async function createLead(
	env: unknown,
	input: LeadInput,
	utm: UtmInput,
): Promise<LeadResult> {
	const admin = getAdminClient(env);
	if (!admin) {
		return {
			ok: false,
			reason: "not_configured",
			message:
				"Lead storage is not connected yet. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
		};
	}

	const reference = generateReference();
	const productCount =
		typeof input.productCount === "number" ? input.productCount : null;

	const { error } = await admin.from("leads").insert({
		reference,
		name: input.name,
		business_name: input.businessName,
		phone: input.phone?.trim() || null,
		email: input.email?.trim() || null,
		city: input.city,
		business_type: input.businessType,
		product_count: productCount,
		preferred_plan: input.preferredPlan,
		message: input.message?.trim() || null,
		status: "new",
		utm_source: utm.utm_source ?? null,
		utm_medium: utm.utm_medium ?? null,
		utm_campaign: utm.utm_campaign ?? null,
		utm_term: utm.utm_term ?? null,
		utm_content: utm.utm_content ?? null,
		referrer: utm.referrer ?? null,
	});

	if (error) {
		console.error("Failed to insert lead", error.message);
		return {
			ok: false,
			reason: "error",
			message: "We could not save your details. Please try again shortly.",
		};
	}

	// Best-effort internal notification for the superadmin lead inbox.
	await admin
		.from("notification_outbox")
		.insert({
			channel: "internal",
			topic: "lead.created",
			payload: {
				reference,
				business_name: input.businessName,
				city: input.city,
			},
			status: "pending",
		})
		.then(
			() => undefined,
			(e) => console.error("notification_outbox insert failed", e),
		);

	return { ok: true, reference };
}
