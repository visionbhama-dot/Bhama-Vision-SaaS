import {
	envSuffix,
	type ConnectionInput,
	type PaymentProviderAdapter,
	type ValidationResult,
} from "./types";

/**
 * Razorpay adapter — our first supported provider (popular in India, has a free
 * test mode). Razorpay publishable key ids look like `rzp_test_XXXXXXXX` or
 * `rzp_live_XXXXXXXX`. We validate the id's shape and that it matches the chosen
 * environment. The secret (`key_secret`) is NOT entered here; it is provisioned
 * as a Worker secret named by `secretEnvVar`.
 */

const KEY_RE = /^rzp_(test|live)_[A-Za-z0-9]{10,}$/;

export const razorpayAdapter: PaymentProviderAdapter = {
	info: {
		id: "razorpay",
		label: "Razorpay",
		description:
			"Connect your own Razorpay account. Customer payments settle directly to you — Bhama Vision never holds the funds.",
		docsUrl:
			"https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/",
		keyLabel: "Razorpay Key ID (rzp_test_… or rzp_live_…)",
	},

	validate(input: ConnectionInput): ValidationResult {
		const keyId = input.keyId.trim();
		if (!KEY_RE.test(keyId)) {
			return {
				ok: false,
				error:
					"That doesn't look like a Razorpay Key ID. It should start with rzp_test_ or rzp_live_.",
			};
		}
		const isLiveKey = keyId.startsWith("rzp_live_");
		if (input.environment === "live" && !isLiveKey) {
			return {
				ok: false,
				error: "You selected Live but pasted a test key (rzp_test_…).",
			};
		}
		if (input.environment === "test" && isLiveKey) {
			return {
				ok: false,
				error: "You selected Test but pasted a live key (rzp_live_…).",
			};
		}
		return {
			ok: true,
			normalized: { keyId, environment: input.environment, accountRef: null },
		};
	},

	secretEnvVar(tenantId: string): string {
		return `RZP_SECRET_${envSuffix(tenantId)}`;
	},
};
