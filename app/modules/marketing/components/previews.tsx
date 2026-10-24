import {
	Search,
	ShoppingCart,
	TrendingUp,
	Package,
	Bike,
	MapPin,
	CheckCircle2,
	Leaf,
} from "lucide-react";

/*
 * These are genuine rendered UI previews built from the same design tokens as
 * the product — not stock imagery or fabricated screenshots. They illustrate the
 * planned storefront, merchant dashboard and delivery interfaces. As real app
 * screens ship, these previews are replaced by captures of the working app.
 */

export function StorefrontPreview() {
	const products = [
		{ name: "Tomato (Local)", unit: "1 kg", price: "₹32", mrp: "₹40" },
		{ name: "Amul Milk", unit: "500 ml", price: "₹27", mrp: "" },
		{ name: "Basmati Rice", unit: "5 kg", price: "₹499", mrp: "₹560" },
		{ name: "Fortune Oil", unit: "1 L", price: "₹142", mrp: "₹165" },
	];
	return (
		<div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
			<div className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
				<span className="inline-flex items-center gap-2 text-sm font-bold text-ink-900">
					<span className="grid size-6 place-items-center rounded-md bg-brand-600 text-white">
						<Leaf className="size-3.5" />
					</span>
					Sharma Mega Mart
				</span>
				<span className="relative grid size-8 place-items-center rounded-lg bg-ink-100 text-ink-700">
					<ShoppingCart className="size-4" />
					<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
						3
					</span>
				</span>
			</div>
			<div className="px-4 py-3">
				<div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-400">
					<Search className="size-4" />
					Search for rice, milk, vegetables…
				</div>
				<div className="mt-3 flex gap-2">
					{["Fruits", "Dairy", "Staples", "Snacks"].map((c, i) => (
						<span
							key={c}
							className={`rounded-full px-3 py-1 text-xs font-medium ${
								i === 0 ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600"
							}`}
						>
							{c}
						</span>
					))}
				</div>
				<div className="mt-3 grid grid-cols-2 gap-3">
					{products.map((p) => (
						<div key={p.name} className="rounded-xl border border-ink-100 p-3">
							<div className="h-12 rounded-lg bg-gradient-to-br from-brand-50 to-lime-50" />
							<p className="mt-2 truncate text-xs font-semibold text-ink-900">
								{p.name}
							</p>
							<p className="text-[11px] text-ink-400">{p.unit}</p>
							<div className="mt-1 flex items-center justify-between">
								<span className="text-sm font-bold text-ink-900">
									{p.price}
									{p.mrp && (
										<span className="ml-1 text-[10px] font-normal text-ink-400 line-through">
											{p.mrp}
										</span>
									)}
								</span>
								<span className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
									Add
								</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function DashboardPreview() {
	const stats = [
		{ label: "Today's Orders", value: "48", icon: Package },
		{ label: "Today's Sales", value: "₹22,450", icon: TrendingUp },
		{ label: "Pending", value: "6", icon: ShoppingCart },
	];
	const bars = [40, 65, 52, 78, 60, 88, 72];
	return (
		<div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
			<div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
				<span className="text-sm font-semibold text-ink-900">Overview</span>
				<span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-800">
					Growth plan
				</span>
			</div>
			<div className="p-5">
				<div className="grid grid-cols-3 gap-3">
					{stats.map((s) => (
						<div key={s.label} className="rounded-xl border border-ink-100 p-3">
							<s.icon className="size-4 text-brand-600" />
							<p className="mt-2 text-lg font-bold text-ink-900">{s.value}</p>
							<p className="text-[11px] text-ink-500">{s.label}</p>
						</div>
					))}
				</div>
				<div className="mt-4 rounded-xl border border-ink-100 p-4">
					<p className="text-xs font-medium text-ink-600">
						Revenue — last 7 days
					</p>
					<div className="mt-3 flex h-24 items-end gap-2">
						{bars.map((h, i) => (
							<div
								key={i}
								className="flex-1 rounded-t-md bg-brand-500/80"
								style={{ height: `${h}%` }}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export function DeliveryPreview() {
	const steps = [
		{ label: "Order accepted", done: true },
		{ label: "Picked up", done: true },
		{ label: "Out for delivery", done: false, active: true },
		{ label: "Delivered", done: false },
	];
	return (
		<div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
			<div className="relative h-28 bg-gradient-to-br from-blue-50 via-brand-50 to-lime-50">
				<div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,#0001_1px,transparent_1px),linear-gradient(to_bottom,#0001_1px,transparent_1px)] [background-size:18px_18px]" />
				<span className="absolute left-5 top-5 grid size-8 place-items-center rounded-full bg-white text-brand-600 shadow">
					<MapPin className="size-4" />
				</span>
				<span className="absolute right-6 bottom-5 grid size-9 place-items-center rounded-full bg-brand-600 text-white shadow-lg">
					<Bike className="size-5" />
				</span>
			</div>
			<div className="p-5">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold text-ink-900">Order #10482</p>
						<p className="text-xs text-ink-500">Rider: Imran · ETA 12 min</p>
					</div>
					<span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-800">
						Live
					</span>
				</div>
				<ol className="mt-4 space-y-2.5">
					{steps.map((s) => (
						<li key={s.label} className="flex items-center gap-2.5 text-sm">
							<CheckCircle2
								className={`size-4 ${
									s.done
										? "text-brand-600"
										: s.active
											? "text-brand-400"
											: "text-ink-300"
								}`}
							/>
							<span
								className={
									s.done || s.active
										? "font-medium text-ink-900"
										: "text-ink-400"
								}
							>
								{s.label}
							</span>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}
