import * as React from "react";
import { hasConsent, setConsent } from "~/lib/analytics";
import type { PublicRuntimeConfig } from "~/config/brand";

/**
 * Consent-gated analytics loader + minimal consent banner.
 *
 * Provider scripts (GA4, Meta Pixel, Google Ads) are injected ONLY after the
 * visitor accepts, and only for IDs that are actually configured. This keeps
 * tracking compliant with consent choices and avoids loading anything when no
 * analytics is set up. Declining stops any script from loading.
 */
export function AnalyticsScripts({
	config,
}: {
	config: PublicRuntimeConfig["analytics"];
}) {
	const configured =
		config.gaMeasurementId ||
		config.metaPixelId ||
		config.googleAdsConversionId;

	const [decision, setDecision] = React.useState<
		"unknown" | "granted" | "denied"
	>("unknown");

	React.useEffect(() => {
		if (!configured) return;
		const stored =
			typeof window !== "undefined"
				? window.localStorage.getItem("bv_analytics_consent")
				: null;
		if (stored === "granted") setDecision("granted");
		else if (stored === "denied") setDecision("denied");
	}, [configured]);

	React.useEffect(() => {
		if (decision !== "granted" || !hasConsent()) return;
		injectAnalytics(config);
	}, [decision, config]);

	if (!configured || decision !== "unknown") return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-[60] p-4">
			<div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm text-ink-600">
					We use privacy-respecting analytics to understand site traffic. You
					can accept or decline — essential site features work either way.
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => {
							setConsent(false);
							setDecision("denied");
						}}
						className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
					>
						Decline
					</button>
					<button
						type="button"
						onClick={() => {
							setConsent(true);
							setDecision("granted");
						}}
						className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
					>
						Accept
					</button>
				</div>
			</div>
		</div>
	);
}

function injectAnalytics(config: PublicRuntimeConfig["analytics"]) {
	if (typeof document === "undefined") return;
	if (document.getElementById("bv-analytics-loaded")) return;
	const marker = document.createElement("meta");
	marker.id = "bv-analytics-loaded";
	document.head.appendChild(marker);

	const { gaMeasurementId, googleAdsConversionId, metaPixelId } = config;

	if (gaMeasurementId || googleAdsConversionId) {
		const id = gaMeasurementId || googleAdsConversionId;
		const s = document.createElement("script");
		s.async = true;
		s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
		document.head.appendChild(s);
		window.dataLayer = window.dataLayer || [];
		window.gtag = function gtag() {
			// eslint-disable-next-line prefer-rest-params
			window.dataLayer!.push(arguments);
		};
		window.gtag("js", new Date());
		if (gaMeasurementId) window.gtag("config", gaMeasurementId);
		if (googleAdsConversionId) window.gtag("config", googleAdsConversionId);
	}

	if (metaPixelId) {
		/* Minimal Meta Pixel bootstrap (typed loosely to avoid vendor-shim noise). */
		type Fbq = {
			(...args: unknown[]): void;
			callMethod?: (...args: unknown[]) => void;
			queue: unknown[];
			loaded: boolean;
			version: string;
		};
		const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
		if (!w.fbq) {
			const fbq = function (this: unknown, ...args: unknown[]) {
				if (fbq.callMethod) fbq.callMethod(...args);
				else fbq.queue.push(args);
			} as Fbq;
			fbq.queue = [];
			fbq.loaded = true;
			fbq.version = "2.0";
			w.fbq = fbq;
			w._fbq = fbq;
			const t = document.createElement("script");
			t.async = true;
			t.src = "https://connect.facebook.net/en_US/fbevents.js";
			document.head.appendChild(t);
		}
		window.fbq?.("init", metaPixelId);
		window.fbq?.("track", "PageView");
	}
}
