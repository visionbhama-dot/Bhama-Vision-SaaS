import type { Route } from "./+types/legal.terms";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { LegalLayout } from "~/modules/marketing/components/legal-layout";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Terms of Service — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "The terms governing use of the Bhama Vision platform.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const brand = resolveBrand(toPublicConfig(getEnv(context.cloudflare.env)));
	return { brand };
}

export default function Terms({ loaderData }: Route.ComponentProps) {
	const { brand } = loaderData;
	return (
		<LegalLayout brand={brand} title="Terms of Service" updated="Draft">
			<p>
				These terms govern access to and use of {brand.name}, a subscription
				software service provided by {brand.company}.
			</p>
			<h2>Subscriptions</h2>
			<p>
				Access to features depends on the active subscription plan. Plans are
				billed monthly or annually; prices, trials, setup fees and promotions
				are configured by {brand.company} and shown before purchase.
			</p>
			<h2>Acceptable use</h2>
			<p>
				Merchants are responsible for the lawfulness of the goods they sell,
				their pricing, taxes, and fulfilment. Misuse, fraud, or illegal activity
				may result in suspension.
			</p>
			<h2>Merchant responsibilities</h2>
			<p>
				Merchants operate their own stores, set their own policies, handle their
				own customer payments through their connected gateway, and run their own
				delivery operations where applicable.
			</p>
			<h2>Availability</h2>
			<p>
				We work to keep the service available but do not guarantee uninterrupted
				operation. Specific service levels, if any, are defined in a separate
				agreement.
			</p>
			<h2>Contact</h2>
			<p>{brand.supportEmail}</p>
		</LegalLayout>
	);
}
