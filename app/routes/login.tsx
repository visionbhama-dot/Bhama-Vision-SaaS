import {
	Form,
	Link,
	redirect,
	useNavigation,
	useSearchParams,
} from "react-router";
import { Loader2 } from "lucide-react";
import type { Route } from "./+types/login";
import { getEnv, toPublicConfig, isSupabaseConfigured } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { createAuthClient, getOptionalUser } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { loginSchema } from "~/modules/onboarding/schema";
import { AuthShell } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";
import { Input, Label, FieldError } from "~/components/ui/field";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Log in — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Merchant login for Bhama Vision Grocery Cloud.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

function safeNext(next: string | null): string {
	// Only allow same-site relative paths.
	if (next && next.startsWith("/") && !next.startsWith("//")) return next;
	return "/dashboard";
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const configured = isSupabaseConfigured(env);
	if (configured) {
		const { user } = await getOptionalUser(request, context.cloudflare.env);
		if (user) {
			const next = safeNext(new URL(request.url).searchParams.get("next"));
			throw redirect(next);
		}
	}
	return { brand, configured };
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = getEnv(context.cloudflare.env);
	if (!isSupabaseConfigured(env)) {
		return {
			error: "Login is not available yet — the database is not connected.",
		};
	}
	const form = await request.formData();
	const next = safeNext(String(form.get("next") ?? ""));
	const parsed = parseForm(loginSchema, form);
	if (!parsed.success) {
		return { fieldErrors: parsed.fieldErrors, values: parsed.values };
	}
	const auth = createAuthClient(request, context.cloudflare.env);
	const { error } = await auth.supabase.auth.signInWithPassword({
		email: parsed.data.email,
		password: parsed.data.password,
	});
	if (error) {
		return { error: error.message, values: { email: parsed.data.email } };
	}
	return redirect(next, { headers: auth.headers });
}

export default function Login({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, configured } = loaderData;
	const nav = useNavigation();
	const submitting = nav.state !== "idle";
	const [params] = useSearchParams();
	const errors = actionData?.fieldErrors ?? {};
	const values = actionData?.values ?? {};

	return (
		<AuthShell
			brand={brand}
			title="Welcome back"
			subtitle="Log in to manage your store."
			footer={
				<>
					New to {brand.shortName}?{" "}
					<Link to="/signup" className="font-semibold text-brand-700">
						Create an account
					</Link>
				</>
			}
		>
			{!configured && (
				<p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					Login is not connected yet. Configure Supabase (see docs) to enable
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
				<input type="hidden" name="next" value={params.get("next") ?? ""} />
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
					<div className="flex items-center justify-between">
						<Label htmlFor="password">Password</Label>
						<Link
							to="/forgot-password"
							className="text-sm font-medium text-brand-700"
						>
							Forgot?
						</Link>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						aria-invalid={!!errors.password}
						autoComplete="current-password"
					/>
					<FieldError>{errors.password}</FieldError>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={submitting || !configured}
				>
					{submitting ? (
						<>
							<Loader2 className="animate-spin" /> Logging in…
						</>
					) : (
						"Log in"
					)}
				</Button>
			</Form>
		</AuthShell>
	);
}
