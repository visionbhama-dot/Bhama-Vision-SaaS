import { describe, it, expect } from "vitest";
import { createLead, generateReference } from "~/modules/leads/service.server";

const validLead = {
	name: "Asha Sharma",
	businessName: "Sharma Mega Mart",
	phone: "9876543210",
	email: "",
	city: "Jaipur",
	businessType: "supermarket" as const,
	productCount: 250,
	preferredPlan: "growth" as const,
	message: "",
	consent: true,
};

describe("lead service", () => {
	it("returns an honest not_configured result when Supabase is absent", async () => {
		const result = await createLead({}, validLead, {});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("not_configured");
	});

	it("generates a readable, unambiguous reference number", () => {
		const ref = generateReference(new Date(Date.UTC(2026, 0, 24)));
		expect(ref).toMatch(/^BV-260124-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
	});
});
