/**
 * Lightweight, consent-aware analytics facade (client-side).
 *
 * The actual provider scripts (Meta Pixel, Google Analytics, Google Ads) are
 * injected only when their IDs are configured AND the visitor has granted
 * consent — see {@link AnalyticsScripts}. This module is a thin wrapper that
 * forwards meaningful events to whatever providers are present. It is a no-op
 * when nothing is configured or consent was not given, so it never throws and
 * never fabricates events.
 *
 * Duplicate protection for one-off conversions (e.g. a confirmed subscription)
 * is the caller's responsibility — pass a stable id and guard on it.
 */

declare global {
	interface Window {
		fbq?: (...args: unknown[]) => void;
		gtag?: (...args: unknown[]) => void;
		dataLayer?: unknown[];
		__bvConsent?: boolean;
	}
}

const CONSENT_KEY = "bv_analytics_consent";

export function hasConsent(): boolean {
	if (typeof window === "undefined") return false;
	if (window.__bvConsent === true) return true;
	try {
		return window.localStorage.getItem(CONSENT_KEY) === "granted";
	} catch {
		return false;
	}
}

export function setConsent(granted: boolean) {
	if (typeof window === "undefined") return;
	window.__bvConsent = granted;
	try {
		window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
	} catch {
		/* storage unavailable — ignore */
	}
}

/** Forward a named event with optional params to configured providers. */
export function trackEvent(
	event: string,
	params: Record<string, unknown> = {},
) {
	if (typeof window === "undefined" || !hasConsent()) return;
	try {
		window.gtag?.("event", event, params);
		window.fbq?.("trackCustom", event, params);
	} catch {
		/* provider error — never break UX over analytics */
	}
}
