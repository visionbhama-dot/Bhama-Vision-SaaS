import { describe, it, expect } from "vitest";
import {
	BULK_LIMIT,
	dedupeKey,
	validateCsvRecords,
} from "~/modules/products/schema";

describe("dedupeKey", () => {
	it("prefers SKU, falls back to normalized name", () => {
		expect(dedupeKey({ sku: "ABC", name: "X" })).toBe("sku:abc");
		expect(dedupeKey({ name: "  Toor   Dal " })).toBe("name:toor dal");
	});
});

describe("validateCsvRecords", () => {
	it("accepts a valid row and assigns a 1-based data line", () => {
		const res = validateCsvRecords([{ name: "Toor Dal", price: "140" }]);
		expect(res[0].ok).toBe(true);
		expect(res[0].line).toBe(2); // header is line 1
	});

	it("reports field errors for bad data", () => {
		const res = validateCsvRecords([{ name: "A", price: "abc" }]);
		expect(res[0].ok).toBe(false);
		expect(res[0].errors.join(" ")).toMatch(/name|price/i);
	});

	it("flags in-file duplicates (same SKU)", () => {
		const res = validateCsvRecords([
			{ name: "Toor Dal", price: "140", sku: "T1" },
			{ name: "Toor Dal 1kg", price: "150", sku: "T1" },
		]);
		expect(res[0].ok).toBe(true);
		expect(res[1].ok).toBe(false);
		expect(res[1].errors.join(" ")).toMatch(/duplicate/i);
	});

	it("requires a price", () => {
		const res = validateCsvRecords([{ name: "No Price" }]);
		expect(res[0].ok).toBe(false);
	});

	it("exposes a safe bulk limit", () => {
		expect(BULK_LIMIT).toBeGreaterThan(0);
		expect(BULK_LIMIT).toBeLessThanOrEqual(1000);
	});
});
