import { Form, Link, redirect, useNavigation } from "react-router";
import {
	ArrowLeft,
	CreditCard,
	Loader2,
	ShieldCheck,
	Wallet,
} from "lucide-react";
import type { Route } from "./+types/dashboard.payments";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input, Label, Select, FieldError } from "~/components/ui/field";
import { listProviders } from "~/modules/payments/providers/registry";
import { maskKey } from "~/modules/payments/providers/types";
import { connectSchema, disconnectSchema } from "~/modules/payments/schema";
import {
	connectProvider,
	disconnectProvider,
	getPaymentAccounts,
	type PaymentAccount,
} from "~/modules/payments/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Payments — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Connect your own payment provider.",
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
	const accounts = await getPaymentAccounts(
		context.cloudflare.env,
		ctx.tenant.id,
	);
	return {
		brand,
		providers: listProviders(),
		accounts,
		isOwner: ctx.membership?.role === "owner",
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireUser(request, context.cloudflare.env);
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	if (intent === "disconnect") {
		const parsed = parseForm(disconnectSchema, form);
		if (!parsed.success) return { error: "Invalid request." };
		const r = await disconnectProvider(
			context.cloudflare.env,
			user.id,
			parsed.data.provider,
		);
		return r.ok ? { ok: "Payment provider disconnected." } : { error: r.error };
	}

	const parsed = parseForm(connectSchema, form);
	if (!parsed.success) {
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };
	}
	const r = await connectProvider(context.cloudflare.env, user.id, parsed.data);
	if (!r.ok) return { error: r.error };
	return {
		ok:
			r.status === "connected"
				? "Test connection saved. You can accept test payments now."
				: "Live key saved. Activation needs your provider secret — see the note below.",
		secretRef: r.secretRef,
	};
}

export default function DashboardPayments({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, providers, accounts, isOwner } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const fieldErrors = (actionData as { fieldErrors?: Record<string, string> })
		?.fieldErrors;

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
						<Wallet className="size-5" />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-ink-900">Payments</h1>
						<p className="text-sm text-ink-500">
							Connect your own payment account. You are the seller of record —
							customer payments settle directly to you.
						</p>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
					<p className="flex items-center gap-2 font-semibold">
						<ShieldCheck className="size-4" /> How this works
					</p>
					<ul className="mt-2 list-disc space-y-1 pl-5">
						<li>
							We never hold your customers&apos; money. It goes to your provider
							account.
						</li>
						<li>
							We only store your public key id. Your secret key is never saved
							in our database.
						</li>
						<li>
							This is separate from your Bhama Vision software subscription.
						</li>
					</ul>
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
				{(actionData as { secretRef?: string })?.secretRef && (
					<div className="mt-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600">
						To activate live payments, an operator sets your provider secret as
						a Worker secret named{" "}
						<code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">
							{(actionData as { secretRef: string }).secretRef}
						</code>
						. The secret is never stored in our database.
					</div>
				)}

				{/* Current connections */}
				<section className="mt-8">
					<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
						Your connections
					</h2>
					<Card>
						<CardContent>
							{accounts.length === 0 ? (
								<p className="py-2 text-sm text-ink-400">
									No payment provider connected yet.
								</p>
							) : (
								<ul className="divide-y divide-ink-100">
									{accounts.map((a: PaymentAccount) => (
										<li
											key={a.provider}
											className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
										>
											<div>
												<p className="flex items-center gap-2 font-semibold text-ink-900">
													<CreditCard className="size-4 text-ink-400" />
													{a.provider}
													<PaymentStatusBadge status={a.status} />
													<Badge variant="outline">{a.environment}</Badge>
												</p>
												<p className="mt-0.5 text-xs text-ink-500">
													Key: {maskKey(a.keyId)}
												</p>
											</div>
											{isOwner && a.status !== "disconnected" && (
												<Form method="post">
													<input
														type="hidden"
														name="intent"
														value="disconnect"
													/>
													<input
														type="hidden"
														name="provider"
														value={a.provider}
													/>
													<Button
														type="submit"
														size="sm"
														variant="outline"
														disabled={busy}
													>
														Disconnect
													</Button>
												</Form>
											)}
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</section>

				{/* Connect form */}
				{isOwner ? (
					<section className="mt-8">
						<h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
							Connect a provider
						</h2>
						<Card>
							<CardContent>
								<Form method="post" className="space-y-4">
									<input type="hidden" name="intent" value="connect" />
									<div>
										<Label htmlFor="provider">Provider</Label>
										<Select
											id="provider"
											name="provider"
											defaultValue={providers[0]?.id}
										>
											{providers.map((p) => (
												<option key={p.id} value={p.id}>
													{p.label}
												</option>
											))}
										</Select>
										{providers[0] && (
											<p className="mt-1.5 text-xs text-ink-400">
												{providers[0].description}
											</p>
										)}
									</div>
									<div>
										<Label htmlFor="environment">Mode</Label>
										<Select
											id="environment"
											name="environment"
											defaultValue="test"
										>
											<option value="test">Test (sandbox)</option>
											<option value="live">Live</option>
										</Select>
									</div>
									<div>
										<Label htmlFor="keyId">
											{providers[0]?.keyLabel ?? "Key ID"}
										</Label>
										<Input
											id="keyId"
											name="keyId"
											placeholder="rzp_test_XXXXXXXXXX"
											aria-invalid={Boolean(fieldErrors?.keyId)}
										/>
										<FieldError>{fieldErrors?.keyId}</FieldError>
										<p className="mt-1.5 text-xs text-ink-400">
											Paste only your public Key ID. Never paste your secret key
											here.
										</p>
									</div>
									<Button type="submit" disabled={busy}>
										{busy ? (
											<Loader2 className="animate-spin" />
										) : (
											<CreditCard />
										)}{" "}
										Save connection
									</Button>
								</Form>
							</CardContent>
						</Card>
					</section>
				) : (
					<p className="mt-8 text-sm text-ink-400">
						Only the store owner can manage payment connections.
					</p>
				)}
			</main>
		</div>
	);
}

function PaymentStatusBadge({ status }: { status: string }) {
	const meta: Record<
		string,
		{
			label: string;
			variant: "brand" | "neutral" | "lime" | "blue" | "outline";
		}
	> = {
		connected: { label: "Connected", variant: "brand" },
		pending: { label: "Pending", variant: "blue" },
		error: { label: "Error", variant: "neutral" },
		disconnected: { label: "Disconnected", variant: "neutral" },
		not_connected: { label: "Not connected", variant: "outline" },
	};
	const m = meta[status] ?? { label: status, variant: "neutral" as const };
	return <Badge variant={m.variant}>{m.label}</Badge>;
}
