import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { Loader2, MailCheck } from "lucide-react";
import type { Route } from "./+types/verify-email";
import { getEnv, toPublicConfig, isSupabaseConfigured } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { createAuthClient } from "~/lib/auth.server";
import { AuthShell } from "~/modules/onboarding/components";
import { Button } from "~/components/ui/button";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Verify your email — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Confirm your email to activate your account.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export function loader({ context }: Route.LoaderArgs) {
	return {
		brand: resolveBrand(toPublicConfig(getEnv(context.cloudflare.env))),
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = getEnv(context.cloudflare.env);
	if (!isSupabaseConfigured(env)) return { error: "Not available." };
	const form = await request.formData();
	const email = String(form.get("email") ?? "");
	if (!email) return { error: "Missing email." };
	const auth = createAuthClient(request, context.cloudflare.env);
	const origin = new URL(request.url).origin;
	const { error } = await auth.supabase.auth.resend({
		type: "signup",
		email,
		options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
	});
	if (error) return { error: error.message };
	return { resent: true };
}

export default function VerifyEmail({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand } = loaderData;
	const [params] = useSearchParams();
	const email = params.get("email") ?? "";
	const nav = useNavigation();
	const submitting = nav.state !== "idle";

	return (
		<AuthShell
			brand={brand}
			title="Check your email"
			footer={
				<Link to="/login" className="font-semibold text-brand-700">
					Back to login
				</Link>
			}
		>
			<div className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-center">
				<MailCheck className="mx-auto size-10 text-brand-600" />
				<p className="mt-3 text-sm text-ink-700">
					We've sent a confirmation link{email ? ` to ${email}` : ""}. Click it
					to activate your account, then you'll continue to store setup.
				</p>
			</div>
			<p className="mt-4 text-sm text-ink-500">
				Didn't get it? Check spam, or resend below.
			</p>
			{actionData?.resent && (
				<p className="mt-2 text-sm text-brand-700">
					Confirmation email resent.
				</p>
			)}
			{actionData?.error && (
				<p role="alert" className="mt-2 text-sm text-red-600">
					{actionData.error}
				</p>
			)}
			<Form method="post" className="mt-3">
				<input type="hidden" name="email" value={email} />
				<Button
					type="submit"
					variant="outline"
					className="w-full"
					disabled={submitting || !email}
				>
					{submitting ? (
						<>
							<Loader2 className="animate-spin" /> Resending…
						</>
					) : (
						"Resend confirmation email"
					)}
				</Button>
			</Form>
		</AuthShell>
	);
}
