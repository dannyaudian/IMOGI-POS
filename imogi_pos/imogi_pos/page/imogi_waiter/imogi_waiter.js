frappe.pages['imogi-waiter'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Waiter Order',
		single_column: true
	});

	const container = page.main.find('.page-content');
	container.attr('id', 'imogi-waiter-root');

	// Gate: Check operational context before mounting widget
	frappe.call({
		method: 'imogi_pos.utils.operational_context.get_operational_context',
		callback: function(r) {
			if (r.message && r.message.pos_profile) {
				console.log('[imogi-waiter] Operational context found:', r.message);
				loadReactWidget(container, page);
			} else {
				console.warn('[imogi-waiter] No operational context found. Redirecting to module-select...');
				frappe.set_route('imogi-module-select', { 
					reason: 'missing_pos_profile', 
					target: 'imogi-waiter' 
				});
			}
		},
		error: function(err) {
			console.error('[imogi-waiter] Failed to check operational context:', err);
			frappe.set_route('imogi-module-select', { 
				reason: 'missing_pos_profile', 
				target: 'imogi-waiter' 
			});
		}
	});

	function loadReactWidget(container, page) {
		// Fetch manifest from build output
		frappe.call({
			method: 'frappe.client.get_file',
			args: {
				file_url: '/assets/imogi_pos/react/waiter/.vite/manifest.json'
			},
			callback: function(r) {
				try {
					const manifest = JSON.parse(r.message);
					const entry = manifest['main.jsx'];
					
					if (!entry) {
						console.error('[imogi-waiter] No main.jsx entry found in manifest');
						frappe.msgprint({
							title: 'Widget Load Error',
							indicator: 'red',
							message: 'Failed to load Waiter Console widget. Please contact administrator.'
						});
						return;
					}

					const cssPath = entry.css ? `/assets/imogi_pos/react/waiter/${entry.css[0]}` : null;
					const jsPath = `/assets/imogi_pos/react/waiter/${entry.file}`;

					// Load CSS if exists
					if (cssPath && !document.querySelector(`link[href="${cssPath}"]`)) {
						const link = document.createElement('link');
						link.rel = 'stylesheet';
						link.href = cssPath;
						document.head.appendChild(link);
					}

					// Load JS and mount widget
					if (!document.querySelector(`script[src="${jsPath}"]`)) {
						const script = document.createElement('script');
						script.src = jsPath;
						script.type = 'module';
						script.onload = function() {
							mountWidget(container[0], page);
						};
						script.onerror = function() {
							console.error('[imogi-waiter] Failed to load widget script:', jsPath);
							frappe.msgprint({
								title: 'Widget Load Error',
								indicator: 'red',
								message: 'Failed to load Waiter Console widget. Please contact administrator.'
							});
						};
						document.body.appendChild(script);
					} else {
						// Script already loaded, mount directly
						mountWidget(container[0], page);
					}
				} catch (err) {
					console.error('[imogi-waiter] Manifest parse error:', err);
					frappe.msgprint({
						title: 'Widget Load Error',
						indicator: 'red',
						message: 'Failed to parse widget manifest. Please contact administrator.'
					});
				}
			},
			error: function(err) {
				console.error('[imogi-waiter] Failed to fetch manifest:', err);
				frappe.msgprint({
					title: 'Widget Load Error',
					indicator: 'red',
					message: 'Failed to load Waiter Console manifest. Please contact administrator.'
				});
			}
		});
	}

	function mountWidget(element, page) {
		try {
			console.log('[imogi-waiter] Mounting widget...');
			safeMount(window.imogiWaiterMount, element, { page });
		} catch (error) {
			console.error('[imogi-waiter] window.imogiWaiterMount not found', error);
			frappe.msgprint({
				title: 'Widget Mount Error',
				indicator: 'red',
				message: error.message || 'Widget mount function not available. Please refresh the page.'
			});
		}
	}

	function safeMount(mountFn, element, options) {
		if (!(element instanceof HTMLElement)) {
			throw new Error('Invalid mount element: expected HTMLElement for waiter');
		}
		if (typeof mountFn !== 'function') {
			throw new Error('Waiter mount function is not available');
		}
		return mountFn(element, options);
	}
};

// Cleanup on page unload
frappe.pages['imogi-waiter'].on_page_show = function(wrapper) {
	const container = wrapper.querySelector('#imogi-waiter-root');
	if (container && typeof window.imogiWaiterUnmount === 'function') {
		console.log('[imogi-waiter] Unmounting widget on page show...');
		window.imogiWaiterUnmount(container);
	}
};
