import { describe, it, expect } from "vitest";
import {
	signupSchema,
	loginSchema,
	slugSchema,
	businessSchema,
	setupSchema,
} from "~/modules/onboarding/schema";

const baseSignup = {
	fullName: "Asha Sharma",
	email: "asha@example.com",
	phone: "",
	password: "secret123",
	confirmPassword: "secret123",
	acceptTerms: true,
};

describe("signup schema (registration)", () => {
	it("accepts a valid signup", () => {
		expect(signupSchema.safeParse(baseSignup).success).toBe(true);
	});
	it("rejects a weak password (no number)", () => {
		expect(
			signupSchema.safeParse({
				...baseSignup,
				password: "password",
				confirmPassword: "password",
			}).success,
		).toBe(false);
	});
	it("rejects mismatched passwords", () => {
		expect(
			signupSchema.safeParse({ ...baseSignup, confirmPassword: "different1" })
				.success,
		).toBe(false);
	});
	it("requires accepting the terms", () => {
		expect(
			signupSchema.safeParse({ ...baseSignup, acceptTerms: false }).success,
		).toBe(false);
	});
});

describe("login schema (authentication)", () => {
	it("requires a valid email and a password", () => {
		expect(loginSchema.safeParse({ email: "x", password: "" }).success).toBe(
			false,
		);
		expect(
			loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
		).toBe(true);
	});
});

describe("slug schema (subdomain rules)", () => {
	it("accepts a well-formed slug", () => {
		expect(slugSchema.safeParse("sharma-mega-mart").success).toBe(true);
	});
	it("rejects reserved names", () => {
		for (const r of ["admin", "api", "www", "dashboard"]) {
			expect(slugSchema.safeParse(r).success).toBe(false);
		}
	});
	it("rejects invalid formats", () => {
		for (const bad of [
			"ab",
			"-bad",
			"bad-",
			"has space",
			"under_score",
			"a".repeat(64),
		]) {
			expect(slugSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe("business schema", () => {
	const base = {
		businessName: "Sharma Mega Mart",
		kind: "single_store",
		businessType: "supermarket",
		addressLine1: "12 Market Road",
		city: "Jaipur",
		state: "Rajasthan",
		pincode: "302001",
		contactPhone: "9876543210",
	};
	it("accepts valid business info", () => {
		expect(businessSchema.safeParse(base).success).toBe(true);
	});
	it("rejects an invalid PIN code", () => {
		expect(businessSchema.safeParse({ ...base, pincode: "12" }).success).toBe(
			false,
		);
	});
});

describe("setup schema", () => {
	it("coerces numbers and validates hex colour", () => {
		const r = setupSchema.safeParse({
			minOrderRupees: "199",
			codEnabled: "on",
			brandColor: "#039855",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.minOrderRupees).toBe(199);
	});
	it("rejects a malformed colour", () => {
		expect(setupSchema.safeParse({ brandColor: "green" }).success).toBe(false);
	});
});
