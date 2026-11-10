import { Form, Link, redirect, useNavigation } from "react-router";
import { z } from "zod";
import {
	Loader2,
	Plus,
	ArrowLeft,
	Eye,
	EyeOff,
	Trash2,
	ExternalLink,
	Package,
} from "lucide-react";
import type { Route } from "./+types/dashboard.products";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { formatInrMinor } from "~/lib/utils";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input, Textarea, Label, FieldError } from "~/components/ui/field";

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
	imageUrl: z
		.string()
		.trim()
		.url("Enter a valid image URL")
		.max(500)
		.optional()
		.or(z.literal("")),
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

	const { data: products } = await auth.supabase
		.from("products")
		.select("id, name, unit, price_paise, mrp_paise, is_visible")
		.eq("tenant_id", ctx.tenant.id)
		.is("archived_at", null)
		.order("created_at", { ascending: false })
		.limit(500);

	return {
		brand,
		slug: ctx.store.slug,
		storeActive: ctx.store.status === "active",
		products: products ?? [],
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store found." };
	const tenantId = ctx.tenant.id;

	const form = await request.formData();
	const intent = String(form.get("intent") ?? "add");

	if (intent === "toggle") {
		const id = String(form.get("productId") ?? "");
		const makeVisible = String(form.get("visible") ?? "") !== "true";
		if (id)
			await auth.supabase
				.from("products")
				.update({ is_visible: makeVisible })
				.eq("id", id)
				.eq("tenant_id", tenantId);
		return { ok: true };
	}

	if (intent === "archive") {
		const id = String(form.get("productId") ?? "");
		if (id)
			await auth.supabase
				.from("products")
				.update({ archived_at: new Date().toISOString() })
				.eq("id", id)
				.eq("tenant_id", tenantId);
		return { ok: true };
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
		})
		.select("id")
		.maybeSingle();

	if (error || !inserted)
		return { error: error?.message ?? "Could not add the product." };

	if (d.imageUrl) {
		await auth.supabase.from("product_images").insert({
			tenant_id: tenantId,
			product_id: inserted.id,
			url: d.imageUrl,
			position: 0,
		});
	}

	return { ok: true, added: d.name };
}

export default function DashboardProducts({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, slug, storeActive, products } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const errors = (actionData?.fieldErrors ?? {}) as Record<string, string>;
	const values = (actionData?.values ?? {}) as Record<string, string>;

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
				<h1 className="text-2xl font-bold text-ink-900">Products</h1>
				<p className="mt-1 text-sm text-ink-500">
					Add items to your catalogue. Visible products appear on your
					storefront at{" "}
					<a
						href={`/store/${slug}`}
						target="_blank"
						rel="noreferrer"
						className="font-medium text-brand-700 underline"
					>
						/store/{slug}
					</a>
					.
				</p>

				{!storeActive && (
					<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						Your store isn't active yet, so the public storefront stays hidden
						until it's approved. You can still build your catalogue now.
					</div>
				)}
				{actionData?.ok && actionData?.added && (
					<div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
						Added "{actionData.added}" to your catalogue.
					</div>
				)}
				{actionData?.error && (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{actionData.error}
					</div>
				)}

				<div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
					{/* Add product */}
					<Card>
						<CardContent className="sm:p-6">
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
										placeholder="Aashirvaad Atta"
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
										<Label htmlFor="mrpRupees">MRP (₹, optional)</Label>
										<Input
											id="mrpRupees"
											name="mrpRupees"
											type="number"
											min={0}
											step="0.01"
											defaultValue={values.mrpRupees}
											placeholder="For strike-through"
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
									<Label htmlFor="imageUrl">Image URL (optional)</Label>
									<Input
										id="imageUrl"
										name="imageUrl"
										defaultValue={values.imageUrl}
										aria-invalid={!!errors.imageUrl}
										placeholder="https://…/photo.jpg"
									/>
									<FieldError>{errors.imageUrl}</FieldError>
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
									Show on storefront
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

					{/* Product list */}
					<Card>
						<CardContent className="sm:p-6">
							<h2 className="font-semibold text-ink-900">
								Your catalogue ({products.length})
							</h2>
							{products.length === 0 ? (
								<div className="py-12 text-center">
									<span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-50 text-ink-300">
										<Package className="size-6" />
									</span>
									<p className="mt-3 text-sm text-ink-400">
										No products yet. Add your first item on the left.
									</p>
								</div>
							) : (
								<ul className="mt-4 divide-y divide-ink-100">
									{products.map((p) => (
										<li
											key={p.id}
											className="flex items-center justify-between gap-3 py-3"
										>
											<div className="min-w-0">
												<p className="truncate font-medium text-ink-900">
													{p.name}
													{!p.is_visible && (
														<span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-500">
															Hidden
														</span>
													)}
												</p>
												<p className="text-sm text-ink-500">
													{formatInrMinor(Number(p.price_paise))}
													{p.unit ? ` · ${p.unit}` : ""}
												</p>
											</div>
											<div className="flex shrink-0 items-center gap-1">
												<Form method="post">
													<input type="hidden" name="intent" value="toggle" />
													<input type="hidden" name="productId" value={p.id} />
													<input
														type="hidden"
														name="visible"
														value={String(p.is_visible)}
													/>
													<Button
														type="submit"
														variant="ghost"
														size="sm"
														disabled={busy}
														title={p.is_visible ? "Hide" : "Show"}
													>
														{p.is_visible ? <Eye /> : <EyeOff />}
													</Button>
												</Form>
												<Form method="post">
													<input type="hidden" name="intent" value="archive" />
													<input type="hidden" name="productId" value={p.id} />
													<Button
														type="submit"
														variant="ghost"
														size="sm"
														disabled={busy}
														title="Remove"
													>
														<Trash2 />
													</Button>
												</Form>
											</div>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
