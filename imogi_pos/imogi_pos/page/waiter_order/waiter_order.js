frappe.pages['waiter-order'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Waiter Order',
		single_column: true
	});

	new WaiterOrder(page);
};

class WaiterOrder {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.table = null;
		this.order = null;
		this.cart = [];
		this.selected_category = null;
		
		this.init();
	}

	init() {
		this.parse_route_params();
		this.render();
	}

	parse_route_params() {
		const route = frappe.get_route();
		if (route.length > 1) {
			this.table = route[1];
		}
		if (route.length > 2) {
			this.order = route[2];
		}
	}

	render() {
		frappe.require('page/waiter_order/waiter_order.html', () => {
			this.wrapper.html(frappe.render_template('waiter_order'));
			this.setup_components();
			this.load_table_info();
			if (this.order) {
				this.load_existing_order();
			}
			this.load_categories();
			this.bind_events();
		});
	}

	setup_components() {
		this.$table_name = this.wrapper.find('.table-name');
		this.$order_id = this.wrapper.find('.order-id');
		this.$category_filters = this.wrapper.find('.category-filters');
		this.$item_grid = this.wrapper.find('.item-grid');
		this.$order_items_list = this.wrapper.find('.order-items-list');
		this.$customer_search = this.wrapper.find('.customer-search');
		this.$item_search = this.wrapper.find('.item-search');
	}

	load_table_info() {
		if (!this.table) return;
		
		frappe.call({
			method: 'imogi_pos.api.layout.get_table_details',
			args: { table: this.table },
			callback: (r) => {
				if (r.message) {
					this.$table_name.text(r.message.table_name);
				}
			}
		});
	}

	load_existing_order() {
		frappe.call({
			method: 'imogi_pos.api.orders.get_order',
			args: { order: this.order },
			callback: (r) => {
				if (r.message) {
					this.$order_id.text(`Order #${r.message.name}`);
					this.cart = r.message.items || [];
					this.render_cart();
				}
			}
		});
	}

	load_categories() {
		frappe.call({
			method: 'imogi_pos.api.items.get_item_groups',
			callback: (r) => {
				if (r.message) {
					this.render_categories(r.message);
					if (r.message.length > 0) {
						this.selected_category = r.message[0].name;
						this.load_items(this.selected_category);
					}
				}
			}
		});
	}

	render_categories(categories) {
		this.$category_filters.empty();
		categories.forEach((cat, idx) => {
			const active = idx === 0 ? 'active' : '';
			this.$category_filters.append(
				`<button class="btn btn-sm category-btn ${active}" data-category="${cat.name}">${cat.name}</button>`
			);
		});
	}

	load_items(category) {
		frappe.call({
			method: 'imogi_pos.api.items.get_items_by_group',
			args: { item_group: category },
			callback: (r) => {
				if (r.message) {
					this.render_items(r.message);
				}
			}
		});
	}

	render_items(items) {
		this.$item_grid.empty();
		items.forEach(item => {
			this.$item_grid.append(`
				<div class="item-card" data-item="${item.item_code}">
					<div class="item-image">
						${item.image ? `<img src="${item.image}" alt="${item.item_name}">` : ''}
					</div>
					<div class="item-info">
						<div class="item-name">${item.item_name}</div>
						<div class="item-price">${format_currency(item.price, frappe.defaults.get_default('currency'))}</div>
					</div>
				</div>
			`);
		});
	}

	add_to_cart(item_code) {
		frappe.call({
			method: 'imogi_pos.api.items.get_item_details',
			args: { item_code: item_code },
			callback: (r) => {
				if (r.message) {
					const item = r.message;
					const existing = this.cart.find(i => i.item_code === item_code && !i.item_options);
					
					if (existing) {
						existing.qty += 1;
					} else {
						this.cart.push({
							item_code: item.item_code,
							item_name: item.item_name,
							qty: 1,
							rate: item.price,
							amount: item.price
						});
					}
					
					this.render_cart();
				}
			}
		});
	}

	render_cart() {
		this.$order_items_list.empty();
		
		if (this.cart.length === 0) {
			this.$order_items_list.html('<p class="text-muted">No items in order</p>');
			return;
		}

		this.cart.forEach((item, idx) => {
			this.$order_items_list.append(`
				<div class="cart-item" data-idx="${idx}">
					<div class="cart-item-info">
						<span class="cart-item-name">${item.item_name}</span>
						${item.item_options ? `<small class="cart-item-options">${item.item_options}</small>` : ''}
					</div>
					<div class="cart-item-qty">
						<button class="btn btn-xs qty-minus">-</button>
						<span>${item.qty}</span>
						<button class="btn btn-xs qty-plus">+</button>
					</div>
					<div class="cart-item-amount">${format_currency(item.qty * item.rate, frappe.defaults.get_default('currency'))}</div>
					<button class="btn btn-xs btn-danger remove-item">×</button>
				</div>
			`);
		});

		const total = this.cart.reduce((sum, item) => sum + (item.qty * item.rate), 0);
		this.$order_items_list.append(`
			<div class="cart-total">
				<strong>Total: ${format_currency(total, frappe.defaults.get_default('currency'))}</strong>
			</div>
		`);
	}

	bind_events() {
		this.wrapper.on('click', '.back-button button', () => {
			frappe.set_route('table-display');
		});

		this.wrapper.on('click', '.category-btn', (e) => {
			const $btn = $(e.target);
			this.wrapper.find('.category-btn').removeClass('active');
			$btn.addClass('active');
			this.selected_category = $btn.data('category');
			this.load_items(this.selected_category);
		});

		this.wrapper.on('click', '.item-card', (e) => {
			const item_code = $(e.currentTarget).data('item');
			this.add_to_cart(item_code);
		});

		this.wrapper.on('click', '.qty-plus', (e) => {
			const idx = $(e.target).closest('.cart-item').data('idx');
			this.cart[idx].qty += 1;
			this.render_cart();
		});

		this.wrapper.on('click', '.qty-minus', (e) => {
			const idx = $(e.target).closest('.cart-item').data('idx');
			if (this.cart[idx].qty > 1) {
				this.cart[idx].qty -= 1;
			} else {
				this.cart.splice(idx, 1);
			}
			this.render_cart();
		});

		this.wrapper.on('click', '.remove-item', (e) => {
			const idx = $(e.target).closest('.cart-item').data('idx');
			this.cart.splice(idx, 1);
			this.render_cart();
		});

		this.wrapper.on('click', '.send-kot-btn', () => {
			this.send_to_kitchen();
		});

		this.$item_search?.on('input', frappe.utils.debounce((e) => {
			this.search_items($(e.target).val());
		}, 300));

		this.$customer_search?.on('input', frappe.utils.debounce((e) => {
			this.search_customer($(e.target).val());
		}, 300));
	}

	send_to_kitchen() {
		if (this.cart.length === 0) {
			frappe.show_alert({ message: __('No items in order'), indicator: 'orange' });
			return;
		}

		frappe.call({
			method: 'imogi_pos.api.orders.create_or_update_order',
			args: {
				table: this.table,
				order: this.order,
				items: this.cart
			},
			callback: (r) => {
				if (r.message) {
					this.order = r.message.order;
					frappe.show_alert({ message: __('Order sent to kitchen'), indicator: 'green' });
					
					// Clear new items from cart (keep existing)
					this.load_existing_order();
				}
			}
		});
	}

	search_items(query) {
		if (!query) {
			this.load_items(this.selected_category);
			return;
		}

		frappe.call({
			method: 'imogi_pos.api.items.search_items',
			args: { query: query },
			callback: (r) => {
				if (r.message) {
					this.render_items(r.message);
				}
			}
		});
	}

	search_customer(phone) {
		if (!phone || phone.length < 3) return;

		frappe.call({
			method: 'imogi_pos.api.customers.search_by_phone',
			args: { phone: phone },
			callback: (r) => {
				if (r.message && r.message.length > 0) {
					this.show_customer_suggestions(r.message);
				}
			}
		});
	}

	show_customer_suggestions(customers) {
		// Show dropdown with customer suggestions
		// Implementation depends on UI preference
	}
}
