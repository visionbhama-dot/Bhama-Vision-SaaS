import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
	Minus,
	Plus,
	Search,
	ShoppingBag,
	ShoppingCart,
	Store as StoreIcon,
	Package,
	X,
	Trash2,
} from "lucide-react";
import { formatInrMinor } from "~/lib/utils";
import { useCart } from "./cart";
import type {
	Storefront,
	StorefrontProduct,
	StorefrontStore,
} from "./service.server";

const DEFAULT_ACCENT = "#039855";

function accentOf(store: StorefrontStore): string {
	const c = store.brandColor ?? "";
	return /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_ACCENT;
}

/** Full, interactive customer storefront for an active store. */
export function StorefrontView({
	storefront,
	platformName,
}: {
	storefront: Storefront;
	platformName: string;
}) {
	const { store, products } = storefront;
	const accent = accentOf(store);
	const cart = useCart(store.slug);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("");
	const [drawerOpen, setDrawerOpen] = useState(false);

	const categories = useMemo(
		() =>
			[
				...new Set(products.map((p) => p.category).filter(Boolean) as string[]),
			].sort(),
		[products],
	);

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		return products.filter(
			(p) =>
				(!category || p.category === category) &&
				(!q || p.name.toLowerCase().includes(q)),
		);
	}, [products, search, category]);

	const qtyOf = (id: string) =>
		cart.lines.find((l) => l.productId === id)?.quantity ?? 0;

	return (
		<div className="min-h-screen bg-canvas pb-24">
			<header className="sticky top-0 z-30 border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
					<div className="flex min-w-0 items-center gap-3">
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
						<span className="truncate text-lg font-bold text-ink-900">
							{store.displayName}
						</span>
					</div>
					<button
						type="button"
						onClick={() => setDrawerOpen(true)}
						className="relative inline-flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
						aria-label="Open cart"
					>
						<ShoppingCart className="size-4" />
						<span className="hidden sm:inline">Cart</span>
						{cart.count > 0 && (
							<span
								className="grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold text-white"
								style={{ backgroundColor: accent }}
							>
								{cart.count}
							</span>
						)}
					</button>
				</div>
				{/* Search */}
				<div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={`Search ${store.displayName}`}
							className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
							aria-label="Search products"
						/>
					</div>
				</div>
			</header>

			{/* Category nav */}
			{categories.length > 0 && (
				<nav className="border-b border-ink-100 bg-white/70">
					<div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 sm:px-6">
						<CategoryChip
							label="All"
							active={category === ""}
							onClick={() => setCategory("")}
							accent={accent}
						/>
						{categories.map((c) => (
							<CategoryChip
								key={c}
								label={c}
								active={category === c}
								onClick={() => setCategory(c)}
								accent={accent}
							/>
						))}
					</div>
				</nav>
			)}

			<main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
				{store.minOrderPaise > 0 && (
					<p className="mb-4 text-sm text-ink-500">
						Minimum order {formatInrMinor(store.minOrderPaise)}.
					</p>
				)}
				{products.length === 0 ? (
					<EmptyCatalogue accent={accent} />
				) : visible.length === 0 ? (
					<p className="py-16 text-center text-sm text-ink-400">
						No products match your search.
					</p>
				) : (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{visible.map((p) => (
							<ProductCard
								key={p.id}
								product={p}
								accent={accent}
								quantity={qtyOf(p.id)}
								cart={cart}
							/>
						))}
					</div>
				)}
			</main>

			{/* Floating cart bar */}
			{cart.count > 0 && !drawerOpen && (
				<div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white p-3 shadow-lg">
					<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-1 sm:px-6">
						<div className="text-sm">
							<span className="font-semibold text-ink-900">
								{cart.count} item{cart.count > 1 ? "s" : ""}
							</span>
							<span className="text-ink-500">
								{" "}
								· {formatInrMinor(cart.subtotalPaise)}
							</span>
						</div>
						<button
							type="button"
							onClick={() => setDrawerOpen(true)}
							className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
							style={{ backgroundColor: accent }}
						>
							View cart
						</button>
					</div>
				</div>
			)}

			{drawerOpen && (
				<CartDrawer
					store={store}
					accent={accent}
					cart={cart}
					onClose={() => setDrawerOpen(false)}
				/>
			)}

			<footer className="border-t border-ink-100 py-8">
				<div className="mx-auto max-w-6xl px-4 text-center text-sm text-ink-400 sm:px-6">
					{store.displayName} · Powered by {platformName}
				</div>
			</footer>
		</div>
	);
}

function CategoryChip({
	label,
	active,
	onClick,
	accent,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
	accent: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={
				"shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
				(active
					? "border-transparent text-white"
					: "border-ink-200 bg-white text-ink-600 hover:bg-ink-50")
			}
			style={active ? { backgroundColor: accent } : undefined}
		>
			{label}
		</button>
	);
}

type CartApi = ReturnType<typeof useCart>;

function ProductCard({
	product,
	accent,
	quantity,
	cart,
}: {
	product: StorefrontProduct;
	accent: string;
	quantity: number;
	cart: CartApi;
}) {
	const onSale =
		product.mrpPaise != null && product.mrpPaise > product.pricePaise;
	return (
		<article className="flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white">
			<div className="aspect-square bg-ink-50">
				{product.imageUrl ? (
					<img
						src={product.imageUrl}
						alt={product.name}
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
					{product.name}
				</h3>
				{product.unit && (
					<p className="mt-0.5 text-xs text-ink-400">{product.unit}</p>
				)}
				<div className="mt-auto flex items-baseline gap-2 pt-2">
					<span className="text-base font-bold text-ink-900">
						{formatInrMinor(product.pricePaise)}
					</span>
					{onSale && (
						<span className="text-xs text-ink-400 line-through">
							{formatInrMinor(product.mrpPaise as number)}
						</span>
					)}
				</div>
				<div className="mt-2">
					{quantity === 0 ? (
						<button
							type="button"
							onClick={() =>
								cart.add({
									productId: product.id,
									name: product.name,
									unit: product.unit,
									pricePaise: product.pricePaise,
									imageUrl: product.imageUrl,
								})
							}
							className="w-full rounded-xl border px-3 py-2 text-sm font-semibold"
							style={{ borderColor: accent, color: accent }}
						>
							Add
						</button>
					) : (
						<Stepper
							accent={accent}
							quantity={quantity}
							onDec={() => cart.setQty(product.id, quantity - 1)}
							onInc={() => cart.setQty(product.id, quantity + 1)}
						/>
					)}
				</div>
			</div>
		</article>
	);
}

function Stepper({
	accent,
	quantity,
	onDec,
	onInc,
}: {
	accent: string;
	quantity: number;
	onDec: () => void;
	onInc: () => void;
}) {
	return (
		<div
			className="flex items-center justify-between rounded-xl text-white"
			style={{ backgroundColor: accent }}
		>
			<button
				type="button"
				onClick={onDec}
				className="grid size-9 place-items-center"
				aria-label="Decrease quantity"
			>
				<Minus className="size-4" />
			</button>
			<span className="text-sm font-bold" aria-live="polite">
				{quantity}
			</span>
			<button
				type="button"
				onClick={onInc}
				className="grid size-9 place-items-center"
				aria-label="Increase quantity"
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
}

function CartDrawer({
	store,
	accent,
	cart,
	onClose,
}: {
	store: StorefrontStore;
	accent: string;
	cart: CartApi;
	onClose: () => void;
}) {
	const belowMin =
		store.minOrderPaise > 0 && cart.subtotalPaise < store.minOrderPaise;
	return (
		<div className="fixed inset-0 z-50 flex justify-end">
			<div
				className="absolute inset-0 bg-ink-900/40"
				onClick={onClose}
				aria-hidden="true"
			/>
			<div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
				<div className="flex items-center justify-between border-b border-ink-100 p-4">
					<h2 className="text-lg font-bold text-ink-900">Your cart</h2>
					<button
						type="button"
						onClick={onClose}
						className="grid size-9 place-items-center rounded-lg hover:bg-ink-100"
						aria-label="Close cart"
					>
						<X className="size-5" />
					</button>
				</div>

				{cart.lines.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
						<span className="grid size-14 place-items-center rounded-2xl bg-ink-50 text-ink-300">
							<ShoppingBag className="size-7" />
						</span>
						<p className="mt-4 font-semibold text-ink-900">
							Your cart is empty
						</p>
						<p className="mt-1 text-sm text-ink-500">
							Add items to get started.
						</p>
						<button
							type="button"
							onClick={onClose}
							className="mt-4 rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-800"
						>
							Continue shopping
						</button>
					</div>
				) : (
					<>
						<ul className="flex-1 divide-y divide-ink-100 overflow-y-auto p-4">
							{cart.lines.map((l) => (
								<li key={l.productId} className="flex items-center gap-3 py-3">
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-ink-900">
											{l.name}
										</p>
										<p className="text-xs text-ink-400">
											{l.unit ? `${l.unit} · ` : ""}
											{formatInrMinor(l.pricePaise)}
										</p>
									</div>
									<div className="w-28 shrink-0">
										<Stepper
											accent={accent}
											quantity={l.quantity}
											onDec={() => cart.setQty(l.productId, l.quantity - 1)}
											onInc={() => cart.setQty(l.productId, l.quantity + 1)}
										/>
									</div>
									<button
										type="button"
										onClick={() => cart.remove(l.productId)}
										className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-red-600"
										aria-label={`Remove ${l.name}`}
									>
										<Trash2 className="size-4" />
									</button>
								</li>
							))}
						</ul>
						<div className="border-t border-ink-100 p-4">
							<div className="flex items-center justify-between text-sm">
								<span className="text-ink-500">Subtotal</span>
								<span className="font-bold text-ink-900">
									{formatInrMinor(cart.subtotalPaise)}
								</span>
							</div>
							{belowMin && (
								<p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
									Minimum order is {formatInrMinor(store.minOrderPaise)}. Add a
									little more to check out.
								</p>
							)}
							<Link
								to={`/store/${store.slug}/checkout`}
								aria-disabled={belowMin}
								className={
									"mt-3 block rounded-xl py-3 text-center text-sm font-semibold text-white " +
									(belowMin ? "pointer-events-none opacity-50" : "")
								}
								style={{ backgroundColor: accent }}
							>
								Proceed to checkout
							</Link>
						</div>
					</>
				)}
			</div>
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
