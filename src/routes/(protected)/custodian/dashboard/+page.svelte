<script lang="ts">
	import OperationsDashboard from '$lib/components/dashboard/OperationsDashboard.svelte';
</script>

<svelte:head><title>Dashboard - Custodian</title></svelte:head>

<OperationsDashboard
	basePath="/custodian"
	analyticsHref="/custodian/reports"
	tourPrefix="custodian"
	replacementHref="/custodian/replacement?tab=replacements"
/>
