import type { Route } from "./+types/legal.privacy";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { LegalLayout } from "~/modules/marketing/components/legal-layout";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Privacy Policy — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "How Bhama Vision collects, uses and protects personal data.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const brand = resolveBrand(toPublicConfig(getEnv(context.cloudflare.env)));
	return { brand };
}

export default function PrivacyPolicy({ loaderData }: Route.ComponentProps) {
	const { brand } = loaderData;
	return (
		<LegalLayout brand={brand} title="Privacy Policy" updated="Draft">
			<p>
				{brand.company} ("we") operates {brand.name}. This policy explains what
				personal data we collect from merchants, their customers and website
				visitors, and how we use it.
			</p>
			<h2>Data we collect</h2>
			<p>
				Contact details submitted through enquiry forms (name, business name,
				phone, email, city), merchant account information, and — for stores —
				order and customer data processed on behalf of the merchant. We collect
				campaign attribution (UTM) and analytics only where consent is given.
			</p>
			<h2>How we use data</h2>
			<p>
				To respond to enquiries, provide and operate the platform, process
				subscription billing, prevent abuse, and improve the service. Merchant
				customer data is processed on the merchant's behalf under the Merchant
				Agreement.
			</p>
			<h2>Sharing</h2>
			<p>
				We share data with infrastructure and payment providers strictly to
				operate the service. We do not sell personal data.
			</p>
			<h2>Retention & your rights</h2>
			<p>
				We retain data only as long as necessary for the purposes above and
				applicable law. You may request access, correction or deletion by
				contacting {brand.supportEmail}.
			</p>
			<h2>Contact</h2>
			<p>Questions about this policy: {brand.supportEmail}.</p>
		</LegalLayout>
	);
}
