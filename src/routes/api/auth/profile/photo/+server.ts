/**
 * POST /api/auth/profile/photo
 *
 * SvelteKit server-side endpoint for profile photo uploads.
 * Handles parsing and validation of the profile image, uploads it directly
 * to Cloudinary from SvelteKit, and then updates the Laravel database
 * by forwarding the profile photo URL and public ID in an encrypted JSON request.
 *
 * This completely avoids multipart/form-data boundary issues across the BFF proxy.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createHash } from 'crypto';
import { encrypt, decrypt } from '$lib/server/utils/crypto';

/** Allowed MIME types for profile photos */
const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/avif'
]);

/** 5 MiB maximum upload size for profile photos */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

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
		console.error('[profile-photo] Cloudinary is not configured. Check CLOUDINARY_* env variables.');
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
		console.error('[profile-photo] Failed to parse multipart body:', err);
		return json({ error: 'Bad Request', message: 'Could not parse the request body.' }, { status: 400 });
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
				message: `File size (${(file.size / 1024 / 1024).toFixed(1)} MiB) exceeds the 5 MiB limit.`
			},
			{ status: 422 }
		);
	}

	// ── Upload to Cloudinary ──────────────────────────────────────────────────
	const timestamp = Math.floor(Date.now() / 1000);
	const paramsToSign: Record<string, string | number> = {
		folder,
		timestamp
	};

	const signatureStr =
		Object.keys(paramsToSign)
			.sort()
			.map((k) => `${k}=${paramsToSign[k]}`)
			.join('&') + apiSecret;

	const signature = createHash('sha1').update(signatureStr).digest('hex');

	const uploadForm = new FormData();
	uploadForm.append('file', file);
	uploadForm.append('api_key', apiKey);
	uploadForm.append('timestamp', String(timestamp));
	uploadForm.append('signature', signature);
	uploadForm.append('folder', folder);

	let uploadResult;
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
			const cloudinaryMessage = data?.error?.message ?? 'Unknown Cloudinary error';
			console.error('[profile-photo] Cloudinary rejected the upload:', cloudinaryMessage);
			return json(
				{ error: 'Upload failed', message: cloudinaryMessage },
				{ status: cloudinaryRes.status >= 500 ? 502 : 422 }
			);
		}

		uploadResult = {
			url: data.secure_url as string,
			filename: data.public_id as string
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[profile-photo] Network error reaching Cloudinary:', message);
		return json(
			{ error: 'Upload failed', message: 'Could not reach the storage service.' },
			{ status: 502 }
		);
	}

	// ── Update Laravel Backend via Encrypted JSON API ─────────────────────────
	const laravelBaseUrl = env.LARAVEL_API_URL || 'http://127.0.0.1:8000';
	
	const backendPayload = {
		profile_photo_url: uploadResult.url,
		profile_photo_public_id: uploadResult.filename
	};

	const encryptedPayload = encrypt(backendPayload);

	try {
		const laravelRes = await fetch(`${laravelBaseUrl}/api/auth/profile/photo`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify(encryptedPayload)
		});

		const responseText = await laravelRes.text();
		
		if (!laravelRes.ok) {
			console.error('[profile-photo] Backend rejected profile photo update:', responseText);
			return json(
				{ error: 'Update failed', message: 'Could not update profile information in backend.' },
				{ status: laravelRes.status }
			);
		}

		// Decrypt backend response
		const isEncrypted = laravelRes.headers.get('X-Response-Encrypted') === 'true' ||
			laravelRes.headers.get('x-response-encrypted') === 'true';

		let finalData;
		if (isEncrypted && responseText) {
			const encryptedJson = JSON.parse(responseText);
			finalData = decrypt(
				encryptedJson.payload,
				encryptedJson.iv,
				encryptedJson.tag,
				encryptedJson.timestamp
			);
		} else {
			finalData = JSON.parse(responseText);
		}

		return json(finalData);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[profile-photo] Error communicating with Laravel backend:', message);
		return json(
			{ error: 'Update failed', message: 'Could not update user record in database.' },
			{ status: 502 }
		);
	}
};
