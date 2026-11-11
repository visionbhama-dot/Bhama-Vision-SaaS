import { getAdminClient } from "~/lib/supabase.server";
import { computeTotals, toLine, type PricedLine, type Totals } from "./pricing";
import type { CartItemInput, CheckoutInput } from "./schema";

/**
 * Customer checkout (server-authoritative).
 *
 * Checkout runs through the service-role client because a guest customer has no
 * authenticated session and the orders table has no anon INSERT policy by
 * design. Safety comes from the server recomputing EVERYTHING from the database
 * (prices, availability, totals) and from the atomic place_order() function,
 * which enforces stock, store-active, accepting-orders and medicine rules under
 * row locks. A browser can only influence product ids + quantities.
 */

export interface CheckoutStore {
	id: string;
	tenantId: string;
	slug: string;
	displayName: string;
	status: string;
	category: string;
	medicineOrderingEnabled: boolean;
	acceptingOrders: boolean;
	currency: string;
	brandColor: string | null;
	logoUrl: string | null;
	minOrderPaise: number;
	deliveryFeePaise: number;
	freeDeliveryThresholdPaise: number | null;
	prepMinutes: number | null;
	deliveryMinutes: number | null;
	serviceablePincodes: string[];
}

const STORE_COLS =
	"id, tenant_id, slug, display_name, status, category, medicine_ordering_enabled, accepting_orders, currency, theme, logo_url, min_order_paise, delivery_fee_paise, free_delivery_threshold_paise, prep_minutes, delivery_minutes, serviceable_pincodes";

export async function getCheckoutStore(
	env: unknown,
	slug: string,
): Promise<CheckoutStore | null> {
	const admin = getAdminClient(env);
	if (!admin) return null;
	const { data } = await admin
		.from("stores")
		.select(STORE_COLS)
		.eq("slug", slug.trim().toLowerCase())
		.maybeSingle();
	if (!data) return null;
	const theme = (data.theme ?? {}) as { brandColor?: string };
	return {
		id: data.id,
		tenantId: data.tenant_id,
		slug: data.slug,
		displayName: data.display_name,
		status: data.status,
		category: data.category ?? "general",
		medicineOrderingEnabled: Boolean(data.medicine_ordering_enabled),
		acceptingOrders: Boolean(data.accepting_orders),
		currency: data.currency ?? "INR",
		brandColor: typeof theme.brandColor === "string" ? theme.brandColor : null,
		logoUrl: data.logo_url ?? null,
		minOrderPaise: Number(data.min_order_paise ?? 0),
		deliveryFeePaise: Number(data.delivery_fee_paise ?? 0),
		freeDeliveryThresholdPaise:
			data.free_delivery_threshold_paise == null
				? null
				: Number(data.free_delivery_threshold_paise),
		prepMinutes: data.prep_minutes == null ? null : Number(data.prep_minutes),
		deliveryMinutes:
			data.delivery_minutes == null ? null : Number(data.delivery_minutes),
		serviceablePincodes: (data.serviceable_pincodes as string[]) ?? [],
	};
}

export interface PricedCart {
	lines: PricedLine[];
	unavailable: { productId: string; requested: number }[];
	totals: Totals;
}

/** Recompute a cart from live product data. Unavailable items are reported. */
export async function priceCart(
	env: unknown,
	store: CheckoutStore,
	items: CartItemInput[],
): Promise<PricedCart> {
	const settings = {
		minOrderPaise: store.minOrderPaise,
		deliveryFeePaise: store.deliveryFeePaise,
		freeDeliveryThresholdPaise: store.freeDeliveryThresholdPaise,
	};
	const admin = getAdminClient(env);
	if (!admin || items.length === 0) {
		return { lines: [], unavailable: [], totals: computeTotals([], settings) };
	}

	// Collapse duplicate (product, variant) lines and clamp quantities.
	const merged = new Map<string, CartItemInput>();
	for (const it of items) {
		const key = `${it.productId}:${it.variantId ?? ""}`;
		const prev = merged.get(key);
		const quantity = Math.min(
			99,
			(prev?.quantity ?? 0) + Math.max(1, it.quantity),
		);
		merged.set(key, {
			productId: it.productId,
			variantId: it.variantId ?? null,
			quantity,
		});
	}
	const wanted = [...merged.values()];
	const ids = [...new Set(wanted.map((w) => w.productId))];

	const { data: products } = await admin
		.from("products")
		.select("id, name, unit, price_paise")
		.eq("tenant_id", store.tenantId)
		.eq("status", "published")
		.eq("is_visible", true)
		.is("archived_at", null)
		.in("id", ids);
	const byId = new Map((products ?? []).map((p) => [p.id as string, p]));

	const lines: PricedLine[] = [];
	const unavailable: { productId: string; requested: number }[] = [];
	for (const w of wanted) {
		const p = byId.get(w.productId);
		if (!p) {
			unavailable.push({ productId: w.productId, requested: w.quantity });
			continue;
		}
		lines.push(
			toLine(
				{
					id: p.id as string,
					name: p.name as string,
					unit: (p.unit as string | null) ?? null,
					pricePaise: Number(p.price_paise),
				},
				w.variantId ?? null,
				w.quantity,
			),
		);
	}
	return { lines, unavailable, totals: computeTotals(lines, settings) };
}

export type PlaceResult =
	| {
			ok: true;
			orderId: string;
			orderNumber: string;
			publicToken: string;
			totalPaise: number;
			created: boolean;
	  }
	| { ok: false; error: string; code?: string };

const ERROR_MESSAGES: Record<string, string> = {
	store_not_found: "This store could not be found.",
	store_not_active: "This store isn't open for orders yet.",
	not_accepting_orders: "This store is not accepting orders right now.",
	medicine_ordering_disabled: "This store cannot take orders online yet.",
	empty_cart: "Your cart is empty.",
	invalid_quantity: "One of the items had an invalid quantity.",
	product_not_found: "An item in your cart is no longer available.",
	product_unavailable: "An item in your cart is no longer available.",
	insufficient_stock: "An item in your cart just went out of stock.",
};

function mapRpcError(message: string): { error: string; code: string } {
	const code = message.split(":")[0].trim();
	const name = message.includes(":")
		? message.split(":").slice(1).join(":").trim()
		: "";
	if (code === "insufficient_stock")
		return {
			error: `"${name}" just went out of stock. Please adjust your cart.`,
			code,
		};
	if (code === "product_unavailable")
		return {
			error: `"${name}" is no longer available. Please remove it.`,
			code,
		};
	return {
		error:
			ERROR_MESSAGES[code] ?? "We couldn't place your order. Please try again.",
		code,
	};
}

/**
 * Validate (server-side) then place an order atomically via place_order().
 * Used for COD directly; online orders are created the same way (payment stays
 * pending) and then handed to the provider.
 */
export async function placeOrder(
	env: unknown,
	store: CheckoutStore,
	input: CheckoutInput,
	items: CartItemInput[],
): Promise<PlaceResult> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Ordering is not connected yet." };

	if (store.status !== "active")
		return {
			ok: false,
			error: ERROR_MESSAGES.store_not_active,
			code: "store_not_active",
		};
	if (!store.acceptingOrders)
		return {
			ok: false,
			error: ERROR_MESSAGES.not_accepting_orders,
			code: "not_accepting_orders",
		};
	if (store.category === "pharmacy" && !store.medicineOrderingEnabled) {
		return {
			ok: false,
			error: ERROR_MESSAGES.medicine_ordering_disabled,
			code: "medicine_ordering_disabled",
		};
	}

	const priced = await priceCart(env, store, items);
	if (priced.unavailable.length > 0) {
		return {
			ok: false,
			error: "Some items are no longer available. Please review your cart.",
			code: "unavailable",
		};
	}
	if (priced.lines.length === 0)
		return { ok: false, error: ERROR_MESSAGES.empty_cart, code: "empty_cart" };
	if (!priced.totals.meetsMinimum) {
		return {
			ok: false,
			error: "Your order is below this store's minimum order value.",
			code: "below_minimum",
		};
	}
	if (
		store.serviceablePincodes.length > 0 &&
		!store.serviceablePincodes.includes(input.pincode)
	) {
		return {
			ok: false,
			error: "This store does not deliver to your PIN code yet.",
			code: "pincode",
		};
	}

	const { data, error } = await admin.rpc("place_order", {
		p_tenant: store.tenantId,
		p_idempotency: input.idempotencyKey,
		p_payment_method: input.paymentMethod,
		p_customer: { full_name: input.fullName, phone: input.phone },
		p_address: {
			line1: input.addressLine1,
			landmark: input.landmark || null,
			city: input.city || null,
			pincode: input.pincode,
			instructions: input.instructions || null,
		},
		p_items: priced.lines.map((l) => ({
			product_id: l.productId,
			variant_id: l.variantId,
			quantity: l.quantity,
		})),
		p_delivery_paise: priced.totals.deliveryPaise,
		p_notes: input.instructions || null,
	});

	if (error) return { ok: false, ...mapRpcError(error.message ?? "") };
	const row = Array.isArray(data) ? data[0] : data;
	if (!row)
		return {
			ok: false,
			error: "We couldn't place your order. Please try again.",
		};
	return {
		ok: true,
		orderId: row.order_id,
		orderNumber: row.order_number,
		publicToken: row.public_token,
		totalPaise: Number(row.total_paise),
		created: Boolean(row.created),
	};
}

export interface TrackedOrder {
	number: string;
	status: string;
	paymentMethod: string;
	paymentState: string;
	subtotalPaise: number;
	deliveryPaise: number;
	totalPaise: number;
	placedAt: string;
	storeName: string;
	items: {
		name: string;
		unit: string | null;
		quantity: number;
		lineTotalPaise: number;
	}[];
	deliveryAddress: Record<string, unknown> | null;
}

/** Fetch an order for the customer confirmation / tracking page by token. */
export async function getOrderByToken(
	env: unknown,
	token: string,
): Promise<TrackedOrder | null> {
	const admin = getAdminClient(env);
	if (!admin) return null;
	const { data: order } = await admin
		.from("orders")
		.select(
			"id, number, status, payment_method, payment_state, subtotal_paise, delivery_paise, total_paise, placed_at, delivery_address, tenant_id, stores:tenant_id(display_name)",
		)
		.eq("public_token", token)
		.maybeSingle();
	if (!order) return null;

	const { data: items } = await admin
		.from("order_items")
		.select("name_snapshot, unit_snapshot, quantity, line_total_paise")
		.eq("order_id", order.id);

	const { data: store } = await admin
		.from("stores")
		.select("display_name")
		.eq("tenant_id", order.tenant_id)
		.maybeSingle();

	return {
		number: order.number,
		status: order.status,
		paymentMethod: order.payment_method,
		paymentState: order.payment_state,
		subtotalPaise: Number(order.subtotal_paise),
		deliveryPaise: Number(order.delivery_paise),
		totalPaise: Number(order.total_paise),
		placedAt: order.placed_at,
		storeName: (store?.display_name as string) ?? "Store",
		items: (items ?? []).map((i) => ({
			name: i.name_snapshot as string,
			unit: (i.unit_snapshot as string | null) ?? null,
			quantity: Number(i.quantity),
			lineTotalPaise: Number(i.line_total_paise),
		})),
		deliveryAddress:
			(order.delivery_address as Record<string, unknown> | null) ?? null,
	};
}
