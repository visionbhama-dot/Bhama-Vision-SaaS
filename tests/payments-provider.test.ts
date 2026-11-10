import { describe, it, expect } from "vitest";
import { razorpayAdapter } from "~/modules/payments/providers/razorpay";
import {
	getProvider,
	isSupportedProvider,
	listProviders,
} from "~/modules/payments/providers/registry";
import { envSuffix, maskKey } from "~/modules/payments/providers/types";

describe("razorpay adapter validation", () => {
	it("accepts a well-formed test key in test mode", () => {
		const r = razorpayAdapter.validate({
			keyId: "rzp_test_ABC1234567",
			environment: "test",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.normalized.keyId).toBe("rzp_test_ABC1234567");
	});

	it("accepts a well-formed live key in live mode", () => {
		const r = razorpayAdapter.validate({
			keyId: "rzp_live_ABC1234567",
			environment: "live",
		});
		expect(r.ok).toBe(true);
	});

	it("rejects a test key selected as live (and vice versa)", () => {
		expect(
			razorpayAdapter.validate({
				keyId: "rzp_test_ABC1234567",
				environment: "live",
			}).ok,
		).toBe(false);
		expect(
			razorpayAdapter.validate({
				keyId: "rzp_live_ABC1234567",
				environment: "test",
			}).ok,
		).toBe(false);
	});

	it("rejects a malformed key", () => {
		for (const bad of ["", "sk_test_123", "rzp_test_", "random"]) {
			expect(
				razorpayAdapter.validate({ keyId: bad, environment: "test" }).ok,
			).toBe(false);
		}
	});

	it("derives a safe uppercase env-var secret name per tenant", () => {
		const name = razorpayAdapter.secretEnvVar(
			"11111111-2222-3333-4444-555555555555",
		);
		expect(name).toBe("RZP_SECRET_11111111_2222_3333_4444_555555555555");
		expect(name).toMatch(/^[A-Z0-9_]+$/);
	});
});

describe("provider registry", () => {
	it("exposes razorpay and resolves it", () => {
		expect(isSupportedProvider("razorpay")).toBe(true);
		expect(getProvider("razorpay")).not.toBeNull();
		expect(getProvider("stripe")).toBeNull();
		expect(listProviders().some((p) => p.id === "razorpay")).toBe(true);
	});
});

describe("helpers", () => {
	it("masks long keys and passes through short/absent ones", () => {
		expect(maskKey("rzp_test_ABCDEFGHIJ")).toBe("rzp_test_A…GHIJ");
		expect(maskKey(null)).toBe("—");
		expect(maskKey("short")).toBe("short");
	});

	it("sanitizes tenant ids into env suffixes", () => {
		expect(envSuffix("ab-cd.ef")).toBe("AB_CD_EF");
	});
});
