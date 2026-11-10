import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft, FileText, Loader2, Pill, ShieldAlert } from "lucide-react";
import type { Route } from "./+types/dashboard.pharmacy";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
	Input,
	Label,
	Select,
	Textarea,
	FieldError,
} from "~/components/ui/field";
import {
	documentSchema,
	PHARMACY_DOC_LABELS,
	PHARMACY_DOC_TYPES,
	PHARMACY_STATUS_LABELS,
	REVIEW_TARGET_HOURS,
	verificationSchema,
} from "~/modules/pharmacy/schema";
import {
	addDocument,
	getPharmacyContext,
	submitVerification,
} from "~/modules/pharmacy/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Pharmacy verification — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Licensed pharmacy verification.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) {
		throw redirect("/onboarding/business", { headers: auth.headers });
	}
	const pharmacy = await getPharmacyContext(
		context.cloudflare.env,
		ctx.tenant.id,
	);
	return {
		brand,
		pharmacy,
		isOwner: ctx.membership?.role === "owner",
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireUser(request, context.cloudflare.env);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	if (intent === "add_document") {
		const parsed = parseForm(documentSchema, form);
		if (!parsed.success) return { error: "Please choose a document type." };
		const r = await addDocument(context.cloudflare.env, user.id, parsed.data);
		return r.ok ? { ok: "Document reference added." } : { error: r.error };
	}

	// Submit / resubmit licence details.
	const parsed = parseForm(verificationSchema, form);
	if (!parsed.success) {
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };
	}
	const r = await submitVerification(
		context.cloudflare.env,
		user.id,
		parsed.data,
	);
	return r.ok
		? { ok: "Submitted for review. We aim to review within 24 hours." }
		: { error: r.error };
}

export default function DashboardPharmacy({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, pharmacy, isOwner } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const v = pharmacy?.verification;
	const fieldErrors = (actionData as { fieldErrors?: Record<string, string> })
		?.fieldErrors;
	const values =
		(actionData as { values?: Record<string, string> })?.values ?? {};

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link
						to="/dashboard"
						className="text-sm text-ink-500 hover:text-ink-900"
					>
						<span className="inline-flex items-center gap-1.5">
							<ArrowLeft className="size-4" /> Dashboard
						</span>
					</Link>
				</div>
			</header>

			<main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
				<div className="flex items-center gap-3">
					<span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
						<Pill className="size-5" />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-ink-900">
							Licensed Pharmacy verification
						</h1>
						<p className="text-sm text-ink-500">
							Register as a licensed pharmacy and submit your documents for
							review.
						</p>
					</div>
					{v && (
						<Badge variant="blue" className="ml-auto">
							{PHARMACY_STATUS_LABELS[v.status] ?? v.status}
						</Badge>
					)}
				</div>

				{/* Mandatory safety notice */}
				<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
					<p className="flex items-center gap-2 font-semibold">
						<ShieldAlert className="size-4" /> Medicine ordering is disabled
					</p>
					<p className="mt-1">
						Medicine ordering and checkout stay switched off until the
						applicable online-pharmacy legal review is completed and explicitly
						approved. Platform verification confirms your documents to us — it
						is <strong>not</strong> government approval.
					</p>
					<p className="mt-1">
						Current medicine ordering:{" "}
						<strong>
							{pharmacy?.medicineOrderingEnabled ? "Enabled" : "Disabled"}
						</strong>
						.
					</p>
				</div>

				{(actionData as { ok?: string })?.ok && (
					<p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
						{(actionData as { ok: string }).ok}
					</p>
				)}
				{(actionData as { error?: string })?.error && (
					<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{(actionData as { error: string }).error}
					</p>
				)}

				{v?.reviewNotes &&
					(v.status === "needs_correction" || v.status === "rejected") && (
						<div className="mt-4 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
							<p className="font-semibold">Reviewer notes</p>
							<p className="mt-1">{v.reviewNotes}</p>
						</div>
					)}

				{!isOwner && (
					<p className="mt-6 text-sm text-ink-400">
						Only the store owner can submit pharmacy verification.
					</p>
				)}

				{isOwner && (
					<>
						<section className="mt-8">
							<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
								Licence details
							</h2>
							<Card>
								<CardContent>
									<Form method="post" className="space-y-4">
										<input type="hidden" name="intent" value="submit" />
										<div className="grid gap-4 sm:grid-cols-2">
											<div>
												<Label htmlFor="licenseNumber">
													Drug licence number
												</Label>
												<Input
													id="licenseNumber"
													name="licenseNumber"
													defaultValue={
														values.licenseNumber ?? v?.licenseNumber ?? ""
													}
													aria-invalid={Boolean(fieldErrors?.licenseNumber)}
												/>
												<FieldError>{fieldErrors?.licenseNumber}</FieldError>
											</div>
											<div>
												<Label htmlFor="licenseAuthority">
													Issuing authority
												</Label>
												<Input
													id="licenseAuthority"
													name="licenseAuthority"
													defaultValue={
														values.licenseAuthority ?? v?.licenseAuthority ?? ""
													}
													aria-invalid={Boolean(fieldErrors?.licenseAuthority)}
												/>
												<FieldError>{fieldErrors?.licenseAuthority}</FieldError>
											</div>
											<div>
												<Label htmlFor="licenseExpiry">Licence expiry</Label>
												<Input
													id="licenseExpiry"
													name="licenseExpiry"
													type="date"
													defaultValue={
														values.licenseExpiry ?? v?.licenseExpiry ?? ""
													}
													aria-invalid={Boolean(fieldErrors?.licenseExpiry)}
												/>
												<FieldError>{fieldErrors?.licenseExpiry}</FieldError>
											</div>
											<div>
												<Label htmlFor="pharmacistName">
													Registered pharmacist
												</Label>
												<Input
													id="pharmacistName"
													name="pharmacistName"
													defaultValue={
														values.pharmacistName ?? v?.pharmacistName ?? ""
													}
													aria-invalid={Boolean(fieldErrors?.pharmacistName)}
												/>
												<FieldError>{fieldErrors?.pharmacistName}</FieldError>
											</div>
											<div>
												<Label htmlFor="pharmacistRegNumber">
													Pharmacist registration no.
												</Label>
												<Input
													id="pharmacistRegNumber"
													name="pharmacistRegNumber"
													defaultValue={
														values.pharmacistRegNumber ??
														v?.pharmacistRegNumber ??
														""
													}
												/>
											</div>
											<div>
												<Label htmlFor="contactPhone">Contact phone</Label>
												<Input
													id="contactPhone"
													name="contactPhone"
													defaultValue={
														values.contactPhone ?? v?.contactPhone ?? ""
													}
													aria-invalid={Boolean(fieldErrors?.contactPhone)}
												/>
												<FieldError>{fieldErrors?.contactPhone}</FieldError>
											</div>
										</div>
										<div>
											<Label htmlFor="notes">Notes (optional)</Label>
											<Textarea
												id="notes"
												name="notes"
												defaultValue={values.notes ?? v?.notes ?? ""}
											/>
										</div>
										<Button type="submit" disabled={busy}>
											{busy ? <Loader2 className="animate-spin" /> : <Pill />}{" "}
											Submit for review
										</Button>
										<p className="text-xs text-ink-400">
											Target review turnaround: {REVIEW_TARGET_HOURS} hours.
											Submitting never enables medicine ordering.
										</p>
									</Form>
								</CardContent>
							</Card>
						</section>

						<section className="mt-8">
							<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
								Supporting documents
							</h2>
							<Card>
								<CardContent>
									{pharmacy && pharmacy.documents.length > 0 ? (
										<ul className="mb-4 divide-y divide-ink-100">
											{pharmacy.documents.map((d) => (
												<li
													key={d.id}
													className="flex items-center gap-2 py-2 text-sm text-ink-700 first:pt-0"
												>
													<FileText className="size-4 text-ink-400" />
													<span className="font-medium">
														{PHARMACY_DOC_LABELS[
															d.docType as keyof typeof PHARMACY_DOC_LABELS
														] ?? d.docType}
													</span>
													<span className="text-ink-400">
														{d.fileName ||
															d.externalRef ||
															d.storagePath ||
															"—"}
													</span>
												</li>
											))}
										</ul>
									) : (
										<p className="mb-4 text-sm text-ink-400">
											No documents added yet.
										</p>
									)}

									<Form
										method="post"
										className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
									>
										<input type="hidden" name="intent" value="add_document" />
										<div>
											<Label htmlFor="docType">Document type</Label>
											<Select
												id="docType"
												name="docType"
												defaultValue="drug_license"
											>
												{PHARMACY_DOC_TYPES.map((t) => (
													<option key={t} value={t}>
														{PHARMACY_DOC_LABELS[t]}
													</option>
												))}
											</Select>
										</div>
										<div>
											<Label htmlFor="fileName">Reference / file name</Label>
											<Input
												id="fileName"
												name="fileName"
												placeholder="licence.pdf"
											/>
										</div>
										<Button type="submit" variant="outline" disabled={busy}>
											Add
										</Button>
									</Form>
									<p className="mt-2 text-xs text-ink-400">
										Secure file upload activates once the private document
										storage bucket is configured. Until then you can record
										document references here; nothing is published publicly.
									</p>
								</CardContent>
							</Card>
						</section>
					</>
				)}
			</main>
		</div>
	);
}
