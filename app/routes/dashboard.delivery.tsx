import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft, Bike, Loader2, Plus } from "lucide-react";
import type { Route } from "./+types/dashboard.delivery";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input, Label } from "~/components/ui/field";
import {
	createRider,
	getDeliveryStats,
	listRiders,
} from "~/modules/delivery/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Delivery — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Delivery & riders.",
		siteName: data?.brand.name ?? "Bhama Vision",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant)
		throw redirect("/onboarding/business", { headers: auth.headers });
	const [riders, stats] = await Promise.all([
		listRiders(auth.supabase, ctx.tenant.id),
		getDeliveryStats(auth.supabase, ctx.tenant.id),
	]);
	return { brand, riders, stats };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store." };
	const form = await request.formData();
	if (String(form.get("intent")) === "add_rider") {
		const r = await createRider(
			context.cloudflare.env,
			ctx.tenant.id,
			String(form.get("fullName") ?? ""),
			String(form.get("phone") ?? ""),
		);
		return r.ok ? { ok: "Rider added." } : { error: r.error };
	}
	return { error: "Unknown action." };
}

export default function Delivery({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, riders, stats } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link to="/dashboard">
						<Button variant="ghost" size="sm">
							<ArrowLeft /> Dashboard
						</Button>
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
				<h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
					<Bike className="size-6 text-brand-700" /> Delivery
				</h1>
				<p className="mt-1 text-sm text-ink-500">
					Manage your own delivery staff and assign them to orders. (Rider app +
					GPS come later.)
				</p>

				<div className="mt-6 grid grid-cols-3 gap-3">
					<Stat label="Riders" value={stats.riders} />
					<Stat label="Active deliveries" value={stats.activeAssignments} />
					<Stat label="Completed today" value={stats.completedToday} />
				</div>

				{actionData?.ok && (
					<div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
						{actionData.ok}
					</div>
				)}
				{actionData?.error && (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{actionData.error}
					</div>
				)}

				<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
					<Card>
						<CardContent className="sm:p-4">
							<h2 className="font-semibold text-ink-900">
								Riders ({riders.length})
							</h2>
							{riders.length === 0 ? (
								<p className="py-8 text-center text-sm text-ink-400">
									No riders yet. Add your first delivery person.
								</p>
							) : (
								<ul className="mt-3 divide-y divide-ink-100">
									{riders.map((r) => (
										<li
											key={r.id}
											className="flex items-center justify-between py-3"
										>
											<div>
												<p className="font-medium text-ink-900">{r.fullName}</p>
												<p className="text-sm text-ink-500">
													{r.phone ?? "No phone"}
												</p>
											</div>
											<Badge
												variant={r.status === "active" ? "lime" : "neutral"}
											>
												{r.status}
											</Badge>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Card className="h-fit">
						<CardContent>
							<h2 className="flex items-center gap-2 font-semibold text-ink-900">
								<Plus className="size-4" /> Add rider
							</h2>
							<Form method="post" className="mt-4 space-y-3">
								<input type="hidden" name="intent" value="add_rider" />
								<div>
									<Label htmlFor="fullName">Name</Label>
									<Input id="fullName" name="fullName" required />
								</div>
								<div>
									<Label htmlFor="phone">Phone</Label>
									<Input id="phone" name="phone" inputMode="numeric" />
								</div>
								<Button type="submit" className="w-full" disabled={busy}>
									{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
									rider
								</Button>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-2xl border border-ink-100 bg-white p-4">
			<p className="text-2xl font-bold text-ink-900">{value}</p>
			<p className="text-xs text-ink-500">{label}</p>
		</div>
	);
}
