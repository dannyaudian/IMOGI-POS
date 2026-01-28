/**
 * IMOGI Cashier Console - True Hybrid Desk Page
 * 
 * CRITICAL FIX: React mounting moved to on_page_show for SPA routing.
 * 
 * WHY: Frappe's on_page_load only runs ONCE per session. Subsequent route
 * transitions (module-select → cashier) only trigger on_page_show.
 * Without this fix, first navigation fails to mount React (double-click needed).
 * 
 * ARCHITECTURE:
 * - on_page_load: One-time DOM setup (page structure)
 * - on_page_show: React mounting logic (runs every navigation)
 */

frappe.pages['imogi-cashier'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'IMOGI Cashier Console',
		single_column: true
	});

	// Create container for React widget (one-time)
	const container = $(document.createElement('div'));
	container.attr('id', 'imogi-cashier-root');
	container.attr('style', 'width: 100%; height: calc(100vh - 60px); overflow: auto;');
	page.main.html('');
	page.main.append(container);

	// Store references in wrapper for on_page_show access
	wrapper.__imogiCashierPage = page;
	wrapper.__imogiCashierRoot = container[0];
};

frappe.pages['imogi-cashier'].on_page_show = function(wrapper) {
	// Get container reference from wrapper
	const container = wrapper.__imogiCashierRoot;
	const page = wrapper.__imogiCashierPage;
	
	if (!container) {
		console.error('[Desk] Cashier container not found - on_page_load not run?');
		return;
	}

	// Load React widget directly - let React handle operational context checking
	// React usePOSProfileGuard will handle redirect to module-select if needed
	loadReactWidget(container, page);
};

function loadReactWidget(container, page) {
	// Check if bundle already loaded
	if (window.imogiCashierMount) {
		mountWidget(container, page);
		return;
	}

	// Load React bundle
	const manifestPath = '/assets/imogi_pos/react/cashier-console/.vite/manifest.json';
	
	fetch(manifestPath)
		.then(res => res.json())
		.then(manifest => {
			// Vite manifest key is the full source path
			const entry = manifest['src/apps/cashier-console/main.jsx'];
			if (!entry || !entry.file) {
				console.error('[Desk] Manifest structure:', manifest);
				throw new Error('Entry point not found in manifest. Check console for manifest structure.');
			}

			const scriptUrl = `/assets/imogi_pos/react/cashier-console/${entry.file}`;
			const scriptSelector = `script[data-imogi-app="cashier-console"][src="${scriptUrl}"]`;
			const existingScript = document.querySelector(scriptSelector);

			// Guard: Don't re-inject if script already exists
			if (existingScript) {
				// Script exists, just re-mount the widget
				const checkMount = setInterval(() => {
					if (window.imogiCashierMount) {
						clearInterval(checkMount);
						mountWidget(container, page);
					}
				}, 100);
				return;
			}

			const script = document.createElement('script');
			script.type = 'module';
			script.src = scriptUrl;
			script.dataset.imogiApp = 'cashier-console';
			
			script.onload = () => {
				const checkMount = setInterval(() => {
					if (window.imogiCashierMount) {
						clearInterval(checkMount);
						mountWidget(container, page);
					}
				}, 100);
			};

			script.onerror = () => {
				showBundleError(container, 'cashier-console');
			};

			document.head.appendChild(script);

			// Load CSS if available
			if (entry.css && entry.css.length > 0) {
				const cssUrl = `/assets/imogi_pos/react/cashier-console/${entry.css[0]}`;
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = cssUrl;
				document.head.appendChild(link);
			}
		})
		.catch(error => {
			console.error('[Desk] Failed to load cashier-console bundle:', error);
			showBundleError(container, 'cashier-console');
		});
}

function mountWidget(container, page) {
	try {
		const initialState = {
			user: frappe.session.user,
			csrf_token: frappe.session.csrf_token
		};

		safeMount(window.imogiCashierMount, container, { initialState });

	} catch (error) {
		console.error('[Desk] Failed to mount cashier-console widget:', error);
		showMountError(container, error);
	}
}

function safeMount(mountFn, element, options) {
	if (!(element instanceof HTMLElement)) {
		throw new Error('Invalid mount element: expected HTMLElement for cashier-console');
	}
	if (typeof mountFn !== 'function') {
		throw new Error('Cashier mount function is not available');
	}
	return mountFn(element, options);
}

function showBundleError(container, appName) {
	// Ensure we're working with raw HTMLElement
	const element = container instanceof HTMLElement ? container : container[0];
	element.innerHTML = `
		<div style="padding: 2rem; text-align: center; color: #dc2626; max-width: 600px; margin: 2rem auto; border: 2px solid #dc2626; border-radius: 8px; background: #fef2f2;">
			<h3 style="margin-bottom: 1rem;">⚠️ React Bundle Not Found</h3>
			<p style="margin-bottom: 1rem;">The React bundle for <strong>${appName}</strong> needs to be built.</p>
			<div style="background: #1f2937; color: #10b981; padding: 1rem; border-radius: 4px; font-family: monospace; text-align: left;">
				<div style="color: #6b7280; margin-bottom: 0.5rem;"># Build the React app:</div>
				<div>VITE_APP=${appName} npx vite build</div>
			</div>
		</div>
	`;
}

function showMountError(container, error) {
	// Ensure we're working with raw HTMLElement
	const element = container instanceof HTMLElement ? container : container[0];
	element.innerHTML = `
		<div style="padding: 2rem; text-align: center; color: #dc2626;">
			<h3>Widget Mount Error</h3>
			<p>${error.message || 'Failed to mount React widget'}</p>
			<button class="btn btn-primary btn-sm" onclick="location.reload()">Reload Page</button>
		</div>
	`;
}
