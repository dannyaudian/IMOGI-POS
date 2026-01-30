/**
 * IMOGI React App Loader - Shared Utility
 * 
 * PURPOSE: Centralized React bundle injection and mounting for all IMOGI POS Desk pages
 * 
 * FEATURES:
 * - Guards against double script/CSS injection using data-imogi-app attributes
 * - Handles reliable remounting on route changes
 * - Provides cleanup hooks for unmounting
 * - Prevents duplicate intervals/timeouts
 * - Debug helper for tracking injected scripts
 * 
 * USAGE:
 *   loadImogiReactApp({
 *     appKey: 'cashier-console',
 *     scriptUrl: '/assets/imogi_pos/react/cashier-console/main.js',
 *     cssUrl: '/assets/imogi_pos/react/cashier-console/style.css', // optional
 *     mountFnName: 'imogiCashierMount',
 *     unmountFnName: 'imogiCashierUnmount', // optional
 *     containerId: 'imogi-cashier-root',
 *     makeContainer: () => document.getElementById('imogi-cashier-root'),
 *     onReadyMount: (mountFn, container) => mountFn(container, { initialState: {...} })
 *   });
 * 
 * MAINTENANCE NOTES:
 * - All script tags injected will have data-imogi-app="{appKey}" attribute
 * - All link tags injected will have data-imogi-app="{appKey}" attribute
 * - Cleanup is automatically registered on page hide/unload
 * - Use window.__imogiDebugScripts() to inspect loaded scripts
 */

/**
 * Fetch operational context from server
 * CRITICAL: Defined early so it's available immediately when script loads
 * 
 * Returns operational context to be included in initialState
 * 
 * Usage:
 *   const operationalContext = await window.fetchOperationalContext();
 *   const initialState = {
 *     user: frappe.session.user,
 *     csrf_token: frappe.session.csrf_token,
 *     ...operationalContext  // Spread operational context
 *   };
 * 
 * @returns {Promise<Object>} Operational context object
 */
if (!window.fetchOperationalContext) {
	window.fetchOperationalContext = async function(options = {}) {
		const {
			syncServer = false,
			route = null,
			module = null
		} = options;
		try {
			const response = await frappe.call({
				method: 'imogi_pos.utils.operational_context.get_operational_context',
				freeze: false
			});
			
			if (response && response.message) {
				const ctx = response.message;
				const operationalContext = {
					pos_profile: ctx.current_pos_profile || ctx.active_context?.pos_profile || null,
					branch: ctx.current_branch || ctx.active_context?.branch || null,
					available_pos_profiles: ctx.available_pos_profiles || [],
					require_selection: ctx.require_selection || false,
					has_access: ctx.has_access !== false,
					is_privileged: ctx.is_privileged || false
				};
				
				console.log('[IMOGI Loader] Operational context loaded:', operationalContext);
				if (syncServer && typeof window.ensureOperationalContext === 'function') {
					try {
						await window.ensureOperationalContext({
							pos_profile: operationalContext.pos_profile,
							branch: operationalContext.branch,
							route,
							module
						});
					} catch (err) {
						console.warn('[IMOGI Loader] Failed to ensure operational context:', err);
					}
				}
				
				return operationalContext;
			}
			
			console.warn('[IMOGI Loader] No operational context in server response');
			return null;
		} catch (error) {
			console.warn('[IMOGI Loader] Failed to fetch operational context:', error);
			// Return null instead of throwing - let React handle redirect if needed
			return null;
		}
	};
	console.log('[IMOGI Loader] window.fetchOperationalContext registered');
} else {
	console.log('[IMOGI Loader] window.fetchOperationalContext already exists');
}

function setServerContextState(state) {
	const payload = {
		ready: Boolean(state.ready),
		loading: Boolean(state.loading),
		error: state.error || null,
		context: state.context || null
	};
	window.__IMOGI_SERVER_CONTEXT_STATE__ = payload;
	window.dispatchEvent(new CustomEvent('imogiServerContextUpdated', { detail: payload }));
}

if (!window.ensureOperationalContext) {
	window.ensureOperationalContext = async function(options = {}) {
		const {
			pos_profile = null,
			branch = null,
			route = null,
			module = null,
			force = false
		} = options;
		const routeKey = route || (typeof frappe !== 'undefined' && frappe.get_route_str
			? frappe.get_route_str()
			: window.location.pathname);
		
		if (!window.__imogiEnsureContextPromises) {
			window.__imogiEnsureContextPromises = {};
		}
		
		if (!force && window.__imogiEnsureContextPromises[routeKey]) {
			return window.__imogiEnsureContextPromises[routeKey];
		}
		
		setServerContextState({ ready: false, loading: true, error: null, context: null });
		
		const promise = frappe.call({
			method: 'imogi_pos.api.operational.ensure_context',
			args: {
				pos_profile,
				branch,
				route: routeKey,
				module
			},
			freeze: false
		})
			.then((response) => {
				const context = response?.message || response;
				setServerContextState({ ready: true, loading: false, error: null, context });
				return context;
			})
			.catch((error) => {
				const message = error?.message
					|| error?.response?.data?.message
					|| 'Failed to ensure operational context';
				setServerContextState({
					ready: false,
					loading: false,
					error: { message },
					context: null
				});
				throw error;
			});
		
		window.__imogiEnsureContextPromises[routeKey] = promise;
		return promise;
	};
	console.log('[IMOGI Loader] window.ensureOperationalContext registered');
}

window.loadImogiReactApp = function(config) {
	const {
		appKey,           // Unique identifier (e.g., 'cashier-console')
		scriptUrl,        // Full URL to the bundle JS
		cssUrl,           // Optional: Full URL to the bundle CSS
		mountFnName,      // Global mount function name (e.g., 'imogiCashierMount')
		unmountFnName,    // Optional: Global unmount function name
		containerId,      // Container element ID for logging
		makeContainer,    // Function that returns the container element
		onReadyMount,     // Callback: (mountFn, container) => mountFn(...)
		page,             // Optional: Frappe page object for cleanup registration
		logPrefix = '[IMOGI Loader]' // Optional: Custom log prefix
	} = config;

	// Validate required parameters
	if (!appKey || !scriptUrl || !mountFnName || !makeContainer || !onReadyMount) {
		console.error(`${logPrefix} Missing required parameters:`, {
			appKey: !!appKey,
			scriptUrl: !!scriptUrl,
			mountFnName: !!mountFnName,
			makeContainer: !!makeContainer,
			onReadyMount: !!onReadyMount
		});
		return Promise.reject(new Error('Invalid loadImogiReactApp configuration'));
	}

	// Get container element
	const container = makeContainer();
	if (!container) {
		console.error(`${logPrefix} [${appKey}] Container not found for ID: ${containerId}`);
		return Promise.reject(new Error(`Container ${containerId} not found`));
	}

	// Track load count for debugging
	if (!window.__imogiLoadCounts) {
		window.__imogiLoadCounts = {};
	}
	window.__imogiLoadCounts[appKey] = (window.__imogiLoadCounts[appKey] || 0) + 1;
	console.log(`${logPrefix} [${appKey}] Load attempt #${window.__imogiLoadCounts[appKey]}, route: ${frappe.get_route_str()}`);

	// Guard: Check if script already exists
	const scriptSelector = `script[data-imogi-app="${appKey}"][src="${scriptUrl}"]`;
	const existingScript = document.querySelector(scriptSelector);

	if (existingScript) {
		console.log(`${logPrefix} [${appKey}] Script already injected, reusing...`);
		return waitForMountFunction(mountFnName, appKey, logPrefix)
			.then(mountFn => {
				console.log(`${logPrefix} [${appKey}] Mount function ready, mounting...`);
				onReadyMount(mountFn, container);
				registerCleanup(appKey, unmountFnName, container, page, logPrefix);
			});
	}

	// Inject CSS if provided
	if (cssUrl) {
		injectCSS(appKey, cssUrl, logPrefix);
	}

	// Inject script and wait for mount function
	console.log(`${logPrefix} [${appKey}] Injecting script: ${scriptUrl}`);
	return injectScript(appKey, scriptUrl, logPrefix)
		.then(() => waitForMountFunction(mountFnName, appKey, logPrefix))
		.then(mountFn => {
			console.log(`${logPrefix} [${appKey}] Mount function ready, mounting...`);
			onReadyMount(mountFn, container);
			registerCleanup(appKey, unmountFnName, container, page, logPrefix);
		})
		.catch(error => {
			console.error(`${logPrefix} [${appKey}] Failed to load/mount:`, error);
			throw error;
		});
};

/**
 * Inject CSS with guard against duplicates
 */
function injectCSS(appKey, cssUrl, logPrefix) {
	const cssSelector = `link[data-imogi-app="${appKey}"][href="${cssUrl}"]`;
	const existingLink = document.querySelector(cssSelector);

	if (existingLink) {
		console.log(`${logPrefix} [${appKey}] CSS already injected, skipping...`);
		return;
	}

	console.log(`${logPrefix} [${appKey}] Injecting CSS: ${cssUrl}`);
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = cssUrl;
	link.dataset.imogiApp = appKey;
	document.head.appendChild(link);
}

/**
 * Inject script with guard and promise-based loading
 */
function injectScript(appKey, scriptUrl, logPrefix) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.type = 'module';
		script.src = scriptUrl;
		script.dataset.imogiApp = appKey;

		script.onload = () => {
			console.log(`${logPrefix} [${appKey}] Script loaded successfully`);
			resolve();
		};

		script.onerror = () => {
			const error = new Error(`Failed to load script: ${scriptUrl}`);
			console.error(`${logPrefix} [${appKey}]`, error);
			reject(error);
		};

		document.head.appendChild(script);
	});
}

/**
 * Wait for mount function to be available on window object
 * Uses polling with timeout to prevent infinite waiting
 */
function waitForMountFunction(mountFnName, appKey, logPrefix, timeout = 10000) {
	return new Promise((resolve, reject) => {
		// Check if already available
		if (typeof window[mountFnName] === 'function') {
			resolve(window[mountFnName]);
			return;
		}

		// Poll for mount function
		const startTime = Date.now();
		const checkInterval = setInterval(() => {
			if (typeof window[mountFnName] === 'function') {
				clearInterval(checkInterval);
				resolve(window[mountFnName]);
			} else if (Date.now() - startTime > timeout) {
				clearInterval(checkInterval);
				reject(new Error(`Timeout waiting for ${mountFnName} (${timeout}ms)`));
			}
		}, 100);

		// Store interval reference for cleanup
		if (!window.__imogiLoadIntervals) {
			window.__imogiLoadIntervals = {};
		}
		window.__imogiLoadIntervals[appKey] = checkInterval;
	});
}

/**
 * Register cleanup hooks for unmounting
 * Handles both Frappe page lifecycle and frappe.router events
 */
function registerCleanup(appKey, unmountFnName, container, page, logPrefix) {
	if (!unmountFnName) {
		console.log(`${logPrefix} [${appKey}] No unmount function specified, skipping cleanup registration`);
		return;
	}

	// Create cleanup function
	const cleanup = () => {
		if (typeof window[unmountFnName] === 'function') {
			console.log(`${logPrefix} [${appKey}] Unmounting...`);
			try {
				window[unmountFnName](container);
			} catch (error) {
				console.error(`${logPrefix} [${appKey}] Unmount error:`, error);
			}
		}

		// Clear any pending intervals
		if (window.__imogiLoadIntervals && window.__imogiLoadIntervals[appKey]) {
			clearInterval(window.__imogiLoadIntervals[appKey]);
			delete window.__imogiLoadIntervals[appKey];
		}
	};

	// Register cleanup on Frappe page hide (if page object available)
	if (page && typeof page.on_page_hide === 'function') {
		const originalOnHide = page.on_page_hide;
		page.on_page_hide = function() {
			cleanup();
			if (originalOnHide) {
				originalOnHide.call(this);
			}
		};
	}

	// Register cleanup on frappe.router change
	if (frappe && frappe.router) {
		frappe.router.on('change', () => {
			const currentRoute = frappe.get_route_str();
			// Only cleanup if we're navigating away from this app
			if (!currentRoute.includes(appKey.replace(/-/g, '_'))) {
				cleanup();
			}
		});
	}

	// Fallback: cleanup on window unload
	window.addEventListener('beforeunload', cleanup);
}

/**
 * Debug helper: List all injected IMOGI scripts
 * Usage: window.__imogiDebugScripts()
 * Returns: { 'cashier-console': 1, 'module-select': 1, ... }
 */
window.__imogiDebugScripts = function() {
	const scripts = document.querySelectorAll('script[data-imogi-app]');
	const counts = {};
	
	scripts.forEach(script => {
		const appKey = script.dataset.imogiApp;
		counts[appKey] = (counts[appKey] || 0) + 1;
	});

	console.log('[IMOGI Debug] Script injection counts:', counts);
	console.log('[IMOGI Debug] Load attempt counts:', window.__imogiLoadCounts || {});
	
	return counts;
};

console.log('[IMOGI Loader] Shared utility loaded. Use window.__imogiDebugScripts() for debugging.');
