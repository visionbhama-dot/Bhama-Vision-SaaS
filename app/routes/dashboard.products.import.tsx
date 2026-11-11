import { useMemo, useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import {
	ArrowLeft,
	CheckCircle2,
	Layers,
	Loader2,
	PackagePlus,
	Search,
} from "lucide-react";
import type { Route } from "./+types/dashboard.products.import";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/field";
import {
	getPackProducts,
	importMasterProducts,
	listPacks,
} from "~/modules/catalogue/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Add from catalogue — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Import ready-made products.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
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
	const packSlug = url.searchParams.get("pack");

	if (!packSlug) {
		const packs = await listPacks(auth.supabase);
		return {
			brand,
			mode: "packs" as const,
			packs,
			pack: null,
			products: [],
			subcategories: [],
			ownedIds: [] as string[],
		};
	}

	const detail = await getPackProducts(auth.supabase, packSlug);
	if (!detail) {
		const packs = await listPacks(auth.supabase);
		return {
			brand,
			mode: "packs" as const,
			packs,
			pack: null,
			products: [],
			subcategories: [],
			ownedIds: [] as string[],
		};
	}

	// Which of this pack's master products does the merchant already have?
	const masterIds = detail.products.map((p) => p.id);
	const { data: owned } = await auth.supabase
		.from("products")
		.select("master_product_id")
		.eq("tenant_id", ctx.tenant.id)
		.in(
			"master_product_id",
			masterIds.length ? masterIds : ["00000000-0000-0000-0000-000000000000"],
		);
	const ownedIds = (owned ?? [])
		.map((o) => o.master_product_id as string)
		.filter(Boolean);

	return {
		brand,
		mode: "detail" as const,
		packs: [],
		pack: detail.pack,
		products: detail.products,
		subcategories: detail.subcategories,
		ownedIds,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store found." };

	const form = await request.formData();
	const ids = form.getAll("masterId").map(String).filter(Boolean);
	const packId = String(form.get("packId") ?? "") || null;
	if (ids.length === 0)
		return { error: "Select at least one product to import." };

	const result = await importMasterProducts(
		auth.supabase,
		ctx.tenant.id,
		user.id,
		ids,
		packId,
	);
	if (!result.ok && result.created === 0 && result.error)
		return { error: result.error };
	return { result };
}

export default function ImportCatalogue({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand } = loaderData;

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link to="/dashboard/products">
						<Button variant="ghost" size="sm">
							<ArrowLeft /> Back to products
						</Button>
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				{loaderData.mode === "packs" ? (
					<PackGrid loaderData={loaderData} />
				) : (
					<PackDetailView loaderData={loaderData} actionData={actionData} />
				)}
			</div>
		</div>
	);
}

function PackGrid({
	loaderData,
}: {
	loaderData: Route.ComponentProps["loaderData"];
}) {
	return (
		<>
			<h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
				<Layers className="size-6 text-brand-700" /> Add from catalogue
			</h1>
			<p className="mt-1 max-w-2xl text-sm text-ink-500">
				Start fast with a ready-made pack. Pick the items you stock —
				they&apos;re added as <strong>drafts</strong> so you can set your own
				prices and stock before publishing.
			</p>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{loaderData.packs.map((pack) => (
					<Link
						key={pack.id}
						to={`/dashboard/products/import?pack=${pack.slug}`}
						className="group"
					>
						<Card className="h-full transition-colors group-hover:border-brand-300">
							<CardContent>
								<div className="flex items-center justify-between">
									<h2 className="font-semibold text-ink-900">{pack.name}</h2>
									<Badge variant="brand">{pack.productCount}</Badge>
								</div>
								<p className="mt-2 text-sm text-ink-500">{pack.description}</p>
								<p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
									Browse products →
								</p>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
			{loaderData.packs.length === 0 && (
				<p className="mt-6 rounded-xl border border-ink-100 bg-white p-6 text-sm text-ink-400">
					No catalogue packs are available yet. (Apply migration 0017 to seed
					them.)
				</p>
			)}
		</>
	);
}

function PackDetailView({
	loaderData,
	actionData,
}: {
	loaderData: Route.ComponentProps["loaderData"];
	actionData: Route.ComponentProps["actionData"];
}) {
	const { pack, products, subcategories, ownedIds } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);

	const [search, setSearch] = useState("");
	const [sub, setSub] = useState<string>("");
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		return products.filter(
			(p) =>
				(!sub || p.subcategory === sub) &&
				(!q || p.name.toLowerCase().includes(q)),
		);
	}, [products, search, sub]);

	const selectableVisible = visible.filter((p) => !ownedSet.has(p.id));
	const allVisibleSelected =
		selectableVisible.length > 0 &&
		selectableVisible.every((p) => selected.has(p.id));

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function selectAllVisible() {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const p of selectableVisible) next.add(p.id);
			return next;
		});
	}
	function deselectAll() {
		setSelected(new Set());
	}

	const result = (
		actionData as {
			result?: {
				total: number;
				created: number;
				skipped: number;
				failed: number;
			};
		}
	)?.result;
	const error = (actionData as { error?: string })?.error;

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold text-ink-900">{pack?.name}</h1>
					<p className="mt-1 text-sm text-ink-500">{pack?.description}</p>
				</div>
				<Link
					to="/dashboard/products/import"
					className="text-sm font-medium text-brand-700"
				>
					← All packs
				</Link>
			</div>

			{result && (
				<div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
					<p className="flex items-center gap-2 font-semibold">
						<CheckCircle2 className="size-4" /> Import complete
					</p>
					<p className="mt-1">
						Added <strong>{result.created}</strong> new draft product(s).
						{result.skipped > 0 && (
							<> {result.skipped} already in your catalogue (skipped).</>
						)}
						{result.failed > 0 && <> {result.failed} failed.</>}{" "}
						<Link to="/dashboard/products" className="font-semibold underline">
							Go to products
						</Link>{" "}
						to set prices and publish.
					</p>
				</div>
			)}
			{error && (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			)}

			{/* Controls */}
			<div className="mt-6 flex flex-wrap items-center gap-2">
				<div className="relative flex-1 min-w-[200px]">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search products"
						className="pl-9"
						aria-label="Search products"
					/>
				</div>
				<select
					value={sub}
					onChange={(e) => setSub(e.target.value)}
					className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"
					aria-label="Filter by category"
				>
					<option value="">All categories</option>
					{subcategories.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={selectAllVisible}
				>
					Select all ({selectableVisible.length})
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
					Clear
				</Button>
			</div>

			<Form method="post" className="mt-4">
				<input type="hidden" name="packId" value={pack?.id ?? ""} />
				{[...selected].map((id) => (
					<input key={id} type="hidden" name="masterId" value={id} />
				))}

				<div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-ink-100 bg-white/90 px-4 py-3 backdrop-blur">
					<p className="text-sm text-ink-600">
						<strong className="text-ink-900">{selected.size}</strong> selected ·{" "}
						{visible.length} shown
					</p>
					<Button type="submit" disabled={busy || selected.size === 0}>
						{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />}
						Import {selected.size > 0 ? `${selected.size} ` : ""}as drafts
					</Button>
				</div>

				<ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
					{visible.map((p) => {
						const owned = ownedSet.has(p.id);
						const checked = selected.has(p.id);
						return (
							<li key={p.id} className="flex items-center gap-3 px-4 py-3">
								<input
									type="checkbox"
									className="size-4 rounded border-ink-300 text-brand-600 disabled:opacity-40"
									checked={checked}
									disabled={owned}
									onChange={() => toggle(p.id)}
									aria-label={`Select ${p.name}`}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-ink-900">
										{p.name}
									</p>
									<p className="text-xs text-ink-400">
										{[p.subcategory, p.packSize].filter(Boolean).join(" · ")}
									</p>
								</div>
								{owned ? (
									<Badge variant="neutral">Added</Badge>
								) : (
									<Badge variant="outline">{p.classification}</Badge>
								)}
							</li>
						);
					})}
				</ul>
				{allVisibleSelected && selectableVisible.length > 0 && (
					<p className="mt-2 text-xs text-ink-400">
						All shown products selected.
					</p>
				)}
			</Form>
		</>
	);
}
