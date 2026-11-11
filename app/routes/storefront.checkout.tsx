import { useEffect, useMemo, useRef, useState } from "react";
import { Form, redirect, useFetcher } from "react-router";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import type { Route } from "./+types/storefront.checkout";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { formatInrMinor } from "~/lib/utils";
import { useCart } from "~/modules/storefront/cart";
import { cartItemSchema, checkoutSchema } from "~/modules/checkout/schema";
import {
	getCheckoutStore,
	placeOrder,
	priceCart,
} from "~/modules/checkout/service.server";
import { createOnlinePayment } from "~/modules/payments/online.server";
import { hasVerifiedOnlinePayment } from "~/modules/payments/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Checkout — ${data?.store?.displayName ?? "Store"}`,
		description: "Complete your order.",
		siteName: data?.platformName ?? "Bhama Vision",
		noindex: true,
	});
}

export async function loader({ context, params }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const store = await getCheckoutStore(
		context.cloudflare.env,
		params.slug ?? "",
	);
	if (!store) throw new Response("Store not found", { status: 404 });

	const onlineAvailable =
		store.status === "active" && store.acceptingOrders
			? await hasVerifiedOnlinePayment(context.cloudflare.env, store.tenantId)
			: false;

	return {
		platformName: brand.name,
		onlineAvailable,
		store: {
			slug: store.slug,
			displayName: store.displayName,
			accent: store.brandColor ?? "#039855",
			active: store.status === "active",
			acceptingOrders: store.acceptingOrders,
			minOrderPaise: store.minOrderPaise,
			deliveryFeePaise: store.deliveryFeePaise,
			freeDeliveryThresholdPaise: store.freeDeliveryThresholdPaise,
			prepMinutes: store.prepMinutes,
			deliveryMinutes: store.deliveryMinutes,
			serviceable: store.serviceablePincodes.length > 0,
		},
	};
}

function parseItems(raw: string): { productId: string; quantity: number }[] {
	try {
		const arr = JSON.parse(raw);
		if (!Array.isArray(arr)) return [];
		const out: { productId: string; quantity: number }[] = [];
		for (const it of arr) {
			const parsed = cartItemSchema.safeParse(it);
			if (parsed.success)
				out.push({
					productId: parsed.data.productId,
					quantity: parsed.data.quantity,
				});
		}
		return out;
	} catch {
		return [];
	}
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const store = await getCheckoutStore(env, params.slug ?? "");
	if (!store) return { error: "Store not found." };

	const form = await request.formData();
	const intent = String(form.get("intent") ?? "price");
	const items = parseItems(String(form.get("items") ?? "[]"));

	if (intent === "price") {
		const priced = await priceCart(env, store, items);
		return { priced };
	}

	// intent === "place"
	if (String(form.get("company_website") ?? "")) {
		return { error: "Submission rejected." };
	}
	const parsed = checkoutSchema.safeParse({
		fullName: form.get("fullName"),
		phone: form.get("phone"),
		addressLine1: form.get("addressLine1"),
		landmark: form.get("landmark") ?? "",
		city: form.get("city") ?? "",
		pincode: form.get("pincode"),
		instructions: form.get("instructions") ?? "",
		paymentMethod: form.get("paymentMethod") ?? "cod",
		idempotencyKey: form.get("idempotencyKey"),
		company_website: form.get("company_website") ?? "",
	});
	if (!parsed.success) {
		const fieldErrors: Record<string, string> = {};
		for (const i of parsed.error.issues) {
			const k = String(i.path[0] ?? "");
			if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
		}
		return { fieldErrors };
	}

	const result = await placeOrder(env, store, parsed.data, items);
	if (!result.ok) return { error: result.error };

	// COD → straight to the confirmation page.
	if (parsed.data.paymentMethod === "cod") {
		throw redirect(`/store/${store.slug}/order/${result.publicToken}`);
	}

	// Online → create the provider order; the browser opens Razorpay next.
	const online = await createOnlinePayment(env, store.tenantId, result.orderId);
	if (!online.ok) {
		// Fall back to COD-style confirmation is not appropriate for an unpaid
		// online order; report so the customer can retry or choose COD.
		return {
			error:
				online.error ??
				"Could not start online payment. Please choose Cash on Delivery.",
		};
	}
	return {
		online: {
			keyId: online.keyId,
			razorpayOrderId: online.razorpayOrderId,
			amountPaise: online.amountPaise,
			orderToken: result.publicToken,
			slug: store.slug,
			storeName: store.displayName,
		},
	};
}

export default function Checkout({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { store, onlineAvailable } = loaderData;
	const cart = useCart(store.slug);
	const priceFetcher = useFetcher<{ priced?: PricedShape }>();
	const [method, setMethod] = useState<"cod" | "online">("cod");

	// A stable idempotency key per checkout attempt (survives reloads).
	const idemRef = useRef<string>("");
	if (!idemRef.current) {
		const k =
			typeof window !== "undefined"
				? window.localStorage.getItem(`bv_idem:${store.slug}`)
				: null;
		idemRef.current =
			k ??
			(typeof crypto !== "undefined"
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random()}`);
		if (typeof window !== "undefined")
			window.localStorage.setItem(`bv_idem:${store.slug}`, idemRef.current);
	}

	const itemsJson = useMemo(
		() =>
			JSON.stringify(
				cart.lines.map((l) => ({
					productId: l.productId,
					quantity: l.quantity,
				})),
			),
		[cart.lines],
	);

	// Ask the server for authoritative prices whenever the cart changes.
	useEffect(() => {
		if (!cart.loaded || cart.lines.length === 0) return;
		priceFetcher.submit(
			{ intent: "price", items: itemsJson },
			{ method: "post" },
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [itemsJson, cart.loaded]);

	const priced = priceFetcher.data?.priced;
	const fieldErrors =
		(actionData as { fieldErrors?: Record<string, string> })?.fieldErrors ?? {};
	const error = (actionData as { error?: string })?.error;
	const online = (actionData as { online?: OnlineShape })?.online;

	// When the server returns Razorpay params, open Checkout.
	useEffect(() => {
		if (!online) return;
		void openRazorpay(online, cart.clear);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [online]);

	const accent = store.accent;
	const notOrderable = !store.active || !store.acceptingOrders;

	if (cart.loaded && cart.lines.length === 0 && !online) {
		return (
			<div className="grid min-h-screen place-items-center bg-canvas px-4">
				<div className="max-w-md text-center">
					<span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-100 text-ink-400">
						<ShoppingBag className="size-7" />
					</span>
					<h1 className="mt-4 text-2xl font-bold text-ink-900">
						Your cart is empty
					</h1>
					<a
						href={`/store/${store.slug}`}
						className="mt-6 inline-block rounded-xl px-5 py-2.5 font-semibold text-white"
						style={{ backgroundColor: accent }}
					>
						Back to {store.displayName}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
					<a
						href={`/store/${store.slug}`}
						className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
					>
						<ArrowLeft className="size-4" /> {store.displayName}
					</a>
					<span className="text-sm font-semibold text-ink-900">Checkout</span>
				</div>
			</header>

			<main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
				{notOrderable && (
					<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						This store isn&apos;t accepting orders right now.
					</div>
				)}
				{error && (
					<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{error}
					</div>
				)}
				{priced?.unavailable && priced.unavailable.length > 0 && (
					<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						Some items are no longer available and were left out of the total.
						Please review your cart.
					</div>
				)}

				<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
					{/* Delivery details */}
					<Form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="place" />
						<input type="hidden" name="items" value={itemsJson} />
						<input
							type="hidden"
							name="idempotencyKey"
							value={idemRef.current}
						/>
						<input
							type="text"
							name="company_website"
							tabIndex={-1}
							autoComplete="off"
							className="hidden"
							aria-hidden="true"
						/>

						<h2 className="text-lg font-bold text-ink-900">Delivery details</h2>
						<Field
							label="Full name"
							name="fullName"
							error={fieldErrors.fullName}
							autoComplete="name"
						/>
						<Field
							label="Mobile number"
							name="phone"
							error={fieldErrors.phone}
							inputMode="numeric"
							autoComplete="tel"
							placeholder="10-digit mobile"
						/>
						<Field
							label="Delivery address"
							name="addressLine1"
							error={fieldErrors.addressLine1}
							autoComplete="street-address"
						/>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Landmark (optional)" name="landmark" />
							<Field
								label="PIN code"
								name="pincode"
								error={fieldErrors.pincode}
								inputMode="numeric"
								placeholder="6-digit"
							/>
						</div>
						<Field
							label="Delivery instructions (optional)"
							name="instructions"
						/>

						<h2 className="pt-2 text-lg font-bold text-ink-900">Payment</h2>
						<div className="space-y-2">
							<PayOption
								value="cod"
								method={method}
								setMethod={setMethod}
								title="Cash on Delivery"
								desc="Pay the rider when your order arrives."
							/>
							{onlineAvailable ? (
								<PayOption
									value="online"
									method={method}
									setMethod={setMethod}
									title="Pay online"
									desc="Pay securely now via the store's payment provider."
								/>
							) : (
								<p className="text-xs text-ink-400">
									Online payment isn&apos;t enabled for this store yet.
								</p>
							)}
						</div>
						<input type="hidden" name="paymentMethod" value={method} />

						<button
							type="submit"
							disabled={notOrderable || !priced || !priced.totals.meetsMinimum}
							className="w-full rounded-xl py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
							style={{ backgroundColor: accent }}
						>
							{method === "cod" ? "Place order (COD)" : "Pay & place order"}
						</button>
						{priced && !priced.totals.meetsMinimum && (
							<p className="text-xs text-amber-700">
								Order is below the minimum of{" "}
								{formatInrMinor(store.minOrderPaise)}.
							</p>
						)}
					</Form>

					{/* Order summary */}
					<aside className="h-fit rounded-2xl border border-ink-100 bg-white p-4">
						<h2 className="font-semibold text-ink-900">Order summary</h2>
						<ul className="mt-3 space-y-2 text-sm">
							{cart.lines.map((l) => (
								<li key={l.productId} className="flex justify-between gap-2">
									<span className="text-ink-600">
										{l.name} × {l.quantity}
									</span>
									<span className="text-ink-900">
										{formatInrMinor(l.pricePaise * l.quantity)}
									</span>
								</li>
							))}
						</ul>
						<div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
							<Row
								label="Subtotal"
								value={
									priced ? formatInrMinor(priced.totals.subtotalPaise) : "…"
								}
							/>
							<Row
								label="Delivery"
								value={
									priced
										? priced.totals.freeDeliveryApplied
											? "FREE"
											: formatInrMinor(priced.totals.deliveryPaise)
										: "…"
								}
							/>
							<div className="flex justify-between pt-1 text-base font-bold text-ink-900">
								<span>Total</span>
								<span>
									{priced ? formatInrMinor(priced.totals.totalPaise) : "…"}
								</span>
							</div>
						</div>
						{(store.prepMinutes || store.deliveryMinutes) && (
							<p className="mt-3 text-xs text-ink-400">
								Estimated
								{store.prepMinutes ? ` prep ~${store.prepMinutes} min` : ""}
								{store.deliveryMinutes
									? `, delivery ~${store.deliveryMinutes} min`
									: ""}
								. Times are estimates, not guarantees.
							</p>
						)}
						{priceFetcher.state !== "idle" && (
							<p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-400">
								<Loader2 className="size-3 animate-spin" /> Updating total…
							</p>
						)}
					</aside>
				</div>
			</main>
		</div>
	);
}

interface PricedShape {
	lines: {
		productId: string;
		name: string;
		quantity: number;
		lineTotalPaise: number;
	}[];
	unavailable: { productId: string; requested: number }[];
	totals: {
		subtotalPaise: number;
		deliveryPaise: number;
		totalPaise: number;
		freeDeliveryApplied: boolean;
		meetsMinimum: boolean;
	};
}
interface OnlineShape {
	keyId?: string;
	razorpayOrderId?: string;
	amountPaise?: number;
	orderToken: string;
	slug: string;
	storeName: string;
}

function Field({
	label,
	name,
	error,
	...rest
}: {
	label: string;
	name: string;
	error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<div>
			<label
				htmlFor={name}
				className="mb-1 block text-sm font-medium text-ink-800"
			>
				{label}
			</label>
			<input
				id={name}
				name={name}
				aria-invalid={Boolean(error)}
				className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-500"
				{...rest}
			/>
			{error && <p className="mt-1 text-sm text-red-600">{error}</p>}
		</div>
	);
}

function PayOption({
	value,
	method,
	setMethod,
	title,
	desc,
}: {
	value: "cod" | "online";
	method: string;
	setMethod: (m: "cod" | "online") => void;
	title: string;
	desc: string;
}) {
	const active = method === value;
	return (
		<button
			type="button"
			onClick={() => setMethod(value)}
			className={
				"flex w-full items-start gap-3 rounded-xl border p-3 text-left " +
				(active ? "border-brand-500 bg-brand-50/50" : "border-ink-200")
			}
		>
			<span
				className={
					"mt-0.5 grid size-4 place-items-center rounded-full border " +
					(active ? "border-brand-600" : "border-ink-300")
				}
			>
				{active && <span className="size-2 rounded-full bg-brand-600" />}
			</span>
			<span>
				<span className="block text-sm font-semibold text-ink-900">
					{title}
				</span>
				<span className="block text-xs text-ink-500">{desc}</span>
			</span>
		</button>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-ink-600">
			<span>{label}</span>
			<span>{value}</span>
		</div>
	);
}

/** Load Razorpay Checkout and open it for an online order. */
async function openRazorpay(online: OnlineShape, clearCartFn: () => void) {
	if (typeof window === "undefined" || !online.keyId || !online.razorpayOrderId)
		return;
	await loadScript("https://checkout.razorpay.com/v1/checkout.js");
	// @ts-expect-error — Razorpay is injected by the external script.
	const Razorpay = window.Razorpay;
	if (!Razorpay) return;
	const rzp = new Razorpay({
		key: online.keyId,
		order_id: online.razorpayOrderId,
		amount: online.amountPaise,
		currency: "INR",
		name: online.storeName,
		handler: async (resp: {
			razorpay_order_id: string;
			razorpay_payment_id: string;
			razorpay_signature: string;
		}) => {
			const body = new FormData();
			body.set("razorpay_order_id", resp.razorpay_order_id);
			body.set("razorpay_payment_id", resp.razorpay_payment_id);
			body.set("razorpay_signature", resp.razorpay_signature);
			const r = await fetch("/api/payments/verify", { method: "POST", body });
			if (r.ok) {
				clearCartFn();
				window.location.href = `/store/${online.slug}/order/${online.orderToken}`;
			}
		},
	});
	rzp.open();
}

function loadScript(src: string): Promise<void> {
	return new Promise((resolve) => {
		if (document.querySelector(`script[src="${src}"]`)) return resolve();
		const s = document.createElement("script");
		s.src = src;
		s.onload = () => resolve();
		s.onerror = () => resolve();
		document.body.appendChild(s);
	});
}
