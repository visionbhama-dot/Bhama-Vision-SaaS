import type { Route } from "./+types/robots[.]txt";
import { getEnv } from "~/lib/env.server";

export function loader({ context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const domain = env.PUBLIC_APP_DOMAIN;
	const scheme = domain.includes("localhost") ? "http" : "https";
	const base = `${scheme}://${domain}`;

	// Allow crawling of the public marketing site; disallow app/admin areas.
	const body = [
		"User-agent: *",
		"Allow: /$",
		"Allow: /legal/",
		"Disallow: /login",
		"Disallow: /app/",
		"Disallow: /admin/",
		"Disallow: /api/",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
