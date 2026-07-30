// Re-export types from server and add frontend-specific types

export type UserRole = 'student' | 'custodian' | 'instructor' | 'superadmin' | 'admin';

export interface UserResponse {
	id: string;
	email: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	profilePhotoUrl?: string;
	isActive: boolean;
	createdAt: Date;
	yearLevel?: string;
	block?: string;
	agreedToTerms?: boolean;
	/**
	 * When the user finished (or skipped) the guided tour. Null/absent means the
	 * account has never been through it — true for every newly created or
	 * imported user — so the first-run tour greets them on their next login.
	 */
	onboardingCompletedAt?: string | null;
}

export interface AuthResponse {
	user: UserResponse;
	accessToken: string;
	refreshToken: string;
}

export interface LoginRequest {
	email: string;
	password: string;
	rememberMe?: boolean;
}

export interface RegisterRequest {
	email: string;
	password: string;
	confirmPassword: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	yearLevel?: string;
	block?: string;
	agreedToTerms?: boolean;
}

export interface ShortcutKeyLoginRequest {
	shortcutKey: string;
	deviceFingerprint?: string;
}

export interface ApiError {
	error: string;
	message?: string;
	code?: string;
	details?: unknown;
}

export interface ActiveSession {
	id: string;
	deviceName: string;
	ipAddress?: string;
	lastUsedAt: Date;
	createdAt: Date;
	isCurrent: boolean;
}

// Form validation types
export interface ValidationError {
	field: string;
	message: string;
}

export interface FormState<T> {
	data: T;
	errors: ValidationError[];
	isSubmitting: boolean;
	isValid: boolean;
}
