<script lang="ts">
	import {
		ShieldCheck,
		ClipboardCheck,
		Wrench,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';

	type TabType = 'borrowing' | 'handling';
	let activeTab = $state<TabType>('borrowing');
	let expandedRuleId = $state<string | null>(null);

	function toggleRule(id: string) {
		if (expandedRuleId === id) {
			expandedRuleId = null;
		} else {
			expandedRuleId = id;
		}
	}

	// Rules that govern the equipment borrowing cycle in this app.
	const borrowingRules = [
		{
			id: 'eligibility',
			title: '1. Eligibility to Borrow',
			short: 'You must be enrolled in a class code, and you may only have one active request at a time.',
			details: 'To request equipment you must be enrolled in at least one active class code — enrollment is handled by your instructor, so contact them if you are not yet enrolled. The system also allows only one active borrow request at a time: you must let your current request finish (approved, released, returned, or declined) before you can start a new one.'
		},
		{
			id: 'submitting',
			title: '2. Submitting a Request',
			short: 'Complete the 4-step request: items, schedule & class, purpose, then review & submit.',
			details: 'Requests are filed on the Request Equipment page through a four-step form: (1) select items within available stock, (2) set your schedule and choose the class code, (3) give a Purpose Type (Lab Exercise, Project, Demonstration, or Other), a Usage Location (In-School or Outdoor), and purpose details, then (4) review and submit. Purpose and notes together are limited to 300 characters, and you must acknowledge the terms before submitting.'
		},
		{
			id: 'scheduling',
			title: '3. Scheduling Rules',
			short: 'Pick up and return the same day within 8 AM–5 PM; the borrow date must be within the next 2 days.',
			details: 'The borrow date must fall within the next 2 days and cannot be the same day you request. Pickup and return happen on the same day within the operating window of 8 AM to 5 PM, and your return time must be later than your pickup time. Choose a window you can actually meet — returning late affects your Trust Score.'
		},
		{
			id: 'approval',
			title: '4. Approval & Release',
			short: 'Your instructor approves or declines; the custodian then prepares and releases the items.',
			details: 'After you submit, your assigned instructor reviews the request and either approves it or declines it with a reason. Approved requests move to the custodian, who prepares the equipment and marks it Ready for Pickup. Nothing is released until both the instructor approval and custodian preparation are complete.'
		},
		{
			id: 'tracking',
			title: '5. Tracking & Cancelling',
			short: 'Follow your request in My Requests; you can cancel while it is still Under Review.',
			details: 'The My Requests page shows your request status — Under Review, Approved, Ready for Pickup, or Declined. While a request is still Under Review you can cancel it there. If it is declined, the instructor’s reason is shown so you know what to adjust before requesting again.'
		},
		{
			id: 'terms',
			title: '6. Terms You Agree To',
			short: 'Responsible for damage, on-time returns, late-return penalties, and educational use only.',
			details: 'Before submitting, you confirm the borrowing terms: you are responsible for any damage to the items, you will return the equipment on time, late returns may incur penalties, and the equipment is for educational use only. Submitting a request means you accept these terms.'
		}
	];

	// How the system expects borrowed equipment to be handled and returned.
	const handlingRules = [
		{
			id: 'inspect',
			title: 'Inspect on Pickup',
			short: 'Check each item\'s condition and completeness at the counter before you leave.',
			details: 'When collecting your items, verify each one\'s condition, cleanliness, and completeness with the custodian. Report any existing cracks, defects, or missing parts right away so they are recorded against the release, not against you. Once you leave the counter, the items are recorded as being in your care.'
		},
		{
			id: 'received-condition',
			title: 'Keep Items in the Condition Received',
			short: 'Use items only for the approved educational purpose and permitted location; don\'t lend them out.',
			details: 'Use each item only for the educational purpose it was approved for and within the usage location you selected (In-School or Outdoor). Handle it carefully, do not modify or repurpose it, and never lend, transfer, or leave it unattended — the request is tied to you, so you remain accountable for it the whole time.'
		},
		{
			id: 'report',
			title: 'Report Damage or Loss Immediately',
			short: 'Tell the custodian as soon as an item is damaged, lost, or malfunctioning.',
			details: 'If an item is damaged, stops working, or goes missing while in your care, inform the custodian as soon as possible rather than waiting until return. Do not attempt your own repairs. Early, honest reporting is always handled better than an issue discovered during the return inspection.'
		},
		{
			id: 'returning',
			title: 'Returning Equipment',
			short: 'Return items clean, complete, and on time to the custodian, who inspects each one.',
			details: 'Return every item clean, dry, complete, and in the condition you received it, on or before your return time, to the custodian desk. The custodian inspects each item and records its condition — a return is only finalised once that inspection is confirmed, so allow time for it before the 5 PM close.'
		},
		{
			id: 'trust-score',
			title: 'How Returns Affect Your Trust Score',
			short: 'On-time, undamaged returns keep your score high; below 40 (Critical) borrowing is restricted.',
			details: 'Every student has a Trust Score. On-time, complete, and undamaged returns keep it high (bands: Excellent 90+, Good 75–89, Fair 60–74, Poor 40–59, Critical below 40), while late, incomplete, or damaged returns lower it. If your score drops below 40 (Critical), your borrowing is temporarily restricted until an administrator clears it.'
		},
		{
			id: 'obligations',
			title: 'Overdue, Lost & Damaged Items',
			short: 'Overdue items are flagged, and lost or damaged ones create a replacement obligation.',
			details: 'Overdue items are tracked and count against your standing. If an item is lost, damaged, or returned incomplete, the system issues a replacement obligation, which appears on your My Borrowed Items page. You are responsible for replacing or settling it, and outstanding obligations continue to affect your ability to borrow.'
		}
	];
</script>

<svelte:head>
	<title>Rules & Guidelines - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- ── Header Section ── -->
	<div class="border-b border-gray-200 pb-5">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
				Borrowing Rules & Guidelines
			</h1>
			<p class="text-sm text-gray-500">
				Everything you need to know about borrowing equipment and handling it responsibly.
			</p>
		</div>
	</div>

	<!-- ── Trust Score Advisory Banner ── -->
	<div class="overflow-hidden rounded-xl border border-pink-200 bg-pink-50/50 p-4 sm:p-5 shadow-sm">
		<div class="flex items-start gap-4">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
				<ShieldCheck size={20} />
			</div>
			<div class="space-y-1">
				<h3 class="font-semibold text-pink-900">Borrowing Accountability & Trust System</h3>
				<p class="text-sm text-pink-700/90 leading-relaxed">
					Every item you borrow is tracked from request to return. Timely returns, clean tools, and careful handling preserve your individual <strong>Trust Score</strong>. Dropping below 40 will temporarily restrict your borrowing privileges. Review the two tabs below so you know exactly how to borrow and handle equipment.
				</p>
			</div>
		</div>
	</div>

	<!-- ── Navigation Tabs ── -->
	<div class="border-b border-gray-200">
		<nav class="flex flex-wrap gap-2 -mb-px" aria-label="Tabs">
			<button
				onclick={() => { activeTab = 'borrowing'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'borrowing'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<ClipboardCheck size={16} />
				<span>Borrowing Rules</span>
			</button>

			<button
				onclick={() => { activeTab = 'handling'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'handling'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Wrench size={16} />
				<span>Handling & Returns</span>
			</button>
		</nav>
	</div>

	<!-- ── Content Panel ── -->
	<div class="space-y-4">
		{#if activeTab === 'borrowing'}
			<div class="space-y-4">
				<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 text-pink-600">
						<ClipboardCheck size={20} />
						<h2 class="text-lg font-bold text-gray-900">Equipment Borrowing Protocol</h2>
					</div>
					<p class="text-sm text-gray-600 leading-relaxed">
						Follow the borrowing cycle from request to return. Responsible handling prevents damage, and timely returns ensure other students can access the same equipment.
					</p>
				</div>

				<div class="grid gap-3">
					{#each borrowingRules as rule}
						<div class="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-pink-200">
							<button
								onclick={() => toggleRule(rule.id)}
								class="flex w-full items-center justify-between p-4 text-left focus:outline-none focus:ring-2 focus:ring-pink-500/20 rounded-xl"
							>
								<div class="min-w-0 pr-4">
									<h3 class="font-semibold text-gray-900 sm:text-base">{rule.title}</h3>
									<p class="mt-1 text-xs sm:text-sm text-gray-500 line-clamp-1">{rule.short}</p>
								</div>
								<div class="text-gray-400 shrink-0">
									{#if expandedRuleId === rule.id}
										<ChevronUp size={20} />
									{:else}
										<ChevronDown size={20} />
									{/if}
								</div>
							</button>

							{#if expandedRuleId === rule.id}
								<div class="border-t border-gray-100 p-4 bg-gray-50/50 rounded-b-xl">
									<p class="text-sm text-gray-600 leading-relaxed">{rule.details}</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{:else if activeTab === 'handling'}
			<div class="space-y-4">
				<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 text-pink-600">
						<Wrench size={20} />
						<h2 class="text-lg font-bold text-gray-900">Handling & Returning Borrowed Equipment</h2>
					</div>
					<p class="text-sm text-gray-600 leading-relaxed">
						From pickup to return, each item is recorded as being in your care. Handle it as approved, report any issue promptly, and return it on time — the custodian inspects every item, and the outcome feeds your Trust Score.
					</p>
				</div>

				<div class="grid gap-3">
					{#each handlingRules as rule}
						<div class="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-pink-200">
							<button
								onclick={() => toggleRule(rule.id)}
								class="flex w-full items-center justify-between p-4 text-left focus:outline-none focus:ring-2 focus:ring-pink-500/20 rounded-xl"
							>
								<div class="min-w-0 pr-4">
									<h3 class="font-semibold text-gray-900 sm:text-base">{rule.title}</h3>
									<p class="mt-1 text-xs sm:text-sm text-gray-500 line-clamp-1">{rule.short}</p>
								</div>
								<div class="text-gray-400 shrink-0">
									{#if expandedRuleId === rule.id}
										<ChevronUp size={20} />
									{:else}
										<ChevronDown size={20} />
									{/if}
								</div>
							</button>

							{#if expandedRuleId === rule.id}
								<div class="border-t border-gray-100 p-4 bg-gray-50/50 rounded-b-xl">
									<p class="text-sm text-gray-600 leading-relaxed">{rule.details}</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	@media print {
		/* Print styling enhancements */
		:global(aside), :global(.fixed), button {
			display: none !important;
		}
		:global(body) {
			background: white !important;
			color: black !important;
			padding: 0 !important;
			margin: 0 !important;
		}
		.rounded-xl {
			border: 1px solid #ddd !important;
			border-radius: 0 !important;
			box-shadow: none !important;
		}
	}
</style>
