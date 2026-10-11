<script lang="ts" module>
	/** One column of an import sheet. */
	export interface ImportColumn {
		/** Field name sent to the server. */
		key: string;
		/** Header shown in the template and the preview. */
		label: string;
		required?: boolean;
		type?: 'text' | 'integer' | 'number' | 'date' | 'email';
		/** Sample value for the template's example row. */
		example?: string;
		/** Other header spellings to accept from existing sheets. */
		aliases?: string[];
	}
</script>

<script lang="ts">
	/**
	 * Import rows from an Excel or CSV file.
	 *
	 * Choose a file, see every row and anything wrong with it, then import.
	 * Nothing is sent until the sheet is clean, and the server saves the rows
	 * together, so an import never lands half-done.
	 */
	import type { Snippet } from 'svelte';
	import { Upload, Download, X, FileSpreadsheet, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-svelte';
	import { ImportRowsError, type ImportRowIssue } from '$lib/api/imports';

	type Row = Record<string, string | number | undefined>;

	interface Props {
		title: string;
		description: string;
		columns: ImportColumn[];
		/** File name of the downloadable template, without extension. */
		templateName: string;
		/** Sends the rows; resolves with the sentence shown on success. */
		onImport: (rows: Row[]) => Promise<string>;
		onClose: () => void;
		/** Called after a successful import, before the user closes the dialog. */
		onImported?: () => void;
		/** Settings that apply to the whole import, shown above the file picker. */
		extra?: Snippet;
		/** False while those settings are incomplete. */
		ready?: boolean;
	}

	let { title, description, columns, templateName, onImport, onClose, onImported, extra, ready = true }: Props = $props();

	const MAX_ROWS = 500;
	const PREVIEW_ROWS = 50;

	let fileName = $state('');
	let rows = $state.raw<Row[]>([]);
	let issues = $state.raw<ImportRowIssue[]>([]);
	let parseError = $state<string | null>(null);
	let parsing = $state(false);
	let importing = $state(false);
	let done = $state<string | null>(null);

	const normalize = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

	/** Map a sheet's headers onto column keys, tolerant of spacing and case. */
	function headerMap(headers: string[]): Map<string, string> {
		const map = new Map<string, string>();
		for (const header of headers) {
			const h = normalize(header);
			const column = columns.find((c) => [c.label, c.key, ...(c.aliases ?? [])].some((name) => normalize(name) === h));
			if (column) map.set(header, column.key);
		}
		return map;
	}

	function toIsoDate(value: unknown): string | null {
		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			// Spreadsheet dates are calendar dates: read them in local time.
			const pad = (n: number) => String(n).padStart(2, '0');
			return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
		}
		const text = String(value ?? '').trim();
		if (!text) return null;
		const parsed = new Date(text);
		return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
	}

	/** Convert one cell to its column's type, or report why it cannot be. */
	function convert(column: ImportColumn, raw: unknown): { value?: string | number; problem?: string } {
		const text = raw instanceof Date ? raw.toISOString() : String(raw ?? '').trim();

		if (!text) {
			return column.required ? { problem: `${column.label} is required` } : {};
		}

		switch (column.type) {
			case 'integer': {
				const n = Number(text.replace(/,/g, ''));
				return Number.isInteger(n) && n > 0 ? { value: n } : { problem: `${column.label} must be a whole number above 0` };
			}
			case 'number': {
				const n = Number(text.replace(/[,₱\s]/g, ''));
				return Number.isFinite(n) && n >= 0 ? { value: n } : { problem: `${column.label} must be a number` };
			}
			case 'date': {
				const iso = toIsoDate(raw);
				return iso ? { value: iso } : { problem: `${column.label} is not a date` };
			}
			case 'email':
				return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { value: text.toLowerCase() } : { problem: `${column.label} is not an email address` };
			default:
				return { value: text };
		}
	}

	async function readFile(input: HTMLInputElement): Promise<void> {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		fileName = file.name;
		rows = [];
		issues = [];
		parseError = null;
		done = null;
		parsing = true;

		try {
			const XLSX = await import('xlsx');
			const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
			const sheet = workbook.Sheets[workbook.SheetNames[0]];
			const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });

			if (records.length === 0) {
				parseError = 'The first sheet has no rows under its header.';
				return;
			}
			if (records.length > MAX_ROWS) {
				parseError = `This file has ${records.length} rows. Import up to ${MAX_ROWS} at a time.`;
				return;
			}

			const map = headerMap(Object.keys(records[0]));
			const missing = columns.filter((c) => c.required && ![...map.values()].includes(c.key));
			if (missing.length) {
				parseError = `Missing column${missing.length === 1 ? '' : 's'}: ${missing.map((c) => c.label).join(', ')}. Download the template to see the expected headers.`;
				return;
			}

			const parsed: Row[] = [];
			const found: ImportRowIssue[] = [];

			records.forEach((record, index) => {
				const byKey: Record<string, unknown> = {};
				for (const [header, key] of map) byKey[key] = record[header];

				// Fully blank lines are spacing, not data.
				if (Object.values(byKey).every((v) => String(v ?? '').trim() === '')) return;

				const row: Row = {};
				for (const column of columns) {
					const { value, problem } = convert(column, byKey[column.key]);
					if (problem) found.push({ row: index + 2, message: problem });
					if (value !== undefined) row[column.key] = value;
				}
				parsed.push(row);
			});

			if (parsed.length === 0) {
				parseError = 'The first sheet has no rows under its header.';
				return;
			}

			rows = parsed;
			issues = found;
		} catch (err) {
			console.error('[Import] Could not read file:', err);
			parseError = 'This file could not be read. Use an Excel (.xlsx) or CSV file.';
		} finally {
			parsing = false;
		}
	}

	async function downloadTemplate(): Promise<void> {
		const XLSX = await import('xlsx');
		const sheet = XLSX.utils.aoa_to_sheet([columns.map((c) => c.label), columns.map((c) => c.example ?? '')]);
		sheet['!cols'] = columns.map((c) => ({ wch: Math.max(14, c.label.length + 4) }));
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, sheet, 'Import');
		XLSX.writeFile(workbook, `${templateName}.xlsx`);
	}

	async function runImport(): Promise<void> {
		if (!ready || !rows.length || issues.length) return;
		importing = true;
		parseError = null;
		try {
			done = await onImport(rows);
			onImported?.();
		} catch (err) {
			if (err instanceof ImportRowsError) {
				issues = err.rowErrors;
			}
			parseError = err instanceof Error ? err.message : 'The import failed. Nothing was saved.';
		} finally {
			importing = false;
		}
	}

	const previewColumns = $derived(columns.filter((c) => rows.some((r) => r[c.key] !== undefined) || c.required));
</script>

<div class="fixed inset-0 z-50 overflow-y-auto">
	<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={onClose} aria-label="Close" tabindex="-1"></button>

	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			class="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="import-title"
		>
			<div class="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6">
				<div class="flex items-start gap-3">
					<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-600 text-white">
						<FileSpreadsheet size={20} />
					</div>
					<div>
						<h2 id="import-title" class="text-base font-bold text-gray-900 sm:text-lg">{title}</h2>
						<p class="mt-0.5 text-sm text-gray-500">{description}</p>
					</div>
				</div>
				<button type="button" onclick={onClose} class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
					<X size={20} />
				</button>
			</div>

			<div class="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
				{#if done}
					<div class="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
						<CircleCheck size={20} class="mt-0.5 shrink-0 text-emerald-600" />
						<div>
							<p class="text-sm font-semibold text-emerald-900">Import complete</p>
							<p class="mt-0.5 text-sm text-emerald-800">{done}</p>
						</div>
					</div>
				{:else}
					{@render extra?.()}

					<div class="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-gray-900">{fileName || 'Choose an Excel or CSV file'}</p>
							<p class="mt-0.5 text-xs text-gray-500">
								First sheet only · up to {MAX_ROWS} rows · columns: {columns.map((c) => c.label + (c.required ? '*' : '')).join(', ')}
							</p>
						</div>
						<div class="flex shrink-0 flex-wrap gap-2">
							<button
								type="button"
								onclick={downloadTemplate}
								class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								<Download size={15} /> Template
							</button>
							<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold text-white hover:bg-pink-700 {parsing ? 'pointer-events-none opacity-60' : ''}">
								{#if parsing}
									<LoaderCircle size={15} class="animate-spin" /> Reading…
								{:else}
									<Upload size={15} /> {fileName ? 'Choose another file' : 'Choose file'}
								{/if}
								<input type="file" accept=".xlsx,.xls,.csv" class="sr-only" disabled={parsing} onchange={(e) => readFile(e.currentTarget)} />
							</label>
						</div>
					</div>

					{#if parseError}
						<div class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
							<CircleAlert size={16} class="mt-0.5 shrink-0" />
							<span>{parseError}</span>
						</div>
					{/if}

					{#if issues.length}
						<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
							<p class="text-sm font-semibold text-amber-900">
								{issues.length} problem{issues.length === 1 ? '' : 's'} to fix in the file. Nothing has been imported.
							</p>
							<ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-900">
								{#each issues.slice(0, 100) as issue, i (i)}
									<li><span class="font-semibold">Row {issue.row}:</span> {issue.message}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if rows.length}
						<div>
							<p class="mb-2 text-sm font-semibold text-gray-900">
								{rows.length} row{rows.length === 1 ? '' : 's'} {issues.length ? 'read' : 'ready'}
								{#if rows.length > PREVIEW_ROWS}<span class="font-normal text-gray-500"> · showing the first {PREVIEW_ROWS}</span>{/if}
							</p>
							<div class="overflow-x-auto rounded-lg border border-gray-200">
								<table class="min-w-full divide-y divide-gray-200 text-xs">
									<thead class="bg-gray-50 text-left font-semibold tracking-wide text-gray-500 uppercase">
										<tr>
											<th scope="col" class="px-3 py-2">Row</th>
											{#each previewColumns as column (column.key)}
												<th scope="col" class="px-3 py-2 whitespace-nowrap">{column.label}</th>
											{/each}
										</tr>
									</thead>
									<tbody class="divide-y divide-gray-100 bg-white">
										{#each rows.slice(0, PREVIEW_ROWS) as row, i (i)}
											<tr>
												<td class="px-3 py-2 text-gray-400 tabular-nums">{i + 2}</td>
												{#each previewColumns as column (column.key)}
													<td class="max-w-48 truncate px-3 py-2 text-gray-800" title={String(row[column.key] ?? '')}>{row[column.key] ?? '—'}</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<div class="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 sm:px-6">
				<button type="button" onclick={onClose} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
					{done ? 'Close' : 'Cancel'}
				</button>
				{#if !done}
					<button
						type="button"
						onclick={runImport}
						disabled={importing || !ready || rows.length === 0 || issues.length > 0}
						class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if importing}<LoaderCircle size={15} class="animate-spin" />{/if}
						{importing ? 'Importing…' : `Import ${rows.length || ''} row${rows.length === 1 ? '' : 's'}`}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
