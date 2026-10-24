import {
	Store,
	Palette,
	Boxes,
	Search,
	Tag,
	CreditCard,
	Banknote,
	MapPin,
	Bell,
	LifeBuoy,
	BarChart3,
	Bike,
	Users,
	ShieldCheck,
	ArrowRight,
	UserPlus,
	ListChecks,
	Rocket,
	Wallet,
	ShoppingBag,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import {
	StorefrontPreview,
	DashboardPreview,
	DeliveryPreview,
} from "./previews";
import type { BrandConfig } from "~/config/brand";

function SectionHeading({
	eyebrow,
	title,
	subtitle,
	center = true,
}: {
	eyebrow?: string;
	title: string;
	subtitle?: string;
	center?: boolean;
}) {
	return (
		<div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
			{eyebrow && (
				<p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
					{eyebrow}
				</p>
			)}
			<h2 className="text-balance text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
				{title}
			</h2>
			{subtitle && (
				<p className="mt-4 text-pretty text-lg leading-relaxed text-ink-500">
					{subtitle}
				</p>
			)}
		</div>
	);
}

export function Hero({ brand }: { brand: BrandConfig }) {
	return (
		<section id="top" className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,theme(colors.brand.50),transparent)]" />
			<div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:py-24 lg:px-8">
				<div>
					<Badge variant="brand">
						<ShoppingBag className="size-3.5" /> Grocery commerce, done for you
					</Badge>
					<h1 className="mt-5 text-balance text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
						Your Grocery Store.{" "}
						<span className="text-brand-600">Now Online.</span>
					</h1>
					<p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-ink-600">
						Launch your own branded grocery ordering website, manage your
						products, accept customer orders, and grow your local delivery
						business — all from one powerful platform.
					</p>
					<p className="mt-3 max-w-xl text-ink-500">
						No developers, no app project, no software to build from scratch.
						Register, pick a plan, add your products and go live.
					</p>
					<div className="mt-8 flex flex-col gap-3 sm:flex-row">
						<a href="#contact">
							<Button size="lg" className="w-full sm:w-auto">
								Launch My Online Store <ArrowRight />
							</Button>
						</a>
						<a href="#contact">
							<Button size="lg" variant="outline" className="w-full sm:w-auto">
								Book a Free Demo
							</Button>
						</a>
					</div>
					<p className="mt-5 text-sm text-ink-500">
						Built for local grocery stores, supermarkets, and growing retail
						businesses.
					</p>
				</div>

				<div className="relative">
					<div className="relative mx-auto max-w-md">
						<DashboardPreview />
						<div className="absolute -bottom-8 -left-6 w-44 sm:w-52">
							<DeliveryPreview />
						</div>
						<div className="absolute -right-4 -top-6 hidden w-40 sm:block">
							<div className="rounded-2xl border border-ink-200 bg-white p-3 shadow-xl">
								<p className="text-[11px] font-medium text-ink-500">
									Store subdomain
								</p>
								<p className="truncate text-xs font-bold text-brand-700">
									sharma.{brand.domain}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function ProblemSection() {
	return (
		<section className="bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="The opportunity"
					title="Your Customers Shop Online. Is Your Store Ready?"
					subtitle="Shoppers increasingly expect online convenience — local discovery, easy ordering, digital payments and home delivery. Many physical grocery stores simply don't have the tools to offer this, especially where national quick-commerce apps have little or no presence."
				/>
				<div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-3">
					{[
						{
							title: "Convenience is the new default",
							body: "Customers want to browse, order and pay from their phone — not call or visit for every item.",
						},
						{
							title: "Building software is costly",
							body: "A custom website, app, backend, payments and delivery tooling is expensive and slow to build alone.",
						},
						{
							title: "You should own your store",
							body: "Bhama Vision gives you the tools to run an independent online store under your own brand.",
						},
					].map((c) => (
						<Card key={c.title}>
							<CardContent>
								<h3 className="font-semibold text-ink-900">{c.title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-ink-500">
									{c.body}
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}

export function HowItWorks() {
	const steps = [
		{
			icon: UserPlus,
			title: "Create your merchant account",
			body: "Sign up with your name, email and mobile — verification keeps it secure.",
		},
		{
			icon: Wallet,
			title: "Choose your plan & business name",
			body: "Pick the plan that fits and reserve your branded store subdomain.",
		},
		{
			icon: Boxes,
			title: "Add products, prices & images",
			body: "Build your grocery catalogue with categories, variants and stock.",
		},
		{
			icon: MapPin,
			title: "Configure delivery & payments",
			body: "Set delivery areas, charges, Cash on Delivery and online payment options.",
		},
		{
			icon: Rocket,
			title: "Launch & share your store link",
			body: "Go live and share your store with customers across your neighbourhood.",
		},
	];
	return (
		<section id="how-it-works" className="py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="How it works"
					title="From shop counter to online store in five steps"
					subtitle="A guided setup that any store owner can complete — with optional assisted onboarding from our team."
				/>
				<div className="mt-12 grid gap-5 lg:grid-cols-5">
					{steps.map((s, i) => (
						<div key={s.title} className="relative">
							<Card className="h-full">
								<CardContent>
									<div className="flex items-center gap-3">
										<span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
											<s.icon className="size-5" />
										</span>
										<span className="text-sm font-bold text-ink-300">
											0{i + 1}
										</span>
									</div>
									<h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
									<p className="mt-2 text-sm leading-relaxed text-ink-500">
										{s.body}
									</p>
								</CardContent>
							</Card>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

export function ProductExperience() {
	const showcases = [
		{
			badge: "Customer Storefront",
			title: "A premium grocery ordering experience",
			body: "Product search, categories, cart and checkout — fast and mobile-first, tuned for lower-cost phones and variable connections.",
			preview: <StorefrontPreview />,
		},
		{
			badge: "Business Dashboard",
			title: "Professional retail management",
			body: "Live orders, sales, inventory and customers — real figures from your store, not placeholder charts.",
			preview: <DashboardPreview />,
		},
		{
			badge: "Delivery Operations",
			title: "Fast, clear delivery control",
			body: "Assign riders, update status and follow authorized live location during active deliveries — designed for use on the move.",
			preview: <DeliveryPreview />,
		},
	];
	return (
		<section className="bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Product experience"
					title="One platform, three polished experiences"
					subtitle="Every interface shares the same backend and design system — distinct where it matters, consistent where it counts."
				/>
				<div className="mt-14 space-y-16">
					{showcases.map((s, i) => (
						<div
							key={s.badge}
							className="grid items-center gap-8 lg:grid-cols-2"
						>
							<div className={i % 2 === 1 ? "lg:order-2" : ""}>
								<Badge variant={i === 2 ? "blue" : i === 1 ? "lime" : "brand"}>
									{s.badge}
								</Badge>
								<h3 className="mt-4 text-2xl font-bold text-ink-900">
									{s.title}
								</h3>
								<p className="mt-3 text-lg leading-relaxed text-ink-500">
									{s.body}
								</p>
							</div>
							<div className={i % 2 === 1 ? "lg:order-1" : ""}>
								<div className="mx-auto max-w-sm">{s.preview}</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

const FEATURES = [
	{ icon: Store, title: "Branded storefront subdomain", tier: "All plans" },
	{ icon: Palette, title: "Logo & theme customization", tier: "All plans" },
	{ icon: Boxes, title: "Product & category management", tier: "All plans" },
	{ icon: ListChecks, title: "Inventory tracking", tier: "All plans" },
	{ icon: Tag, title: "Grocery product variants", tier: "All plans" },
	{ icon: Search, title: "Search & filtering", tier: "All plans" },
	{ icon: Tag, title: "Offers & discount codes", tier: "All plans" },
	{ icon: CreditCard, title: "Online payments", tier: "All plans" },
	{ icon: Banknote, title: "Cash on delivery", tier: "All plans" },
	{ icon: MapPin, title: "Delivery zones & charges", tier: "All plans" },
	{ icon: Bell, title: "Order notifications", tier: "All plans" },
	{ icon: LifeBuoy, title: "Customer support tickets", tier: "All plans" },
	{ icon: BarChart3, title: "Sales analytics", tier: "All plans" },
	{ icon: Bike, title: "Delivery management", tier: "Growth+" },
	{ icon: Users, title: "Marketplace vendor management", tier: "Marketplace" },
];

export function Features() {
	return (
		<section id="features" className="py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Features"
					title="Everything you need to sell groceries online"
					subtitle="Some capabilities depend on your subscription tier — clearly labelled below and enforced by your plan."
				/>
				<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((f) => (
						<div
							key={f.title}
							className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-5"
						>
							<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
								<f.icon className="size-5" />
							</span>
							<div>
								<p className="font-medium text-ink-900">{f.title}</p>
								<span className="mt-1 inline-block text-xs font-semibold text-ink-400">
									{f.tier}
								</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

const SOLUTIONS = [
	{
		title: "Kirana stores",
		body: "Take your neighbourhood shop online with a simple catalogue and local delivery.",
	},
	{
		title: "Supermarkets",
		body: "Manage large catalogues, staff roles and high order volumes with ease.",
	},
	{
		title: "Grocery wholesalers",
		body: "Offer retail delivery alongside your wholesale business from one place.",
	},
	{
		title: "Small-town entrepreneurs",
		body: "Start an online grocery business where big quick-commerce apps don't reach.",
	},
	{
		title: "Multi-store chains",
		body: "Run multiple branded stores and grow operations as demand increases.",
	},
	{
		title: "Local marketplaces",
		body: "Launch a multi-vendor grocery platform with many participating shops.",
	},
];

export function Solutions() {
	return (
		<section id="solutions" className="bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Solutions"
					title="Built for every kind of grocery business"
					subtitle="Tailored to how different stores actually operate."
				/>
				<div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{SOLUTIONS.map((s, i) => (
						<Card key={s.title} className="overflow-hidden">
							<div
								className={`h-28 ${
									[
										"from-brand-100 to-lime-50",
										"from-blue-100 to-brand-50",
										"from-lime-100 to-brand-50",
										"from-brand-50 to-blue-50",
										"from-ink-100 to-brand-50",
										"from-lime-50 to-blue-50",
									][i % 6]
								} bg-gradient-to-br`}
							/>
							<CardContent>
								<h3 className="font-semibold text-ink-900">{s.title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-ink-500">
									{s.body}
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}

export function WhyChoose() {
	const points = [
		{
			icon: Store,
			title: "You own your store identity",
			body: "Your brand, your subdomain, your customers — not a listing on someone else's app.",
		},
		{
			icon: BarChart3,
			title: "Centralized management",
			body: "Products, orders, customers and delivery in one organized dashboard.",
		},
		{
			icon: ShieldCheck,
			title: "No software to build",
			body: "Skip the cost and risk of custom development — subscribe and launch.",
		},
		{
			icon: Wallet,
			title: "Clear subscription options",
			body: "Transparent plans you can upgrade or downgrade as you grow.",
		},
		{
			icon: Bike,
			title: "Local delivery control",
			body: "Run your own delivery team with rider assignment and tracking on eligible plans.",
		},
		{
			icon: LifeBuoy,
			title: "Professional setup assistance",
			body: "Optional assisted onboarding to get your catalogue and store live.",
		},
	];
	return (
		<section className="py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Why Bhama Vision"
					title="One platform for customers, orders and operations"
				/>
				<div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{points.map((p) => (
						<div
							key={p.title}
							className="rounded-2xl border border-ink-100 bg-white p-6"
						>
							<span className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white">
								<p.icon className="size-5" />
							</span>
							<h3 className="mt-4 font-semibold text-ink-900">{p.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-ink-500">
								{p.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
