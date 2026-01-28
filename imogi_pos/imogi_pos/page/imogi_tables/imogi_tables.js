frappe.pages['imogi-tables'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Table Display',
		single_column: true
	});

	const container = page.main.find('.page-content');
	container.attr('id', 'imogi-tables-root');

	// Gate: Check operational context before mounting widget
	frappe.call({
		method: 'imogi_pos.utils.operational_context.get_operational_context',
		callback: function(r) {
			if (r.message && r.message.pos_profile) {
				console.log('[imogi-tables] Operational context found:', r.message);
				loadReactWidget(container, page);
			} else {
				console.warn('[imogi-tables] No operational context found. Redirecting to module-select...');
				frappe.set_route('imogi-module-select', { 
					reason: 'missing_pos_profile', 
					target: 'imogi-tables' 
				});
			}
		},
		error: function(err) {
			console.error('[imogi-tables] Failed to check operational context:', err);
			frappe.set_route('imogi-module-select', { 
				reason: 'missing_pos_profile', 
				target: 'imogi-tables' 
			});
		}
	});

	function loadReactWidget(container, page) {
		// Fetch manifest from build output
		frappe.call({
			method: 'frappe.client.get_file',
			args: {
				file_url: '/assets/imogi_pos/react/table-display/.vite/manifest.json'
			},
			callback: function(r) {
				try {
					const manifest = JSON.parse(r.message);
					const entry = manifest['main.jsx'];
					
					if (!entry) {
						console.error('[imogi-tables] No main.jsx entry found in manifest');
						frappe.msgprint({
							title: 'Widget Load Error',
							indicator: 'red',
							message: 'Failed to load Table Display widget. Please contact administrator.'
						});
						return;
					}

					const cssPath = entry.css ? `/assets/imogi_pos/react/table-display/${entry.css[0]}` : null;
					const jsPath = `/assets/imogi_pos/react/table-display/${entry.file}`;

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
							console.error('[imogi-tables] Failed to load widget script:', jsPath);
							frappe.msgprint({
								title: 'Widget Load Error',
								indicator: 'red',
								message: 'Failed to load Table Display widget. Please contact administrator.'
							});
						};
						document.body.appendChild(script);
					} else {
						// Script already loaded, mount directly
						mountWidget(container[0], page);
					}
				} catch (err) {
					console.error('[imogi-tables] Manifest parse error:', err);
					frappe.msgprint({
						title: 'Widget Load Error',
						indicator: 'red',
						message: 'Failed to parse widget manifest. Please contact administrator.'
					});
				}
			},
			error: function(err) {
				console.error('[imogi-tables] Failed to fetch manifest:', err);
				frappe.msgprint({
					title: 'Widget Load Error',
					indicator: 'red',
					message: 'Failed to load Table Display manifest. Please contact administrator.'
				});
			}
		});
	}

	function mountWidget(element, page) {
		if (typeof window.imogiTablesMount === 'function') {
			console.log('[imogi-tables] Mounting widget...');
			window.imogiTablesMount(element, { page });
		} else {
			console.error('[imogi-tables] window.imogiTablesMount not found');
			frappe.msgprint({
				title: 'Widget Mount Error',
				indicator: 'red',
				message: 'Widget mount function not available. Please refresh the page.'
			});
		}
	}
};

// Cleanup on page unload
frappe.pages['imogi-tables'].on_page_show = function(wrapper) {
	const container = wrapper.querySelector('#imogi-tables-root');
	if (container && typeof window.imogiTablesUnmount === 'function') {
		console.log('[imogi-tables] Unmounting widget on page show...');
		window.imogiTablesUnmount(container);
	}
};
