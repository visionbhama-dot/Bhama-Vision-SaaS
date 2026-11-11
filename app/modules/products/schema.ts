import { z } from "zod";

/** Max items a single bulk action / import batch may touch (safety bound). */
export const BULK_LIMIT = 500;

/** Supported bulk actions on the merchant product list. */
export const BULK_ACTIONS = [
	"price",
	"stock",
	"category",
	"publish",
	"unpublish",
	"archive",
	"restore",
] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Destructive actions that need an explicit confirmation in the UI. */
export const DESTRUCTIVE_ACTIONS: BulkAction[] = ["archive"];

/**
 * One CSV import row. Coerces the loose string cells into typed values and
 * reports friendly, row-level errors. `price` is required (a product needs a
 * price to be meaningful); everything else is optional.
 */
export const csvRowSchema = z.object({
	name: z.string().trim().min(2, "Name is required (min 2 chars)").max(160),
	unit: z.string().trim().max(40).optional().or(z.literal("")),
	price: z.coerce
		.number({ message: "Price must be a number" })
		.min(0, "Price must be 0 or more")
		.max(1_000_000),
	mrp: z.coerce
		.number({ message: "MRP must be a number" })
		.min(0)
		.max(1_000_000)
		.optional(),
	sku: z.string().trim().max(60).optional().or(z.literal("")),
	barcode: z.string().trim().max(60).optional().or(z.literal("")),
	category: z.string().trim().max(120).optional().or(z.literal("")),
	description: z.string().trim().max(2000).optional().or(z.literal("")),
	stock: z.coerce
		.number({ message: "Stock must be a whole number" })
		.int("Stock must be a whole number")
		.min(0)
		.max(10_000_000)
		.optional(),
	visible: z
		.union([z.literal("true"), z.literal("false"), z.literal("")])
		.optional(),
});
export type CsvRow = z.infer<typeof csvRowSchema>;

export interface CsvRowResult {
	line: number; // 1-based data row (excludes header)
	ok: boolean;
	errors: string[];
	data?: CsvRow;
	dedupeKey: string;
}

/** Stable dedupe key for a product row: SKU if present, else normalized name. */
export function dedupeKey(rec: { sku?: string; name: string }): string {
	const sku = (rec.sku ?? "").trim().toLowerCase();
	if (sku) return `sku:${sku}`;
	return `name:${rec.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Validate parsed CSV records. Returns per-row results with 1-based line
 * numbers (matching what a merchant sees in a spreadsheet, header = line 1), and
 * flags in-file duplicate rows.
 */
export function validateCsvRecords(
	records: Record<string, string>[],
): CsvRowResult[] {
	const seen = new Set<string>();
	return records.map((rec, i): CsvRowResult => {
		const parsed = csvRowSchema.safeParse(rec);
		if (!parsed.success) {
			return {
				line: i + 2,
				ok: false,
				errors: parsed.error.issues.map(
					(iss) => `${String(iss.path[0] ?? "row")}: ${iss.message}`,
				),
				dedupeKey: "",
			};
		}
		const key = dedupeKey(parsed.data);
		if (seen.has(key)) {
			return {
				line: i + 2,
				ok: false,
				errors: ["Duplicate row in file (same SKU/name)"],
				data: parsed.data,
				dedupeKey: key,
			};
		}
		seen.add(key);
		return {
			line: i + 2,
			ok: true,
			errors: [],
			data: parsed.data,
			dedupeKey: key,
		};
	});
}
