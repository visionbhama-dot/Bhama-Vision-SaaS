import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";
import { canTransition, isOrderStatus, type OrderStatus } from "./status";

/**
 * Merchant order operations.
 *
 * Reads use the merchant's RLS-scoped client (proves tenant isolation). Writes
 * that must touch append-only ledgers (status events, payments) use the
 * service-role client AFTER the route verified the user's membership, and are
 * always scoped `.eq("tenant_id", tenantId)`. Status changes are guarded by the
 * state machine AND an optimistic `WHERE status = <expected>` so invalid or
 * racing transitions cannot slip through.
 */

export type Result<T = object> =
	({ ok: true } & T) | { ok: false; error: string };

export interface OrderListItem {
	id: string;
	number: string;
	status: string;
	paymentMethod: string;
	paymentState: string;
	totalPaise: number;
	customerName: string | null;
	placedAt: string;
}

function customerName(addr: Record<string, unknown> | null): string | null {
	if (!addr) return null;
	return (addr.full_name as string) ?? null;
}

export async function listOrders(
	supabase: SupabaseClient,
	tenantId: string,
	opts: {
		status?: string;
		search?: string;
		page?: number;
		pageSize?: number;
	} = {},
): Promise<{
	items: OrderListItem[];
	total: number;
	page: number;
	pageSize: number;
}> {
	const page = Math.max(1, opts.page ?? 1);
	const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 20));
	let q = supabase
		.from("orders")
		.select(
			"id, number, status, payment_method, payment_state, total_paise, delivery_address, placed_at",
			{ count: "exact" },
		)
		.eq("tenant_id", tenantId);
	if (opts.status && opts.status !== "all" && isOrderStatus(opts.status))
		q = q.eq("status", opts.status);
	if (opts.search?.trim()) q = q.ilike("number", `%${opts.search.trim()}%`);
	q = q.order("placed_at", { ascending: false });
	const from = (page - 1) * pageSize;
	q = q.range(from, from + pageSize - 1);
	const { data, count } = await q;
	return {
		items: (data ?? []).map((o) => ({
			id: o.id as string,
			number: o.number as string,
			status: o.status as string,
			paymentMethod: o.payment_method as string,
			paymentState: o.payment_state as string,
			totalPaise: Number(o.total_paise),
			customerName: customerName(
				o.delivery_address as Record<string, unknown> | null,
			),
			placedAt: o.placed_at as string,
		})),
		total: count ?? 0,
		page,
		pageSize,
	};
}

export interface OrderDetail {
	id: string;
	number: string;
	status: string;
	paymentMethod: string;
	paymentState: string;
	subtotalPaise: number;
	deliveryPaise: number;
	totalPaise: number;
	placedAt: string;
	paidAt: string | null;
	deliveryAddress: Record<string, unknown> | null;
	items: {
		name: string;
		unit: string | null;
		quantity: number;
		pricePaise: number;
		lineTotalPaise: number;
	}[];
	events: { status: string; note: string | null; createdAt: string }[];
	assignment: {
		id: string;
		status: string;
		riderName: string | null;
		riderPhone: string | null;
	} | null;
}

export async function getOrder(
	supabase: SupabaseClient,
	tenantId: string,
	orderId: string,
): Promise<OrderDetail | null> {
	const { data: o } = await supabase
		.from("orders")
		.select(
			"id, number, status, payment_method, payment_state, subtotal_paise, delivery_paise, total_paise, placed_at, paid_at, delivery_address",
		)
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.maybeSingle();
	if (!o) return null;

	const [{ data: items }, { data: events }, { data: assignment }] =
		await Promise.all([
			supabase
				.from("order_items")
				.select(
					"name_snapshot, unit_snapshot, quantity, price_paise, line_total_paise",
				)
				.eq("order_id", orderId),
			supabase
				.from("order_status_events")
				.select("status, note, created_at")
				.eq("order_id", orderId)
				.order("created_at", { ascending: true }),
			supabase
				.from("delivery_assignments")
				.select("id, status, delivery_partners(full_name, phone)")
				.eq("order_id", orderId)
				.not("status", "in", "(cancelled,rejected)")
				.order("assigned_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
		]);

	const rider = assignment
		? ((Array.isArray(assignment.delivery_partners)
				? assignment.delivery_partners[0]
				: assignment.delivery_partners) as {
				full_name: string;
				phone: string | null;
			} | null)
		: null;

	return {
		id: o.id as string,
		number: o.number as string,
		status: o.status as string,
		paymentMethod: o.payment_method as string,
		paymentState: o.payment_state as string,
		subtotalPaise: Number(o.subtotal_paise),
		deliveryPaise: Number(o.delivery_paise),
		totalPaise: Number(o.total_paise),
		placedAt: o.placed_at as string,
		paidAt: (o.paid_at as string | null) ?? null,
		deliveryAddress:
			(o.delivery_address as Record<string, unknown> | null) ?? null,
		items: (items ?? []).map((i) => ({
			name: i.name_snapshot as string,
			unit: (i.unit_snapshot as string | null) ?? null,
			quantity: Number(i.quantity),
			pricePaise: Number(i.price_paise),
			lineTotalPaise: Number(i.line_total_paise),
		})),
		events: (events ?? []).map((e) => ({
			status: e.status as string,
			note: (e.note as string | null) ?? null,
			createdAt: e.created_at as string,
		})),
		assignment: assignment
			? {
					id: assignment.id as string,
					status: assignment.status as string,
					riderName: rider?.full_name ?? null,
					riderPhone: rider?.phone ?? null,
				}
			: null,
	};
}

export interface OrderStats {
	newCount: number;
	activeCount: number; // accepted..out_for_delivery
	deliveredToday: number;
	revenueTodayPaise: number;
}

export async function getOrderStats(
	supabase: SupabaseClient,
	tenantId: string,
): Promise<OrderStats> {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);
	const iso = startOfDay.toISOString();

	const base = () =>
		supabase
			.from("orders")
			.select("id", { count: "exact", head: true })
			.eq("tenant_id", tenantId);
	const [newR, activeR, deliveredR] = await Promise.all([
		base().eq("status", "placed"),
		base().in("status", [
			"accepted",
			"preparing",
			"packed",
			"out_for_delivery",
		]),
		base().eq("status", "delivered").gte("placed_at", iso),
	]);

	const { data: revRows } = await supabase
		.from("orders")
		.select("total_paise")
		.eq("tenant_id", tenantId)
		.eq("status", "delivered")
		.gte("placed_at", iso);
	const revenueTodayPaise = (revRows ?? []).reduce(
		(s, r) => s + Number(r.total_paise),
		0,
	);

	return {
		newCount: newR.count ?? 0,
		activeCount: activeR.count ?? 0,
		deliveredToday: deliveredR.count ?? 0,
		revenueTodayPaise,
	};
}

/** Append-only status event via the service role (ledger has no RLS write policy). */
async function recordEvent(
	env: unknown,
	tenantId: string,
	orderId: string,
	status: string,
	note: string,
	actor: string,
) {
	const admin = getAdminClient(env);
	if (!admin) return;
	await admin.from("order_status_events").insert({
		order_id: orderId,
		tenant_id: tenantId,
		status,
		note,
		created_by: actor,
	});
	await admin.from("audit_logs").insert({
		actor_id: actor,
		tenant_id: tenantId,
		action: `order.${status}`,
		target_type: "order",
		target_id: orderId,
	});
}

/** Move an order to the next fulfilment status (state-machine + optimistic guard). */
export async function advanceStatus(
	env: unknown,
	tenantId: string,
	actorId: string,
	orderId: string,
	to: OrderStatus,
	note = "",
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };
	const { data: current } = await admin
		.from("orders")
		.select("status")
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.maybeSingle();
	if (!current) return { ok: false, error: "Order not found." };
	const from = current.status as OrderStatus;
	if (from === to) return { ok: true };
	if (!canTransition(from, to))
		return {
			ok: false,
			error: `Cannot move an order from "${from}" to "${to}".`,
		};

	// Optimistic concurrency: only update if still in the expected state.
	const { data: updated } = await admin
		.from("orders")
		.update({ status: to })
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.eq("status", from)
		.select("id")
		.maybeSingle();
	if (!updated)
		return { ok: false, error: "The order changed status — please refresh." };

	await recordEvent(
		env,
		tenantId,
		orderId,
		to,
		note || `Moved to ${to}`,
		actorId,
	);
	return { ok: true };
}

/** Mark a COD order as paid upon collection (payment, NOT fulfilment). */
export async function markCodPaid(
	env: unknown,
	tenantId: string,
	actorId: string,
	orderId: string,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };
	const { data: o } = await admin
		.from("orders")
		.select("payment_method, payment_state")
		.eq("tenant_id", tenantId)
		.eq("id", orderId)
		.maybeSingle();
	if (!o) return { ok: false, error: "Order not found." };
	if (o.payment_method !== "cod")
		return { ok: false, error: "This is not a Cash on Delivery order." };
	if (o.payment_state === "paid") return { ok: true };

	await admin
		.from("orders")
		.update({ payment_state: "paid", paid_at: new Date().toISOString() })
		.eq("tenant_id", tenantId)
		.eq("id", orderId);
	await admin
		.from("order_payments")
		.update({ state: "paid" })
		.eq("tenant_id", tenantId)
		.eq("order_id", orderId);
	await admin.from("audit_logs").insert({
		actor_id: actorId,
		tenant_id: tenantId,
		action: "order.cod_paid",
		target_type: "order",
		target_id: orderId,
	});
	return { ok: true };
}

/** Cancel an order and restore stock (atomic via cancel_order()). */
export async function cancelOrder(
	env: unknown,
	tenantId: string,
	actorId: string,
	orderId: string,
	reason: string,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };
	const { error } = await admin.rpc("cancel_order", {
		p_order: orderId,
		p_tenant: tenantId,
		p_actor: actorId,
		p_reason: reason,
	});
	if (error) {
		if ((error.message ?? "").includes("order_not_cancellable"))
			return { ok: false, error: "This order can no longer be cancelled." };
		return { ok: false, error: "Could not cancel the order." };
	}
	return { ok: true };
}
