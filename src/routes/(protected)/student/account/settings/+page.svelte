<script lang="ts">
	import { userSettingsStore } from '$lib/stores/userSettings';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { Moon, Sun, MessageSquare, Type, Eye, RotateCcw, ShieldCheck, FileText, ChevronDown, ChevronUp } from 'lucide-svelte';

	let privacyOpen = $state(false);
	let termsOpen = $state(false);

	let settings = $state($userSettingsStore);

	userSettingsStore.subscribe(value => {
		settings = value;
	});

	function toggleSetting(key: keyof typeof settings) {
		userSettingsStore.updateSetting(key, !settings[key]);
		toastStore.success('Setting updated successfully');
	}

	function updateFontSize(size: 'small' | 'medium' | 'large' | 'extra-large') {
		userSettingsStore.updateSetting('fontSize', size);
		toastStore.success('Font size updated');
	}

	async function resetSettings() {
		const confirmed = await confirmStore.warning(
			'Are you sure you want to reset all settings to default values? This action cannot be undone.',
			'Reset Settings',
			'Reset to Default',
			'Keep Current Settings'
		);

		if (confirmed) {
			userSettingsStore.reset();
			toastStore.success('Settings reset to default values', 'Settings Reset');
		}
	}
</script>

<svelte:head>
	<title>Settings - Student Portal</title>
</svelte:head>

<div class="space-y-6 pb-8">
	<!-- Page Header -->
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Settings</h1>
			<p class="mt-1 text-sm text-gray-500">Manage your account preferences and accessibility options</p>
		</div>
		<button
			onclick={resetSettings}
			class="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 whitespace-nowrap"
		>
			<RotateCcw size={14} />
			Reset to Default
		</button>
	</div>

	<!-- Settings Sections -->
	<div class="space-y-4">
		<!-- Appearance Section -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-base font-semibold text-gray-900">Appearance</h2>
				<p class="mt-1 text-sm text-gray-500">Customize how the application looks</p>
			</div>
			<div class="divide-y divide-gray-200">
				<!-- Dark Mode -->
				<div class="flex items-center justify-between px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							{#if settings.darkMode}
								<Moon size={18} class="text-pink-600" />
							{:else}
								<Sun size={18} class="text-pink-600" />
							{/if}
						</div>
						<div>
							<h3 class="text-sm font-medium text-gray-900">Dark Mode</h3>
							<p class="mt-0.5 text-xs text-gray-500">Switch between light and dark theme</p>
						</div>
					</div>
					<button
						onclick={() => toggleSetting('darkMode')}
						class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 {settings.darkMode
							? 'bg-pink-600'
							: 'bg-gray-300'}"
						role="switch"
						aria-checked={settings.darkMode}
						aria-label="Toggle dark mode"
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.darkMode
								? 'translate-x-6'
								: 'translate-x-1'}"
						></span>
					</button>
				</div>

				<!-- Font Size -->
				<div class="px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							<Type size={18} class="text-pink-600" />
						</div>
						<div class="flex-1">
							<h3 class="text-sm font-medium text-gray-900">Font Size</h3>
							<p class="mt-0.5 text-xs text-gray-500">Adjust text size for better readability</p>
							<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
								<button
									onclick={() => updateFontSize('small')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'small' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-xs">Small</span>
								</button>
								<button
									onclick={() => updateFontSize('medium')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'medium' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-sm">Medium</span>
								</button>
								<button
									onclick={() => updateFontSize('large')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'large' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-base">Large</span>
								</button>
								<button
									onclick={() => updateFontSize('extra-large')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'extra-large' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-lg leading-none">XL</span>
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- High Contrast -->
				<div class="flex items-center justify-between px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							<Eye size={18} class="text-pink-600" />
						</div>
						<div>
							<h3 class="text-sm font-medium text-gray-900">High Contrast</h3>
							<p class="mt-0.5 text-xs text-gray-500">Increase text contrast for better visibility (WCAG AAA)</p>
						</div>
					</div>
					<button
						onclick={() => toggleSetting('highContrast')}
						class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 {settings.highContrast
							? 'bg-pink-600'
							: 'bg-gray-300'}"
						role="switch"
						aria-checked={settings.highContrast}
						aria-label="Toggle high contrast"
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.highContrast
								? 'translate-x-6'
								: 'translate-x-1'}"
						></span>
					</button>
				</div>
			</div>
		</div>

		<!-- Features Section -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-base font-semibold text-gray-900">Features</h2>
				<p class="mt-1 text-sm text-gray-500">Enable or disable application features</p>
			</div>
			<div class="divide-y divide-gray-200">
				<!-- AI Chatbot -->
				<div class="flex items-center justify-between px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							<MessageSquare size={18} class="text-pink-600" />
						</div>
						<div>
							<h3 class="text-sm font-medium text-gray-900">AI Chatbot Assistant</h3>
							<p class="mt-0.5 text-xs text-gray-500">Get help from our AI-powered assistant</p>
						</div>
					</div>
					<button
						onclick={() => toggleSetting('aiChatbotEnabled')}
						class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 {settings.aiChatbotEnabled
							? 'bg-pink-600'
							: 'bg-gray-300'}"
						role="switch"
						aria-checked={settings.aiChatbotEnabled}
						aria-label="Toggle AI chatbot"
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.aiChatbotEnabled
								? 'translate-x-6'
								: 'translate-x-1'}"
						></span>
					</button>
				</div>
			</div>
		</div>


		<!-- Privacy Policy Section -->
		<div class="rounded-lg bg-white shadow">
			<button
				onclick={() => (privacyOpen = !privacyOpen)}
				class="flex w-full items-center justify-between border-b border-gray-200 px-6 py-4 text-left transition-colors hover:bg-gray-50"
				aria-expanded={privacyOpen}
			>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
						<ShieldCheck size={18} class="text-pink-600" />
					</div>
					<div>
						<h2 class="text-base font-semibold text-gray-900">Privacy Policy</h2>
						<p class="mt-0.5 text-sm text-gray-500">How we collect, use, and protect your personal information</p>
					</div>
				</div>
				{#if privacyOpen}
					<ChevronUp size={18} class="shrink-0 text-gray-400" />
				{:else}
					<ChevronDown size={18} class="shrink-0 text-gray-400" />
				{/if}
			</button>

			{#if privacyOpen}
				<div class="px-6 py-5 text-sm text-gray-600 space-y-5">
					<p class="text-xs text-gray-400 uppercase tracking-wide font-semibold">Last Updated: May 2026 &nbsp;·&nbsp; Compliant with RA 10173 (Philippine DPA)</p>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">1. Introduction</h3>
						<p class="leading-relaxed mb-2">
							CHTM Cooks ("we", "us", "our") serves as the official equipment borrowing and inventory management platform of the College of Hospitality &amp; Tourism Management (CHTM) at Gordon College, Olongapo City, Philippines.
						</p>
						<p class="leading-relaxed">
							We respect your privacy and are committed to protecting your personal data. This Privacy Policy informs you about how we handle your personal data when you visit and use our web application, your privacy rights, and how the law protects you. This policy is written in strict compliance with <strong class="text-gray-700">Republic Act No. 10173</strong>, otherwise known as the <strong class="text-gray-700">Data Privacy Act of 2012 (DPA)</strong> of the Philippines, and its Implementing Rules and Regulations.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">2. Scope of Application</h3>
						<p class="leading-relaxed">
							This policy applies to all accounts registered on the CHTM Cooks platform, including <strong class="text-gray-700">students</strong>, <strong class="text-gray-700">instructors</strong>, <strong class="text-gray-700">custodians</strong>, and <strong class="text-gray-700">system administrators</strong>. It governs all data processed during equipment reservation, approvals, inventory audits, and offline-first data synchronization.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">3. The Information We Process</h3>
						<p class="leading-relaxed mb-2">We collect, use, store, and transfer different kinds of personal data about you, grouped as follows:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Identity Data:</span> First name, last name, student/employee number, year level, and block.</li>
							<li><span class="font-medium text-gray-700">Contact Data:</span> Official Gordon College institutional email address for automated borrow notifications.</li>
							<li><span class="font-medium text-gray-700">Academic Status Data:</span> Year level, section block, and enrollment status within CHTM programs.</li>
							<li><span class="font-medium text-gray-700">Borrowing &amp; Transactional Data:</span> Equipment requests, borrowed quantities, reservation schedules, return statuses, QR verification histories, incident logs, and your system-calculated trust score.</li>
							<li><span class="font-medium text-gray-700">Technical &amp; Session Data:</span> IP addresses, browser cookies, local storage payloads, offline synchronization logbooks, and diagnostic crash data.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">4. How We Collect Your Data</h3>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Direct Interaction:</span> You provide Identity and Contact data by filling out forms during account registration, modifying your profile, or initiating borrowing requests.</li>
							<li><span class="font-medium text-gray-700">System-Generated Data:</span> Our server generates QR codes, assigns borrow request logs, calculates equipment availability, and records custodian transaction approvals.</li>
							<li><span class="font-medium text-gray-700">Automated Technologies:</span> As you interact with the platform, we automatically collect Technical and Session data to support offline storage and synchronization.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">5. Purposes of Processing</h3>
						<p class="leading-relaxed mb-2">Under the Philippine Data Privacy Act, we process your personal data only for legitimate institutional purposes:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Platform Operation:</span> Authenticating user identity, managing your account, facilitating reservation flows, and verifying claims using QR scanner handshakes.</li>
							<li><span class="font-medium text-gray-700">Accountability &amp; Inventory Control:</span> Tracking high-value culinary equipment, enforcing return windows, logging incident reports, and calculating student liability.</li>
							<li><span class="font-medium text-gray-700">Notification Dispatch:</span> Sending real-time email updates regarding approval reviews, pickup readiness, overdue items, or inventory changes.</li>
							<li><span class="font-medium text-gray-700">Academic Record Matching:</span> Ensuring students requesting equipment are actively enrolled in laboratory courses assigned to the approving instructors.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">6. Legal Basis for Processing</h3>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Consent:</span> When you register an account, upload a profile photo, or opt-in to email alerts.</li>
							<li><span class="font-medium text-gray-700">Contractual/Academic Obligation:</span> Processing is necessary to carry out Gordon College academic laboratory regulations, equipment rental policies, and student liability agreements.</li>
							<li><span class="font-medium text-gray-700">Legitimate Interests:</span> To secure the platform against fraud, prevent loss of university assets, audit inventory records, and maintain continuous offline service capabilities.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">7. Disclosure and Data Sharing</h3>
						<p class="leading-relaxed mb-2">Your data is shared <strong class="text-gray-700">exclusively</strong> for academic and security purposes:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Instructors &amp; Approving Faculty:</span> Access to evaluate, approve, or reject student requests associated with their laboratory sections.</li>
							<li><span class="font-medium text-gray-700">Custodians &amp; Lab Assistants:</span> Access to scan QR codes, hand out items, evaluate returned item conditions, and record inventory metrics.</li>
							<li><span class="font-medium text-gray-700">Institutional Administrators:</span> Dashboard access to maintain databases, investigate system errors, and export auditing reports.</li>
						</ul>
						<div class="mt-3 rounded-lg border border-pink-100 bg-pink-50 px-4 py-3 text-pink-700">
							<strong>Security Note:</strong> CHTM Cooks does not sell, lease, or rent your personal information to third-party commercial entities. All data processing is strictly confined to internal academic operations.
						</div>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">8. Data Retention</h3>
						<p class="leading-relaxed">
							We retain your personal data only as long as necessary to fulfill the academic purposes for which it was collected. Student profiles and borrow histories are archived upon graduation, transfer, or after <strong class="text-gray-700">four (4) consecutive semesters</strong> of inactivity, in compliance with university document retention schedules.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">9. Data Security Measures</h3>
						<p class="leading-relaxed mb-2">
							We have put in place appropriate technical, physical, and organizational security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way. All database communications are secured using TLS encryption. User passwords are encrypted using state-of-the-art hashing algorithms.
						</p>
						<p class="leading-relaxed">
							In the event of a suspected data breach, we will notify you and the National Privacy Commission (NPC) in accordance with the guidelines set forth under the DPA.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">10. Your Rights Under the DPA</h3>
						<p class="leading-relaxed mb-2">Under the Philippine Data Privacy Act of 2012 (RA 10173), you possess the following rights:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Right to be Informed:</span> Knowing whether your personal data is being processed, and for what purposes.</li>
							<li><span class="font-medium text-gray-700">Right to Access:</span> Requesting a copy of your personal data processed by the platform.</li>
							<li><span class="font-medium text-gray-700">Right to Object:</span> Opposing processing based on legitimate interests (subject to academic requirements).</li>
							<li><span class="font-medium text-gray-700">Right to Rectification:</span> Requesting corrections to inaccurate or outdated profile records.</li>
							<li><span class="font-medium text-gray-700">Right to Erasure or Blocking:</span> Demanding suspension, withdrawal, or deletion of account records.</li>
							<li><span class="font-medium text-gray-700">Right to Damages:</span> Seeking compensation for damages sustained due to inaccurate, incomplete, or unauthorized use of data.</li>
							<li><span class="font-medium text-gray-700">Right to File a Complaint:</span> Lodging official complaints before the National Privacy Commission (NPC).</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">11. Data Protection Officer (DPO) Details</h3>
						<p class="leading-relaxed mb-2">
							For questions about how Gordon College handles your personal data within CHTM Cooks, contact the Gordon College Data Protection Officer:
						</p>
						<div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1 text-gray-600">
							<p><span class="font-medium text-gray-700">Data Protection Officer:</span> DPO, Gordon College</p>
							<p><span class="font-medium text-gray-700">Email:</span> <a href="mailto:dpo@gordoncollege.edu.ph" class="text-pink-600 hover:underline">dpo@gordoncollege.edu.ph</a></p>
							<p><span class="font-medium text-gray-700">Address:</span> Olongapo City Sports Complex, Donor St., East Tapinac, Olongapo City, Zambales 2200, Philippines</p>
							<p><span class="font-medium text-gray-700">Technical Support:</span> <a href="mailto:chtm.cooks@gmail.com" class="text-pink-600 hover:underline">chtm.cooks@gmail.com</a></p>
						</div>
					</div>

					<div class="rounded-lg border border-pink-100 bg-pink-50 px-4 py-3 text-sm text-pink-700">
						For privacy-related concerns or data requests, contact the system administrator via the <span class="font-semibold">Help &amp; Support</span> page or reach the DPO directly at <a href="mailto:dpo@gordoncollege.edu.ph" class="font-semibold underline">dpo@gordoncollege.edu.ph</a>.
					</div>
				</div>
			{/if}
		</div>

		<!-- Terms and Conditions Section -->
		<div class="rounded-lg bg-white shadow">
			<button
				onclick={() => (termsOpen = !termsOpen)}
				class="flex w-full items-center justify-between border-b border-gray-200 px-6 py-4 text-left transition-colors hover:bg-gray-50"
				aria-expanded={termsOpen}
			>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
						<FileText size={18} class="text-pink-600" />
					</div>
					<div>
						<h2 class="text-base font-semibold text-gray-900">Terms and Conditions</h2>
						<p class="mt-0.5 text-sm text-gray-500">Rules and responsibilities governing your use of this system</p>
					</div>
				</div>
				{#if termsOpen}
					<ChevronUp size={18} class="shrink-0 text-gray-400" />
				{:else}
					<ChevronDown size={18} class="shrink-0 text-gray-400" />
				{/if}
			</button>

			{#if termsOpen}
				<div class="px-6 py-5 text-sm text-gray-600 space-y-5">
					<p class="text-xs text-gray-400 uppercase tracking-wide font-semibold">Last Updated: May 2026 &nbsp;·&nbsp; College Regulations &amp; Borrowing Policies</p>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">1. Agreement to Terms</h3>
						<p class="leading-relaxed mb-2">
							These Terms &amp; Conditions constitute a binding agreement between you and the College of Hospitality &amp; Tourism Management (CHTM) at Gordon College, governing your usage of the CHTM Cooks laboratory inventory and equipment reservation system.
						</p>
						<p class="leading-relaxed">
							By registering an account, booking equipment, or otherwise accessing the services, you acknowledge that you have read, understood, and agreed to be bound by these Terms, as well as the CHTM Cooks Privacy Policy. If you do not agree to these terms, you are not authorized to use the platform.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">2. Eligibility and Enrollment</h3>
						<p class="leading-relaxed mb-2">Access to the CHTM Cooks platform is restricted solely to:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li>Active students officially enrolled in CHTM culinary, baking, or tourism laboratory courses at Gordon College.</li>
							<li>Designated CHTM academic faculty and class instructors.</li>
							<li>Authorized laboratory custodians and administrative staff.</li>
						</ul>
						<p class="mt-2 leading-relaxed">
							You must register using your official university-issued email address (<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">@gordoncollege.edu.ph</code>). Accounts registered with personal email domains are subject to immediate suspension.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">3. User Account Responsibilities</h3>
						<p class="leading-relaxed mb-2">
							When you create an account, you represent and warrant that the academic information provided (including your student ID, section block, and year level) is truthful and accurate.
						</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li>You are solely responsible for maintaining the confidentiality of your account credentials.</li>
							<li>You agree to accept responsibility for all activities, bookings, and damage records associated with your account.</li>
							<li>You must notify CHTM laboratory staff immediately if you suspect unauthorized access or compromise of your credentials.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">4. Equipment Borrowing Procedures</h3>
						<p class="leading-relaxed mb-2">The platform enables students to search available inventory and submit reservations. The following rules govern all transactions:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Instructor Approval Required:</span> All borrow requests must be associated with an active laboratory class and approved electronically by the designated class instructor before items can be released.</li>
							<li><span class="font-medium text-gray-700">Financial Responsibility:</span> In the event of loss, breakage, or damage, you may be held financially responsible for repair or replacement costs. Overdue items, unresolved damage reports, or unpaid replacement fees may result in suspension of borrowing privileges and academic holds.</li>
							<li><span class="font-medium text-gray-700">Designated Pick-Up &amp; Return Hours:</span> Items must be claimed and returned within CHTM laboratory operating hours. Failure to pick up approved items within the designated time frame may result in request cancellation.</li>
							<li><span class="font-medium text-gray-700">Verification at Return:</span> Returned items must be audited in the presence of the custodian, who will sign off on the condition and cleanliness of the returned items.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">5. Damage, Loss, and Student Liability</h3>
						<p class="leading-relaxed mb-2">Borrowing laboratory equipment carries direct financial and academic responsibility:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li><span class="font-medium text-gray-700">Cleanliness:</span> All tools, utensils, and appliances must be returned fully cleaned, sanitized, and ready for subsequent use, in accordance with culinary sanitation standards.</li>
							<li><span class="font-medium text-gray-700">Damage and Wear:</span> You are responsible for inspecting equipment at pickup. Any damage not reported at checkout will be presumed to have occurred during your borrowing period.</li>
							<li><span class="font-medium text-gray-700">Financial Responsibility:</span> In the event of loss, breakage, or damage, you may be held financially responsible for repair or replacement costs. Overdue items, unresolved damage reports, or unpaid replacement fees may result in suspension of borrowing privileges and academic holds.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">6. Prohibited Activities</h3>
						<p class="leading-relaxed mb-2">Users of the platform are strictly prohibited from engaging in the following actions:</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li>Registering multiple accounts or utilizing another user's account credentials to borrow equipment.</li>
							<li>Submitting false or fabricated reservation schedules to reserve items for non-academic uses.</li>
							<li>Tampering with the QR code verification workflow or attempting to override administrator approval states.</li>
							<li>Using CHTM Cooks culinary equipment off-campus without explicit written permission from the CHTM Dean or Lab Head.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">7. System Availability and Disclaimers</h3>
						<p class="leading-relaxed mb-2">
							The CHTM Cooks system is provided on an "as-is" and "as-available" basis for educational and institutional management. While we strive to ensure service uptime, we do not guarantee uninterrupted access:
						</p>
						<ul class="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
							<li>Offline capabilities are provided to allow queueing of requests during network fluctuations, but transactions are only finalized upon syncing with the server.</li>
							<li>We are not responsible for equipment shortages resulting from real-time discrepancies, late returns by other students, or emergency inventory audits.</li>
						</ul>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">8. Termination of Access</h3>
						<p class="leading-relaxed">
							We reserve the right to suspend or terminate your access to the platform at our sole discretion, without prior notice, if you violate these Terms, university student code of conduct, or engage in behavior that compromises laboratory safety or assets.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">9. Governing Law</h3>
						<p class="leading-relaxed">
							These Terms are governed by and construed in accordance with the regulations of Gordon College, local ordinances of Olongapo City, and applicable laws of the Republic of the Philippines.
						</p>
					</div>

					<div>
						<h3 class="font-semibold text-gray-800 mb-1.5">10. Contact and Administration</h3>
						<p class="leading-relaxed mb-2">For inquiries, administrative disputes regarding equipment penalties, or system assistance, please contact the CHTM Laboratory:</p>
						<div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1 text-gray-600">
							<p><span class="font-medium text-gray-700">Official Email:</span> <a href="mailto:chtm.cooks@gmail.com" class="text-pink-600 hover:underline">chtm.cooks@gmail.com</a></p>
							<p><span class="font-medium text-gray-700">Support:</span> <a href="mailto:support@chtmcooks.edu.ph" class="text-pink-600 hover:underline">support@chtmcooks.edu.ph</a></p>
							<p><span class="font-medium text-gray-700">Institutional Inquiries:</span> <a href="mailto:chtm@gordoncollege.edu.ph" class="text-pink-600 hover:underline">chtm@gordoncollege.edu.ph</a></p>
						</div>
					</div>

					<div class="rounded-lg border border-pink-100 bg-pink-50 px-4 py-3 text-sm text-pink-700">
						By using this system, you confirm that you have read, understood, and agreed to these Terms and Conditions.
					</div>
				</div>
			{/if}
		</div>

	</div>
</div>
