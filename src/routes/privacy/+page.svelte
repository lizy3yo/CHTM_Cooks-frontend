<script lang="ts">
	import { onMount } from 'svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';

	const currentYear = new Date().getFullYear();
	let activeSection = $state('introduction');
	let scrollY = $state(0);

	// Intersection Observer to update the Table of Contents dynamically based on viewport
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
	<title>Privacy Policy · CHTM Cooks</title>
	<meta name="description" content="Official Privacy Policy for CHTM Cooks laboratory equipment management platform, in compliance with RA 10173." />
</svelte:head>

<div class="legal-page-root">
	<!-- Decorative blobs -->
	<div class="glow-orb orb-1"></div>
	<div class="glow-orb orb-2"></div>

	<!-- Floating Pill Navigation -->
	<header class="legal-nav" class:scrolled={scrollY > 20} class:at-top={scrollY <= 20}>
		<div class="nav-pill">
			<div class="nav-inner">
				<!-- Logo -->
				<a href="/" class="nav-logo-link">
					<div class="nav-logo-glow"></div>
					<img src={logo} alt="CHTM Cooks" class="nav-logo-img" />
					<div class="nav-logo-text">
						<span class="nav-logo-title">CHTM Cooks</span>
						<span class="nav-logo-sub">Privacy Policy</span>
					</div>
				</a>
				<!-- Back button: goes to previous page in history instead of home -->
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
			<span class="category-tag">Legal Compliance & Security</span>
			<h1>Privacy Policy</h1>
			<p class="last-updated">Last Updated: May 2026 · Compliant with RA 10173 (Philippine DPA)</p>
		</div>

		<div class="policy-layout-grid">
			<!-- Main content area -->
			<main class="policy-body">
				<section id="introduction">
					<h2>1. Introduction</h2>
					<p>
						CHTM Cooks ("we", "us", "our") serves as the official equipment borrowing and inventory management platform of the College of Hospitality & Tourism Management (CHTM) at Gordon College, Olongapo City, Philippines.
					</p>
					<p>
						We respect your privacy and are committed to protecting your personal data. This Privacy Policy informs you about how we handle your personal data when you visit and use our web application, your privacy rights, and how the law protects you. This policy is written in strict compliance with the <strong>Republic Act No. 10173</strong>, otherwise known as the <strong>Data Privacy Act of 2012 (DPA)</strong> of the Philippines, and its Implementing Rules and Regulations.
					</p>
				</section>

				<section id="scope">
					<h2>2. Scope of Application</h2>
					<p>
						This policy applies to all accounts registered on the CHTM Cooks platform, including <strong>students</strong>, <strong>instructors</strong>, <strong>custodians</strong>, and <strong>system administrators</strong>. It governs all data processed during equipment reservation, approvals, inventory audits, and offline-first data synchronization.
					</p>
				</section>

				<section id="data-we-collect">
					<h2>3. The Information We Process</h2>
					<p>
						We collect, use, store, and transfer different kinds of personal data about you, which we have grouped together as follows:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Identity Data:</strong> Includes your first name, last name, student number (for students), or employee number (for staff), and year level & block.
						</li>
						<li>
							<strong>Contact Data:</strong> Includes your official Gordon College institutional email address (e.g., <code>username@gordoncollege.edu.ph</code>) for automated borrow notifications.
						</li>
						<li>
							<strong>Academic Status Data:</strong> Year level, section block, and enrollment status within CHTM programs (Hospitality Management, Tourism Management).
						</li>
						<li>
							<strong>Borrowing & Transactional Data:</strong> Records of cooking equipment you have requested, borrowed quantities, reservation schedules, return statuses, QR verification histories, incident logs (e.g., damaged items), and your system calculated trust score.
						</li>
						<li>
							<strong>Technical & Session Data:</strong> IP addresses, browser cookies, local storage payloads, offline synchronization logbooks, and diagnostic crash data.
						</li>
					</ul>
				</section>

				<section id="how-we-collect">
					<h2>4. How We Collect Your Data</h2>
					<p>
						We use different methods to collect data from and about you, including:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Direct Interaction:</strong> You provide your Identity and Contact data by filling out forms during account registration, modifying your profile details, or initiating borrowing requests.
						</li>
						<li>
							<strong>System-Generated Data:</strong> Our server generates QR codes, assigns borrow request logs, calculates equipment availability states, and records custodian transaction approvals.
						</li>
						<li>
							<strong>Automated Technologies:</strong> As you interact with our platform, we automatically collect Technical and Session data to support offline data storage (via indexedDB) and subsequent synchronization with university cloud endpoints.
						</li>
					</ul>
				</section>

				<section id="purpose-of-processing">
					<h2>5. Purposes of Processing</h2>
					<p>
						Under the Philippine Data Privacy Act, we process your personal data only for legitimate institutional purposes:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Platform Operation:</strong> Authenticating user identity, managing your account, facilitating reservation flows, and verifying claims using QR scanner handshakes.
						</li>
						<li>
							<strong>Accountability & Inventory Control:</strong> Keeping track of high-value culinary equipment, enforcing return windows, logging incident reports, and calculating student liability or replacement requirements.
						</li>
						<li>
							<strong>Notification Dispatch:</strong> Sending real-time email updates regarding approval reviews, pickup readiness, overdue items, or inventory changes.
						</li>
						<li>
							<strong>Academic Record Matching:</strong> Ensuring students requesting equipment are actively enrolled in laboratory courses and assigned to classes of the approving instructors.
						</li>
					</ul>
				</section>

				<section id="legal-basis">
					<h2>6. Legal Basis for Processing</h2>
					<p>
						We process your information based on the following legal grounds:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Consent:</strong> When you register an account, upload a profile photo, or opt-in to Email alerts.
						</li>
						<li>
							<strong>Contractual/Academic Obligation:</strong> Processing is necessary to carry out Gordon College academic laboratory regulations, equipment rental policies, and student liability agreements.
						</li>
						<li>
							<strong>Legitimate Interests:</strong> To secure the platform against fraud, prevent the loss of university assets, audit inventory records, and maintain continuous offline service capabilities.
						</li>
					</ul>
				</section>

				<section id="data-sharing">
					<h2>7. Disclosure and Data Sharing</h2>
					<p>
						Your data is highly protected and is shared <strong>exclusively</strong> for academic and security audits:
					</p>
					<ul class="styled-list">
						<li>
							<strong>Instructors & Approving Faculty:</strong> Access is provided to evaluate, approve, or reject student requests associated with their respective laboratory sections.
						</li>
						<li>
							<strong>Custodians & Lab Assistants:</strong> Access is provided to scan student QR codes, hand out requested items, evaluate returned item conditions, and record inventory metrics.
						</li>
						<li>
							<strong>Institutional Administrators:</strong> System administrators have dashboard access to maintain databases, investigate system errors, and export auditing reports for Gordon College CHTM administration.
						</li>
					</ul>
					<p class="warning-box">
						<strong>Security Note:</strong> CHTM Cooks does not sell, lease, or rent your personal information to third-party commercial entities. All data processing is strictly confined to internal academic operations.
					</p>
				</section>

				<section id="data-retention">
					<h2>8. Data Retention</h2>
					<p>
						We will only retain your personal data for as long as necessary to fulfill the academic purposes we collected it for, including satisfying any legal, accounting, or reporting requirements.
					</p>
					<p>
						Student profiles and borrow histories are archived upon graduation, transfer, or when the account has been inactive for a period exceeding <strong>four (4) consecutive semesters</strong>, in compliance with university document retention schedules.
					</p>
				</section>

				<section id="data-security">
					<h2>9. Data Security Measures</h2>
					<p>
						We have put in place appropriate technical, physical, and organizational security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way. All database communications are secured using TLS encryption. User passwords are encrypted using state-of-the-art hashing algorithms.
					</p>
					<p>
						In the event of a suspected data breach, we will notify you and the National Privacy Commission (NPC) in accordance with the guidelines set forth under the DPA.
					</p>
				</section>

				<section id="your-rights">
					<h2>10. Your Rights Under the DPA</h2>
					<p>
						Under the Philippine Data Privacy Act of 2012 (RA 10173), you possess the following rights regarding your personal information:
					</p>
					<ul class="styled-list">
						<li><strong>Right to be Informed:</strong> Knowing whether your personal data is being processed, and for what purposes.</li>
						<li><strong>Right to Access:</strong> Requesting a copy of your personal data processed by the platform.</li>
						<li><strong>Right to Object:</strong> Opposing processing based on legitimate interests (subject to academic requirements).</li>
						<li><strong>Right to Rectification:</strong> Requesting corrections to inaccurate or outdated profile records.</li>
						<li><strong>Right to Erasure or Blocking:</strong> Demanding suspension, withdrawal, or deletion of account records.</li>
						<li><strong>Right to Damages:</strong> Seeking compensation for damages sustained due to inaccurate, incomplete, or unauthorized use of data.</li>
						<li><strong>Right to File a Complaint:</strong> Lodging official complaints before the National Privacy Commission (NPC).</li>
					</ul>
				</section>

				<section id="dpo-contact">
					<h2>11. Data Protection Officer (DPO) Details</h2>
					<p>
						If you wish to exercise any of your privacy rights, or have questions about how Gordon College handles your personal data within CHTM Cooks, you may contact the Gordon College Data Protection Officer:
					</p>
					<div class="dpo-card">
						<h3>Gordon College Data Protection Office</h3>
						<ul>
							<li><strong>Data Protection Officer:</strong> DPO, Gordon College</li>
							<li><strong>Email Address:</strong> <a href="mailto:dpo@gordoncollege.edu.ph">dpo@gordoncollege.edu.ph</a></li>
							<li><strong>Physical Campus Address:</strong> Olongapo City Sports Complex, Donor St., East Tapinac, Olongapo City, Zambales 2200, Philippines</li>
							<li><strong>Technical Support:</strong> <a href="mailto:chtm.cooks@gmail.com">chtm.cooks@gmail.com</a></li>
						</ul>
					</div>
				</section>
			</main>

			<!-- Sidebar Table of Contents -->
			<aside class="legal-sidebar">
				<div class="toc-container">
					<div class="toc-header">
						<h3>Table of Contents</h3>
					</div>
					<nav class="toc-nav" aria-label="Table of Contents">
						<a href="#introduction" class:active={activeSection === 'introduction'} onclick={(e) => scrollToSection(e, 'introduction')}>1. Introduction</a>
						<a href="#scope" class:active={activeSection === 'scope'} onclick={(e) => scrollToSection(e, 'scope')}>2. Scope of Application</a>
						<a href="#data-we-collect" class:active={activeSection === 'data-we-collect'} onclick={(e) => scrollToSection(e, 'data-we-collect')}>3. Information We Process</a>
						<a href="#how-we-collect" class:active={activeSection === 'how-we-collect'} onclick={(e) => scrollToSection(e, 'how-we-collect')}>4. How We Collect Data</a>
						<a href="#purpose-of-processing" class:active={activeSection === 'purpose-of-processing'} onclick={(e) => scrollToSection(e, 'purpose-of-processing')}>5. Purposes of Processing</a>
						<a href="#legal-basis" class:active={activeSection === 'legal-basis'} onclick={(e) => scrollToSection(e, 'legal-basis')}>6. Legal Basis</a>
						<a href="#data-sharing" class:active={activeSection === 'data-sharing'} onclick={(e) => scrollToSection(e, 'data-sharing')}>7. Disclosure & Sharing</a>
						<a href="#data-retention" class:active={activeSection === 'data-retention'} onclick={(e) => scrollToSection(e, 'data-retention')}>8. Data Retention</a>
						<a href="#data-security" class:active={activeSection === 'data-security'} onclick={(e) => scrollToSection(e, 'data-security')}>9. Data Security</a>
						<a href="#your-rights" class:active={activeSection === 'your-rights'} onclick={(e) => scrollToSection(e, 'your-rights')}>10. Your Rights</a>
						<a href="#dpo-contact" class:active={activeSection === 'dpo-contact'} onclick={(e) => scrollToSection(e, 'dpo-contact')}>11. DPO Contact Details</a>
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
		overflow: clip; /* clip prevents horizontal scroll without breaking position:sticky */
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
	.legal-nav.scrolled {
		padding-top: 0.625rem;
	}
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
	/* Logo */
	.nav-logo-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		position: relative;
		transition: transform 0.3s ease;
	}
	.nav-logo-link:hover {
		transform: scale(1.03);
	}
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
	.nav-logo-link:hover .nav-logo-glow {
		opacity: 1;
	}
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
	/* Back CTA */
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
	.nav-back-btn:hover .nav-back-arrow {
		transform: translateX(-2px);
	}

	/* Content Layout */
	.legal-content-wrap {
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 7rem 1.5rem 4rem; /* top offset for fixed pill nav */
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

	/* Warnings / Special callouts */
	.warning-box {
		background: linear-gradient(135deg, #fff5f7 0%, #fff0f3 100%);
		border-left: 4px solid var(--color-primary-500, #e91e63);
		padding: 1.25rem;
		border-radius: 0 12px 12px 0;
		margin: 2rem 0;
		box-shadow: var(--shadow-sm);
	}
	.warning-box strong {
		color: var(--color-primary-900, #880e4f);
	}

	/* DPO Info Card */
	.dpo-card {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.08);
		border-radius: 16px;
		padding: 1.75rem;
		box-shadow: 0 4px 20px rgba(233, 30, 99, 0.03);
		margin-top: 1.5rem;
		position: relative;
		overflow: hidden;
	}
	.dpo-card::before {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 4px;
		background: var(--gradient-primary, linear-gradient(135deg, #d81b60 0%, #e11d48 100%));
	}
	.dpo-card h3 {
		font-size: 1.2rem;
		font-weight: 700;
		color: #1a0a12;
		margin: 0 0 1rem;
	}
	.dpo-card ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.dpo-card li {
		font-size: 0.95rem;
		line-height: 1.6;
		margin-bottom: 0.75rem;
		color: #4b5563;
	}
	.dpo-card li strong {
		color: #1a0a12;
	}
	.dpo-card a {
		color: var(--color-primary-600, #d81b60);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 1px dashed var(--color-primary-300, #f06292);
		transition: border-color 0.2s;
	}
	.dpo-card a:hover {
		border-bottom-style: solid;
	}

	/* Sidebar Table of Contents */
	.legal-sidebar {
		position: sticky;
		top: 112px; /* 84px nav footprint + 28px professional gap */
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
		min-height: 0; /* allow flex child to shrink */
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
		padding-right: 0.25rem; /* space for custom scrollbar */
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
			display: none; /* Hide sidebar on mobile layouts */
		}
		.legal-content-wrap {
			padding: 2.5rem 1rem;
		}
	}
</style>
