/**
 * IMOGI Module Select - True Hybrid Desk Page
 * 
 * This page mounts the React module-select widget directly in Frappe Desk.
 * NO redirect to WWW - this is the new unified entry point.
 * 
 * ARCHITECTURE:
 * - Desk Page shell (this file)
 * - React widget mount (window.imogiModuleSelectMount)
 * - Single source of truth for operational context
 * - Uses shared imogi_loader.js for reliable injection/mounting
 */

frappe.pages['imogi-module-select'].on_page_load = function(wrapper) {
	console.count('[Desk] Module Select on_page_load (one-time setup)');
	
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'IMOGI Module Select',
		single_column: true
	});

	// Create container for React widget
	const container = $(document.createElement('div'));
	container.attr('id', 'imogi-module-select-root');
	container.attr('style', 'width: 100%; height: calc(100vh - 60px); overflow: auto;');
	page.main.html('');
	page.main.append(container);

	// Store references in wrapper for on_page_show access
	wrapper.__imogiModuleSelectRoot = container[0];
	wrapper.__imogiModuleSelectPage = page;
};

frappe.pages['imogi-module-select'].on_page_show = function(wrapper) {
	console.log('\ud83d\udfe2 [DESK PAGE SHOW] Module Select', {
		route: frappe.get_route_str(),
		navigation_lock: window.__imogiNavigationLock,
		timestamp: new Date().toISOString()
	});
	
	// CRITICAL: Check if we're navigating away - don't remount if so
	if (window.__imogiNavigationLock) {
		console.log('\u26d4 [DESK] Module Select skipping mount - navigation in progress');
		return;
	}
	
	// Get container reference from wrapper
	const container = wrapper.__imogiModuleSelectRoot;
	const page = wrapper.__imogiModuleSelectPage;
	
	if (!container) {
		console.error('[Desk] Module Select container not found - on_page_load not run?');
		return;
	}
	
	// Restore UI visibility
	container.style.display = '';
	
	// Set active flag for portal rendering
	window.__imogiModuleSelectActive = true;

	// Load React widget using shared loader
	loadReactWidget(container, page);
};

frappe.pages['imogi-module-select'].on_page_hide = function(wrapper) {
	console.log('[Desk] Module Select page hidden');
	
	// Get container reference from wrapper
	const container = wrapper.__imogiModuleSelectRoot;
	if (container) {
		container.style.display = 'none';
	}
	
	// Set inactive flag for portal cleanup
	window.__imogiModuleSelectActive = false;
};

function loadReactWidget(container, page) {
	// Load React bundle using shared loader
	const manifestPath = '/assets/imogi_pos/react/module-select/.vite/manifest.json';
	
	fetch(manifestPath)
		.then(res => res.json())
		.then(manifest => {
			// Vite manifest key is the full source path
			const entry = findManifestEntry(manifest);
			if (!entry || !entry.file) {
				console.error('[Desk] Module Select manifest structure:', manifest);
				throw new Error('Entry point not found in manifest. Check console for manifest structure.');
			}

			const scriptUrl = `/assets/imogi_pos/react/module-select/${entry.file}`;
			const cssUrl = entry.css && entry.css.length > 0 
				? `/assets/imogi_pos/react/module-select/${entry.css[0]}` 
				: null;

			// Use shared loader
			window.loadImogiReactApp({
				appKey: 'module-select',
				scriptUrl: scriptUrl,
				cssUrl: cssUrl,
				mountFnName: 'imogiModuleSelectMount',
				unmountFnName: 'imogiModuleSelectUnmount',
				containerId: 'imogi-module-select-root',
				makeContainer: () => container,
				onReadyMount: async (mountFn, containerEl) => {
					// Prevent duplicate mounting
					if (containerEl.__imogiModuleSelectMounted) {
						console.log('[Desk] Module Select already mounted, skipping...');
						return;
					}

					// CRITICAL FIX: Fetch operational context using shared utility
					// This ensures React app has current context state
					const operationalContext = await window.fetchOperationalContext();
					
					const initialState = {
						user: frappe.session.user,
						csrf_token: frappe.session.csrf_token,
						// Spread operational context into initialState
						...operationalContext
					};

					safeMount(mountFn, containerEl, { initialState });
					containerEl.__imogiModuleSelectMounted = true;
				},
				page: page,
				logPrefix: '[Module Select]'
			}).catch(error => {
				console.error('[Desk] Failed to load module-select:', error);
				showBundleError(container, 'module-select');
			});
		})
		.catch(error => {
			console.error('[Desk] Failed to fetch module-select manifest:', error);
			showBundleError(container, 'module-select');
		});
}

function findManifestEntry(manifest) {
	if (!manifest) {
		return null;
	}

	if (manifest['main.jsx']) {
		return manifest['main.jsx'];
	}

	const entries = Object.values(manifest);
	return entries.find((entry) => entry && entry.isEntry) || null;
}

function safeMount(mountFn, element, options) {
	if (!(element instanceof HTMLElement)) {
		throw new Error('Invalid mount element: expected HTMLElement for module-select');
	}
	if (typeof mountFn !== 'function') {
		throw new Error('Module-select mount function is not available');
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
			<p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
				After building, refresh this page.
			</p>
		</div>
	`;
}
