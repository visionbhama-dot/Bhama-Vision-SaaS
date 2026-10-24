import { describe, it, expect } from "vitest";
import { PLANS, planHas } from "~/modules/marketing/data/plans";
import { formatInrMinor } from "~/lib/utils";

describe("subscription plans / entitlements", () => {
	it("defines the three public plans in order", () => {
		expect(PLANS.map((p) => p.slug)).toEqual([
			"starter",
			"growth",
			"marketplace",
		]);
	});

	it("gates delivery tracking to Growth and above (not Starter)", () => {
		const starter = PLANS.find((p) => p.slug === "starter")!;
		const growth = PLANS.find((p) => p.slug === "growth")!;
		const marketplace = PLANS.find((p) => p.slug === "marketplace")!;
		expect(planHas(starter, "live_location_tracking")).toBe(false);
		expect(planHas(growth, "live_location_tracking")).toBe(true);
		expect(planHas(marketplace, "live_location_tracking")).toBe(true);
	});

	it("gates marketplace features to the Marketplace plan only", () => {
		expect(
			PLANS.filter((p) => planHas(p, "marketplace")).map((p) => p.slug),
		).toEqual(["marketplace"]);
	});

	it("stores prices as integer paise", () => {
		for (const p of PLANS) {
			expect(Number.isInteger(p.monthlyPaise)).toBe(true);
			expect(Number.isInteger(p.annualPaise)).toBe(true);
		}
	});

	it("formats paise into INR currency", () => {
		expect(formatInrMinor(149900)).toBe("₹1,499");
	});
});
