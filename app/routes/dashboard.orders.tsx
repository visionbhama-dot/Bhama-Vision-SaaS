import { Link, redirect, useSubmit } from "react-router";
import {
	ArrowLeft,
	ShoppingCart,
	IndianRupee,
	Clock,
	PackageCheck,
} from "lucide-react";
import type { Route } from "./+types/dashboard.orders";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { formatInrMinor } from "~/lib/utils";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/field";
import { getOrderStats, listOrders } from "~/modules/orders/service.server";
import {
	ORDER_STATUS_LABELS,
	ORDER_STATUSES,
	type OrderStatus,
} from "~/modules/orders/status";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Orders — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Orders.",
		siteName: data?.brand.name ?? "Bhama Vision",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant)
		throw redirect("/onboarding/business", { headers: auth.headers });

	const url = new URL(request.url);
	const status = url.searchParams.get("status") ?? "all";
	const search = url.searchParams.get("q") ?? "";
	const page = Number(url.searchParams.get("page") ?? "1") || 1;

	const [stats, list] = await Promise.all([
		getOrderStats(auth.supabase, ctx.tenant.id),
		listOrders(auth.supabase, ctx.tenant.id, {
			status,
			search,
			page,
			pageSize: 20,
		}),
	]);
	return { brand, stats, list, params: { status, search } };
}

const STATUS_VARIANT: Record<
	string,
	"brand" | "neutral" | "lime" | "blue" | "outline"
> = {
	placed: "blue",
	accepted: "brand",
	preparing: "brand",
	packed: "brand",
	out_for_delivery: "brand",
	delivered: "lime",
	cancelled: "neutral",
	rejected: "neutral",
};

export default function Orders({ loaderData }: Route.ComponentProps) {
	const { brand, stats, list, params } = loaderData;
	const submit = useSubmit();

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link to="/dashboard">
						<Button variant="ghost" size="sm">
							<ArrowLeft /> Dashboard
						</Button>
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<h1 className="text-2xl font-bold text-ink-900">Orders</h1>

				{stats.newCount > 0 && (
					<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
						You have <strong>{stats.newCount}</strong> new order
						{stats.newCount > 1 ? "s" : ""} waiting to be accepted.
					</div>
				)}

				<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<Stat icon={Clock} label="New" value={stats.newCount} />
					<Stat
						icon={ShoppingCart}
						label="In progress"
						value={stats.activeCount}
					/>
					<Stat
						icon={PackageCheck}
						label="Delivered today"
						value={stats.deliveredToday}
					/>
					<Stat
						icon={IndianRupee}
						label="Revenue today"
						value={formatInrMinor(stats.revenueTodayPaise)}
						text
					/>
				</div>

				{/* Filters */}
				<form
					method="get"
					onChange={(e) => submit(e.currentTarget)}
					className="mt-6 flex flex-wrap items-center gap-2"
				>
					<Input
						name="q"
						defaultValue={params.search}
						placeholder="Search order number"
						className="max-w-xs"
						aria-label="Search orders"
					/>
					<select
						name="status"
						defaultValue={params.status}
						aria-label="Status"
						className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"
					>
						<option value="all">All statuses</option>
						{ORDER_STATUSES.map((s) => (
							<option key={s} value={s}>
								{ORDER_STATUS_LABELS[s]}
							</option>
						))}
					</select>
				</form>

				<Card className="mt-3">
					<CardContent className="sm:p-4">
						{list.items.length === 0 ? (
							<p className="py-10 text-center text-sm text-ink-400">
								No orders yet.
							</p>
						) : (
							<ul className="divide-y divide-ink-100">
								{list.items.map((o) => (
									<li key={o.id}>
										<Link
											to={`/dashboard/orders/${o.id}`}
											className="flex items-center justify-between gap-3 py-3 hover:bg-ink-50/50"
										>
											<div className="min-w-0">
												<p className="flex items-center gap-2 font-medium text-ink-900">
													<span className="font-mono text-sm">{o.number}</span>
													<Badge
														variant={STATUS_VARIANT[o.status] ?? "neutral"}
													>
														{ORDER_STATUS_LABELS[o.status as OrderStatus] ??
															o.status}
													</Badge>
												</p>
												<p className="text-sm text-ink-500">
													{o.customerName ?? "Customer"} ·{" "}
													{o.paymentMethod.toUpperCase()}
													{o.paymentState === "paid"
														? " · paid"
														: o.paymentMethod === "cod"
															? " · collect"
															: " · unpaid"}
												</p>
											</div>
											<span className="shrink-0 font-semibold text-ink-900">
												{formatInrMinor(o.totalPaise)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function Stat({
	icon: Icon,
	label,
	value,
	text,
}: {
	icon: React.ElementType;
	label: string;
	value: number | string;
	text?: boolean;
}) {
	return (
		<div className="rounded-2xl border border-ink-100 bg-white p-4">
			<span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
				<Icon className="size-4" />
			</span>
			<p
				className={
					text
						? "mt-2 text-lg font-bold text-ink-900"
						: "mt-2 text-2xl font-bold text-ink-900"
				}
			>
				{value}
			</p>
			<p className="text-xs text-ink-500">{label}</p>
		</div>
	);
}
