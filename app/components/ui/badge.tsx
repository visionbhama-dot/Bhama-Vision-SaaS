import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
	{
		variants: {
			variant: {
				brand: "bg-brand-100 text-brand-800",
				neutral: "bg-ink-100 text-ink-700",
				lime: "bg-lime-100 text-lime-800",
				blue: "bg-blue-100 text-blue-800",
				outline: "border border-ink-200 text-ink-700",
			},
		},
		defaultVariants: { variant: "brand" },
	},
);

export interface BadgeProps
	extends
		React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}
