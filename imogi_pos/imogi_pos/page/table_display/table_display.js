frappe.pages['table-display'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Table Display',
		single_column: true
	});

	// Initialize the table display
	new TableDisplay(page);
};

class TableDisplay {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.selected_floor = null;
		this.selected_table = null;
		
		this.init();
	}

	init() {
		this.setup_page_actions();
		this.render();
	}

	setup_page_actions() {
		this.page.set_primary_action(__('Refresh'), () => {
			this.refresh_tables();
		}, 'refresh');
	}

	render() {
		this.ensure_template();
		this.wrapper.html(frappe.render_template('table_display'));
		this.setup_components();
		this.load_floors();
		this.bind_events();
	}

	ensure_template() {
		if (!frappe.templates) {
			frappe.templates = {};
		}

		if (!frappe.templates.table_display) {
			frappe.templates.table_display = this.template();
		}
	}

	template() {
		return `
			<div class="table-display-container">
			  <div class="floor-selector-bar">
				<select class="floor-selector"></select>
				<div class="layout-controls">
				  <button class="btn btn-sm btn-default layout-btn">Switch Layout</button>
				</div>
			  </div>

			  <div class="table-display-main">
				<div class="floor-layout-container"></div>

				<div class="table-details-panel hidden">
				  <div class="panel-header">
					<h3 class="table-name"></h3>
					<button class="btn btn-sm btn-default close-panel-btn">×</button>
				  </div>

				  <div class="table-status"></div>

				  <div class="table-actions">
					<button class="btn btn-primary open-table-btn">Take Order</button>
					<button class="btn btn-default print-bill-btn">Print Bill</button>
					<button class="btn btn-default reprint-kot-btn">Reprint KOT</button>
					<button class="btn btn-default table-ops-btn">Table Operations</button>
				  </div>

				  <div class="order-summary"></div>
				</div>
			  </div>
			</div>
		`;
	}

	setup_components() {
		this.$floor_selector = this.wrapper.find('.floor-selector');
		this.$layout_container = this.wrapper.find('.floor-layout-container');
		this.$details_panel = this.wrapper.find('.table-details-panel');
	}

	load_floors() {
		frappe.call({
			method: 'imogi_pos.api.layout.get_floors',
			callback: (r) => {
				if (r.message) {
					this.render_floor_options(r.message);
					if (r.message.length > 0) {
						this.selected_floor = r.message[0].name;
						this.load_tables(this.selected_floor);
					}
				}
			}
		});
	}

	render_floor_options(floors) {
		this.$floor_selector.empty();
		floors.forEach(floor => {
			this.$floor_selector.append(
				`<option value="${floor.name}">${floor.floor_name}</option>`
			);
		});
	}

	load_tables(floor) {
		frappe.call({
			method: 'imogi_pos.api.layout.get_floor_layout',
			args: { floor: floor },
			callback: (r) => {
				if (r.message) {
					this.render_tables(r.message);
				}
			}
		});
	}

	render_tables(tables) {
		this.$layout_container.empty();
		tables.forEach(table => {
			const $table = this.create_table_element(table);
			this.$layout_container.append($table);
		});
	}

	create_table_element(table) {
		const status_class = this.get_status_class(table.status);
		return $(`
			<div class="table-node ${status_class}" 
				 data-table="${table.name}"
				 style="left: ${table.x}px; top: ${table.y}px; width: ${table.width}px; height: ${table.height}px;">
				<div class="table-label">${table.table_name}</div>
				<div class="table-status-indicator">${table.status || 'Available'}</div>
			</div>
		`);
	}

	get_status_class(status) {
		const status_map = {
			'Available': 'status-available',
			'Occupied': 'status-occupied',
			'Reserved': 'status-reserved',
			'Cleaning': 'status-cleaning'
		};
		return status_map[status] || 'status-available';
	}

	bind_events() {
		this.$floor_selector?.on('change', (e) => {
			this.selected_floor = $(e.target).val();
			this.load_tables(this.selected_floor);
		});

		this.wrapper.on('click', '.table-node', (e) => {
			const table_name = $(e.currentTarget).data('table');
			this.select_table(table_name);
		});

		this.wrapper.on('click', '.close-panel-btn', () => {
			this.close_details_panel();
		});

		this.wrapper.on('click', '.open-table-btn', () => {
			if (this.selected_table) {
				frappe.set_route('Form', 'POS Order', {
					table: this.selected_table.name
				});
			}
		});

		this.wrapper.on('click', '.print-bill-btn', () => {
			if (this.selected_table && this.selected_table.current_order) {
				this.print_bill(this.selected_table.current_order);
			}
		});
	}

	select_table(table_name) {
		frappe.call({
			method: 'imogi_pos.api.layout.get_table_details',
			args: { table: table_name },
			callback: (r) => {
				if (r.message) {
					this.selected_table = r.message;
					this.show_details_panel(r.message);
				}
			}
		});
	}

	show_details_panel(table) {
		this.$details_panel.removeClass('hidden');
		this.$details_panel.find('.table-name').text(table.table_name);
		this.$details_panel.find('.table-status').text(table.status || 'Available');
		
		if (table.current_order) {
			this.render_order_summary(table.current_order);
		} else {
			this.wrapper.find('.order-summary').html('<p>No active order</p>');
		}
	}

	render_order_summary(order) {
		frappe.call({
			method: 'imogi_pos.api.orders.get_order_summary',
			args: { order: order },
			callback: (r) => {
				if (r.message) {
					const items_html = r.message.items.map(item => 
						`<div class="order-item">${item.qty}x ${item.item_name}</div>`
					).join('');
					this.wrapper.find('.order-summary').html(`
						<div class="order-items">${items_html}</div>
						<div class="order-total">Total: ${r.message.total}</div>
					`);
				}
			}
		});
	}

	close_details_panel() {
		this.$details_panel.addClass('hidden');
		this.selected_table = null;
	}

	refresh_tables() {
		if (this.selected_floor) {
			this.load_tables(this.selected_floor);
		}
	}

	print_bill(order) {
		frappe.call({
			method: 'imogi_pos.api.printing.print_customer_bill',
			args: { order: order },
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: __('Bill printed'), indicator: 'green' });
				}
			}
		});
	}
}
