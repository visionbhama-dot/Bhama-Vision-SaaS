import type { Route } from "./+types/home";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta, organizationJsonLd } from "~/lib/seo";
import { leadSchema, utmSchema } from "~/modules/leads/schema";
import { createLead } from "~/modules/leads/service.server";
import {
	SiteHeader,
	SiteFooter,
} from "~/modules/marketing/components/site-chrome";
import {
	Hero,
	ProblemSection,
	HowItWorks,
	ProductExperience,
	Features,
	Solutions,
	WhyChoose,
} from "~/modules/marketing/components/sections";
import { Pricing } from "~/modules/marketing/components/pricing";
import { Faq } from "~/modules/marketing/components/faq";
import { LeadForm } from "~/modules/marketing/components/lead-form";

export function meta({ data }: Route.MetaArgs) {
	const brand = data?.brand;
	const url = brand ? `https://${brand.domain}/` : undefined;
	const tags = buildMeta({
		title: `${brand?.name ?? "Bhama Vision Grocery Cloud"} — Your Grocery Store. Now Online.`,
		description:
			"Launch your own branded grocery ordering website, manage products, accept orders and grow your local delivery business — all from one platform. Built for India.",
		siteName: brand?.name ?? "Bhama Vision Grocery Cloud",
		url,
	});
	return tags;
}

export function loader({ context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	return { brand };
}

export async function action({ request, context }: Route.ActionArgs) {
	const form = await request.formData();
	const raw = Object.fromEntries(form) as Record<string, string>;

	// Honeypot: silently reject bots without storing anything.
	if (raw.company_website && raw.company_website.length > 0) {
		return { ok: false as const, message: "Submission rejected." };
	}

	const parsed = leadSchema.safeParse({
		...raw,
		consent: raw.consent === "true" || raw.consent === "on",
		productCount: raw.productCount === "" ? undefined : raw.productCount,
	});

	if (!parsed.success) {
		const fieldErrors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === "string" && !fieldErrors[key]) {
				fieldErrors[key] = issue.message;
			}
		}
		return {
			ok: false as const,
			message: "Please check the highlighted fields and try again.",
			fieldErrors,
		};
	}

	const utm = utmSchema.parse(raw);
	const result = await createLead(context.cloudflare.env, parsed.data, utm);

	if (!result.ok) {
		return { ok: false as const, message: result.message };
	}
	return { ok: true as const, reference: result.reference };
}

export default function Home({ loaderData }: Route.ComponentProps) {
	const { brand } = loaderData;
	const jsonLd = organizationJsonLd({
		name: brand.name,
		company: brand.company,
		url: `https://${brand.domain}/`,
		description:
			"Multi-tenant grocery commerce SaaS that lets local stores run their own branded online ordering business.",
	});

	return (
		<div className="min-h-screen bg-canvas">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<SiteHeader brand={brand} />
			<main>
				<Hero brand={brand} />
				<ProblemSection />
				<HowItWorks />
				<ProductExperience />
				<Features />
				<Solutions />
				<WhyChoose />
				<Pricing />
				<Faq brand={brand} />

				<section id="contact" className="bg-white py-16 lg:py-24">
					<div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
						<div>
							<p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
								Get started
							</p>
							<h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
								Ready to Take Your Grocery Business Online?
							</h2>
							<p className="mt-4 text-lg leading-relaxed text-ink-500">
								Share a few details and our team will help you choose a plan,
								set up your catalogue and launch your branded store. No
								obligation.
							</p>
							<ul className="mt-6 space-y-3 text-sm text-ink-600">
								<li>• We'll respond with next steps and a reference number.</li>
								<li>• Prefer to talk? Use WhatsApp or email us directly.</li>
								<li>
									• Your details are used only to contact you about your
									enquiry.
								</li>
							</ul>
						</div>
						<div>
							<LeadForm brand={brand} />
						</div>
					</div>
				</section>
			</main>
			<SiteFooter brand={brand} />
		</div>
	);
}
