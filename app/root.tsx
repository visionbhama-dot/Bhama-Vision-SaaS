import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { AnalyticsScripts } from "~/components/analytics-scripts";
import type { PublicRuntimeConfig } from "~/config/brand";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export function loader({ context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	return { publicConfig: toPublicConfig(env) };
}

export function Layout({ children }: { children: React.ReactNode }) {
	const data = useRouteLoaderData<typeof loader>("root");
	const publicConfig = data?.publicConfig as PublicRuntimeConfig | undefined;
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#039855" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				{publicConfig && <AnalyticsScripts config={publicConfig.analytics} />}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		// Prefer the thrown Response body (error.data) so access-control and other
		// deliberate errors explain themselves instead of showing a generic blurb.
		const body = typeof error.data === "string" ? error.data : "";
		if (error.status === 404) {
			message = "404";
			details = "The requested page could not be found.";
		} else if (error.status === 403) {
			message = "Access denied";
			details = body || "You don't have permission to view this page.";
		} else {
			message = "Error";
			details = body || error.statusText || details;
		}
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="mx-auto max-w-xl px-4 py-24 text-center">
			<h1 className="text-4xl font-bold text-ink-900">{message}</h1>
			<p className="mt-3 text-ink-500">{details}</p>
			<a
				href="/"
				className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white"
			>
				Back to home
			</a>
			{stack && (
				<pre className="mt-6 w-full overflow-x-auto rounded-xl bg-ink-900 p-4 text-left text-xs text-ink-100">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
