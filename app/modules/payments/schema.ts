import { z } from "zod";

export const connectSchema = z.object({
	provider: z.string().trim().min(1, "Choose a provider").max(40),
	environment: z.enum(["test", "live"]).default("test"),
	keyId: z.string().trim().min(6, "Enter your key id").max(120),
	// The API secret is verified against the provider and then encrypted at
	// rest. Optional: without it we can only record the public key (status stays
	// pending and online checkout stays disabled).
	keySecret: z.string().trim().max(200).optional().or(z.literal("")),
	// Webhook secret is SEPARATE from the API secret and also encrypted at rest.
	webhookSecret: z.string().trim().max(200).optional().or(z.literal("")),
});
export type ConnectInput = z.infer<typeof connectSchema>;

export const disconnectSchema = z.object({
	provider: z.string().trim().min(1).max(40),
});
