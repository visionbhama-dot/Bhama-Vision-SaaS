import { Check } from "lucide-react";
import { Logo } from "~/modules/marketing/components/logo";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { ONBOARDING_STEPS, STEP_LABELS, type OnboardingStep } from "./schema";
import type { BrandConfig } from "~/config/brand";

/** Centered auth card shell used by signup/login/reset screens. */
export function AuthShell({
	brand,
	title,
	subtitle,
	children,
	footer,
}: {
	brand: BrandConfig;
	title: string;
	subtitle?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col bg-canvas">
			<header className="border-b border-ink-100 bg-canvas/80 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
					<a href="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</a>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
				<div className="rounded-3xl border border-ink-100 bg-white p-8 shadow-sm">
					<h1 className="text-2xl font-bold text-ink-900">{title}</h1>
					{subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
					<div className="mt-6">{children}</div>
				</div>
				{footer && (
					<p className="mt-5 text-center text-sm text-ink-500">{footer}</p>
				)}
			</main>
		</div>
	);
}

/** Horizontal step indicator for the onboarding wizard. */
export function Stepper({
	current,
	completed,
}: {
	current: OnboardingStep | "submitted";
	completed: string[];
}) {
	return (
		<ol className="flex flex-wrap items-center gap-2">
			{ONBOARDING_STEPS.map((step, i) => {
				const done = completed.includes(step);
				const active = step === current;
				return (
					<li key={step} className="flex items-center gap-2">
						<span
							className={cn(
								"grid size-7 place-items-center rounded-full text-xs font-bold",
								done
									? "bg-brand-600 text-white"
									: active
										? "bg-brand-100 text-brand-800 ring-2 ring-brand-500"
										: "bg-ink-100 text-ink-500",
							)}
						>
							{done ? <Check className="size-4" /> : i + 1}
						</span>
						<span
							className={cn(
								"text-sm",
								active ? "font-semibold text-ink-900" : "text-ink-500",
							)}
						>
							{STEP_LABELS[step]}
						</span>
						{i < ONBOARDING_STEPS.length - 1 && (
							<span className="mx-1 hidden h-px w-6 bg-ink-200 sm:block" />
						)}
					</li>
				);
			})}
		</ol>
	);
}

const STATUS_META: Record<
	string,
	{ label: string; variant: "brand" | "neutral" | "lime" | "blue" | "outline" }
> = {
	draft: { label: "Draft", variant: "neutral" },
	pending_verification: { label: "In review", variant: "blue" },
	pending_payment: { label: "Payment pending", variant: "outline" },
	active: { label: "Active", variant: "brand" },
	suspended: { label: "Suspended", variant: "neutral" },
	closed: { label: "Closed", variant: "neutral" },
};

export function StoreStatusBadge({ status }: { status: string }) {
	const meta = STATUS_META[status] ?? {
		label: status,
		variant: "neutral" as const,
	};
	return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
