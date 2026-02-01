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
	
	// Track mount state and last route
	wrapper.__imogiReactMounted = false;
	wrapper.__imogiLastRoute = null;
	
	// METHOD 1: frappe.router listener (primary - most reliable)
	if (!wrapper.__imogiRouterHandler && frappe && frappe.router) {
		wrapper.__imogiRouterHandler = function() {
			const currentRoute = frappe.get_route_str();
			const isOnCashierRoute = currentRoute.includes('imogi-cashier');
			const routeChanged = wrapper.__imogiLastRoute !== currentRoute;
			
			if (!routeChanged) return; // Skip if route didn't actually change
			
			console.log('🔄 [ROUTER CHANGE] Route changed', {
				from: wrapper.__imogiLastRoute,
				to: currentRoute,
				isOnCashierRoute: isOnCashierRoute,
				reactMounted: wrapper.__imogiReactMounted,
				timestamp: new Date().toISOString()
			});
			
			wrapper.__imogiLastRoute = currentRoute;
			
			// If navigating away from cashier, unmount React IMMEDIATELY
			if (!isOnCashierRoute && wrapper.__imogiReactMounted) {
				console.log('🔴 [ROUTER] Navigating AWAY from Cashier → unmounting');
				if (wrapper.__imogiCashierRoot && window.imogiCashierUnmount) {
					try {
						window.imogiCashierUnmount(wrapper.__imogiCashierRoot);
						wrapper.__imogiReactMounted = false;
					} catch (err) {
						console.error('[Cashier] Unmount error:', err);
					}
				}
			}
		};
		
		frappe.router.on('change', wrapper.__imogiRouterHandler);
		console.log('✅ [Cashier] frappe.router listener registered');
	}
	
	// METHOD 2: popstate listener (back/forward buttons)
	if (!wrapper.__imogiPopstateHandler) {
		wrapper.__imogiPopstateHandler = function(event) {
			const currentRoute = frappe.get_route_str();
			
			console.log('🔄 [POPSTATE] Browser navigation', {
				state: event.state,
				route: currentRoute
			});
			
			// Always unmount first when using popstate
			if (wrapper.__imogiReactMounted && wrapper.__imogiCashierRoot) {
				window.imogiCashierUnmount(wrapper.__imogiCashierRoot);
				wrapper.__imogiReactMounted = false;
			}
			
			// Then remount if on cashier route
			if (currentRoute.includes('imogi-cashier')) {
				console.log('🟢 [POPSTATE] Back to Cashier → force remount');
				setTimeout(() => {
					if (wrapper.__imogiCashierRoot) {
						loadReactWidget(wrapper.__imogiCashierRoot, wrapper.__imogiCashierPage, true);
					}
				}, 50);
			}
		};
		window.addEventListener('popstate', wrapper.__imogiPopstateHandler);
		console.log('✅ [Cashier] popstate listener registered');
	}
	
	// METHOD 3: MutationObserver fallback (catches DOM-based route changes)
	if (!wrapper.__imogiMutationObserver && typeof MutationObserver !== 'undefined') {
		let lastHref = window.location.href;
		
		wrapper.__imogiMutationObserver = new MutationObserver(() => {
			if (window.location.href !== lastHref) {
				const oldHref = lastHref;
				lastHref = window.location.href;
				
				const currentRoute = frappe.get_route_str();
				const wasOnCashier = oldHref.includes('imogi-cashier');
				const isOnCashier = currentRoute.includes('imogi-cashier');
				
				console.log('🔄 [MUTATION] URL changed', {
					from: oldHref,
					to: window.location.href,
					wasOnCashier,
					isOnCashier
				});
				
				// Navigating away from cashier
				if (wasOnCashier && !isOnCashier && wrapper.__imogiReactMounted) {
					console.log('🔴 [MUTATION] Left Cashier → unmounting');
					if (wrapper.__imogiCashierRoot && window.imogiCashierUnmount) {
						window.imogiCashierUnmount(wrapper.__imogiCashierRoot);
						wrapper.__imogiReactMounted = false;
					}
				}
			}
		});
		
		wrapper.__imogiMutationObserver.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: false
		});
		
		console.log('✅ [Cashier] MutationObserver fallback registered');
	}
	
	// Cleanup function for proper teardown
	wrapper.__imogiCleanup = function() {
		console.log('🧹 [Cashier] Running cleanup');
		
		// Remove router listener
		if (wrapper.__imogiRouterHandler && frappe && frappe.router) {
			frappe.router.off('change', wrapper.__imogiRouterHandler);
			wrapper.__imogiRouterHandler = null;
		}
		
		// Remove popstate listener
		if (wrapper.__imogiPopstateHandler) {
			window.removeEventListener('popstate', wrapper.__imogiPopstateHandler);
			wrapper.__imogiPopstateHandler = null;
		}
		
		// Disconnect mutation observer
		if (wrapper.__imogiMutationObserver) {
			wrapper.__imogiMutationObserver.disconnect();
			wrapper.__imogiMutationObserver = null;
		}
		
		// Unmount React completely
		if (wrapper.__imogiCashierRoot && window.imogiCashierUnmount) {
			try {
				window.imogiCashierUnmount(wrapper.__imogiCashierRoot);
				wrapper.__imogiReactMounted = false;
			} catch (err) {
				console.error('[Cashier] Cleanup unmount error:', err);
			}
		}
		
		// Clear route tracking
		wrapper.__imogiLastRoute = null;
	};
	
	// Register cleanup on page hide
	if (page && typeof page.on_page_hide === 'function') {
		const originalOnHide = page.on_page_hide;
		page.on_page_hide = function() {
			console.log('🔴 [PAGE HIDE] Cashier page hidden');
			if (wrapper.__imogiCleanup) {
				wrapper.__imogiCleanup();
			}
			if (originalOnHide) {
				originalOnHide.call(this);
			}
		};
	}
};

frappe.pages['imogi-cashier'].on_page_show = function(wrapper) {
	const isDev = frappe?.boot?.developer_mode || window.location.hostname === 'localhost';
	const currentRoute = frappe.get_route_str();
	
	if (isDev) {
		console.log('🟢 [PAGE SHOW] Cashier', {
			route: currentRoute,
			reactMounted: wrapper.__imogiReactMounted,
			timestamp: new Date().toISOString()
		});
	}
	
	const container = wrapper.__imogiCashierRoot;
	const page = wrapper.__imogiCashierPage;
	
	if (!container) {
		console.error('[Cashier] Container not found, on_page_load not run?');
		return;
	}

	// CRITICAL: Always unmount existing instance first for clean state
	if (wrapper.__imogiReactMounted && window.imogiCashierUnmount) {
		if (isDev) {
			console.log('🔄 [PAGE SHOW] Unmounting existing React instance');
		}
		try {
			window.imogiCashierUnmount(container);
		} catch (err) {
			console.warn('[PAGE SHOW] Unmount error:', err);
		}
		wrapper.__imogiReactMounted = false;
	}
	
	// Use requestAnimationFrame for robust DOM cleanup timing
	// More reliable than setTimeout across different devices/browsers
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (isDev) {
				console.log('🚀 [PAGE SHOW] Loading React widget');
			}
			
			// Load fresh React instance
			loadReactWidget(container, page, true);
			
			// Mark as mounted
			wrapper.__imogiReactMounted = true;
			wrapper.__imogiLastRoute = currentRoute;
			
			if (isDev) {
				console.log('✅ [PAGE SHOW] React mounted successfully');
			}
		});
	});
	
	// Clean up URL params
	const urlParams = new URLSearchParams(window.location.search);
	if (urlParams.has('_reload')) {
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
							operationalContext = await window.fetchOperationalContext({
								syncServer: true,
								route: frappe.get_route_str(),
								module: 'cashier-console'
							});
						} catch (err) {
							console.warn('[Cashier] Failed to fetch operational context:', err);
						}
					} else {
						// Not critical - React will fetch context itself using useOperationalContext hook
						console.debug('[Cashier] window.fetchOperationalContext not available, React will fetch context');
					}
					
					const serverContextState = window.__IMOGI_SERVER_CONTEXT_STATE__ || {};
					const initialState = {
						user: frappe.session.user,
						csrf_token: frappe.session.csrf_token,
						serverContextReady: Boolean(serverContextState.ready),
						serverContextError: serverContextState.error || null,
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
