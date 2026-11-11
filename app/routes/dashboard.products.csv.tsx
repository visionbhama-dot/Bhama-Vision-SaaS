import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import {
	ArrowLeft,
	Download,
	FileSpreadsheet,
	Loader2,
	Upload,
	AlertTriangle,
	CheckCircle2,
} from "lucide-react";
import type { Route } from "./+types/dashboard.products.csv";
import { getEnv, toPublicConfig } from "~/lib/env.server";
import { resolveBrand } from "~/config/brand";
import { buildMeta } from "~/lib/seo";
import { requireUser, getMerchantContext } from "~/lib/auth.server";
import { Logo } from "~/modules/marketing/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
	buildCsv,
	matrixToRecords,
	parseCsv,
	templateCsv,
} from "~/modules/products/csv";
import { validateCsvRecords, type CsvRow } from "~/modules/products/schema";
import { importCsvRows } from "~/modules/products/service.server";

export function meta({ data }: Route.MetaArgs) {
	return buildMeta({
		title: `Import / export CSV — ${data?.brand.name ?? "Bhama Vision"}`,
		description: "Bulk product CSV.",
		siteName: data?.brand.name ?? "Bhama Vision Grocery Cloud",
		noindex: true,
	});
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = getEnv(context.cloudflare.env);
	const brand = resolveBrand(toPublicConfig(env));
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant)
		throw redirect("/onboarding/business", { headers: auth.headers });
	return { brand };
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB upload cap
const MAX_ROWS = 2000;

export async function action({ request, context }: Route.ActionArgs) {
	const { auth, user } = await requireUser(request, context.cloudflare.env);
	const ctx = await getMerchantContext(auth.supabase, user.id);
	if (!ctx.tenant) return { error: "No store found." };

	const form = await request.formData();
	const intent = String(form.get("intent") ?? "preview");
	const updateExisting = String(form.get("updateExisting") ?? "") === "on";
	const file = form.get("file");

	if (!(file instanceof File) || file.size === 0) {
		return { error: "Please choose a CSV file." };
	}
	if (file.size > MAX_BYTES) {
		return { error: "File is too large (max 2 MB)." };
	}

	const text = await file.text();
	const matrix = parseCsv(text);
	if (matrix.length < 2) {
		return {
			error:
				"The file has no data rows (needs a header row + at least one product).",
		};
	}
	const { records } = matrixToRecords(matrix);
	if (records.length > MAX_ROWS) {
		return {
			error: `Too many rows (${records.length}). Split into files of ${MAX_ROWS} or fewer.`,
		};
	}

	const results = validateCsvRecords(records);
	const validRows = results
		.filter((r) => r.ok && r.data)
		.map((r) => r.data as CsvRow);
	const invalid = results
		.filter((r) => !r.ok)
		.map((r) => ({ line: r.line, errors: r.errors }));

	if (intent === "preview") {
		return {
			preview: {
				total: results.length,
				valid: validRows.length,
				invalid: invalid.length,
				updateExisting,
				invalidRows: invalid.slice(0, 200),
				sample: results.slice(0, 50).map((r) => ({
					line: r.line,
					ok: r.ok,
					name: r.data?.name ?? "",
					price: r.data?.price ?? null,
					errors: r.errors,
				})),
			},
		};
	}

	// intent === "import": only import the valid rows.
	if (validRows.length === 0) {
		return {
			error: "No valid rows to import. Fix the errors shown and try again.",
		};
	}
	const res = await importCsvRows(auth.supabase, ctx.tenant.id, validRows, {
		updateExisting,
	});
	return {
		imported: { ...res, invalid: invalid.length },
		invalidRows: invalid.slice(0, 500),
	};
}

export default function ProductsCsv({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { brand } = loaderData;
	const nav = useNavigation();
	const busy = nav.state !== "idle";
	const [fileName, setFileName] = useState("");

	const preview = (actionData as { preview?: PreviewShape })?.preview;
	const imported = (actionData as { imported?: ImportedShape })?.imported;
	const invalidRows =
		(actionData as { invalidRows?: { line: number; errors: string[] }[] })
			?.invalidRows ?? [];
	const error = (actionData as { error?: string })?.error;

	function downloadTemplate() {
		triggerDownload(templateCsv(), "bhama-vision-products-template.csv");
	}
	function downloadErrorReport() {
		const rows = invalidRows.map((r) => [String(r.line), r.errors.join("; ")]);
		triggerDownload(buildCsv(["line", "errors"], rows), "import-errors.csv");
	}

	return (
		<div className="min-h-screen bg-canvas">
			<header className="border-b border-ink-100 bg-white">
				<div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link to="/" aria-label={`${brand.name} home`}>
						<Logo name={brand.shortName} />
					</Link>
					<Link to="/dashboard/products">
						<Button variant="ghost" size="sm">
							<ArrowLeft /> Back to products
						</Button>
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
				<h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
					<FileSpreadsheet className="size-6 text-brand-700" /> Import &amp;
					export CSV
				</h1>
				<p className="mt-1 max-w-2xl text-sm text-ink-500">
					Bulk-add products from a spreadsheet. New products arrive as{" "}
					<strong>drafts</strong>; you confirm price and stock before
					publishing.
				</p>

				<div className="mt-5 flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={downloadTemplate}
					>
						<Download /> Download template
					</Button>
					<a href="/dashboard/products/export">
						<Button type="button" variant="outline" size="sm">
							<Download /> Export my products
						</Button>
					</a>
				</div>

				{error && (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{error}
					</div>
				)}

				{/* Upload form */}
				<Card className="mt-6">
					<CardContent>
						<Form
							method="post"
							encType="multipart/form-data"
							className="space-y-4"
						>
							<div>
								<label
									htmlFor="file"
									className="mb-1.5 block text-sm font-medium text-ink-800"
								>
									CSV file
								</label>
								<input
									id="file"
									name="file"
									type="file"
									accept=".csv,text/csv"
									onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
									className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
									required
								/>
								{fileName && (
									<p className="mt-1 text-xs text-ink-400">{fileName}</p>
								)}
							</div>
							<label className="flex items-center gap-2.5 text-sm text-ink-700">
								<input
									type="checkbox"
									name="updateExisting"
									className="size-4 rounded border-ink-300 text-brand-600"
								/>
								Update existing products that match by SKU (or name)
							</label>
							<div className="flex flex-wrap gap-2">
								<Button
									type="submit"
									name="intent"
									value="preview"
									variant="outline"
									disabled={busy}
								>
									{busy ? (
										<Loader2 className="animate-spin" />
									) : (
										<FileSpreadsheet />
									)}{" "}
									Preview
								</Button>
								<Button
									type="submit"
									name="intent"
									value="import"
									disabled={busy}
								>
									{busy ? <Loader2 className="animate-spin" /> : <Upload />}{" "}
									Import valid rows
								</Button>
							</div>
						</Form>
					</CardContent>
				</Card>

				{/* Preview */}
				{preview && (
					<Card className="mt-6">
						<CardContent>
							<h2 className="font-semibold text-ink-900">Preview</h2>
							<div className="mt-2 flex flex-wrap gap-2 text-sm">
								<Badge variant="brand">{preview.valid} valid</Badge>
								{preview.invalid > 0 && (
									<Badge variant="neutral">{preview.invalid} with errors</Badge>
								)}
								<Badge variant="outline">{preview.total} rows</Badge>
								{preview.updateExisting && (
									<Badge variant="blue">Update-existing on</Badge>
								)}
							</div>
							<CsvRowTable rows={preview.sample} />
							{preview.invalid > 0 && (
								<p className="mt-3 text-sm text-ink-500">
									Only valid rows will be imported. Fix errors and re-upload to
									import the rest.
								</p>
							)}
						</CardContent>
					</Card>
				)}

				{/* Import result */}
				{imported && (
					<Card className="mt-6">
						<CardContent>
							<h2 className="flex items-center gap-2 font-semibold text-ink-900">
								<CheckCircle2 className="size-5 text-brand-600" /> Import
								finished
							</h2>
							<div className="mt-2 flex flex-wrap gap-2 text-sm">
								<Badge variant="brand">{imported.created} created</Badge>
								{imported.updated > 0 && (
									<Badge variant="blue">{imported.updated} updated</Badge>
								)}
								{imported.failed > 0 && (
									<Badge variant="neutral">{imported.failed} failed</Badge>
								)}
								{imported.invalid > 0 && (
									<Badge variant="neutral">
										{imported.invalid} skipped (invalid)
									</Badge>
								)}
							</div>
							<p className="mt-3 text-sm text-ink-500">
								New products are drafts.{" "}
								<Link
									to="/dashboard/products"
									className="font-semibold text-brand-700 underline"
								>
									Go to products
								</Link>{" "}
								to review and publish.
							</p>
							{invalidRows.length > 0 && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-3"
									onClick={downloadErrorReport}
								>
									<AlertTriangle /> Download error report ({invalidRows.length})
								</Button>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}

interface PreviewShape {
	total: number;
	valid: number;
	invalid: number;
	updateExisting: boolean;
	invalidRows: { line: number; errors: string[] }[];
	sample: {
		line: number;
		ok: boolean;
		name: string;
		price: number | null;
		errors: string[];
	}[];
}
interface ImportedShape {
	created: number;
	updated: number;
	failed: number;
	invalid: number;
}

function CsvRowTable({ rows }: { rows: PreviewShape["sample"] }) {
	return (
		<div className="mt-4 overflow-x-auto">
			<table className="w-full text-left text-sm">
				<thead>
					<tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
						<th className="py-2 pr-3">Line</th>
						<th className="py-2 pr-3">Name</th>
						<th className="py-2 pr-3">Price</th>
						<th className="py-2 pr-3">Status</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.line} className="border-b border-ink-50 align-top">
							<td className="py-2 pr-3 text-ink-400">{r.line}</td>
							<td className="py-2 pr-3 text-ink-800">
								{r.name || <span className="text-ink-300">—</span>}
							</td>
							<td className="py-2 pr-3 text-ink-600">{r.price ?? "—"}</td>
							<td className="py-2 pr-3">
								{r.ok ? (
									<span className="text-brand-700">OK</span>
								) : (
									<span className="text-red-600">{r.errors.join("; ")}</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function triggerDownload(content: string, filename: string) {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
