import { z } from "zod";

export const PHARMACY_DOC_TYPES = [
	"drug_license",
	"premises_proof",
	"pharmacist_cert",
	"other",
] as const;

export const PHARMACY_DOC_LABELS: Record<
	(typeof PHARMACY_DOC_TYPES)[number],
	string
> = {
	drug_license: "Drug licence",
	premises_proof: "Premises proof",
	pharmacist_cert: "Pharmacist certificate",
	other: "Other supporting document",
};

export const verificationSchema = z.object({
	licenseNumber: z.string().trim().min(3, "Enter the licence number").max(100),
	licenseAuthority: z
		.string()
		.trim()
		.min(2, "Enter the issuing authority")
		.max(160),
	licenseExpiry: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD)")
		.optional()
		.or(z.literal("")),
	pharmacistName: z
		.string()
		.trim()
		.min(2, "Enter the pharmacist name")
		.max(160),
	pharmacistRegNumber: z.string().trim().max(100).optional().or(z.literal("")),
	contactPhone: z
		.string()
		.trim()
		.regex(/^[0-9+\-\s()]{6,20}$/, "Enter a valid phone number")
		.optional()
		.or(z.literal("")),
	notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type VerificationInput = z.infer<typeof verificationSchema>;

export const documentSchema = z.object({
	docType: z.enum(PHARMACY_DOC_TYPES),
	fileName: z.string().trim().max(200).optional().or(z.literal("")),
	externalRef: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const PHARMACY_STATUS_LABELS: Record<string, string> = {
	pending: "Pending review",
	under_review: "Under review",
	verified: "Verified",
	rejected: "Rejected",
	needs_correction: "Needs correction",
};

/** Admin review decisions. */
export const REVIEW_DECISIONS = [
	"start_review",
	"verify",
	"reject",
	"needs_correction",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** Target internal review turnaround. Informational SLA, not a guarantee. */
export const REVIEW_TARGET_HOURS = 24;
