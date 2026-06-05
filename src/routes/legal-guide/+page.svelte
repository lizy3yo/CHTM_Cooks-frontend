<script lang="ts">
	import logo from '$lib/assets/CHTM_LOGO.png';

	const currentYear = new Date().getFullYear();

	// State for Touchpoint A: Onboarding
	let agreedToTerms = $state(false);
	let registrationSubmitted = $state(false);
	let registrationError = $state(false);

	function submitRegistration() {
		registrationSubmitted = true;
		if (!agreedToTerms) {
			registrationError = true;
			setTimeout(() => {
				registrationError = false;
				registrationSubmitted = false;
			}, 3000);
		} else {
			registrationError = false;
			setTimeout(() => {
				alert('Mock Registration Successful! (Touchpoint A Verified)');
				registrationSubmitted = false;
				agreedToTerms = false;
			}, 500);
		}
	}

	// State for Touchpoint B: Just-in-Time Notices
	let locationGranted = $state(false);
	let showLocationNotice = $state(false);
	let uploadSuccess = $state(false);
	let showUploadNotice = $state(false);

	function requestLocation() {
		locationGranted = true;
		setTimeout(() => {
			alert('Mock Location Access Granted! (Touchpoint B Verified)');
			locationGranted = false;
		}, 600);
	}

	function triggerUpload() {
		uploadSuccess = true;
		setTimeout(() => {
			alert('Mock ID Uploaded Securely! (Touchpoint B Verified)');
			uploadSuccess = false;
		}, 800);
	}

	// State for Touchpoint C: Persistent Access (Layout Switcher)
	let activeLayoutMode = $state<'web' | 'mobile'>('web');

	// Sidebar tracking active tab
	let activeTab = $state<'overview' | 'touchpoint-a' | 'touchpoint-b' | 'touchpoint-c' | 'ph-compliance'>('overview');

	function switchTab(tab: typeof activeTab) {
		activeTab = tab;
		const element = document.getElementById(tab);
		if (element) {
			const offset = 100;
			const bodyRect = document.body.getBoundingClientRect().top;
			const elementRect = element.getBoundingClientRect().top;
			const elementPosition = elementRect - bodyRect;
			const offsetPosition = elementPosition - offset;

			window.scrollTo({
				top: offsetPosition,
				behavior: 'smooth'
			});
		}
	}
</script>

<svelte:head>
	<title>Legal Design Guide · CHTM Cooks</title>
	<meta name="description" content="Design Implementation Guide for displaying Privacy Policies and Terms & Conditions at critical user touchpoints." />
</svelte:head>

<div class="guide-page-root">
	<!-- Decorative Background Gradients -->
	<div class="glow-orb orb-1"></div>
	<div class="glow-orb orb-2"></div>

	<!-- Sticky Header -->
	<header class="guide-header">
		<div class="header-content">
			<button type="button" class="back-home-btn group" onclick={() => history.back()} aria-label="Back">
				<svg class="arrow-icon group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
				</svg>
				Back
			</button>
			<div class="brand-badge">
				<img src={logo} alt="CHTM Logo" class="brand-logo" />
				<span>CHTM Cooks</span>
			</div>
		</div>
	</header>

	<div class="guide-content-wrap">
		<!-- Hero Section -->
		<div class="hero-section">
			<span class="category-tag">UX/UI & Compliance Guide</span>
			<h1>Legal Design Implementation Guide</h1>
			<p class="hero-desc">
				How to professionally integrate Privacy Policies and Terms of Service into CHTM Cooks web and mobile touchpoints to ensure legal compliance and build user trust.
			</p>
		</div>

		<div class="guide-layout-grid">
			<!-- Main Content -->
			<main class="guide-body">
				
				<!-- Section 1: Overview -->
				<section id="overview" class="guide-section">
					<h2>Executive Summary</h2>
					<p>
						Modern privacy regulations (including the Philippine Data Privacy Act of 2012) require that legal documents are not merely hidden in a footer. Applications must actively present terms and policies to users at critical interaction points. 
					</p>
					<p>
						This guide outlines the **three (3) critical touchpoints** that must be implemented in the CHTM Cooks ecosystem (both web and future mobile applications) to ensure compliance, transparency, and a premium, friction-free user experience.
					</p>
					
					<div class="overview-cards-grid">
						<div class="overview-card" onclick={() => switchTab('touchpoint-a')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && switchTab('touchpoint-a')}>
							<div class="card-num-badge">A</div>
							<h3>Onboarding & Sign-up</h3>
							<p>Provide explicit, individual legal check-ins near registration actions.</p>
						</div>
						<div class="overview-card" onclick={() => switchTab('touchpoint-b')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && switchTab('touchpoint-b')}>
							<div class="card-num-badge">B</div>
							<h3>Just-in-Time Notices</h3>
							<p>Explain data collection exactly when asking for sensitive details or permissions.</p>
						</div>
						<div class="overview-card" onclick={() => switchTab('touchpoint-c')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && switchTab('touchpoint-c')}>
							<div class="card-num-badge">C</div>
							<h3>Persistent Access</h3>
							<p>Ensure documents remain accessible at all times through menus and footers.</p>
						</div>
					</div>
				</section>

				<hr class="section-divider" />

				<!-- Touchpoint A -->
				<section id="touchpoint-a" class="guide-section">
					<div class="section-badge">Touchpoint A</div>
					<h2>Onboarding & Sign-up Consent</h2>
					<p>
						When creating an account, users must explicitly agree to the Terms of Service and acknowledge the Privacy Policy. Links must be clear, individual (not grouped under a single link), and positioned directly adjacent to the registration button.
					</p>
					
					<div class="demo-wrapper">
						<div class="demo-info">
							<h4>Live Interactive Sandbox</h4>
							<p>Test the registration consent validation. Attempt to register with and without checking the compliance flags.</p>
						</div>
						
						<!-- Interactive Mock Sign Up -->
						<div class="mock-container">
							<div class="mock-device-header">
								<span class="mock-dots"><span></span><span></span><span></span></span>
								<span class="mock-title">Registration Form</span>
							</div>
							<div class="mock-card-body">
								<div class="form-group">
									<label for="mock-email">Institutional Email</label>
									<input type="text" id="mock-email" value="student.delacruz@gordoncollege.edu.ph" disabled class="mock-input" />
								</div>
								<div class="form-group">
									<label for="mock-pass">Password</label>
									<input type="password" id="mock-pass" value="••••••••••••" disabled class="mock-input" />
								</div>
								
								<!-- Legal check-in block (Touchpoint A) -->
								<div class="compliance-checkbox-block" class:has-error={registrationError}>
									<label class="mock-checkbox-label">
										<input type="checkbox" bind:checked={agreedToTerms} class="mock-checkbox" />
										<span class="checkbox-text">
											I agree to the 
											<a href="/terms" target="_blank" class="accent-link">Terms and Conditions</a> 
											and acknowledge the 
											<a href="/privacy" target="_blank" class="accent-link">Privacy Policy</a>.
											<span class="required-star">*</span>
										</span>
									</label>
									{#if registrationError}
										<div class="error-tooltip">
											<svg class="error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
											</svg>
											You must agree to the terms to proceed.
										</div>
									{/if}
								</div>

								<button class="mock-submit-btn" onclick={submitRegistration}>
									{registrationSubmitted ? 'Processing...' : 'Create Account'}
								</button>
							</div>
						</div>
					</div>

					<div class="ux-rules-box">
						<h4>UX Requirements for Touchpoint A:</h4>
						<ul>
							<li><strong>No Pre-checked Checkboxes:</strong> The checkbox must default to empty. Forced consent must be active.</li>
							<li><strong>Individual Links:</strong> The labels must link directly to the specific documents, opening in a new tab or modal.</li>
							<li><strong>Disable/Block Actions:</strong> Form submissions must trigger validation warnings if consent is unchecked.</li>
						</ul>
					</div>
				</section>

				<hr class="section-divider" />

				<!-- Touchpoint B -->
				<section id="touchpoint-b" class="guide-section">
					<div class="section-badge">Touchpoint B</div>
					<h2>Point of Collection (Just-in-Time Notices)</h2>
					<p>
						Do not wait for users to search the Privacy Policy. Whenever the application requests sensitive data (such as GPS locations, cameras for scanning, or government student IDs), a contextual notice explaining <strong>why</strong> it is collected and a link to the policy must be shown.
					</p>

					<div class="demo-wrapper">
						<div class="demo-info">
							<h4>Live Interactive Sandbox</h4>
							<p>Hover over or click the information tooltips to see how contextual compliance disclosures are presented inline.</p>
						</div>

						<div class="jit-demos-grid">
							<!-- Demo 1: Location Access -->
							<div class="jit-demo-card">
								<div class="jit-card-header">
									<svg class="jit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									<div>
										<h4>Enable Location Pickup</h4>
										<p class="subtext">Identify nearest laboratory hubs</p>
									</div>
								</div>
								
								<div class="jit-action-row">
									<button class="jit-action-btn" onclick={requestLocation}>
										{locationGranted ? 'Accessing...' : 'Grant GPS Access'}
									</button>
									
									<!-- Info trigger for just-in-time notification -->
									<div class="tooltip-container">
										<button 
											class="info-trigger-btn"
											onmouseenter={() => showLocationNotice = true}
											onmouseleave={() => showLocationNotice = false}
											onclick={() => showLocationNotice = !showLocationNotice}
											aria-label="Explain location usage"
										>?</button>
										
										{#if showLocationNotice}
											<div class="jit-popup-tooltip animate-scaleIn">
												<p>We process your location to find kitchen pickup lockers nearby. Location data is temporary and not stored. <a href="/privacy" class="accent-link">Read our Privacy Policy</a>.</p>
											</div>
										{/if}
									</div>
								</div>
							</div>

							<!-- Demo 2: File Upload Notice -->
							<div class="jit-demo-card">
								<div class="jit-card-header">
									<svg class="jit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									<div>
										<h4>Gordon College ID Verification</h4>
										<p class="subtext">Required for borrowing culinary utensils</p>
									</div>
								</div>

								<div class="jit-upload-area" onclick={triggerUpload} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && triggerUpload()}>
									<svg class="upload-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
									<span>{uploadSuccess ? 'ID Verified!' : 'Drag or click to upload Student ID'}</span>
								</div>
								
								<!-- Inline Just-in-Time Notice (Touchpoint B) -->
								<div class="jit-inline-notice">
									<svg class="lock-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
									</svg>
									<p>IDs are encrypted and audited only by laboratory registrars. <a href="/privacy" class="accent-link">See Verification Terms</a>.</p>
								</div>
							</div>
						</div>
					</div>

					<div class="ux-rules-box">
						<h4>UX Requirements for Touchpoint B:</h4>
						<ul>
							<li><strong>Contextual Relevance:</strong> Notice triggers must sit right next to input elements, permissions buttons, or upload zones.</li>
							<li><strong>Clarity:</strong> Concisely outline specifically what happens to that specific item of data, rather than referencing general terms.</li>
							<li><strong>Direct Link:</strong> Include a direct hyperlink to the section of the Privacy Policy explaining that category of data collection.</li>
						</ul>
					</div>
				</section>

				<hr class="section-divider" />

				<!-- Touchpoint C -->
				<section id="touchpoint-c" class="guide-section">
					<div class="section-badge">Touchpoint C</div>
					<h2>Persistent Access</h2>
					<p>
						Legal documents must remain persistently accessible at all times throughout the application. 
						For Web layouts, these links belong in the global footer. For Mobile applications, they must reside within settings, profile, or the "About" navigation.
					</p>

					<div class="demo-wrapper">
						<div class="layout-toggle-bar">
							<span class="toggle-title">Select Platform Mockup:</span>
							<button class="toggle-btn" class:active={activeLayoutMode === 'web'} onclick={() => activeLayoutMode = 'web'}>Web Layout (Footer)</button>
							<button class="toggle-btn" class:active={activeLayoutMode === 'mobile'} onclick={() => activeLayoutMode = 'mobile'}>Mobile Layout (Settings)</button>
						</div>

						<div class="persistent-demo-viewport">
							{#if activeLayoutMode === 'web'}
								<!-- Mock Web Footer Layout -->
								<div class="mock-web-footer-demo animate-scaleIn">
									<div class="footer-top-row">
										<div class="footer-logo-brand">
											<img src={logo} alt="CHTM Logo" />
											<span>CHTM Cooks</span>
										</div>
										<div class="footer-demo-links">
											<a href="/privacy" target="_blank" class="accent-link">Privacy Policy</a>
											<span class="dot-sep">·</span>
											<a href="/terms" target="_blank" class="accent-link">Terms &amp; Conditions</a>
											<span class="dot-sep">·</span>
											<a href="/legal-guide" target="_blank" class="accent-link">Legal Design Guide</a>
										</div>
									</div>
									<div class="footer-bottom-row">
										<p>© {currentYear} CHTM Cooks · Gordon College College of Hospitality & Tourism Management</p>
									</div>
								</div>
							{:else}
								<!-- Mock Mobile Screen -->
								<div class="mock-mobile-device animate-scaleIn">
									<div class="mobile-status-bar">
										<span class="time">9:41 AM</span>
										<span class="symbols">📶 🔋</span>
									</div>
									<div class="mobile-nav-bar">
										<span class="nav-title">Settings</span>
									</div>
									<div class="mobile-list-group">
										<div class="list-header">Profile & Account</div>
										<div class="list-item"><span>User Profile</span> <span class="arrow">›</span></div>
										<div class="list-item"><span>Borrow Restrictions</span> <span class="arrow">›</span></div>
										
										<div class="list-header">Privacy & Terms</div>
										<a href="/privacy" target="_blank" class="list-item clickable">
											<span>Privacy Policy</span>
											<span class="arrow-pink">›</span>
										</a>
										<a href="/terms" target="_blank" class="list-item clickable">
											<span>Terms &amp; Conditions</span>
											<span class="arrow-pink">›</span>
										</a>
										<a href="/legal-guide" target="_blank" class="list-item clickable">
											<span>Legal Design Guide</span>
											<span class="arrow-pink">›</span>
										</a>

										<div class="list-header">App Info</div>
										<div class="list-item"><span>Version</span> <span class="badge">v2.1.0</span></div>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<div class="ux-rules-box">
						<h4>UX Requirements for Touchpoint C:</h4>
						<ul>
							<li><strong>Footer Placement:</strong> For desktop/web, links should be styled cleanly in standard font weight, located in the primary site footer, and visible on all pages.</li>
							<li><strong>Mobile Drawer:</strong> On small devices and mobile screens, place links in "Settings" or "About" tabs within three navigation taps from the home screen.</li>
							<li><strong>No Obscurity:</strong> The legal links should not be hidden behind collapsed toggles or obscure icons.</li>
						</ul>
					</div>
				</section>

				<hr class="section-divider" />

				<!-- Philippines Compliance Notes -->
				<section id="ph-compliance" class="guide-section">
					<h2>Philippine Data Privacy Compliance (RA 10173)</h2>
					<p>
						In the Philippines, the National Privacy Commission (NPC) strictly enforces the **Data Privacy Act of 2012**. For educational and institutional applications like CHTM Cooks, the following mandates must be satisfied:
					</p>
					
					<div class="compliance-grid">
						<div class="comp-box">
							<h5>Data Protection Officer (DPO)</h5>
							<p>Every organization processing personal information must designate a DPO. Their contact details must be explicitly listable in the privacy section (DPO name, email, physical address).</p>
						</div>
						<div class="comp-box">
							<h5>Data Subject Rights</h5>
							<p>Users must have accessible methods to exercise their rights, including accessing their borrowing history logs, editing profile details, or deleting accounts.</p>
						</div>
						<div class="comp-box">
							<h5>Breach Reporting</h5>
							<p>Under NPC Circular 16-03, any breach exposing sensitive credentials must be reported to the NPC and affected users within 72 hours of discovery.</p>
						</div>
					</div>
				</section>
			</main>

			<!-- Sticky Navigation Drawer -->
			<aside class="guide-sidebar">
				<div class="toc-container">
					<div class="toc-header">
						<h3>Guide Chapters</h3>
					</div>
					<nav class="toc-nav" aria-label="Table of Contents">
						<button class:active={activeTab === 'overview'} onclick={() => switchTab('overview')}>Executive Summary</button>
						<button class:active={activeTab === 'touchpoint-a'} onclick={() => switchTab('touchpoint-a')}>Touchpoint A: Sign-up</button>
						<button class:active={activeTab === 'touchpoint-b'} onclick={() => switchTab('touchpoint-b')}>Touchpoint B: JIT Notices</button>
						<button class:active={activeTab === 'touchpoint-c'} onclick={() => switchTab('touchpoint-c')}>Touchpoint C: Persistence</button>
						<button class:active={activeTab === 'ph-compliance'} onclick={() => switchTab('ph-compliance')}>RA 10173 Compliance</button>
					</nav>
				</div>
			</aside>
		</div>
	</div>

	<!-- Simple Page Footer -->
	<footer class="guide-footer">
		<p>© {currentYear} CHTM Cooks · College of Hospitality & Tourism Management · Gordon College</p>
	</footer>
</div>

<style>
	/* Page Structure */
	.guide-page-root {
		min-height: 100vh;
		background-color: #ffffff;
		color: var(--color-gray-900, #212121);
		font-family: var(--font-primary, "Google Sans", sans-serif);
		position: relative;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Glowing Background Orbs */
	.glow-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);
		opacity: 0.12;
		pointer-events: none;
		z-index: 0;
	}
	.orb-1 {
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, var(--color-primary-300, #f06292), transparent);
		top: -100px;
		right: -100px;
	}
	.orb-2 {
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, var(--color-rose-300, #fda4af), transparent);
		bottom: 150px;
		left: -150px;
	}

	/* Sticky Header */
	.guide-header {
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(233, 30, 99, 0.06);
		position: sticky;
		top: 0;
		z-index: 50;
		height: 70px;
		display: flex;
		align-items: center;
	}
	.header-content {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.back-home-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-gray-600, #757575);
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 600;
		transition: color 0.2s ease;
	}
	.back-home-btn:hover {
		color: var(--color-primary-500, #e91e63);
	}
	.arrow-icon {
		width: 18px;
		height: 18px;
		transition: transform 0.2s ease;
	}
	.brand-badge {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-weight: 800;
		font-size: 1rem;
		color: #1a0a12;
	}
	.brand-logo {
		width: 32px;
		height: 32px;
	}

	/* Page Contents Wrapper */
	.guide-content-wrap {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 4rem 1.5rem;
		flex-grow: 1;
		position: relative;
		z-index: 1;
	}

	/* Hero Section */
	.hero-section {
		margin-bottom: 3.5rem;
		max-width: 800px;
	}
	.category-tag {
		background: var(--color-primary-50, #fce4ec);
		color: var(--color-primary-700, #c2185b);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.35rem 0.85rem;
		border-radius: 9999px;
		display: inline-block;
		margin-bottom: 1rem;
	}
	.hero-section h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 900;
		color: #1a0a12;
		margin: 0 0 1rem;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}
	.hero-desc {
		font-size: 1.15rem;
		line-height: 1.6;
		color: #4b5563;
		margin: 0;
	}

	/* Grid Design */
	.guide-layout-grid {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 4rem;
		align-items: start;
	}

	/* Sidebar Chapter Navigator */
	.guide-sidebar {
		position: sticky;
		top: 86px; /* 70px header + 16px breathing room */
		max-height: calc(100vh - 110px);
		display: flex;
		flex-direction: column;
	}
	.toc-container {
		background: rgba(255, 255, 255, 0.82);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(233, 30, 99, 0.08);
		border-radius: 20px;
		padding: 1.5rem;
		box-shadow: 0 8px 32px rgba(233, 30, 99, 0.04), 0 1px 3px rgba(0,0,0,0.04);
		display: flex;
		flex-direction: column;
		min-height: 0;
		max-height: calc(100vh - 110px);
		overflow: hidden;
	}
	.toc-header h3 {
		font-size: 0.95rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-gray-500, #9e9e9e);
		margin: 0 0 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-primary-50, #fce4ec);
	}
	.toc-nav {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		overflow-y: auto;
		padding-right: 0.25rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(233, 30, 99, 0.2) transparent;
	}
	.toc-nav::-webkit-scrollbar {
		width: 3px;
	}
	.toc-nav::-webkit-scrollbar-track {
		background: transparent;
	}
	.toc-nav::-webkit-scrollbar-thumb {
		background-color: rgba(233, 30, 99, 0.2);
		border-radius: 999px;
	}
	.toc-nav button {
		background: none;
		border: none;
		text-align: left;
		font-size: 0.9rem;
		color: var(--color-gray-600, #757575);
		line-height: 1.4;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		border-left: 2px solid transparent;
		font-family: inherit;
		width: 100%;
	}
	.toc-nav button:hover {
		color: var(--color-primary-600, #d81b60);
		background-color: var(--color-primary-50, #fce4ec);
	}
	.toc-nav button.active {
		color: var(--color-primary-800, #ad1457);
		background-color: var(--color-primary-100, #f8bbd0);
		font-weight: 700;
		border-left-color: var(--color-primary-600, #d81b60);
		padding-left: 0.85rem;
	}

	/* Main Body Layout */
	.guide-body {
		min-width: 0;
	}
	.guide-section {
		scroll-margin-top: 100px;
		position: relative;
	}
	.guide-section h2 {
		font-size: 1.75rem;
		font-weight: 800;
		color: #1a0a12;
		margin: 0 0 1rem;
		letter-spacing: -0.02em;
	}
	.guide-section p {
		font-size: 1rem;
		line-height: 1.7;
		color: #4b5563;
		margin: 0 0 1.5rem;
	}
	.section-badge {
		background: linear-gradient(135deg, #e91e63, #f43f5e);
		color: #ffffff;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.65rem;
		border-radius: 4px;
		display: inline-block;
		margin-bottom: 0.75rem;
		box-shadow: 0 2px 8px rgba(233, 30, 99, 0.2);
	}
	.section-divider {
		border: 0;
		height: 1px;
		background: linear-gradient(90deg, rgba(233, 30, 99, 0.08) 0%, rgba(233, 30, 99, 0.02) 100%);
		margin: 3.5rem 0;
	}

	/* Overview Bento Cards */
	.overview-cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1.25rem;
		margin-top: 2rem;
	}
	.overview-card {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.06);
		border-radius: 16px;
		padding: 1.5rem;
		box-shadow: 0 4px 15px rgba(233, 30, 99, 0.02);
		cursor: pointer;
		transition: all 0.25s ease;
		text-align: left;
		outline: none;
	}
	.overview-card:hover {
		transform: translateY(-3px);
		border-color: rgba(233, 30, 99, 0.15);
		box-shadow: 0 10px 25px rgba(233, 30, 99, 0.06);
	}
	.card-num-badge {
		width: 32px;
		height: 32px;
		background-color: var(--color-primary-50, #fce4ec);
		color: var(--color-primary-700, #c2185b);
		font-weight: 800;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		font-size: 0.95rem;
	}
	.overview-card h3 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: #1a0a12;
	}
	.overview-card p {
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--color-gray-600, #757575);
		margin: 0;
	}

	/* Interactive Sandbox / Sandbox Layout */
	.demo-wrapper {
		background: #fafafa;
		border: 1px solid rgba(0, 0, 0, 0.04);
		border-radius: 20px;
		padding: 1.5rem;
		margin: 1.5rem 0 2rem;
	}
	.demo-info {
		margin-bottom: 1.5rem;
	}
	.demo-info h4 {
		font-size: 0.95rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-primary-800, #ad1457);
		margin: 0 0 0.25rem;
	}
	.demo-info p {
		font-size: 0.875rem;
		color: var(--color-gray-600, #757575);
		margin: 0;
		line-height: 1.4;
	}

	/* Compliance Rules Callout Boxes */
	.ux-rules-box {
		background: linear-gradient(to right, #fff9fb, #fffbfd);
		border-left: 3px solid var(--color-primary-400, #ec407a);
		border-radius: 0 12px 12px 0;
		padding: 1.25rem;
		margin-top: 1.5rem;
	}
	.ux-rules-box h4 {
		font-size: 0.95rem;
		font-weight: 700;
		color: #1a0a12;
		margin: 0 0 0.5rem;
	}
	.ux-rules-box ul {
		margin: 0;
		padding-left: 1.25rem;
	}
	.ux-rules-box li {
		font-size: 0.875rem;
		color: #4b5563;
		line-height: 1.6;
		margin-bottom: 0.35rem;
	}

	/* --- TOUCHPOINT A INTERACTIVE MOCK --- */
	.mock-container {
		max-width: 380px;
		margin: 0 auto;
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.08);
		border-radius: 16px;
		box-shadow: 0 10px 25px rgba(233, 30, 99, 0.04);
		overflow: hidden;
	}
	.mock-device-header {
		background: #fdf6f8;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid rgba(233, 30, 99, 0.04);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.mock-dots {
		display: flex;
		gap: 0.25rem;
	}
	.mock-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: rgba(233, 30, 99, 0.2);
	}
	.mock-title {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-primary-800, #ad1457);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mock-card-body {
		padding: 1.5rem;
	}
	.form-group {
		margin-bottom: 1rem;
		text-align: left;
	}
	.form-group label {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		color: #1a0a12;
		margin-bottom: 0.35rem;
	}
	.mock-input {
		width: 100%;
		border: 1px solid #e5e7eb;
		background-color: #fafafa;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-size: 0.85rem;
		color: #9ca3af;
		box-sizing: border-box;
	}
	.compliance-checkbox-block {
		margin: 1.25rem 0;
		padding: 0.75rem;
		border-radius: 10px;
		background: #fffbfe;
		border: 1px solid rgba(233, 30, 99, 0.04);
		position: relative;
		transition: all 0.2s ease;
	}
	.compliance-checkbox-block.has-error {
		border-color: var(--color-error, #ef4444);
		background-color: #fdf2f2;
	}
	.mock-checkbox-label {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		cursor: pointer;
		text-align: left;
	}
	.mock-checkbox {
		margin-top: 0.15rem;
		accent-color: var(--color-primary-500, #e91e63);
		cursor: pointer;
	}
	.checkbox-text {
		font-size: 0.8rem;
		line-height: 1.4;
		color: #4b5563;
		user-select: none;
	}
	.accent-link {
		color: var(--color-primary-600, #d81b60);
		text-decoration: underline;
		font-weight: 600;
	}
	.required-star {
		color: var(--color-error, #ef4444);
		font-weight: bold;
	}
	.error-tooltip {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--color-error, #ef4444);
		font-size: 0.75rem;
		font-weight: 600;
		margin-top: 0.5rem;
		animation: shake 0.3s ease;
	}
	.error-icon {
		width: 14px;
		height: 14px;
	}
	.mock-submit-btn {
		width: 100%;
		background: var(--gradient-primary, linear-gradient(135deg, #d81b60 0%, #e11d48 100%));
		border: none;
		color: #ffffff;
		padding: 0.75rem;
		font-weight: 700;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.15);
		transition: opacity 0.2s;
	}
	.mock-submit-btn:hover {
		opacity: 0.95;
	}

	/* Shake animation for errors */
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}

	/* --- TOUCHPOINT B INTERACTIVE MOCK --- */
	.jit-demos-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}
	.jit-demo-card {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.06);
		border-radius: 16px;
		padding: 1.25rem;
		box-shadow: 0 4px 15px rgba(233, 30, 99, 0.02);
		text-align: left;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
	.jit-card-header {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		margin-bottom: 1.25rem;
	}
	.jit-icon {
		width: 24px;
		height: 24px;
		color: var(--color-primary-500, #e91e63);
		flex-shrink: 0;
	}
	.jit-card-header h4 {
		font-size: 0.95rem;
		font-weight: 700;
		margin: 0;
		color: #1a0a12;
	}
	.subtext {
		font-size: 0.75rem;
		color: var(--color-gray-500, #9e9e9e);
		margin: 0;
	}
	.jit-action-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.jit-action-btn {
		background-color: var(--color-primary-50, #fce4ec);
		color: var(--color-primary-700, #c2185b);
		border: 1px solid rgba(233, 30, 99, 0.1);
		border-radius: 8px;
		padding: 0.6rem 1.25rem;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.jit-action-btn:hover {
		background-color: var(--color-primary-100, #f8bbd0);
	}
	
	/* JIT Tooltip styles */
	.tooltip-container {
		position: relative;
		display: inline-block;
	}
	.info-trigger-btn {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background-color: #f3f4f6;
		color: #6b7280;
		border: none;
		font-size: 0.8rem;
		font-weight: bold;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}
	.info-trigger-btn:hover {
		background-color: var(--color-primary-500, #e91e63);
		color: #ffffff;
	}
	.jit-popup-tooltip {
		position: absolute;
		bottom: 130%;
		left: 50%;
		transform: translateX(-50%);
		width: 240px;
		background: #1a0a12;
		color: #ffffff;
		border-radius: 10px;
		padding: 0.75rem 1rem;
		box-shadow: var(--shadow-lg);
		z-index: 10;
	}
	.jit-popup-tooltip p {
		font-size: 0.75rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.9);
		margin: 0;
	}
	.jit-popup-tooltip .accent-link {
		color: var(--color-primary-200, #f48fb1);
	}
	.jit-popup-tooltip::after {
		content: "";
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: #1a0a12;
	}

	/* Upload box demo */
	.jit-upload-area {
		border: 2px dashed rgba(233, 30, 99, 0.15);
		border-radius: 12px;
		padding: 1.5rem 1rem;
		text-align: center;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		background: #fffdfd;
		transition: all 0.2s;
	}
	.jit-upload-area:hover {
		border-color: var(--color-primary-400, #ec407a);
		background: var(--color-primary-50, #fce4ec);
	}
	.upload-arrow {
		width: 24px;
		height: 24px;
		color: var(--color-primary-400, #ec407a);
	}
	.jit-upload-area span {
		font-size: 0.75rem;
		font-weight: 600;
		color: #4b5563;
	}
	.jit-inline-notice {
		display: flex;
		gap: 0.35rem;
		align-items: flex-start;
		margin-top: 0.75rem;
		background-color: #fdf5f7;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(233, 30, 99, 0.04);
	}
	.lock-icon {
		width: 14px;
		height: 14px;
		color: var(--color-primary-600, #d81b60);
		margin-top: 0.1rem;
		flex-shrink: 0;
	}
	.jit-inline-notice p {
		font-size: 0.72rem;
		line-height: 1.3;
		color: var(--color-primary-900, #880e4f);
		margin: 0;
	}

	/* --- TOUCHPOINT C INTERACTIVE MOCK --- */
	.layout-toggle-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}
	.toggle-title {
		font-size: 0.875rem;
		font-weight: 700;
		color: #4b5563;
	}
	.toggle-btn {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
		color: #4b5563;
		transition: all 0.2s;
	}
	.toggle-btn:hover {
		border-color: var(--color-primary-300, #f06292);
		color: var(--color-primary-600, #d81b60);
	}
	.toggle-btn.active {
		background-color: var(--color-primary-500, #e91e63);
		color: #ffffff;
		border-color: var(--color-primary-500, #e91e63);
		box-shadow: 0 4px 10px rgba(233, 30, 99, 0.15);
	}

	.persistent-demo-viewport {
		min-height: 250px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.03);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.01);
	}

	/* Mock Web Footer styles */
	.mock-web-footer-demo {
		width: 100%;
		border-top: 1px solid rgba(233, 30, 99, 0.08);
		padding: 1.5rem 0.5rem;
		background: linear-gradient(to bottom, #ffffff, #fff7f9);
		box-sizing: border-box;
	}
	.footer-top-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.footer-logo-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 800;
		font-size: 0.95rem;
		color: #1a0a12;
	}
	.footer-logo-brand img {
		width: 24px;
		height: 24px;
	}
	.footer-demo-links {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
	.footer-demo-links a {
		font-size: 0.8rem;
	}
	.dot-sep {
		color: rgba(233, 30, 99, 0.2);
		user-select: none;
	}
	.footer-bottom-row p {
		font-size: 0.75rem;
		color: #9ca3af;
		margin: 0;
	}

	/* Mock Mobile Phone Frame */
	.mock-mobile-device {
		width: 280px;
		border: 8px solid #1a0a12;
		border-radius: 36px;
		background-color: #f9fafb;
		box-shadow: var(--shadow-xl);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		text-align: left;
	}
	.mobile-status-bar {
		background-color: #ffffff;
		padding: 0.35rem 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.65rem;
		font-weight: bold;
		color: #1f2937;
		border-bottom: 1px solid #f3f4f6;
	}
	.mobile-nav-bar {
		background-color: #ffffff;
		padding: 0.6rem 1rem;
		text-align: center;
		border-bottom: 1px solid #e5e7eb;
	}
	.nav-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: #1a0a12;
	}
	.mobile-list-group {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 300px;
		overflow-y: auto;
	}
	.list-header {
		font-size: 0.65rem;
		font-weight: bold;
		text-transform: uppercase;
		color: #9ca3af;
		letter-spacing: 0.05em;
		margin: 0.5rem 0.25rem 0.25rem;
	}
	.list-item {
		background: #ffffff;
		border: 1px solid #f3f4f6;
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		font-size: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #374151;
		text-decoration: none;
	}
	.list-item.clickable {
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.list-item.clickable:hover {
		background-color: var(--color-primary-50, #fce4ec);
	}
	.arrow {
		color: #d1d5db;
		font-size: 0.9rem;
	}
	.arrow-pink {
		color: var(--color-primary-400, #ec407a);
		font-weight: bold;
		font-size: 0.9rem;
	}
	.badge {
		background-color: #e5e7eb;
		color: #4b5563;
		font-size: 0.6rem;
		padding: 0.15rem 0.35rem;
		border-radius: 4px;
		font-weight: bold;
	}

	/* --- PH COMPLIANCE BOXES --- */
	.compliance-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.25rem;
		margin-top: 1.5rem;
	}
	.comp-box {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.05);
		border-radius: 12px;
		padding: 1.25rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.01);
		text-align: left;
	}
	.comp-box h5 {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-primary-700, #c2185b);
		margin: 0 0 0.5rem;
	}
	.comp-box p {
		font-size: 0.8rem;
		line-height: 1.5;
		color: #4b5563;
		margin: 0;
	}

	/* Simple footer */
	.guide-footer {
		border-top: 1px solid rgba(233, 30, 99, 0.06);
		padding: 2rem 1.5rem;
		text-align: center;
		background-color: #fafafa;
		margin-top: auto;
	}
	.guide-footer p {
		font-size: 0.8125rem;
		color: var(--color-gray-500, #9e9e9e);
		margin: 0;
	}

	/* Animations */
	.animate-scaleIn {
		animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes scaleIn {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Responsive Grid */
	@media (max-width: 980px) {
		.guide-layout-grid {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
		.guide-sidebar {
			display: none;
		}
		.guide-content-wrap {
			padding: 2.5rem 1rem;
		}
	}
</style>
