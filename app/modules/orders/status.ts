/**
 * Order fulfilment state machine. Pure + unit-testable. Fulfilment status is
 * kept strictly separate from payment status (order_payments / payment_state):
 * a delivered order can still be payment-pending (COD not yet collected), and a
 * paid order can still be preparing.
 */

export const ORDER_STATUSES = [
	"placed",
	"accepted",
	"preparing",
	"packed",
	"out_for_delivery",
	"delivered",
	"cancelled",
	"rejected",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	placed: "New",
	accepted: "Accepted",
	preparing: "Preparing",
	packed: "Ready",
	out_for_delivery: "Out for delivery",
	delivered: "Delivered",
	cancelled: "Cancelled",
	rejected: "Rejected",
};

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	placed: ["accepted", "rejected", "cancelled"],
	accepted: ["preparing", "cancelled"],
	preparing: ["packed", "cancelled"],
	packed: ["out_for_delivery", "cancelled"],
	out_for_delivery: ["delivered", "cancelled"],
	delivered: [],
	cancelled: [],
	rejected: [],
};

export const TERMINAL_STATUSES: OrderStatus[] = [
	"delivered",
	"cancelled",
	"rejected",
];

export function isOrderStatus(v: string): v is OrderStatus {
	return (ORDER_STATUSES as readonly string[]).includes(v);
}

/** Whether a direct merchant-driven transition from → to is allowed. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
	return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The next statuses a merchant can move an order to from its current state. */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
	return TRANSITIONS[from] ?? [];
}
