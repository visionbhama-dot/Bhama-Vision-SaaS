import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely, de-duplicating conflicting utilities.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Format a paise/minor-unit integer amount into an INR currency string.
 *
 * All monetary values in this platform are stored and passed around as integer
 * minor units (paise) to avoid floating-point accounting errors. This helper is
 * the single place where that integer becomes a human-readable string.
 */
export function formatInrMinor(
	amountMinor: number,
	options: { withDecimals?: boolean } = {},
): string {
	const { withDecimals = false } = options;
	const rupees = amountMinor / 100;
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		minimumFractionDigits: withDecimals ? 2 : 0,
		maximumFractionDigits: withDecimals ? 2 : 0,
	}).format(rupees);
}
