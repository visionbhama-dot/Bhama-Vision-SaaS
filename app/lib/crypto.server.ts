import { getEnv } from "./env.server";

/**
 * Server-side cryptography for payment secrets + webhook signatures.
 *
 * Secret-at-rest strategy (see docs/PAYMENTS.md): each merchant's provider API
 * secret + webhook secret are encrypted with AES-256-GCM using a single
 * platform key (PAYMENTS_ENC_KEY) and stored as ciphertext in
 * merchant_payment_accounts. This scales to many merchants with ONE Worker
 * secret (unlike a per-tenant Worker-secret scheme, which hits Cloudflare's
 * per-Worker variable limits), and plaintext never touches the DB, the browser
 * or logs. Decryption happens only server-side, momentarily, to call the
 * provider API.
 *
 * All primitives use Web Crypto (available in Cloudflare Workers).
 */

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
function bytesToB64(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}
function hex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function getEncKey(rawEnv: unknown): Promise<CryptoKey | null> {
	const env = getEnv(rawEnv);
	const keyB64 = env.PAYMENTS_ENC_KEY;
	if (!keyB64) return null;
	const raw = b64ToBytes(keyB64);
	if (raw.length !== 32) return null; // must be a 32-byte (256-bit) key
	return crypto.subtle.importKey(
		"raw",
		raw as BufferSource,
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
}

/** True when a valid 256-bit PAYMENTS_ENC_KEY is configured. */
export async function isEncryptionConfigured(
	rawEnv: unknown,
): Promise<boolean> {
	return (await getEncKey(rawEnv)) !== null;
}

export interface Encrypted {
	ciphertext: string; // base64
	iv: string; // base64
}

/** Encrypt a secret string. Returns null when no encryption key is configured. */
export async function encryptSecret(
	rawEnv: unknown,
	plaintext: string,
): Promise<Encrypted | null> {
	const key = await getEncKey(rawEnv);
	if (!key) return null;
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const enc = new TextEncoder().encode(plaintext);
	const ct = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv as BufferSource },
		key,
		enc as BufferSource,
	);
	return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

/** Decrypt a secret string. Returns null if not configured or on failure. */
export async function decryptSecret(
	rawEnv: unknown,
	ciphertext: string,
	iv: string,
): Promise<string | null> {
	const key = await getEncKey(rawEnv);
	if (!key) return null;
	try {
		const pt = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: b64ToBytes(iv) as BufferSource },
			key,
			b64ToBytes(ciphertext) as BufferSource,
		);
		return new TextDecoder().decode(pt);
	} catch {
		return null;
	}
}

/** HMAC-SHA256 of `message` with `secret`, hex-encoded (Razorpay's format). */
export async function hmacSha256Hex(
	secret: string,
	message: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret) as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(message) as BufferSource,
	);
	return hex(sig);
}

/** Constant-time comparison of two hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
