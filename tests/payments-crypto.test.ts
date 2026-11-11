import { describe, it, expect } from "vitest";
import {
	decryptSecret,
	encryptSecret,
	hmacSha256Hex,
	isEncryptionConfigured,
	timingSafeEqualHex,
} from "~/lib/crypto.server";
import {
	verifyCheckoutSignature,
	verifyWebhookSignature,
} from "~/modules/payments/gateway.server";

// 32-byte key, base64-encoded.
const KEY = btoa("0123456789abcdef0123456789abcdef");
const ENV = { PAYMENTS_ENC_KEY: KEY };

describe("HMAC-SHA256", () => {
	it("matches a known test vector", async () => {
		const sig = await hmacSha256Hex(
			"key",
			"The quick brown fox jumps over the lazy dog",
		);
		expect(sig).toBe(
			"f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
		);
	});

	it("constant-time compare works", () => {
		expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
		expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
		expect(timingSafeEqualHex("ab", "abcd")).toBe(false);
	});
});

describe("secret encryption at rest", () => {
	it("reports configured for a valid 32-byte key", async () => {
		expect(await isEncryptionConfigured(ENV)).toBe(true);
	});

	it("round-trips a secret through AES-GCM", async () => {
		const enc = await encryptSecret(ENV, "rzp_live_super_secret");
		expect(enc).not.toBeNull();
		const dec = await decryptSecret(ENV, enc!.ciphertext, enc!.iv);
		expect(dec).toBe("rzp_live_super_secret");
	});
});

describe("Razorpay signature verification", () => {
	it("accepts a correct checkout signature and rejects a tampered one", async () => {
		const secret = "key_secret_123";
		const good = await hmacSha256Hex(secret, "order_ABC|pay_XYZ");
		expect(
			await verifyCheckoutSignature(secret, "order_ABC", "pay_XYZ", good),
		).toBe(true);
		expect(
			await verifyCheckoutSignature(
				secret,
				"order_ABC",
				"pay_XYZ",
				good.replace(/.$/, "0"),
			),
		).toBe(false);
		expect(
			await verifyCheckoutSignature(secret, "order_ABC", "pay_OTHER", good),
		).toBe(false);
	});

	it("accepts a correct webhook signature over the raw body and rejects a bad one", async () => {
		const secret = "webhook_secret_123";
		const body = '{"event":"payment.captured","payload":{}}';
		const good = await hmacSha256Hex(secret, body);
		expect(await verifyWebhookSignature(secret, body, good)).toBe(true);
		expect(await verifyWebhookSignature(secret, body, "deadbeef")).toBe(false);
		expect(await verifyWebhookSignature(secret, body + " ", good)).toBe(false); // body tampered
	});
});
