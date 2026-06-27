<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, user, isLoading } from '$lib/stores/auth';
	import favicon from '$lib/assets/CHTM_LOGO.png';
	import LandingNav from '$lib/components/landing/LandingNav.svelte';
	import LandingHero from '$lib/components/landing/LandingHero.svelte';
	import {
		Bot,
		QrCode,
		ChevronLeft,
		ChevronRight,
		Search,
		ShoppingCart,
		Send,
		CheckCircle2,
		Package,
		RefreshCw,
		BarChart3,
		Boxes,
		// Redesign imports
		LayoutDashboard,
		BookOpen,
		UserCheck,
		Bell,
		ShieldAlert,
		Clock,
		// Smart Tech Redesign
		History,
		TrendingUp,
		Sparkles,
		Cpu,
		Activity,
		ShieldCheck
	} from 'lucide-svelte';

	// Redesign assets
	import chefHat from '$lib/assets/Equipment/v2/004-chef-hat.png';
	import bowl from '$lib/assets/Equipment/v2/007-bowl.png';
	import knives from '$lib/assets/Equipment/v2/006-knives.png';

	let authCheckComplete = $state(false);
	let diffPosition = $state(50);
	let activeStep = $state(0);
	const totalSteps = 6;

	// Redesign state
	let activeFeatureIndex = $state(0);
	
	const featuresList = [
		{
			title: 'Personal Dashboard',
			desc: 'Track borrowed equipment and return schedules easily.',
			icon: LayoutDashboard
		},
		{
			title: 'Equipment Catalog',
			desc: 'Browse available laboratory tools before requesting.',
			icon: BookOpen
		},
		{
			title: 'Instructor Approval',
			desc: 'Requests are reviewed and approved digitally.',
			icon: UserCheck
		},
		{
			title: 'Instant QR Access',
			desc: 'Use your personal code for faster claiming.',
			icon: QrCode
		},
		{
			title: 'Live Updates',
			desc: 'Receive real-time request and return notifications.',
			icon: Bell
		}
	];

	// Smart Tech state & metadata
	let activeSmartFeatureIndex = $state(0);

	// Only include core Next-Gen capabilities here. Removed the following items per request:
	// - Live Equipment Tracking
	// - Digital Borrowing History
	// - Instant Approval Alerts
	// - Real-Time Availability
	const smartFeatures = [
		{
			title: 'AI Help Assistant',
			desc: 'AI-powered assistance anytime.',
			icon: Bot
		},
		{
			title: 'Smart QR Claiming',
			desc: 'Scan and claim equipment instantly.',
			icon: QrCode
		}
	];

	// Split features for the left/right staggered wings while preserving original indices
	const indexedSmart = smartFeatures.map((f, idx) => ({ feature: f, idx }));
	const leftFeatures = indexedSmart.filter(item => item.idx % 2 === 0);
	const rightFeatures = indexedSmart.filter(item => item.idx % 2 === 1);

	function nextStep() {
		activeStep = (activeStep + 1) % totalSteps;
	}

	function prevStep() {
		activeStep = (activeStep - 1 + totalSteps) % totalSteps;
	}

	function goToStep(index: number) {
		activeStep = index;
	}

	$effect(() => {
		if (!$isLoading && !authCheckComplete) {
			authCheckComplete = true;
			if ($isAuthenticated && $user) {
				const routes: Record<string, string> = {
					student: '/student/dashboard',
					instructor: '/instructor/dashboard',
					custodian: '/custodian/dashboard',
					superadmin: '/superadmin/dashboard',
					admin: '/superadmin/dashboard',
					supervisor: '/supervisor/dashboard'
				};
				goto(routes[$user.role] || '/auth/login', { replaceState: true });
			}
		}
	});

	const requestSteps = [
		{
			step: 1,
			title: 'Browse Catalog',
			desc: 'Find cooking equipment with real-time stock info.',
			icon: Search
		},
		{
			step: 2,
			title: 'Add to Request',
			desc: 'Select items, quantities, and set your borrow schedule.',
			icon: ShoppingCart
		},
		{
			step: 3,
			title: 'Submit for Review',
			desc: 'Your request is sent to your class instructor for approval.',
			icon: Send
		},
		{
			step: 4,
			title: 'Instructor Approves',
			desc: 'Instructor reviews, then custodian prepares your items.',
			icon: CheckCircle2
		},
		{
			step: 5,
			title: 'Pick Up Equipment',
			desc: 'Show your QR code at the custodian desk and collect items.',
			icon: Package
		},
		{
			step: 6,
			title: 'Return On Time',
			desc: 'Return items on schedule to keep your Trust Score high.',
			icon: RefreshCw
		}
	];
</script>

<svelte:head>
	<title>CHTM Cooks · Student Guide</title>
	<meta
		name="description"
		content="Your complete guide to using the CHTM Cooks laboratory equipment management system as a student."
	/>
	<!-- Preconnect to external resources -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="preconnect" href="https://lottie.host" crossorigin="anonymous" />
	<!-- DNS prefetch for faster resolution -->
	<link rel="dns-prefetch" href="https://lottie.host" />
	<!-- Preload critical fonts -->
	<link
		rel="preload"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
		as="style"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
		rel="stylesheet"
	/>
	<!-- Preload Lottie animation -->
	<link
		rel="preload"
		href="https://lottie.host/3f8f045f-a7f9-467c-b90e-5d8fec25020d/2QVqFu04nF.lottie"
		as="fetch"
		crossorigin="anonymous"
	/>
</svelte:head>

{#if $isLoading}
	<div class="loading-screen">
		<div class="loading-inner">
			<div class="loading-logo-wrap">
				<div class="loading-glow"></div>
				<img src={favicon} alt="CHTM Logo" class="loading-logo" />
			</div>
			<div class="loading-dots">
				<span style="animation-delay:0ms"></span>
				<span style="animation-delay:160ms"></span>
				<span style="animation-delay:320ms"></span>
			</div>
		</div>
	</div>
{/if}

<div class="page-root" class:hidden={$isLoading}>
	<LandingNav />
	<LandingHero />

	<!-- ══ CORE FEATURES REDESIGN ════════════════════════════════ -->
	{#snippet activeMockup(index: number)}
		{#if index === 0}
			<!-- Personal Dashboard Preview -->
			<div class="mockup-view mockup-dashboard animate-fade-in">
				<div class="mockup-dash-header">
					<div class="mockup-user-avatar">SL</div>
					<div class="mockup-user-info">
						<span class="mockup-user-name">Sarah Lim</span>
						<span class="mockup-user-role">Student · CHTM Section B</span>
					</div>
					<div class="mockup-trust-badge">
						<div class="trust-value">98%</div>
						<div class="trust-label">Trust Score</div>
					</div>
				</div>
				
				<div class="mockup-dash-metrics">
					<div class="mockup-metric-card">
						<div class="metric-icon pink"><LayoutDashboard size={18} /></div>
						<div class="metric-val">12</div>
						<div class="metric-lbl">Total Borrowed</div>
					</div>
					<div class="metric-divider"></div>
					<div class="mockup-metric-card">
						<div class="metric-icon green"><CheckCircle2 size={18} /></div>
						<div class="metric-val">100%</div>
						<div class="metric-lbl">On-Time Return</div>
					</div>
				</div>

				<div class="mockup-section-title">Current Obligations</div>
				<div class="mockup-list-items">
					<div class="mockup-list-item warning">
						<div class="item-icon-wrap"><Clock size={16} /></div>
						<div class="item-details">
							<span class="item-name font-semibold">KitchenAid Stand Mixer</span>
							<span class="item-meta">Station 4 · Baking Lab</span>
						</div>
						<span class="item-status due">Due in 2 days</span>
					</div>
					<div class="mockup-list-item success">
						<div class="item-icon-wrap"><CheckCircle2 size={16} /></div>
						<div class="item-details">
							<span class="item-name font-semibold">Wusthof Chef Knife 8"</span>
							<span class="item-meta">Returned · Good Condition</span>
						</div>
						<span class="item-status returned">Returned</span>
					</div>
				</div>
			</div>
		{:else if index === 1}
			<!-- Equipment Catalog Preview -->
			<div class="mockup-view mockup-catalog animate-fade-in">
				<div class="mockup-catalog-search">
					<span class="search-icon"><Search size={16} /></span>
					<span class="search-placeholder">Search equipment (e.g. stand mixer)...</span>
				</div>
				
				<div class="mockup-catalog-grid">
					<div class="mockup-catalog-card">
						<div class="catalog-card-img-wrap">
							<img src={chefHat} alt="Chef Hat" />
						</div>
						<div class="catalog-card-info">
							<span class="catalog-card-title font-semibold">Premium Chef Hat</span>
							<div class="catalog-card-meta">
								<span class="catalog-stock-pill green">8 Available</span>
							</div>
						</div>
						<button class="catalog-card-btn select">Select</button>
					</div>
					
					<div class="mockup-catalog-card selected">
						<div class="catalog-card-img-wrap">
							<img src={knives} alt="Knives" />
						</div>
						<div class="catalog-card-info">
							<span class="catalog-card-title font-semibold">Wusthof Knife Set</span>
							<div class="catalog-card-meta">
								<span class="catalog-stock-pill green">3 Available</span>
							</div>
						</div>
						<button class="catalog-card-btn selected">Added</button>
					</div>
					
					<div class="mockup-catalog-card">
						<div class="catalog-card-img-wrap">
							<img src={bowl} alt="Bowl" />
						</div>
						<div class="catalog-card-info">
							<span class="catalog-card-title font-semibold">Stainless Mixing Bowl</span>
							<div class="catalog-card-meta">
								<span class="catalog-stock-pill yellow">2 Left</span>
							</div>
						</div>
						<button class="catalog-card-btn select">Select</button>
					</div>
				</div>
			</div>
		{:else if index === 2}
			<!-- Instructor Approval Preview -->
			<div class="mockup-view mockup-approval animate-fade-in">
				<div class="mockup-approval-header">
					<span class="approval-req-id font-bold">Request #1042</span>
					<span class="approval-req-date">Today at 10:15 AM</span>
				</div>
				
				<div class="mockup-approval-flow">
					<div class="approval-step completed">
						<div class="step-marker"><CheckCircle2 size={12} /></div>
						<div class="step-info">
							<span class="step-title font-semibold">Submitted for Review</span>
							<span class="step-desc">Sarah Lim requested 2 items for Culinary Lab.</span>
						</div>
					</div>
					
					<div class="approval-step reviewing">
						<div class="step-marker pulse"></div>
						<div class="step-info">
							<span class="step-title font-semibold">Instructor Evaluation</span>
							<span class="step-desc">Chef Lopez is reviewing the request...</span>
						</div>
					</div>
				</div>

				<div class="mockup-action-card">
					<div class="action-card-profile">
						<div class="instructor-avatar">CL</div>
						<div class="instructor-info">
							<span class="instructor-name font-semibold">Chef Carl Lopez</span>
							<span class="instructor-dept">Culinary Arts Instructor</span>
						</div>
					</div>
					<div class="action-card-decision">
						<div class="decision-badge approved animate-stamp">
							<CheckCircle2 size={16} /> APPROVED
						</div>
					</div>
				</div>
			</div>
		{:else if index === 3}
			<!-- Instant QR Access Preview -->
			<div class="mockup-view mockup-qr-claim animate-fade-in">
				<div class="phone-mockup-frame">
					<div class="phone-screen">
						<div class="phone-header-notch"></div>
						<div class="phone-app-bar">
							<QrCode size={18} />
							<span class="phone-title font-bold">Fast Claim QR</span>
						</div>
						<div class="phone-body">
							<p class="phone-instruction">Show code at the custodian desk to claim equipment.</p>
							<div class="phone-qr-container">
								<div class="phone-qr-corner top-left"></div>
								<div class="phone-qr-corner top-right"></div>
								<div class="phone-qr-corner bottom-left"></div>
								<div class="phone-qr-corner bottom-right"></div>
								<div class="phone-qr-graphic">
									{#each Array(16) as _, i}
										<div class="qr-cell" class:filled={i % 3 === 0 || i % 5 === 1 || i === 0 || i === 15}></div>
									{/each}
								</div>
								<div class="phone-qr-scanline"></div>
							</div>
							<div class="phone-verified-status">
								<span class="pulse-dot-green"></span>
								<span class="verified-text font-semibold">Ready for Pickup</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else if index === 4}
			<!-- Live Updates Preview -->
			<div class="mockup-view mockup-updates animate-fade-in">
				<div class="updates-stack">
					<div class="update-notification card-glass pulse-border-pink">
						<div class="notification-icon-wrap pink">
							<Bell size={18} />
						</div>
						<div class="notification-body">
							<div class="notification-header">
								<span class="notification-title font-semibold">Request Approved</span>
								<span class="notification-time">Just now</span>
							</div>
							<p class="notification-text">Your request for 1x KitchenAid Mixer has been approved.</p>
						</div>
					</div>
					
					<div class="update-notification card-glass">
						<div class="notification-icon-wrap blue">
							<CheckCircle2 size={18} />
						</div>
						<div class="notification-body">
							<div class="notification-header">
								<span class="notification-title font-semibold">Items Released</span>
								<span class="notification-time">2 hours ago</span>
							</div>
							<p class="notification-text">Sarah Lim successfully claimed 2 items from Custodian Desk.</p>
						</div>
					</div>
					
					<div class="update-notification card-glass warning">
						<div class="notification-icon-wrap orange">
							<ShieldAlert size={18} />
						</div>
						<div class="notification-body">
							<div class="notification-header">
								<span class="notification-title font-semibold">Return Reminder</span>
								<span class="notification-time">3 hours left</span>
							</div>
							<p class="notification-text">Wusthof Knife Set is due for return today by 5:00 PM.</p>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/snippet}

	<section id="core-features" class="guide-section features-modern">
		<div class="section-wrap">
			<div class="flow-header">
				<h2 class="section-heading flow-heading">Everything You Need</h2>
			</div>

			<div class="features-split-container">
				<!-- Left Column: Interactive Feature Cards -->
				<div class="features-list-pane">
					{#each featuresList as feature, index}
						{@const Icon = feature.icon}
						{@const isActive = index === activeFeatureIndex}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="feature-row-card"
							class:active={isActive}
							onmouseenter={() => activeFeatureIndex = index}
							onclick={() => activeFeatureIndex = index}
						>
							<div class="feature-card-icon-container">
								<Icon size={22} strokeWidth={2} />
							</div>
							<div class="feature-card-text">
								<h3 class="feature-card-title font-semibold">{feature.title}</h3>
								<p class="feature-card-desc">{feature.desc}</p>
							</div>
						</div>

						<!-- Mobile Accordion Drawer (displays inline below active card on mobile/tablet) -->
						{#if isActive}
							<div class="mobile-preview-drawer">
								<div class="mobile-drawer-content">
									{@render activeMockup(index)}
								</div>
							</div>
						{/if}
					{/each}
				</div>

				<!-- Right Column: Central Dashboard Feature Preview (Desktop Only) -->
				<div class="features-preview-pane">
					<div class="preview-glass-wrapper">
						<div class="preview-header-bar">
							<div class="preview-dots">
								<span class="preview-dot red"></span>
								<span class="preview-dot yellow"></span>
								<span class="preview-dot green"></span>
							</div>
							<div class="preview-address-bar">chtm-cooks.net/student/dashboard</div>
						</div>
						<div class="preview-body-content">
							{@render activeMockup(activeFeatureIndex)}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Animated Background Elements -->
		<div class="features-bg">
			<div class="bg-orb orb-1"></div>
			<div class="bg-orb orb-2"></div>
			<div class="bg-orb orb-3"></div>
		</div>
	</section>

	<!-- ══ REQUEST FLOW ══════════════════════════ -->
	<section id="request-flow" class="guide-section flow-section">
		<div class="section-wrap">
			<div class="flow-header">
				<h2 class="section-heading flow-heading">How it works?</h2>
			</div>
		</div>
		<div class="carousel-container">
			<div class="carousel-stacked-track">
				{#each requestSteps as s, index}
					{@const Icon = s.icon}
					{@const isActive = index === activeStep}
					{@const offset = index - activeStep}
					{@const absOffset = Math.abs(offset)}
					{@const isPast = offset < 0}

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="carousel-slide-stacked"
						class:active={isActive}
						class:past={isPast}
						style="--offset: {offset}; --abs-offset: {absOffset}; z-index: {20 - absOffset};"
						onclick={() => goToStep(index)}
					>
						<div class="flow-card">
							<div class="card-number">0{s.step}</div>
							<div class="card-inner">
								<div class="flow-icon-wrapper">
									<Icon size={isActive ? 64 : 48} strokeWidth={2} class="flow-icon" />
								</div>
								<h3 class="flow-title">{s.title}</h3>
								<p class="flow-description">{s.desc}</p>
							</div>
							<div class="card-gradient"></div>
						</div>
					</div>
				{/each}
			</div>

			<div class="carousel-nav">
				<button class="nav-btn nav-prev" onclick={prevStep} aria-label="Previous step">
					<ChevronLeft size={24} strokeWidth={2.5} />
				</button>
				<button class="nav-btn nav-next" onclick={nextStep} aria-label="Next step">
					<ChevronRight size={24} strokeWidth={2.5} />
				</button>
			</div>

			<div class="carousel-dots">
				{#each requestSteps as _, index}
					<button
						class="dot"
						class:active={index === activeStep}
						onclick={() => goToStep(index)}
						aria-label="Go to step {index + 1}"
					></button>
				{/each}
			</div>
		</div>
	</section>

	<!-- ══ SMART TECH SECTION ════════════════════════════════ -->
	{#snippet smartMockup(index: number)}
		{#if index === 0}
			<!-- AI Help Assistant Visual -->
			<div class="smart-mockup-view mockup-ai-chat animate-fade-in">
				<div class="smart-chat-header">
					<div class="smart-bot-avatar">
						<Bot size={20} />
						<span class="active-dot"></span>
					</div>
					<div class="smart-bot-info">
						<span class="smart-bot-name font-semibold">CHTM Kitchen Bot</span>
						<span class="smart-bot-status">AI Assistant · Active</span>
					</div>
				</div>
				<div class="smart-chat-body">
					<div class="smart-msg user">Do we have stand mixers for Lab 3?</div>
					<div class="smart-msg bot">
						<span class="msg-sparkle"><Sparkles size={12} /></span>
						Checking real-time stock... Yes! We have <strong>4 KitchenAid Mixers</strong> in Locker B. Would you like to request one?
					</div>
					<div class="smart-msg-typing">
						<span></span><span></span><span></span>
					</div>
				</div>
				<div class="smart-chat-input">
					<div class="smart-chat-pill">Type a message...</div>
					<button class="smart-chat-send" aria-label="Send message"><Send size={14} /></button>
				</div>
			</div>
		{:else if index === 1}
			<!-- Smart QR Claiming Visual -->
			<div class="smart-mockup-view mockup-qr-scanner animate-fade-in">
				<div class="scanner-glass-device">
					<div class="scanner-overlay-brackets">
						<div class="bracket tl"></div>
						<div class="bracket tr"></div>
						<div class="bracket bl"></div>
						<div class="bracket br"></div>
					</div>
					<div class="scanner-qr-graphic">
						<QrCode size={100} strokeWidth={1} class="qr-svg-glow" />
						<div class="scanner-laser-sweep"></div>
					</div>
					<div class="scanner-custodian-status text-center">
						<div class="scan-pill font-bold animate-pulse">SCAN TO CLAIM</div>
						<p class="scan-desc mt-1">Locker 14 unlocked automatically</p>
					</div>
				</div>
			</div>
		{/if}
	{/snippet}

	<section id="smart-features" class="guide-section smart-tech-section">
		<div class="section-wrap">
			<div class="flow-header">
				<h2 class="section-heading flow-heading">Next-Gen Capabilities</h2>
			</div>

			<div class="smart-tech-container">
				<!-- Left Wing: Staggered Cards (1, 3, 5) -->
				<div class="smart-wing left-wing">
					{#each leftFeatures as item}
						{@const feature = item.feature}
						{@const index = item.idx}
						{@const isActive = index === activeSmartFeatureIndex}
						{@const Icon = feature.icon}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="smart-feature-card staggered-card"
							class:active={isActive}
							onmouseenter={() => activeSmartFeatureIndex = index}
							onclick={() => activeSmartFeatureIndex = index}
						>
							<div class="smart-card-icon-wrap">
								<Icon size={20} strokeWidth={2.5} />
							</div>
							<div class="smart-card-text">
								<h3 class="smart-card-title font-bold">{feature.title}</h3>
								<p class="smart-card-desc">{feature.desc}</p>
							</div>
						</div>
                        
						<!-- Mobile Inline Drawer (stacks previews on smaller screens) -->
						{#if isActive}
							<div class="mobile-smart-preview">
								{@render smartMockup(index)}
							</div>
						{/if}
					{/each}
				</div>

				<!-- Center Hub: Large Device Console Mockup -->
				<div class="smart-center-hub">
					<div class="smart-glowing-blob"></div>
					<div class="smart-console-frame">
						<div class="console-glass-header">
							<div class="console-actions">
								<span class="console-dot red"></span>
								<span class="console-dot yellow"></span>
								<span class="console-dot green"></span>
							</div>
							<div class="console-title font-semibold">SMART HUB INTERFACE v2.0</div>
						</div>
						<div class="console-glass-body">
							{@render smartMockup(activeSmartFeatureIndex)}
						</div>
					</div>
				</div>

				<!-- Right Wing: Staggered Cards (2, 4, 6) -->
				<div class="smart-wing right-wing">
					{#each rightFeatures as item}
						{@const feature = item.feature}
						{@const index = item.idx}
						{@const isActive = index === activeSmartFeatureIndex}
						{@const Icon = feature.icon}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="smart-feature-card staggered-card"
							class:active={isActive}
							onmouseenter={() => activeSmartFeatureIndex = index}
							onclick={() => activeSmartFeatureIndex = index}
						>
							<div class="smart-card-icon-wrap">
								<Icon size={20} strokeWidth={2.5} />
							</div>
							<div class="smart-card-text">
								<h3 class="smart-card-title font-bold">{feature.title}</h3>
								<p class="smart-card-desc">{feature.desc}</p>
							</div>
						</div>
                        
						<!-- Mobile Inline Drawer (stacks previews on smaller screens) -->
						{#if isActive}
							<div class="mobile-smart-preview">
								{@render smartMockup(index)}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</section>
	<!-- ══ FOOTER ════════════════════════════════ -->
	<footer class="site-footer">
		<div class="footer-wrap">
			<div class="footer-brand">
				<img src={favicon} alt="CHTM" class="footer-logo" />
				<span>CHTM Cooks</span>
			</div>
			<nav class="footer-links" aria-label="Footer">
				<a href="/privacy" class="footer-link">Privacy Policy</a>
				<span class="mx">·</span>
				<a href="/terms" class="footer-link">Terms &amp; Conditions</a>
			</nav>
			<p class="footer-copy">
				© {new Date().getFullYear()} CHTM Cooks · College of Hospitality & Tourism Management
			</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
	}

	/* Loading */
	.loading-screen {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
	}
	.loading-inner {
		text-align: center;
	}
	.loading-logo-wrap {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 0 auto 1rem;
	}
	.loading-glow {
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		background: rgba(233, 30, 99, 0.18);
		filter: blur(12px);
		animation: glow 2s ease-in-out infinite;
	}
	.loading-logo {
		width: 80px;
		height: 80px;
		position: relative;
		z-index: 1;
		animation: bounce 1s ease-in-out infinite alternate;
	}
	.loading-dots {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}
	.loading-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #e91e63;
		animation: dot 1s ease-in-out infinite;
	}

	/* Page root */
	.page-root {
		background: #fff;
		min-height: 100vh;
	}
	.page-root.hidden {
		opacity: 0;
		pointer-events: none;
	}

	/* Sections */
	.guide-section {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 8rem 1.5rem 5rem;
		overflow: hidden;
		position: relative;
		scroll-margin-top: 6rem;
	}

	.flow-section {
		background: linear-gradient(
			180deg,
			#ffffff 0%,
			rgba(253, 232, 240, 0.35) 55%,
			rgba(251, 182, 205, 0.45) 100%
		);
		padding-bottom: 8rem;
	}

	@media (max-width: 768px) {
		.guide-section {
			padding: 4rem 1.25rem;
			min-height: auto;
		}
	}

	@media (max-width: 480px) {
		.guide-section {
			padding: 3rem 1rem;
		}
	}
	.section-wrap {
		max-width: 1100px;
		width: 100%;
		margin: 0 auto;
		position: relative;
		z-index: 2;
	}
	.section-heading {
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 900;
		color: #1a0a12;
		letter-spacing: -0.025em;
		margin: 0 0 0.75rem;
	}

	@media (max-width: 480px) {
		.section-heading {
			font-size: clamp(1.5rem, 6vw, 2rem);
		}
	}

	/* Request Flow Full Screen Override */
	#request-flow {
		padding-left: 0;
		padding-right: 0;
	}
	#request-flow .section-wrap {
		padding-left: 1.5rem;
		padding-right: 1.5rem;
	}

	/* ══════════════════════════════════════════════════════════════
	   MODERN FEATURES SECTION - Creative & Industry Standard
	   ══════════════════════════════════════════════════════════════ */

	.features-modern {
		position: relative;
		background: #ffffff;
		overflow: hidden;
	}



	.features-split-container {
		display: grid;
		grid-template-columns: 1fr 1.3fr;
		gap: 3.5rem;
		align-items: start;
		margin-top: 4rem;
		position: relative;
		z-index: 2;
	}

	.features-list-pane {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.feature-row-card {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.08);
		border-radius: 1rem;
		padding: 1.5rem;
		display: flex;
		gap: 1.25rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.02);
	}

	.feature-row-card:hover {
		transform: translateX(6px);
		border-color: rgba(233, 30, 99, 0.25);
		box-shadow: 0 8px 24px rgba(233, 30, 99, 0.06);
	}

	.feature-row-card.active {
		border-color: #e91e63;
		background: linear-gradient(to right, #fff5f8, #ffffff);
		box-shadow: 0 10px 30px rgba(233, 30, 99, 0.08);
	}

	.feature-card-icon-container {
		width: 48px;
		height: 48px;
		min-width: 48px;
		border-radius: 0.75rem;
		background: rgba(233, 30, 99, 0.06);
		color: #e91e63;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}

	.feature-row-card:hover .feature-card-icon-container {
		transform: scale(1.05);
	}

	.feature-row-card.active .feature-card-icon-container {
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.3);
	}

	.feature-card-text {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
	}

	.feature-card-title {
		font-size: 1.125rem;
		color: #1a0a12;
		margin: 0;
	}

	.feature-card-desc {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.4;
	}

	/* Desktop Preview Pane */
	.features-preview-pane {
		position: sticky;
		top: 6.5rem;
	}

	.preview-glass-wrapper {
		background: rgba(255, 255, 255, 0.75);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.8);
		border-radius: 1.5rem;
		box-shadow: 0 25px 60px -15px rgba(233, 30, 99, 0.12),
					0 0 0 1px rgba(233, 30, 99, 0.04);
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.preview-header-bar {
		background: rgba(255, 255, 255, 0.8);
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
		padding: 0.75rem 1.25rem;
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.preview-dots {
		display: flex;
		gap: 0.375rem;
	}

	.preview-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.preview-dot.red { background: #ff5f56; }
	.preview-dot.yellow { background: #ffbd2e; }
	.preview-dot.green { background: #27c93f; }

	.preview-address-bar {
		flex: 1;
		background: rgba(0, 0, 0, 0.03);
		border-radius: 0.375rem;
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		color: #9ca3af;
		font-family: monospace;
		text-align: center;
	}

	.preview-body-content {
		padding: 2.25rem;
		min-height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* --- Mockup General Styling --- */
	.mockup-view {
		width: 100%;
		animation: fadeIn 0.4s ease-out forwards;
	}

	/* 1. Dashboard Mockup */
	.mockup-dashboard {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.mockup-dash-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: rgba(255, 255, 255, 0.9);
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		border: 1px solid rgba(233, 30, 99, 0.05);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
	}

	.mockup-user-avatar {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.9375rem;
		box-shadow: 0 4px 10px rgba(233, 30, 99, 0.25);
	}

	.mockup-user-info {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
	}

	.mockup-user-name {
		font-size: 0.9375rem;
		color: #1f2937;
	}

	.mockup-user-role {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.mockup-trust-badge {
		text-align: right;
	}

	.trust-value {
		font-size: 1.125rem;
		font-weight: 800;
		color: #10b981;
		line-height: 1;
	}

	.trust-label {
		font-size: 0.6875rem;
		color: #6b7280;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.mockup-dash-metrics {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		background: rgba(255, 255, 255, 0.6);
		border-radius: 1rem;
		border: 1px solid rgba(0, 0, 0, 0.03);
		padding: 1rem;
	}

	.mockup-metric-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.metric-icon {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.375rem;
	}

	.metric-icon.pink {
		background: rgba(233, 30, 99, 0.08);
		color: #e91e63;
	}

	.metric-icon.green {
		background: rgba(16, 185, 129, 0.08);
		color: #10b981;
	}

	.metric-val {
		font-size: 1.25rem;
		font-weight: 800;
		color: #111827;
		line-height: 1.2;
	}

	.metric-lbl {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.metric-divider {
		width: 1px;
		height: 40px;
		background: rgba(0, 0, 0, 0.06);
	}

	.mockup-section-title {
		font-size: 0.75rem;
		font-weight: 700;
		color: #880e4f;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.5rem;
	}

	.mockup-list-items {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mockup-list-item {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.03);
	}

	.mockup-list-item.warning {
		border-left: 3px solid #f59e0b;
	}

	.mockup-list-item.success {
		border-left: 3px solid #10b981;
	}

	.item-icon-wrap {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.02);
		color: #6b7280;
	}

	.mockup-list-item.warning .item-icon-wrap {
		background: rgba(245, 158, 11, 0.08);
		color: #f59e0b;
	}

	.mockup-list-item.success .item-icon-wrap {
		background: rgba(16, 185, 129, 0.08);
		color: #10b981;
	}

	.item-details {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
	}

	.item-name {
		font-size: 0.875rem;
		color: #1f2937;
	}

	.item-meta {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.item-status {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
	}

	.item-status.due {
		background: rgba(245, 158, 11, 0.1);
		color: #b45309;
	}

	.item-status.returned {
		background: rgba(16, 185, 129, 0.1);
		color: #047857;
	}

	/* 2. Catalog Mockup */
	.mockup-catalog {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		width: 100%;
	}

	.mockup-catalog-search {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 0.75rem;
		padding: 0.625rem 1rem;
	}

	.mockup-catalog-search .search-icon {
		color: #9ca3af;
	}

	.search-placeholder {
		font-size: 0.8125rem;
		color: #9ca3af;
	}

	.mockup-catalog-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.875rem;
	}

	.mockup-catalog-card {
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.05);
		border-radius: 0.75rem;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		transition: all 0.3s ease;
	}

	.mockup-catalog-card.selected {
		border-color: #e91e63;
		box-shadow: 0 4px 15px rgba(233, 30, 99, 0.08);
		background: #fffbfe;
	}

	.catalog-card-img-wrap {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.75rem;
		border-radius: 0.5rem;
		background: #fafafa;
		padding: 0.5rem;
	}

	.catalog-card-img-wrap img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.catalog-card-info {
		margin-bottom: 0.75rem;
	}

	.catalog-card-title {
		font-size: 0.8125rem;
		color: #1f2937;
		display: block;
		margin-bottom: 0.25rem;
		line-height: 1.2;
		height: 32px;
		overflow: hidden;
	}

	.catalog-card-meta {
		display: flex;
		justify-content: center;
	}

	.catalog-stock-pill {
		font-size: 0.6875rem;
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
	}

	.catalog-stock-pill.green {
		background: rgba(16, 185, 129, 0.1);
		color: #047857;
	}

	.catalog-stock-pill.yellow {
		background: rgba(245, 158, 11, 0.1);
		color: #b45309;
	}

	.catalog-card-btn {
		width: 100%;
		border: none;
		border-radius: 0.5rem;
		padding: 0.375rem 0;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.catalog-card-btn.select {
		background: rgba(0, 0, 0, 0.04);
		color: #4b5563;
	}

	.catalog-card-btn.selected {
		background: #e91e63;
		color: white;
		box-shadow: 0 2px 6px rgba(233, 30, 99, 0.2);
	}

	/* 3. Instructor Approval Mockup */
	.mockup-approval {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		width: 100%;
	}

	.mockup-approval-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #9ca3af;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		padding-bottom: 0.5rem;
	}

	.approval-req-id {
		color: #1f2937;
	}

	.mockup-approval-flow {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-left: 0.5rem;
	}

	.approval-step {
		display: flex;
		gap: 1rem;
		position: relative;
	}

	.approval-step:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 8px;
		top: 18px;
		bottom: -16px;
		width: 2px;
		background: #e5e7eb;
	}

	.approval-step.completed:not(:last-child)::after {
		background: #10b981;
	}

	.step-marker {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #e5e7eb;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.approval-step.completed .step-marker {
		background: #10b981;
	}

	.approval-step.reviewing .step-marker {
		background: #f59e0b;
	}

	.step-marker.pulse {
		animation: pulse-approval 1.5s infinite ease-in-out;
	}

	@keyframes pulse-approval {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4);
		}
		50% {
			transform: scale(1.1);
			box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
		}
	}

	.step-info {
		display: flex;
		flex-direction: column;
	}

	.step-title {
		font-size: 0.8125rem;
		color: #1f2937;
		line-height: 1.2;
	}

	.step-desc {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.mockup-action-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(255, 255, 255, 0.9);
		padding: 1rem;
		border-radius: 0.875rem;
		border: 1px solid rgba(233, 30, 99, 0.05);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
		margin-top: 0.5rem;
	}

	.action-card-profile {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.instructor-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: #fce4ec;
		color: #e91e63;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.8125rem;
	}

	.instructor-info {
		display: flex;
		flex-direction: column;
	}

	.instructor-name {
		font-size: 0.8125rem;
		color: #1f2937;
	}

	.instructor-dept {
		font-size: 0.6875rem;
		color: #9ca3af;
	}

	.decision-badge.approved {
		background: rgba(16, 185, 129, 0.1);
		color: #047857;
		border: 1.5px solid #10b981;
		font-size: 0.75rem;
		font-weight: 800;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		letter-spacing: 0.05em;
	}

	.animate-stamp {
		animation: stampBadge 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
	}

	@keyframes stampBadge {
		0% {
			transform: scale(3) rotate(-15deg);
			opacity: 0;
		}
		100% {
			transform: scale(1) rotate(-5deg);
			opacity: 1;
		}
	}

	/* 4. Instant QR Claim Mockup */
	.mockup-qr-claim {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.phone-mockup-frame {
		width: 200px;
		height: 370px;
		border-radius: 2rem;
		background: #0f172a;
		border: 6px solid #1e293b;
		box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.phone-screen {
		flex: 1;
		background: #ffffff;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.phone-header-notch {
		width: 100px;
		height: 16px;
		background: #1e293b;
		border-bottom-left-radius: 12px;
		border-bottom-right-radius: 12px;
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
	}

	.phone-app-bar {
		background: #fff;
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
		padding: 1.5rem 1rem 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		color: #e91e63;
	}

	.phone-title {
		font-size: 0.8125rem;
		color: #111827;
	}

	.phone-body {
		flex: 1;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.phone-instruction {
		font-size: 0.6875rem;
		color: #6b7280;
		margin: 0 0 1rem;
		line-height: 1.3;
	}

	.phone-qr-container {
		width: 120px;
		height: 120px;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		background: #f8fafc;
		border-radius: 0.75rem;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
		margin-bottom: 1rem;
	}

	.phone-qr-corner {
		position: absolute;
		width: 10px;
		height: 10px;
		border: 2px solid #e91e63;
	}

	.phone-qr-corner.top-left { top: 0; left: 0; border-right: none; border-bottom: none; border-top-left-radius: 4px; }
	.phone-qr-corner.top-right { top: 0; right: 0; border-left: none; border-bottom: none; border-top-right-radius: 4px; }
	.phone-qr-corner.bottom-left { bottom: 0; left: 0; border-right: none; border-top: none; border-bottom-left-radius: 4px; }
	.phone-qr-corner.bottom-right { bottom: 0; right: 0; border-left: none; border-top: none; border-bottom-right-radius: 4px; }

	.phone-qr-graphic {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		width: 80px;
		height: 80px;
	}

	.qr-cell {
		background: rgba(0, 0, 0, 0.03);
		border-radius: 2px;
	}

	.qr-cell.filled {
		background: #111827;
	}

	.phone-qr-scanline {
		position: absolute;
		left: 4px;
		right: 4px;
		height: 3px;
		background: linear-gradient(to right, transparent, #e91e63, transparent);
		box-shadow: 0 0 8px #e91e63;
		animation: scan-mobile 2.5s infinite linear;
	}

	@keyframes scan-mobile {
		0% { top: 8px; }
		50% { top: calc(100% - 10px); }
		100% { top: 8px; }
	}

	.phone-verified-status {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.2);
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
	}

	.pulse-dot-green {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #10b981;
		animation: pulse-green 1.5s infinite ease-in-out;
	}

	@keyframes pulse-green {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.4); opacity: 0.5; }
	}

	.verified-text {
		font-size: 0.6875rem;
		color: #047857;
	}

	/* 5. Live Updates Mockup */
	.mockup-updates {
		width: 100%;
	}

	.updates-stack {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.update-notification {
		display: flex;
		gap: 0.875rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.03),
					0 4px 10px -3px rgba(0, 0, 0, 0.02);
		border-radius: 0.875rem;
		padding: 0.875rem 1rem;
		transition: all 0.3s ease;
	}

	.update-notification.pulse-border-pink {
		border-color: rgba(233, 30, 99, 0.3);
		animation: pulse-pink-border 2s infinite ease-in-out;
	}

	@keyframes pulse-pink-border {
		0%, 100% { box-shadow: 0 4px 15px rgba(233, 30, 99, 0.05); }
		50% { box-shadow: 0 4px 20px rgba(233, 30, 99, 0.15); border-color: rgba(233, 30, 99, 0.5); }
	}

	.notification-icon-wrap {
		width: 36px;
		height: 36px;
		min-width: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notification-icon-wrap.pink { background: rgba(233, 30, 99, 0.08); color: #e91e63; }
	.notification-icon-wrap.blue { background: rgba(59, 130, 246, 0.08); color: #3b82f6; }
	.notification-icon-wrap.orange { background: rgba(249, 115, 22, 0.08); color: #f97316; }

	.notification-body {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		gap: 0.125rem;
	}

	.notification-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.notification-title {
		font-size: 0.8125rem;
		color: #1f2937;
	}

	.notification-time {
		font-size: 0.6875rem;
		color: #9ca3af;
	}

	.notification-text {
		font-size: 0.75rem;
		color: #4b5563;
		margin: 0;
		line-height: 1.3;
	}

	/* Accordion Styles (Mobile/Tablet) */
	.mobile-preview-drawer {
		display: none;
		width: 100%;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(233, 30, 99, 0.05);
		border-radius: 0.75rem;
		padding: 1.5rem;
		margin-top: 0.5rem;
		box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.01);
		animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Animations */
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.animate-fade-in {
		animation: fadeIn 0.4s ease-out forwards;
	}

	/* Responsive Media Queries */
	@media (max-width: 1024px) {
		.features-split-container {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.features-preview-pane {
			display: none; /* Hide desktop side panel */
		}

		.mobile-preview-drawer {
			display: block; /* Show inline drawer */
		}

		.feature-row-card.active {
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
			margin-bottom: -0.5rem;
		}
	}

	@media (max-width: 640px) {
		.feature-row-card {
			padding: 1.25rem;
			gap: 1rem;
		}

		.feature-card-icon-container {
			width: 40px;
			height: 40px;
			min-width: 40px;
		}

		.mobile-preview-drawer {
			padding: 1rem;
		}
		
		.mockup-catalog-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
		
		.phone-mockup-frame {
			width: 180px;
			height: 330px;
		}
	}

	/* Animated Background Orbs */
	.features-bg {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
	}

	.bg-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.15;
		animation: float-orb 20s ease-in-out infinite;
	}

	.orb-1 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, rgba(233, 30, 99, 0.4), transparent);
		top: -10%;
		left: -5%;
		animation-delay: 0s;
	}

	.orb-2 {
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, rgba(156, 39, 176, 0.3), transparent);
		bottom: -15%;
		right: -10%;
		animation-delay: 7s;
	}

	.orb-3 {
		width: 350px;
		height: 350px;
		background: radial-gradient(circle, rgba(59, 130, 246, 0.25), transparent);
		top: 40%;
		left: 50%;
		animation-delay: 14s;
	}

	@keyframes float-orb {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(30px, -30px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
	}

	@media (max-width: 768px) {
		.orb-1,
		.orb-2,
		.orb-3 {
			width: 250px;
			height: 250px;
		}
	}

	/* Footer */
	.site-footer {
		border-top: 1px solid rgba(233, 30, 99, 0.08);
		padding: 3rem 1.5rem;
		background: linear-gradient(to bottom, #ffffff 0%, #fff7f9 100%);
		position: relative;
	}
	.footer-wrap {
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1.5rem;
	}
	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 1.1rem;
		font-weight: 800;
		color: #1a0a12;
	}
	.footer-logo {
		width: 32px;
		height: 32px;
		transition: transform 0.3s ease;
	}
	.footer-brand:hover .footer-logo {
		transform: rotate(15deg) scale(1.1);
	}
	.footer-links {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
	}
	.footer-link {
		color: #4b5563;
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.2s ease, transform 0.2s ease;
	}
	.footer-link:hover {
		color: #e91e63;
		transform: translateY(-1px);
	}
	.footer-copy {
		font-size: 0.8125rem;
		color: #9ca3af;
		margin: 0;
	}
	.mx {
		color: rgba(233, 30, 99, 0.15);
		font-weight: bold;
		user-select: none;
	}

	/* ══════════════════════════════════════════════════════════════
	   SMART TECH SECTION STYLES - Futuristic & Startup-Grade
	   ══════════════════════════════════════════════════════════════ */

	.smart-tech-section {
		background: #ffffff;
		padding: 10rem 1.5rem 8rem;
		overflow: hidden;
		position: relative;
	}

	.smart-tech-container {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr;
		gap: 2.5rem;
		align-items: center;
		margin-top: 5rem;
		position: relative;
		z-index: 2;
	}

	.smart-wing {
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
	}

	/* Overlapping staggered effects on desktop */
	.left-wing .smart-feature-card:nth-child(1) { transform: translate(15px, -15px); }
	.left-wing .smart-feature-card:nth-child(2) { transform: translate(-10px, 0); }
	.left-wing .smart-feature-card:nth-child(3) { transform: translate(15px, 15px); }

	.right-wing .smart-feature-card:nth-child(1) { transform: translate(-15px, -15px); }
	.right-wing .smart-feature-card:nth-child(2) { transform: translate(10px, 0); }
	.right-wing .smart-feature-card:nth-child(3) { transform: translate(-15px, 15px); }

	.smart-feature-card {
		background: rgba(255, 255, 255, 0.45);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.6);
		border-radius: 1.25rem;
		padding: 1.5rem;
		display: flex;
		gap: 1.25rem;
		cursor: pointer;
		transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.03),
					inset 0 1px 1px rgba(255, 255, 255, 0.8);
	}

	.smart-feature-card:hover {
		background: rgba(255, 255, 255, 0.85);
		border-color: rgba(233, 30, 99, 0.2);
		transform: scale(1.03) translateY(-4px) !important;
		box-shadow: 0 20px 40px -15px rgba(233, 30, 99, 0.1);
	}

	.smart-feature-card.active {
		background: #ffffff;
		border-color: #e91e63;
		box-shadow: 0 25px 50px -12px rgba(233, 30, 99, 0.15),
					0 0 0 1px rgba(233, 30, 99, 0.05);
	}

	.smart-card-icon-wrap {
		width: 44px;
		height: 44px;
		min-width: 44px;
		border-radius: 50%;
		background: rgba(233, 30, 99, 0.05);
		color: #e91e63;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}

	.smart-feature-card:hover .smart-card-icon-wrap {
		transform: rotate(10deg) scale(1.05);
	}

	.smart-feature-card.active .smart-card-icon-wrap {
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.25);
	}

	.smart-card-text {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
	}

	.smart-card-title {
		font-size: 1rem;
		color: #1a0a12;
		margin: 0;
	}

	.smart-card-desc {
		font-size: 0.8125rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.4;
	}

	/* Central Hub - Phone/Laptop console mockup */
	.smart-center-hub {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding: 2rem 0;
	}

	.smart-glowing-blob {
		position: absolute;
		width: 250px;
		height: 250px;
		background: radial-gradient(circle, rgba(233, 30, 99, 0.3) 0%, transparent 70%);
		filter: blur(40px);
		animation: float-glowing-blob 8s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
	}

	@keyframes float-glowing-blob {
		0%, 100% { transform: scale(1) translate(0, 0); }
		50% { transform: scale(1.2) translate(10px, -20px); }
	}

	.smart-console-frame {
		width: 100%;
		max-width: 380px;
		background: rgba(255, 255, 255, 0.7);
		backdrop-filter: blur(25px);
		-webkit-backdrop-filter: blur(25px);
		border: 1px solid rgba(255, 255, 255, 0.8);
		border-radius: 1.75rem;
		box-shadow: 0 35px 70px -15px rgba(233, 30, 99, 0.15),
					inset 0 1px 0 rgba(255, 255, 255, 0.6);
		overflow: hidden;
		z-index: 1;
	}

	.console-glass-header {
		background: rgba(255, 255, 255, 0.5);
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		padding: 0.875rem 1.25rem;
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.console-actions {
		display: flex;
		gap: 0.375rem;
	}

	.console-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	.console-dot.red { background: #ff5f56; }
	.console-dot.yellow { background: #ffbd2e; }
	.console-dot.green { background: #27c93f; }

	.console-title {
		font-size: 0.6875rem;
		color: #9ca3af;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.console-glass-body {
		padding: 2rem;
		min-height: 380px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Smart Mockups Visual details */
	.smart-mockup-view {
		width: 100%;
	}

	/* AI chat visual details */
	.mockup-ai-chat {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.smart-chat-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.04);
		padding-bottom: 0.75rem;
	}

	.smart-bot-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.smart-bot-avatar .active-dot {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981;
		border: 1.5px solid white;
	}

	.smart-bot-info {
		display: flex;
		flex-direction: column;
	}

	.smart-bot-name {
		font-size: 0.8125rem;
		color: #1f2937;
		line-height: 1.2;
	}

	.smart-bot-status {
		font-size: 0.6875rem;
		color: #9ca3af;
	}

	.smart-chat-body {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.smart-msg {
		font-size: 0.75rem;
		line-height: 1.4;
		padding: 0.625rem 0.875rem;
		border-radius: 0.875rem;
		max-width: 85%;
	}

	.smart-msg.user {
		align-self: flex-end;
		background: rgba(233, 30, 99, 0.05);
		color: #880e4f;
		border-bottom-right-radius: 0.25rem;
		border: 1px solid rgba(233, 30, 99, 0.1);
	}

	.smart-msg.bot {
		align-self: flex-start;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.05);
		color: #374151;
		border-bottom-left-radius: 0.25rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
	}

	.msg-sparkle {
		color: #e91e63;
		margin-right: 0.25rem;
	}

	.smart-msg-typing {
		display: flex;
		gap: 4px;
		padding: 0.5rem;
		align-self: flex-start;
		background: rgba(0, 0, 0, 0.03);
		border-radius: 999px;
	}

	.smart-msg-typing span {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #e91e63;
		animation: typing-dots 1.4s infinite ease-in-out both;
	}

	.smart-msg-typing span:nth-child(2) { animation-delay: 0.2s; }
	.smart-msg-typing span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes typing-dots {
		0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
		40% { transform: scale(1); opacity: 1; }
	}

	.smart-chat-input {
		display: flex;
		gap: 0.625rem;
		align-items: center;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.05);
		border-radius: 999px;
		padding: 0.375rem 0.375rem 0.375rem 0.875rem;
	}

	.smart-chat-pill {
		flex: 1;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.smart-chat-send {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #e91e63;
		border: none;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	/* QR Code Mockup */
	.mockup-qr-scanner {
		display: flex;
		justify-content: center;
	}

	.scanner-glass-device {
		width: 220px;
		padding: 1.5rem;
		background: #ffffff;
		border-radius: 1.5rem;
		box-shadow: 0 15px 35px rgba(233, 30, 99, 0.06);
		border: 1px solid rgba(233, 30, 99, 0.05);
		position: relative;
	}

	.scanner-overlay-brackets {
		position: absolute;
		inset: 1rem;
		pointer-events: none;
	}

	.bracket {
		position: absolute;
		width: 14px;
		height: 14px;
		border: 2.5px solid #e91e63;
	}

	.bracket.tl { top: 0; left: 0; border-right: none; border-bottom: none; border-top-left-radius: 6px; }
	.bracket.tr { top: 0; right: 0; border-left: none; border-bottom: none; border-top-right-radius: 6px; }
	.bracket.bl { bottom: 0; left: 0; border-right: none; border-top: none; border-bottom-left-radius: 6px; }
	.bracket.br { bottom: 0; right: 0; border-left: none; border-top: none; border-bottom-right-radius: 6px; }

	.scanner-qr-graphic {
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		background: #fdfdfd;
		border-radius: 0.75rem;
	}

	:global(.qr-svg-glow) {
		color: #1a0a12;
		filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.05));
	}

	.scanner-laser-sweep {
		position: absolute;
		left: 0;
		right: 0;
		height: 2.5px;
		background: #ff4081;
		box-shadow: 0 0 12px #ff4081;
		animation: laser-sweep 2.5s infinite linear;
	}

	@keyframes laser-sweep {
		0% { top: 10px; }
		50% { top: calc(100% - 12px); }
		100% { top: 10px; }
	}

	.scanner-custodian-status {
		margin-top: 1rem;
	}

	.scan-pill {
		display: inline-block;
		background: rgba(233, 30, 99, 0.08);
		color: #e91e63;
		border-radius: 9999px;
		font-size: 0.6875rem;
		padding: 0.25rem 0.75rem;
		letter-spacing: 0.05em;
	}

	.scan-desc {
		font-size: 0.6875rem;
		color: #6b7280;
	}
	/* Mobile drawer style for smart mockups */
	.mobile-smart-preview {
		display: none;
		width: 100%;
		background: rgba(255, 255, 255, 0.65);
		border: 1px solid rgba(233, 30, 99, 0.05);
		border-radius: 1.25rem;
		padding: 1.5rem;
		margin: 0.5rem 0 1rem;
		box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.02);
		animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	/* Responsive Media Queries */
	@media (max-width: 1024px) {
		.smart-tech-container {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.smart-wing {
			gap: 1.25rem;
		}

		/* Reset transforms on mobile/tablet */
		.left-wing .smart-feature-card:nth-child(1),
		.left-wing .smart-feature-card:nth-child(2),
		.left-wing .smart-feature-card:nth-child(3),
		.right-wing .smart-feature-card:nth-child(1),
		.right-wing .smart-feature-card:nth-child(2),
		.right-wing .smart-feature-card:nth-child(3) {
			transform: none !important;
		}

		.smart-center-hub {
			display: none; /* Hide desktop side preview */
		}

		.mobile-smart-preview {
			display: block; /* Show inline drawers */
		}

		.smart-feature-card.active {
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
			margin-bottom: -0.5rem;
		}
	}

	@media (max-width: 640px) {
		.smart-tech-section {
			padding: 6rem 1.25rem 4rem;
		}

		.smart-feature-card {
			padding: 1.25rem;
			gap: 1rem;
		}

		.smart-card-icon-wrap {
			width: 40px;
			height: 40px;
			min-width: 40px;
		}

		.smart-console-frame {
			max-width: 320px;
		}

		.console-glass-body {
			padding: 1.25rem;
		}
	}

	/* Keyframes */
	@keyframes glow {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes bounce {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-8px);
		}
	}
	@keyframes dot {
		0%,
		80%,
		100% {
			transform: scale(0.6);
			opacity: 0.4;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* ══════════════════════════════════════════════════════════════
	   MODERN CAROUSEL - Stacked Card Design
	   ══════════════════════════════════════════════════════════════ */

	.flow-header {
		text-align: center;
		margin-bottom: 3.5rem;
		position: relative;
		z-index: 2;
	}

	.flow-heading {
		color: #1a0a12;
		font-size: clamp(2.5rem, 5vw, 4rem);
		margin-bottom: 0;
	}

	.carousel-container {
		position: relative;
		width: 100%;
		max-width: 1600px;
		margin: 0 auto;
		padding: 0 0 4rem;
		overflow: hidden;
	}

	.carousel-stacked-track {
		position: relative;
		height: 520px;
		width: 100%;
		max-width: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.carousel-slide-stacked {
		position: relative;
		height: 380px;
		width: 290px;
		transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);
		cursor: pointer;
		margin-left: -130px; /* Compress them heavily to overlap deeply */
		flex-shrink: 0;
	}

	.carousel-slide-stacked:first-child {
		margin-left: 0;
	}

	.carousel-slide-stacked.active {
		height: 480px;
		width: 390px;
		margin-left: -30px;
		margin-right: 30px;
		cursor: default;
	}

	/* Flow Card - Stacked Theme */
	.flow-card {
		position: relative;
		width: 100%;
		height: 100%;
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.1);
		border-radius: 1.5rem;
		padding: 2rem 1.5rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06);
		transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		overflow: hidden;
	}

	/* Active Card Styling */
	.carousel-slide-stacked.active .flow-card {
		background: linear-gradient(135deg, #e91e63, #c2185b);
		border-color: rgba(233, 30, 99, 0.3);
		box-shadow: 0 20px 50px rgba(233, 30, 99, 0.2);
		padding: 3.5rem 2.5rem;
	}

	.card-gradient {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at top right, rgba(233, 30, 99, 0.15) 0%, transparent 60%);
		border-radius: 1.5rem;
		pointer-events: none;
	}

	.card-number {
		position: absolute;
		top: 1.5rem;
		right: 1.5rem;
		font-size: 1.125rem;
		font-weight: 700;
		color: #9ca3af;
		letter-spacing: 0.05em;
		transition: color 0.4s ease;
	}

	.carousel-slide-stacked.active .card-number {
		color: rgba(255, 255, 255, 0.6);
	}

	.card-inner {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1.5rem;
		height: 100%;
		justify-content: center;
	}

	.flow-icon-wrapper {
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f9fafb;
		border-radius: 1rem;
		border: 1px solid #f3f4f6;
		transition: all 0.4s ease;
		margin-bottom: 1rem;
	}

	.carousel-slide-stacked.active .flow-icon-wrapper {
		width: 140px;
		height: 140px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.35);
		box-shadow:
			0 10px 40px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		border-radius: 50%;
	}

	.flow-card :global(.flow-icon) {
		color: #e91e63;
		transition: all 0.4s ease;
	}

	.carousel-slide-stacked.active .flow-card :global(.flow-icon) {
		color: #ffffff;
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
	}

	.flow-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
		margin: 0;
		letter-spacing: -0.015em;
		line-height: 1.2;
		transition: color 0.4s ease;
	}

	.carousel-slide-stacked.active .flow-title {
		font-size: 2rem;
		font-weight: 800;
		color: #ffffff;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
	}

	.flow-description {
		font-size: 0.9375rem;
		color: #4b5563;
		line-height: 1.6;
		margin: 0;
		max-width: 320px;
		transition: color 0.4s ease;
		opacity: 1;
	}

	.carousel-slide-stacked.active .flow-description {
		font-size: 1.0625rem;
		color: rgba(255, 255, 255, 0.8);
	}

	/* Navigation Buttons */
	.carousel-nav {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		display: flex;
		justify-content: space-between;
		padding: 0 2rem;
		pointer-events: none;
		z-index: 10;
	}

	.nav-btn {
		pointer-events: auto;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(233, 30, 99, 0.9), rgba(194, 24, 91, 0.9));
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 8px 24px rgba(233, 30, 99, 0.4);
	}

	.nav-btn:hover {
		transform: scale(1.1);
		box-shadow: 0 12px 32px rgba(233, 30, 99, 0.6);
		background: linear-gradient(135deg, rgba(244, 63, 94, 0.95), rgba(233, 30, 99, 0.95));
	}

	.nav-btn:active {
		transform: scale(0.95);
	}

	/* Carousel Dots */
	.carousel-dots {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 3rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: all 0.3s ease;
		padding: 0;
	}

	.dot:hover {
		background: rgba(233, 30, 99, 0.5);
		transform: scale(1.2);
	}

	.dot.active {
		width: 32px;
		border-radius: 5px;
		background: linear-gradient(90deg, #e91e63, #f43f5e);
		border-color: rgba(233, 30, 99, 0.5);
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.5);
	}

	/* Responsive Design */
	@media (max-width: 1024px) {
		.carousel-stacked-track {
			height: 440px;
		}

		.carousel-slide-stacked {
			width: 220px;
			height: 320px;
			margin-left: -90px;
		}

		.carousel-slide-stacked.active {
			width: 320px;
			height: 420px;
			margin-left: -20px;
			margin-right: 20px;
		}

		.flow-card {
			padding: 1.5rem 1.25rem;
		}

		.flow-icon-wrapper {
			width: 80px;
			height: 80px;
		}

		.flow-card :global(.flow-icon) {
			width: 40px;
			height: 40px;
		}

		.flow-title {
			font-size: 1.25rem;
		}

		.carousel-slide-stacked.active .flow-title {
			font-size: 1.75rem;
		}
	}

	@media (max-width: 768px) {
		.carousel-stacked-track {
			flex-direction: column;
			height: auto;
			padding: 0 5%;
			gap: 1.5rem;
		}

		.carousel-slide-stacked,
		.carousel-slide-stacked.active {
			position: relative;
			top: auto !important;
			bottom: auto !important;
			left: auto !important;
			width: 100% !important;
			height: auto !important;
			min-height: 280px;
			margin-left: 0 !important;
			margin-right: 0 !important;
			transform: none !important;
			opacity: 1 !important;
			pointer-events: none; /* Disable click-to-activate on mobile */
		}

		/* Reset active styling so they all look uniform on mobile vertical feed */
		.carousel-slide-stacked .flow-card {
			background: #ffffff !important;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05) !important;
			padding: 2rem 1.5rem !important;
			border-color: rgba(233, 30, 99, 0.1) !important;
		}

		.carousel-slide-stacked .card-number {
			color: #9ca3af !important;
		}

		.carousel-slide-stacked .flow-title {
			color: #111827 !important;
			font-size: 1.5rem !important;
			text-shadow: none !important;
		}

		.carousel-slide-stacked .flow-description {
			color: #4b5563 !important;
			font-size: 0.9375rem !important;
		}

		.carousel-slide-stacked .flow-icon-wrapper {
			background: #f9fafb !important;
			border: 1px solid #f3f4f6 !important;
			width: 80px !important;
			height: 80px !important;
			box-shadow: none !important;
			margin-bottom: 1rem;
		}

		.carousel-slide-stacked .flow-card :global(.flow-icon) {
			filter: none !important;
			width: 40px !important;
			height: 40px !important;
		}

		.carousel-nav {
			display: none;
		}

		.carousel-dots {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.flow-section {
			padding-bottom: 4rem;
		}

		.carousel-stacked-track {
			padding: 0 2%;
		}
	}
</style>
