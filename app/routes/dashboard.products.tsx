import { useState } from "react";
import { Form, Link, redirect, useNavigation, useSubmit } from "react-router";
import {
	Loader2,
	Plus,
	ArrowLeft,
	Eye,
	EyeOff,
	Trash2,
	ArchiveRestore,
	ExternalLink,
	Package,
	Layers,
	FileSpreadsheet,
	Search,
	Tag,
	Boxes,
} from "lucide-react";
import type { Route } from "./+types/dashboard.products";
import { z } from "zod";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { formatInrMinor } from "~/lib/utils";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input, Textarea, Label, FieldError } from "~/components/ui/field";
import {
	bulkAction,
	getProductStats,
	listProducts,
	type ProductSort,
	type ProductStatusFilter,
	type StockFilter,
} from "~/modules/products/service.server";
import { BULK_ACTIONS, type BulkAction } from "~/modules/products/schema";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Products — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Manage your store catalogue.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

const productSchema = z.object({
	name: z.string().trim().min(2, "Enter a product name").max(160),
	priceRupees: z.coerce
		.number()
		.min(0, "Price must be 0 or more")
		.max(1_000_000),
	mrpRupees: z.coerce.number().min(0).max(1_000_000).default(0),
	unit: z.string().trim().max(40).optional().or(z.literal("")),
	description: z.string().trim().max(2000).optional().or(z.literal("")),
	isVisible: z.coerce.boolean().default(true),
});

function slugifyName(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 50) || "item"
	);
}
function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 6);
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant || !ctx.store) {
		throw redirect("/onboarding/business", { headers: auth.headers });
	}

	const url = new URL(request.url);
	const search = url.searchParams.get("q") ?? "";
	const status = (url.searchParams.get("status") ??
		"all") as ProductStatusFilter;
	const stock = (url.searchParams.get("stock") ?? "all") as StockFilter;
	const sort = (url.searchParams.get("sort") ?? "recent") as ProductSort;
	const page = Number(url.searchParams.get("page") ?? "1") || 1;

	const [stats, list] = await Promise.all([
		getProductStats(auth.supabase, ctx.tenant.id),
		listProducts(auth.supabase, ctx.tenant.id, {
			search,
			status,
			stock,
			sort,
			page,
			pageSize: 20,
		}),
	]);

	return {
		brand,
		slug: ctx.store.slug,
		storeActive: ctx.store.status === "active",
		stats,
		list,
		params: { search, status, stock, sort },
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store found." };
	const tenantId = ctx.tenant.id;

	const form = await request.formData();
	const intent = String(form.get("intent") ?? "add");

	if (intent === "bulk") {
		const action = String(form.get("bulkAction") ?? "") as BulkAction;
		if (!BULK_ACTIONS.includes(action))
			return { error: "Unknown bulk action." };
		const ids = form.getAll("id").map(String).filter(Boolean);
		const value =
			form.get("value") == null ? undefined : String(form.get("value"));
		const r = await bulkAction(auth.supabase, tenantId, action, ids, value);
		return r.ok
			? { ok: `Updated ${r.affected} product${r.affected === 1 ? "" : "s"}.` }
			: { error: r.error };
	}

	// intent === "add"
	const parsed = parseForm(productSchema, form, { booleans: ["isVisible"] });
	if (!parsed.success)
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };
	const d = parsed.data;
	const { data: inserted, error } = await auth.supabase
		.from("products")
		.insert({
			tenant_id: tenantId,
			name: d.name,
			slug: `${slugifyName(d.name)}-${randomSuffix()}`,
			price_paise: Math.round(d.priceRupees * 100),
			mrp_paise:
				d.mrpRupees > d.priceRupees ? Math.round(d.mrpRupees * 100) : null,
			unit: d.unit || null,
			description: d.description || null,
			is_visible: d.isVisible,
			status: "published",
			source: "manual",
		})
		.select("id")
		.maybeSingle();
	if (error || !inserted)
		return { error: error?.message ?? "Could not add the product." };
	return { ok: `Added "${d.name}".`, added: true };
}

export default function DashboardProducts({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, slug, storeActive, stats, list, params } = loaderData;
	const nav = useNavigation();
	const submit = useSubmit();
	const busy = nav.state !== "idle";
	const errors = (actionData?.fieldErrors ?? {}) as Record<string, string>;
	const values = (actionData?.values ?? {}) as Record<string, string>;
	const okMsg = (actionData as { ok?: string })?.ok;
	const errMsg = (actionData as { error?: string })?.error;

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const pageIds = list.items.map((p) => p.id);
	const allChecked =
		pageIds.length > 0 && pageIds.every((id) => selected.has(id));

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function toggleAll() {
		setSelected((prev) => {
			const next = new Set(prev);
			if (allChecked) pageIds.forEach((id) => next.delete(id));
			else pageIds.forEach((id) => next.add(id));
			return next;
		});
	}
	const selectedIds = [...selected];

	const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<div className="flex items-center gap-2">
						<a href={`/store/${slug}`} target="_blank" rel="noreferrer">
							<Button variant="outline" size="sm">
								<ExternalLink /> View storefront
							</Button>
						</a>
						<Link to="/dashboard">
							<Button variant="ghost" size="sm">
								<ArrowLeft /> Dashboard
							</Button>
						</Link>
					</div>
				</div>
			</header>

			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold text-ink-900">Products</h1>
						<p className="mt-1 text-sm text-ink-500">
							Build and manage your catalogue. New items are drafts until you
							publish.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Link to="/dashboard/products/import">
							<Button size="sm">
								<Layers /> Add from catalogue
							</Button>
						</Link>
						<Link to="/dashboard/products/csv">
							<Button size="sm" variant="outline">
								<FileSpreadsheet /> Import / export CSV
							</Button>
						</Link>
					</div>
				</div>

				{!storeActive && (
					<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						Your store isn&apos;t active yet, so the public storefront stays
						hidden until it&apos;s approved. You can still build your catalogue
						now.
					</div>
				)}
				{okMsg && (
					<div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
						{okMsg}
					</div>
				)}
				{errMsg && (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{errMsg}
					</div>
				)}

				{/* Stats */}
				<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					<Stat label="Total" value={stats.total} />
					<Stat label="Published" value={stats.published} />
					<Stat label="Drafts" value={stats.drafts} />
					<Stat
						label="Out of stock"
						value={stats.outOfStock}
						warn={stats.outOfStock > 0}
					/>
					<Stat
						label="Low stock"
						value={stats.lowStock}
						warn={stats.lowStock > 0}
					/>
				</div>

				{/* Empty-state guidance for first-time merchants */}
				{stats.total === 0 && (
					<Card className="mt-6">
						<CardContent className="text-center">
							<span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
								<Package className="size-6" />
							</span>
							<h2 className="mt-3 font-semibold text-ink-900">
								Start your catalogue
							</h2>
							<p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
								The fastest way to begin is a ready-made pack — add hundreds of
								common items in a couple of clicks, then set your prices.
							</p>
							<div className="mt-4 flex justify-center gap-2">
								<Link to="/dashboard/products/import">
									<Button size="sm">
										<Layers /> Add from catalogue
									</Button>
								</Link>
								<Link to="/dashboard/products/csv">
									<Button size="sm" variant="outline">
										<FileSpreadsheet /> Import CSV
									</Button>
								</Link>
							</div>
						</CardContent>
					</Card>
				)}

				<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
					{/* List + filters + bulk */}
					<div>
						{/* Filters */}
						<Form
							method="get"
							onChange={(e) => submit(e.currentTarget)}
							className="flex flex-wrap items-center gap-2"
						>
							<div className="relative flex-1 min-w-[180px]">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
								<Input
									name="q"
									defaultValue={params.search}
									placeholder="Search products"
									className="pl-9"
									aria-label="Search"
								/>
							</div>
							<FilterSelect
								name="status"
								defaultValue={params.status}
								label="Status"
								options={[
									["all", "All"],
									["published", "Published"],
									["draft", "Drafts"],
									["archived", "Archived"],
								]}
							/>
							<FilterSelect
								name="stock"
								defaultValue={params.stock}
								label="Stock"
								options={[
									["all", "All stock"],
									["out", "Out of stock"],
									["low", "Low stock"],
								]}
							/>
							<FilterSelect
								name="sort"
								defaultValue={params.sort}
								label="Sort"
								options={[
									["recent", "Recent"],
									["name", "Name A–Z"],
									["price_asc", "Price ↑"],
									["price_desc", "Price ↓"],
								]}
							/>
						</Form>

						{/* Bulk bar */}
						{selectedIds.length > 0 && (
							<BulkBar
								ids={selectedIds}
								busy={busy}
								onClear={() => setSelected(new Set())}
							/>
						)}

						{/* List */}
						<Card className="mt-3">
							<CardContent className="sm:p-4">
								<div className="flex items-center justify-between border-b border-ink-100 pb-2">
									<label className="flex items-center gap-2 text-sm text-ink-600">
										<input
											type="checkbox"
											checked={allChecked}
											onChange={toggleAll}
											className="size-4 rounded border-ink-300 text-brand-600"
											aria-label="Select all on this page"
										/>
										Select page
									</label>
									<span className="text-sm text-ink-400">
										{list.total} total
									</span>
								</div>

								{list.items.length === 0 ? (
									<p className="py-10 text-center text-sm text-ink-400">
										No products match these filters.
									</p>
								) : (
									<ul className="divide-y divide-ink-100">
										{list.items.map((p) => (
											<li key={p.id} className="flex items-center gap-3 py-3">
												<input
													type="checkbox"
													checked={selected.has(p.id)}
													onChange={() => toggle(p.id)}
													className="size-4 rounded border-ink-300 text-brand-600"
													aria-label={`Select ${p.name}`}
												/>
												<div className="min-w-0 flex-1">
													<p className="flex items-center gap-2 truncate font-medium text-ink-900">
														{p.name}
														{p.status === "draft" && (
															<Badge variant="neutral">Draft</Badge>
														)}
														{p.status === "published" && !p.isVisible && (
															<Badge variant="outline">Hidden</Badge>
														)}
														{p.archived && (
															<Badge variant="neutral">Archived</Badge>
														)}
													</p>
													<p className="text-sm text-ink-500">
														{formatInrMinor(p.pricePaise)}
														{p.unit ? ` · ${p.unit}` : ""}
														{p.category ? ` · ${p.category}` : ""}
														{p.stock != null ? ` · ${p.stock} in stock` : ""}
													</p>
												</div>
												{/* Per-row quick actions reuse the bulk endpoint with one id */}
												<RowActions
													id={p.id}
													isVisible={p.isVisible}
													archived={p.archived}
													busy={busy}
												/>
											</li>
										))}
									</ul>
								)}

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-sm">
										<PageLink
											params={params}
											page={list.page - 1}
											disabled={list.page <= 1}
											label="← Prev"
										/>
										<span className="text-ink-400">
											Page {list.page} of {totalPages}
										</span>
										<PageLink
											params={params}
											page={list.page + 1}
											disabled={list.page >= totalPages}
											label="Next →"
										/>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Add product */}
					<Card className="h-fit">
						<CardContent>
							<h2 className="flex items-center gap-2 font-semibold text-ink-900">
								<Plus className="size-4" /> Add a product
							</h2>
							<Form method="post" className="mt-4 space-y-4" noValidate>
								<input type="hidden" name="intent" value="add" />
								<div>
									<Label htmlFor="name">Product name</Label>
									<Input
										id="name"
										name="name"
										defaultValue={values.name}
										aria-invalid={!!errors.name}
										placeholder="Toor Dal 1 kg"
									/>
									<FieldError>{errors.name}</FieldError>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div>
										<Label htmlFor="priceRupees">Price (₹)</Label>
										<Input
											id="priceRupees"
											name="priceRupees"
											type="number"
											min={0}
											step="0.01"
											defaultValue={values.priceRupees}
											aria-invalid={!!errors.priceRupees}
										/>
										<FieldError>{errors.priceRupees}</FieldError>
									</div>
									<div>
										<Label htmlFor="mrpRupees">MRP (₹)</Label>
										<Input
											id="mrpRupees"
											name="mrpRupees"
											type="number"
											min={0}
											step="0.01"
											defaultValue={values.mrpRupees}
											placeholder="Optional"
										/>
									</div>
								</div>
								<div>
									<Label htmlFor="unit">Unit (optional)</Label>
									<Input
										id="unit"
										name="unit"
										defaultValue={values.unit}
										placeholder="1 kg / 500 g / 1 pc"
									/>
								</div>
								<div>
									<Label htmlFor="description">Description (optional)</Label>
									<Textarea
										id="description"
										name="description"
										defaultValue={values.description}
									/>
								</div>
								<label className="flex items-center gap-2.5 text-sm text-ink-700">
									<input
										type="checkbox"
										name="isVisible"
										defaultChecked
										className="size-4 rounded border-ink-300 text-brand-600"
									/>
									Publish &amp; show on storefront
								</label>
								<Button
									type="submit"
									size="lg"
									className="w-full"
									disabled={busy}
								>
									{busy ? (
										<>
											<Loader2 className="animate-spin" /> Saving…
										</>
									) : (
										<>
											<Plus /> Add product
										</>
									)}
								</Button>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function Stat({
	label,
	value,
	warn,
}: {
	label: string;
	value: number;
	warn?: boolean;
}) {
	return (
		<div className="rounded-2xl border border-ink-100 bg-white p-4">
			<p
				className={
					warn
						? "text-2xl font-bold text-amber-600"
						: "text-2xl font-bold text-ink-900"
				}
			>
				{value}
			</p>
			<p className="text-xs text-ink-500">{label}</p>
		</div>
	);
}

function FilterSelect({
	name,
	defaultValue,
	label,
	options,
}: {
	name: string;
	defaultValue: string;
	label: string;
	options: [string, string][];
}) {
	return (
		<select
			name={name}
			defaultValue={defaultValue}
			aria-label={label}
			className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm"
		>
			{options.map(([v, l]) => (
				<option key={v} value={v}>
					{l}
				</option>
			))}
		</select>
	);
}

function HiddenIds({ ids }: { ids: string[] }) {
	return (
		<>
			{ids.map((id) => (
				<input key={id} type="hidden" name="id" value={id} />
			))}
		</>
	);
}

function BulkBar({
	ids,
	busy,
	onClear,
}: {
	ids: string[];
	busy: boolean;
	onClear: () => void;
}) {
	return (
		<div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm font-semibold text-ink-900">
					{ids.length} selected
				</p>
				<button
					type="button"
					onClick={onClear}
					className="text-sm text-ink-500 hover:text-ink-900"
				>
					Clear
				</button>
			</div>
			<div className="mt-3 flex flex-wrap items-end gap-2">
				{/* Price */}
				<Form method="post" className="flex items-end gap-1">
					<input type="hidden" name="intent" value="bulk" />
					<input type="hidden" name="bulkAction" value="price" />
					<HiddenIds ids={ids} />
					<label className="text-xs text-ink-600">
						Price ₹
						<Input
							name="value"
							type="number"
							min={0}
							step="0.01"
							className="mt-0.5 w-24"
						/>
					</label>
					<Button type="submit" size="sm" variant="outline" disabled={busy}>
						<Tag /> Set
					</Button>
				</Form>
				{/* Stock */}
				<Form method="post" className="flex items-end gap-1">
					<input type="hidden" name="intent" value="bulk" />
					<input type="hidden" name="bulkAction" value="stock" />
					<HiddenIds ids={ids} />
					<label className="text-xs text-ink-600">
						Stock
						<Input
							name="value"
							type="number"
							min={0}
							step="1"
							className="mt-0.5 w-20"
						/>
					</label>
					<Button type="submit" size="sm" variant="outline" disabled={busy}>
						<Boxes /> Set
					</Button>
				</Form>
				{/* Category */}
				<Form method="post" className="flex items-end gap-1">
					<input type="hidden" name="intent" value="bulk" />
					<input type="hidden" name="bulkAction" value="category" />
					<HiddenIds ids={ids} />
					<label className="text-xs text-ink-600">
						Category
						<Input
							name="value"
							className="mt-0.5 w-32"
							placeholder="e.g. Pulses"
						/>
					</label>
					<Button type="submit" size="sm" variant="outline" disabled={busy}>
						Set
					</Button>
				</Form>
				{/* Status actions */}
				<Form method="post" className="flex items-end gap-1">
					<input type="hidden" name="intent" value="bulk" />
					<HiddenIds ids={ids} />
					<Button
						type="submit"
						name="bulkAction"
						value="publish"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						<Eye /> Publish
					</Button>
					<Button
						type="submit"
						name="bulkAction"
						value="unpublish"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						<EyeOff /> Unpublish
					</Button>
					<Button
						type="submit"
						name="bulkAction"
						value="restore"
						size="sm"
						variant="outline"
						disabled={busy}
					>
						<ArchiveRestore /> Restore
					</Button>
					<Button
						type="submit"
						name="bulkAction"
						value="archive"
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={(e) => {
							if (
								!confirm(
									`Archive ${ids.length} product(s)? They leave your storefront but order history is kept.`,
								)
							)
								e.preventDefault();
						}}
					>
						<Trash2 /> Archive
					</Button>
				</Form>
			</div>
		</div>
	);
}

function RowActions({
	id,
	isVisible,
	archived,
	busy,
}: {
	id: string;
	isVisible: boolean;
	archived: boolean;
	busy: boolean;
}) {
	return (
		<div className="flex shrink-0 items-center gap-1">
			<Form method="post">
				<input type="hidden" name="intent" value="bulk" />
				<input
					type="hidden"
					name="bulkAction"
					value={isVisible ? "unpublish" : "publish"}
				/>
				<input type="hidden" name="id" value={id} />
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					disabled={busy}
					title={isVisible ? "Hide" : "Publish"}
				>
					{isVisible ? <Eye /> : <EyeOff />}
				</Button>
			</Form>
			<Form method="post">
				<input type="hidden" name="intent" value="bulk" />
				<input
					type="hidden"
					name="bulkAction"
					value={archived ? "restore" : "archive"}
				/>
				<input type="hidden" name="id" value={id} />
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					disabled={busy}
					title={archived ? "Restore" : "Archive"}
					onClick={(e) => {
						if (
							!archived &&
							!confirm(
								"Archive this product? It leaves your storefront but order history is kept.",
							)
						)
							e.preventDefault();
					}}
				>
					{archived ? <ArchiveRestore /> : <Trash2 />}
				</Button>
			</Form>
		</div>
	);
}

function PageLink({
	params,
	page,
	disabled,
	label,
}: {
	params: { search: string; status: string; stock: string; sort: string };
	page: number;
	disabled: boolean;
	label: string;
}) {
	if (disabled) return <span className="text-ink-300">{label}</span>;
	const sp = new URLSearchParams();
	if (params.search) sp.set("q", params.search);
	if (params.status !== "all") sp.set("status", params.status);
	if (params.stock !== "all") sp.set("stock", params.stock);
	if (params.sort !== "recent") sp.set("sort", params.sort);
	sp.set("page", String(page));
	return (
		<Link
			to={`/dashboard/products?${sp.toString()}`}
			className="font-medium text-brand-700 hover:underline"
		>
			{label}
		</Link>
	);
}
