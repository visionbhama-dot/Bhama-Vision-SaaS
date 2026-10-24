import { describe, it, expect } from "vitest";
import {
	parseEnv,
	isSupabaseConfigured,
	toPublicConfig,
} from "~/lib/env.server";

describe("environment validation", () => {
	it("applies defaults when values are missing", () => {
		const env = parseEnv({});
		expect(env.PUBLIC_APP_NAME).toBe("Bhama Vision Grocery Cloud");
		expect(env.ENVIRONMENT).toBe("development");
	});

	it("throws on an invalid SUPABASE_URL", () => {
		expect(() => parseEnv({ SUPABASE_URL: "not-a-url" })).toThrow(
			/Invalid environment/,
		);
	});

	it("reports Supabase as unconfigured without credentials", () => {
		expect(isSupabaseConfigured(parseEnv({}))).toBe(false);
	});

	it("reports Supabase as configured when url + anon key present", () => {
		const env = parseEnv({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_ANON_KEY: "anon",
		});
		expect(isSupabaseConfigured(env)).toBe(true);
	});

	it("exposes only public values, never secrets", () => {
		const env = parseEnv({
			SUPABASE_SERVICE_ROLE_KEY: "super-secret",
			PUBLIC_APP_NAME: "Test Co",
		});
		const pub = toPublicConfig(env);
		expect(pub.appName).toBe("Test Co");
		expect(JSON.stringify(pub)).not.toContain("super-secret");
	});
});
