frappe.pages['customer-display-editor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Customer Display Editor',
		single_column: true
	});

	new CustomerDisplayEditor(page);
};

class CustomerDisplayEditor {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.selected_profile = null;
		this.selected_block = null;
		this.blocks = [];
		this.is_dragging = false;
		
		this.init();
	}

	init() {
		this.setup_page_actions();
		this.render();
	}

	setup_page_actions() {
		this.page.set_primary_action(__('Save'), () => {
			this.save_layout();
		}, 'save');
	}

	render() {
		this.ensure_template();
		this.wrapper.html(frappe.render_template('customer_display_editor'));
		this.setup_components();
		this.load_profiles();
		this.bind_events();
	}

	ensure_template() {
		if (!frappe.templates) {
			frappe.templates = {};
		}

		if (!frappe.templates.customer_display_editor) {
			frappe.templates.customer_display_editor = this.template();
		}
	}

	template() {
		return `
			<div class="display-editor-container">
			  <div class="editor-controls">
				<div class="profile-selector">
				  <select class="display-profile-select"></select>
				  <button class="btn btn-sm btn-default new-profile-btn">New</button>
				</div>

				<div class="action-buttons">
				  <button class="btn btn-sm btn-primary save-layout-btn">Save Layout</button>
				  <button class="btn btn-sm btn-default preview-btn">Preview</button>
				  <button class="btn btn-sm btn-default reset-btn">Reset</button>
				</div>
			  </div>

			  <div class="editor-main">
				<div class="blocks-toolbox">
				  <h4>Blocks</h4>
				  <div class="block block-branding" data-block="branding">Branding</div>
				  <div class="block block-order-summary" data-block="order-summary">Order Summary</div>
				  <div class="block block-payment" data-block="payment">Payment</div>
				  <div class="block block-ticker" data-block="ticker">Ticker</div>
				  <div class="block block-promo" data-block="promo">Promotion</div>
				</div>

				<div class="canvas-container">
				  <div class="display-canvas"></div>
				</div>

				<div class="block-properties">
				  <h4>Properties</h4>
				  <div class="property-form"></div>
				</div>
			  </div>
			</div>
		`;
	}

	setup_components() {
		this.$profile_select = this.wrapper.find('.display-profile-select');
		this.$canvas = this.wrapper.find('.display-canvas');
		this.$property_form = this.wrapper.find('.property-form');
	}

	load_profiles() {
		frappe.call({
			method: 'imogi_pos.api.customer_display.get_display_profiles',
			callback: (r) => {
				if (r.message) {
					this.render_profile_options(r.message);
					if (r.message.length > 0) {
						this.selected_profile = r.message[0].name;
						this.load_layout();
					}
				}
			}
		});
	}

	render_profile_options(profiles) {
		this.$profile_select.empty();
		profiles.forEach(profile => {
			this.$profile_select.append(
				`<option value="${profile.name}">${profile.profile_name}</option>`
			);
		});
	}

	load_layout() {
		frappe.call({
			method: 'imogi_pos.api.customer_display.get_profile_blocks',
			args: { profile: this.selected_profile },
			callback: (r) => {
				if (r.message) {
					this.blocks = r.message;
					this.render_canvas();
				}
			}
		});
	}

	render_canvas() {
		this.$canvas.empty();
		this.blocks.forEach(block => {
			const $block = this.create_block_element(block);
			this.$canvas.append($block);
		});
	}

	create_block_element(block) {
		return $(`
			<div class="display-block block-${block.block_type}" 
				 data-block="${block.name}"
				 style="left: ${block.x}px; top: ${block.y}px; width: ${block.width}px; height: ${block.height}px;">
				<div class="block-label">${this.get_block_label(block.block_type)}</div>
				<div class="block-resize-handle"></div>
			</div>
		`);
	}

	get_block_label(block_type) {
		const labels = {
			'branding': 'Branding',
			'order-summary': 'Order Summary',
			'payment': 'Payment',
			'ticker': 'Ticker',
			'promo': 'Promotion'
		};
		return labels[block_type] || block_type;
	}

	bind_events() {
		this.$profile_select?.on('change', (e) => {
			this.selected_profile = $(e.target).val();
			this.load_layout();
		});

		// Add block from toolbox
		this.wrapper.on('click', '.blocks-toolbox .block', (e) => {
			const block_type = $(e.target).data('block');
			this.add_block(block_type);
		});

		// Select block
		this.wrapper.on('click', '.display-block', (e) => {
			e.stopPropagation();
			const block_name = $(e.currentTarget).data('block');
			this.select_block(block_name);
		});

		// Deselect on canvas click
		this.$canvas?.on('click', (e) => {
			if ($(e.target).hasClass('display-canvas')) {
				this.deselect_block();
			}
		});

		// Make blocks draggable
		this.wrapper.on('mousedown', '.display-block', (e) => {
			if ($(e.target).hasClass('block-resize-handle')) return;
			this.start_drag(e);
		});

		$(document).on('mousemove', (e) => {
			if (this.is_dragging) {
				this.do_drag(e);
			}
		});

		$(document).on('mouseup', () => {
			if (this.is_dragging) {
				this.end_drag();
			}
		});

		// Action buttons
		this.wrapper.on('click', '.save-layout-btn', () => {
			this.save_layout();
		});

		this.wrapper.on('click', '.preview-btn', () => {
			this.preview_layout();
		});

		this.wrapper.on('click', '.reset-btn', () => {
			this.load_layout();
		});

		this.wrapper.on('click', '.new-profile-btn', () => {
			this.create_new_profile();
		});
	}

	add_block(block_type) {
		const new_block = {
			name: frappe.utils.get_random(10),
			block_type: block_type,
			x: 50,
			y: 50,
			width: 200,
			height: 100,
			settings: {},
			is_new: true
		};
		
		this.blocks.push(new_block);
		this.render_canvas();
		this.select_block(new_block.name);
	}

	select_block(block_name) {
		this.wrapper.find('.display-block').removeClass('selected');
		this.wrapper.find(`[data-block="${block_name}"]`).addClass('selected');
		
		this.selected_block = this.blocks.find(b => b.name === block_name);
		this.render_property_form();
	}

	deselect_block() {
		this.wrapper.find('.display-block').removeClass('selected');
		this.selected_block = null;
		this.$property_form.empty();
	}

	render_property_form() {
		if (!this.selected_block) {
			this.$property_form.empty();
			return;
		}

		const block = this.selected_block;
		let settings_html = '';

		switch (block.block_type) {
			case 'branding':
				settings_html = `
					<div class="form-group">
						<label>Logo URL</label>
						<input type="text" class="form-control setting-logo" value="${block.settings.logo || ''}">
					</div>
					<div class="form-group">
						<label>Company Name</label>
						<input type="text" class="form-control setting-company" value="${block.settings.company || ''}">
					</div>
				`;
				break;
			case 'ticker':
				settings_html = `
					<div class="form-group">
						<label>Ticker Text</label>
						<textarea class="form-control setting-text">${block.settings.text || ''}</textarea>
					</div>
					<div class="form-group">
						<label>Speed</label>
						<input type="number" class="form-control setting-speed" value="${block.settings.speed || 50}">
					</div>
				`;
				break;
			case 'promo':
				settings_html = `
					<div class="form-group">
						<label>Promo Image</label>
						<input type="text" class="form-control setting-image" value="${block.settings.image || ''}">
					</div>
					<div class="form-group">
						<label>Promo Text</label>
						<textarea class="form-control setting-text">${block.settings.text || ''}</textarea>
					</div>
				`;
				break;
		}

		this.$property_form.html(`
			<div class="form-group">
				<label>Type</label>
				<input type="text" class="form-control" value="${this.get_block_label(block.block_type)}" disabled>
			</div>
			<div class="form-group">
				<label>Width</label>
				<input type="number" class="form-control prop-width" value="${block.width}">
			</div>
			<div class="form-group">
				<label>Height</label>
				<input type="number" class="form-control prop-height" value="${block.height}">
			</div>
			${settings_html}
			<button class="btn btn-sm btn-danger delete-block-btn">Delete</button>
		`);

		// Bind property change events
		this.$property_form.find('.prop-width').on('change', (e) => {
			block.width = parseInt($(e.target).val());
			this.render_canvas();
		});

		this.$property_form.find('.prop-height').on('change', (e) => {
			block.height = parseInt($(e.target).val());
			this.render_canvas();
		});

		this.$property_form.find('[class*="setting-"]').on('change', (e) => {
			const $input = $(e.target);
			const setting = $input.attr('class').match(/setting-(\w+)/)[1];
			block.settings[setting] = $input.val();
		});

		this.$property_form.find('.delete-block-btn').on('click', () => {
			this.delete_selected_block();
		});
	}

	delete_selected_block() {
		if (!this.selected_block) return;
		
		const idx = this.blocks.findIndex(b => b.name === this.selected_block.name);
		if (idx > -1) {
			this.blocks.splice(idx, 1);
			this.deselect_block();
			this.render_canvas();
		}
	}

	start_drag(e) {
		const $block = $(e.currentTarget);
		this.is_dragging = true;
		this.drag_block = $block;
		this.drag_offset = {
			x: e.clientX - $block.position().left,
			y: e.clientY - $block.position().top
		};
	}

	do_drag(e) {
		if (!this.drag_block) return;
		
		const canvas_offset = this.$canvas.offset();
		const x = e.clientX - canvas_offset.left - this.drag_offset.x + this.$canvas.scrollLeft();
		const y = e.clientY - canvas_offset.top - this.drag_offset.y + this.$canvas.scrollTop();
		
		this.drag_block.css({
			left: Math.max(0, x) + 'px',
			top: Math.max(0, y) + 'px'
		});
	}

	end_drag() {
		if (this.drag_block) {
			const block_name = this.drag_block.data('block');
			const block = this.blocks.find(b => b.name === block_name);
			if (block) {
				block.x = parseInt(this.drag_block.css('left'));
				block.y = parseInt(this.drag_block.css('top'));
			}
		}
		
		this.is_dragging = false;
		this.drag_block = null;
	}

	save_layout() {
		frappe.call({
			method: 'imogi_pos.api.customer_display.save_profile_blocks',
			args: {
				profile: this.selected_profile,
				blocks: this.blocks
			},
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: __('Layout saved'), indicator: 'green' });
					this.load_layout();
				}
			}
		});
	}

	preview_layout() {
		frappe.call({
			method: 'imogi_pos.api.customer_display.get_preview_url',
			args: { profile: this.selected_profile },
			callback: (r) => {
				if (r.message) {
					window.open(r.message, '_blank');
				}
			}
		});
	}

	create_new_profile() {
		frappe.prompt([
			{
				label: 'Profile Name',
				fieldname: 'profile_name',
				fieldtype: 'Data',
				reqd: 1
			}
		], (values) => {
			frappe.call({
				method: 'imogi_pos.api.customer_display.create_display_profile',
				args: { profile_name: values.profile_name },
				callback: (r) => {
					if (r.message) {
						this.load_profiles();
					}
				}
			});
		}, __('New Display Profile'));
	}
}
