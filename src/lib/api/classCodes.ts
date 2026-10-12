/**
 * Class Codes API Client
 * Professional, industry-standard API client with client-side caching, SSE real-time
 * and in-flight request deduplication — mirroring the users.ts API client.
 */

import { subscribeToTopic, type RealtimeReason, type RealtimeTopic } from './realtime';
import { QueryCache } from './queryCache';
import { getApiErrorMessage } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Semester = 'First' | 'Second' | 'Summer';

export interface ClassCodeResponse {
	id: string;
	code: string;
	courseCode: string;
	courseName: string;
	section: string;
	academicYear: string;
	semester: Semester;
	maxEnrollment: number;
	studentCount: number;
	instructorCount: number;
	instructorIds?: string[];
	studentIds?: string[];
	isActive: boolean;
	isArchived: boolean;
	createdAt: string;
	updatedAt: string;

	// Populated (only when ?populate=true)
	instructors?: InstructorRef[];
	students?: StudentRef[];
}

export interface InstructorRef {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	profilePhotoUrl?: string;
}

export interface StudentRef {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	yearLevel?: string;
	block?: string;
	profilePhotoUrl?: string;
}

export interface ClassCodeStats {
	totalClasses: number;
	activeClasses: number;
	archivedClasses: number;
	totalStudents: number;
	avgClassSize: number;
	totalInstructors: number;
}

export interface ClassCodesListResponse {
	classCodes: ClassCodeResponse[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface CreateClassCodeRequest {
	courseCode: string;
	courseName: string;
	section: string;
	academicYear: string;
	semester: Semester;
	maxEnrollment: number;
	instructorIds?: string[];
}

export interface UpdateClassCodeRequest {
	courseName?: string;
	maxEnrollment?: number;
	isActive?: boolean;
	isArchived?: boolean;
	instructorIds?: string[];
	semester?: Semester;
	academicYear?: string;
}

export interface ClassCodeRealtimeEvent {
	/**
	 * Why this fired: 'change' means the server reported a real change,
	 * 'connect' means we re-read state after (re)connecting. Never notify the
	 * user on 'connect' — connections recycle constantly.
	 */
	reason?: RealtimeReason;
	action:
		| 'class_created'
		| 'class_updated'
		| 'class_archived'
		| 'class_deleted'
		| 'enrollment_updated';
	classCodeId: string;
	occurredAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface ApiError {
	error?: string;
	message?: string;
}

// Kept until the realtime hub reports a class change (or a roster change,
// which alters enrolment counts), then revalidated on next use.
const CLASS_TOPICS: RealtimeTopic[] = ['class_code_change', 'user_change'];
const listCache = new QueryCache<ClassCodesListResponse>({ topics: CLASS_TOPICS });
const detailCache = new QueryCache<ClassCodeResponse>({ topics: CLASS_TOPICS });
const statsCache = new QueryCache<ClassCodeStats>({ topics: CLASS_TOPICS });

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) options.body = JSON.stringify(body);
	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		const message = await getApiErrorMessage(
			response,
			payload.message || payload.error || `Request failed: ${response.status}`
		);
		throw new Error(message);
	}
	return payload;
}

function buildListCacheKey(params: {
	search?: string;
	semester?: string;
	academicYear?: string;
	archived?: boolean;
	page?: number;
	limit?: number;
}): string {
	return [
		params.search || 'none',
		params.semester || 'all',
		params.academicYear || 'all',
		String(params.archived ?? 'any'),
		String(params.page || 1),
		String(params.limit || 50)
	].join(':');
}

function invalidateAllCaches(): void {
	listCache.markStale();
	detailCache.markStale();
	statsCache.markStale();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const classCodesAPI = {
	/**
	 * Fetch paginated class codes list with optional filters
	 */
	async getAll(
		params: {
			search?: string;
			semester?: string;
			academicYear?: string;
			archived?: boolean;
			page?: number;
			limit?: number;
			forceRefresh?: boolean;
		} = {}
	): Promise<ClassCodesListResponse> {
		const searchParams = new URLSearchParams();
		if (params.search) searchParams.set('search', params.search);
		if (params.semester) searchParams.set('semester', params.semester);
		if (params.academicYear) searchParams.set('academicYear', params.academicYear);
		if (params.archived !== undefined) searchParams.set('archived', String(params.archived));
		if (params.page) searchParams.set('page', String(params.page));
		if (params.limit) searchParams.set('limit', String(params.limit));
		if (params.forceRefresh) searchParams.set('_t', String(Date.now()));

		const query = searchParams.toString();
		const url = `/api/class-codes${query ? `?${query}` : ''}`;
		return listCache.fetch(
			buildListCacheKey(params),
			async () => {
				const res = await fetch(url, getFetchOptions('GET'));
				return handleResponse<ClassCodesListResponse>(res);
			},
			{ force: params.forceRefresh }
		);
	},

	/**
	 * Fetch a single class code by ID (with optional population)
	 */
	async getById(classCodeId: string, populate = false): Promise<ClassCodeResponse> {
		const url = `/api/class-codes/${classCodeId}${populate ? '?populate=true' : ''}`;

		return detailCache.fetch(`${classCodeId}:${populate}`, async () => {
			const res = await fetch(url, getFetchOptions('GET'));
			const data = await handleResponse<{ classCode: ClassCodeResponse }>(res);
			return data.classCode;
		});
	},

	/**
	 * Create a new class code
	 */
	async create(payload: CreateClassCodeRequest): Promise<ClassCodeResponse> {
		const res = await fetch('/api/class-codes', getFetchOptions('POST', payload));
		const data = await handleResponse<{ classCode: ClassCodeResponse }>(res);
		invalidateAllCaches();
		return data.classCode;
	},

	/**
	 * Update an existing class code
	 */
	async update(classCodeId: string, payload: UpdateClassCodeRequest): Promise<ClassCodeResponse> {
		const res = await fetch(`/api/class-codes/${classCodeId}`, getFetchOptions('PATCH', payload));
		const data = await handleResponse<{ classCode: ClassCodeResponse }>(res);
		invalidateAllCaches();
		return data.classCode;
	},

	/**
	 * Delete a class code permanently
	 */
	async delete(classCodeId: string): Promise<{ success: boolean; message: string }> {
		const res = await fetch(`/api/class-codes/${classCodeId}`, getFetchOptions('DELETE'));
		const data = await handleResponse<{ success: boolean; message: string }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Archive a class (soft delete — data preserved for reporting)
	 */
	async archive(classCodeId: string): Promise<ClassCodeResponse> {
		return this.update(classCodeId, { isArchived: true, isActive: false });
	},

	/**
	 * Restore an archived class
	 */
	async unarchive(classCodeId: string): Promise<ClassCodeResponse> {
		return this.update(classCodeId, { isArchived: false, isActive: true });
	},

	/**
	 * Enroll students in a class
	 */
	async enrollStudents(
		classCodeId: string,
		studentIds: string[]
	): Promise<{ studentCount: number }> {
		const res = await fetch(
			`/api/class-codes/${classCodeId}/enrollments`,
			getFetchOptions('POST', { studentIds })
		);
		const data = await handleResponse<{ studentCount: number }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Remove students from a class
	 */
	async unenrollStudents(
		classCodeId: string,
		studentIds: string[]
	): Promise<{ studentCount: number }> {
		const res = await fetch(
			`/api/class-codes/${classCodeId}/enrollments`,
			getFetchOptions('DELETE', { studentIds })
		);
		const data = await handleResponse<{ studentCount: number }>(res);
		invalidateAllCaches();
		return data;
	},

	/**
	 * Get aggregated statistics
	 */
	async getStats(forceRefresh = false): Promise<ClassCodeStats> {
		const url = forceRefresh
			? `/api/class-codes/stats?_t=${Date.now()}`
			: '/api/class-codes/stats';

		return statsCache.fetch(
			'stats',
			async () => {
				const res = await fetch(url, getFetchOptions('GET'));
				const data = await handleResponse<{ stats: ClassCodeStats }>(res);
				return data.stats;
			},
			{ force: forceRefresh }
		);
	},

	/**
	 * Subscribe to real-time class-code changes via SSE.
	 * Returns an unsubscribe function.
	 */
	subscribeToChanges(callback: (event: ClassCodeRealtimeEvent) => void): () => void {
		// 'refresh' means we merely reconnected; only 'change' is real news.
		return subscribeToTopic('class_code_change', (reason) =>
			callback({
				action: reason === 'change' ? 'class_updated' : 'refresh',
				reason
			} as unknown as ClassCodeRealtimeEvent)
		);
	},

	invalidateCache(): void {
		invalidateAllCaches();
	},

	peekCachedList(params: {
		search?: string;
		semester?: string;
		academicYear?: string;
		archived?: boolean;
		page?: number;
		limit?: number;
	} = {}): ClassCodesListResponse | null {
		return listCache.peek(buildListCacheKey(params));
	},

	peekCachedStats(): ClassCodeStats | null {
		return statsCache.peek('stats');
	}
};
