/**
 * Central brand configuration.
 *
 * The working platform name lives here so it can be swapped for a dedicated
 * SaaS brand later without touching feature code. Values that are environment
 * specific (public domain, WhatsApp number, support email) are resolved from
 * validated environment variables in the root loader and merged over these
 * defaults via {@link resolveBrand}.
 */
export interface BrandConfig {
	/** Working platform name shown across marketing + app chrome. */
	name: string;
	/** Short name used in tight spaces. */
	shortName: string;
	/** Owning company. */
	company: string;
	/** Public apex domain used to compose merchant subdomains. */
	domain: string;
	/** Primary support email. */
	supportEmail: string;
	/** WhatsApp number in international format without "+" (e.g. 919999999999). */
	whatsappNumber: string;
	/** Default market + currency metadata. */
	market: { country: string; currency: string; locale: string };
}

export const DEFAULT_BRAND: BrandConfig = {
	name: "Bhama Vision Grocery Cloud",
	shortName: "Bhama Vision",
	company: "Bhama Vision",
	domain: "localhost:5173",
	supportEmail: "hello@bhamavision.example",
	whatsappNumber: "",
	market: { country: "IN", currency: "INR", locale: "en-IN" },
};

/**
 * Public (non-secret) runtime values surfaced to the browser via the root
 * loader. Never place secrets here — only values safe to expose client-side.
 */
export interface PublicRuntimeConfig {
	appName: string;
	appDomain: string;
	supportEmail: string;
	whatsappNumber: string;
	analytics: {
		metaPixelId: string;
		gaMeasurementId: string;
		googleAdsConversionId: string;
	};
}

export function resolveBrand(runtime: PublicRuntimeConfig): BrandConfig {
	return {
		...DEFAULT_BRAND,
		name: runtime.appName || DEFAULT_BRAND.name,
		domain: runtime.appDomain || DEFAULT_BRAND.domain,
		supportEmail: runtime.supportEmail || DEFAULT_BRAND.supportEmail,
		whatsappNumber: runtime.whatsappNumber || DEFAULT_BRAND.whatsappNumber,
	};
}

/** Build a WhatsApp click-to-chat URL with a prefilled enquiry message. */
export function whatsappLink(number: string, message: string): string | null {
	const digits = number.replace(/\D/g, "");
	if (!digits) return null;
	return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
