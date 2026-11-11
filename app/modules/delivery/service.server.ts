import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "~/lib/supabase.server";
import { advanceStatus, type Result } from "~/modules/orders/service.server";

/**
 * Self-delivery for Starter merchants: lightweight rider records + manual
 * assignment. No rider app or GPS yet — the schema (delivery_partners /
 * delivery_assignments) already supports those for a later phase.
 *
 * Reads use the RLS client; assignment writes use the service role (the
 * assignment table has no RLS write policy) scoped to the verified tenant.
 */

export interface Rider {
	id: string;
	fullName: string;
	phone: string | null;
	status: string;
	isAvailable: boolean;
}

export async function listRiders(
	supabase: SupabaseClient,
	tenantId: string,
): Promise<Rider[]> {
	const { data } = await supabase
		.from("delivery_partners")
		.select("id, full_name, phone, status, is_available")
		.eq("tenant_id", tenantId)
		.order("created_at", { ascending: true });
	return (data ?? []).map((r) => ({
		id: r.id as string,
		fullName: r.full_name as string,
		phone: (r.phone as string | null) ?? null,
		status: r.status as string,
		isAvailable: Boolean(r.is_available),
	}));
}

export async function createRider(
	env: unknown,
	tenantId: string,
	fullName: string,
	phone: string,
): Promise<Result<{ id: string }>> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };
	const name = fullName.trim();
	if (name.length < 2) return { ok: false, error: "Enter the rider's name." };
	const { data, error } = await admin
		.from("delivery_partners")
		.insert({
			tenant_id: tenantId,
			full_name: name,
			phone: phone.trim() || null,
			status: "active",
			is_available: true,
		})
		.select("id")
		.maybeSingle();
	if (error || !data) return { ok: false, error: "Could not add the rider." };
	return { ok: true, id: data.id as string };
}

/** Assign a rider to an order (replaces any current active assignment). */
export async function assignRider(
	env: unknown,
	tenantId: string,
	orderId: string,
	riderId: string,
): Promise<Result> {
	const admin = getAdminClient(env);
	if (!admin) return { ok: false, error: "Not connected." };

	const [{ data: order }, { data: rider }] = await Promise.all([
		admin
			.from("orders")
			.select("id, status")
			.eq("tenant_id", tenantId)
			.eq("id", orderId)
			.maybeSingle(),
		admin
			.from("delivery_partners")
			.select("id")
			.eq("tenant_id", tenantId)
			.eq("id", riderId)
			.maybeSingle(),
	]);
	if (!order) return { ok: false, error: "Order not found." };
	if (!rider) return { ok: false, error: "Rider not found." };
	if (["delivered", "cancelled", "rejected"].includes(order.status as string)) {
		return { ok: false, error: "This order is already closed." };
	}

	// Close any existing active assignment, then create the new one.
	await admin
		.from("delivery_assignments")
		.update({ status: "cancelled" })
		.eq("tenant_id", tenantId)
		.eq("order_id", orderId)
		.in("status", ["offered", "accepted", "picked_up", "delivering"]);
	const { error } = await admin.from("delivery_assignments").insert({
		tenant_id: tenantId,
		order_id: orderId,
		rider_id: riderId,
		status: "accepted",
		accepted_at: new Date().toISOString(),
	});
	if (error) return { ok: false, error: "Could not assign the rider." };
	await admin.from("audit_logs").insert({
		tenant_id: tenantId,
		action: "delivery.assign",
		target_type: "order",
		target_id: orderId,
		detail: { rider_id: riderId },
	});
	return { ok: true };
}

/** Rider has picked up: order → out_for_delivery, assignment → picked_up. */
export async function markPickedUp(
	env: unknown,
	tenantId: string,
	actorId: string,
	orderId: string,
): Promise<Result> {
	const res = await advanceStatus(
		env,
		tenantId,
		actorId,
		orderId,
		"out_for_delivery",
		"Picked up for delivery",
	);
	if (!res.ok) return res;
	const admin = getAdminClient(env);
	if (admin) {
		await admin
			.from("delivery_assignments")
			.update({ status: "picked_up" })
			.eq("tenant_id", tenantId)
			.eq("order_id", orderId)
			.in("status", ["accepted", "offered"]);
	}
	return { ok: true };
}

/** Delivery completed: order → delivered, assignment → completed. */
export async function markDelivered(
	env: unknown,
	tenantId: string,
	actorId: string,
	orderId: string,
	note = "",
): Promise<Result> {
	const res = await advanceStatus(
		env,
		tenantId,
		actorId,
		orderId,
		"delivered",
		note || "Delivered",
	);
	if (!res.ok) return res;
	const admin = getAdminClient(env);
	if (admin) {
		await admin
			.from("delivery_assignments")
			.update({ status: "completed", completed_at: new Date().toISOString() })
			.eq("tenant_id", tenantId)
			.eq("order_id", orderId)
			.in("status", ["accepted", "picked_up", "delivering"]);
	}
	return { ok: true };
}

export interface DeliveryStats {
	riders: number;
	activeAssignments: number;
	completedToday: number;
}

export async function getDeliveryStats(
	supabase: SupabaseClient,
	tenantId: string,
): Promise<DeliveryStats> {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);
	const [ridersR, activeR, doneR] = await Promise.all([
		supabase
			.from("delivery_partners")
			.select("id", { count: "exact", head: true })
			.eq("tenant_id", tenantId),
		supabase
			.from("delivery_assignments")
			.select("id", { count: "exact", head: true })
			.eq("tenant_id", tenantId)
			.in("status", ["accepted", "picked_up", "delivering"]),
		supabase
			.from("delivery_assignments")
			.select("id", { count: "exact", head: true })
			.eq("tenant_id", tenantId)
			.eq("status", "completed")
			.gte("completed_at", startOfDay.toISOString()),
	]);
	return {
		riders: ridersR.count ?? 0,
		activeAssignments: activeR.count ?? 0,
		completedToday: doneR.count ?? 0,
	};
}
