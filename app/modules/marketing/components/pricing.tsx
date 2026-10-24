import * as React from "react";
import { Check, Minus, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { cn, formatInrMinor } from "~/lib/utils";
import {
	PLANS,
	COMPARISON_ROWS,
	planHas,
	limitLabel,
	type Plan,
	type EntitlementKey,
} from "../data/plans";

type Cycle = "monthly" | "annual";

function priceFor(plan: Plan, cycle: Cycle) {
	return cycle === "monthly" ? plan.monthlyPaise : plan.annualPaise;
}

export function Pricing() {
	const [cycle, setCycle] = React.useState<Cycle>("monthly");

	return (
		<section id="pricing" className="bg-white py-16 lg:py-24">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
						Pricing
					</p>
					<h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
						Simple plans that grow with your store
					</h2>
					<p className="mt-4 text-lg text-ink-500">
						Launch pricing shown in INR. Gateway and third-party charges
						(payment processing, SMS/WhatsApp, maps) are billed separately by
						those providers. Final pricing is configurable by Bhama Vision.
					</p>
				</div>

				<div className="mt-8 flex items-center justify-center gap-3">
					<span
						className={cn(
							"text-sm font-medium",
							cycle === "monthly" ? "text-ink-900" : "text-ink-400",
						)}
					>
						Monthly
					</span>
					<button
						type="button"
						role="switch"
						aria-checked={cycle === "annual"}
						aria-label="Toggle annual billing"
						onClick={() =>
							setCycle((c) => (c === "monthly" ? "annual" : "monthly"))
						}
						className={cn(
							"relative h-7 w-12 rounded-full transition-colors",
							cycle === "annual" ? "bg-brand-600" : "bg-ink-300",
						)}
					>
						<span
							className={cn(
								"absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
								cycle === "annual" ? "translate-x-5" : "translate-x-0.5",
							)}
						/>
					</button>
					<span
						className={cn(
							"text-sm font-medium",
							cycle === "annual" ? "text-ink-900" : "text-ink-400",
						)}
					>
						Annual{" "}
						<span className="font-semibold text-brand-700">(save ~17%)</span>
					</span>
				</div>

				<div className="mt-12 grid gap-6 lg:grid-cols-3">
					{PLANS.map((plan) => (
						<div
							key={plan.slug}
							className={cn(
								"relative flex flex-col rounded-3xl border bg-white p-7",
								plan.highlighted
									? "border-brand-500 shadow-xl ring-1 ring-brand-500"
									: "border-ink-200 shadow-sm",
							)}
						>
							{plan.badge && (
								<span className="absolute -top-3 left-1/2 -translate-x-1/2">
									<Badge variant="brand">
										<Sparkles className="size-3.5" /> {plan.badge}
									</Badge>
								</span>
							)}
							<h3 className="text-xl font-bold text-ink-900">{plan.name}</h3>
							<p className="mt-1 min-h-10 text-sm text-ink-500">
								{plan.tagline}
							</p>
							<div className="mt-5 flex items-baseline gap-1">
								<span className="text-4xl font-bold tracking-tight text-ink-900">
									{formatInrMinor(priceFor(plan, cycle))}
								</span>
								<span className="text-sm text-ink-500">/month</span>
							</div>
							{cycle === "annual" && (
								<p className="mt-1 text-xs text-ink-400">
									billed annually ({formatInrMinor(plan.annualPaise * 12)}/yr)
								</p>
							)}
							<a href="#contact" className="mt-6">
								<Button
									variant={plan.highlighted ? "primary" : "outline"}
									className="w-full"
								>
									Start with {plan.name}
								</Button>
							</a>
							<ul className="mt-7 space-y-3">
								{plan.highlights.map((h) => (
									<li key={h} className="flex items-start gap-2.5 text-sm">
										<Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
										<span className="text-ink-700">{h}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				{/* Enterprise / custom */}
				<div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-3xl border border-ink-200 bg-ink-50 p-7 sm:flex-row sm:items-center">
					<div>
						<h3 className="text-lg font-bold text-ink-900">
							Enterprise / Custom Solution
						</h3>
						<p className="mt-1 text-sm text-ink-500">
							For chains needing advanced integrations, custom domains or
							bespoke workflows. Let's design a plan around your operation.
						</p>
					</div>
					<a href="#contact" className="shrink-0">
						<Button variant="secondary">
							Talk to us <ArrowRight />
						</Button>
					</a>
				</div>

				<ComparisonTable cycle={cycle} />
			</div>
		</section>
	);
}

function ComparisonTable({ cycle }: { cycle: Cycle }) {
	return (
		<div className="mt-16" id="compare">
			<h3 className="text-center text-2xl font-bold text-ink-900">
				Compare plans
			</h3>
			<div className="mt-8 overflow-x-auto">
				<table className="w-full min-w-[640px] border-collapse text-sm">
					<thead>
						<tr>
							<th className="w-1/3 px-4 py-3 text-left font-semibold text-ink-700">
								Feature
							</th>
							{PLANS.map((p) => (
								<th
									key={p.slug}
									className="px-4 py-3 text-center font-semibold text-ink-900"
								>
									<div>{p.name}</div>
									<div className="text-xs font-normal text-ink-400">
										{formatInrMinor(priceFor(p, cycle))}/mo
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{COMPARISON_ROWS.map((row, idx) => (
							<tr
								key={row.label}
								className={idx % 2 === 0 ? "bg-ink-50/60" : ""}
							>
								<td className="px-4 py-3 font-medium text-ink-700">
									{row.label}
								</td>
								{PLANS.map((p) => (
									<td key={p.slug} className="px-4 py-3 text-center">
										{row.type === "limit" ? (
											<span className="font-medium text-ink-900">
												{limitLabel(
													p.limits[row.key as "products" | "staff" | "vendors"],
												)}
											</span>
										) : planHas(p, row.key as EntitlementKey) ? (
											<Check className="mx-auto size-4 text-brand-600" />
										) : (
											<Minus className="mx-auto size-4 text-ink-300" />
										)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
