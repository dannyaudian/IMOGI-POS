frappe.pages['imogi-displays'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Customer Display',
		single_column: true
	});

	const container = page.main.find('.page-content');
	container.attr('id', 'imogi-displays-root');

	// Note: Customer display does NOT require operational context (guest-accessible)
	// Mount directly without context gate
	loadReactWidget(container, page);

	function loadReactWidget(container, page) {
		// Fetch manifest from build output
		frappe.call({
			method: 'frappe.client.get_file',
			args: {
				file_url: '/assets/imogi_pos/react/customer-display/.vite/manifest.json'
			},
			callback: function(r) {
				try {
					const manifest = JSON.parse(r.message);
					const entry = manifest['main.jsx'];
					
					if (!entry) {
						console.error('[imogi-displays] No main.jsx entry found in manifest');
						frappe.msgprint({
							title: 'Widget Load Error',
							indicator: 'red',
							message: 'Failed to load Customer Display widget. Please contact administrator.'
						});
						return;
					}

					const cssPath = entry.css ? `/assets/imogi_pos/react/customer-display/${entry.css[0]}` : null;
					const jsPath = `/assets/imogi_pos/react/customer-display/${entry.file}`;

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
							console.error('[imogi-displays] Failed to load widget script:', jsPath);
							frappe.msgprint({
								title: 'Widget Load Error',
								indicator: 'red',
								message: 'Failed to load Customer Display widget. Please contact administrator.'
							});
						};
						document.body.appendChild(script);
					} else {
						// Script already loaded, mount directly
						mountWidget(container[0], page);
					}
				} catch (err) {
					console.error('[imogi-displays] Manifest parse error:', err);
					frappe.msgprint({
						title: 'Widget Load Error',
						indicator: 'red',
						message: 'Failed to parse widget manifest. Please contact administrator.'
					});
				}
			},
			error: function(err) {
				console.error('[imogi-displays] Failed to fetch manifest:', err);
				frappe.msgprint({
					title: 'Widget Load Error',
					indicator: 'red',
					message: 'Failed to load Customer Display manifest. Please contact administrator.'
				});
			}
		});
	}

	function mountWidget(element, page) {
		if (typeof window.imogiDisplaysMount === 'function') {
			console.log('[imogi-displays] Mounting widget...');
			window.imogiDisplaysMount(element, { page });
		} else {
			console.error('[imogi-displays] window.imogiDisplaysMount not found');
			frappe.msgprint({
				title: 'Widget Mount Error',
				indicator: 'red',
				message: 'Widget mount function not available. Please refresh the page.'
			});
		}
	}
};

// Cleanup on page unload
frappe.pages['imogi-displays'].on_page_show = function(wrapper) {
	const container = wrapper.querySelector('#imogi-displays-root');
	if (container && typeof window.imogiDisplaysUnmount === 'function') {
		console.log('[imogi-displays] Unmounting widget on page show...');
		window.imogiDisplaysUnmount(container);
	}
};
