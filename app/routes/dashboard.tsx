import { Form, Link, redirect } from "react-router";
import {
	LayoutDashboard,
	Package,
	ShoppingCart,
	Users,
	Settings,
	Bike,
	Store as StoreIcon,
	ArrowRight,
	ShieldCheck,
	LogOut,
	ExternalLink,
	Wallet,
	Pill,
} from "lucide-react";
import type { Route } from "./+types/dashboard";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { StoreStatusBadge } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { ONBOARDING_STEPS, STEP_LABELS } from "~/modules/onboarding/schema";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Dashboard — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Your Bhama Vision merchant dashboard.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);

	if (!ctx.tenant) {
		throw redirect("/onboarding/business", { headers: auth.headers });
	}

	// Real, tenant-scoped counts via the RLS client (proves isolation).
	let products = 0;
	let orders = 0;
	if (ctx.tenant) {
		const [p, o] = await Promise.all([
			auth.supabase
				.from("products")
				.select("id", { count: "exact", head: true })
				.eq("tenant_id", ctx.tenant.id),
			auth.supabase
				.from("orders")
				.select("id", { count: "exact", head: true })
				.eq("tenant_id", ctx.tenant.id),
		]);
		products = p.count ?? 0;
		orders = o.count ?? 0;
	}

	const { data: profile } = await auth.supabase
		.from("user_profiles")
		.select("full_name, platform_role")
		.eq("id", user.id)
		.maybeSingle();

	return {
		brand,
		apex: env.PUBLIC_APP_DOMAIN,
		email: user.email,
		fullName: profile?.full_name ?? "",
		isAdmin: profile?.platform_role === "platform_admin",
		ctx,
		stats: { products, orders },
	};
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
	const { brand, apex, email, fullName, isAdmin, ctx, stats } = loaderData;
	const store = ctx.store!;
	const onboarding = ctx.onboarding;
	const submitted = onboarding?.current_step === "submitted";
	const subStatus = ctx.subscription?.status ?? "pending";
	const entitlementsActive = subStatus === "active";
	const subdomain = `${store.slug}.${apex}`;

	const nav: {
		label: string;
		icon: React.ElementType;
		to?: string;
		href?: string;
		active?: boolean;
	}[] = [
		{
			label: "Overview",
			icon: LayoutDashboard,
			to: "/dashboard",
			active: true,
		},
		{ label: "Products", icon: Package, to: "/dashboard/products" },
		{ label: "Payments", icon: Wallet, to: "/dashboard/payments" },
		{ label: "Pharmacy", icon: Pill, to: "/dashboard/pharmacy" },
		{ label: "Orders", icon: ShoppingCart, to: "/dashboard/orders" },
		{ label: "Customers", icon: Users },
		{ label: "Delivery", icon: Bike, to: "/dashboard/delivery" },
		{ label: "Storefront", icon: StoreIcon, href: `/store/${store.slug}` },
		{ label: "Settings", icon: Settings, to: "/dashboard/settings" },
	];

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<div className="flex items-center gap-3">
						{isAdmin && (
							<Link to="/admin/merchants">
								<Button variant="outline" size="sm">
									<ShieldCheck /> Superadmin
								</Button>
							</Link>
						)}
						<span className="hidden text-sm text-ink-500 sm:block">
							{fullName || email}
						</span>
						<Form method="post" action="/logout">
							<Button variant="ghost" size="sm" type="submit">
								<LogOut /> Log out
							</Button>
						</Form>
					</div>
				</div>
			</header>

			<div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
				{/* Sidebar */}
				<aside className="hidden lg:block">
					<nav className="space-y-1">
						{nav.map((item) => {
							const label = (
								<span className="flex items-center gap-2.5">
									<item.icon className="size-4" /> {item.label}
								</span>
							);
							if (item.active) {
								return (
									<div
										key={item.label}
										className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-800"
									>
										{label}
									</div>
								);
							}
							if (item.to) {
								return (
									<Link
										key={item.label}
										to={item.to}
										className="flex items-center rounded-xl px-3 py-2.5 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900"
									>
										{label}
									</Link>
								);
							}
							if (item.href) {
								return (
									<a
										key={item.label}
										href={item.href}
										target="_blank"
										rel="noreferrer"
										className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900"
									>
										{label}
										<ExternalLink className="size-3.5 text-ink-400" />
									</a>
								);
							}
							return (
								<div
									key={item.label}
									className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-ink-400"
								>
									{label}
									<span className="text-[10px] font-medium uppercase">
										soon
									</span>
								</div>
							);
						})}
					</nav>
				</aside>

				<main className="space-y-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h1 className="text-2xl font-bold text-ink-900">
								{store.display_name}
							</h1>
							<p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
								<span className="font-medium text-brand-700">{subdomain}</span>
								<StoreStatusBadge status={store.status} />
							</p>
						</div>
						{ctx.subscription?.plan && (
							<Badge variant={entitlementsActive ? "brand" : "outline"}>
								{ctx.subscription.plan.name} ·{" "}
								{entitlementsActive ? "active" : "pending"}
							</Badge>
						)}
					</div>

					{/* Entitlement / activation notice */}
					{!entitlementsActive && (
						<div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
							<p className="font-semibold">Your store is not live yet.</p>
							<p className="mt-1">
								{submitted
									? "Your store is in review. Paid features stay locked until a verified payment or Bhama Vision activates your account — we never enable them automatically."
									: "Finish onboarding and submit for review. Paid features stay locked until activation."}
							</p>
							{!submitted && (
								<Link to="/onboarding" className="mt-3 inline-block">
									<Button size="sm">
										Continue onboarding <ArrowRight />
									</Button>
								</Link>
							)}
						</div>
					)}

					{/* Onboarding checklist */}
					{!submitted && onboarding && (
						<Card>
							<CardContent>
								<h2 className="font-semibold text-ink-900">Setup checklist</h2>
								<ul className="mt-4 space-y-2">
									{ONBOARDING_STEPS.map((s) => {
										const done = onboarding.completed_steps.includes(s);
										return (
											<li key={s} className="flex items-center gap-2.5 text-sm">
												<span
													className={
														done
															? "size-2.5 rounded-full bg-brand-600"
															: "size-2.5 rounded-full bg-ink-200"
													}
												/>
												<span
													className={done ? "text-ink-700" : "text-ink-400"}
												>
													{STEP_LABELS[s]}
												</span>
											</li>
										);
									})}
								</ul>
							</CardContent>
						</Card>
					)}

					{/* Real stats */}
					<div className="grid gap-4 sm:grid-cols-3">
						<StatCard label="Products" value={stats.products} icon={Package} />
						<StatCard label="Orders" value={stats.orders} icon={ShoppingCart} />
						<StatCard
							label="Store status"
							value={store.status.replace("_", " ")}
							icon={StoreIcon}
							text
						/>
					</div>

					<Card>
						<CardContent>
							<h2 className="font-semibold text-ink-900">What's next</h2>
							<p className="mt-2 text-sm text-ink-500">
								Build your catalogue and preview your storefront. Orders,
								customers and delivery arrive in the next phases.
							</p>
							<div className="mt-4 flex flex-wrap gap-2">
								<Link to="/dashboard/products">
									<Button size="sm">
										<Package /> Manage products
									</Button>
								</Link>
								<a
									href={`/store/${store.slug}`}
									target="_blank"
									rel="noreferrer"
								>
									<Button size="sm" variant="outline">
										<ExternalLink /> View storefront
									</Button>
								</a>
							</div>
						</CardContent>
					</Card>
				</main>
			</div>
		</div>
	);
}

function StatCard({
	label,
	value,
	icon: Icon,
	text,
}: {
	label: string;
	value: number | string;
	icon: React.ElementType;
	text?: boolean;
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-4">
				<span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
					<Icon className="size-5" />
				</span>
				<div>
					<p
						className={
							text
								? "text-lg font-bold capitalize text-ink-900"
								: "text-2xl font-bold text-ink-900"
						}
					>
						{value}
					</p>
					<p className="text-sm text-ink-500">{label}</p>
				</div>
			</CardContent>
		</Card>
	);
}
