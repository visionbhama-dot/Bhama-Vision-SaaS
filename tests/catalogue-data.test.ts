import { describe, it, expect } from "vitest";
import { PACKS, expandMasterRows } from "../db/seed/catalogue-data.mjs";

const rows = expandMasterRows();

describe("master catalogue seed data integrity", () => {
	it("has the five required packs", () => {
		const slugs = PACKS.map((p) => p.slug);
		expect(slugs).toEqual([
			"grocery-essentials",
			"snacks-and-beverages",
			"sweets-and-bakery",
			"personal-care",
			"household-cleaning",
		]);
	});

	it("expands to a useful number of products", () => {
		expect(rows.length).toBeGreaterThanOrEqual(200);
	});

	it("gives every product a unique stable code", () => {
		const codes = rows.map((r) => r.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("contains no medicines (pharmacy items are excluded)", () => {
		const banned =
			/\b(tablet|capsule|syrup|medicine|antibiotic|paracetamol|pharma)\b/i;
		for (const r of rows) {
			expect(banned.test(r.name)).toBe(false);
			expect(banned.test(r.subcategory)).toBe(false);
		}
	});

	it("every row has a pack size and belongs to a known pack", () => {
		const packSlugs = new Set(PACKS.map((p) => p.slug));
		for (const r of rows) {
			expect(r.packSize.length).toBeGreaterThan(0);
			expect(packSlugs.has(r.packSlug)).toBe(true);
		}
	});
});
