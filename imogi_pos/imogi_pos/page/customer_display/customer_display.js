frappe.pages['customer-display'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Customer Display',
		single_column: true
	});

	new CustomerDisplayManager(page);
};

class CustomerDisplayManager {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.selected_device = null;
		this.linked_order = null;
		
		this.init();
	}

	init() {
		this.render();
	}

	render() {
		this.ensure_template();
		this.wrapper.html(frappe.render_template('customer_display'));
		this.setup_components();
		this.load_devices();
		this.bind_events();
		this.setup_realtime();
	}

	ensure_template() {
		if (!frappe.templates) {
			frappe.templates = {};
		}

		if (!frappe.templates.customer_display) {
			frappe.templates.customer_display = this.template();
		}
	}

	template() {
		return `
			<div class="customer-display-container">
			  <div class="display-controls">
				<div class="device-selector">
				  <select class="device-select"></select>
				  <button class="btn btn-sm btn-default register-device-btn">Register New</button>
				</div>

				<div class="display-actions">
				  <button class="btn btn-sm btn-primary link-to-order-btn">Link to Order</button>
				  <button class="btn btn-sm btn-default test-display-btn">Test Display</button>
				  <button class="btn btn-sm btn-default edit-layout-btn">Edit Layout</button>
				</div>
			  </div>

			  <div class="display-main">
				<div class="preview-container">
				  <h4>Preview</h4>
				  <div class="display-preview"></div>
				</div>

				<div class="linked-content">
				  <h4>Linked Content</h4>
				  <div class="linked-orders"></div>
				  <div class="linked-payment"></div>
				</div>
			  </div>
			</div>
		`;
	}

	setup_components() {
		this.$device_select = this.wrapper.find('.device-select');
		this.$display_preview = this.wrapper.find('.display-preview');
		this.$linked_orders = this.wrapper.find('.linked-orders');
		this.$linked_payment = this.wrapper.find('.linked-payment');
	}

	load_devices() {
		frappe.call({
			method: 'imogi_pos.api.customer_display.get_devices',
			callback: (r) => {
				if (r.message) {
					this.render_device_options(r.message);
				}
			}
		});
	}

	render_device_options(devices) {
		this.$device_select.empty();
		this.$device_select.append('<option value="">Select Device</option>');
		devices.forEach(device => {
			const status = device.is_online ? '🟢' : '🔴';
			this.$device_select.append(
				`<option value="${device.name}">${status} ${device.device_name}</option>`
			);
		});
	}

	bind_events() {
		this.$device_select?.on('change', (e) => {
			this.selected_device = $(e.target).val();
			this.load_device_status();
		});

		this.wrapper.on('click', '.register-device-btn', () => {
			this.register_new_device();
		});

		this.wrapper.on('click', '.link-to-order-btn', () => {
			this.link_to_order();
		});

		this.wrapper.on('click', '.test-display-btn', () => {
			this.test_display();
		});

		this.wrapper.on('click', '.edit-layout-btn', () => {
			frappe.set_route('customer-display-editor');
		});
	}

	load_device_status() {
		if (!this.selected_device) return;

		frappe.call({
			method: 'imogi_pos.api.customer_display.get_device_status',
			args: { device: this.selected_device },
			callback: (r) => {
				if (r.message) {
					this.render_preview(r.message);
					if (r.message.linked_order) {
						this.load_linked_order(r.message.linked_order);
					}
				}
			}
		});
	}

	render_preview(status) {
		this.$display_preview.html(`
			<div class="preview-status">
				<p><strong>Status:</strong> ${status.is_online ? 'Online' : 'Offline'}</p>
				<p><strong>Profile:</strong> ${status.profile || 'Default'}</p>
				<p><strong>Last Ping:</strong> ${status.last_ping || 'Never'}</p>
			</div>
		`);
	}

	load_linked_order(order) {
		frappe.call({
			method: 'imogi_pos.api.orders.get_order_summary',
			args: { order: order },
			callback: (r) => {
				if (r.message) {
					this.render_linked_order(r.message);
				}
			}
		});
	}

	render_linked_order(order) {
		const items_html = order.items.map(item =>
			`<div class="order-item">${item.qty}x ${item.item_name} - ${format_currency(item.amount, order.currency)}</div>`
		).join('');

		this.$linked_orders.html(`
			<div class="linked-order">
				<h5>Order #${order.name}</h5>
				<div class="order-items">${items_html}</div>
				<div class="order-total">
					<strong>Total: ${format_currency(order.grand_total, order.currency)}</strong>
				</div>
			</div>
		`);
	}

	register_new_device() {
		frappe.prompt([
			{
				label: 'Device Name',
				fieldname: 'device_name',
				fieldtype: 'Data',
				reqd: 1
			},
			{
				label: 'Display Profile',
				fieldname: 'profile',
				fieldtype: 'Link',
				options: 'Customer Display Profile'
			}
		], (values) => {
			frappe.call({
				method: 'imogi_pos.api.customer_display.register_device',
				args: values,
				callback: (r) => {
					if (r.message) {
						frappe.show_alert({ message: __('Device registered'), indicator: 'green' });
						this.load_devices();
						
						// Show registration code
						frappe.msgprint({
							title: __('Device Registered'),
							message: `<p>Use this code to connect the device:</p>
								<h3 style="text-align:center">${r.message.registration_code}</h3>
								<p>This code expires in 5 minutes.</p>`
						});
					}
				}
			});
		}, __('Register New Device'));
	}

	link_to_order() {
		if (!this.selected_device) {
			frappe.show_alert({ message: __('Please select a device first'), indicator: 'orange' });
			return;
		}

		frappe.prompt([
			{
				label: 'Order',
				fieldname: 'order',
				fieldtype: 'Link',
				options: 'POS Order',
				reqd: 1
			}
		], (values) => {
			frappe.call({
				method: 'imogi_pos.api.customer_display.link_to_order',
				args: {
					device: this.selected_device,
					order: values.order
				},
				callback: (r) => {
					if (r.message) {
						frappe.show_alert({ message: __('Device linked to order'), indicator: 'green' });
						this.load_device_status();
					}
				}
			});
		}, __('Link to Order'));
	}

	test_display() {
		if (!this.selected_device) {
			frappe.show_alert({ message: __('Please select a device first'), indicator: 'orange' });
			return;
		}

		frappe.call({
			method: 'imogi_pos.api.customer_display.send_test_message',
			args: { device: this.selected_device },
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: __('Test message sent'), indicator: 'green' });
				}
			}
		});
	}

	setup_realtime() {
		frappe.realtime.on('customer_display_update', (data) => {
			if (data.device === this.selected_device) {
				this.load_device_status();
			}
		});
	}
}
