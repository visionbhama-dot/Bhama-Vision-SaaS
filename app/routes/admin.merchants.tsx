import { Form, Link, useNavigation } from "react-router";
import {
	ShieldCheck,
	CheckCircle2,
	Ban,
	RotateCcw,
	Loader2,
} from "lucide-react";
import type { Route } from "./+types/admin.merchants";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requirePlatformAdmin } from "~/lib/auth.server";
import {
	listMerchants,
	approveMerchant,
	suspendMerchant,
	reactivateMerchant,
} from "~/modules/platform/service.server";
import { Logo } from "~/modules/marketing/components/logo";
import { StoreStatusBadge } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Merchants — Superadmin — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Platform merchant administration.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	await requirePlatformAdmin(request, context.cloudflare.env);
	const merchants = await listMerchants(context.cloudflare.env);
	return { brand, merchants };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");
	const tenantId = String(form.get("tenantId") ?? "");
	if (!tenantId) return { error: "Missing tenant." };

	if (intent === "approve") {
		const r = await approveMerchant(context.cloudflare.env, user.id, tenantId);
		return r.ok
			? { ok: "Merchant approved and activated." }
			: { error: r.error };
	}
	if (intent === "suspend") {
		const reason = String(form.get("reason") ?? "Administrative suspension");
		const r = await suspendMerchant(
			context.cloudflare.env,
			user.id,
			tenantId,
			reason,
		);
		return r.ok ? { ok: "Merchant suspended." } : { error: r.error };
	}
	if (intent === "reactivate") {
		const r = await reactivateMerchant(
			context.cloudflare.env,
			user.id,
			tenantId,
		);
		return r.ok ? { ok: "Merchant reactivated." } : { error: r.error };
	}
	return { error: "Unknown action." };
}

export default function AdminMerchants({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, merchants } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";

	const pending = merchants.filter((m) => m.status === "pending_verification");
	const active = merchants.filter((m) => m.status === "active");

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
						<Link to="/admin/pharmacy" className="hover:text-white">
							Pharmacy review
						</Link>
						<Link to="/dashboard" className="hover:text-white">
							Back to dashboard
						</Link>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				<h1 className="text-2xl font-bold text-ink-900">Merchant accounts</h1>
				<p className="mt-1 text-sm text-ink-500">
					Review and activate newly registered merchants. Approving a merchant
					activates their store and grants plan entitlements — this is logged to
					the audit trail.
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

				<div className="mt-6 grid gap-4 sm:grid-cols-3">
					<Stat label="Total merchants" value={merchants.length} />
					<Stat label="Awaiting review" value={pending.length} />
					<Stat label="Active" value={active.length} />
				</div>

				<Section title={`Awaiting review (${pending.length})`}>
					{pending.length === 0 ? (
						<Empty text="No merchants awaiting review." />
					) : (
						pending.map((m) => (
							<MerchantRow key={m.tenant_id} m={m} busy={busy} />
						))
					)}
				</Section>

				<Section title={`All merchants (${merchants.length})`}>
					{merchants.length === 0 ? (
						<Empty text="No merchants registered yet." />
					) : (
						merchants.map((m) => (
							<MerchantRow key={m.tenant_id} m={m} busy={busy} />
						))
					)}
				</Section>
			</main>
		</div>
	);
}

function MerchantRow({
	m,
	busy,
}: {
	m: Route.ComponentProps["loaderData"]["merchants"][number];
	busy: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 border-t border-ink-100 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="font-semibold text-ink-900">
					{m.display_name ?? m.tenant_name}
				</p>
				<p className="text-sm text-ink-500">
					{m.slug ? `${m.slug} · ` : ""}
					{m.city ?? "—"} ·{" "}
					{m.kind === "marketplace" ? "Marketplace" : "Single store"} ·{" "}
					{m.plan_slug ?? "no plan"} ({m.subscription_status ?? "—"})
				</p>
				<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
					<Badge variant="outline">
						Pay: {m.payment_status ?? "not connected"}
						{m.payment_environment ? ` (${m.payment_environment})` : ""}
					</Badge>
					{m.category === "pharmacy" && (
						<Badge variant="blue">
							Pharmacy: {m.pharmacy_status ?? "pending"}
						</Badge>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2">
				{m.status && <StoreStatusBadge status={m.status} />}
				{m.status === "pending_verification" && (
					<Form method="post">
						<input type="hidden" name="tenantId" value={m.tenant_id} />
						<input type="hidden" name="intent" value="approve" />
						<Button size="sm" type="submit" disabled={busy}>
							{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{" "}
							Approve
						</Button>
					</Form>
				)}
				{m.status === "active" && (
					<Form method="post">
						<input type="hidden" name="tenantId" value={m.tenant_id} />
						<input type="hidden" name="intent" value="suspend" />
						<Button size="sm" variant="outline" type="submit" disabled={busy}>
							<Ban /> Suspend
						</Button>
					</Form>
				)}
				{m.status === "suspended" && (
					<Form method="post">
						<input type="hidden" name="tenantId" value={m.tenant_id} />
						<input type="hidden" name="intent" value="reactivate" />
						<Button size="sm" variant="outline" type="submit" disabled={busy}>
							<RotateCcw /> Reactivate
						</Button>
					</Form>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-8">
			<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
				{title}
			</h2>
			<div className="rounded-2xl border border-ink-100 bg-white px-5">
				{children}
			</div>
		</section>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-2xl border border-ink-100 bg-white p-5">
			<p className="text-2xl font-bold text-ink-900">{value}</p>
			<p className="text-sm text-ink-500">{label}</p>
		</div>
	);
}

function Empty({ text }: { text: string }) {
	return <p className="py-6 text-sm text-ink-400">{text}</p>;
}
