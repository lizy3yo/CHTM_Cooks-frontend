<script lang="ts">
	/**
	 * Shown in place of the app while an account is still on its starting
	 * password. Nothing else loads until the user has chosen their own.
	 */
	import { KeyRound, LoaderCircle } from 'lucide-svelte';
	import { authStore } from '$lib/stores/auth';
	import { profileApi } from '$lib/api/profile';
	import { validatePassword } from '$lib/utils/validation';
	import type { UserResponse } from '$lib/types/auth';

	interface Props {
		user: UserResponse;
	}

	let { user }: Props = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let saving = $state(false);

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = '';

		if (!currentPassword) {
			error = 'Enter the starting password you signed in with.';
			return;
		}
		const problem = validatePassword(newPassword);
		if (problem) {
			error = problem.message;
			return;
		}
		if (newPassword !== confirmPassword) {
			error = 'The two new passwords do not match.';
			return;
		}
		if (newPassword === currentPassword) {
			error = 'Choose a password different from the starting password.';
			return;
		}

		saving = true;
		try {
			await profileApi.changePassword({ currentPassword, newPassword });
			authStore.updateUser({ ...user, mustChangePassword: false });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not change the password. Try again.';
		} finally {
			saving = false;
		}
	}

	const inputClass =
		'mt-1 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20';
	const labelClass = 'block text-xs font-bold uppercase tracking-wider text-gray-700';
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
	<form onsubmit={submit} class="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
		<div class="flex items-center gap-3">
			<div class="rounded-xl bg-red-50 p-2.5 text-red-600">
				<KeyRound size={22} />
			</div>
			<div>
				<h1 class="text-lg font-bold text-gray-900">Choose your own password</h1>
				<p class="text-xs text-gray-500">{user.email}</p>
			</div>
		</div>

		<p class="mt-4 text-sm text-gray-600">
			Welcome, {user.firstName}. Your account was set up with a starting password. Replace it with one only you know
			to continue.
		</p>

		<div class="mt-5 space-y-4">
			<div>
				<label for="startingPassword" class={labelClass}>Starting password</label>
				<input
					id="startingPassword"
					type="password"
					autocomplete="current-password"
					bind:value={currentPassword}
					class={inputClass}
				/>
			</div>
			<div>
				<label for="newPassword" class={labelClass}>New password</label>
				<input id="newPassword" type="password" autocomplete="new-password" bind:value={newPassword} class={inputClass} />
				<p class="mt-1 text-xs text-gray-500">
					At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.
				</p>
			</div>
			<div>
				<label for="confirmNewPassword" class={labelClass}>Confirm new password</label>
				<input
					id="confirmNewPassword"
					type="password"
					autocomplete="new-password"
					bind:value={confirmPassword}
					class={inputClass}
				/>
			</div>
		</div>

		{#if error}
			<p role="alert" class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
		{/if}

		<button
			type="submit"
			disabled={saving}
			class="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
		>
			{#if saving}
				<LoaderCircle size={15} class="animate-spin" /> Saving…
			{:else}
				Save password and continue
			{/if}
		</button>
		<button
			type="button"
			onclick={() => authStore.logout()}
			class="mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
		>
			Sign out
		</button>
	</form>
</div>
