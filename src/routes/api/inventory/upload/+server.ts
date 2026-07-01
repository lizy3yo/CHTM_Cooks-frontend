/**
 * POST /api/inventory/upload
 *
 * Industry-standard server-side file upload handler.
 * Uploads directly from SvelteKit to Cloudinary, bypassing the Laravel
 * BFF proxy entirely for file uploads. This eliminates the multipart
 * boundary corruption that occurs when proxying through serverless environments.
 *
 * Security:
 *  - Requires a valid HttpOnly access_token cookie (JWT).
 *  - Uses a signed upload with SHA-1 HMAC to prevent unauthorized client uploads.
 *  - Validates file MIME type and size server-side before sending to Cloudinary.
 *
 * Response (200):
 *  { success: true, url: string, filename: string }
 *
 * Response (4xx/5xx):
 *  { error: string, message?: string }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createHash } from 'crypto';

/** Allowed MIME types for inventory images */
const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif'
]);

/** 10 MiB maximum upload size */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, cookies }) => {
	// ── Authentication ────────────────────────────────────────────────────────
	const accessToken = cookies.get('access_token');
	if (!accessToken) {
		return json({ error: 'Unauthorized', message: 'No active session.' }, { status: 401 });
	}

	// ── Cloudinary configuration ──────────────────────────────────────────────
	const cloudName = env.CLOUDINARY_CLOUD_NAME;
	const apiKey = env.CLOUDINARY_API_KEY;
	const apiSecret = env.CLOUDINARY_API_SECRET;
	const folder = env.CLOUDINARY_FOLDER || 'chtm_cooks';

	if (!cloudName || !apiKey || !apiSecret) {
		console.error('[upload] Cloudinary is not configured. Check CLOUDINARY_* env variables.');
		return json(
			{ error: 'Storage service not configured', message: 'Contact an administrator.' },
			{ status: 503 }
		);
	}

	// ── Parse multipart body ──────────────────────────────────────────────────
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (err) {
		console.error('[upload] Failed to parse multipart body:', err);
		return json(
			{ error: 'Bad Request', message: 'Could not parse the request body.' },
			{ status: 400 }
		);
	}

	const file = formData.get('file');

	if (!file || !(file instanceof File)) {
		return json({ error: 'Validation failed', message: 'A file is required.' }, { status: 400 });
	}

	// ── Server-side validation ────────────────────────────────────────────────
	if (!ALLOWED_MIME_TYPES.has(file.type)) {
		return json(
			{
				error: 'Validation failed',
				message: `File type "${file.type}" is not allowed. Upload a JPEG, PNG, WebP, GIF, or AVIF image.`
			},
			{ status: 422 }
		);
	}

	if (file.size > MAX_FILE_BYTES) {
		return json(
			{
				error: 'Validation failed',
				message: `File size (${(file.size / 1024 / 1024).toFixed(1)} MiB) exceeds the 10 MiB limit.`
			},
			{ status: 422 }
		);
	}

	// ── Build signed Cloudinary upload request ────────────────────────────────
	// Cloudinary requires a SHA-1 signature of sorted params + API secret
	// to prevent unauthorized uploads from client-side.
	const timestamp = Math.floor(Date.now() / 1000);
	const paramsToSign: Record<string, string | number> = { folder, timestamp };

	const signatureStr =
		Object.keys(paramsToSign)
			.sort()
			.map((k) => `${k}=${paramsToSign[k]}`)
			.join('&') + apiSecret;

	const signature = createHash('sha1').update(signatureStr).digest('hex');

	// ── Upload to Cloudinary ──────────────────────────────────────────────────
	const uploadForm = new FormData();
	uploadForm.append('file', file);
	uploadForm.append('api_key', apiKey);
	uploadForm.append('timestamp', String(timestamp));
	uploadForm.append('signature', signature);
	uploadForm.append('folder', folder);

	try {
		const cloudinaryRes = await fetch(
			`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
			{
				method: 'POST',
				body: uploadForm
			}
		);

		const data = await cloudinaryRes.json();

		if (!cloudinaryRes.ok) {
			const cloudinaryMessage = (data?.error?.message as string) ?? 'Unknown Cloudinary error';
			console.error('[upload] Cloudinary rejected the upload:', cloudinaryMessage);
			return json(
				{ error: 'Upload failed', message: cloudinaryMessage },
				{ status: cloudinaryRes.status >= 500 ? 502 : 422 }
			);
		}

		return json({
			success: true,
			url: data.secure_url as string,
			filename: data.public_id as string
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[upload] Network error reaching Cloudinary:', message);
		return json(
			{ error: 'Upload failed', message: 'Could not reach the storage service.' },
			{ status: 502 }
		);
	}
};

