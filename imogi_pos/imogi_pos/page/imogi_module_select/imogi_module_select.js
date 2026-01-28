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
 */

frappe.pages['imogi-module-select'].on_page_load = function(wrapper) {
	console.count('[Desk] on_page_load called');
	
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

	// Load React bundle and mount widget
	loadReactWidget(container, page);
};

frappe.pages['imogi-module-select'].on_page_show = function() {
	// Page shown - widget already mounted
	console.count('[Desk] Module Select page shown');
	
	// Phase 4: Restore UI visibility
	const container = document.querySelector('#imogi-module-select-root');
	if (container) {
		container.style.display = '';
		console.log('[Desk] Module Select UI restored (display reset)');
	}
};

frappe.pages['imogi-module-select'].on_page_hide = function() {
	// Page hidden - keep widget mounted (preserve state)
	// Note: Frappe may reuse the same page instance, so we don't unmount
	console.count('[Desk] Module Select page hidden');
	
	// Phase 4: Hide UI to prevent DOM overlay/clash with other pages
	const container = document.querySelector('#imogi-module-select-root');
	if (container) {
		container.style.display = 'none';
		console.log('[Desk] Module Select UI hidden (display:none)');
	}
	
	// Optional: Uncomment below to force unmount on hide (may cause state loss)
	// if (container && window.imogiModuleSelectUnmount) {
	//   window.imogiModuleSelectUnmount(container);
	//   container.__imogiModuleSelectMounted = false;
	// }
};

function loadReactWidget(container, page) {
	console.count('[Desk] loadReactWidget called');
	
	// ✅ GUARD: Check both mount function AND script tag with exact src validation
	const scriptExists = [...document.querySelectorAll('script[data-imogi-app="module-select"]')]
		.some(s => (s.src || '').includes('/assets/imogi_pos/react/module-select/'));
	
	if (window.imogiModuleSelectMount && scriptExists) {
		console.log('[Desk] Bundle already loaded (verified src), using existing mount function');
		mountWidget(container, page);
		return;
	}

	// Guard: ensure bundle only loads once even if page is re-mounted
	if (!window.__imogiModuleSelectLoading) {
		window.__imogiModuleSelectLoading = new Promise((resolve, reject) => {
			const manifestCandidates = [
				'/assets/imogi_pos/react/module-select/.vite/manifest.json'
			];

			fetchManifest(manifestCandidates)
				.then(manifest => {
					const entry = findManifestEntry(manifest);
					if (!entry) {
						throw new Error('Entry point not found in manifest');
					}

					const scriptUrl = `/assets/imogi_pos/react/module-select/${entry.file}`;
					const scriptSelector = `script[data-imogi-app="module-select"][src="${scriptUrl}"]`;
					const existingScript = document.querySelector(scriptSelector);

					if (!existingScript) {
						console.count('[Desk] Injecting new script tag');
						const script = document.createElement('script');
						script.type = 'module';
						script.src = scriptUrl;
						script.dataset.imogiApp = 'module-select';

						script.onload = () => {
							console.log('[Desk] Module Select bundle loaded');
							resolve(true);
						};

						script.onerror = () => {
							reject(new Error('Failed to load module-select script'));
						};

						document.head.appendChild(script);
					} else {
						resolve(true);
					}

					// Load CSS if available
					if (entry.css && entry.css.length > 0) {
						const cssUrl = `/assets/imogi_pos/react/module-select/${entry.css[0]}`;
						const cssSelector = `link[data-imogi-app="module-select"][href="${cssUrl}"]`;
						if (!document.querySelector(cssSelector)) {
							const link = document.createElement('link');
							link.rel = 'stylesheet';
							link.href = cssUrl;
							link.dataset.imogiApp = 'module-select';
							document.head.appendChild(link);
						}
					}
				})
				.catch(reject);
		});
	}

	window.__imogiModuleSelectLoading
		.then(() => {
			// Wait for mount function to be available
			const checkMount = setInterval(() => {
				if (window.imogiModuleSelectMount) {
					clearInterval(checkMount);
					mountWidget(container, page);
				}
			}, 100);
		})
		.catch(error => {
			if (error.manifestNotFound) {
				console.error(`[Desk] Module Select manifest not found: ${error.manifestPath}`);
			} else {
				console.error('[Desk] Failed to load module-select bundle:', error);
			}
			showBundleError(container, 'module-select');
		});
}

function fetchManifest(candidates) {
	const [current, ...rest] = candidates;
	if (!current) {
		return Promise.reject(new Error('No manifest paths available'));
	}

	return fetch(current).then(response => {
		if (!response.ok) {
			if (rest.length === 0) {
				const error = new Error(`Manifest not found: ${current}`);
				error.manifestNotFound = true;
				error.manifestPath = current;
				throw error;
			}
			return fetchManifest(rest);
		}
		return response.json();
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

function mountWidget(container, page) {
	console.count('[Desk] mountWidget called');
	console.log('[Desk] Mount stack trace:', new Error().stack);
	
	try {
		if (container[0].__imogiModuleSelectMounted) {
			console.warn('[Desk] Module Select widget already mounted, skipping');
			return;
		}

		// Prepare initial state
		const initialState = {
			user: frappe.session.user,
			csrf_token: frappe.session.csrf_token
		};

		// Mount React widget
		safeMount(window.imogiModuleSelectMount, container[0], { initialState });
		container[0].__imogiModuleSelectMounted = true;
		console.log('[Desk] Module Select widget mounted');

	} catch (error) {
		console.error('[Desk] Failed to mount module-select widget:', error);
		showMountError(container, error);
	}
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
	container[0].innerHTML = `
		<div style="padding: 2rem; text-align: center; color: #dc2626; max-width: 600px; margin: 2rem auto; border: 2px solid #dc2626; border-radius: 8px; background: #fef2f2;">
			<h3 style="margin-bottom: 1rem;">⚠️ React Bundle Not Found</h3>
			<p style="margin-bottom: 1rem;">The React bundle for <strong>${appName}</strong> needs to be built.</p>
			<div style="background: #1f2937; color: #10b981; padding: 1rem; border-radius: 4px; font-family: monospace; text-align: left;">
				<div style="color: #6b7280; margin-bottom: 0.5rem;"># Build the React app:</div>
				<div>VITE_APP=${appName} npx vite build</div>
			</div>
			<p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
				After building, refresh this page.
			</p>
		</div>
	`;
}

function showMountError(container, error) {
	container[0].innerHTML = `
		<div style="padding: 2rem; text-align: center; color: #dc2626; max-width: 600px; margin: 2rem auto;">
			<h3>Widget Mount Error</h3>
			<p>${error.message || 'Failed to mount React widget'}</p>
			<button class="btn btn-primary btn-sm" onclick="location.reload()">Reload Page</button>
		</div>
	`;
}
