import type { Route } from "./+types/legal.merchant-agreement";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { LegalLayout } from "~/modules/marketing/components/legal-layout";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Merchant Agreement — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Terms between Bhama Vision and merchants using the platform.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const brand = resolveBrand(toPublicConfig(getEnv(context.cloudflare.env)));
	return { brand };
}

export default function MerchantAgreement({
	loaderData,
}: Route.ComponentProps) {
	const { brand } = loaderData;
	return (
		<LegalLayout brand={brand} title="Merchant Agreement" updated="Draft">
			<p>
				This agreement governs the relationship between {brand.company} and
				merchants ("you") who operate stores on {brand.name}.
			</p>
			<h2>Your store, your business</h2>
			<p>
				You own your store identity, catalogue, pricing and customer
				relationships. You are the seller of record for your grocery sales and
				are responsible for applicable taxes, licensing (including any
				food-business registration), and consumer obligations.
			</p>
			<h2>Payments</h2>
			<p>
				Grocery customer payments are settled to your own connected payment
				account. {brand.company} charges only the subscription fees described in
				your plan. Marketplace commission arrangements, where enabled, are
				configured transparently.
			</p>
			<h2>Data processing</h2>
			<p>
				We process your store's customer and order data on your behalf solely to
				operate the service, with tenant isolation enforced at the database
				level.
			</p>
			<h2>Suspension & termination</h2>
			<p>
				Accounts may be suspended for non-payment or policy violations.
				Suspension prevents new orders while preserving historical financial
				records.
			</p>
			<h2>Contact</h2>
			<p>{brand.supportEmail}</p>
		</LegalLayout>
	);
}
