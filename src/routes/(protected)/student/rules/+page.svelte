<script lang="ts">
	import {
		BookOpen,
		ShieldCheck,
		AlertOctagon,
		Clock,
		Flame,
		UserCheck,
		UtensilsCrossed,
		CornerDownLeft,
		HeartHandshake,
		ChevronDown,
		ChevronUp,
		Printer
	} from 'lucide-svelte';

	type TabType = 'general' | 'borrowing' | 'safety' | 'emergency';
	let activeTab = $state<TabType>('general');
	let expandedRuleId = $state<string | null>(null);

	function toggleRule(id: string) {
		if (expandedRuleId === id) {
			expandedRuleId = null;
		} else {
			expandedRuleId = id;
		}
	}

	function printRules() {
		window.print();
	}

	const generalRules = [
		{
			id: 'attire',
			title: 'Proper Laboratory Attire & Hygiene',
			short: 'Clean chef\'s uniform or laboratory gown, closed-toe shoes, and hair containment are mandatory.',
			details: 'Students must wear the complete and prescribed laboratory uniform at all times inside the facility. Hairnets or chef\'s hats must fully contain hair. Long hair must be tied back. Nails must be trimmed and clean; no nail polish or artificial nails are allowed. Closed-toe, slip-resistant leather shoes are required for safety.'
		},
		{
			id: 'conduct',
			title: 'General Conduct & Etiquette',
			short: 'Professional conduct, no horseplay, and adherence to instructor guidelines.',
			details: 'Horseplay, running, or loud shouting is strictly prohibited. Keep your workstation clean and organized. Avoid using personal mobile devices unless specifically requested for instruction. Students must show respect to lab custodians, instructors, and peers.'
		},
		{
			id: 'preparation',
			title: 'Food Safety & Handling (Culinary)',
			short: 'Follow standard sanitization, cross-contamination prevention, and waste disposal.',
			details: 'Sanitize hands before handling food or tools. Always separate raw meats from cooked or ready-to-eat foods to prevent cross-contamination. Wash all fresh produce thoroughly. Dispose of solid waste, recycling, and food scraps in the designated bins.'
		},
		{
			id: 'workstation',
			title: 'Station Maintenance & Cleaning',
			short: 'Maintain a clean desk policy. Sanitize the workstation before and after use.',
			details: 'Each student is responsible for cleaning and sanitizing their own work surface, drawers, and surrounding floor area. All borrowed tools must be washed, dried, and returned to their proper designated storage units or custody locations.'
		}
	];

	const borrowingRules = [
		{
			id: 'request',
			title: '1. Requesting Equipment',
			short: 'Submit request forms in advance and obtain instructor approval.',
			details: 'Requests must be filed online through the Student Portal prior to the laboratory session. All requests require approval from the assigned instructor before the equipment can be prepared by the laboratory custodian.'
		},
		{
			id: 'pickup',
			title: '2. Inspection on Pickup',
			short: 'Inspect item condition and verify details before leaving the counter.',
			details: 'When picking up approved items, verify their physical condition and cleanliness. Report any existing cracks, defects, or missing components to the custodian immediately so it can be annotated. Once you leave the counter, you assume full responsibility for the item\'s condition.'
		},
		{
			id: 'responsibility',
			title: '3. Accountability & Trust Score',
			short: 'Timely returns and care maintain a high Trust Score. Late or damaged items penalize it.',
			details: 'Every student starts with a baseline Trust Score. Returning items late, damaged, or incomplete incurs score penalties. Maintaining an Excellent or Good score is essential, as dropping below 40 (Critical) will limit borrowing privileges and require administrative clearance.'
		},
		{
			id: 'return',
			title: '4. Clean & Timely Return',
			short: 'Clean the equipment and return it on or before the due date/time.',
			details: 'All borrowed equipment must be returned clean, dry, and in the same condition as when received. Returns must be processed at the custodian desk. A late return directly impacts your group standing and your individual Trust Score.'
		}
	];

	const safetyRules = [
		{
			id: 'knives',
			title: 'Knife Safety & Handling',
			short: 'Use appropriate cutting boards, keep blades sharp, and carry knives pointing downwards.',
			details: 'Never try to catch a falling knife. Always cut on an approved cutting board, never on steel countertops. Store knives in slots or sheaths when not in use. When carrying a knife, hold it by the handle with the blade pointing down and close to your side.'
		},
		{
			id: 'heat',
			title: 'Stoves, Ovens & Hot Surfaces',
			short: 'Use dry oven mitts or side towels, turn pot handles inward, and watch open flames.',
			details: 'Always assume cookware is hot. Use dry towels or oven mitts—wet cloth conducts heat and causes steam burns. Turn handles of pots and pans inward away from the aisle. Never leave an active stovetop or oven unattended.'
		},
		{
			id: 'electrical',
			title: 'Electrical Appliance Safety',
			short: 'Inspect power cords, keep water away, and turn off before unplugging.',
			details: 'Ensure hands are completely dry when plugging or unplugging mixers, blenders, or processors. Keep power cords away from water sources, heat, and sharp edges. Turn off appliances before unplugging them from the wall outlet.'
		},
		{
			id: 'chemical',
			title: 'Chemicals & Cleaning Agents',
			short: 'Only use approved cleaners, wear gloves when necessary, and store away from food.',
			details: 'Read labels and safety guidelines on sanitizers, detergents, and degreasers. Never mix different chemical agents (especially bleach and ammonia). Store all cleaning chemicals in their original containers in the designated cabinet under or away from food prep areas.'
		}
	];

	const emergencyRules = [
		{
			id: 'injury',
			title: 'In Case of Injury (Cuts or Burns)',
			short: 'Report immediately to instructor/custodian, wash burns under cold water, apply first aid.',
			details: 'Minor cuts must be washed immediately, treated with antiseptic, and covered with a waterproof bandage. Burns must be cooled immediately under clean, running cold water for at least 10 minutes. Always inform the instructor immediately, regardless of how minor the injury seems.'
		},
		{
			id: 'fire',
			title: 'Fire Emergency Procedures',
			short: 'Use appropriate extinguishers (Class K for grease fires), never throw water on grease.',
			details: 'In case of a grease fire in a pan, slide a lid or sheet pan over it to smother it. Do NOT use water, as this will spread the fire instantly. Locate the nearest fire extinguisher (Class K for kitchens) and fire blanket. For larger fires, pull the alarm and evacuate systematically.'
		},
		{
			id: 'spills',
			title: 'Slippery Floors & Chemical Spills',
			short: 'Announce spills immediately, clean them up, and place wet floor signs.',
			details: 'Spilled liquids, oil, or food must be cleaned up immediately to prevent slip-and-fall accidents. Announce the spill to others in the vicinity so they avoid the area. Place a "Wet Floor" caution sign if the area remains damp.'
		},
		{
			id: 'contacts',
			title: 'Emergency Contacts & Custodians',
			short: 'Report structural issues to laboratory custodians or campus security.',
			details: 'If you identify gas leaks, electrical faults, or plumbing issues, shut down equipment and alert the custodian. Campus Security, Clinic, and Laboratory Custodian offices are located near the building exit; contact numbers are posted on the main bulletin board.'
		}
	];
</script>

<svelte:head>
	<title>Rules & Guidelines - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- ── Header Section ── -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
				Rules & Laboratory Guidelines
			</h1>
			<p class="text-sm text-gray-500">
				Review laboratory policies, emergency contacts, and standard operating procedures.
			</p>
		</div>
		<button
			onclick={printRules}
			class="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
		>
			<Printer size={16} />
			<span>Print Guidelines</span>
		</button>
	</div>

	<!-- ── Trust Score Advisory Banner ── -->
	<div class="overflow-hidden rounded-xl border border-pink-200 bg-pink-50/50 p-4 sm:p-5 shadow-sm">
		<div class="flex items-start gap-4">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-pink-700">
				<ShieldCheck size={20} />
			</div>
			<div class="space-y-1">
				<h3 class="font-semibold text-pink-900">Laboratory Accountability & Trust System</h3>
				<p class="text-sm text-pink-700/90 leading-relaxed">
					All culinary, kitchen, and hospitality equipment rentals are tracked dynamically. Timely returns, clean tools, and careful handling preserve your individual <strong>Trust Score</strong>. Dropping below 40 will temporarily restrict borrowing capabilities. Please review the tabs below to familiarize yourself with policies.
				</p>
			</div>
		</div>
	</div>

	<!-- ── Navigation Tabs ── -->
	<div class="border-b border-gray-200">
		<nav class="flex flex-wrap gap-2 -mb-px" aria-label="Tabs">
			<button
				onclick={() => { activeTab = 'general'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'general'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<UserCheck size={16} />
				<span>General Conduct</span>
			</button>

			<button
				onclick={() => { activeTab = 'borrowing'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'borrowing'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Clock size={16} />
				<span>Borrowing Rules</span>
			</button>

			<button
				onclick={() => { activeTab = 'safety'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'safety'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<UtensilsCrossed size={16} />
				<span>Equipment Safety</span>
			</button>

			<button
				onclick={() => { activeTab = 'emergency'; expandedRuleId = null; }}
				class="inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all {activeTab === 'emergency'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<AlertOctagon size={16} />
				<span>Emergencies</span>
			</button>
		</nav>
	</div>

	<!-- ── Content Panel ── -->
	<div class="space-y-4">
		{#if activeTab === 'general'}
			<div class="space-y-4">
				<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 text-pink-600">
						<BookOpen size={20} />
						<h2 class="text-lg font-bold text-gray-900">Lab Etiquette & Grooming Standards</h2>
					</div>
					<p class="text-sm text-gray-600 leading-relaxed mb-4">
						All students entering culinary and hospitality laboratories are representatives of CHTM and must exhibit cleanliness, high levels of sanitation, and respectful behavior.
					</p>
				</div>

				<div class="grid gap-3">
					{#each generalRules as rule}
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
		{:else if activeTab === 'borrowing'}
			<div class="space-y-4">
				<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 text-pink-600">
						<Clock size={20} />
						<h2 class="text-lg font-bold text-gray-900">Equipment Borrowing Protocol</h2>
					</div>
					<p class="text-sm text-gray-600 leading-relaxed">
						Please strictly follow the borrowing cycle. Responsible handling prevents damage, and timely returns ensure other students have access to vital culinary resources.
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
		{:else if activeTab === 'safety'}
			<div class="space-y-4">
				<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-2 text-pink-600">
						<Flame size={20} />
						<h2 class="text-lg font-bold text-gray-900">Equipment Safety & Appliance Operation</h2>
					</div>
					<p class="text-sm text-gray-600 leading-relaxed">
						Always handle sharp culinary knives and hot equipment with maximum awareness. Never bypass safety guards on machinery or cookers.
					</p>
				</div>

				<div class="grid gap-3">
					{#each safetyRules as rule}
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
		{:else if activeTab === 'emergency'}
			<div class="space-y-4">
				<div class="rounded-xl border border-red-200 bg-red-50/40 p-6 shadow-sm animate-pulse">
					<div class="mb-3 flex items-center gap-2 text-red-600">
						<AlertOctagon size={22} />
						<h2 class="text-lg font-bold">Emergency & Fire Protocols</h2>
					</div>
					<p class="text-sm text-red-700 leading-relaxed">
						Always prioritize human safety over equipment or materials. Familiarize yourself with emergency escape routes and the location of Class K kitchen extinguishers.
					</p>
				</div>

				<div class="grid gap-3">
					{#each emergencyRules as rule}
						<div class="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-red-200">
							<button
								onclick={() => toggleRule(rule.id)}
								class="flex w-full items-center justify-between p-4 text-left focus:outline-none focus:ring-2 focus:ring-red-500/20 rounded-xl"
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

	<!-- ── Summary Quick Contact Card ── -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
					<HeartHandshake size={20} />
				</div>
				<div>
					<h4 class="font-semibold text-gray-900">Need Guidance or Assistance?</h4>
					<p class="text-xs text-gray-500">Contact the custodian office or request an exception from your instructor.</p>
				</div>
			</div>
			<a
				href="/student/dashboard"
				class="inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
			>
				Go to Dashboard
			</a>
		</div>
	</div>
</div>

<style>
	@media print {
		/* Print styling enhancements */
		:global(aside), :global(.fixed), button, a {
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
