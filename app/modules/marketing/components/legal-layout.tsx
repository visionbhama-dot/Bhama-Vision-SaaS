import { AlertTriangle } from "lucide-react";
import { SiteHeader, SiteFooter } from "./site-chrome";
import type { BrandConfig } from "~/config/brand";

/**
 * Shared chrome for legal/policy pages. The visible notice is intentional: these
 * documents are configurable templates that MUST be reviewed by qualified legal
 * counsel and the actual commercial terms filled in before live sales. We do not
 * present them as finalized legal advice.
 */
export function LegalLayout({
	brand,
	title,
	updated,
	children,
}: {
	brand: BrandConfig;
	title: string;
	updated: string;
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-canvas">
			<SiteHeader brand={brand} />
			<main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
				<h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
					{title}
				</h1>
				<p className="mt-2 text-sm text-ink-400">Last updated: {updated}</p>

				<div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
					<AlertTriangle className="mt-0.5 size-5 shrink-0" />
					<p>
						This is a configurable template pending review by {brand.company}'s
						legal counsel. It is not legal advice and must be finalized with
						accurate commercial terms before accepting payments.
					</p>
				</div>

				<div className="prose prose-ink mt-8 max-w-none space-y-4 text-ink-600 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink-900 [&_p]:leading-relaxed">
					{children}
				</div>
			</main>
			<SiteFooter brand={brand} />
		</div>
	);
}
