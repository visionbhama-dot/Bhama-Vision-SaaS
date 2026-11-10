import { Form, Link, useNavigation } from "react-router";
import { ShieldCheck, Pill, Loader2, Clock } from "lucide-react";
import type { Route } from "./+types/admin.pharmacy";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requirePlatformAdmin } from "~/lib/auth.server";
import {
	listPharmacyVerifications,
	reviewPharmacy,
	setMedicineOrdering,
	type PharmacyReviewRow,
} from "~/modules/pharmacy/service.server";
import {
	PHARMACY_STATUS_LABELS,
	REVIEW_DECISIONS,
	type ReviewDecision,
} from "~/modules/pharmacy/schema";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Pharmacy review — Superadmin — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Pharmacy licence verification.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	await requirePlatformAdmin(request, context.cloudflare.env);
	const rows = await listPharmacyVerifications(context.cloudflare.env);
	return { brand, rows };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");
	const tenantId = String(form.get("tenantId") ?? "");
	if (!tenantId) return { error: "Missing tenant." };

	if (intent === "review") {
		const decision = String(form.get("decision") ?? "") as ReviewDecision;
		if (!REVIEW_DECISIONS.includes(decision)) {
			return { error: "Invalid decision." };
		}
		const notes = String(form.get("notes") ?? "");
		const r = await reviewPharmacy(
			context.cloudflare.env,
			user.id,
			tenantId,
			decision,
			notes,
		);
		return r.ok
			? { ok: `Verification set to ${decision}.` }
			: { error: r.error };
	}

	if (intent === "toggle_medicine") {
		const enabled = String(form.get("enabled") ?? "") === "true";
		const r = await setMedicineOrdering(
			context.cloudflare.env,
			user.id,
			tenantId,
			enabled,
		);
		return r.ok
			? { ok: `Medicine ordering ${enabled ? "enabled" : "disabled"}.` }
			: { error: r.error };
	}
	return { error: "Unknown action." };
}

export default function AdminPharmacy({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, rows } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const queue = rows.filter((r) =>
		["pending", "under_review"].includes(r.status),
	);

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-ink-900 text-white">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
					<div className="flex items-center gap-3">
						<Logo name={brand.shortName} />
						<Badge variant="lime">
							<ShieldCheck className="size-3.5" /> Superadmin
						</Badge>
					</div>
					<div className="flex items-center gap-4 text-sm text-ink-200">
						<Link to="/admin/merchants" className="hover:text-white">
							Merchants
						</Link>
						<Link to="/dashboard" className="hover:text-white">
							Dashboard
						</Link>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
				<h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
					<Pill className="size-6 text-brand-700" /> Pharmacy verification
				</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-500">
					Review licences for merchants registering as Licensed Pharmacies.
					Approving confirms documents to Bhama Vision only — it is not
					government approval, and it does <strong>not</strong> enable medicine
					ordering. Medicine ordering is a separate, explicit toggle intended to
					follow the applicable legal review.
				</p>

				{actionData?.ok && (
					<p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
						{actionData.ok}
					</p>
				)}
				{actionData?.error && (
					<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{actionData.error}
					</p>
				)}

				<p className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-500">
					Awaiting review ({queue.length})
				</p>
				<div className="mt-2 space-y-4">
					{rows.length === 0 ? (
						<p className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-400">
							No pharmacy verifications submitted yet.
						</p>
					) : (
						rows.map((r) => <PharmacyCard key={r.tenantId} r={r} busy={busy} />)
					)}
				</div>
			</main>
		</div>
	);
}

function PharmacyCard({ r, busy }: { r: PharmacyReviewRow; busy: boolean }) {
	const overdue =
		r.reviewDueAt &&
		["pending", "under_review"].includes(r.status) &&
		new Date(r.reviewDueAt).getTime() < Date.now();
	return (
		<div className="rounded-2xl border border-ink-100 bg-white p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-semibold text-ink-900">
						{r.storeName ?? r.tenantName}{" "}
						{r.slug && <span className="text-ink-400">({r.slug})</span>}
					</p>
					<p className="mt-1 text-sm text-ink-500">
						Licence {r.licenseNumber ?? "—"} · {r.licenseAuthority ?? "—"} ·
						expires {r.licenseExpiry ?? "—"}
					</p>
					<p className="text-sm text-ink-500">
						Pharmacist: {r.pharmacistName ?? "—"} · {r.documentCount}{" "}
						document(s)
					</p>
				</div>
				<div className="flex flex-col items-end gap-1.5">
					<Badge variant={r.status === "verified" ? "brand" : "blue"}>
						{PHARMACY_STATUS_LABELS[r.status] ?? r.status}
					</Badge>
					{overdue && (
						<span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
							<Clock className="size-3.5" /> Past 24h target
						</span>
					)}
					<Badge variant={r.medicineOrderingEnabled ? "lime" : "outline"}>
						Medicine {r.medicineOrderingEnabled ? "ON" : "OFF"}
					</Badge>
				</div>
			</div>

			<Form method="post" className="mt-4 flex flex-wrap items-end gap-2">
				<input type="hidden" name="tenantId" value={r.tenantId} />
				<input type="hidden" name="intent" value="review" />
				<div className="flex-1 min-w-[200px]">
					<label className="mb-1 block text-xs font-medium text-ink-600">
						Review note (sent to merchant)
					</label>
					<input
						name="notes"
						className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
						placeholder="Optional note"
					/>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						name="decision"
						value="start_review"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						Start review
					</Button>
					<Button
						name="decision"
						value="needs_correction"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						Needs correction
					</Button>
					<Button
						name="decision"
						value="reject"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						Reject
					</Button>
					<Button name="decision" value="verify" size="sm" disabled={busy}>
						{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{" "}
						Verify
					</Button>
				</div>
			</Form>

			{r.status === "verified" && (
				<Form method="post" className="mt-3 border-t border-ink-100 pt-3">
					<input type="hidden" name="tenantId" value={r.tenantId} />
					<input type="hidden" name="intent" value="toggle_medicine" />
					<input
						type="hidden"
						name="enabled"
						value={r.medicineOrderingEnabled ? "false" : "true"}
					/>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-xs text-ink-500">
							Enable medicine ordering only after the applicable online-pharmacy
							legal review. This is explicit and audited.
						</p>
						<Button
							size="sm"
							variant={r.medicineOrderingEnabled ? "outline" : "secondary"}
							disabled={busy}
						>
							{r.medicineOrderingEnabled
								? "Disable medicine ordering"
								: "Enable medicine ordering"}
						</Button>
					</div>
				</Form>
			)}
		</div>
	);
}
