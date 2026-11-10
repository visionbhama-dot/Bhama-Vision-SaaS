import { z } from "zod";

export const connectSchema = z.object({
	provider: z.string().trim().min(1, "Choose a provider").max(40),
	environment: z.enum(["test", "live"]).default("test"),
	keyId: z.string().trim().min(6, "Enter your key id").max(120),
});
export type ConnectInput = z.infer<typeof connectSchema>;

export const disconnectSchema = z.object({
	provider: z.string().trim().min(1).max(40),
});
