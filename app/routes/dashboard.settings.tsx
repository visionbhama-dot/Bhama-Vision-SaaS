import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft, Loader2, Settings } from "lucide-react";
import type { Route } from "./+types/dashboard.settings";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input, Label, Textarea } from "~/components/ui/field";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Store settings — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Store settings.",
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

	const { data } = await auth.supabase
		.from("stores")
		.select(
			"accepting_orders, min_order_paise, delivery_fee_paise, free_delivery_threshold_paise, prep_minutes, delivery_minutes, serviceable_pincodes, opening_hours",
		)
		.eq("tenant_id", ctx.tenant.id)
		.maybeSingle();
	const s = (data ?? {}) as Record<string, unknown>;
	const paiseToStr = (p: unknown) => (p == null ? "" : String(Number(p) / 100));
	const hours = (s.opening_hours ?? {}) as { open?: string; close?: string };
	return {
		brand,
		settings: {
			acceptingOrders: s.accepting_orders !== false,
			minOrder: paiseToStr(s.min_order_paise),
			deliveryFee: paiseToStr(s.delivery_fee_paise),
			freeThreshold: paiseToStr(s.free_delivery_threshold_paise),
			prepMinutes: s.prep_minutes == null ? "" : String(s.prep_minutes),
			deliveryMinutes:
				s.delivery_minutes == null ? "" : String(s.delivery_minutes),
			pincodes: Array.isArray(s.serviceable_pincodes)
				? (s.serviceable_pincodes as string[]).join(", ")
				: "",
			openTime: hours.open ?? "",
			closeTime: hours.close ?? "",
		},
	};
}

const toPaise = (v: FormDataEntryValue | null) => {
	const n = Number(String(v ?? "").trim());
	return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const toIntOrNull = (v: FormDataEntryValue | null) => {
	const n = Number(String(v ?? "").trim());
	return Number.isInteger(n) && n >= 0 ? n : null;
};

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store." };
	const form = await request.formData();

	const pincodes = String(form.get("serviceablePincodes") ?? "")
		.split(/[\s,]+/)
		.map((p) => p.trim())
		.filter((p) => /^[1-9]\d{5}$/.test(p));
	const freeThresholdRaw = String(
		form.get("freeDeliveryThreshold") ?? "",
	).trim();

	const { error } = await auth.supabase
		.from("stores")
		.update({
			accepting_orders: String(form.get("acceptingOrders") ?? "") === "on",
			min_order_paise: toPaise(form.get("minOrder")),
			delivery_fee_paise: toPaise(form.get("deliveryFee")),
			free_delivery_threshold_paise:
				freeThresholdRaw === ""
					? null
					: toPaise(form.get("freeDeliveryThreshold")),
			prep_minutes: toIntOrNull(form.get("prepMinutes")),
			delivery_minutes: toIntOrNull(form.get("deliveryMinutes")),
			serviceable_pincodes: pincodes,
			opening_hours: {
				open: String(form.get("openTime") ?? ""),
				close: String(form.get("closeTime") ?? ""),
			},
		})
		.eq("tenant_id", ctx.tenant.id);
	if (error) return { error: "Could not save settings." };
	return { ok: "Settings saved." };
}

export default function StoreSettings({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, settings } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
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

			<div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
				<h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
					<Settings className="size-6 text-brand-700" /> Store &amp; delivery
					settings
				</h1>

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

				<Form method="post" className="mt-6 space-y-6">
					<Card>
						<CardContent className="space-y-4">
							<label className="flex items-center gap-2.5 text-sm font-medium text-ink-800">
								<input
									type="checkbox"
									name="acceptingOrders"
									defaultChecked={settings.acceptingOrders}
									className="size-4 rounded border-ink-300 text-brand-600"
								/>
								Accepting orders
							</label>
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<Label htmlFor="openTime">Opens</Label>
									<Input
										id="openTime"
										name="openTime"
										type="time"
										defaultValue={settings.openTime}
									/>
								</div>
								<div>
									<Label htmlFor="closeTime">Closes</Label>
									<Input
										id="closeTime"
										name="closeTime"
										type="time"
										defaultValue={settings.closeTime}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="space-y-4">
							<h2 className="font-semibold text-ink-900">Delivery</h2>
							<div className="grid gap-4 sm:grid-cols-3">
								<div>
									<Label htmlFor="minOrder">Min order (₹)</Label>
									<Input
										id="minOrder"
										name="minOrder"
										type="number"
										min={0}
										step="1"
										defaultValue={settings.minOrder}
									/>
								</div>
								<div>
									<Label htmlFor="deliveryFee">Delivery fee (₹)</Label>
									<Input
										id="deliveryFee"
										name="deliveryFee"
										type="number"
										min={0}
										step="1"
										defaultValue={settings.deliveryFee}
									/>
								</div>
								<div>
									<Label htmlFor="freeDeliveryThreshold">
										Free delivery over (₹)
									</Label>
									<Input
										id="freeDeliveryThreshold"
										name="freeDeliveryThreshold"
										type="number"
										min={0}
										step="1"
										defaultValue={settings.freeThreshold}
										placeholder="Optional"
									/>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<Label htmlFor="prepMinutes">Prep time (min)</Label>
									<Input
										id="prepMinutes"
										name="prepMinutes"
										type="number"
										min={0}
										step="1"
										defaultValue={settings.prepMinutes}
										placeholder="e.g. 20"
									/>
								</div>
								<div>
									<Label htmlFor="deliveryMinutes">Delivery time (min)</Label>
									<Input
										id="deliveryMinutes"
										name="deliveryMinutes"
										type="number"
										min={0}
										step="1"
										defaultValue={settings.deliveryMinutes}
										placeholder="e.g. 40"
									/>
								</div>
							</div>
							<p className="text-xs text-ink-400">
								These are estimates shown to customers — never promised as
								guaranteed times.
							</p>
							<div>
								<Label htmlFor="serviceablePincodes">
									Serviceable PIN codes (optional)
								</Label>
								<Textarea
									id="serviceablePincodes"
									name="serviceablePincodes"
									defaultValue={settings.pincodes}
									placeholder="Leave blank to allow all PIN codes. e.g. 560001, 560002"
								/>
								<p className="mt-1 text-xs text-ink-400">
									If set, only these 6-digit PIN codes can check out.
								</p>
							</div>
						</CardContent>
					</Card>

					<Button type="submit" size="lg" disabled={busy}>
						{busy ? (
							<>
								<Loader2 className="animate-spin" /> Saving…
							</>
						) : (
							"Save settings"
						)}
					</Button>
				</Form>
			</div>
		</div>
	);
}
