<script lang="ts">
	/**
	 * Password field styled like Input, with a show/hide toggle and a Caps Lock
	 * warning. The toggle only changes the input type; the value never leaves the field.
	 */
	import { Eye, EyeOff } from 'lucide-svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'type'> {
		label?: string;
		error?: string;
		helperText?: string;
		id: string;
		value?: string;
	}

	let { label, error, helperText, id, class: className = '', value = $bindable(''), ...restProps }: Props = $props();

	let visible = $state(false);
	let capsLock = $state(false);

	function trackCapsLock(event: KeyboardEvent): void {
		capsLock = event.getModifierState?.('CapsLock') ?? false;
	}

	const inputClasses = $derived(
		`block w-full rounded-lg border py-3 pl-4 pr-12 text-sm transition-colors focus:outline-none focus:ring-2 ${
			error
				? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
				: 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:ring-pink-500'
		} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${className}`
	);

	const describedBy = $derived(
		[error ? `${id}-error` : helperText ? `${id}-helper` : null, capsLock ? `${id}-caps` : null]
			.filter(Boolean)
			.join(' ') || undefined
	);
</script>

<div class="w-full">
	{#if label}
		<label for={id} class="mb-2 block text-sm font-medium text-gray-700">
			{label}
			{#if restProps.required}
				<span class="text-red-500">*</span>
			{/if}
		</label>
	{/if}

	<div class="relative">
		<input
			{id}
			type={visible ? 'text' : 'password'}
			bind:value
			class={inputClasses}
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			aria-invalid={error ? 'true' : 'false'}
			aria-describedby={describedBy}
			onkeydown={trackCapsLock}
			onkeyup={trackCapsLock}
			onblur={() => (capsLock = false)}
			{...restProps}
		/>
		<button
			type="button"
			onclick={() => (visible = !visible)}
			class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
			aria-label={visible ? 'Hide password' : 'Show password'}
			aria-pressed={visible}
			aria-controls={id}
			title={visible ? 'Hide password' : 'Show password'}
		>
			{#if visible}
				<EyeOff size={18} aria-hidden="true" />
			{:else}
				<Eye size={18} aria-hidden="true" />
			{/if}
		</button>
	</div>

	{#if capsLock}
		<p id="{id}-caps" class="mt-2 text-xs font-medium text-amber-700">Caps Lock is on.</p>
	{/if}

	{#if error}
		<p id="{id}-error" class="mt-2 text-sm text-red-600" role="alert">
			{error}
		</p>
	{:else if helperText}
		<p id="{id}-helper" class="mt-2 text-sm text-gray-500">
			{helperText}
		</p>
	{/if}
</div>
