import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCsv, MERCHANT_CSV_HEADERS } from "./csv";
import { BULK_LIMIT, type BulkAction, type CsvRow } from "./schema";

/**
 * Merchant product management: listing (search/filter/sort/paginate), stats,
 * bulk operations, and CSV import/export.
 *
 * Every call takes the merchant's RLS-scoped Supabase client plus the tenantId
 * from their verified membership, and scopes every query with
 * `.eq("tenant_id", tenantId)`. RLS independently blocks cross-tenant access, so
 * a tampered id cannot leak or mutate another store's data.
 */

function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "item"
	);
}
function rand(n = 4): string {
	return Math.random()
		.toString(36)
		.slice(2, 2 + n);
}
const toPaise = (rupees: number) => Math.round(rupees * 100);

export type ProductStatusFilter = "all" | "published" | "draft" | "archived";
export type StockFilter = "all" | "out" | "low";
export type ProductSort = "recent" | "name" | "price_asc" | "price_desc";

export interface ProductListItem {
	id: string;
	name: string;
	unit: string | null;
	category: string | null;
	pricePaise: number;
	mrpPaise: number | null;
	status: string;
	isVisible: boolean;
	source: string;
	archived: boolean;
	stock: number | null; // null = not tracked
}

export interface ProductListResult {
	items: ProductListItem[];
	total: number;
	page: number;
	pageSize: number;
}

export interface ListOptions {
	search?: string;
	status?: ProductStatusFilter;
	stock?: StockFilter;
	sort?: ProductSort;
	page?: number;
	pageSize?: number;
}

/** Fetch product-level (variant-null) on-hand stock for a set of product ids. */
async function stockMap(
	supabase: SupabaseClient,
	tenantId: string,
	productIds: string[],
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (productIds.length === 0) return map;
	const { data } = await supabase
		.from("inventory_levels")
		.select("product_id, on_hand")
		.eq("tenant_id", tenantId)
		.is("variant_id", null)
		.in("product_id", productIds);
	for (const r of data ?? [])
		map.set(r.product_id as string, Number(r.on_hand));
	return map;
}

export async function listProducts(
	supabase: SupabaseClient,
	tenantId: string,
	opts: ListOptions = {},
): Promise<ProductListResult> {
	const page = Math.max(1, opts.page ?? 1);
	const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 20));
	const status = opts.status ?? "all";
	const stock = opts.stock ?? "all";

	// Stock filters resolve to a product-id set first (bounded).
	let stockIds: string[] | null = null;
	if (stock !== "all") {
		const { data } = await supabase
			.from("inventory_levels")
			.select("product_id, on_hand, low_stock_at")
			.eq("tenant_id", tenantId)
			.is("variant_id", null)
			.limit(5000);
		stockIds = (data ?? [])
			.filter((r) =>
				stock === "out"
					? Number(r.on_hand) <= 0
					: Number(r.on_hand) > 0 &&
						Number(r.on_hand) <= Number(r.low_stock_at),
			)
			.map((r) => r.product_id as string);
		if (stockIds.length === 0) return { items: [], total: 0, page, pageSize };
	}

	let query = supabase
		.from("products")
		.select(
			"id, name, unit, category, price_paise, mrp_paise, status, is_visible, source, archived_at",
			{
				count: "exact",
			},
		)
		.eq("tenant_id", tenantId);

	if (status === "archived") query = query.not("archived_at", "is", null);
	else query = query.is("archived_at", null);
	if (status === "published")
		query = query.eq("status", "published").eq("is_visible", true);
	if (status === "draft") query = query.eq("status", "draft");

	if (opts.search?.trim())
		query = query.ilike("name", `%${opts.search.trim()}%`);
	if (stockIds) query = query.in("id", stockIds);

	switch (opts.sort ?? "recent") {
		case "name":
			query = query.order("name", { ascending: true });
			break;
		case "price_asc":
			query = query.order("price_paise", { ascending: true });
			break;
		case "price_desc":
			query = query.order("price_paise", { ascending: false });
			break;
		default:
			query = query.order("created_at", { ascending: false });
	}

	const from = (page - 1) * pageSize;
	query = query.range(from, from + pageSize - 1);

	const { data, count } = await query;
	const rows = data ?? [];
	const sm = await stockMap(
		supabase,
		tenantId,
		rows.map((r) => r.id as string),
	);

	const items: ProductListItem[] = rows.map((r) => ({
		id: r.id as string,
		name: r.name as string,
		unit: (r.unit as string | null) ?? null,
		category: (r.category as string | null) ?? null,
		pricePaise: Number(r.price_paise ?? 0),
		mrpPaise: r.mrp_paise == null ? null : Number(r.mrp_paise),
		status: r.status as string,
		isVisible: Boolean(r.is_visible),
		source: (r.source as string) ?? "manual",
		archived: r.archived_at != null,
		stock: sm.has(r.id as string) ? (sm.get(r.id as string) as number) : null,
	}));

	return { items, total: count ?? items.length, page, pageSize };
}

export interface ProductStats {
	total: number;
	published: number;
	drafts: number;
	outOfStock: number;
	lowStock: number;
}

export async function getProductStats(
	supabase: SupabaseClient,
	tenantId: string,
): Promise<ProductStats> {
	const base = () =>
		supabase
			.from("products")
			.select("id", { count: "exact", head: true })
			.eq("tenant_id", tenantId)
			.is("archived_at", null);

	const [totalR, pubR, draftR] = await Promise.all([
		base(),
		base().eq("status", "published").eq("is_visible", true),
		base().eq("status", "draft"),
	]);

	const { data: inv } = await supabase
		.from("inventory_levels")
		.select("on_hand, low_stock_at")
		.eq("tenant_id", tenantId)
		.is("variant_id", null)
		.limit(10000);
	let outOfStock = 0;
	let lowStock = 0;
	for (const r of inv ?? []) {
		const h = Number(r.on_hand);
		if (h <= 0) outOfStock++;
		else if (h <= Number(r.low_stock_at)) lowStock++;
	}

	return {
		total: totalR.count ?? 0,
		published: pubR.count ?? 0,
		drafts: draftR.count ?? 0,
		outOfStock,
		lowStock,
	};
}

export interface BulkResult {
	ok: boolean;
	affected: number;
	error?: string;
}

/** Set product-level stock (variant-null) for a set of products: one row each. */
async function setStock(
	supabase: SupabaseClient,
	tenantId: string,
	ids: string[],
	onHand: number,
): Promise<void> {
	// Replace any existing product-level rows to guarantee a single row each.
	await supabase
		.from("inventory_levels")
		.delete()
		.eq("tenant_id", tenantId)
		.is("variant_id", null)
		.in("product_id", ids);
	const rows = ids.map((pid) => ({
		tenant_id: tenantId,
		product_id: pid,
		variant_id: null,
		on_hand: onHand,
		reserved: 0,
	}));
	for (let i = 0; i < rows.length; i += 100) {
		await supabase.from("inventory_levels").insert(rows.slice(i, i + 100));
	}
}

export async function bulkAction(
	supabase: SupabaseClient,
	tenantId: string,
	action: BulkAction,
	ids: string[],
	value?: string,
): Promise<BulkResult> {
	const unique = [...new Set(ids)].filter(Boolean);
	if (unique.length === 0)
		return { ok: false, affected: 0, error: "No products selected." };
	if (unique.length > BULK_LIMIT)
		return {
			ok: false,
			affected: 0,
			error: `Select at most ${BULK_LIMIT} products at once.`,
		};

	try {
		if (action === "price") {
			const rupees = Number(value);
			if (!Number.isFinite(rupees) || rupees < 0)
				return { ok: false, affected: 0, error: "Enter a valid price." };
			await supabase
				.from("products")
				.update({ price_paise: toPaise(rupees) })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else if (action === "stock") {
			const qty = Number(value);
			if (!Number.isInteger(qty) || qty < 0)
				return {
					ok: false,
					affected: 0,
					error: "Enter a whole number for stock.",
				};
			await setStock(supabase, tenantId, unique, qty);
		} else if (action === "category") {
			const cat = (value ?? "").trim();
			await supabase
				.from("products")
				.update({ category: cat || null })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else if (action === "publish") {
			await supabase
				.from("products")
				.update({ status: "published", is_visible: true })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else if (action === "unpublish") {
			await supabase
				.from("products")
				.update({ is_visible: false })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else if (action === "archive") {
			await supabase
				.from("products")
				.update({ archived_at: new Date().toISOString() })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else if (action === "restore") {
			await supabase
				.from("products")
				.update({ archived_at: null })
				.eq("tenant_id", tenantId)
				.in("id", unique);
		} else {
			return { ok: false, affected: 0, error: "Unknown action." };
		}
		return { ok: true, affected: unique.length };
	} catch {
		return { ok: false, affected: 0, error: "Bulk action failed." };
	}
}

/** Export all non-archived products to a formula-injection-safe CSV string. */
export async function exportProductsCsv(
	supabase: SupabaseClient,
	tenantId: string,
): Promise<string> {
	const { data: products } = await supabase
		.from("products")
		.select(
			"id, name, unit, price_paise, mrp_paise, sku, barcode, category, description, is_visible",
		)
		.eq("tenant_id", tenantId)
		.is("archived_at", null)
		.order("name", { ascending: true })
		.limit(10000);

	const ids = (products ?? []).map((p) => p.id as string);
	const sm = await stockMap(supabase, tenantId, ids);

	const rows = (products ?? []).map((p) => [
		String(p.name ?? ""),
		String(p.unit ?? ""),
		(Number(p.price_paise ?? 0) / 100).toString(),
		p.mrp_paise == null ? "" : (Number(p.mrp_paise) / 100).toString(),
		String(p.sku ?? ""),
		String(p.barcode ?? ""),
		String(p.category ?? ""),
		String(p.description ?? ""),
		sm.has(p.id as string) ? String(sm.get(p.id as string)) : "",
		p.is_visible ? "true" : "false",
	]);
	return buildCsv(MERCHANT_CSV_HEADERS, rows);
}

export interface CsvImportResult {
	created: number;
	updated: number;
	failed: number;
}

/**
 * Import validated CSV rows. New products are created as DRAFTS. When
 * `updateExisting` is set, a row matching an existing product by SKU (or exact
 * name when no SKU) updates that product instead of inserting a duplicate.
 */
export async function importCsvRows(
	supabase: SupabaseClient,
	tenantId: string,
	rows: CsvRow[],
	opts: { updateExisting: boolean },
): Promise<CsvImportResult> {
	let created = 0;
	let updated = 0;
	let failed = 0;

	// Build lookup of existing products for matching.
	const existingBySku = new Map<string, string>();
	const existingByName = new Map<string, string>();
	const { data: existing } = await supabase
		.from("products")
		.select("id, name, sku")
		.eq("tenant_id", tenantId)
		.is("archived_at", null)
		.limit(10000);
	for (const p of existing ?? []) {
		if (p.sku) existingBySku.set(String(p.sku).toLowerCase(), p.id as string);
		existingByName.set(String(p.name).toLowerCase(), p.id as string);
	}

	for (const r of rows) {
		const fields = {
			name: r.name,
			price_paise: toPaise(r.price),
			mrp_paise: r.mrp != null && r.mrp > r.price ? toPaise(r.mrp) : null,
			unit: r.unit || null,
			sku: r.sku || null,
			barcode: r.barcode || null,
			category: r.category || null,
			description: r.description || null,
			is_visible: r.visible === "true",
		};
		const sku = (r.sku ?? "").trim().toLowerCase();
		const matchId = sku
			? existingBySku.get(sku)
			: existingByName.get(r.name.trim().toLowerCase());

		try {
			if (opts.updateExisting && matchId) {
				const { error } = await supabase
					.from("products")
					.update(fields)
					.eq("id", matchId)
					.eq("tenant_id", tenantId);
				if (error) failed++;
				else {
					updated++;
					if (r.stock != null)
						await setStock(supabase, tenantId, [matchId], r.stock);
				}
			} else {
				const { data, error } = await supabase
					.from("products")
					.insert({
						tenant_id: tenantId,
						slug: `${slugify(r.name)}-${rand()}`,
						status: "draft",
						source: "csv",
						...fields,
					})
					.select("id")
					.maybeSingle();
				if (error || !data) failed++;
				else {
					created++;
					if (r.stock != null)
						await setStock(supabase, tenantId, [data.id as string], r.stock);
				}
			}
		} catch {
			failed++;
		}
	}

	await supabase
		.from("merchant_catalogue_imports")
		.insert({
			tenant_id: tenantId,
			source: "csv",
			status:
				failed > 0
					? created + updated > 0
						? "partial"
						: "failed"
					: "completed",
			total_requested: rows.length,
			created_count: created + updated,
			skipped_count: 0,
			failed_count: failed,
		})
		.then(
			() => undefined,
			() => undefined,
		);

	return { created, updated, failed };
}
