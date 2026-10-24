import { z } from "zod";

export const BUSINESS_TYPES = [
	"kirana_store",
	"supermarket",
	"grocery_wholesaler",
	"small_town_entrepreneur",
	"multi_store_chain",
	"local_marketplace",
	"other",
] as const;

export const BUSINESS_TYPE_LABELS: Record<
	(typeof BUSINESS_TYPES)[number],
	string
> = {
	kirana_store: "Kirana store",
	supermarket: "Supermarket",
	grocery_wholesaler: "Grocery wholesaler (retail delivery)",
	small_town_entrepreneur: "Small-town entrepreneur",
	multi_store_chain: "Multi-store grocery chain",
	local_marketplace: "Local multi-vendor marketplace",
	other: "Other",
};

export const PREFERRED_PLANS = [
	"starter",
	"growth",
	"marketplace",
	"enterprise",
	"undecided",
] as const;

/**
 * Lead capture schema shared by the client form and the server action.
 *
 * Contact rule: a lead must provide at least a mobile number OR an email so we
 * can follow up. Email is optional when a phone number is given, matching the
 * landing-page copy.
 */
export const leadSchema = z
	.object({
		name: z.string().trim().min(2, "Please enter your name").max(120),
		businessName: z
			.string()
			.trim()
			.min(2, "Please enter your business name")
			.max(160),
		phone: z
			.string()
			.trim()
			.max(20)
			.regex(/^[0-9+\-\s()]*$/, "Enter a valid phone number")
			.optional()
			.or(z.literal("")),
		email: z
			.string()
			.trim()
			.email("Enter a valid email")
			.max(160)
			.optional()
			.or(z.literal("")),
		city: z.string().trim().min(2, "Please enter your city").max(120),
		businessType: z.enum(BUSINESS_TYPES),
		productCount: z
			.union([z.coerce.number().int().min(0).max(1_000_000), z.literal("")])
			.optional(),
		preferredPlan: z.enum(PREFERRED_PLANS).default("undecided"),
		message: z.string().trim().max(2000).optional().or(z.literal("")),
		// Anti-spam honeypot — must stay empty.
		company_website: z.string().max(0).optional().or(z.literal("")),
		consent: z
			.boolean()
			.refine((v) => v === true, "Please accept to be contacted"),
	})
	.refine((data) => Boolean(data.phone?.trim() || data.email?.trim()), {
		message: "Provide a mobile number or an email so we can reach you",
		path: ["phone"],
	});

export type LeadInput = z.infer<typeof leadSchema>;

/** Campaign attribution captured from UTM params (stored with consent). */
export const utmSchema = z.object({
	utm_source: z.string().max(200).optional(),
	utm_medium: z.string().max(200).optional(),
	utm_campaign: z.string().max(200).optional(),
	utm_term: z.string().max(200).optional(),
	utm_content: z.string().max(200).optional(),
	referrer: z.string().max(500).optional(),
});

export type UtmInput = z.infer<typeof utmSchema>;
