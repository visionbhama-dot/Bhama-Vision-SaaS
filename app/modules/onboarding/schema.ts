import { z } from "zod";

/** Reserved slugs mirrored from db `reserved_slugs` for fast client feedback. */
export const RESERVED_SLUGS = [
	"www",
	"admin",
	"api",
	"app",
	"support",
	"help",
	"mail",
	"status",
	"dashboard",
	"superadmin",
	"bhama",
	"bhamavision",
	"static",
	"cdn",
	"assets",
];

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export const slugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3, "At least 3 characters")
	.max(63, "At most 63 characters")
	.regex(SLUG_RE, "Use lowercase letters, numbers and hyphens only")
	.refine((s) => !RESERVED_SLUGS.includes(s), "This name is reserved");

const strongPassword = z
	.string()
	.min(8, "Use at least 8 characters")
	.max(72, "Password is too long")
	.regex(/[A-Za-z]/, "Include a letter")
	.regex(/[0-9]/, "Include a number");

export const signupSchema = z
	.object({
		fullName: z.string().trim().min(2, "Enter your name").max(120),
		email: z.string().trim().email("Enter a valid email").max(160),
		phone: z
			.string()
			.trim()
			.max(20)
			.regex(/^[0-9+\-\s()]*$/, "Enter a valid phone number")
			.optional()
			.or(z.literal("")),
		password: strongPassword,
		confirmPassword: z.string(),
		acceptTerms: z
			.boolean()
			.refine((v) => v === true, "Please accept the terms to continue"),
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
	email: z.string().trim().email("Enter a valid email"),
	password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({
	email: z.string().trim().email("Enter a valid email"),
});

export const resetSchema = z
	.object({
		password: strongPassword,
		confirmPassword: z.string(),
	})
	.refine((d) => d.password === d.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export const BUSINESS_TYPES = [
	"kirana_store",
	"supermarket",
	"grocery_wholesaler",
	"small_town_entrepreneur",
	"multi_store_chain",
	"local_marketplace",
	"other",
] as const;

export const businessSchema = z.object({
	businessName: z.string().trim().min(2, "Enter your business name").max(160),
	kind: z.enum(["single_store", "marketplace"]).default("single_store"),
	businessType: z.enum(BUSINESS_TYPES),
	legalName: z.string().trim().max(160).optional().or(z.literal("")),
	addressLine1: z.string().trim().min(3, "Enter your address").max(200),
	addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
	city: z.string().trim().min(2, "Enter your city").max(120),
	state: z.string().trim().min(2, "Enter your state").max(120),
	pincode: z
		.string()
		.trim()
		.regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
	contactPhone: z
		.string()
		.trim()
		.regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid phone number"),
	contactEmail: z
		.string()
		.trim()
		.email("Enter a valid email")
		.max(160)
		.optional()
		.or(z.literal("")),
	description: z.string().trim().max(2000).optional().or(z.literal("")),
	gstNumber: z.string().trim().max(20).optional().or(z.literal("")),
	fssaiLicense: z.string().trim().max(20).optional().or(z.literal("")),
});
export type BusinessInput = z.infer<typeof businessSchema>;

export const storeIdentitySchema = z.object({ slug: slugSchema });

export const planSchema = z.object({
	planSlug: z.enum(["starter", "growth", "marketplace"]),
	cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

export const setupSchema = z.object({
	minOrderRupees: z.coerce.number().int().min(0).max(100000).default(0),
	brandColor: z
		.string()
		.trim()
		.regex(/^#?[0-9a-fA-F]{6}$/, "Enter a hex colour like #039855")
		.optional()
		.or(z.literal("")),
	codEnabled: z.coerce.boolean().default(true),
	zoneName: z.string().trim().max(120).optional().or(z.literal("")),
	zonePincodes: z.string().trim().max(2000).optional().or(z.literal("")),
	zoneFeeRupees: z.coerce.number().int().min(0).max(100000).optional(),
	logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});
export type SetupInput = z.infer<typeof setupSchema>;

export const ONBOARDING_STEPS = [
	"business",
	"store",
	"plan",
	"setup",
	"review",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABELS: Record<OnboardingStep, string> = {
	business: "Business info",
	store: "Store identity",
	plan: "Choose plan",
	setup: "Store setup",
	review: "Review & submit",
};
