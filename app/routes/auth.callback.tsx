import { redirect } from "react-router";
import type { Route } from "./+types/auth.callback";
import { createAuthClient } from "~/lib/auth.server";
import { isSupabaseConfigured, getEnv } from "~/lib/env.server";

/**
 * OAuth/email callback. Supabase appends either a PKCE `code` (confirmation,
 * magic link, password reset) or a `token_hash` + `type`. We exchange it for a
 * session, set cookies, and continue to `next`.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	if (!isSupabaseConfigured(getEnv(context.cloudflare.env))) {
		throw redirect("/login");
	}
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const tokenHash = url.searchParams.get("token_hash");
	const type = url.searchParams.get("type");
	const next =
		url.searchParams.get("next")?.startsWith("/") &&
		!url.searchParams.get("next")!.startsWith("//")
			? url.searchParams.get("next")!
			: "/onboarding";

	const auth = createAuthClient(request, context.cloudflare.env);

	let failed: boolean;
	if (code) {
		const { error } = await auth.supabase.auth.exchangeCodeForSession(code);
		failed = !!error;
	} else if (tokenHash && type) {
		const { error } = await auth.supabase.auth.verifyOtp({
			token_hash: tokenHash,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			type: type as any,
		});
		failed = !!error;
	} else {
		failed = true;
	}

	if (failed) {
		throw redirect("/login?error=link_invalid", { headers: auth.headers });
	}
	throw redirect(next, { headers: auth.headers });
}
