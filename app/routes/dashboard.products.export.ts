import type { Route } from "./+types/dashboard.products.export";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { exportProductsCsv } from "~/modules/products/service.server";

/**
 * Resource route: download the merchant's products as CSV. Auth + tenant scoped;
 * the CSV builder is formula-injection-safe.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) {
		return new Response("No store found", { status: 404 });
	}
	const csv = await exportProductsCsv(auth.supabase, ctx.tenant.id);
	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="products-${ctx.store?.slug ?? "export"}.csv"`,
			"Cache-Control": "no-store",
		},
	});
}
