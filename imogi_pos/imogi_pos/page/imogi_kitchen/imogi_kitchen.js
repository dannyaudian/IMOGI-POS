frappe.pages['imogi-kitchen'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Kitchen Display',
		single_column: true
	});

	const container = page.main.find('.page-content');
	container.attr('id', 'imogi-kitchen-root');

	// Gate: Check operational context before mounting widget
	frappe.call({
		method: 'imogi_pos.utils.operational_context.get_operational_context',
		callback: function(r) {
			if (r.message && r.message.pos_profile) {
				console.log('[imogi-kitchen] Operational context found:', r.message);
				loadReactWidget(container, page);
			} else {
				console.warn('[imogi-kitchen] No operational context found. Redirecting to module-select...');
				frappe.set_route('imogi-module-select', { 
					reason: 'missing_pos_profile', 
					target: 'imogi-kitchen' 
				});
			}
		},
		error: function(err) {
			console.error('[imogi-kitchen] Failed to check operational context:', err);
			frappe.set_route('imogi-module-select', { 
				reason: 'missing_pos_profile', 
				target: 'imogi-kitchen' 
			});
		}
	});

	function loadReactWidget(container, page) {
		// Fetch manifest from build output
		frappe.call({
			method: 'frappe.client.get_file',
			args: {
				file_url: '/assets/imogi_pos/react/kitchen/.vite/manifest.json'
			},
			callback: function(r) {
				try {
					const manifest = JSON.parse(r.message);
					const entry = manifest['main.jsx'];
					
					if (!entry) {
						console.error('[imogi-kitchen] No main.jsx entry found in manifest');
						frappe.msgprint({
							title: 'Widget Load Error',
							indicator: 'red',
							message: 'Failed to load Kitchen Display widget. Please contact administrator.'
						});
						return;
					}

					const cssPath = entry.css ? `/assets/imogi_pos/react/kitchen/${entry.css[0]}` : null;
					const jsPath = `/assets/imogi_pos/react/kitchen/${entry.file}`;

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
						script.dataset.imogiApp = 'kitchen';
						script.onload = function() {
							mountWidget(container[0], page);
						};
						script.onerror = function() {
							console.error('[imogi-kitchen] Failed to load widget script:', jsPath);
							frappe.msgprint({
								title: 'Widget Load Error',
								indicator: 'red',
								message: 'Failed to load Kitchen Display widget. Please contact administrator.'
							});
						};
						document.body.appendChild(script);
					} else {
						// Script already loaded, mount directly
						mountWidget(container[0], page);
					}
				} catch (err) {
					console.error('[imogi-kitchen] Manifest parse error:', err);
					frappe.msgprint({
						title: 'Widget Load Error',
						indicator: 'red',
						message: 'Failed to parse widget manifest. Please contact administrator.'
					});
				}
			},
			error: function(err) {
				console.error('[imogi-kitchen] Failed to fetch manifest:', err);
				frappe.msgprint({
					title: 'Widget Load Error',
					indicator: 'red',
					message: 'Failed to load Kitchen Display manifest. Please contact administrator.'
				});
			}
		});
	}

	function mountWidget(element, page) {
		try {
			console.log('[imogi-kitchen] Mounting widget...');
			safeMount(window.imogiKitchenMount, element, { page });
		} catch (error) {
			console.error('[imogi-kitchen] window.imogiKitchenMount not found', error);
			frappe.msgprint({
				title: 'Widget Mount Error',
				indicator: 'red',
				message: error.message || 'Widget mount function not available. Please refresh the page.'
			});
		}
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
};

// Cleanup on page unload
frappe.pages['imogi-kitchen'].on_page_show = function(wrapper) {
	const container = wrapper.querySelector('#imogi-kitchen-root');
	if (container && typeof window.imogiKitchenUnmount === 'function') {
		console.log('[imogi-kitchen] Unmounting widget on page show...');
		window.imogiKitchenUnmount(container);
	}
};
