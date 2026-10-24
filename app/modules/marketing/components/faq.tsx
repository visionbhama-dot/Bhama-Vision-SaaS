import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "~/lib/utils";
import type { BrandConfig } from "~/config/brand";

export function Faq({ brand }: { brand: BrandConfig }) {
	const faqs = [
		{
			q: "Do I need coding knowledge?",
			a: "No. You set up your store through guided screens — no development required. Our team can also assist with onboarding.",
		},
		{
			q: "Can I use my shop name?",
			a: "Yes. Your store runs under your own brand name, logo and theme.",
		},
		{
			q: "Will my store get a website address?",
			a: `Yes — every store gets a branded subdomain such as yourstore.${brand.domain}. Custom domains you already own are planned as an optional add-on that requires domain ownership verification and DNS setup.`,
		},
		{
			q: "Can customers order from mobile?",
			a: "Yes. The storefront is a fast, mobile-first responsive web app that works well on everyday smartphones. It is not a native Android/iOS app.",
		},
		{
			q: "Who receives customer payments?",
			a: "You do. Grocery payments go to your own connected payment account — they are not routed into Bhama Vision's account. Online payments require connecting an approved payment gateway; until then, Cash on Delivery is available.",
		},
		{
			q: "Can I accept cash on delivery?",
			a: "Yes. Cash on Delivery works out of the box on every plan.",
		},
		{
			q: "Do I need to arrange my own delivery staff?",
			a: "For the Growth plan you manage your own riders with assignment and live tracking. You are responsible for your delivery team; we provide the software to run it.",
		},
		{
			q: "Can I add hundreds of grocery products?",
			a: "Yes, including a bulk CSV import with validation. Product limits depend on your plan and are shown in the comparison table.",
		},
		{
			q: "Can I change my subscription?",
			a: "Yes. You can upgrade or downgrade; your catalogue and existing orders are preserved across plan changes.",
		},
		{
			q: "Can I use my own domain?",
			a: "Custom domains are an optional later feature. It requires verifying you own the domain and completing DNS/SSL setup — we won't claim it works until it is implemented for your account.",
		},
		{
			q: "Can multiple shops sell on one platform?",
			a: "Yes, on the Marketplace plan. You can onboard multiple vendors, each with their own catalogue, orders and earnings, under one marketplace brand.",
		},
		{
			q: "Is there a setup charge?",
			a: "Plans are billed monthly or annually. An optional one-time setup fee or promotional pricing may apply and is configured by Bhama Vision — any such charge is shown to you before you pay.",
		},
		{
			q: "How does support work?",
			a: `You can raise support tickets to Bhama Vision from your dashboard, and email us at ${brand.supportEmail}. Your own customers raise support tickets to your store.`,
		},
	];

	return (
		<section id="faq" className="py-16 lg:py-24">
			<div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
				<div className="text-center">
					<p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
						FAQ
					</p>
					<h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
						Frequently asked questions
					</h2>
				</div>
				<div className="mt-10 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
					{faqs.map((f, i) => (
						<FaqItem key={i} question={f.q} answer={f.a} />
					))}
				</div>
			</div>
		</section>
	);
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
	const [open, setOpen] = React.useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
			>
				<span className="font-medium text-ink-900">{question}</span>
				<ChevronDown
					className={cn(
						"size-5 shrink-0 text-ink-400 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			{open && (
				<p className="px-5 pb-5 text-sm leading-relaxed text-ink-600">
					{answer}
				</p>
			)}
		</div>
	);
}
