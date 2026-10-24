import { Form, redirect, useNavigation, Link } from "react-router";
import { Loader2, ArrowRight, Check } from "lucide-react";
import type { Route } from "./+types/onboarding.step";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { parseForm } from "~/lib/form.server";
import { formatInrMinor } from "~/lib/utils";
import {
	businessSchema,
	storeIdentitySchema,
	planSchema,
	setupSchema,
	BUSINESS_TYPES,
	ONBOARDING_STEPS,
	type OnboardingStep,
} from "~/modules/onboarding/schema";
import {
	saveBusiness,
	setStoreSlug,
	selectPlan,
	saveSetup,
	submitForReview,
} from "~/modules/onboarding/service.server";
import { Stepper } from "~/modules/onboarding/components";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import {
	Input,
	Textarea,
	Select,
	Label,
	FieldError,
} from "~/components/ui/field";
import { Card, CardContent } from "~/components/ui/card";
import { BUSINESS_TYPE_LABELS } from "~/modules/leads/schema";
import { PLANS } from "~/modules/marketing/data/plans";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Set up your store — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Complete your merchant onboarding.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

function isStep(s: string): s is OnboardingStep {
	return (ONBOARDING_STEPS as readonly string[]).includes(s);
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);

	const step = params.step ?? "business";
	if (!isStep(step)) {
		throw redirect("/onboarding", { headers: auth.headers });
	}

	const current = (ctx.onboarding?.current_step ?? "business") as string;
	if (current === "submitted") {
		throw redirect("/dashboard", { headers: auth.headers });
	}
	const completed = ctx.onboarding?.completed_steps ?? [];
	const allowed = new Set<string>([...completed, current]);
	if (!ctx.tenant) {
		allowed.clear();
		allowed.add("business");
	}
	// Prevent skipping ahead to steps not yet unlocked.
	if (!allowed.has(step)) {
		throw redirect(`/onboarding/${current}`, { headers: auth.headers });
	}

	const data = (ctx.onboarding?.data ?? {}) as Record<
		string,
		Record<string, unknown>
	>;

	return {
		brand,
		step,
		current,
		completed,
		apex: env.PUBLIC_APP_DOMAIN,
		prefill: {
			business: data.business ?? { kind: ctx.tenant?.kind ?? "single_store" },
			slug: ctx.store?.slug ?? "",
			plan: data.plan ?? {
				planSlug: ctx.subscription?.plan?.slug,
				cycle: ctx.subscription?.cycle,
			},
			setup: data.setup ?? {},
		},
	};
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const env = context.cloudflare.env;
	const step = params.step ?? "";
	const form = await request.formData();
	const h = { headers: auth.headers };

	if (step === "business") {
		const parsed = parseForm(businessSchema, form);
		if (!parsed.success)
			return { fieldErrors: parsed.fieldErrors, values: parsed.values };
		const res = await saveBusiness(env, user.id, parsed.data);
		if (!res.ok) return { error: res.error };
		return redirect("/onboarding/store", h);
	}
	if (step === "store") {
		const parsed = parseForm(storeIdentitySchema, form);
		if (!parsed.success)
			return { fieldErrors: parsed.fieldErrors, values: parsed.values };
		const res = await setStoreSlug(env, user.id, parsed.data.slug);
		if (!res.ok)
			return { error: res.error, values: { slug: parsed.data.slug } };
		return redirect("/onboarding/plan", h);
	}
	if (step === "plan") {
		const parsed = parseForm(planSchema, form);
		if (!parsed.success)
			return { fieldErrors: parsed.fieldErrors, values: parsed.values };
		const res = await selectPlan(
			env,
			user.id,
			parsed.data.planSlug,
			parsed.data.cycle,
		);
		if (!res.ok) return { error: res.error };
		return redirect("/onboarding/setup", h);
	}
	if (step === "setup") {
		const parsed = parseForm(setupSchema, form, { booleans: ["codEnabled"] });
		if (!parsed.success)
			return { fieldErrors: parsed.fieldErrors, values: parsed.values };
		const res = await saveSetup(env, user.id, parsed.data);
		if (!res.ok) return { error: res.error };
		return redirect("/onboarding/review", h);
	}
	if (step === "review") {
		const res = await submitForReview(env, user.id);
		if (!res.ok) return { error: res.error };
		return redirect("/dashboard", h);
	}
	return { error: "Unknown step." };
}

export default function OnboardingStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand, step, current, completed, apex, prefill } = loaderData;
	const nav = useNavigation();
	const submitting = nav.state !== "idle";
	const errors = (actionData?.fieldErrors ?? {}) as Record<string, string>;
	const values = (actionData?.values ?? {}) as Record<string, string>;

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-canvas/80 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Form method="post" action="/logout">
						<button className="text-sm font-medium text-ink-500 hover:text-ink-900">
							Save & exit
						</button>
					</Form>
				</div>
			</header>

			<main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
				<div className="mb-8 overflow-x-auto pb-2">
					<Stepper current={current as OnboardingStep} completed={completed} />
				</div>

				{actionData?.error && (
					<p
						role="alert"
						className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					>
						{actionData.error}
					</p>
				)}

				<Card>
					<CardContent className="sm:p-8">
						{step === "business" && (
							<BusinessForm
								errors={errors}
								values={values}
								prefill={prefill.business}
							/>
						)}
						{step === "store" && (
							<StoreForm
								errors={errors}
								values={values}
								slug={prefill.slug}
								apex={apex}
							/>
						)}
						{step === "plan" && <PlanForm prefill={prefill.plan} />}
						{step === "setup" && (
							<SetupForm
								errors={errors}
								values={values}
								prefill={prefill.setup}
							/>
						)}
						{step === "review" && <ReviewForm />}

						<div className="mt-7">
							<Button
								type="submit"
								form="step-form"
								size="lg"
								className="w-full"
								disabled={submitting}
							>
								{submitting ? (
									<>
										<Loader2 className="animate-spin" /> Saving…
									</>
								) : step === "review" ? (
									"Submit for review"
								) : (
									<>
										Save & continue <ArrowRight />
									</>
								)}
							</Button>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}

/* ---------------- Step forms ---------------- */

type FormProps = {
	errors: Record<string, string>;
	values: Record<string, string>;
	prefill: Record<string, unknown>;
};

function BusinessForm({ errors, values, prefill }: FormProps) {
	const v = (k: string) => values[k] ?? (prefill[k] as string) ?? "";
	return (
		<Form method="post" id="step-form" className="space-y-4" noValidate>
			<h2 className="text-xl font-bold text-ink-900">
				Tell us about your business
			</h2>
			<div>
				<Label htmlFor="businessName">Business name</Label>
				<Input
					id="businessName"
					name="businessName"
					defaultValue={v("businessName")}
					aria-invalid={!!errors.businessName}
				/>
				<FieldError>{errors.businessName}</FieldError>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="kind">Store type</Label>
					<Select
						id="kind"
						name="kind"
						defaultValue={v("kind") || "single_store"}
					>
						<option value="single_store">Single store</option>
						<option value="marketplace">Multi-vendor marketplace</option>
					</Select>
				</div>
				<div>
					<Label htmlFor="businessType">Business category</Label>
					<Select
						id="businessType"
						name="businessType"
						defaultValue={v("businessType")}
						aria-invalid={!!errors.businessType}
					>
						<option value="" disabled>
							Select…
						</option>
						{BUSINESS_TYPES.map((t) => (
							<option key={t} value={t}>
								{BUSINESS_TYPE_LABELS[t]}
							</option>
						))}
					</Select>
					<FieldError>{errors.businessType}</FieldError>
				</div>
			</div>
			<div>
				<Label htmlFor="addressLine1">Address</Label>
				<Input
					id="addressLine1"
					name="addressLine1"
					defaultValue={v("addressLine1")}
					aria-invalid={!!errors.addressLine1}
					placeholder="Shop no, street"
				/>
				<FieldError>{errors.addressLine1}</FieldError>
			</div>
			<Input
				name="addressLine2"
				defaultValue={v("addressLine2")}
				placeholder="Area / landmark (optional)"
			/>
			<div className="grid gap-4 sm:grid-cols-3">
				<div>
					<Label htmlFor="city">City</Label>
					<Input
						id="city"
						name="city"
						defaultValue={v("city")}
						aria-invalid={!!errors.city}
					/>
					<FieldError>{errors.city}</FieldError>
				</div>
				<div>
					<Label htmlFor="state">State</Label>
					<Input
						id="state"
						name="state"
						defaultValue={v("state")}
						aria-invalid={!!errors.state}
					/>
					<FieldError>{errors.state}</FieldError>
				</div>
				<div>
					<Label htmlFor="pincode">PIN code</Label>
					<Input
						id="pincode"
						name="pincode"
						inputMode="numeric"
						defaultValue={v("pincode")}
						aria-invalid={!!errors.pincode}
					/>
					<FieldError>{errors.pincode}</FieldError>
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="contactPhone">Contact phone</Label>
					<Input
						id="contactPhone"
						name="contactPhone"
						type="tel"
						defaultValue={v("contactPhone")}
						aria-invalid={!!errors.contactPhone}
					/>
					<FieldError>{errors.contactPhone}</FieldError>
				</div>
				<div>
					<Label htmlFor="contactEmail">Contact email (optional)</Label>
					<Input
						id="contactEmail"
						name="contactEmail"
						type="email"
						defaultValue={v("contactEmail")}
						aria-invalid={!!errors.contactEmail}
					/>
					<FieldError>{errors.contactEmail}</FieldError>
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="gstNumber">GST number (optional)</Label>
					<Input
						id="gstNumber"
						name="gstNumber"
						defaultValue={v("gstNumber")}
					/>
				</div>
				<div>
					<Label htmlFor="fssaiLicense">FSSAI licence (optional)</Label>
					<Input
						id="fssaiLicense"
						name="fssaiLicense"
						defaultValue={v("fssaiLicense")}
					/>
				</div>
			</div>
			<div>
				<Label htmlFor="description">Short description (optional)</Label>
				<Textarea
					id="description"
					name="description"
					defaultValue={v("description")}
				/>
			</div>
		</Form>
	);
}

function StoreForm({
	errors,
	values,
	slug,
	apex,
}: {
	errors: Record<string, string>;
	values: Record<string, string>;
	slug: string;
	apex: string;
}) {
	return (
		<Form method="post" id="step-form" className="space-y-4" noValidate>
			<h2 className="text-xl font-bold text-ink-900">
				Choose your store address
			</h2>
			<p className="text-sm text-ink-500">
				This is the web address customers will use. You can change it before you
				go live.
			</p>
			<div>
				<Label htmlFor="slug">Subdomain</Label>
				<div className="flex items-center gap-2">
					<Input
						id="slug"
						name="slug"
						defaultValue={values.slug ?? slug}
						aria-invalid={!!errors.slug}
						className="max-w-[16rem]"
						placeholder="your-store"
						autoCapitalize="none"
						autoCorrect="off"
					/>
					<span className="text-sm text-ink-500">.{apex}</span>
				</div>
				<FieldError>{errors.slug}</FieldError>
				<p className="mt-2 text-xs text-ink-400">
					Lowercase letters, numbers and hyphens. Reserved names and names
					already taken are blocked.
				</p>
			</div>
		</Form>
	);
}

function PlanForm({ prefill }: { prefill: Record<string, unknown> }) {
	const selected = (prefill.planSlug as string) ?? "growth";
	const cycle = (prefill.cycle as string) ?? "monthly";
	return (
		<Form method="post" id="step-form" className="space-y-4" noValidate>
			<h2 className="text-xl font-bold text-ink-900">Choose your plan</h2>
			<p className="text-sm text-ink-500">
				Selecting a plan does not charge you. Your store stays in review and
				plan features remain locked until a verified payment or Bhama Vision
				activates your account.
			</p>
			<fieldset className="flex gap-4">
				<label className="flex items-center gap-2 text-sm">
					<input
						type="radio"
						name="cycle"
						value="monthly"
						defaultChecked={cycle === "monthly"}
					/>{" "}
					Monthly
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="radio"
						name="cycle"
						value="annual"
						defaultChecked={cycle === "annual"}
					/>{" "}
					Annual (save ~17%)
				</label>
			</fieldset>
			<div className="space-y-3">
				{PLANS.map((plan) => (
					<label
						key={plan.slug}
						className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 p-4 has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-500/30"
					>
						<input
							type="radio"
							name="planSlug"
							value={plan.slug}
							defaultChecked={selected === plan.slug}
							className="mt-1"
						/>
						<span className="flex-1">
							<span className="flex items-center justify-between">
								<span className="font-semibold text-ink-900">{plan.name}</span>
								<span className="text-sm font-bold text-ink-900">
									{formatInrMinor(plan.monthlyPaise)}/mo
								</span>
							</span>
							<span className="mt-0.5 block text-sm text-ink-500">
								{plan.tagline}
							</span>
						</span>
					</label>
				))}
			</div>
		</Form>
	);
}

function SetupForm({ errors, values, prefill }: FormProps) {
	const v = (k: string) => values[k] ?? (prefill[k] as string) ?? "";
	const codDefault = prefill.codEnabled !== false;
	return (
		<Form method="post" id="step-form" className="space-y-4" noValidate>
			<h2 className="text-xl font-bold text-ink-900">Store setup</h2>
			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="minOrderRupees">Minimum order value (₹)</Label>
					<Input
						id="minOrderRupees"
						name="minOrderRupees"
						type="number"
						min={0}
						defaultValue={v("minOrderRupees") || "0"}
					/>
				</div>
				<div>
					<Label htmlFor="brandColor">Brand colour (hex, optional)</Label>
					<Input
						id="brandColor"
						name="brandColor"
						defaultValue={v("brandColor")}
						aria-invalid={!!errors.brandColor}
						placeholder="#039855"
					/>
					<FieldError>{errors.brandColor}</FieldError>
				</div>
			</div>
			<div>
				<Label htmlFor="logoUrl">Logo URL (optional)</Label>
				<Input
					id="logoUrl"
					name="logoUrl"
					defaultValue={v("logoUrl")}
					aria-invalid={!!errors.logoUrl}
					placeholder="https://…/logo.png"
				/>
				<FieldError>{errors.logoUrl}</FieldError>
				<p className="mt-1 text-xs text-ink-400">
					Paste a hosted image URL. Direct upload to storage arrives with the
					catalogue in the next phase.
				</p>
			</div>
			<label className="flex items-center gap-2.5 text-sm text-ink-700">
				<input
					type="checkbox"
					name="codEnabled"
					defaultChecked={codDefault}
					className="size-4 rounded border-ink-300 text-brand-600"
				/>
				Accept Cash on Delivery
			</label>
			<p className="text-xs text-ink-400">
				Online payments are shown as unavailable until you connect an approved
				payment gateway (a later step).
			</p>
			<div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
				<p className="text-sm font-medium text-ink-700">
					First delivery zone (optional)
				</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-3">
					<Input
						name="zoneName"
						defaultValue={v("zoneName")}
						placeholder="Zone name"
					/>
					<Input
						name="zonePincodes"
						defaultValue={v("zonePincodes")}
						placeholder="PIN codes, comma-separated"
						className="sm:col-span-2"
					/>
					<Input
						name="zoneFeeRupees"
						type="number"
						min={0}
						defaultValue={v("zoneFeeRupees")}
						placeholder="Delivery fee (₹)"
					/>
				</div>
			</div>
		</Form>
	);
}

function ReviewForm() {
	return (
		<Form method="post" id="step-form" className="space-y-4" noValidate>
			<h2 className="text-xl font-bold text-ink-900">Review & submit</h2>
			<p className="text-sm text-ink-600">
				You've completed the setup steps. Submitting sends your store to Bhama
				Vision for review.
			</p>
			<ul className="space-y-2 text-sm text-ink-600">
				{[
					"Business details saved",
					"Store subdomain reserved",
					"Plan selected (not charged yet)",
					"Store settings configured",
				].map((t) => (
					<li key={t} className="flex items-center gap-2">
						<Check className="size-4 text-brand-600" /> {t}
					</li>
				))}
			</ul>
			<div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
				Your store will be marked <strong>In review</strong>. It goes live only
				after a verified payment or an explicit activation by Bhama Vision — we
				never activate paid features automatically.
			</div>
		</Form>
	);
}
