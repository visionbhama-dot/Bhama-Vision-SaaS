import type { Route } from "./+types/storefront";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import {
	resolveStoreBySlug,
	getStorefront,
	isPubliclyVisible,
} from "~/modules/storefront/service.server";
import { StorefrontView, StoreUnavailable } from "~/modules/storefront/components";

export function meta({ data }: Route.MetaArgs) {
	const name = data?.storeName ?? "Store";
	return buildMeta({
		title:
			data?.kind === "store"
				? `${name} — Order groceries online`
				: `${name}`,
		description: `Shop groceries from ${name} online.`,
		siteName: data?.platformName ?? "Bhama Vision Grocery Cloud",
	});
}

export async function loader({ context, params }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const store = await resolveStoreBySlug(
		context.cloudflare.env,
		params.slug ?? "",
	);

	if (!store) {
		throw new Response("Store not found", {
			status: 404,
			statusText: "Not Found",
		});
	}

	if (!isPubliclyVisible(store.status)) {
		return {
			kind: "not_live" as const,
			storeName: store.displayName,
			platformName: brand.name,
		};
	}

	const storefront = await getStorefront(context.cloudflare.env, store);
	return {
		kind: "store" as const,
		storeName: store.displayName,
		platformName: brand.name,
		storefront,
	};
}

export default function StorefrontRoute({ loaderData }: Route.ComponentProps) {
	if (loaderData.kind === "not_live") {
		return (
			<StoreUnavailable
				title="This store isn't live yet"
				message={`${loaderData.storeName} hasn't opened for orders yet. Please check back soon.`}
			/>
		);
	}
	return (
		<StorefrontView
			storefront={loaderData.storefront}
			platformName={loaderData.platformName}
		/>
	);
}
