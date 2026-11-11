import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),

	// Auth
	route("signup", "routes/signup.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.tsx"),
	route("auth/callback", "routes/auth.callback.tsx"),
	route("forgot-password", "routes/forgot-password.tsx"),
	route("reset-password", "routes/reset-password.tsx"),
	route("verify-email", "routes/verify-email.tsx"),

	// Merchant onboarding + dashboard
	route("onboarding", "routes/onboarding.tsx"),
	route("onboarding/:step", "routes/onboarding.step.tsx"),
	route("dashboard", "routes/dashboard.tsx"),
	route("dashboard/products", "routes/dashboard.products.tsx"),
	route("dashboard/products/import", "routes/dashboard.products.import.tsx"),
	route("dashboard/products/csv", "routes/dashboard.products.csv.tsx"),
	route("dashboard/products/export", "routes/dashboard.products.export.ts"),
	route("dashboard/payments", "routes/dashboard.payments.tsx"),
	route("dashboard/pharmacy", "routes/dashboard.pharmacy.tsx"),
	route("dashboard/orders", "routes/dashboard.orders.tsx"),
	route("dashboard/orders/:id", "routes/dashboard.orders.$id.tsx"),
	route("dashboard/delivery", "routes/dashboard.delivery.tsx"),
	route("dashboard/settings", "routes/dashboard.settings.tsx"),

	// Customer storefront (path form; subdomain/custom-domain resolves via Host)
	route("store/:slug", "routes/storefront.tsx"),
	route("store/:slug/checkout", "routes/storefront.checkout.tsx"),
	route("store/:slug/order/:token", "routes/storefront.order.tsx"),

	// Payment callbacks / webhooks (resource routes)
	route("api/payments/verify", "routes/api.payments.verify.ts"),
	route(
		"api/payments/webhook/:tenant",
		"routes/api.payments.webhook.tenant.ts",
	),

	// Superadmin
	route("admin", "routes/admin.tsx"),
	route("admin/merchants", "routes/admin.merchants.tsx"),
	route("admin/pharmacy", "routes/admin.pharmacy.tsx"),

	// Legal
	route("legal/privacy", "routes/legal.privacy.tsx"),
	route("legal/terms", "routes/legal.terms.tsx"),
	route("legal/refund", "routes/legal.refund.tsx"),
	route("legal/merchant-agreement", "routes/legal.merchant-agreement.tsx"),

	// Infra
	route("sitemap.xml", "routes/sitemap[.]xml.ts"),
	route("robots.txt", "routes/robots[.]txt.ts"),
] satisfies RouteConfig;
