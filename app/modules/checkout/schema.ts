import { z } from "zod";

/** A single cart line as submitted by the browser (quantities only; never prices). */
export const cartItemSchema = z.object({
	productId: z.string().uuid(),
	variantId: z.string().uuid().nullable().optional(),
	quantity: z.coerce.number().int().min(1).max(99),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const checkoutSchema = z.object({
	fullName: z.string().trim().min(2, "Enter your name").max(120),
	phone: z
		.string()
		.trim()
		.regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
	addressLine1: z
		.string()
		.trim()
		.min(5, "Enter your delivery address")
		.max(300),
	landmark: z.string().trim().max(160).optional().or(z.literal("")),
	city: z.string().trim().max(120).optional().or(z.literal("")),
	pincode: z
		.string()
		.trim()
		.regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
	instructions: z.string().trim().max(500).optional().or(z.literal("")),
	paymentMethod: z.enum(["cod", "online"]).default("cod"),
	// Idempotency token minted by the browser per checkout attempt.
	idempotencyKey: z.string().trim().min(8).max(64),
	// Anti-spam honeypot — must stay empty.
	company_website: z.string().max(0).optional().or(z.literal("")),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
