import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";
import { ownedTenantId } from "~/modules/onboarding/service.server";
import {
	REVIEW_TARGET_HOURS,
	type DocumentInput,
	type ReviewDecision,
	type VerificationInput,
} from "./schema";

/**
 * Licensed Pharmacy verification.
 *
 * Merchant writes run through the service-role client AFTER route auth, and
 * re-verify tenant ownership. Review actions are platform-admin only (the route
 * enforces that). Two safety invariants live here:
 *   - Uploading documents or submitting a licence NEVER auto-approves. Only a
 *     platform admin can set status 'verified'.
 *   - Verifying a licence does NOT enable medicine ordering. Enabling medicine
 *     ordering is a separate, explicit admin action gated on a prior 'verified'
 *     status, and is meant to follow the applicable online-pharmacy legal review.
 *     Platform verification is not government approval.
 */

export type Result<T = object> =
	({ ok: true } & T) | { ok: false; error: string; code?: string };

const NOT_CONFIGURED: { ok: false; error: string; code: string } = {
	ok: false,
	code: "not_configured",
	error: "The database is not connected yet. Configure Supabase to continue.",
};

async function logAudit(
	admin: SupabaseClient,
	actorId: string,
	tenantId: string,
	action: string,
	detail: Record<string, unknown> = {},
) {
	await admin.from("audit_logs").insert({
		actor_id: actorId,
		tenant_id: tenantId,
		action,
		target_type: "pharmacy_verification",
		target_id: tenantId,
		detail,
	});
}

export interface PharmacyDocument {
	id: string;
	docType: string;
	fileName: string | null;
	externalRef: string | null;
	storagePath: string | null;
	createdAt: string;
}

export interface PharmacyContext {
	category: string;
	medicineOrderingEnabled: boolean;
	verification: {
		status: string;
		licenseNumber: string | null;
		licenseAuthority: string | null;
		licenseExpiry: string | null;
		pharmacistName: string | null;
		pharmacistRegNumber: string | null;
		contactPhone: string | null;
		notes: string | null;
		reviewNotes: string | null;
		reviewedAt: string | null;
		reviewDueAt: string | null;
		submittedAt: string | null;
	} | null;
	documents: PharmacyDocument[];
}

export async function getPharmacyContext(
	env: unknown,
	tenantId: string,
): Promise<PharmacyContext | null> {
	const admin = getAdminClient(env);
	if (!admin) return null;

	const [{ data: store }, { data: v }, { data: docs }] = await Promise.all([
		admin
			.from("stores")
			.select("category, medicine_ordering_enabled")
			.eq("tenant_id", tenantId)
			.maybeSingle(),
		admin
			.from("pharmacy_verifications")
			.select(
				"status, license_number, license_authority, license_expiry, pharmacist_name, pharmacist_reg_number, contact_phone, notes, review_notes, reviewed_at, review_due_at, submitted_at",
			)
			.eq("tenant_id", tenantId)
			.maybeSingle(),
		admin
			.from("pharmacy_documents")
			.select("id, doc_type, file_name, external_ref, storage_path, created_at")
			.eq("tenant_id", tenantId)
			.order("created_at", { ascending: true }),
	]);

	if (!store) return null;

	return {
		category: (store.category as string) ?? "general",
		medicineOrderingEnabled: Boolean(store.medicine_ordering_enabled),
		verification: v
			? {
					status: v.status as string,
					licenseNumber: v.license_number ?? null,
					licenseAuthority: v.license_authority ?? null,
					licenseExpiry: v.license_expiry ?? null,
					pharmacistName: v.pharmacist_name ?? null,
					pharmacistRegNumber: v.pharmacist_reg_number ?? null,
					contactPhone: v.contact_phone ?? null,
					notes: v.notes ?? null,
					reviewNotes: v.review_notes ?? null,
					reviewedAt: v.reviewed_at ?? null,
					reviewDueAt: v.review_due_at ?? null,
					submittedAt: v.submitted_at ?? null,
				}
			: null,
		documents: (docs ?? []).map((d) => ({
			id: d.id as string,
			docType: d.doc_type as string,
			fileName: (d.file_name as string | null) ?? null,
			externalRef: (d.external_ref as string | null) ?? null,
			storagePath: (d.storage_path as string | null) ?? null,
			createdAt: d.created_at as string,
		})),
	};
}

/**
 * Declare the store a Licensed Pharmacy and submit/resubmit licence details for
 * review. Sets store.category = 'pharmacy', records the licence fields, and
 * moves the verification to 'pending' with a review-due target. Never enables
 * medicine ordering and never sets 'verified'.
 */
export async function submitVerification(
	env: unknown,
	userId: string,
	input: VerificationInput,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(admin, userId);
	if (!tenantId)
		return {
			ok: false,
			error: "Only the store owner can submit verification.",
		};

	// Mark the store as a pharmacy (medicine ordering stays OFF regardless).
	await admin
		.from("stores")
		.update({ category: "pharmacy" })
		.eq("tenant_id", tenantId);

	const now = new Date();
	const due = new Date(now.getTime() + REVIEW_TARGET_HOURS * 60 * 60 * 1000);

	const { error } = await admin.from("pharmacy_verifications").upsert(
		{
			tenant_id: tenantId,
			status: "pending",
			license_number: input.licenseNumber,
			license_authority: input.licenseAuthority,
			license_expiry: input.licenseExpiry || null,
			pharmacist_name: input.pharmacistName,
			pharmacist_reg_number: input.pharmacistRegNumber || null,
			contact_phone: input.contactPhone || null,
			notes: input.notes || null,
			submitted_at: now.toISOString(),
			review_due_at: due.toISOString(),
			// Clear any prior review decision on resubmission.
			review_notes: null,
			reviewer_id: null,
			reviewed_at: null,
		},
		{ onConflict: "tenant_id" },
	);
	if (error)
		return {
			ok: false,
			error: "Could not submit verification.",
			code: error.message,
		};

	await logAudit(admin, userId, tenantId, "merchant.pharmacy.submit", {
		license_authority: input.licenseAuthority,
	});

	await admin
		.from("notification_outbox")
		.insert({
			tenant_id: tenantId,
			channel: "internal",
			topic: "pharmacy.submitted",
			payload: { license_authority: input.licenseAuthority },
			status: "pending",
		})
		.then(
			() => undefined,
			() => undefined,
		);

	return { ok: true };
}

/** Record a supporting document reference for the tenant's verification. */
export async function addDocument(
	env: unknown,
	userId: string,
	input: DocumentInput,
	storagePath: string | null = null,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;
	const tenantId = await ownedTenantId(admin, userId);
	if (!tenantId)
		return { ok: false, error: "Only the store owner can add documents." };

	if (!storagePath && !input.externalRef && !input.fileName) {
		return {
			ok: false,
			error: "Provide a document reference, file name, or upload.",
		};
	}

	const { error } = await admin.from("pharmacy_documents").insert({
		tenant_id: tenantId,
		doc_type: input.docType,
		file_name: input.fileName || null,
		external_ref: input.externalRef || null,
		storage_path: storagePath,
		uploaded_by: userId,
	});
	if (error) return { ok: false, error: "Could not record the document." };

	await logAudit(admin, userId, tenantId, "merchant.pharmacy.document_added", {
		doc_type: input.docType,
	});
	return { ok: true };
}

// --- Platform admin review ---------------------------------------------------

export interface PharmacyReviewRow {
	tenantId: string;
	tenantName: string;
	storeName: string | null;
	slug: string | null;
	status: string;
	licenseNumber: string | null;
	licenseAuthority: string | null;
	licenseExpiry: string | null;
	pharmacistName: string | null;
	submittedAt: string | null;
	reviewDueAt: string | null;
	medicineOrderingEnabled: boolean;
	documentCount: number;
}

export async function listPharmacyVerifications(
	env: unknown,
): Promise<PharmacyReviewRow[]> {
	const admin = getAdminClient(env);
	if (!admin) return [];
	const { data } = await admin
		.from("pharmacy_verifications")
		.select(
			`tenant_id, status, license_number, license_authority, license_expiry,
			 pharmacist_name, submitted_at, review_due_at,
			 tenants(name, stores(display_name, slug, medicine_ordering_enabled)),
			 pharmacy_documents:pharmacy_documents(count)`,
		)
		.order("submitted_at", { ascending: true, nullsFirst: false });

	return (data ?? []).map((r): PharmacyReviewRow => {
		const tenant = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
		const store = tenant
			? Array.isArray(tenant.stores)
				? tenant.stores[0]
				: tenant.stores
			: null;
		const docCountRel = r.pharmacy_documents as
			{ count: number }[] | { count: number } | null;
		const documentCount = Array.isArray(docCountRel)
			? (docCountRel[0]?.count ?? 0)
			: (docCountRel?.count ?? 0);
		return {
			tenantId: r.tenant_id as string,
			tenantName: (tenant?.name as string) ?? "—",
			storeName: (store?.display_name as string) ?? null,
			slug: (store?.slug as string) ?? null,
			status: r.status as string,
			licenseNumber: r.license_number ?? null,
			licenseAuthority: r.license_authority ?? null,
			licenseExpiry: r.license_expiry ?? null,
			pharmacistName: r.pharmacist_name ?? null,
			submittedAt: r.submitted_at ?? null,
			reviewDueAt: r.review_due_at ?? null,
			medicineOrderingEnabled: Boolean(store?.medicine_ordering_enabled),
			documentCount,
		};
	});
}

const DECISION_STATUS: Record<ReviewDecision, string> = {
	start_review: "under_review",
	verify: "verified",
	reject: "rejected",
	needs_correction: "needs_correction",
};

export async function reviewPharmacy(
	env: unknown,
	actorId: string,
	tenantId: string,
	decision: ReviewDecision,
	notes: string,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;

	const status = DECISION_STATUS[decision];
	if (!status) return { ok: false, error: "Unknown review decision." };

	const patch: Record<string, unknown> = {
		status,
		review_notes: notes || null,
		reviewer_id: actorId,
	};
	// A terminal decision records the review timestamp.
	if (decision !== "start_review") patch.reviewed_at = new Date().toISOString();

	const { error } = await admin
		.from("pharmacy_verifications")
		.update(patch)
		.eq("tenant_id", tenantId);
	if (error) return { ok: false, error: "Could not record the review." };

	await logAudit(admin, actorId, tenantId, "pharmacy.review", {
		decision,
		status,
		note: "Platform verification only. Not government approval. Medicine ordering remains disabled unless separately enabled after legal review.",
	});
	return { ok: true };
}

/**
 * Explicitly enable/disable medicine ordering. Enabling is only permitted for a
 * 'verified' pharmacy and is deliberately separate from verification — it is the
 * gate that must follow the applicable online-pharmacy legal review. Audited.
 */
export async function setMedicineOrdering(
	env: unknown,
	actorId: string,
	tenantId: string,
	enabled: boolean,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return NOT_CONFIGURED;

	if (enabled) {
		const { data: v } = await admin
			.from("pharmacy_verifications")
			.select("status")
			.eq("tenant_id", tenantId)
			.maybeSingle();
		if (v?.status !== "verified") {
			return {
				ok: false,
				error:
					"Medicine ordering can only be enabled for a verified pharmacy, and only after the applicable legal review.",
			};
		}
	}

	const { error } = await admin
		.from("stores")
		.update({ medicine_ordering_enabled: enabled })
		.eq("tenant_id", tenantId);
	if (error) return { ok: false, error: "Could not update medicine ordering." };

	await logAudit(
		admin,
		actorId,
		tenantId,
		"pharmacy.medicine_ordering.toggle",
		{
			enabled,
			note: "Explicit administrative action following legal review. Not government approval.",
		},
	);
	return { ok: true };
}
