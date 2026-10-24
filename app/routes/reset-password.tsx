import { Form, redirect, useNavigation } from "react-router";
import { Loader2 } from "lucide-react";
import type { Route } from "./+types/reset-password";
import { getEnv, toPublicConfig, isSupabaseConfigured } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { getOptionalUser } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { resetSchema } from "~/modules/onboarding/schema";
import { AuthShell } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Input, Label, FieldError } from "~/components/ui/field";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Set a new password — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Choose a new password.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	if (!isSupabaseConfigured(env)) throw redirect("/login");
	// A valid recovery session (from the emailed link) is required.
	const { user, auth } = await getOptionalUser(request, context.cloudflare.env);
	if (!user) {
		throw redirect("/forgot-password", { headers: auth.headers });
	}
	return { brand: resolveBrand(toPublicConfig(env)) };
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = getEnv(context.cloudflare.env);
	if (!isSupabaseConfigured(env)) return { error: "Not available." };
	const { user, auth } = await getOptionalUser(request, context.cloudflare.env);
	if (!user)
		return { error: "Your reset link has expired. Please request a new one." };

	const form = await request.formData();
	const parsed = parseForm(resetSchema, form);
	if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

	const { error } = await auth.supabase.auth.updateUser({
		password: parsed.data.password,
	});
	if (error) return { error: error.message };
	return redirect("/dashboard", { headers: auth.headers });
}

export default function ResetPassword({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand } = loaderData;
	const nav = useNavigation();
	const submitting = nav.state !== "idle";
	const errors = actionData?.fieldErrors ?? {};

	return (
		<AuthShell brand={brand} title="Set a new password">
			{actionData?.error && (
				<p
					role="alert"
					className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{actionData.error}
				</p>
			)}
			<Form method="post" className="space-y-4" noValidate>
				<div>
					<Label htmlFor="password">New password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						aria-invalid={!!errors.password}
						autoComplete="new-password"
					/>
					<FieldError>{errors.password}</FieldError>
				</div>
				<div>
					<Label htmlFor="confirmPassword">Confirm new password</Label>
					<Input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						aria-invalid={!!errors.confirmPassword}
						autoComplete="new-password"
					/>
					<FieldError>{errors.confirmPassword}</FieldError>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={submitting}
				>
					{submitting ? (
						<>
							<Loader2 className="animate-spin" /> Saving…
						</>
					) : (
						"Update password"
					)}
				</Button>
			</Form>
		</AuthShell>
	);
}
