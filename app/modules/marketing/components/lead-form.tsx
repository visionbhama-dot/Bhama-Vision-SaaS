import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher } from "react-router";
import { CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Input,
	Textarea,
	Select,
	Label,
	FieldError,
} from "~/components/ui/field";
import { whatsappLink, type BrandConfig } from "~/config/brand";
import { trackEvent } from "~/lib/analytics";
import {
	leadSchema,
	type LeadInput,
	BUSINESS_TYPES,
	BUSINESS_TYPE_LABELS,
} from "~/modules/leads/schema";

type ActionResult =
	| { ok: true; reference: string }
	| { ok: false; message: string; fieldErrors?: Record<string, string> };

export function LeadForm({ brand }: { brand: BrandConfig }) {
	const fetcher = useFetcher<ActionResult>();
	const submitting = fetcher.state !== "idle";
	const result = fetcher.data;

	const {
		register,
		handleSubmit,
		setValue,
		formState: { errors },
	} = useForm<LeadInput>({
		resolver: zodResolver(leadSchema),
		defaultValues: { preferredPlan: "undecided", consent: false },
	});

	// Capture campaign attribution + referrer client-side (stored with consent).
	React.useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const set = (name: string, key: string) => {
			const v = params.get(key);
			if (v) setValue(name as keyof LeadInput, v as never);
		};
		set("utm_source", "utm_source");
		set("utm_medium", "utm_medium");
		set("utm_campaign", "utm_campaign");
		set("utm_term", "utm_term");
		set("utm_content", "utm_content");
	}, [setValue]);

	// Fire a single analytics event on confirmed success (avoids duplicates).
	const trackedRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (
			result?.ok &&
			result.reference &&
			trackedRef.current !== result.reference
		) {
			trackedRef.current = result.reference;
			trackEvent("lead_submitted", { reference: result.reference });
		}
	}, [result]);

	if (result?.ok) {
		return (
			<div className="rounded-3xl border border-brand-200 bg-brand-50 p-8 text-center">
				<CheckCircle2 className="mx-auto size-12 text-brand-600" />
				<h3 className="mt-4 text-2xl font-bold text-ink-900">
					Thank you! We've received your details.
				</h3>
				<p className="mt-2 text-ink-600">
					Your reference number is{" "}
					<span className="font-mono font-bold text-brand-800">
						{result.reference}
					</span>
					. Our team will reach out shortly to help you launch your store.
				</p>
				<p className="mt-1 text-sm text-ink-500">
					Please keep this reference for any follow-up.
				</p>
			</div>
		);
	}

	const onValid = (data: LeadInput) => {
		const fd = new FormData();
		Object.entries(data).forEach(([k, v]) => {
			if (v !== undefined && v !== null) fd.append(k, String(v));
		});
		fd.append(
			"referrer",
			typeof document !== "undefined" ? document.referrer : "",
		);
		fetcher.submit(fd, { method: "post", action: "/?index" });
	};

	const wa = whatsappLink(
		brand.whatsappNumber,
		"Hi Bhama Vision, I'd like to take my grocery store online.",
	);

	return (
		<form onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
			{result && !result.ok && (
				<div
					role="alert"
					className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{result.message}
				</div>
			)}

			{/* Honeypot: hidden from users, bots tend to fill it. */}
			<div className="hidden" aria-hidden>
				<label>
					Company website
					<input
						type="text"
						tabIndex={-1}
						autoComplete="off"
						{...register("company_website")}
					/>
				</label>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="name">Name</Label>
					<Input
						id="name"
						aria-invalid={!!errors.name}
						{...register("name")}
						placeholder="Your full name"
					/>
					<FieldError>{errors.name?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="businessName">Business name</Label>
					<Input
						id="businessName"
						aria-invalid={!!errors.businessName}
						{...register("businessName")}
						placeholder="e.g. Sharma Mega Mart"
					/>
					<FieldError>{errors.businessName?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="phone">Mobile / WhatsApp number</Label>
					<Input
						id="phone"
						type="tel"
						inputMode="tel"
						aria-invalid={!!errors.phone}
						{...register("phone")}
						placeholder="+91 9XXXXXXXXX"
					/>
					<FieldError>{errors.phone?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="email">Email (optional if phone given)</Label>
					<Input
						id="email"
						type="email"
						aria-invalid={!!errors.email}
						{...register("email")}
						placeholder="you@example.com"
					/>
					<FieldError>{errors.email?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="city">City</Label>
					<Input
						id="city"
						aria-invalid={!!errors.city}
						{...register("city")}
						placeholder="Your city"
					/>
					<FieldError>{errors.city?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="businessType">Business type</Label>
					<Select
						id="businessType"
						aria-invalid={!!errors.businessType}
						defaultValue=""
						{...register("businessType")}
					>
						<option value="" disabled>
							Select business type
						</option>
						{BUSINESS_TYPES.map((t) => (
							<option key={t} value={t}>
								{BUSINESS_TYPE_LABELS[t]}
							</option>
						))}
					</Select>
					<FieldError>{errors.businessType?.message}</FieldError>
				</div>
				<div>
					<Label htmlFor="productCount">
						Existing number of products (optional)
					</Label>
					<Input
						id="productCount"
						type="number"
						min={0}
						{...register("productCount")}
						placeholder="e.g. 250"
					/>
					<FieldError>{errors.productCount?.message as string}</FieldError>
				</div>
				<div>
					<Label htmlFor="preferredPlan">Preferred plan</Label>
					<Select id="preferredPlan" {...register("preferredPlan")}>
						<option value="undecided">Not sure yet</option>
						<option value="starter">Starter</option>
						<option value="growth">Growth</option>
						<option value="marketplace">Marketplace</option>
						<option value="enterprise">Enterprise / Custom</option>
					</Select>
				</div>
			</div>

			<div>
				<Label htmlFor="message">Message</Label>
				<Textarea
					id="message"
					{...register("message")}
					placeholder="Tell us about your store and what you'd like to achieve."
				/>
			</div>

			<label className="flex items-start gap-2.5 text-sm text-ink-600">
				<input
					type="checkbox"
					className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
					{...register("consent")}
				/>
				<span>
					I agree to be contacted by {brand.company} about my enquiry and accept
					the{" "}
					<a
						href="/legal/privacy"
						className="font-medium text-brand-700 underline"
					>
						Privacy Policy
					</a>
					.
				</span>
			</label>
			<FieldError>{errors.consent?.message}</FieldError>

			<div className="flex flex-col gap-3 sm:flex-row">
				<Button
					type="submit"
					size="lg"
					disabled={submitting}
					className="sm:flex-1"
				>
					{submitting ? (
						<>
							<Loader2 className="animate-spin" /> Sending…
						</>
					) : (
						"Get Started"
					)}
				</Button>
				{wa && (
					<a
						href={wa}
						target="_blank"
						rel="noopener noreferrer"
						className="sm:flex-1"
					>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full"
						>
							<MessageCircle /> Chat on WhatsApp
						</Button>
					</a>
				)}
			</div>
		</form>
	);
}
