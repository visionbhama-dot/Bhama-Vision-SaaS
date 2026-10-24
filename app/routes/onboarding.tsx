import { redirect } from "react-router";
import type { Route } from "./+types/onboarding";
import { requireUser, getMerchantContext } from "~/lib/auth.server";

/** Entry point: send the merchant to their current onboarding step. */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);

	if (!ctx.tenant) {
		throw redirect("/onboarding/business", { headers: auth.headers });
	}
	const step = ctx.onboarding?.current_step ?? "business";
	if (step === "submitted") {
		throw redirect("/dashboard", { headers: auth.headers });
	}
	throw redirect(`/onboarding/${step}`, { headers: auth.headers });
}
