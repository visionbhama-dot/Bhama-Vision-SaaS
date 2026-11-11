import { describe, it, expect } from "vitest";
import {
	canTransition,
	nextStatuses,
	TERMINAL_STATUSES,
	isOrderStatus,
} from "~/modules/orders/status";

describe("order status machine", () => {
	it("allows the normal fulfilment path", () => {
		expect(canTransition("placed", "accepted")).toBe(true);
		expect(canTransition("accepted", "preparing")).toBe(true);
		expect(canTransition("preparing", "packed")).toBe(true);
		expect(canTransition("packed", "out_for_delivery")).toBe(true);
		expect(canTransition("out_for_delivery", "delivered")).toBe(true);
	});

	it("blocks invalid transitions (incl. reviving terminal orders)", () => {
		expect(canTransition("cancelled", "delivered")).toBe(false);
		expect(canTransition("delivered", "preparing")).toBe(false);
		expect(canTransition("placed", "delivered")).toBe(false); // can't skip steps
		expect(canTransition("rejected", "accepted")).toBe(false);
	});

	it("terminal states have no next transitions", () => {
		for (const s of TERMINAL_STATUSES) expect(nextStatuses(s)).toEqual([]);
	});

	it("validates status strings", () => {
		expect(isOrderStatus("preparing")).toBe(true);
		expect(isOrderStatus("teleported")).toBe(false);
	});
});
