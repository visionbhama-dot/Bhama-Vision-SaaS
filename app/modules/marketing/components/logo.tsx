import { Leaf } from "lucide-react";
import { cn } from "~/lib/utils";

export function Logo({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
				<Leaf className="size-5" aria-hidden />
			</span>
			<span className="text-base font-bold tracking-tight text-ink-900">
				{name}
			</span>
		</span>
	);
}
