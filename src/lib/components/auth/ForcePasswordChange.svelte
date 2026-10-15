<script lang="ts">
	/**
	 * Shown in place of the app while an account is still on its starting
	 * password. Nothing else loads until the user has chosen their own.
	 * Uses the same fields, rules and strength meter as the profile's Change Password.
	 */
	import { CircleCheck, CircleX, ShieldCheck } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PasswordInput from '$lib/components/ui/PasswordInput.svelte';
	import PasswordStrength from '$lib/components/ui/PasswordStrength.svelte';
	import { authStore } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { profileApi } from '$lib/api/profile';
	import { validatePassword, validatePasswordConfirmation } from '$lib/utils/validation';
	import type { UserResponse } from '$lib/types/auth';

	interface Props {
		user: UserResponse;
	}

	let { user }: Props = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let errors = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	/** Words a password must not contain: the user's name, email and student number. */
	const personalWords = $derived(
		[user.firstName, user.lastName, user.email.split('@')[0], user.studentNumber ?? '']
			.flatMap((part) => part.toLowerCase().split(/[\s.\-_]+/))
			.filter((word) => word.length >= 3)
	);

	function newPasswordProblem(): string | null {
		const ruleError = validatePassword(newPassword);
		if (ruleError) return ruleError.message;
		if (currentPassword && newPassword === currentPassword) {
			return 'Choose a password different from the starting password.';
		}
		if (personalWords.some((word) => newPassword.toLowerCase().includes(word))) {
			return 'Do not use your name, email or student number in your password.';
		}
		return null;
	}

	const passwordsMatch = $derived(confirmPassword.length > 0 && confirmPassword === newPassword);

	function validate(): boolean {
		const next: Record<string, string> = {};

		if (!currentPassword) {
			next.currentPassword = 'Enter the starting password you signed in with.';
		}

		const problem = newPasswordProblem();
		if (problem) {
			next.newPassword = problem;
		}

		const confirmError = validatePasswordConfirmation(newPassword, confirmPassword);
		if (confirmError) {
			next.confirmPassword = confirmError.message;
		}

		errors = next;
		return Object.keys(next).length === 0;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		formError = '';
		if (!validate()) return;

		saving = true;
		try {
			await profileApi.changePassword({ currentPassword, newPassword });
			toastStore.success('Your new password is saved. Use it the next time you sign in.', 'Password Updated');
			authStore.updateUser({ ...user, mustChangePassword: false });
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Could not change the password. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-8 sm:items-center sm:py-12">
	<div class="w-full max-w-md">
		<div class="rounded-2xl border border-gray-200 bg-white shadow-sm">
			<header class="border-b border-gray-100 p-6 sm:p-8">
				<div class="flex items-center gap-3">
					<div class="rounded-xl bg-pink-50 p-2.5 text-pink-600">
						<ShieldCheck size={22} aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<p class="text-xs font-semibold uppercase tracking-wider text-pink-600">Account security</p>
						<h1 class="text-xl font-bold text-gray-900">Set up your password</h1>
					</div>
				</div>
			</header>

			<form onsubmit={submit} novalidate class="p-6 sm:p-8">
				<!-- Lets password managers save the new password under the right account. -->
				<input type="text" name="username" autocomplete="username" value={user.email} readonly hidden />

				<div class="grid gap-5">
					<PasswordInput
						id="startingPassword"
						name="current-password"
						label="Starting Password"
						autocomplete="current-password"
						helperText="The temporary password you just signed in with."
						bind:value={currentPassword}
						error={errors.currentPassword}
						required
					/>

					<div>
						<PasswordInput
							id="newPassword"
							name="new-password"
							label="New Password"
							autocomplete="new-password"
							bind:value={newPassword}
							error={errors.newPassword}
							required
						/>
						<PasswordStrength password={newPassword} />
					</div>

					<div>
						<PasswordInput
							id="confirmNewPassword"
							name="confirm-password"
							label="Confirm New Password"
							autocomplete="new-password"
							bind:value={confirmPassword}
							error={errors.confirmPassword}
							required
						/>
						{#if confirmPassword && !errors.confirmPassword}
							<p class="mt-2 flex items-center gap-1.5 text-xs font-medium {passwordsMatch ? 'text-green-600' : 'text-gray-500'}" aria-live="polite">
								{#if passwordsMatch}
									<CircleCheck size={14} aria-hidden="true" /> Passwords match
								{:else}
									<CircleX size={14} aria-hidden="true" /> Passwords do not match yet
								{/if}
							</p>
						{/if}
					</div>
				</div>

				{#if formError}
					<p role="alert" class="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
				{/if}

				<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onclick={() => authStore.logout()}
						class="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
					>
						Sign out
					</button>
					<Button type="submit" variant="primary" loading={saving} disabled={saving}>
						Save password and continue
					</Button>
				</div>
			</form>
		</div>

		<p class="mt-4 text-center text-xs text-gray-500">
			Your starting password stops working as soon as you save. Forgot it? Sign out and use “Forgot password” on the sign-in page.
		</p>
	</div>
</div>
