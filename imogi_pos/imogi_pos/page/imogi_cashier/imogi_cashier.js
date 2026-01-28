/**
 * IMOGI Cashier Console - True Hybrid Desk Page
 * 
 * This page mounts the React cashier-console widget directly in Frappe Desk.
 * NO redirect to WWW - unified desk world.
 * 
 * GATE: Checks operational context, redirects to module-select if missing.
 */

frappe.pages['imogi-cashier'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'IMOGI Cashier Console',
		single_column: true
	});

	// Create container for React widget
	const container = $(document.createElement('div'));
	container.attr('id', 'imogi-cashier-root');
	container.attr('style', 'width: 100%; height: calc(100vh - 60px); overflow: auto;');
	page.main.html('');
	page.main.append(container);

	// Check operational context before loading widget
	checkOperationalContext(container, page);
};

function checkOperationalContext(container, page) {
	frappe.call({
		method: 'imogi_pos.utils.operational_context.get_operational_context',
		callback: function(r) {
			if (r.message && r.message.pos_profile) {
				// Context exists - load widget
				loadReactWidget(container, page);
			} else {
				// No context - redirect to module-select with reason
				const reason = 'missing_pos_profile';
				const target = 'imogi-cashier';
				frappe.set_route('imogi-module-select', { reason, target });
			}
		},
		error: function() {
			// Error checking context - redirect to module-select
			frappe.set_route('imogi-module-select');
		}
	});
}

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
			const entry = manifest['main.jsx'];
			if (!entry) {
				throw new Error('Entry point not found in manifest');
			}

			const scriptUrl = `/assets/imogi_pos/react/cashier-console/${entry.file}`;
			const script = document.createElement('script');
			script.type = 'module';
			script.src = scriptUrl;
			
			script.onload = () => {
				console.log('[Desk] cashier-console bundle loaded');
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

		safeMount(window.imogiCashierMount, container[0], { initialState });
		console.log('[Desk] cashier-console widget mounted');

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
	container[0].innerHTML = `
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
	container[0].innerHTML = `
		<div style="padding: 2rem; text-align: center; color: #dc2626;">
			<h3>Widget Mount Error</h3>
			<p>${error.message || 'Failed to mount React widget'}</p>
			<button class="btn btn-primary btn-sm" onclick="location.reload()">Reload Page</button>
		</div>
	`;
}
