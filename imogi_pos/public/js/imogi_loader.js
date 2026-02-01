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
	console.log('[IMOGI Loader] window.fetchOperationalContext registered');
} else {
	console.log('[IMOGI Loader] window.fetchOperationalContext already exists');
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
	
	const loadCount = window.__imogiLoadCounts[appKey];
	const isDev = frappe?.boot?.developer_mode || window.location.hostname === 'localhost';
	
	if (isDev) {
		console.log(`${logPrefix} [${appKey}] Load attempt #${loadCount}, route: ${frappe.get_route_str()}`);
	}

	// Guard: Check if script already exists
	const scriptSelector = `script[data-imogi-app="${appKey}"][src="${scriptUrl}"]`;
	const existingScript = document.querySelector(scriptSelector);

	if (existingScript) {
		if (isDev) {
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

console.log('[IMOGI Loader] Shared utility loaded');
console.log('[IMOGI Loader] Debug: window.__imogiDebugScripts()');
console.log('[IMOGI Loader] Force remount: window.__imogiForceRemount("cashier-console")');
