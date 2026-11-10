import type { PaymentProviderAdapter, PaymentProviderInfo } from "./types";
import { razorpayAdapter } from "./razorpay";

/**
 * Provider registry. To add a provider later: implement an adapter and add it
 * here — nothing else in the payments module needs to change.
 */
const ADAPTERS: Record<string, PaymentProviderAdapter> = {
	[razorpayAdapter.info.id]: razorpayAdapter,
};

export function getProvider(id: string): PaymentProviderAdapter | null {
	return ADAPTERS[id] ?? null;
}

export function listProviders(): PaymentProviderInfo[] {
	return Object.values(ADAPTERS).map((a) => a.info);
}

export function isSupportedProvider(id: string): boolean {
	return id in ADAPTERS;
}
