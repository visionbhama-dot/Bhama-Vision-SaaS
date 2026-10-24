import * as React from "react";
import { cn } from "~/lib/utils";

export function Label({
	className,
	...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		<label
			className={cn("mb-1.5 block text-sm font-medium text-ink-800", className)}
			{...props}
		/>
	);
}

const fieldBase =
	"w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/30";

export const Input = React.forwardRef<
	HTMLInputElement,
	React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
	<input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
	HTMLTextAreaElement,
	React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		className={cn(fieldBase, "min-h-24 resize-y", className)}
		{...props}
	/>
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
	HTMLSelectElement,
	React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
	<select ref={ref} className={cn(fieldBase, "pr-9", className)} {...props}>
		{children}
	</select>
));
Select.displayName = "Select";

export function FieldError({ children }: { children?: React.ReactNode }) {
	if (!children) return null;
	return (
		<p role="alert" className="mt-1.5 text-sm text-red-600">
			{children}
		</p>
	);
}
