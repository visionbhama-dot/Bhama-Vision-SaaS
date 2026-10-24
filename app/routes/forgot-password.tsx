import { Form, Link, useNavigation } from "react-router";
import { Loader2, MailCheck } from "lucide-react";
import type { Route } from "./+types/forgot-password";
import { getEnv, toPublicConfig, isSupabaseConfigured } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { createAuthClient } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { forgotSchema } from "~/modules/onboarding/schema";
import { AuthShell } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Input, Label, FieldError } from "~/components/ui/field";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Reset password — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Reset your Bhama Vision account password.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	return {
		brand: resolveBrand(toPublicConfig(env)),
		configured: isSupabaseConfigured(env),
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = getEnv(context.cloudflare.env);
	if (!isSupabaseConfigured(env)) {
		return { error: "Password reset is not available yet." };
	}
	const form = await request.formData();
	const parsed = parseForm(forgotSchema, form);
	if (!parsed.success)
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };

	const auth = createAuthClient(request, context.cloudflare.env);
	const origin = new URL(request.url).origin;
	// Do not reveal whether the email exists; always show the same success state.
	await auth.supabase.auth.resetPasswordForEmail(parsed.data.email, {
		redirectTo: `${origin}/auth/callback?next=/reset-password`,
	});
	return { sent: true };
}

export default function ForgotPassword({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand } = loaderData;
	const nav = useNavigation();
	const submitting = nav.state !== "idle";
	const errors = actionData?.fieldErrors ?? {};

	return (
		<AuthShell
			brand={brand}
			title="Forgot your password?"
			subtitle="We'll email you a secure link to set a new one."
			footer={
				<Link to="/login" className="font-semibold text-brand-700">
					Back to login
				</Link>
			}
		>
			{actionData?.sent ? (
				<div className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-center">
					<MailCheck className="mx-auto size-10 text-brand-600" />
					<p className="mt-3 text-sm text-ink-700">
						If an account exists for that email, a reset link is on its way.
						Check your inbox (and spam).
					</p>
				</div>
			) : (
				<Form method="post" className="space-y-4" noValidate>
					{actionData?.error && (
						<p
							role="alert"
							className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
						>
							{actionData.error}
						</p>
					)}
					<div>
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							aria-invalid={!!errors.email}
							autoComplete="email"
						/>
						<FieldError>{errors.email}</FieldError>
					</div>
					<Button
						type="submit"
						size="lg"
						className="w-full"
						disabled={submitting}
					>
						{submitting ? (
							<>
								<Loader2 className="animate-spin" /> Sending…
							</>
						) : (
							"Send reset link"
						)}
					</Button>
				</Form>
			)}
		</AuthShell>
	);
}
