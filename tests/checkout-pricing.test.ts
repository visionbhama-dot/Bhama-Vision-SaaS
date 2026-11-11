import { describe, it, expect } from "vitest";
import {
	computeTotals,
	toLine,
	type PricedLine,
} from "~/modules/checkout/pricing";

const line = (price: number, qty: number): PricedLine =>
	toLine({ id: "p", name: "P", unit: null, pricePaise: price }, null, qty);

describe("computeTotals", () => {
	it("sums line totals and adds the delivery fee", () => {
		const t = computeTotals([line(10000, 2), line(5000, 1)], {
			minOrderPaise: 0,
			deliveryFeePaise: 3000,
			freeDeliveryThresholdPaise: null,
		});
		expect(t.subtotalPaise).toBe(25000);
		expect(t.deliveryPaise).toBe(3000);
		expect(t.totalPaise).toBe(28000);
	});

	it("waives delivery at/above the free threshold", () => {
		const t = computeTotals([line(50000, 1)], {
			minOrderPaise: 0,
			deliveryFeePaise: 3000,
			freeDeliveryThresholdPaise: 50000,
		});
		expect(t.freeDeliveryApplied).toBe(true);
		expect(t.deliveryPaise).toBe(0);
		expect(t.totalPaise).toBe(50000);
	});

	it("charges no delivery on an empty cart", () => {
		const t = computeTotals([], {
			minOrderPaise: 0,
			deliveryFeePaise: 3000,
			freeDeliveryThresholdPaise: null,
		});
		expect(t.subtotalPaise).toBe(0);
		expect(t.deliveryPaise).toBe(0);
	});

	it("flags when below the minimum order", () => {
		const t = computeTotals([line(9900, 1)], {
			minOrderPaise: 15000,
			deliveryFeePaise: 0,
			freeDeliveryThresholdPaise: null,
		});
		expect(t.meetsMinimum).toBe(false);
		expect(
			computeTotals([line(20000, 1)], {
				minOrderPaise: 15000,
				deliveryFeePaise: 0,
				freeDeliveryThresholdPaise: null,
			}).meetsMinimum,
		).toBe(true);
	});
});
