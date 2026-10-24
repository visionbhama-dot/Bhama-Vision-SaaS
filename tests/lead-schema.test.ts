import { describe, it, expect } from "vitest";
import { leadSchema } from "~/modules/leads/schema";

const base = {
	name: "Asha Sharma",
	businessName: "Sharma Mega Mart",
	city: "Jaipur",
	businessType: "supermarket",
	preferredPlan: "growth",
	consent: true,
};

describe("lead schema", () => {
	it("accepts a valid lead with a phone number", () => {
		const r = leadSchema.safeParse({ ...base, phone: "+91 9876543210" });
		expect(r.success).toBe(true);
	});

	it("accepts a valid lead with only an email", () => {
		const r = leadSchema.safeParse({ ...base, email: "asha@example.com" });
		expect(r.success).toBe(true);
	});

	it("rejects when neither phone nor email is provided", () => {
		const r = leadSchema.safeParse({ ...base });
		expect(r.success).toBe(false);
	});

	it("requires consent", () => {
		const r = leadSchema.safeParse({
			...base,
			phone: "9876543210",
			consent: false,
		});
		expect(r.success).toBe(false);
	});

	it("rejects an unknown business type", () => {
		const r = leadSchema.safeParse({
			...base,
			businessType: "casino",
			phone: "9876543210",
		});
		expect(r.success).toBe(false);
	});

	it("coerces productCount to a number", () => {
		const r = leadSchema.safeParse({
			...base,
			phone: "9876543210",
			productCount: "250",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.productCount).toBe(250);
	});
});
