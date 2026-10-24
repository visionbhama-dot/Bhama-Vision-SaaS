import type { Route } from "./+types/legal.refund";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { LegalLayout } from "~/modules/marketing/components/legal-layout";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Refund & Cancellation — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Subscription refund and cancellation terms.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const brand = resolveBrand(toPublicConfig(getEnv(context.cloudflare.env)));
	return { brand };
}

export default function Refund({ loaderData }: Route.ComponentProps) {
	const { brand } = loaderData;
	return (
		<LegalLayout
			brand={brand}
			title="Refund & Cancellation Policy"
			updated="Draft"
		>
			<h2>Subscription cancellation</h2>
			<p>
				You may cancel your {brand.name} subscription at any time from your
				dashboard. Cancellation stops future renewals; access continues until
				the end of the paid period.
			</p>
			<h2>Refunds</h2>
			<p>
				Refund eligibility for subscription fees (and any one-time setup fee)
				will be stated here once finalized. One-time setup fees may be
				non-refundable once work has begun.
			</p>
			<h2>Grocery customer refunds</h2>
			<p>
				Refunds for grocery orders are handled by each store under its own
				policy, using its connected payment provider. {brand.company} does not
				hold grocery sale proceeds.
			</p>
			<h2>Contact</h2>
			<p>{brand.supportEmail}</p>
		</LegalLayout>
	);
}
