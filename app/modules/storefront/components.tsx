import { ShoppingBag, Store as StoreIcon, Package } from "lucide-react";
import { formatInrMinor } from "~/lib/utils";
import type { Storefront, StorefrontStore } from "./service.server";

const DEFAULT_ACCENT = "#039855";

function accentOf(store: StorefrontStore): string {
	const c = store.brandColor ?? "";
	return /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_ACCENT;
}

/** Full customer storefront for an active store. */
export function StorefrontView({
	storefront,
	platformName,
}: {
	storefront: Storefront;
	platformName: string;
}) {
	const { store, products } = storefront;
	const accent = accentOf(store);

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-3">
						{store.logoUrl ? (
							<img
								src={store.logoUrl}
								alt={store.displayName}
								className="size-9 rounded-lg object-cover"
							/>
						) : (
							<span
								className="grid size-9 place-items-center rounded-lg text-white"
								style={{ backgroundColor: accent }}
							>
								<StoreIcon className="size-5" />
							</span>
						)}
						<span className="text-lg font-bold text-ink-900">
							{store.displayName}
						</span>
					</div>
					<span
						className="hidden rounded-full px-3 py-1 text-xs font-semibold text-white sm:inline-block"
						style={{ backgroundColor: accent }}
					>
						Online store
					</span>
				</div>
			</header>

			<section
				className="border-b border-ink-100"
				style={{ backgroundColor: `${accent}0f` }}
			>
				<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
					<h1 className="text-3xl font-bold tracking-tight text-ink-900">
						{store.displayName}
					</h1>
					<p className="mt-2 max-w-2xl text-ink-600">
						Fresh groceries, delivered. Browse the catalogue below
						{store.minOrderPaise > 0 && (
							<>
								{" "}
								— minimum order {formatInrMinor(store.minOrderPaise)}
							</>
						)}
						.
					</p>
				</div>
			</section>

			<main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
				{products.length === 0 ? (
					<EmptyCatalogue accent={accent} />
				) : (
					<>
						<div className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
							<ShoppingBag className="size-4" /> Catalogue ({products.length})
						</div>
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
							{products.map((p) => {
								const onSale =
									p.mrpPaise != null && p.mrpPaise > p.pricePaise;
								return (
									<article
										key={p.id}
										className="flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white"
									>
										<div className="aspect-square bg-ink-50">
											{p.imageUrl ? (
												<img
													src={p.imageUrl}
													alt={p.name}
													className="size-full object-cover"
												/>
											) : (
												<span className="grid size-full place-items-center text-ink-300">
													<Package className="size-10" />
												</span>
											)}
										</div>
										<div className="flex flex-1 flex-col p-3">
											<h3 className="line-clamp-2 text-sm font-semibold text-ink-900">
												{p.name}
											</h3>
											{p.unit && (
												<p className="mt-0.5 text-xs text-ink-400">{p.unit}</p>
											)}
											<div className="mt-auto flex items-baseline gap-2 pt-2">
												<span className="text-base font-bold text-ink-900">
													{formatInrMinor(p.pricePaise)}
												</span>
												{onSale && (
													<span className="text-xs text-ink-400 line-through">
														{formatInrMinor(p.mrpPaise as number)}
													</span>
												)}
											</div>
										</div>
									</article>
								);
							})}
						</div>
					</>
				)}
			</main>

			<footer className="border-t border-ink-100 py-8">
				<div className="mx-auto max-w-6xl px-4 text-center text-sm text-ink-400 sm:px-6">
					{store.displayName} · Powered by {platformName}
				</div>
			</footer>
		</div>
	);
}

function EmptyCatalogue({ accent }: { accent: string }) {
	return (
		<div className="rounded-2xl border border-dashed border-ink-200 bg-white py-16 text-center">
			<span
				className="mx-auto grid size-14 place-items-center rounded-2xl text-white"
				style={{ backgroundColor: accent }}
			>
				<ShoppingBag className="size-7" />
			</span>
			<h2 className="mt-4 text-lg font-bold text-ink-900">
				Catalogue coming soon
			</h2>
			<p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
				This store is getting ready. Products will appear here as soon as the
				owner adds them.
			</p>
		</div>
	);
}

/** Shown when a store exists but is not live (draft / pending / suspended). */
export function StoreUnavailable({
	title,
	message,
}: {
	title: string;
	message: string;
}) {
	return (
		<div className="grid min-h-screen place-items-center bg-canvas px-4">
			<div className="max-w-md text-center">
				<span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-100 text-ink-500">
					<StoreIcon className="size-7" />
				</span>
				<h1 className="mt-4 text-2xl font-bold text-ink-900">{title}</h1>
				<p className="mt-2 text-ink-500">{message}</p>
				<a
					href="/"
					className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white"
				>
					Back to home
				</a>
			</div>
		</div>
	);
}
