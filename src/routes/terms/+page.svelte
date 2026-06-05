<script lang="ts">
	import { onMount } from 'svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';

	const currentYear = new Date().getFullYear();
	let activeSection = $state('agreement');
	let scrollY = $state(0);

	onMount(() => {
		const sections = document.querySelectorAll('section[id]');
		const observerOptions = {
			root: null,
			rootMargin: '-20% 0px -60% 0px',
			threshold: 0
		};

		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					activeSection = entry.target.id;
				}
			});
		}, observerOptions);

		sections.forEach((section) => observer.observe(section));

		const handleScroll = () => { scrollY = window.scrollY; };
		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			sections.forEach((section) => observer.unobserve(section));
			window.removeEventListener('scroll', handleScroll);
		};
	});

	function scrollToSection(event: MouseEvent, id: string) {
		event.preventDefault();
		const element = document.getElementById(id);
		if (element) {
			const offset = 104;
			const bodyRect = document.body.getBoundingClientRect().top;
			const elementRect = element.getBoundingClientRect().top;
			const elementPosition = elementRect - bodyRect;
			const offsetPosition = elementPosition - offset;

			window.scrollTo({
				top: offsetPosition,
				behavior: 'smooth'
			});
			activeSection = id;
		}
	}
</script>

<svelte:head>
	<title>Terms & Conditions · CHTM Cooks</title>
	<meta name="description" content="Official Terms and Conditions for CHTM Cooks laboratory equipment borrowing platform." />
</svelte:head>

<div class="legal-page-root">
	<!-- Decorative blobs -->
	<div class="glow-orb orb-1"></div>
	<div class="glow-orb orb-2"></div>

	<!-- Floating Pill Navigation -->
	<header class="legal-nav" class:scrolled={scrollY > 20} class:at-top={scrollY <= 20}>
		<div class="nav-pill">
			<div class="nav-inner">
				<a href="/" class="nav-logo-link">
					<div class="nav-logo-glow"></div>
					<img src={logo} alt="CHTM Cooks" class="nav-logo-img" />
					<div class="nav-logo-text">
						<span class="nav-logo-title">CHTM Cooks</span>
						<span class="nav-logo-sub">Terms &amp; Conditions</span>
					</div>
				</a>
				<button type="button" class="nav-back-btn" onclick={() => history.back()} aria-label="Back">
					<svg class="nav-back-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					Back
				</button>
			</div>
		</div>
	</header>

	<div class="legal-content-wrap">
		<!-- Title Hero Section -->
		<div class="hero-section">
			<span class="category-tag">Institutional Guidelines</span>
			<h1>Terms &amp; Conditions</h1>
			<p class="last-updated">Last Updated: May 2026 · College Regulations & Borrowing Policies</p>
		</div>

		<div class="policy-layout-grid">
			<!-- Main content area -->
			<main class="policy-body">
				<section id="agreement">
					<h2>1. Agreement to Terms</h2>
					<p>
						These Terms & Conditions constitute a binding agreement between you and the College of Hospitality & Tourism Management (CHTM) at Gordon College, governing your usage of the CHTM Cooks laboratory inventory and equipment reservation system.
					</p>
					<p>
						By registering an account, booking equipment, or otherwise accessing the services, you acknowledge that you have read, understood, and agreed to be bound by these Terms, as well as the CHTM Cooks <a href="/privacy">Privacy Policy</a>. If you do not agree to these terms, you are not authorized to use the platform.
					</p>
				</section>

				<section id="eligibility">
					<h2>2. Eligibility and Enrollment</h2>
					<p>
						Access to the CHTM Cooks platform is restricted solely to:
					</p>
					<ul class="styled-list">
						<li>Active students officially enrolled in CHTM culinary, baking, or tourism laboratory courses at Gordon College.</li>
						<li>Designated CHTM academic faculty and class instructors.</li>
						<li>Authorized laboratory custodians and administrative staff.</li>
					</ul>
					<p>
						You must register using your official university-issued email address (<code>@gordoncollege.edu.ph</code>). Accounts registered with personal email domains are subject to immediate suspension.
					</p>
				</section>

				<section id="accounts">
					<h2>3. User Account Responsibilities</h2>
					<p>
						When you create an account, you represent and warrant that the academic information provided (including your student ID, section block, and year level) is truthful and accurate.
					</p>
					<ul class="styled-list">
						<li>You are solely responsible for maintaining the confidentiality of your account credentials.</li>
						<li>You agree to accept responsibility for all activities, bookings, and damage records associated with your account.</li>
						<li>You must notify CHTM laboratory staff immediately if you suspect unauthorized access or compromise of your credentials.</li>
					</ul>
				</section>

				<section id="borrowing-rules">
					<h2>4. Equipment Borrowing Procedures</h2>
					<p>
						The platform enables students to search available inventory and submit reservations. The following rules govern all transactions:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Instructor Approval Required:</strong> All borrow requests must be associated with an active laboratory class and approved electronically by the designated class instructor before items can be released.
						</li>
						<li>
							<strong>Financial Responsibility:</strong> In the event of loss, breakage, or damage, you may be held financially responsible for repair or replacement costs. Overdue items, unresolved damage reports, or unpaid replacement fees may result in suspension of borrowing privileges and academic holds.
						</li>
						<li>
							<strong>Designated Pick-Up & Return Hours:</strong> Items must be claimed and returned within CHTM laboratory operating hours. Failure to pick up approved items within the designated time frame may result in request cancellation.
						</li>
						<li>
							<strong>Verification at Return:</strong> Returned items must be audited in the presence of the custodian, who will sign off on the condition and cleanliness of the returned items.
						</li>
					</ul>
				</section>

				<section id="liability">
					<h2>5. Damage, Loss, and Student Liability</h2>
					<p>
						Borrowing laboratory equipment carries direct financial and academic responsibility:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Cleanliness:</strong> All tools, utensils, and appliances must be returned fully cleaned, sanitized, and ready for subsequent use, in accordance with culinary sanitation standards.
						</li>
						<li>
							<strong>Damage and Wear:</strong> You are responsible for inspecting equipment at pickup. Any damage not reported at checkout will be presumed to have occurred during your borrowing period.
						</li>
						<li>
							<strong>Financial Responsibility:</strong> In the event of loss, breakage, or damage, you may be held financially responsible for repair or replacement costs. Overdue items, unresolved damage reports, or unpaid replacement fees may result in suspension of borrowing privileges and academic holds.
						</li>
					</ul>
				</section>

				<section id="prohibited-uses">
					<h2>6. Prohibited Activities</h2>
					<p>
						Users of the platform are strictly prohibited from engaging in the following actions:
					</p>
					<ul class="styled-list">
						<li>Registering multiple accounts or utilizing another user's account credentials to borrow equipment.</li>
						<li>Submitting false or fabricated reservation schedules to reserve items for non-academic uses.</li>
						<li>Tampering with the QR code verification workflow or attempting to override administrator approval states.</li>
						<li>Using CHTM cooks culinary equipment off-campus without explicit written permission from the CHTM Dean or Lab Head.</li>
					</ul>
				</section>

				<section id="disclaimers">
					<h2>7. System Availability and Disclaimers</h2>
					<p>
						The CHTM Cooks system is provided on an "as-is" and "as-available" basis for educational and institutional management. While we strive to ensure service uptime, we do not guarantee uninterrupted access:
					</p>
					<ul class="styled-list">
						<li>Offline capabilities (local databases) are provided to allow queueing of requests during network fluctuations, but transactions are only finalized upon syncing with the server.</li>
						<li>We are not responsible for equipment shortages resulting from real-time discrepancies, late returns by other students, or emergency inventory audits.</li>
					</ul>
				</section>

				<section id="termination">
					<h2>8. Termination of Access</h2>
					<p>
						We reserve the right to suspend or terminate your access to the platform at our sole discretion, without prior notice, if you violate these Terms, university student code of conduct, or engage in behavior that compromises laboratory safety or assets.
					</p>
				</section>

				<section id="governing-law">
					<h2>9. Governing Law</h2>
					<p>
						These Terms are governed by and construed in accordance with the regulations of Gordon College, local ordinances of Olongapo City, and applicable laws of the Republic of the Philippines.
					</p>
				</section>

				<section id="contact-terms">
					<h2>10. Contact and Administration</h2>
					<p>
						For inquiries, administrative disputes regarding equipment penalties, or system assistance, please contact the CHTM Laboratory.
					</p>
					<ul class="styled-list">
						<li><strong>Official Email:</strong> <a href="mailto:chtm.cooks@gmail.com">chtm.cooks@gmail.com</a></li>
						<li><strong>Support:</strong> <a href="mailto:support@chtmcooks.edu.ph">support@chtmcooks.edu.ph</a></li>
						<li><strong>Institutional Inquiries:</strong> <a href="mailto:chtm@gordoncollege.edu.ph">chtm@gordoncollege.edu.ph</a></li>
					</ul>
				</section>
			</main>

			<!-- Sidebar Table of Contents -->
			<aside class="legal-sidebar">
				<div class="toc-container">
					<div class="toc-header">
						<h3>Table of Contents</h3>
					</div>
					<nav class="toc-nav" aria-label="Table of Contents">
						<a href="#agreement" class:active={activeSection === 'agreement'} onclick={(e) => scrollToSection(e, 'agreement')}>1. Agreement to Terms</a>
						<a href="#eligibility" class:active={activeSection === 'eligibility'} onclick={(e) => scrollToSection(e, 'eligibility')}>2. Eligibility</a>
						<a href="#accounts" class:active={activeSection === 'accounts'} onclick={(e) => scrollToSection(e, 'accounts')}>3. Account Security</a>
						<a href="#borrowing-rules" class:active={activeSection === 'borrowing-rules'} onclick={(e) => scrollToSection(e, 'borrowing-rules')}>4. Borrowing Rules</a>
						<a href="#liability" class:active={activeSection === 'liability'} onclick={(e) => scrollToSection(e, 'liability')}>5. Liability & Damage</a>
						<a href="#prohibited-uses" class:active={activeSection === 'prohibited-uses'} onclick={(e) => scrollToSection(e, 'prohibited-uses')}>6. Prohibited Acts</a>
						<a href="#disclaimers" class:active={activeSection === 'disclaimers'} onclick={(e) => scrollToSection(e, 'disclaimers')}>7. System Disclaimers</a>
						<a href="#termination" class:active={activeSection === 'termination'} onclick={(e) => scrollToSection(e, 'termination')}>8. Termination</a>
						<a href="#governing-law" class:active={activeSection === 'governing-law'} onclick={(e) => scrollToSection(e, 'governing-law')}>9. Governing Law</a>
						<a href="#contact-terms" class:active={activeSection === 'contact-terms'} onclick={(e) => scrollToSection(e, 'contact-terms')}>10. Contact Details</a>
					</nav>
				</div>
			</aside>
		</div>
	</div>

	<!-- Simple legal footer -->
	<footer class="legal-footer">
		<p>© {currentYear} CHTM Cooks · College of Hospitality & Tourism Management · Gordon College</p>
	</footer>
</div>

<style>
	/* Theme Integration and Page Styles */
	.legal-page-root {
		min-height: 100vh;
		background-color: #ffffff;
		color: var(--color-gray-900, #212121);
		font-family: var(--font-primary, "Google Sans", sans-serif);
		position: relative;
		overflow: clip;
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
		bottom: 100px;
		left: -150px;
	}

	/* ── Floating Pill Nav ─────────────────────────────────── */
	.legal-nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		justify-content: center;
		padding: 1rem 1.5rem 0;
		transition: padding 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.legal-nav.scrolled { padding-top: 0.625rem; }
	.nav-pill {
		width: 100%;
		max-width: 1200px;
		background: rgba(255, 255, 255, 0.82);
		border: 1px solid rgba(233, 30, 99, 0.08);
		border-radius: 9999px;
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		box-shadow: 0 1px 3px rgba(233, 30, 99, 0.06), 0 8px 32px rgba(233, 30, 99, 0.04);
		transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.legal-nav.at-top .nav-pill {
		background: rgba(255, 255, 255, 0.65);
		border-color: rgba(233, 30, 99, 0.05);
		box-shadow: 0 1px 2px rgba(233, 30, 99, 0.04), 0 4px 16px rgba(233, 30, 99, 0.02);
	}
	.legal-nav.scrolled .nav-pill {
		background: rgba(255, 255, 255, 0.96);
		border-color: rgba(233, 30, 99, 0.12);
		box-shadow: 0 2px 4px rgba(233, 30, 99, 0.08), 0 12px 40px rgba(233, 30, 99, 0.07);
	}
	.nav-inner {
		padding: 0 1.5rem;
		height: 68px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.nav-logo-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		position: relative;
		transition: transform 0.3s ease;
	}
	.nav-logo-link:hover { transform: scale(1.03); }
	.nav-logo-glow {
		position: absolute;
		inset: -4px;
		background: radial-gradient(circle, rgba(233, 30, 99, 0.15), transparent 70%);
		border-radius: 50%;
		filter: blur(8px);
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}
	.nav-logo-link:hover .nav-logo-glow { opacity: 1; }
	.nav-logo-img {
		width: 40px;
		height: 40px;
		position: relative;
		z-index: 1;
		filter: drop-shadow(0 2px 6px rgba(233, 30, 99, 0.18));
	}
	.nav-logo-text {
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}
	.nav-logo-title {
		font-size: 1.125rem;
		font-weight: 900;
		color: #1f2937;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.nav-logo-sub {
		font-size: 0.6rem;
		font-weight: 700;
		color: #e91e63;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.nav-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1.125rem;
		background: rgba(233, 30, 99, 0.06);
		color: #e91e63;
		font-size: 0.8125rem;
		font-weight: 700;
		border: 1px solid rgba(233, 30, 99, 0.12);
		border-radius: 9999px;
		text-decoration: none;
		transition: all 0.25s ease;
	}
	.nav-back-btn:hover {
		background: #e91e63;
		color: #ffffff;
		border-color: #e91e63;
		box-shadow: 0 4px 14px rgba(233, 30, 99, 0.25);
		transform: translateY(-1px);
	}
	.nav-back-arrow {
		width: 15px;
		height: 15px;
		transition: transform 0.2s ease;
	}
	.nav-back-btn:hover .nav-back-arrow { transform: translateX(-2px); }

	/* Content Layout */
	.legal-content-wrap {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 7rem 1.5rem 4rem;
		flex-grow: 1;
		position: relative;
		z-index: 1;
	}

	/* Hero Section */
	.hero-section {
		margin-bottom: 3.5rem;
		text-align: left;
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
		font-size: clamp(2.25rem, 5vw, 3.25rem);
		font-weight: 900;
		color: #1a0a12;
		margin: 0 0 0.5rem;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}
	.last-updated {
		font-size: 0.95rem;
		color: var(--color-gray-600, #757575);
		margin: 0;
	}

	/* Grid Design */
	.policy-layout-grid {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 4rem;
		align-items: start;
	}

	/* Main Policy Body */
	.policy-body {
		min-width: 0;
	}
	.policy-body section {
		margin-bottom: 3.5rem;
		scroll-margin-top: 100px;
	}
	.policy-body section h2 {
		font-size: 1.625rem;
		font-weight: 800;
		color: #1a0a12;
		margin: 0 0 1.25rem;
		letter-spacing: -0.015em;
		border-bottom: 2px solid var(--color-primary-50, #fce4ec);
		padding-bottom: 0.5rem;
	}
	.policy-body section p {
		font-size: 1rem;
		line-height: 1.7;
		color: #4b5563;
		margin: 0 0 1.25rem;
	}
	.policy-body section a {
		color: var(--color-primary-600, #d81b60);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 1px dashed var(--color-primary-300, #f06292);
		transition: border-color 0.2s;
	}
	.policy-body section a:hover {
		border-bottom-style: solid;
	}
	.styled-list {
		margin: 0 0 1.5rem 1.25rem;
		padding: 0;
		list-style: none;
	}
	.styled-list li {
		position: relative;
		font-size: 1rem;
		line-height: 1.65;
		color: #4b5563;
		margin-bottom: 0.75rem;
		padding-left: 1.5rem;
	}
	.styled-list li::before {
		content: "";
		position: absolute;
		left: 0;
		top: 0.55rem;
		width: 6px;
		height: 6px;
		background-color: var(--color-primary-500, #e91e63);
		border-radius: 50%;
	}
	.styled-list li strong {
		color: #1a0a12;
	}

	/* Sidebar Table of Contents */
	.legal-sidebar {
		position: sticky;
		top: 112px;
		max-height: calc(100vh - 136px);
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
	.toc-nav a {
		font-size: 0.9rem;
		color: var(--color-gray-600, #757575);
		text-decoration: none;
		line-height: 1.4;
		padding: 0.35rem 0.75rem;
		border-radius: 8px;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		border-left: 2px solid transparent;
	}
	.toc-nav a:hover {
		color: var(--color-primary-600, #d81b60);
		background-color: var(--color-primary-50, #fce4ec);
	}
	.toc-nav a.active {
		color: var(--color-primary-800, #ad1457);
		background-color: var(--color-primary-100, #f8bbd0);
		font-weight: 700;
		border-left-color: var(--color-primary-600, #d81b60);
		padding-left: 0.85rem;
	}

	/* Simple footer */
	.legal-footer {
		border-top: 1px solid rgba(233, 30, 99, 0.06);
		padding: 2rem 1.5rem;
		text-align: center;
		background-color: #fafafa;
		margin-top: auto;
	}
	.legal-footer p {
		font-size: 0.8125rem;
		color: var(--color-gray-500, #9e9e9e);
		margin: 0;
	}

	/* Media Queries */
	@media (max-width: 980px) {
		.policy-layout-grid {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
		.legal-sidebar {
			display: none;
		}
		.legal-content-wrap {
			padding: 2.5rem 1rem;
		}
	}
	h2 { margin-top: 1.25rem }
	a { color: #1f6feb }
</style>