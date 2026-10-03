<script lang="ts">
	import OperationsDashboard from '$lib/components/dashboard/OperationsDashboard.svelte';
</script>

<svelte:head><title>Dashboard - Admin</title></svelte:head>

<!-- Admins resolve replacement cases from the Unresolved tab of Borrow Transactions. -->
<OperationsDashboard
	basePath="/admin"
	analyticsHref="/admin/analytics"
	tourPrefix="admin"
	reviewHref="/admin/requests?tab=review"
	replacementHref="/admin/requests?tab=unresolved"
/>
