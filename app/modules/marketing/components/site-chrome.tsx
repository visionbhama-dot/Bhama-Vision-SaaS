import * as React from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "~/components/ui/button";
import type { BrandConfig } from "~/config/brand";

const NAV_LINKS = [
	{ label: "Features", href: "#features" },
	{ label: "How It Works", href: "#how-it-works" },
	{ label: "Solutions", href: "#solutions" },
	{ label: "Pricing", href: "#pricing" },
	{ label: "FAQ", href: "#faq" },
	{ label: "Contact", href: "#contact" },
];

export function SiteHeader({ brand }: { brand: BrandConfig }) {
	const [open, setOpen] = React.useState(false);

	return (
		<header className="sticky top-0 z-50 border-b border-ink-100 bg-canvas/85 backdrop-blur-md">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
				<a href="#top" aria-label={`${brand.name} home`}>
					<Logo name={brand.shortName} />
				</a>

				<nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
					{NAV_LINKS.map((link) => (
						<a
							key={link.href}
							href={link.href}
							className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
						>
							{link.label}
						</a>
					))}
				</nav>

				<div className="hidden items-center gap-2 lg:flex">
					<a href="/login">
						<Button variant="ghost" size="sm">
							Login
						</Button>
					</a>
					<a href="/signup">
						<Button size="sm">Start Your Store</Button>
					</a>
				</div>

				<button
					type="button"
					className="grid size-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"
					aria-label={open ? "Close menu" : "Open menu"}
					aria-expanded={open}
					onClick={() => setOpen((v) => !v)}
				>
					{open ? <X className="size-5" /> : <Menu className="size-5" />}
				</button>
			</div>

			{open && (
				<div className="border-t border-ink-100 bg-canvas lg:hidden">
					<nav
						aria-label="Mobile"
						className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3"
					>
						{NAV_LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								onClick={() => setOpen(false)}
								className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
							>
								{link.label}
							</a>
						))}
						<div className="mt-2 flex gap-2">
							<a href="/login" className="flex-1">
								<Button variant="outline" size="sm" className="w-full">
									Login
								</Button>
							</a>
							<a href="/signup" className="flex-1">
								<Button size="sm" className="w-full">
									Start Your Store
								</Button>
							</a>
						</div>
					</nav>
				</div>
			)}
		</header>
	);
}

export function SiteFooter({ brand }: { brand: BrandConfig }) {
	const year = new Date().getFullYear();
	const columns = [
		{
			title: "Product",
			links: [
				{ label: "Features", href: "#features" },
				{ label: "How It Works", href: "#how-it-works" },
				{ label: "Solutions", href: "#solutions" },
				{ label: "Pricing", href: "#pricing" },
			],
		},
		{
			title: "Company",
			links: [
				{ label: "Contact", href: "#contact" },
				{ label: "Support", href: `mailto:${brand.supportEmail}` },
				{ label: "Login", href: "/login" },
				{ label: "Start Your Store", href: "#contact" },
			],
		},
		{
			title: "Legal",
			links: [
				{ label: "Privacy Policy", href: "/legal/privacy" },
				{ label: "Terms of Service", href: "/legal/terms" },
				{ label: "Refund & Cancellation", href: "/legal/refund" },
				{ label: "Merchant Agreement", href: "/legal/merchant-agreement" },
			],
		},
	];

	return (
		<footer className="border-t border-ink-100 bg-white">
			<div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
				<div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
					<div className="max-w-sm">
						<Logo name={brand.shortName} />
						<p className="mt-4 text-sm leading-relaxed text-ink-500">
							Software that lets local grocery stores, supermarkets and
							marketplaces run their own branded online ordering business. Built
							for India, by {brand.company}.
						</p>
						<p className="mt-4 text-sm text-ink-500">
							<a
								href={`mailto:${brand.supportEmail}`}
								className="font-medium text-ink-700 hover:text-ink-900"
							>
								{brand.supportEmail}
							</a>
						</p>
					</div>
					{columns.map((col) => (
						<div key={col.title}>
							<h4 className="text-sm font-semibold text-ink-900">
								{col.title}
							</h4>
							<ul className="mt-4 space-y-3">
								{col.links.map((l) => (
									<li key={l.label}>
										<a
											href={l.href}
											className="text-sm text-ink-500 transition-colors hover:text-ink-900"
										>
											{l.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-ink-100 pt-6 text-sm text-ink-500 sm:flex-row sm:items-center">
					<p>
						© {year} {brand.company}. All rights reserved.
					</p>
					<p>
						Prices shown in INR. Launch pricing is indicative and configurable.
					</p>
				</div>
			</div>
		</footer>
	);
}
