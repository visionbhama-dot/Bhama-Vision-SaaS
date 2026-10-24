import type { z } from "zod";

export type ParsedForm<T> =
	| { success: true; data: T }
	| {
			success: false;
			fieldErrors: Record<string, string>;
			values: Record<string, string>;
	  };

/**
 * Validate a FormData payload against a zod schema, returning first-error-per-
 * field plus the raw string values (so the form can be re-rendered with input
 * preserved). Checkbox fields arrive as "on"/"true"; callers map them before
 * calling if needed, or pass `booleans` to coerce.
 */
export function parseForm<T>(
	schema: z.ZodType<T>,
	formData: FormData,
	options: { booleans?: string[] } = {},
): ParsedForm<T> {
	const values: Record<string, string> = {};
	const raw: Record<string, unknown> = {};
	for (const [key, value] of formData.entries()) {
		if (typeof value === "string") {
			values[key] = value;
			raw[key] = value;
		}
	}
	for (const b of options.booleans ?? []) {
		raw[b] = values[b] === "on" || values[b] === "true";
	}

	const result = schema.safeParse(raw);
	if (result.success) return { success: true, data: result.data };

	const fieldErrors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const key = String(issue.path[0] ?? "_form");
		if (!fieldErrors[key]) fieldErrors[key] = issue.message;
	}
	return { success: false, fieldErrors, values };
}
