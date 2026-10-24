import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("legal/privacy", "routes/legal.privacy.tsx"),
	route("legal/terms", "routes/legal.terms.tsx"),
	route("legal/refund", "routes/legal.refund.tsx"),
	route("legal/merchant-agreement", "routes/legal.merchant-agreement.tsx"),
	route("sitemap.xml", "routes/sitemap[.]xml.ts"),
	route("robots.txt", "routes/robots[.]txt.ts"),
] satisfies RouteConfig;
