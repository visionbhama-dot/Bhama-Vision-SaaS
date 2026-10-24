import { Form, Link, redirect, useNavigation } from "react-router";
import { Loader2 } from "lucide-react";
import type { Route } from "./+types/signup";
import { getEnv, toPublicConfig, isSupabaseConfigured } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { createAuthClient } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { signupSchema } from "~/modules/onboarding/schema";
import { AuthShell } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Input, Label, FieldError } from "~/components/ui/field";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Create your account — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Start your online grocery store with Bhama Vision.",
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
		return {
			error: "Sign-up is not available yet — the database is not connected.",
		};
	}
	const form = await request.formData();
	const parsed = parseForm(signupSchema, form, { booleans: ["acceptTerms"] });
	if (!parsed.success) {
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };
	}

	const auth = createAuthClient(request, context.cloudflare.env);
	const origin = new URL(request.url).origin;
	const { data, error } = await auth.supabase.auth.signUp({
		email: parsed.data.email,
		password: parsed.data.password,
		options: {
			data: {
				full_name: parsed.data.fullName,
				phone: parsed.data.phone || null,
			},
			emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
		},
	});

	if (error) {
		return {
			error: error.message,
			values: {
				fullName: parsed.data.fullName,
				email: parsed.data.email,
				phone: parsed.data.phone ?? "",
			},
		};
	}

	// If email confirmation is required, there is no session yet.
	if (!data.session) {
		return redirect(
			`/verify-email?email=${encodeURIComponent(parsed.data.email)}`,
			{ headers: auth.headers },
		);
	}
	return redirect("/onboarding", { headers: auth.headers });
}

export default function Signup({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, configured } = loaderData;
	const nav = useNavigation();
	const submitting = nav.state !== "idle";
	const errors = actionData?.fieldErrors ?? {};
	const values = actionData?.values ?? {};

	return (
		<AuthShell
			brand={brand}
			title="Create your merchant account"
			subtitle="It takes a minute. You'll set up your store next."
			footer={
				<>
					Already have an account?{" "}
					<Link to="/login" className="font-semibold text-brand-700">
						Log in
					</Link>
				</>
			}
		>
			{!configured && (
				<p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					Sign-up is not connected yet. Configure Supabase (see docs) to enable
					accounts.
				</p>
			)}
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
					<Label htmlFor="fullName">Full name</Label>
					<Input
						id="fullName"
						name="fullName"
						defaultValue={values.fullName}
						aria-invalid={!!errors.fullName}
						autoComplete="name"
					/>
					<FieldError>{errors.fullName}</FieldError>
				</div>
				<div>
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						defaultValue={values.email}
						aria-invalid={!!errors.email}
						autoComplete="email"
					/>
					<FieldError>{errors.email}</FieldError>
				</div>
				<div>
					<Label htmlFor="phone">Mobile (optional)</Label>
					<Input
						id="phone"
						name="phone"
						type="tel"
						defaultValue={values.phone}
						aria-invalid={!!errors.phone}
						autoComplete="tel"
						placeholder="+91 9XXXXXXXXX"
					/>
					<FieldError>{errors.phone}</FieldError>
				</div>
				<div>
					<Label htmlFor="password">Password</Label>
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
					<Label htmlFor="confirmPassword">Confirm password</Label>
					<Input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						aria-invalid={!!errors.confirmPassword}
						autoComplete="new-password"
					/>
					<FieldError>{errors.confirmPassword}</FieldError>
				</div>
				<label className="flex items-start gap-2.5 text-sm text-ink-600">
					<input
						type="checkbox"
						name="acceptTerms"
						className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
					/>
					<span>
						I accept the{" "}
						<Link
							to="/legal/terms"
							className="font-medium text-brand-700 underline"
						>
							Terms
						</Link>{" "}
						and{" "}
						<Link
							to="/legal/merchant-agreement"
							className="font-medium text-brand-700 underline"
						>
							Merchant Agreement
						</Link>
						.
					</span>
				</label>
				<FieldError>{errors.acceptTerms}</FieldError>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={submitting || !configured}
				>
					{submitting ? (
						<>
							<Loader2 className="animate-spin" /> Creating…
						</>
					) : (
						"Create account"
					)}
				</Button>
			</Form>
		</AuthShell>
	);
}
