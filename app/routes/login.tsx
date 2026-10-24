import type { Route } from "./+types/login";
import { ArrowRight, Lock } from "lucide-react";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { Button } from "~/components/ui/button";
import {
	SiteHeader,
	SiteFooter,
} from "~/modules/marketing/components/site-chrome";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Login — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Merchant login for Bhama Vision Grocery Cloud.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const brand = resolveBrand(toPublicConfig(getEnv(context.cloudflare.env)));
	return { brand };
}

export default function Login({ loaderData }: Route.ComponentProps) {
	const { brand } = loaderData;
	return (
		<div className="flex min-h-screen flex-col bg-canvas">
			<SiteHeader brand={brand} />
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-20">
				<div className="rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-sm">
					<span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
						<Lock className="size-6" />
					</span>
					<h1 className="mt-5 text-2xl font-bold text-ink-900">
						Merchant login is on the way
					</h1>
					<p className="mt-3 text-ink-500">
						Secure merchant accounts and onboarding are part of the next release
						phase. We're not showing a login form yet because the authentication
						and account system behind it is still being built — we won't fake
						it.
					</p>
					<p className="mt-3 text-ink-500">
						Want early access? Send us your details and we'll set up your store
						with you.
					</p>
					<a href="/#contact" className="mt-6 inline-block">
						<Button size="lg">
							Request early access <ArrowRight />
						</Button>
					</a>
				</div>
			</main>
			<SiteFooter brand={brand} />
		</div>
	);
}
