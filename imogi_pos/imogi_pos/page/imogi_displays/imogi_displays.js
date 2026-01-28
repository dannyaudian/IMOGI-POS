/**
 * IMOGI Customer Display - True Hybrid Desk Page
 * 
 * CRITICAL FIX: React mounting moved to on_page_show for SPA routing.
 * 
 * NOTE: Customer display does NOT require operational context (guest-accessible)
 * 
 * ARCHITECTURE:
 * - on_page_load: One-time DOM setup (page structure)
 * - on_page_show: React mounting logic (runs every navigation)
 * - Uses shared imogi_loader.js for reliable injection/mounting
 */

frappe.pages['imogi-displays'].on_page_load = function(wrapper) {
	console.count('[Desk] Customer Display on_page_load (one-time setup)');
	
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Customer Display',
		single_column: true
	});

	// Create container for React widget (one-time)
	const container = $(document.createElement('div'));
	container.attr('id', 'imogi-displays-root');
	container.attr('style', 'width: 100%; height: calc(100vh - 60px); overflow: auto;');
	page.main.html('');
	page.main.append(container);

	// Store references in wrapper for on_page_show access
	wrapper.__imogiDisplaysPage = page;
	wrapper.__imogiDisplaysRoot = container[0];
	
	// Setup popstate listener for back button auto-reload
	if (!wrapper.__imogiPopstateHandler) {
		wrapper.__imogiPopstateHandler = function(event) {
			console.log('🔄 [POPSTATE] Back navigation detected, reloading Customer Display', {
				state: event.state,
				route: frappe.get_route_str()
			});
			
			if (frappe.get_route_str().includes('imogi-displays')) {
				if (wrapper.__imogiDisplaysRoot) {
					loadReactWidget(wrapper.__imogiDisplaysRoot, wrapper.__imogiDisplaysPage, true);
				}
			}
		};
		window.addEventListener('popstate', wrapper.__imogiPopstateHandler);
	}
};

frappe.pages['imogi-displays'].on_page_show = function(wrapper) {
	console.log('🟢 [DESK PAGE SHOW] Customer Display', {
		route: frappe.get_route_str(),
		timestamp: new Date().toISOString(),
		isBackNavigation: window.performance && window.performance.navigation.type === 2
	});
	
	// Get container reference from wrapper
	const container = wrapper.__imogiDisplaysRoot;
	const page = wrapper.__imogiDisplaysPage;
	
	if (!container) {
		console.error('[Desk] Customer Display container not found - on_page_load not run?');
		return;
	}

	// Mount directly without context gate (guest-accessible)
	loadReactWidget(container, page);
};

function loadReactWidget(container, page, forceReload = false) {
	// If force reload, unmount existing React first
	if (forceReload && container && window.imogiDisplaysUnmount) {
		console.log('🔄 [FORCE RELOAD] Unmounting existing Customer Display React instance');
		try {
			window.imogiDisplaysUnmount(container);
		} catch (err) {
			console.warn('[Customer Display] Unmount error (non-critical):', err);
		}
	}
	
	// Load React bundle using shared loader
	const manifestPath = '/assets/imogi_pos/react/customer-display/.vite/manifest.json';
	
	fetch(manifestPath)
		.then(res => res.json())
		.then(manifest => {
			// Vite manifest key is the full source path
			const entry = manifest['src/apps/customer-display/main.jsx'];
			if (!entry || !entry.file) {
				console.error('[Desk] Customer Display manifest structure:', manifest);
				throw new Error('Entry point not found in manifest');
			}

			const scriptUrl = `/assets/imogi_pos/react/customer-display/${entry.file}`;
			const cssUrl = entry.css && entry.css.length > 0 
				? `/assets/imogi_pos/react/customer-display/${entry.css[0]}` 
				: null;

			// Use shared loader
			window.loadImogiReactApp({
				appKey: 'customer-display',
				scriptUrl: scriptUrl,
				cssUrl: cssUrl,
				mountFnName: 'imogiDisplaysMount',
				unmountFnName: 'imogiDisplaysUnmount',
				containerId: 'imogi-displays-root',
				makeContainer: () => container,
				onReadyMount: (mountFn, containerEl) => {
					const initialState = {
						user: frappe.session.user,
						csrf_token: frappe.session.csrf_token
					};

					safeMount(mountFn, containerEl, { initialState });
				},
				page: page,
				logPrefix: '[Customer Display]'
			}).catch(error => {
				console.error('[Desk] Failed to load customer-display:', error);
				showBundleError(container, 'customer-display');
			});
		})
		.catch(error => {
			console.error('[Desk] Failed to fetch customer-display manifest:', error);
			showBundleError(container, 'customer-display');
		});
}

function safeMount(mountFn, element, options) {
	if (!(element instanceof HTMLElement)) {
		throw new Error('Invalid mount element: expected HTMLElement for customer-display');
	}
	if (typeof mountFn !== 'function') {
		throw new Error('Customer Display mount function is not available');
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
