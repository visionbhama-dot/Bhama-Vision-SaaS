/**
 * Subscription plan catalogue (marketing defaults).
 *
 * IMPORTANT: In production the authoritative plan prices, limits and feature
 * entitlements live in the `subscription_plans` / `plan_features` tables and are
 * editable from the superadmin panel. Entitlement enforcement happens
 * server-side against those rows — never via these constants. This module is the
 * default/seed content used to render the public pricing section and to seed the
 * database (see db/migrations/0009_seed_plans.sql, kept in sync with this file).
 *
 * All prices are stored as integer paise (minor units) to avoid float errors.
 */

export type EntitlementKey =
	| "branded_subdomain"
	| "storefront"
	| "merchant_dashboard"
	| "product_management"
	| "categories"
	| "inventory"
	| "checkout"
	| "online_payments"
	| "cash_on_delivery"
	| "coupons"
	| "order_processing"
	| "customer_records"
	| "basic_reports"
	| "delivery_zones"
	| "support_tickets"
	| "delivery_staff"
	| "delivery_dashboard"
	| "rider_assignment"
	| "live_location_tracking"
	| "customer_delivery_tracking"
	| "operational_analytics"
	| "team_permissions"
	| "order_preparation_workflow"
	| "marketplace"
	| "vendor_onboarding"
	| "vendor_dashboards"
	| "vendor_commissions"
	| "vendor_settlements"
	| "advanced_reporting";

export interface PlanLimits {
	products: number | null; // null = unlimited (subject to fair-use / tier caps)
	staff: number | null;
	vendors: number | null;
}

export interface Plan {
	slug: "starter" | "growth" | "marketplace";
	name: string;
	tagline: string;
	monthlyPaise: number;
	annualPaise: number; // effective per-month-equivalent billed annually
	badge?: string;
	highlighted?: boolean;
	limits: PlanLimits;
	entitlements: EntitlementKey[];
	/** Human-readable bullets for the pricing card. */
	highlights: string[];
}

export const RUPEE = 100; // paise per rupee

export const PLANS: Plan[] = [
	{
		slug: "starter",
		name: "Starter",
		tagline: "For independent stores beginning online operations.",
		monthlyPaise: 1499 * RUPEE,
		annualPaise: 1249 * RUPEE,
		limits: { products: 500, staff: 2, vendors: 0 },
		entitlements: [
			"branded_subdomain",
			"storefront",
			"merchant_dashboard",
			"product_management",
			"categories",
			"inventory",
			"checkout",
			"online_payments",
			"cash_on_delivery",
			"coupons",
			"order_processing",
			"customer_records",
			"basic_reports",
			"delivery_zones",
			"support_tickets",
		],
		highlights: [
			"Branded storefront subdomain",
			"Full merchant dashboard",
			"Products, categories & inventory",
			"Customer checkout",
			"Online payments + Cash on Delivery",
			"Discount coupons & basic reports",
			"Delivery zone & charge configuration",
		],
	},
	{
		slug: "growth",
		name: "Growth",
		tagline: "For stores operating their own delivery teams.",
		monthlyPaise: 3499 * RUPEE,
		annualPaise: 2916 * RUPEE,
		badge: "Most Popular",
		highlighted: true,
		limits: { products: 5000, staff: 15, vendors: 0 },
		entitlements: [
			"branded_subdomain",
			"storefront",
			"merchant_dashboard",
			"product_management",
			"categories",
			"inventory",
			"checkout",
			"online_payments",
			"cash_on_delivery",
			"coupons",
			"order_processing",
			"customer_records",
			"basic_reports",
			"delivery_zones",
			"support_tickets",
			"delivery_staff",
			"delivery_dashboard",
			"rider_assignment",
			"live_location_tracking",
			"customer_delivery_tracking",
			"operational_analytics",
			"team_permissions",
			"order_preparation_workflow",
		],
		highlights: [
			"Everything in Starter",
			"Delivery staff management",
			"Rider dashboard & manual assignment",
			"Live location on active deliveries",
			"Customer delivery tracking",
			"Operational analytics & team roles",
			"Order preparation workflow",
		],
	},
	{
		slug: "marketplace",
		name: "Marketplace",
		tagline: "For businesses launching a local multi-seller platform.",
		monthlyPaise: 7999 * RUPEE,
		annualPaise: 6666 * RUPEE,
		limits: { products: null, staff: 50, vendors: 100 },
		entitlements: [
			"branded_subdomain",
			"storefront",
			"merchant_dashboard",
			"product_management",
			"categories",
			"inventory",
			"checkout",
			"online_payments",
			"cash_on_delivery",
			"coupons",
			"order_processing",
			"customer_records",
			"basic_reports",
			"delivery_zones",
			"support_tickets",
			"delivery_staff",
			"delivery_dashboard",
			"rider_assignment",
			"live_location_tracking",
			"customer_delivery_tracking",
			"operational_analytics",
			"team_permissions",
			"order_preparation_workflow",
			"marketplace",
			"vendor_onboarding",
			"vendor_dashboards",
			"vendor_commissions",
			"vendor_settlements",
			"advanced_reporting",
		],
		highlights: [
			"Everything in Growth",
			"Multi-vendor marketplace",
			"Vendor onboarding, approval & suspension",
			"Separate vendor dashboards & catalogs",
			"Vendor commission configuration",
			"Earnings & settlement reporting",
			"Vendor-wise analytics",
		],
	},
];

/** Rows for the plan comparison table. */
export interface ComparisonRow {
	label: string;
	key: EntitlementKey | "products" | "staff" | "vendors";
	type: "feature" | "limit";
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		label: "Branded storefront subdomain",
		key: "branded_subdomain",
		type: "feature",
	},
	{ label: "Product limit", key: "products", type: "limit" },
	{ label: "Staff accounts", key: "staff", type: "limit" },
	{ label: "Inventory management", key: "inventory", type: "feature" },
	{ label: "Online payments", key: "online_payments", type: "feature" },
	{ label: "Cash on Delivery", key: "cash_on_delivery", type: "feature" },
	{ label: "Discount coupons", key: "coupons", type: "feature" },
	{ label: "Delivery zones & charges", key: "delivery_zones", type: "feature" },
	{
		label: "Delivery staff & rider app",
		key: "delivery_staff",
		type: "feature",
	},
	{
		label: "Live delivery tracking",
		key: "live_location_tracking",
		type: "feature",
	},
	{
		label: "Operational analytics",
		key: "operational_analytics",
		type: "feature",
	},
	{ label: "Multi-vendor marketplace", key: "marketplace", type: "feature" },
	{ label: "Vendor limit", key: "vendors", type: "limit" },
	{
		label: "Vendor commissions & settlements",
		key: "vendor_commissions",
		type: "feature",
	},
	{ label: "Advanced reporting", key: "advanced_reporting", type: "feature" },
];

export function planHas(plan: Plan, key: EntitlementKey): boolean {
	return plan.entitlements.includes(key);
}

export function limitLabel(value: number | null): string {
	if (value === null) return "Unlimited";
	if (value === 0) return "—";
	return value.toLocaleString("en-IN");
}
