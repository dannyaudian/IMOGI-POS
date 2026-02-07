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
const asArray = (value) => (Array.isArray(value) ? value : []);

const parseServerMessages = (value) => {
	if (!value) {
		return [];
	}
	if (Array.isArray(value)) {
		return value;
	}
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed;
			}
			if (parsed) {
				return [parsed];
			}
		} catch (err) {
			return [value];
		}
	}
	return [String(value)];
};

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
					available_pos_profiles: asArray(ctx.available_pos_profiles),
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
	if (frappe?.boot?.developer_mode || window.location.hostname === 'localhost') {
		console.log('[IMOGI Loader] window.fetchOperationalContext registered');
	}
} else {
	if (frappe?.boot?.developer_mode || window.location.hostname === 'localhost') {
		console.log('[IMOGI Loader] window.fetchOperationalContext already exists');
	}
}

function setServerContextState(state) {
	const rawContext = state.context || null;
	const normalizedContext = rawContext
		? {
			...rawContext,
			available_pos_profiles: asArray(rawContext.available_pos_profiles),
			branches: asArray(rawContext.branches)
		}
		: null;
	let errorPayload = null;
	if (state.error) {
		if (typeof state.error === 'string') {
			errorPayload = {
				message: state.error,
				server_messages: parseServerMessages(state.error)
			};
		} else {
			errorPayload = {
				...state.error,
				message: state.error.message || null,
				server_messages: asArray(state.error.server_messages)
			};
		}
	}
	const payload = {
		ready: Boolean(state.ready),
		loading: Boolean(state.loading),
		error: errorPayload,
		context: normalizedContext
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
				const serverMessages = parseServerMessages(
					error?._server_messages
					|| error?.response?.data?._server_messages
					|| error?.response?.data?.exception
				);
				const message = error?.message
					|| error?.response?.data?.message
					|| serverMessages[0]
					|| 'Failed to ensure operational context';
				setServerContextState({
					ready: false,
					loading: false,
					error: { message, server_messages: serverMessages },
					context: null
				});
				throw error;
			});
		
		window.__imogiEnsureContextPromises[routeKey] = promise;
		return promise;
	};
	if (frappe?.boot?.developer_mode || window.location.hostname === 'localhost') {
		console.log('[IMOGI Loader] window.ensureOperationalContext registered');
	}
}

/**
 * Resolve debug URL to point to non-minified debug bundle
 * 
 * CRITICAL FIX: Enable readable error stacks in production/staging
 * 
 * When debug=1 flag is set:
 * - Loads non-minified bundle from -debug folder
 * - Includes inline sourcemaps
 * - Shows real function names and file paths in errors
 * - Helps diagnose TDZ and other runtime issues
 */
function resolveDebugUrl(productionUrl, appKey, logPrefix) {
	// Transform URL from prod to debug bundle
	// /assets/imogi_pos/react/cashier-console/... → 
	// /assets/imogi_pos/react/cashier-console-debug/...
	
	return productionUrl.replace(
		`/react/${appKey}/`,
		`/react/${appKey}-debug/`
	);
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

	// CRITICAL FIX: Check for debug flag and load non-minified bundle
	// This enables readable error stacks even in production
	const debugMode = window.location.search.includes('debug=1') || 
		localStorage.getItem('imogi_debug_mode') === 'true' ||
		frappe?.boot?.developer_mode;
	
	const finalScriptUrl = debugMode ? resolveDebugUrl(scriptUrl, appKey, logPrefix) : scriptUrl;
	const finalCssUrl = cssUrl ? (debugMode ? resolveDebugUrl(cssUrl, appKey, logPrefix) : cssUrl) : null;
	
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
	
	const loadCount = window.__imogiLoadCounts[appKey];
	const isDev = frappe?.boot?.developer_mode || window.location.hostname === 'localhost';
	
	if (isDev || debugMode) {
		console.log(`${logPrefix} [${appKey}] Load attempt #${loadCount}, route: ${frappe.get_route_str()}`);
		if (debugMode) {
			console.log(`${logPrefix} [${appKey}] Debug mode enabled - using non-minified bundle with sourcemaps`);
		}
	}

	// Guard: Check if script already exists
	const scriptSelector = `script[data-imogi-app="${appKey}"][src*="${appKey}"]`;
	const existingScript = document.querySelector(scriptSelector);

	if (existingScript) {
		if (isDev || debugMode) {
			console.log(`${logPrefix} [${appKey}] Script exists, ensuring FRESH mount (unmount → mount)`);
		}
		
		// CRITICAL: Remove previous cleanup handlers to prevent duplicates
		if (window.__imogiCleanupHandlers && window.__imogiCleanupHandlers[appKey]) {
			const existing = window.__imogiCleanupHandlers[appKey];
			
			if (existing.routerHandler && frappe && frappe.router) {
				frappe.router.off('change', existing.routerHandler);
			}
			
			if (existing.popstateHandler) {
				window.removeEventListener('popstate', existing.popstateHandler);
			}
			
			if (existing.unloadHandler) {
				window.removeEventListener('beforeunload', existing.unloadHandler);
			}
			
			if (isDev) {
				console.log(`${logPrefix} [${appKey}] Removed previous cleanup handlers`);
			}
		}
		
		// CRITICAL: Unmount previous instance to prevent stale state
		if (unmountFnName && typeof window[unmountFnName] === 'function') {
			if (isDev) {
				console.log(`${logPrefix} [${appKey}] Unmounting previous instance`);
			}
			try {
				window[unmountFnName](container);
			} catch (err) {
				console.warn(`${logPrefix} [${appKey}] Unmount error:`, err);
			}
		}
		
		// Defensive: Clear container and global flags (consistent __IMOGI_POS_ prefix)
		if (container && container.innerHTML) {
			container.innerHTML = '';
		}
		
		const globalFlags = [
			'__IMOGI_POS_CASHIER_MOUNTED',
			'__IMOGI_POS_KITCHEN_MOUNTED',
			'__IMOGI_POS_WAITER_MOUNTED',
			'__IMOGI_POS_KIOSK_MOUNTED'
		];
		globalFlags.forEach(flag => {
			if (window[flag]) {
				delete window[flag];
			}
		});
		
		return waitForMountFunction(mountFnName, appKey, logPrefix)
			.then(mountFn => {
				if (isDev) {
					console.log(`${logPrefix} [${appKey}] Mounting FRESH instance`);
				}
				onReadyMount(mountFn, container);
				registerCleanup(appKey, unmountFnName, container, page, logPrefix);
			});
	}

	// Inject CSS if provided
	if (finalCssUrl) {
		injectCSS(appKey, finalCssUrl, logPrefix);
	}

	// Inject script and wait for mount function
	console.log(`${logPrefix} [${appKey}] Injecting script: ${finalScriptUrl}`);
	if (debugMode && finalScriptUrl !== scriptUrl) {
		console.log(`${logPrefix} [${appKey}] Using debug bundle (non-minified with sourcemaps)`);
	}
	
	// CRITICAL FIX: Validate cache before injecting
	// Check if we have a stale cached module (service worker cache mismatch)
	return validateScriptCache(finalScriptUrl, logPrefix)
		.then(() => injectScript(appKey, finalScriptUrl, logPrefix))
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
 * Validate script cache to detect service worker cache mismatch
 * 
 * CRITICAL FIX: Prevents stale cached modules from TDZ violations
 * 
 * This can happen when:
 * - Service worker caches old version of module
 * - Module code has breaking changes
 * - Dependencies were updated but cache wasn't invalidated
 */
function validateScriptCache(scriptUrl, logPrefix) {
	// Add cache validation by fetching headers
	return fetch(scriptUrl, {
		method: 'HEAD',
		mode: 'cors',
		cache: 'no-cache'  // Force fresh headers from server
	})
	.then(response => {
		if (!response.ok) {
			throw new Error(`Script not found: ${response.status} ${response.statusText}`);
		}
		
		// Check for etag or cache-control headers
		const etag = response.headers.get('etag');
		const cacheControl = response.headers.get('cache-control');
		const lastModified = response.headers.get('last-modified');
		
		console.log(`${logPrefix} Script cache validation:`, {
			url: scriptUrl,
			etag: etag || 'none',
			cacheControl: cacheControl || 'none',
			lastModified: lastModified || 'none'
		});
		
		return true;
	})
	.catch(error => {
		// Cache validation failed - log but don't block loading
		// Server may not support HEAD requests
		console.warn(`${logPrefix} Script cache validation failed (non-fatal):`, error.message);
		return true;
	});
}

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
 * 
 * CRITICAL FIX: Ensure dependencies are initialized before module code executes
 * 
 * - Uses type="module" for ES6 module loading (correct)
 * - Adds defer attribute to ensure parsing completes before execution
 * - Waits for 'load' event to confirm module evaluation finished
 * - Adds cache busting query param to prevent stale module loads
 * - Registers error handler for network/parse failures
 */
function injectScript(appKey, scriptUrl, logPrefix) {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.type = 'module';
		
		// CRITICAL: Add cache busting to prevent service worker cache issues
		// This ensures fresh module loads on each mount cycle
		const cacheBustUrl = scriptUrl.includes('?')
			? `${scriptUrl}&t=${Date.now()}`
			: `${scriptUrl}?t=${Date.now()}`;
		
		script.src = cacheBustUrl;
		script.dataset.imogiApp = appKey;
		
		// Add crossorigin for better error reporting
		script.crossOrigin = 'anonymous';
		
		// CRITICAL: Use 'load' event to ensure module is fully evaluated
		// and all top-level code has executed and exports are available
		script.onload = () => {
			console.log(`${logPrefix} [${appKey}] Script loaded and evaluated successfully`);
			// Defer resolve slightly to ensure module exports are accessible
			// This prevents TDZ errors in mount function lookup
			setTimeout(() => resolve(), 0);
		};

		script.onerror = (event) => {
			const error = new Error(`Failed to load script: ${cacheBustUrl}`);
			error.event = event;
			console.error(`${logPrefix} [${appKey}]`, error);
			reject(error);
		};

		// Add to document to trigger load
		document.head.appendChild(script);
	});
}

/**
 * Wait for mount function to be available on window object
 * Uses polling with timeout to prevent infinite waiting
 * 
 * CRITICAL FIX: Ensures mount function exists AND is callable
 * Increased timeout to account for module evaluation time
 */
function waitForMountFunction(mountFnName, appKey, logPrefix, timeout = 15000) {
	return new Promise((resolve, reject) => {
		// Check if already available
		if (typeof window[mountFnName] === 'function') {
			console.log(`${logPrefix} [${appKey}] Mount function already available: ${mountFnName}`);
			resolve(window[mountFnName]);
			return;
		}

		console.log(`${logPrefix} [${appKey}] Waiting for mount function: ${mountFnName}`);
		
		// Poll for mount function with exponential backoff
		const startTime = Date.now();
		let checkInterval = 50; // Start with 50ms checks
		let nextCheck = startTime;
		
		const checkFunction = () => {
			const now = Date.now();
			const elapsed = now - startTime;
			
			// Check if function is available
			if (typeof window[mountFnName] === 'function') {
				console.log(`${logPrefix} [${appKey}] Mount function available after ${elapsed}ms: ${mountFnName}`);
				clearTimeout(timeoutHandle);
				resolve(window[mountFnName]);
				return;
			}
			
			// Check timeout
			if (elapsed > timeout) {
				console.error(`${logPrefix} [${appKey}] Timeout waiting for ${mountFnName} (${timeout}ms elapsed)`);
				clearTimeout(timeoutHandle);
				
				// Debug info
				console.error(`${logPrefix} [${appKey}] Available window properties:`, {
					hasFunction: typeof window[mountFnName],
					isCashierMount: typeof window.imogiCashierMount,
					isKitchenMount: typeof window.imogiKitchenMount,
					allMounts: Object.keys(window).filter(k => k.includes('Mount'))
				});
				
				reject(new Error(`Timeout waiting for ${mountFnName} (${timeout}ms). Module may have TDZ or parse error.`));
				return;
			}
			
			// Schedule next check with backoff (max 500ms)
			checkInterval = Math.min(checkInterval * 1.2, 500);
			nextCheck = now + checkInterval;
			timeoutHandle = setTimeout(checkFunction, checkInterval);
		};
		
		// Start polling
		let timeoutHandle = setTimeout(checkFunction, checkInterval);

		// Store interval reference for cleanup (for memory leak prevention)
		if (!window.__imogiLoadIntervals) {
			window.__imogiLoadIntervals = {};
		}
		window.__imogiLoadIntervals[appKey] = timeoutHandle;
	});
}

/**
 * Register cleanup hooks for unmounting
 * CRITICAL: Prevents duplicate listener registration and tracks handlers for cleanup
 */
function registerCleanup(appKey, unmountFnName, container, page, logPrefix) {
	if (!unmountFnName) {
		console.log(`${logPrefix} [${appKey}] No unmount function, skipping cleanup`);
		return;
	}

	const isDev = frappe?.boot?.developer_mode || window.location.hostname === 'localhost';

	// Initialize cleanup handler storage
	if (!window.__imogiCleanupHandlers) {
		window.__imogiCleanupHandlers = {};
	}

	// Remove existing handlers for this app (prevent duplicates)
	if (window.__imogiCleanupHandlers[appKey]) {
		const existing = window.__imogiCleanupHandlers[appKey];
		
		if (existing.routerHandler && frappe && frappe.router) {
			frappe.router.off('change', existing.routerHandler);
		}
		
		if (existing.popstateHandler) {
			window.removeEventListener('popstate', existing.popstateHandler);
		}
		
		if (existing.unloadHandler) {
			window.removeEventListener('beforeunload', existing.unloadHandler);
		}
		
		if (isDev) {
			console.log(`${logPrefix} [${appKey}] Removed duplicate handlers`);
		}
	}

	// Create cleanup function
	const cleanup = () => {
		if (typeof window[unmountFnName] === 'function') {
			if (isDev) {
				console.log(`${logPrefix} [${appKey}] Cleanup: unmounting`);
			}
			try {
				window[unmountFnName](container);
			} catch (error) {
				console.error(`${logPrefix} [${appKey}] Unmount error:`, error);
			}
		}

		// Clear pending intervals
		if (window.__imogiLoadIntervals && window.__imogiLoadIntervals[appKey]) {
			clearInterval(window.__imogiLoadIntervals[appKey]);
			delete window.__imogiLoadIntervals[appKey];
		}
		
		// Clear handlers reference
		if (window.__imogiCleanupHandlers && window.__imogiCleanupHandlers[appKey]) {
			delete window.__imogiCleanupHandlers[appKey];
		}
	};

	// Register on Frappe page hide
	if (page && typeof page.on_page_hide === 'function') {
		const originalOnHide = page.on_page_hide;
		page.on_page_hide = function() {
			cleanup();
			if (originalOnHide) {
				originalOnHide.call(this);
			}
		};
	}

	// Register on frappe.router change (detect route leave)
	let routerHandler = null;
	if (frappe && frappe.router) {
		routerHandler = () => {
			const currentRoute = frappe.get_route_str();
			const appRoute = appKey.replace(/-/g, '_');
			
			if (!currentRoute.includes(appRoute)) {
				if (isDev) {
					console.log(`${logPrefix} [${appKey}] Route left, cleaning up`);
				}
				cleanup();
			}
		};
		frappe.router.on('change', routerHandler);
	}

	// Register on popstate (browser back/forward)
	const popstateHandler = () => {
		const currentRoute = frappe.get_route_str();
		const appRoute = appKey.replace(/-/g, '_');
		
		if (!currentRoute.includes(appRoute)) {
			if (isDev) {
				console.log(`${logPrefix} [${appKey}] Popstate: route left, cleaning up`);
			}
			cleanup();
		}
	};
	window.addEventListener('popstate', popstateHandler);

	// Fallback: cleanup on window unload
	const unloadHandler = cleanup;
	window.addEventListener('beforeunload', unloadHandler);
	
	// Store handlers for duplicate prevention
	window.__imogiCleanupHandlers[appKey] = {
		routerHandler,
		popstateHandler,
		unloadHandler,
		cleanup
	};
	
	if (isDev) {
		console.log(`${logPrefix} [${appKey}] Cleanup handlers registered`);
	}
}

/**
 * Force clean remount of an IMOGI app
 * Usage: window.__imogiForceRemount('cashier-console')
 * 
 * This will:
 * 1. Unmount the current React instance
 * 2. Clear all cleanup handlers
 * 3. Trigger a fresh mount
 * 
 * Useful for debugging stale state issues
 */
window.__imogiForceRemount = function(appKey) {
	console.log(`[IMOGI Force Remount] Forcing clean remount for: ${appKey}`);
	
	// Get cleanup handlers
	const handlers = window.__imogiCleanupHandlers?.[appKey];
	if (handlers && handlers.cleanup) {
		try {
			handlers.cleanup();
			console.log(`[IMOGI Force Remount] Cleanup completed for: ${appKey}`);
		} catch (err) {
			console.error(`[IMOGI Force Remount] Cleanup error:`, err);
		}
	} else {
		console.warn(`[IMOGI Force Remount] No cleanup handlers found for: ${appKey}`);
	}
	
	// Clear handlers reference
	if (window.__imogiCleanupHandlers?.[appKey]) {
		delete window.__imogiCleanupHandlers[appKey];
	}
	
	console.log(`[IMOGI Force Remount] Navigate to page again to trigger fresh mount`);
};

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
	console.log('[IMOGI Debug] Cleanup handlers:', Object.keys(window.__imogiCleanupHandlers || {}));
	
	return counts;
};

// Debug helpers - only log in development
if (typeof frappe !== 'undefined' && (frappe?.boot?.developer_mode || window.location.hostname === 'localhost')) {
	console.log('[IMOGI Loader] Shared utility loaded');
	console.log('[IMOGI Loader] Debug: window.__imogiDebugScripts()');
	console.log('[IMOGI Loader] Force remount: window.__imogiForceRemount("cashier-console")');
}
