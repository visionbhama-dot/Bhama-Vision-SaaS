/**
 * SEO helpers: build consistent <meta> tags (title, description, Open Graph,
 * Twitter, canonical) and JSON-LD structured data for marketing routes.
 */

export interface SeoInput {
	title: string;
	description: string;
	/** Fully-qualified canonical URL. */
	url?: string;
	/** Fully-qualified OG image URL. */
	image?: string;
	siteName: string;
	type?: "website" | "article";
	noindex?: boolean;
}

type MetaDescriptor =
	| { title: string }
	| { name: string; content: string }
	| { property: string; content: string }
	| { tagName: "link"; rel: string; href: string };

export function buildMeta(input: SeoInput): MetaDescriptor[] {
	const {
		title,
		description,
		url,
		image,
		siteName,
		type = "website",
		noindex,
	} = input;

	const tags: MetaDescriptor[] = [
		{ title },
		{ name: "description", content: description },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:type", content: type },
		{ property: "og:site_name", content: siteName },
		{
			name: "twitter:card",
			content: image ? "summary_large_image" : "summary",
		},
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
	];

	if (url) {
		tags.push({ property: "og:url", content: url });
		tags.push({ tagName: "link", rel: "canonical", href: url });
	}
	if (image) {
		tags.push({ property: "og:image", content: image });
		tags.push({ name: "twitter:image", content: image });
	}
	if (noindex) {
		tags.push({ name: "robots", content: "noindex, nofollow" });
	}

	return tags;
}

/** Organization + SoftwareApplication JSON-LD for the marketing homepage. */
export function organizationJsonLd(params: {
	name: string;
	company: string;
	url: string;
	description: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: params.name,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		offers: { "@type": "Offer", priceCurrency: "INR" },
		publisher: { "@type": "Organization", name: params.company },
		url: params.url,
		description: params.description,
	};
}
