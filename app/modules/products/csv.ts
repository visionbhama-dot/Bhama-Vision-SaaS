/**
 * CSV helpers for merchant product import/export. Pure + dependency-free so they
 * are fully unit-testable and run anywhere.
 *
 * Security:
 *  - Export is hardened against CSV formula injection: any cell starting with
 *    = + - @ (or a leading control char) is prefixed so spreadsheet apps don't
 *    execute it. See sanitizeCell.
 *  - The parser is a small state machine (RFC-4180-ish): it never evaluates
 *    content, handles quoted fields, embedded commas/newlines and escaped
 *    quotes, and tolerates CRLF.
 */

export const MERCHANT_CSV_HEADERS = [
	"name",
	"unit",
	"price",
	"mrp",
	"sku",
	"barcode",
	"category",
	"description",
	"stock",
	"visible",
] as const;

export type MerchantCsvHeader = (typeof MERCHANT_CSV_HEADERS)[number];

/** Parse CSV text into a matrix of string cells. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;
	// Strip a leading UTF-8 BOM if present.
	const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inQuotes) {
			if (c === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
			continue;
		}
		if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (c === "\r") {
			// swallow; handle \r\n and lone \r as line breaks
			if (s[i + 1] !== "\n") {
				row.push(field);
				rows.push(row);
				row = [];
				field = "";
			}
		} else {
			field += c;
		}
	}
	// Flush trailing field/row unless the input ended exactly on a newline.
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	// Drop fully empty trailing rows.
	return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Prefix cells that could be interpreted as a spreadsheet formula. */
export function sanitizeCell(value: string): string {
	if (value.length > 0 && /^[=+\-@\t\r]/.test(value)) {
		return `'${value}`;
	}
	return value;
}

/** Quote a cell for CSV output when needed, after formula-sanitizing it. */
function encodeCell(value: string): string {
	const safe = sanitizeCell(value);
	if (/[",\n\r]/.test(safe)) {
		return `"${safe.replace(/"/g, '""')}"`;
	}
	return safe;
}

/** Build a CSV string from a header + rows (all formula-safe + quoted). */
export function buildCsv(headers: readonly string[], rows: string[][]): string {
	const out: string[] = [];
	out.push(headers.map((h) => encodeCell(h)).join(","));
	for (const r of rows) out.push(r.map((c) => encodeCell(c ?? "")).join(","));
	return out.join("\r\n");
}

/** Map a parsed matrix (with a header row) into header→value records. */
export function matrixToRecords(matrix: string[][]): {
	records: Record<string, string>[];
	headers: string[];
} {
	if (matrix.length === 0) return { records: [], headers: [] };
	const headers = matrix[0].map((h) => h.trim().toLowerCase());
	const records: Record<string, string>[] = [];
	for (let i = 1; i < matrix.length; i++) {
		const rec: Record<string, string> = {};
		headers.forEach((h, idx) => {
			rec[h] = (matrix[i][idx] ?? "").trim();
		});
		records.push(rec);
	}
	return { records, headers };
}

/** A blank template merchants can download, with one illustrative example row. */
export function templateCsv(): string {
	return buildCsv(MERCHANT_CSV_HEADERS, [
		[
			"Toor Dal",
			"1 kg",
			"140",
			"160",
			"SKU-TOOR-1KG",
			"",
			"Pulses & Dals",
			"Unpolished toor dal",
			"25",
			"true",
		],
	]);
}
