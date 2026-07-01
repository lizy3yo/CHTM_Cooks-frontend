import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import {
	initializeRequestContext,
	getRequestContext,
	getRequestDuration,
	addRequestIdHeader
} from '$lib/server/middleware/requestContext';
import { logRequest, logError, logInfo, logWarn, logRequestAudit } from '$lib/server/utils/logger';
import {
	formatErrorResponse,
	isOperationalError,
	shouldLogError,
	getRetryAfter
} from '$lib/server/errors/errorFormatter';
import type { AppError } from '$lib/server/errors/AppError';
import { securityHeadersMiddleware } from '$lib/server/middleware/security';
import { encrypt, decrypt } from '$lib/server/utils/crypto';
import {
	setAuthTokens,
	clearAuthCookies,
	getAccessTokenMaxAge,
	TOKEN_EXPIRY,
	setRememberMeCookie,
	clearRememberMeCookie,
	getClientIp
} from '$lib/server/middleware/auth/cookies';


/**
 * Simple cookie serializer for manual cookie setting when bypassing SvelteKit resolve
 */
function serializeCookie(name: string, value: string, options: any = {}): string {
	let str = `${name}=${encodeURIComponent(value)}`;
	if (options.maxAge !== undefined) {
		str += `; Max-Age=${options.maxAge}`;
	}
	if (options.expires) {
		str += `; Expires=${options.expires.toUTCString()}`;
	}
	if (options.path) {
		str += `; Path=${options.path}`;
	}
	if (options.secure) {
		str += '; Secure';
	}
	if (options.httpOnly) {
		str += '; HttpOnly';
	}
	if (options.sameSite) {
		str += `; SameSite=${options.sameSite}`;
	}
	return str;
}

/**
 * Laravel API BFF Proxy Handler
 * Intercepts all api requests, encrypts them, forwards them to the Laravel backend,
 * decrypts the response, and returns it to the client.
 */
const laravelProxyHandler: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/api')) {
		const laravelBaseUrl = env.LARAVEL_API_URL || 'http://127.0.0.1:8000';
		const laravelUrl = `${laravelBaseUrl}${event.url.pathname}${event.url.search}`;

		const headers = new Headers();

		// Copy incoming headers, omitting specific connection/host headers
		for (const [key, value] of event.request.headers.entries()) {
			if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
				continue;
			}
			headers.set(key, value);
		}

		// Forward authentication cookie as Bearer token if available
		const accessToken = event.cookies.get('access_token');
		if (accessToken) {
			headers.set('Authorization', `Bearer ${accessToken}`);
		}

		headers.set('Accept', 'application/json');

		const requestOptions: RequestInit = {
			method: event.request.method,
			headers
		};

		// Only read/encrypt body for non-safe methods
		if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
			const contentType = event.request.headers.get('content-type') || '';

			if (contentType.includes('application/json')) {
				try {
					const bodyJson = await event.request.json();
					const encryptedBody = encrypt(bodyJson);
					requestOptions.body = JSON.stringify(encryptedBody);
					headers.set('Content-Type', 'application/json');
				} catch (e) {
					console.error('Failed to parse and encrypt request body:', e);
				}
			} else if (contentType.includes('multipart/form-data')) {
				try {
					const arrayBuffer = await event.request.arrayBuffer();
					requestOptions.body = arrayBuffer;
				} catch (e) {
					console.error('Failed to parse multipart request body as ArrayBuffer:', e);
					requestOptions.body = event.request.body;
					Object.assign(requestOptions, { duplex: 'half' });
				}
			} else {
				// Fallback for other request bodies
				try {
					const rawBody = await event.request.text();
					if (rawBody) {
						requestOptions.body = rawBody;
					}
				} catch (e) {
					// Ignore body errors
				}
			}
		}

		try {
			const laravelResponse = await fetch(laravelUrl, requestOptions);

			const resHeaders = new Headers();
			for (const [key, value] of laravelResponse.headers.entries()) {
				if (['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
					continue;
				}
				resHeaders.set(key, value);
			}

			// ── SSE / streaming passthrough ──────────────────────────────────────
			// Streaming responses (e.g. /api/ai-chat) must NOT be buffered or
			// decrypted — pipe the body directly back to the browser.
			const contentType = laravelResponse.headers.get('content-type') ?? '';
			if (contentType.includes('text/event-stream')) {
				return new Response(laravelResponse.body, {
					status: laravelResponse.status,
					headers: resHeaders
				});
			}

			// Buffer the response body for non-streaming routes
			let responseData = await laravelResponse.text();

			// Check if response payload is encrypted

			const isEncrypted = laravelResponse.headers.get('X-Response-Encrypted') === 'true' ||
				laravelResponse.headers.get('x-response-encrypted') === 'true';

			if (isEncrypted && responseData) {
				try {
					const encryptedJson = JSON.parse(responseData);
					const decryptedData = decrypt(
						encryptedJson.payload,
						encryptedJson.iv,
						encryptedJson.tag,
						encryptedJson.timestamp
					);
					responseData = JSON.stringify(decryptedData);
					resHeaders.set('Content-Type', 'application/json');
					resHeaders.delete('X-Response-Encrypted'); // Remove internal encrypted header
				} catch (e) {
					console.error('Failed to decrypt Laravel response:', e);
					return new Response(JSON.stringify({ error: 'Failed to decrypt secure backend response' }), {
						status: 502,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			}

			// Intercept auth responses to set/clear cookies on SvelteKit side
			const isAuthRoute = event.url.pathname.startsWith('/api/auth/');
			if (isAuthRoute && responseData) {
				try {
					const jsonResponse = JSON.parse(responseData);
					const isLogin = event.url.pathname === '/api/auth/login' || event.url.pathname === '/api/auth/shortcut-login';
					const isRefresh = event.url.pathname === '/api/auth/refresh';
					const isLogout = event.url.pathname === '/api/auth/logout';
					const isAutoLogin = event.url.pathname === '/api/auth/auto-login';

					const cookieOptions = {
						path: '/',
						httpOnly: true,
						secure: !dev,
						sameSite: 'lax'
					};

					if (isLogout) {
						clearAuthCookies(event);
						clearRememberMeCookie(event);
						resHeaders.append('Set-Cookie', serializeCookie('access_token', '', { ...cookieOptions, maxAge: 0 }));
						resHeaders.append('Set-Cookie', serializeCookie('refresh_token', '', { ...cookieOptions, maxAge: 0 }));
						resHeaders.append('Set-Cookie', serializeCookie('remember_me', '', { ...cookieOptions, maxAge: 0 }));
					} else if ((isLogin || isRefresh || isAutoLogin) && (jsonResponse.success || jsonResponse.user)) {
						const { accessToken, refreshToken, user, rememberToken } = jsonResponse;
						if (accessToken && refreshToken) {
							const maxAge = user ? getAccessTokenMaxAge(user.role) : TOKEN_EXPIRY.ACCESS;
							setAuthTokens(event, accessToken, refreshToken, maxAge);

							resHeaders.append('Set-Cookie', serializeCookie('access_token', accessToken, { ...cookieOptions, maxAge }));
							resHeaders.append('Set-Cookie', serializeCookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: TOKEN_EXPIRY.REFRESH }));

							// Strip tokens from response body before forwarding to client browser
							delete jsonResponse.accessToken;
							delete jsonResponse.refreshToken;
						}

						if (rememberToken && rememberToken.plainToken) {
							const expiresAt = new Date(rememberToken.expiresAt);
							const rememberMaxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
							setRememberMeCookie(event, rememberToken.plainToken, expiresAt);

							resHeaders.append('Set-Cookie', serializeCookie('remember_me', rememberToken.plainToken, {
								...cookieOptions,
								maxAge: rememberMaxAge,
								expires: expiresAt
							}));

							// Strip rememberToken from response body
							delete jsonResponse.rememberToken;
						}

						responseData = JSON.stringify(jsonResponse);
					}
				} catch (err) {
					console.error('Failed to process auth cookies in BFF proxy:', err);
				}
			}

			return new Response(responseData, {
				status: laravelResponse.status,
				headers: resHeaders
			});
		} catch (error) {
			console.error('Error forwarding request to Laravel:', error);
			return new Response(JSON.stringify({ error: 'Backend service unavailable' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
};

/**
 * Request Context Handler
 * Initializes request ID and timing for all requests
 */
const requestContextHandler: Handle = async ({ event, resolve }) => {
	// Initialize request context (request ID, start time)
	initializeRequestContext(event);

	// Resolve the request
	const response = await resolve(event);

	// Retrieve request context *after* resolution so that userId and userRole
	// set by authHandler are correctly captured.
	const context = getRequestContext(event);

	// Add request ID to response headers
	addRequestIdHeader(response.headers, context.requestId);

	// Calculate request duration
	const duration = getRequestDuration(event);

	// Log request
	logRequest(
		event.request.method,
		event.url.pathname,
		response.status,
		duration,
		context.requestId,
		context.userId
	);

	void logRequestAudit({
		requestId: context.requestId,
		userId: context.userId,
		userRole: context.userRole,
		method: event.request.method,
		path: event.url.pathname,
		statusCode: response.status,
		responseTimeMs: duration,
		ipAddress: getClientIp(event),
		userAgent: event.request.headers.get('user-agent') || undefined
	});

	return response;
};

/**
 * Authentication Handler
 * Resolves user session context dynamically by querying Laravel's /api/auth/me API
 * using the HTTP-only access_token cookie.
 */
const authHandler: Handle = async ({ event, resolve }) => {
	// Only resolve session for page loads (non-API routes)
	if (!event.url.pathname.startsWith('/api')) {
		const accessToken = event.cookies.get('access_token');
		if (accessToken) {
			try {
				const laravelBaseUrl = env.LARAVEL_API_URL || 'http://127.0.0.1:8000';
				const meResponse = await fetch(`${laravelBaseUrl}/api/auth/me`, {
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/json'
					}
				});

				if (meResponse.ok) {
					const responseText = await meResponse.text();
					const isEncrypted = meResponse.headers.get('X-Response-Encrypted') === 'true' ||
						meResponse.headers.get('x-response-encrypted') === 'true';

					let data;
					if (isEncrypted && responseText) {
						const encryptedJson = JSON.parse(responseText);
						data = decrypt(
							encryptedJson.payload,
							encryptedJson.iv,
							encryptedJson.tag,
							encryptedJson.timestamp
						);
					} else {
						data = JSON.parse(responseText);
					}

					if (data && data.user) {
						event.locals.user = {
							userId: data.user.id,
							email: data.user.email,
							role: data.user.role
						};
						event.locals.userId = data.user.id;
						event.locals.userRole = data.user.role;
					}
				} else if (meResponse.status === 401) {
					// Access token is invalid/expired, clear cookies
					clearAuthCookies(event);
				}
			} catch (error) {
				console.error('Failed to retrieve user session from Laravel:', error);
			}
		}
	}

	return resolve(event);
};

/**
 * CORS Handler
 * Handles CORS for API requests
 */
const corsHandler: Handle = async ({ event, resolve }) => {
	// Only apply CORS to API routes
	if (event.url.pathname.startsWith('/api')) {
		// Handle preflight requests
		if (event.request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': getAllowedOrigin(event.request.headers.get('origin')),
					'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
					'Access-Control-Max-Age': '86400',
					'Access-Control-Allow-Credentials': 'true'
				}
			});
		}
	}

	const response = await resolve(event);

	// Add CORS headers to API responses
	if (event.url.pathname.startsWith('/api')) {
		response.headers.set(
			'Access-Control-Allow-Origin',
			getAllowedOrigin(event.request.headers.get('origin'))
		);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
	}

	return response;
};

/**
 * Get allowed origin for CORS
 * In production, check against whitelist
 * In development, allow all origins
 */
function getAllowedOrigin(origin: string | null): string {
	if (dev) {
		return origin || '*';
	}

	// Production: whitelist specific origins
	const allowedOrigins = [
		'http://localhost:5173',
		'http://localhost:3000',
		'https://chtmcooks.vercel.app',
		'https://yourdomain.com',
		'https://www.yourdomain.com'
		// Add your production domains here
	];

	if (origin && allowedOrigins.includes(origin)) {
		return origin;
	}

	// Default to first allowed origin
	return allowedOrigins[0];
}

/**
 * Error Handler
 * Catches and formats all errors consistently
 */
const errorHandler: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} catch (error) {
		const context = getRequestContext(event);

		// Log error if needed
		if (shouldLogError(error as Error)) {
			logError(error as Error, {
				requestId: context.requestId,
				userId: context.userId,
				method: event.request.method,
				url: event.url.pathname
			});
		}

		// Format error response
		const errorResponse = formatErrorResponse(
			error as Error | AppError,
			context.requestId,
			event.url.pathname,
			event.request.method
		);

		// Get retry-after if present
		const retryAfter = getRetryAfter(error as Error | AppError);

		// Create response headers
		const headers = new Headers();
		addRequestIdHeader(headers, context.requestId);

		if (retryAfter) {
			headers.set('Retry-After', retryAfter.toString());
		}

		// Return JSON error response
		return json(errorResponse, {
			status: errorResponse.statusCode,
			headers
		});
	}
};

/**
 * Combine all handlers in sequence
 * Execution order: context -> auth -> security -> cors -> error handling
 */
export const handle = sequence(
	requestContextHandler,
	laravelProxyHandler,
	authHandler,
	securityHeadersMiddleware,
	corsHandler,
	errorHandler
);

/**
 * Global error handler for unhandled errors
 * Catches errors that weren't caught by the handle hook
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const context = getRequestContext(event);

	// Log the error
	logError(error as Error, {
		requestId: context.requestId,
		userId: context.userId,
		method: event.request.method,
		url: event.url.pathname,
		type: 'unhandled'
	});

	// Check if error is operational
	const operational = isOperationalError(error as Error);

	// Return sanitized error message
	return {
		message: operational
			? (error as Error).message
			: 'An unexpected error occurred. Please try again later.',
		code: 'code' in (error as AppError) ? (error as AppError).code : 'INTERNAL_ERROR',
		requestId: context.requestId
	};
};
