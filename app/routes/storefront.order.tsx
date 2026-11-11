import { useEffect } from "react";
import { CheckCircle2, Clock, Package } from "lucide-react";
import type { Route } from "./+types/storefront.order";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { formatInrMinor } from "~/lib/utils";
import { getOrderByToken } from "~/modules/checkout/service.server";
import { ORDER_STATUS_LABELS, type OrderStatus } from "~/modules/orders/status";
import { clearCart } from "~/modules/storefront/cart";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Order ${data?.order?.number ?? ""} — ${data?.order?.storeName ?? "Store"}`,
		description: "Your order details.",
		siteName: data?.platformName ?? "Bhama Vision",
		noindex: true,
	});
}

export async function loader({ context, params }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const order = await getOrderByToken(
		context.cloudflare.env,
		params.token ?? "",
	);
	if (!order) throw new Response("Order not found", { status: 404 });
	return { platformName: brand.name, slug: params.slug ?? "", order };
}

const ACTIVE_STEPS: OrderStatus[] = [
	"placed",
	"accepted",
	"preparing",
	"packed",
	"out_for_delivery",
	"delivered",
];

export default function OrderConfirmation({
	loaderData,
}: Route.ComponentProps) {
	const { order, slug } = loaderData;

	// The order exists now — empty the cart for this store on this device.
	useEffect(() => {
		clearCart(slug);
		if (typeof window !== "undefined")
			window.localStorage.removeItem(`bv_idem:${slug}`);
	}, [slug]);

	const cancelled = order.status === "cancelled" || order.status === "rejected";
	const currentIdx = ACTIVE_STEPS.indexOf(order.status as OrderStatus);
	const addr = order.deliveryAddress ?? {};

	return (
		<div className="min-h-screen bg-canvas">
			<main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
				<div className="rounded-2xl border border-ink-100 bg-white p-6 text-center">
					<span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
						<CheckCircle2 className="size-7" />
					</span>
					<h1 className="mt-4 text-2xl font-bold text-ink-900">Order placed</h1>
					<p className="mt-1 text-sm text-ink-500">
						{order.storeName} received your order. Keep this page to track it.
					</p>
					<p className="mt-4 inline-block rounded-lg bg-ink-50 px-4 py-2 font-mono text-lg font-bold text-ink-900">
						{order.number}
					</p>
					<p className="mt-3 text-sm text-ink-600">
						{order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online"}{" "}
						·{" "}
						<span className="font-medium">
							{paymentLabel(order.paymentMethod, order.paymentState)}
						</span>
					</p>
				</div>

				{/* Status tracker */}
				<div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6">
					<h2 className="flex items-center gap-2 font-semibold text-ink-900">
						<Clock className="size-4 text-ink-400" /> Status:{" "}
						{ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
					</h2>
					{cancelled ? (
						<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
							This order was {order.status}.
						</p>
					) : (
						<ol className="mt-4 space-y-3">
							{ACTIVE_STEPS.map((s, i) => {
								const done = currentIdx >= i;
								return (
									<li key={s} className="flex items-center gap-3 text-sm">
										<span
											className={
												done
													? "size-2.5 rounded-full bg-brand-600"
													: "size-2.5 rounded-full bg-ink-200"
											}
										/>
										<span
											className={
												done ? "font-medium text-ink-800" : "text-ink-400"
											}
										>
											{ORDER_STATUS_LABELS[s]}
										</span>
									</li>
								);
							})}
						</ol>
					)}
				</div>

				{/* Items + totals */}
				<div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6">
					<h2 className="flex items-center gap-2 font-semibold text-ink-900">
						<Package className="size-4 text-ink-400" /> Items
					</h2>
					<ul className="mt-3 space-y-2 text-sm">
						{order.items.map((it, idx) => (
							<li key={idx} className="flex justify-between gap-2">
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
				</div>

				{/* Delivery to */}
				<div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 text-sm">
					<h2 className="font-semibold text-ink-900">Delivering to</h2>
					<p className="mt-2 text-ink-600">
						{String(addr.full_name ?? "")}
						<br />
						{String(addr.line1 ?? "")}
						{addr.landmark ? `, ${String(addr.landmark)}` : ""}
						<br />
						{String(addr.city ?? "")} {String(addr.pincode ?? "")}
						<br />
						{addr.phone ? `📞 ${String(addr.phone)}` : ""}
					</p>
				</div>

				<a
					href={`/store/${slug}`}
					className="mt-6 inline-block text-sm font-semibold text-brand-700"
				>
					← Back to {order.storeName}
				</a>
			</main>
		</div>
	);
}

function paymentLabel(method: string, state: string): string {
	if (state === "paid") return "Paid";
	if (method === "cod") return "Collect on delivery";
	return "Payment pending";
}
