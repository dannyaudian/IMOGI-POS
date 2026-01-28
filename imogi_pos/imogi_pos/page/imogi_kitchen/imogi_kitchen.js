/**
 * IMOGI Kitchen Display - True Hybrid Desk Page
 * 
 * CRITICAL FIX: React mounting moved to on_page_show for SPA routing.
 * 
 * ARCHITECTURE:
 * - on_page_load: One-time DOM setup (page structure)
 * - on_page_show: React mounting logic (runs every navigation)
 * - Uses shared imogi_loader.js for reliable injection/mounting
 */

frappe.pages['imogi-kitchen'].on_page_load = function(wrapper) {
	console.count('[Desk] Kitchen on_page_load (one-time setup)');
	
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Kitchen Display',
		single_column: true
	});

	// Create container for React widget (one-time)
	const container = page.main.find('.page-content');
	container.attr('id', 'imogi-kitchen-root');

	// Store references in wrapper for on_page_show access
	wrapper.__imogiKitchenPage = page;
	wrapper.__imogiKitchenRoot = container[0];
};

frappe.pages['imogi-kitchen'].on_page_show = function(wrapper) {
	console.log('🟢 [DESK PAGE SHOW] Kitchen', {
		route: frappe.get_route_str(),
		timestamp: new Date().toISOString()
	});
	
	// Get container reference from wrapper
	const container = wrapper.__imogiKitchenRoot;
	const page = wrapper.__imogiKitchenPage;
	
	if (!container) {
		console.error('[Desk] Kitchen container not found - on_page_load not run?');
		return;
	}

	// Load React widget directly - let React handle operational context checking
	// React usePOSProfileGuard will handle redirect to module-select if needed
	loadReactWidget(container, page);
};

function loadReactWidget(container, page) {
	// Load React bundle using shared loader
	const manifestPath = '/assets/imogi_pos/react/kitchen/.vite/manifest.json';
	
	fetch(manifestPath)
		.then(res => res.json())
		.then(manifest => {
			// Vite manifest key is the full source path
			const entry = manifest['main.jsx'];
			if (!entry || !entry.file) {
				console.error('[Desk] Kitchen manifest structure:', manifest);
				throw new Error('Entry point not found in manifest. Check console for manifest structure.');
			}

			const scriptUrl = `/assets/imogi_pos/react/kitchen/${entry.file}`;
			const cssUrl = entry.css && entry.css.length > 0 
				? `/assets/imogi_pos/react/kitchen/${entry.css[0]}` 
				: null;

			// Use shared loader
			window.loadImogiReactApp({
				appKey: 'kitchen',
				scriptUrl: scriptUrl,
				cssUrl: cssUrl,
				mountFnName: 'imogiKitchenMount',
				unmountFnName: 'imogiKitchenUnmount',
				containerId: 'imogi-kitchen-root',
				makeContainer: () => container,
				onReadyMount: async (mountFn, containerEl) => {
					// CRITICAL FIX: Wait for operational context utility to be available
					// imogi_loader.js may not be fully loaded yet
					if (typeof window.waitForFetchOperationalContext === 'function') {
						await window.waitForFetchOperationalContext();
					} else {
						console.warn('[Kitchen] waitForFetchOperationalContext not available, using fallback');
					}
					
					// CRITICAL FIX: Fetch operational context using shared utility
					// This ensures React app receives the context that was set by module-select
					const operationalContext = typeof window.fetchOperationalContext === 'function'
						? await window.fetchOperationalContext()
						: null;
					
					const initialState = {
						user: frappe.session.user,
						csrf_token: frappe.session.csrf_token,
						// Spread operational context into initialState
						...operationalContext
					};
					
					safeMount(mountFn, containerEl, { initialState });
				},
				page: page,
				logPrefix: '[Kitchen Display]'
			}).catch(error => {
				console.error('[Desk] Failed to load kitchen:', error);
				showBundleError(container, 'kitchen');
			});
		})
		.catch(error => {
			console.error('[Desk] Failed to fetch kitchen manifest:', error);
			showBundleError(container, 'kitchen');
		});
}

function safeMount(mountFn, element, options) {
	if (!(element instanceof HTMLElement)) {
		throw new Error('Invalid mount element: expected HTMLElement for kitchen');
	}
	if (typeof mountFn !== 'function') {
		throw new Error('Kitchen mount function is not available');
	}
	return mountFn(element, options);
}

function showBundleError(container, appName) {
	const element = container instanceof HTMLElement ? container : container;
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

