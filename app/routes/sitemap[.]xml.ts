import type { Route } from "./+types/sitemap[.]xml";
import { getEnv } from "~/lib/env.server";

export function loader({ context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const domain = env.PUBLIC_APP_DOMAIN;
	const scheme = domain.includes("localhost") ? "http" : "https";
	const base = `${scheme}://${domain}`;

	const paths = [
		{ loc: "/", priority: "1.0", changefreq: "weekly" },
		{ loc: "/legal/privacy", priority: "0.3", changefreq: "yearly" },
		{ loc: "/legal/terms", priority: "0.3", changefreq: "yearly" },
		{ loc: "/legal/refund", priority: "0.3", changefreq: "yearly" },
		{ loc: "/legal/merchant-agreement", priority: "0.3", changefreq: "yearly" },
	];

	const urls = paths
		.map(
			(p) =>
				`  <url><loc>${base}${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
		)
		.join("\n");

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
