import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createAuthClient } from "~/lib/auth.server";
import { isSupabaseConfigured, getEnv } from "~/lib/env.server";

export async function action({ request, context }: Route.ActionArgs) {
	if (!isSupabaseConfigured(getEnv(context.cloudflare.env))) {
		return redirect("/");
	}
	const auth = createAuthClient(request, context.cloudflare.env);
	await auth.supabase.auth.signOut();
	return redirect("/", { headers: auth.headers });
}

export function loader() {
	return redirect("/");
}
