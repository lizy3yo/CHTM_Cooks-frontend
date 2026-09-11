<script lang="ts">
	import AlternativeTransactions from '$lib/components/transactions/AlternativeTransactions.svelte';
</script>

<!-- Admin can review alternative transactions but not create or process them. -->
<AlternativeTransactions role="admin" readOnly />
