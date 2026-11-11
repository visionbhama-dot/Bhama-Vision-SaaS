import { getAdminClient } from "~/lib/supabase.server";

/**
 * Customer-facing storefront reads.
 *
 * Resolution runs through the service-role client for two reasons:
 *  - `tenant_domains` has no anonymous RLS read policy, so host → store lookup
 *    cannot be done as `anon`.
 *  - It lets a single code path serve both path (`/store/:slug`) and host-based
 *    (subdomain / custom domain) access.
 *
 * Even though the service role bypasses RLS, every catalogue query below
 * explicitly restricts to PUBLIC-safe data: an `active` store, `is_visible`
 * rows, and non-archived products — mirroring the public RLS policies. Stock
 * levels (members-only) are never exposed here.
 */

export interface StorefrontProduct {
	id: string;
	name: string;
	description: string | null;
	unit: string | null;
	category: string | null;
	pricePaise: number;
	mrpPaise: number | null;
	imageUrl: string | null;
}

export interface StorefrontStore {
	id: string;
	tenantId: string;
	slug: string;
	displayName: string;
	status: string;
	logoUrl: string | null;
	brandColor: string | null;
	currency: string;
	minOrderPaise: number;
	category: string;
	/**
	 * Medicine ordering/checkout is OFF unless a platform admin has explicitly
	 * enabled it for a verified pharmacy after legal review. Any future checkout
	 * MUST gate medicine purchases on this flag (see isMedicineOrderingAllowed).
	 */
	medicineOrderingEnabled: boolean;
}

export interface Storefront {
	store: StorefrontStore;
	products: StorefrontProduct[];
}

const STORE_COLUMNS =
	"id, tenant_id, slug, display_name, status, logo_url, theme, currency, min_order_paise, category, medicine_ordering_enabled";

type RawStore = {
	id: string;
	tenant_id: string;
	slug: string;
	display_name: string;
	status: string;
	logo_url: string | null;
	theme: Record<string, unknown> | null;
	currency: string | null;
	min_order_paise: number | null;
	category: string | null;
	medicine_ordering_enabled: boolean | null;
};

function toStore(row: RawStore): StorefrontStore {
	const theme = (row.theme ?? {}) as { brandColor?: string };
	return {
		id: row.id,
		tenantId: row.tenant_id,
		slug: row.slug,
		displayName: row.display_name,
		status: row.status,
		logoUrl: row.logo_url,
		brandColor: typeof theme.brandColor === "string" ? theme.brandColor : null,
		currency: row.currency ?? "INR",
		minOrderPaise: row.min_order_paise ?? 0,
		category: row.category ?? "general",
		medicineOrderingEnabled: Boolean(row.medicine_ordering_enabled),
	};
}

/**
 * Authoritative guard for any medicine checkout flow. Medicine ordering is only
 * permitted when a store has it explicitly enabled (which requires a verified
 * pharmacy + legal-review approval set by a platform admin). Non-pharmacy stores
 * never offer medicine ordering.
 */
export function isMedicineOrderingAllowed(store: StorefrontStore): boolean {
	return store.category === "pharmacy" && store.medicineOrderingEnabled;
}

/** Resolve a store by its subdomain label (the `slug`). */
export async function resolveStoreBySlug(
	env: unknown,
	rawSlug: string,
): Promise<StorefrontStore | null> {
	const admin = getAdminClient(env);
	if (!admin) return null;
	const slug = rawSlug.trim().toLowerCase();
	const { data } = await admin
		.from("stores")
		.select(STORE_COLUMNS)
		.eq("slug", slug)
		.maybeSingle();
	return data ? toStore(data as RawStore) : null;
}

/** Resolve a store from a request Host header via `tenant_domains`. */
export async function resolveStoreByHost(
	env: unknown,
	rawHost: string,
): Promise<StorefrontStore | null> {
	const admin = getAdminClient(env);
	if (!admin) return null;
	const host = rawHost.trim().toLowerCase();
	if (!host) return null;
	const { data: domain } = await admin
		.from("tenant_domains")
		.select("store_id")
		.eq("hostname", host)
		.maybeSingle();
	if (!domain?.store_id) return null;
	const { data } = await admin
		.from("stores")
		.select(STORE_COLUMNS)
		.eq("id", domain.store_id)
		.maybeSingle();
	return data ? toStore(data as RawStore) : null;
}

/** Load the public catalogue for an (active) store. */
export async function getStorefront(
	env: unknown,
	store: StorefrontStore,
): Promise<Storefront> {
	const admin = getAdminClient(env);
	if (!admin) return { store, products: [] };

	const { data } = await admin
		.from("products")
		.select(
			"id, name, description, unit, category, price_paise, mrp_paise, product_images(url, position)",
		)
		.eq("tenant_id", store.tenantId)
		.eq("is_visible", true)
		.eq("status", "published")
		.is("archived_at", null)
		.order("name", { ascending: true })
		.limit(500);

	const products: StorefrontProduct[] = (data ?? []).map((p) => {
		const images = (
			Array.isArray(p.product_images) ? p.product_images : []
		) as { url: string; position: number | null }[];
		images.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
		return {
			id: p.id as string,
			name: p.name as string,
			description: (p.description as string | null) ?? null,
			unit: (p.unit as string | null) ?? null,
			category: (p.category as string | null) ?? null,
			pricePaise: Number(p.price_paise ?? 0),
			mrpPaise: p.mrp_paise == null ? null : Number(p.mrp_paise),
			imageUrl: images[0]?.url ?? null,
		};
	});

	return { store, products };
}

export function isPubliclyVisible(status: string): boolean {
	return status === "active";
}
