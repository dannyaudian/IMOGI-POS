frappe.pages['kitchen-display'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Kitchen Display',
		single_column: true
	});

	new KitchenDisplay(page);
};

class KitchenDisplay {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.selected_station = null;
		this.auto_refresh_interval = null;
		
		this.init();
	}

	init() {
		this.setup_page_actions();
		this.render();
	}

	setup_page_actions() {
		this.page.set_primary_action(__('Refresh'), () => {
			this.refresh_orders();
		}, 'refresh');
	}

	render() {
		frappe.require('page/kitchen_display/kitchen_display.html', () => {
			this.wrapper.html(frappe.render_template('kitchen_display'));
			this.setup_components();
			this.load_stations();
			this.bind_events();
			this.start_auto_refresh();
			this.setup_realtime();
		});
	}

	setup_components() {
		this.$station_select = this.wrapper.find('.station-select');
		this.$queued_orders = this.wrapper.find('.queued-orders');
		this.$preparing_orders = this.wrapper.find('.preparing-orders');
		this.$ready_orders = this.wrapper.find('.ready-orders');
	}

	load_stations() {
		frappe.call({
			method: 'imogi_pos.api.kot.get_kitchen_stations',
			callback: (r) => {
				if (r.message) {
					this.render_station_options(r.message);
					if (r.message.length > 0) {
						this.selected_station = r.message[0].name;
						this.refresh_orders();
					}
				}
			}
		});
	}

	render_station_options(stations) {
		this.$station_select.empty();
		this.$station_select.append('<option value="">All Stations</option>');
		stations.forEach(station => {
			this.$station_select.append(
				`<option value="${station.name}">${station.station_name}</option>`
			);
		});
	}

	refresh_orders() {
		frappe.call({
			method: 'imogi_pos.api.kot.get_kot_tickets_by_status',
			args: { 
				station: this.selected_station || null 
			},
			callback: (r) => {
				if (r.message) {
					this.render_orders(r.message);
				}
			}
		});
	}

	render_orders(orders) {
		this.$queued_orders.empty();
		this.$preparing_orders.empty();
		this.$ready_orders.empty();

		orders.forEach(order => {
			const $card = this.create_order_card(order);
			switch (order.workflow_state) {
				case 'Queued':
					this.$queued_orders.append($card);
					break;
				case 'In Progress':
				case 'Preparing':
					this.$preparing_orders.append($card);
					break;
				case 'Ready':
					this.$ready_orders.append($card);
					break;
			}
		});
	}

	create_order_card(order) {
		const items_html = order.items.map(item => 
			`<div class="kot-item">
				<span class="item-qty">${item.qty}x</span>
				<span class="item-name">${item.item_name}</span>
				${item.notes ? `<span class="item-notes">${item.notes}</span>` : ''}
			</div>`
		).join('');

		const elapsed_time = this.get_elapsed_time(order.creation);
		const urgency_class = this.get_urgency_class(elapsed_time);

		return $(`
			<div class="kot-card ${urgency_class}" data-kot="${order.name}">
				<div class="kot-header">
					<span class="kot-number">#${order.name.split('-').pop()}</span>
					<span class="kot-table">${order.table || 'Takeaway'}</span>
					<span class="kot-time">${elapsed_time}m</span>
				</div>
				<div class="kot-items">${items_html}</div>
				<div class="kot-actions">
					${this.get_action_buttons(order.workflow_state)}
				</div>
			</div>
		`);
	}

	get_action_buttons(status) {
		switch (status) {
			case 'Queued':
				return '<button class="btn btn-sm btn-primary start-btn">Start</button>';
			case 'In Progress':
			case 'Preparing':
				return '<button class="btn btn-sm btn-success ready-btn">Ready</button>';
			case 'Ready':
				return '<button class="btn btn-sm btn-default served-btn">Served</button>';
			default:
				return '';
		}
	}

	get_elapsed_time(creation) {
		const created = moment(creation);
		return moment().diff(created, 'minutes');
	}

	get_urgency_class(minutes) {
		if (minutes >= 15) return 'urgency-critical';
		if (minutes >= 10) return 'urgency-warning';
		return 'urgency-normal';
	}

	bind_events() {
		this.$station_select?.on('change', (e) => {
			this.selected_station = $(e.target).val();
			this.refresh_orders();
		});

		this.wrapper.on('click', '.refresh-btn', () => {
			this.refresh_orders();
		});

		this.wrapper.on('click', '.start-btn', (e) => {
			const kot = $(e.target).closest('.kot-card').data('kot');
			this.update_kot_status(kot, 'Start Preparing');
		});

		this.wrapper.on('click', '.ready-btn', (e) => {
			const kot = $(e.target).closest('.kot-card').data('kot');
			this.update_kot_status(kot, 'Mark Ready');
		});

		this.wrapper.on('click', '.served-btn', (e) => {
			const kot = $(e.target).closest('.kot-card').data('kot');
			this.update_kot_status(kot, 'Mark Served');
		});
	}

	update_kot_status(kot, action) {
		frappe.call({
			method: 'frappe.client.submit',
			args: {
				doc: {
					doctype: 'KOT Ticket',
					name: kot,
					workflow_action: action
				}
			},
			callback: () => {
				this.refresh_orders();
			}
		});
	}

	start_auto_refresh() {
		this.auto_refresh_interval = setInterval(() => {
			this.refresh_orders();
		}, 30000); // Refresh every 30 seconds
	}

	setup_realtime() {
		frappe.realtime.on('kot_update', () => {
			this.refresh_orders();
		});
	}

	destroy() {
		if (this.auto_refresh_interval) {
			clearInterval(this.auto_refresh_interval);
		}
		frappe.realtime.off('kot_update');
	}
}
