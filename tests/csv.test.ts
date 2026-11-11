import { describe, it, expect } from "vitest";
import {
	buildCsv,
	matrixToRecords,
	parseCsv,
	sanitizeCell,
	templateCsv,
	MERCHANT_CSV_HEADERS,
} from "~/modules/products/csv";

describe("parseCsv", () => {
	it("parses simple rows", () => {
		expect(parseCsv("a,b,c\n1,2,3")).toEqual([
			["a", "b", "c"],
			["1", "2", "3"],
		]);
	});

	it("handles quoted fields with commas, quotes and newlines", () => {
		const csv = 'name,note\n"Toor, Dal","He said ""hi""\nnext line"';
		expect(parseCsv(csv)).toEqual([
			["name", "note"],
			["Toor, Dal", 'He said "hi"\nnext line'],
		]);
	});

	it("tolerates CRLF and a BOM", () => {
		expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	it("drops fully empty trailing rows", () => {
		expect(parseCsv("a\n\n")).toEqual([["a"]]);
	});
});

describe("CSV formula-injection safety", () => {
	it("prefixes dangerous leading characters", () => {
		expect(sanitizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
		expect(sanitizeCell("+1")).toBe("'+1");
		expect(sanitizeCell("-1")).toBe("'-1");
		expect(sanitizeCell("@x")).toBe("'@x");
		expect(sanitizeCell("safe")).toBe("safe");
	});

	it("buildCsv sanitizes and quotes cells", () => {
		const out = buildCsv(["a"], [["=1+1"], ["plain"]]);
		const lines = out.split("\r\n");
		expect(lines[1]).toBe("'=1+1");
		expect(lines[2]).toBe("plain");
	});
});

describe("matrixToRecords + template", () => {
	it("maps header row to records", () => {
		const { records, headers } = matrixToRecords([
			["Name", "Price"],
			["Toor Dal", "140"],
		]);
		expect(headers).toEqual(["name", "price"]);
		expect(records).toEqual([{ name: "Toor Dal", price: "140" }]);
	});

	it("template has the documented headers", () => {
		const first = templateCsv().split("\r\n")[0];
		expect(first).toBe(MERCHANT_CSV_HEADERS.join(","));
	});
});
