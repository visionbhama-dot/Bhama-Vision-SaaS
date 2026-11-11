import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Master catalogue reads + merchant import.
 *
 * All operations use the caller's RLS-scoped Supabase client:
 *  - master_products / catalogue_packs are world-readable (RLS allows active
 *    rows), so browsing works as the signed-in user.
 *  - product inserts are written with the user's client and always carry the
 *    tenant_id the user owns; RLS makes a cross-tenant write impossible even if
 *    a tenant id were tampered with.
 *
 * Imported products are DRAFTS (status='draft', is_visible=false) and are
 * deduplicated at the database level by the unique (tenant_id, master_product_id)
 * index, so importing a pack twice (double-click / retry) never duplicates rows.
 */

export const IMPORT_LIMIT = 1000;
const BATCH = 100;

export interface CataloguePackSummary {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	category: string | null;
	productCount: number;
}

export interface MasterProductRow {
	id: string;
	name: string;
	category: string;
	subcategory: string | null;
	brand: string | null;
	classification: string;
	packSize: string | null;
	unit: string | null;
	barcode: string | null;
	imageRef: string | null;
	description: string | null;
}

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

/** List active packs with their product counts. */
export async function listPacks(
	supabase: SupabaseClient,
): Promise<CataloguePackSummary[]> {
	const { data } = await supabase
		.from("catalogue_packs")
		.select(
			"id, slug, name, description, category, sort_order, catalogue_pack_items(count)",
		)
		.eq("is_active", true)
		.order("sort_order", { ascending: true });

	return (data ?? []).map((p): CataloguePackSummary => {
		const rel = p.catalogue_pack_items as
			{ count: number }[] | { count: number } | null;
		const productCount = Array.isArray(rel)
			? (rel[0]?.count ?? 0)
			: (rel?.count ?? 0);
		return {
			id: p.id as string,
			slug: p.slug as string,
			name: p.name as string,
			description: (p.description as string | null) ?? null,
			category: (p.category as string | null) ?? null,
			productCount,
		};
	});
}

export interface PackDetail {
	pack: CataloguePackSummary;
	products: MasterProductRow[];
	subcategories: string[];
}

/** Load a pack's products, with optional search + subcategory filter. */
export async function getPackProducts(
	supabase: SupabaseClient,
	packSlug: string,
	filters: { search?: string; subcategory?: string } = {},
): Promise<PackDetail | null> {
	const { data: pack } = await supabase
		.from("catalogue_packs")
		.select("id, slug, name, description, category")
		.eq("slug", packSlug)
		.eq("is_active", true)
		.maybeSingle();
	if (!pack) return null;

	const { data: items } = await supabase
		.from("catalogue_pack_items")
		.select(
			"position, master_products(id, name, category, subcategory, brand, classification, pack_size, unit, barcode, image_ref, description, is_active)",
		)
		.eq("pack_id", pack.id)
		.order("position", { ascending: true });

	const all: MasterProductRow[] = [];
	for (const it of items ?? []) {
		const m = (
			Array.isArray(it.master_products)
				? it.master_products[0]
				: it.master_products
		) as Record<string, unknown> | null;
		if (!m || m.is_active === false) continue;
		all.push({
			id: m.id as string,
			name: m.name as string,
			category: m.category as string,
			subcategory: (m.subcategory as string | null) ?? null,
			brand: (m.brand as string | null) ?? null,
			classification: (m.classification as string) ?? "generic",
			packSize: (m.pack_size as string | null) ?? null,
			unit: (m.unit as string | null) ?? null,
			barcode: (m.barcode as string | null) ?? null,
			imageRef: (m.image_ref as string | null) ?? null,
			description: (m.description as string | null) ?? null,
		});
	}

	const subcategories = [
		...new Set(all.map((p) => p.subcategory).filter(Boolean) as string[]),
	].sort();

	let products = all;
	if (filters.subcategory)
		products = products.filter((p) => p.subcategory === filters.subcategory);
	if (filters.search) {
		const q = filters.search.trim().toLowerCase();
		if (q) products = products.filter((p) => p.name.toLowerCase().includes(q));
	}

	return {
		pack: {
			id: pack.id,
			slug: pack.slug,
			name: pack.name,
			description: pack.description ?? null,
			category: pack.category ?? null,
			productCount: all.length,
		},
		products,
		subcategories,
	};
}

export interface ImportResult {
	ok: boolean;
	total: number;
	created: number;
	skipped: number; // already-owned duplicates
	failed: number;
	error?: string;
}

/**
 * Import selected master products into a tenant's catalogue as drafts.
 * Idempotent + retry-safe via on-conflict-do-nothing on the unique
 * (tenant_id, master_product_id) index. Processes in bounded batches.
 */
export async function importMasterProducts(
	supabase: SupabaseClient,
	tenantId: string,
	userId: string,
	masterProductIds: string[],
	packId: string | null = null,
): Promise<ImportResult> {
	const ids = [...new Set(masterProductIds)].slice(0, IMPORT_LIMIT);
	if (ids.length === 0) {
		return {
			ok: false,
			total: 0,
			created: 0,
			skipped: 0,
			failed: 0,
			error: "No products selected.",
		};
	}

	const { data: masters, error: mErr } = await supabase
		.from("master_products")
		.select(
			"id, name, category, subcategory, brand, pack_size, barcode, description",
		)
		.in("id", ids)
		.eq("is_active", true);
	if (mErr) {
		return {
			ok: false,
			total: ids.length,
			created: 0,
			skipped: 0,
			failed: ids.length,
			error: "Could not read the catalogue.",
		};
	}

	const rows = (masters ?? []).map((m) => ({
		tenant_id: tenantId,
		master_product_id: m.id as string,
		name: m.name as string,
		slug: `${slugify(m.name as string)}-${slugify((m.pack_size as string) ?? "")}-${rand()}`.replace(
			/--+/g,
			"-",
		),
		price_paise: 0,
		unit: (m.pack_size as string | null) ?? null,
		category:
			(m.subcategory as string | null) ?? (m.category as string | null) ?? null,
		brand: (m.brand as string | null) ?? null,
		barcode: (m.barcode as string | null) ?? null,
		description: (m.description as string | null) ?? null,
		is_visible: false,
		status: "draft" as const,
		source: "catalogue" as const,
	}));

	let created = 0;
	let failed = 0;
	for (let i = 0; i < rows.length; i += BATCH) {
		const chunk = rows.slice(i, i + BATCH);
		const { data, error } = await supabase
			.from("products")
			.upsert(chunk, {
				onConflict: "tenant_id,master_product_id",
				ignoreDuplicates: true,
			})
			.select("id");
		if (error) {
			failed += chunk.length;
			continue;
		}
		created += data?.length ?? 0;
	}

	const total = ids.length;
	const skipped = Math.max(0, total - created - failed);
	const status =
		failed > 0 ? (created > 0 ? "partial" : "failed") : "completed";

	await supabase
		.from("merchant_catalogue_imports")
		.insert({
			tenant_id: tenantId,
			pack_id: packId,
			source: "catalogue",
			status,
			total_requested: total,
			created_count: created,
			skipped_count: skipped,
			failed_count: failed,
			created_by: userId,
		})
		.then(
			() => undefined,
			() => undefined,
		);

	return { ok: failed === 0, total, created, skipped, failed };
}
