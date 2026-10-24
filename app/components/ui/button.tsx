import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary:
					"bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
				secondary:
					"bg-ink-900 text-white shadow-sm hover:bg-ink-800 active:bg-ink-950",
				outline:
					"border border-ink-200 bg-white text-ink-900 hover:bg-ink-50 active:bg-ink-100",
				ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
				link: "text-brand-700 underline-offset-4 hover:underline",
			},
			size: {
				sm: "h-9 px-3",
				md: "h-11 px-5",
				lg: "h-12 px-7 text-base",
				icon: "h-11 w-11",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export interface ButtonProps
	extends
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, ...props }, ref) => (
		<button
			ref={ref}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	),
);
Button.displayName = "Button";

export { buttonVariants };
