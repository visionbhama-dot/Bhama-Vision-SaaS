import { Form, Link, redirect, useNavigation } from "react-router";
import { ArrowLeft, Loader2, Truck, IndianRupee, Ban } from "lucide-react";
import type { Route } from "./+types/dashboard.orders.$id";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { formatInrMinor } from "~/lib/utils";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
	advanceStatus,
	cancelOrder,
	getOrder,
	markCodPaid,
} from "~/modules/orders/service.server";
import {
	assignRider,
	listRiders,
	markDelivered,
	markPickedUp,
} from "~/modules/delivery/service.server";
import {
	ORDER_STATUS_LABELS,
	isOrderStatus,
	nextStatuses,
	type OrderStatus,
} from "~/modules/orders/status";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Order ${data?.order?.number ?? ""} — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Order detail.",
		siteName: data?.brand.name ?? "Bhama Vision",
		noindex: true,
	});
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant)
		throw redirect("/onboarding/business", { headers: auth.headers });

	const order = await getOrder(auth.supabase, ctx.tenant.id, params.id ?? "");
	if (!order) throw redirect("/dashboard/orders");
	const riders = await listRiders(auth.supabase, ctx.tenant.id);
	return { brand, order, riders };
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store." };
	const tenantId = ctx.tenant.id;
	const env = context.cloudflare.env;
	const orderId = params.id ?? "";
	const form = await request.formData();
	const intent = String(form.get("intent") ?? "");

	if (intent === "advance") {
		const to = String(form.get("to") ?? "");
		if (!isOrderStatus(to)) return { error: "Invalid status." };
		const r = await advanceStatus(
			env,
			tenantId,
			user.id,
			orderId,
			to as OrderStatus,
		);
		return r.ok
			? { ok: `Order moved to ${ORDER_STATUS_LABELS[to as OrderStatus]}.` }
			: { error: r.error };
	}
	if (intent === "cod_paid") {
		const r = await markCodPaid(env, tenantId, user.id, orderId);
		return r.ok
			? { ok: "Marked as paid (COD collected)." }
			: { error: r.error };
	}
	if (intent === "cancel") {
		const r = await cancelOrder(
			env,
			tenantId,
			user.id,
			orderId,
			String(form.get("reason") ?? "Cancelled by store"),
		);
		return r.ok
			? { ok: "Order cancelled and stock restored." }
			: { error: r.error };
	}
	if (intent === "assign") {
		const r = await assignRider(
			env,
			tenantId,
			orderId,
			String(form.get("riderId") ?? ""),
		);
		return r.ok ? { ok: "Rider assigned." } : { error: r.error };
	}
	if (intent === "pickup") {
		const r = await markPickedUp(env, tenantId, user.id, orderId);
		return r.ok ? { ok: "Marked out for delivery." } : { error: r.error };
	}
	if (intent === "deliver") {
		const r = await markDelivered(
			env,
			tenantId,
			user.id,
			orderId,
			String(form.get("note") ?? ""),
		);
		return r.ok ? { ok: "Marked delivered." } : { error: r.error };
	}
	return { error: "Unknown action." };
}

const NEXT_LABEL: Record<string, string> = {
	accepted: "Accept",
	rejected: "Reject",
	preparing: "Start preparing",
	packed: "Mark ready",
	out_for_delivery: "Out for delivery",
	delivered: "Mark delivered",
	cancelled: "Cancel",
};

export default function OrderDetail({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, order, riders } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const addr = order.deliveryAddress ?? {};
	const nexts = isOrderStatus(order.status) ? nextStatuses(order.status) : [];
	const terminal = ["delivered", "cancelled", "rejected"].includes(
		order.status,
	);

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link to="/dashboard/orders">
						<Button variant="ghost" size="sm">
							<ArrowLeft /> Orders
						</Button>
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h1 className="font-mono text-2xl font-bold text-ink-900">
						{order.number}
					</h1>
					<div className="flex items-center gap-2">
						<Badge variant="blue">
							{ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
						</Badge>
						<Badge variant={order.paymentState === "paid" ? "lime" : "outline"}>
							{order.paymentMethod.toUpperCase()} ·{" "}
							{order.paymentState === "paid"
								? "Paid"
								: order.paymentMethod === "cod"
									? "Collect"
									: "Unpaid"}
						</Badge>
					</div>
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

				{/* Fulfilment actions */}
				{!terminal && (
					<Card className="mt-6">
						<CardContent>
							<h2 className="font-semibold text-ink-900">Update order</h2>
							<div className="mt-3 flex flex-wrap gap-2">
								{nexts.map((s) => (
									<Form method="post" key={s}>
										<input type="hidden" name="intent" value="advance" />
										<input type="hidden" name="to" value={s} />
										<Button
											type="submit"
											size="sm"
											variant={
												s === "cancelled" || s === "rejected"
													? "outline"
													: "primary"
											}
											disabled={busy}
											onClick={(e) => {
												if (
													(s === "cancelled" || s === "rejected") &&
													!confirm(`${NEXT_LABEL[s]} this order?`)
												)
													e.preventDefault();
											}}
										>
											{NEXT_LABEL[s] ?? s}
										</Button>
									</Form>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
					{/* Items + totals + timeline */}
					<div className="space-y-6">
						<Card>
							<CardContent>
								<h2 className="font-semibold text-ink-900">Items</h2>
								<ul className="mt-3 space-y-2 text-sm">
									{order.items.map((it, i) => (
										<li key={i} className="flex justify-between gap-2">
											<span className="text-ink-600">
												{it.name}
												{it.unit ? ` (${it.unit})` : ""} × {it.quantity}
											</span>
											<span className="text-ink-900">
												{formatInrMinor(it.lineTotalPaise)}
											</span>
										</li>
									))}
								</ul>
								<div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
									<div className="flex justify-between text-ink-600">
										<span>Subtotal</span>
										<span>{formatInrMinor(order.subtotalPaise)}</span>
									</div>
									<div className="flex justify-between text-ink-600">
										<span>Delivery</span>
										<span>
											{order.deliveryPaise === 0
												? "FREE"
												: formatInrMinor(order.deliveryPaise)}
										</span>
									</div>
									<div className="flex justify-between pt-1 text-base font-bold text-ink-900">
										<span>Total</span>
										<span>{formatInrMinor(order.totalPaise)}</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent>
								<h2 className="font-semibold text-ink-900">Timeline</h2>
								<ol className="mt-3 space-y-2 text-sm">
									{order.events.map((e, i) => (
										<li
											key={i}
											className="flex items-center gap-2 text-ink-600"
										>
											<span className="size-2 rounded-full bg-brand-500" />
											{ORDER_STATUS_LABELS[e.status as OrderStatus] ?? e.status}
											{e.note ? ` — ${e.note}` : ""}
											<span className="text-xs text-ink-400">
												{new Date(e.createdAt).toLocaleString("en-IN")}
											</span>
										</li>
									))}
								</ol>
							</CardContent>
						</Card>
					</div>

					{/* Customer + payment + delivery */}
					<div className="space-y-6">
						<Card>
							<CardContent className="text-sm">
								<h2 className="font-semibold text-ink-900">Customer</h2>
								<p className="mt-2 text-ink-600">
									{String(addr.full_name ?? "—")}
									<br />
									{addr.phone ? (
										<a
											href={`tel:${String(addr.phone)}`}
											className="text-brand-700"
										>
											{String(addr.phone)}
										</a>
									) : null}
									<br />
									{String(addr.line1 ?? "")}
									{addr.landmark ? `, ${String(addr.landmark)}` : ""}
									<br />
									{String(addr.city ?? "")} {String(addr.pincode ?? "")}
								</p>
								{addr.instructions ? (
									<p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
										Note: {String(addr.instructions)}
									</p>
								) : null}
							</CardContent>
						</Card>

						{order.paymentMethod === "cod" &&
							order.paymentState !== "paid" &&
							!terminal && (
								<Card>
									<CardContent>
										<h2 className="font-semibold text-ink-900">
											COD collection
										</h2>
										<p className="mt-1 text-sm text-ink-500">
											Mark as paid once you collect{" "}
											{formatInrMinor(order.totalPaise)}.
										</p>
										<Form method="post" className="mt-3">
											<input type="hidden" name="intent" value="cod_paid" />
											<Button type="submit" size="sm" disabled={busy}>
												<IndianRupee /> Mark COD paid
											</Button>
										</Form>
									</CardContent>
								</Card>
							)}

						{/* Self-delivery */}
						<Card>
							<CardContent>
								<h2 className="flex items-center gap-2 font-semibold text-ink-900">
									<Truck className="size-4" /> Delivery
								</h2>
								{order.assignment ? (
									<div className="mt-2 text-sm text-ink-600">
										<p>
											Rider:{" "}
											<span className="font-medium text-ink-900">
												{order.assignment.riderName ?? "—"}
											</span>
											{order.assignment.riderPhone
												? ` · ${order.assignment.riderPhone}`
												: ""}
										</p>
										<p className="text-xs text-ink-400">
											Assignment: {order.assignment.status}
										</p>
										{!terminal && (
											<div className="mt-3 flex flex-wrap gap-2">
												{order.status === "packed" && (
													<Form method="post">
														<input type="hidden" name="intent" value="pickup" />
														<Button
															type="submit"
															size="sm"
															variant="outline"
															disabled={busy}
														>
															Picked up
														</Button>
													</Form>
												)}
												{order.status === "out_for_delivery" && (
													<Form method="post">
														<input
															type="hidden"
															name="intent"
															value="deliver"
														/>
														<Button type="submit" size="sm" disabled={busy}>
															Delivered
														</Button>
													</Form>
												)}
											</div>
										)}
									</div>
								) : terminal ? (
									<p className="mt-2 text-sm text-ink-400">
										No rider assigned.
									</p>
								) : riders.length === 0 ? (
									<p className="mt-2 text-sm text-ink-400">
										Add riders in{" "}
										<Link
											to="/dashboard/delivery"
											className="text-brand-700 underline"
										>
											Delivery
										</Link>{" "}
										to assign them.
									</p>
								) : (
									<Form method="post" className="mt-3 flex items-end gap-2">
										<input type="hidden" name="intent" value="assign" />
										<div className="flex-1">
											<label className="mb-1 block text-xs text-ink-600">
												Assign rider
											</label>
											<select
												name="riderId"
												className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
											>
												{riders.map((r) => (
													<option key={r.id} value={r.id}>
														{r.fullName}
													</option>
												))}
											</select>
										</div>
										<Button type="submit" size="sm" disabled={busy}>
											Assign
										</Button>
									</Form>
								)}
							</CardContent>
						</Card>

						{!terminal && (
							<Form
								method="post"
								onSubmit={(e) => {
									if (!confirm("Cancel this order and restore stock?"))
										e.preventDefault();
								}}
							>
								<input type="hidden" name="intent" value="cancel" />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									className="w-full"
									disabled={busy}
								>
									{busy ? <Loader2 className="animate-spin" /> : <Ban />} Cancel
									order
								</Button>
							</Form>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
