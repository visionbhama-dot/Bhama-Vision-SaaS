import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

// Mock the admin client factory so the service talks to our stub.
vi.mock("~/lib/supabase.server", () => ({ getAdminClient: vi.fn() }));
import { getAdminClient } from "~/lib/supabase.server";
import {
	getSlugStatus,
	saveBusiness,
	selectPlan,
} from "~/modules/onboarding/service.server";

const ENV = { PUBLIC_APP_DOMAIN: "test.example" };

beforeEach(() => {
	vi.mocked(getAdminClient).mockReset();
});

describe("getSlugStatus (duplicate subdomain prevention)", () => {
	it("flags reserved and invalid names before any DB call", async () => {
		vi.mocked(getAdminClient).mockReturnValue(null as never);
		expect(await getSlugStatus(ENV, "admin")).toBe("reserved");
		expect(await getSlugStatus(ENV, "ab")).toBe("invalid");
	});

	it("reports an unconfigured DB honestly", async () => {
		vi.mocked(getAdminClient).mockReturnValue(null as never);
		expect(await getSlugStatus(ENV, "fresh-store")).toBe("unconfigured");
	});

	it("detects a taken slug", async () => {
		const { client } = createSupabaseMock({
			read: ({ table }) =>
				table === "stores"
					? { data: { id: "s1" }, error: null }
					: { data: null, error: null },
		});
		vi.mocked(getAdminClient).mockReturnValue(client as never);
		expect(await getSlugStatus(ENV, "taken-store")).toBe("taken");
	});

	it("reports an available slug", async () => {
		const { client } = createSupabaseMock({
			read: () => ({ data: null, error: null }),
		});
		vi.mocked(getAdminClient).mockReturnValue(client as never);
		expect(await getSlugStatus(ENV, "available-store")).toBe("available");
	});
});

describe("saveBusiness (merchant registration)", () => {
	it("creates a tenant with an auto subdomain and advances the step", async () => {
		const { client, calls } = createSupabaseMock({
			read: ({ table }) => {
				if (table === "tenant_memberships") return { data: null, error: null }; // no tenant yet
				if (table === "merchant_onboarding")
					return {
						data: { completed_steps: ["account"], data: {} },
						error: null,
					};
				return { data: null, error: null };
			},
			rpc: (fn) =>
				fn === "create_merchant"
					? { data: "tenant-1", error: null }
					: { data: null, error: null },
		});
		vi.mocked(getAdminClient).mockReturnValue(client as never);

		const res = await saveBusiness(ENV, "user-1", {
			businessName: "Sharma Mega Mart",
			kind: "single_store",
			businessType: "supermarket",
			addressLine1: "12 Market Road",
			city: "Jaipur",
			state: "Rajasthan",
			pincode: "302001",
			contactPhone: "9876543210",
		} as never);

		expect(res.ok).toBe(true);
		if (res.ok) expect(res.tenantId).toBe("tenant-1");

		const rpc = calls.find((c) => c.op === "rpc");
		expect(rpc?.fn).toBe("create_merchant");
		expect((rpc?.args as Record<string, unknown>).p_slug).toBe(
			"sharma-mega-mart",
		);

		// business profile upserted, onboarding advanced to 'store'
		expect(
			calls.some((c) => c.table === "business_profiles" && c.op === "upsert"),
		).toBe(true);
		const advance = calls.find(
			(c) => c.table === "merchant_onboarding" && c.op === "update",
		);
		expect((advance?.payload as Record<string, unknown>).current_step).toBe(
			"store",
		);
	});

	it("returns an honest not-configured result without a DB", async () => {
		vi.mocked(getAdminClient).mockReturnValue(null as never);
		const res = await saveBusiness(ENV, "user-1", {
			businessName: "X",
		} as never);
		expect(res.ok).toBe(false);
	});
});

describe("selectPlan (entitlements stay pending)", () => {
	it("never activates entitlements when a plan is chosen", async () => {
		const { client, calls } = createSupabaseMock({
			read: ({ table }) => {
				if (table === "tenant_memberships")
					return { data: { tenant_id: "t1" }, error: null };
				if (table === "subscription_plans")
					return { data: { id: "plan-1" }, error: null };
				if (table === "tenant_subscriptions")
					return { data: { id: "sub-1", status: "pending" }, error: null };
				if (table === "merchant_onboarding")
					return {
						data: {
							completed_steps: ["account", "business", "store"],
							data: {},
						},
						error: null,
					};
				return { data: null, error: null };
			},
		});
		vi.mocked(getAdminClient).mockReturnValue(client as never);

		const res = await selectPlan(ENV, "user-1", "growth", "monthly");
		expect(res.ok).toBe(true);

		const subWrites = calls.filter((c) => c.table === "tenant_subscriptions");
		expect(subWrites.length).toBeGreaterThan(0);
		for (const w of subWrites) {
			const status = (w.payload as Record<string, unknown>)?.status;
			// CRITICAL invariant: selecting a plan must never set an entitling status.
			expect(["active", "trialing", "grace"]).not.toContain(status);
		}
	});
});
