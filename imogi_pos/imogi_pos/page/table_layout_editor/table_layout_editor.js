frappe.pages['table-layout-editor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Table Layout Editor',
		single_column: true
	});

	new TableLayoutEditor(page);
};

class TableLayoutEditor {
	constructor(page) {
		this.page = page;
		this.wrapper = $(page.body);
		this.selected_profile = null;
		this.selected_floor = null;
		this.selected_node = null;
		this.nodes = [];
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
		this.wrapper.html(frappe.render_template('table_layout_editor'));
		this.setup_components();
		this.load_profiles();
		this.bind_events();
	}

	ensure_template() {
		if (!frappe.templates) {
			frappe.templates = {};
		}

		if (!frappe.templates.table_layout_editor) {
			frappe.templates.table_layout_editor = this.template();
		}
	}

	template() {
		return `
			<div class="layout-editor-container">
			  <div class="editor-controls">
				<div class="profile-selector">
				  <select class="layout-profile-select"></select>
				  <button class="btn btn-sm btn-default new-profile-btn">New</button>
				</div>

				<div class="floor-selector">
				  <select class="floor-select"></select>
				</div>

				<div class="action-buttons">
				  <button class="btn btn-sm btn-primary save-layout-btn">Save Layout</button>
				  <button class="btn btn-sm btn-default reset-layout-btn">Reset</button>
				</div>
			  </div>

			  <div class="editor-main">
				<div class="toolbox">
				  <div class="table-shapes">
					<h4>Add Tables</h4>
					<div class="shape shape-rect" data-shape="rect">Rectangle</div>
					<div class="shape shape-circle" data-shape="circle">Circle</div>
					<div class="shape shape-custom" data-shape="custom">Custom</div>
				  </div>

				  <div class="object-properties">
					<h4>Properties</h4>
					<div class="property-form"></div>
				  </div>
				</div>

				<div class="canvas-container">
				  <div class="layout-canvas"></div>
				</div>
			  </div>
			</div>
		`;
	}

	setup_components() {
		this.$profile_select = this.wrapper.find('.layout-profile-select');
		this.$floor_select = this.wrapper.find('.floor-select');
		this.$canvas = this.wrapper.find('.layout-canvas');
		this.$property_form = this.wrapper.find('.property-form');
	}

	load_profiles() {
		frappe.call({
			method: 'imogi_pos.api.layout.get_layout_profiles',
			callback: (r) => {
				if (r.message) {
					this.render_profile_options(r.message);
					if (r.message.length > 0) {
						this.selected_profile = r.message[0].name;
						this.load_floors();
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

	load_floors() {
		frappe.call({
			method: 'imogi_pos.api.layout.get_floors',
			callback: (r) => {
				if (r.message) {
					this.render_floor_options(r.message);
					if (r.message.length > 0) {
						this.selected_floor = r.message[0].name;
						this.load_layout();
					}
				}
			}
		});
	}

	render_floor_options(floors) {
		this.$floor_select.empty();
		floors.forEach(floor => {
			this.$floor_select.append(
				`<option value="${floor.name}">${floor.floor_name}</option>`
			);
		});
	}

	load_layout() {
		frappe.call({
			method: 'imogi_pos.api.layout.get_layout_nodes',
			args: {
				profile: this.selected_profile,
				floor: this.selected_floor
			},
			callback: (r) => {
				if (r.message) {
					this.nodes = r.message;
					this.render_canvas();
				}
			}
		});
	}

	render_canvas() {
		this.$canvas.empty();
		this.nodes.forEach(node => {
			const $node = this.create_node_element(node);
			this.$canvas.append($node);
		});
	}

	create_node_element(node) {
		const shape_class = `shape-${node.shape || 'rect'}`;
		return $(`
			<div class="layout-node ${shape_class}" 
				 data-node="${node.name}"
				 style="left: ${node.x}px; top: ${node.y}px; width: ${node.width}px; height: ${node.height}px;">
				<div class="node-label">${node.table_name || node.label || ''}</div>
				<div class="node-resize-handle"></div>
			</div>
		`);
	}

	bind_events() {
		this.$profile_select?.on('change', (e) => {
			this.selected_profile = $(e.target).val();
			this.load_floors();
		});

		this.$floor_select?.on('change', (e) => {
			this.selected_floor = $(e.target).val();
			this.load_layout();
		});

		// Drag and drop for shapes
		this.wrapper.on('mousedown', '.shape', (e) => {
			const shape = $(e.target).data('shape');
			this.add_new_table(shape);
		});

		// Select node
		this.wrapper.on('click', '.layout-node', (e) => {
			e.stopPropagation();
			const node_name = $(e.currentTarget).data('node');
			this.select_node(node_name);
		});

		// Deselect on canvas click
		this.$canvas?.on('click', (e) => {
			if ($(e.target).hasClass('layout-canvas')) {
				this.deselect_node();
			}
		});

		// Make nodes draggable
		this.wrapper.on('mousedown', '.layout-node', (e) => {
			if ($(e.target).hasClass('node-resize-handle')) return;
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

		// Save button
		this.wrapper.on('click', '.save-layout-btn', () => {
			this.save_layout();
		});

		// Reset button
		this.wrapper.on('click', '.reset-layout-btn', () => {
			this.load_layout();
		});

		// New profile button
		this.wrapper.on('click', '.new-profile-btn', () => {
			this.create_new_profile();
		});
	}

	add_new_table(shape) {
		frappe.prompt([
			{
				label: 'Table',
				fieldname: 'table',
				fieldtype: 'Link',
				options: 'Restaurant Table',
				reqd: 1
			}
		], (values) => {
			const new_node = {
				name: frappe.utils.get_random(10),
				table: values.table,
				shape: shape,
				x: 100,
				y: 100,
				width: shape === 'circle' ? 80 : 100,
				height: shape === 'circle' ? 80 : 60,
				is_new: true
			};
			
			this.nodes.push(new_node);
			this.render_canvas();
			this.select_node(new_node.name);
		}, __('Add Table'));
	}

	select_node(node_name) {
		this.wrapper.find('.layout-node').removeClass('selected');
		this.wrapper.find(`[data-node="${node_name}"]`).addClass('selected');
		
		this.selected_node = this.nodes.find(n => n.name === node_name);
		this.render_property_form();
	}

	deselect_node() {
		this.wrapper.find('.layout-node').removeClass('selected');
		this.selected_node = null;
		this.$property_form.empty();
	}

	render_property_form() {
		if (!this.selected_node) {
			this.$property_form.empty();
			return;
		}

		const node = this.selected_node;
		this.$property_form.html(`
			<div class="form-group">
				<label>Table</label>
				<input type="text" class="form-control" value="${node.table || ''}" disabled>
			</div>
			<div class="form-group">
				<label>Width</label>
				<input type="number" class="form-control prop-width" value="${node.width}">
			</div>
			<div class="form-group">
				<label>Height</label>
				<input type="number" class="form-control prop-height" value="${node.height}">
			</div>
			<button class="btn btn-sm btn-danger delete-node-btn">Delete</button>
		`);

		this.$property_form.find('.prop-width').on('change', (e) => {
			node.width = parseInt($(e.target).val());
			this.render_canvas();
		});

		this.$property_form.find('.prop-height').on('change', (e) => {
			node.height = parseInt($(e.target).val());
			this.render_canvas();
		});

		this.$property_form.find('.delete-node-btn').on('click', () => {
			this.delete_selected_node();
		});
	}

	delete_selected_node() {
		if (!this.selected_node) return;
		
		const idx = this.nodes.findIndex(n => n.name === this.selected_node.name);
		if (idx > -1) {
			this.nodes.splice(idx, 1);
			this.deselect_node();
			this.render_canvas();
		}
	}

	start_drag(e) {
		const $node = $(e.currentTarget);
		this.is_dragging = true;
		this.drag_node = $node;
		this.drag_offset = {
			x: e.clientX - $node.position().left,
			y: e.clientY - $node.position().top
		};
	}

	do_drag(e) {
		if (!this.drag_node) return;
		
		const canvas_offset = this.$canvas.offset();
		const x = e.clientX - canvas_offset.left - this.drag_offset.x + this.$canvas.scrollLeft();
		const y = e.clientY - canvas_offset.top - this.drag_offset.y + this.$canvas.scrollTop();
		
		this.drag_node.css({
			left: Math.max(0, x) + 'px',
			top: Math.max(0, y) + 'px'
		});
	}

	end_drag() {
		if (this.drag_node) {
			const node_name = this.drag_node.data('node');
			const node = this.nodes.find(n => n.name === node_name);
			if (node) {
				node.x = parseInt(this.drag_node.css('left'));
				node.y = parseInt(this.drag_node.css('top'));
			}
		}
		
		this.is_dragging = false;
		this.drag_node = null;
	}

	save_layout() {
		frappe.call({
			method: 'imogi_pos.api.layout.save_layout_nodes',
			args: {
				profile: this.selected_profile,
				floor: this.selected_floor,
				nodes: this.nodes
			},
			callback: (r) => {
				if (r.message) {
					frappe.show_alert({ message: __('Layout saved'), indicator: 'green' });
					this.load_layout();
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
				method: 'imogi_pos.api.layout.create_layout_profile',
				args: { profile_name: values.profile_name },
				callback: (r) => {
					if (r.message) {
						this.load_profiles();
					}
				}
			});
		}, __('New Layout Profile'));
	}
}
