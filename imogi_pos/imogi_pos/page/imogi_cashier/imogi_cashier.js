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
 * - Uses shared imogi_loader.js for reliable injection/mounting
 */

frappe.pages['imogi-cashier'].on_page_load = function(wrapper) {
	console.count('[Desk] Cashier on_page_load (one-time setup)');
	
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
	
	// Setup popstate listener for back button auto-reload
	// This ensures React remounts with fresh data when navigating back
	if (!wrapper.__imogiPopstateHandler) {
		wrapper.__imogiPopstateHandler = function(event) {
			console.log('🔄 [POPSTATE] Back navigation detected, reloading Cashier', {
				state: event.state,
				route: frappe.get_route_str()
			});
			
			// Check if we're on the cashier route
			if (frappe.get_route_str().includes('imogi-cashier')) {
				// Force remount React with fresh data
				if (wrapper.__imogiCashierRoot) {
					loadReactWidget(wrapper.__imogiCashierRoot, wrapper.__imogiCashierPage, true);
				}
			}
		};
		window.addEventListener('popstate', wrapper.__imogiPopstateHandler);
	}
};

frappe.pages['imogi-cashier'].on_page_show = function(wrapper) {
	// Check if this is a fresh navigation from module-select (has _reload param)
	const urlParams = new URLSearchParams(window.location.search);
	const shouldReload = urlParams.has('_reload');
	
	console.log('🟢 [DESK PAGE SHOW] Cashier', {
		route: frappe.get_route_str(),
		timestamp: new Date().toISOString(),
		isBackNavigation: window.performance && window.performance.navigation.type === 2,
		shouldReload: shouldReload
	});
	
	// Get container reference from wrapper
	const container = wrapper.__imogiCashierRoot;
	const page = wrapper.__imogiCashierPage;
	
	if (!container) {
		console.error('[Desk] Cashier container not found - on_page_load not run?');
		return;
	}

	// Load React widget directly - let React handle operational context checking
	// React usePOSProfileGuard will handle redirect to module-select if needed
	// Force reload if _reload param exists (fresh navigation from module-select)
	loadReactWidget(container, page, shouldReload);
	
	// Clean up _reload param from URL to avoid reload loops
	if (shouldReload) {
		urlParams.delete('_reload');
		const cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
		window.history.replaceState({}, '', cleanUrl);
	}
};

function loadReactWidget(container, page, forceReload = false) {
	// If force reload, unmount existing React first
	if (forceReload && container && window.imogiCashierUnmount) {
		console.log('🔄 [FORCE RELOAD] Unmounting existing Cashier React instance');
		try {
			window.imogiCashierUnmount(container);
		} catch (err) {
			console.warn('[Cashier] Unmount error (non-critical):', err);
		}
	}
	
	// Load React bundle using shared loader
	const manifestPath = '/assets/imogi_pos/react/cashier-console/.vite/manifest.json';
	
	fetch(manifestPath)
		.then(res => res.json())
		.then(manifest => {
			// Vite manifest key is the full source path
			const entry = manifest['src/apps/cashier-console/main.jsx'];
			if (!entry || !entry.file) {
				console.error('[Desk] Cashier manifest structure:', manifest);
				throw new Error('Entry point not found in manifest. Check console for manifest structure.');
			}

			const scriptUrl = `/assets/imogi_pos/react/cashier-console/${entry.file}`;
			const cssUrl = entry.css && entry.css.length > 0 
				? `/assets/imogi_pos/react/cashier-console/${entry.css[0]}` 
				: null;

			// Use shared loader
			window.loadImogiReactApp({
				appKey: 'cashier-console',
				scriptUrl: scriptUrl,
				cssUrl: cssUrl,
				mountFnName: 'imogiCashierMount',
				unmountFnName: 'imogiCashierUnmount',
				containerId: 'imogi-cashier-root',
				makeContainer: () => container,
				onReadyMount: async (mountFn, containerEl) => {
					// Fetch operational context using shared utility
					let operationalContext = null;
					if (typeof window.fetchOperationalContext === 'function') {
						try {
							operationalContext = await window.fetchOperationalContext();
						} catch (err) {
							console.warn('[Cashier] Failed to fetch operational context:', err);
						}
					} else {
						// Not critical - React will fetch context itself using useOperationalContext hook
						console.debug('[Cashier] window.fetchOperationalContext not available, React will fetch context');
					}
					
					const initialState = {
						user: frappe.session.user,
						csrf_token: frappe.session.csrf_token,
						// Spread operational context into initialState
						...operationalContext
					};

					safeMount(mountFn, containerEl, { initialState });
				},
				page: page,
				logPrefix: '[Cashier Console]'
			}).catch(error => {
				console.error('[Desk] Failed to load cashier-console:', error);
				showBundleError(container, 'cashier-console');
			});
		})
		.catch(error => {
			console.error('[Desk] Failed to fetch cashier-console manifest:', error);
			showBundleError(container, 'cashier-console');
		});
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
				<div>npm run build</div>
			</div>
		</div>
	`;
}
