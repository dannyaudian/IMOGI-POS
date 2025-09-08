/**
 * IMOGI POS - Table Display
 * 
 * Main module for the Table Display interface
 * Handles:
 * - Restaurant floor layout visualization
 * - Table status monitoring
 * - Order operations (new, edit, merge, split)
 * - KOT management
 * - Realtime updates
 */

frappe.provide('imogi_pos.table_display');

imogi_pos.table_display = {
    // Settings and state
    settings: {
        branch: null,
        posProfile: null,
        floor: null,
        layoutProfile: null,
        refreshInterval: 30000, // 30 seconds
    },
    state: {
        floors: [],
        tables: [],
        orders: {},
        selectedTable: null,
        selectedOrder: null,
        refreshTimer: null,
        tableStatuses: {},
        layoutData: null,
        viewMode: 'normal' // normal, compact
    },
    
    /**
     * Initialize the Table Display
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#table-display',
            floorSelector: '#floor-selector',
            profileSelector: '#pos-profile-selector',
            branchSelector: '#branch-selector',
            refreshInterval: 30000 // 30 seconds
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Table Display container not found');
            return;
        }
        
        // Initialize components
        this.initializeNavigation();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadFloors()
                    .then(() => {
                        this.loadTableLayout();
                        this.setupRefreshInterval();
                        this.setupRealTimeUpdates();
                    });
            })
            .catch(err => {
                console.error('Failed to initialize Table Display:', err);
                this.showError('Failed to initialize Table Display. Please refresh the page.');
            });
    },
    
    /**
     * Initialize navigation with IMOGINav
     */
    initializeNavigation: function() {
        if (window.IMOGINav) {
            IMOGINav.init({
                container: '#imogi-header',
                showBack: true,
                showBranch: true,
                showProfile: true,
                showLogo: true,
                backUrl: '/app',
                onBranchChange: (branch) => {
                    this.settings.branch = branch;
                    this.loadFloors().then(() => this.loadTableLayout());
                },
                onProfileChange: (profile, details) => {
                    this.settings.posProfile = profile;
                    if (details) {
                        // Set default floor if available
                        if (details.imogi_default_floor) {
                            this.settings.floor = details.imogi_default_floor;
                        }
                        
                        // Set default layout profile if available
                        if (details.imogi_default_layout_profile) {
                            this.settings.layoutProfile = details.imogi_default_layout_profile;
                        }
                    }
                    this.loadFloors().then(() => this.loadTableLayout());
                }
            });
        }
    },
    
    /**
     * Load settings from localStorage or defaults
     * @returns {Promise} Promise resolving when settings are loaded
     */
    loadSettings: function() {
        return new Promise((resolve) => {
            // Try to load from localStorage
            const savedSettings = localStorage.getItem('imogi_table_display_settings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    this.settings = Object.assign({}, this.settings, parsedSettings);
                } catch (e) {
                    console.warn('Failed to parse saved settings');
                }
            }
            
            // Always update the refresh interval from options
            this.settings.refreshInterval = this.options.refreshInterval;
            
            resolve();
        });
    },
    
    /**
     * Save settings to localStorage
     */
    saveSettings: function() {
        localStorage.setItem('imogi_table_display_settings', JSON.stringify({
            floor: this.settings.floor,
            layoutProfile: this.settings.layoutProfile,
            viewMode: this.state.viewMode
        }));
    },
    
    /**
     * Load restaurant floors
     * @returns {Promise} Promise resolving when floors are loaded
     */
    loadFloors: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.layout.get_restaurant_floors',
                args: {
                    branch: this.settings.branch
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.floors = response.message;
                        
                        // Populate floor selector
                        this.populateFloorSelector();
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load floors'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Populate floor selector dropdown
     */
    populateFloorSelector: function() {
        const floorSelector = document.querySelector(this.options.floorSelector);
        if (!floorSelector) return;
        
        // Clear existing options
        floorSelector.innerHTML = '';
        
        // Add floor options
        this.state.floors.forEach(floor => {
            const option = document.createElement('option');
            option.value = floor.name;
            option.textContent = floor.floor_name;
            floorSelector.appendChild(option);
        });
        
        // Set selected value from settings
        if (this.settings.floor && this.state.floors.some(f => f.name === this.settings.floor)) {
            floorSelector.value = this.settings.floor;
        } else if (this.state.floors.length > 0) {
            // Set first floor as default if not already set
            this.settings.floor = this.state.floors[0].name;
            floorSelector.value = this.settings.floor;
        }
        
        // Bind change event
        floorSelector.addEventListener('change', () => {
            this.settings.floor = floorSelector.value;
            this.saveSettings();
            this.loadTableLayout();
        });
    },
    
    /**
     * Set up refresh interval
     */
    setupRefreshInterval: function() {
        // Clear any existing timer
        if (this.state.refreshTimer) {
            clearInterval(this.state.refreshTimer);
        }
        
        // Set up new refresh timer
        this.state.refreshTimer = setInterval(() => {
            this.refreshTableStatuses();
        }, this.settings.refreshInterval);
    },
    
    /**
     * Set up realtime updates
     */
    setupRealTimeUpdates: function() {
        // Listen for updates on all tables
        frappe.realtime.on('table_display:all', (data) => {
            if (data && data.action) {
                this.handleTableUpdate(data);
            }
        });
        
        // Listen for updates on current floor
        if (this.settings.floor) {
            frappe.realtime.on(`table_display:floor:${this.settings.floor}`, (data) => {
                if (data && data.action) {
                    this.handleTableUpdate(data);
                }
            });
        }
        
        // Listen for updates on specific tables
        if (this.state.tables.length > 0) {
            this.state.tables.forEach(table => {
                frappe.realtime.on(`table:${table.name}`, (data) => {
                    if (data && data.action) {
                        this.handleTableUpdate(data);
                    }
                });
            });
        }
    },
    
    /**
     * Handle table updates from realtime
     * @param {Object} data - Update data
     */
    handleTableUpdate: function(data) {
        switch (data.action) {
            case 'table_status_update':
                if (data.table && data.status) {
                    this.updateTableStatus(data.table, data.status);
                }
                break;
            
            case 'order_update':
                if (data.table && data.order) {
                    this.updateTableOrder(data.table, data.order);
                }
                break;
            
            case 'layout_update':
                if (data.floor && data.floor === this.settings.floor) {
                    this.loadTableLayout();
                }
                break;
        }
    },
    
    /**
     * Load table layout data
     */
    loadTableLayout: function() {
        if (!this.settings.floor) return;
        
        frappe.call({
            method: 'imogi_pos.api.layout.get_table_layout',
            args: {
                floor: this.settings.floor,
                branch: this.settings.branch,
                layout_profile: this.settings.layoutProfile
            },
            callback: (response) => {
                if (response.message) {
                    // Store layout data
                    this.state.layoutData = response.message.layout;
                    this.state.tables = response.message.tables || [];
                    
                    // Render layout
                    this.renderTableLayout();
                    
                    // Load table statuses
                    this.loadTableStatuses();
                    
                    // Update realtime subscriptions for tables
                    this.setupTableSubscriptions();
                } else {
                    console.error('Failed to load table layout');
                    this.showError('Failed to load table layout');
                }
            },
            error: (err) => {
                console.error('Error loading table layout:', err);
                this.showError('Error loading table layout');
            }
        });
    },
    
    /**
     * Set up realtime subscriptions for tables
     */
    setupTableSubscriptions: function() {
        // Clear existing subscriptions
        frappe.realtime.off('table:*');
        
        // Subscribe to each table
        if (this.state.tables.length > 0) {
            this.state.tables.forEach(table => {
                frappe.realtime.on(`table:${table.name}`, (data) => {
                    if (data && data.action) {
                        this.handleTableUpdate(data);
                    }
                });
            });
        }
    },
    
    /**
     * Load table statuses
     */
    loadTableStatuses: function() {
        if (!this.settings.floor || this.state.tables.length === 0) return;
        
        frappe.call({
            method: 'imogi_pos.api.layout.get_table_status',
            args: {
                floor: this.settings.floor,
                branch: this.settings.branch
            },
            callback: (response) => {
                if (response.message) {
                    // Update table statuses
                    this.state.tableStatuses = response.message;
                    
                    // Update table representations
                    this.updateTableVisuals();
                } else {
                    console.error('Failed to load table statuses');
                }
            },
            error: (err) => {
                console.error('Error loading table statuses:', err);
            }
        });
    },
    
    /**
     * Refresh table statuses
     */
    refreshTableStatuses: function() {
        this.loadTableStatuses();
    },
    
    /**
     * Update table status
     * @param {string} tableName - Table name
     * @param {Object} status - Table status
     */
    updateTableStatus: function(tableName, status) {
        // Update status in state
        this.state.tableStatuses[tableName] = status;
        
        // Update visual representation
        const tableElement = this.container.querySelector(`.table-node[data-table="${tableName}"]`);
        if (tableElement) {
            this.updateTableNode(tableElement, status);
        }
    },
    
    /**
     * Update table order
     * @param {string} tableName - Table name
     * @param {Object} order - Order data
     */
    updateTableOrder: function(tableName, order) {
        // Update order in state
        this.state.orders[tableName] = order;
        
        // Update table status if needed
        if (order) {
            const status = {
                occupied: true,
                order: order.name,
                order_status: order.workflow_state || order.status,
                guests: order.guests || 0
            };
            this.updateTableStatus(tableName, status);
        } else {
            // Table is now free
            const status = {
                occupied: false,
                order: null,
                order_status: null,
                guests: 0
            };
            this.updateTableStatus(tableName, status);
        }
        
        // Update order panel if this table is selected
        if (this.state.selectedTable === tableName) {
            this.state.selectedOrder = order;
            this.renderOrderPanel();
        }
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="table-display-layout ${this.state.viewMode === 'compact' ? 'compact-view' : ''}">
                <div class="table-display-controls">
                    <div class="view-controls">
                        <button id="refresh-btn" class="control-button" title="Refresh">
                            <i class="fa fa-sync"></i>
                        </button>
                        <button id="view-mode-btn" class="control-button" title="${this.state.viewMode === 'compact' ? 'Switch to Normal View' : 'Switch to Compact View'}">
                            <i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>
                        </button>
                        <button id="edit-layout-btn" class="control-button" title="Edit Layout">
                            <i class="fa fa-edit"></i>
                        </button>
                    </div>
                </div>
                
                <div class="table-display-main">
                    <div class="table-layout-container" id="table-layout-container">
                        <div class="loading-placeholder">Loading table layout...</div>
                    </div>
                    
                    <div class="order-panel" id="order-panel">
                        <div class="order-panel-empty">
                            <p>Select a table to view order details</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="modal-container" class="modal-container"></div>
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Bind events
        this.bindEvents();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Refresh button
        const refreshBtn = this.container.querySelector('#refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshTableStatuses();
            });
        }
        
        // View mode button
        const viewModeBtn = this.container.querySelector('#view-mode-btn');
        if (viewModeBtn) {
            viewModeBtn.addEventListener('click', () => {
                this.toggleViewMode();
            });
        }
        
        // Edit layout button
        const editLayoutBtn = this.container.querySelector('#edit-layout-btn');
        if (editLayoutBtn) {
            editLayoutBtn.addEventListener('click', () => {
                this.navigateToLayoutEditor();
            });
        }
    },
    
    /**
     * Toggle view mode between normal and compact
     */
    toggleViewMode: function() {
        this.state.viewMode = this.state.viewMode === 'normal' ? 'compact' : 'normal';
        this.saveSettings();
        
        // Update container class
        this.container.querySelector('.table-display-layout').classList.toggle('compact-view', this.state.viewMode === 'compact');
        
        // Update button icon
        const viewModeBtn = this.container.querySelector('#view-mode-btn');
        if (viewModeBtn) {
            viewModeBtn.innerHTML = `<i class="fa ${this.state.viewMode === 'compact' ? 'fa-expand' : 'fa-compress'}"></i>`;
            viewModeBtn.title = this.state.viewMode === 'compact' ? 'Switch to Normal View' : 'Switch to Compact View';
        }
        
        // Re-render layout to apply new view mode
        this.renderTableLayout();
    },
    
    /**
     * Navigate to layout editor
     */
    navigateToLayoutEditor: function() {
        window.location.href = `/app/table-layout-editor?floor=${this.settings.floor}`;
    },
    
    /**
     * Render table layout
     */
    renderTableLayout: function() {
        const layoutContainer = this.container.querySelector('#table-layout-container');
        if (!layoutContainer) return;
        
        if (!this.state.layoutData || !this.settings.floor) {
            layoutContainer.innerHTML = `
                <div class="empty-layout">
                    <p>No layout data available for this floor</p>
                    <button id="create-layout-btn" class="action-button">Create Layout</button>
                </div>
            `;
            
            const createLayoutBtn = layoutContainer.querySelector('#create-layout-btn');
            if (createLayoutBtn) {
                createLayoutBtn.addEventListener('click', () => {
                    this.navigateToLayoutEditor();
                });
            }
            
            return;
        }
        
        // Prepare layout area
        layoutContainer.innerHTML = '';
        
        // Create layout container with background
        const layout = document.createElement('div');
        layout.className = 'table-layout';
        
        // Add background image if available
        if (this.state.layoutData.background_image) {
            layout.style.backgroundImage = `url('${this.state.layoutData.background_image}')`;
        }
        
        // Set layout dimensions
        if (this.state.layoutData.width && this.state.layoutData.height) {
            layout.style.width = `${this.state.layoutData.width}px`;
            layout.style.height = `${this.state.layoutData.height}px`;
        } else {
            layout.style.width = '100%';
            layout.style.height = '100%';
        }
        
        // Add layout nodes
        if (this.state.layoutData.nodes && this.state.layoutData.nodes.length > 0) {
            this.state.layoutData.nodes.forEach(node => {
                const nodeElement = document.createElement('div');
                nodeElement.className = 'layout-node';
                nodeElement.style.left = `${node.left}px`;
                nodeElement.style.top = `${node.top}px`;
                nodeElement.style.width = `${node.width}px`;
                nodeElement.style.height = `${node.height}px`;
                
                // Add node content based on type
                switch (node.node_type) {
                    case 'table':
                        // Create table node
                        nodeElement.classList.add('table-node');
                        
                        // Add table data attribute
                        nodeElement.dataset.table = node.table;
                        
                        // Get table info
                        const table = this.state.tables.find(t => t.name === node.table);
                        
                        if (table) {
                            nodeElement.innerHTML = `
                                <div class="table-content">
                                    <div class="table-name">${table.table_name || table.name}</div>
                                    <div class="table-capacity">${table.capacity || 2}</div>
                                </div>
                            `;
                            
                            // Add table shape class
                            nodeElement.classList.add(`shape-${table.shape || 'rectangle'}`);
                            
                            // Add click event
                            nodeElement.addEventListener('click', () => {
                                this.selectTable(node.table);
                            });
                        } else {
                            nodeElement.innerHTML = `
                                <div class="table-content">
                                    <div class="table-name">Unknown Table</div>
                                </div>
                            `;
                            nodeElement.classList.add('invalid-table');
                        }
                        break;
                    
                    case 'text':
                        // Create text node
                        nodeElement.classList.add('text-node');
                        nodeElement.innerHTML = `<div class="text-content">${node.text || ''}</div>`;
                        
                        // Set font size if specified
                        if (node.font_size) {
                            nodeElement.style.fontSize = `${node.font_size}px`;
                        }
                        break;
                    
                    case 'wall':
                        // Create wall node
                        nodeElement.classList.add('wall-node');
                        
                        // Set wall style if specified
                        if (node.wall_style) {
                            nodeElement.classList.add(`wall-${node.wall_style}`);
                        }
                        break;
                    
                    case 'decoration':
                        // Create decoration node
                        nodeElement.classList.add('decoration-node');
                        
                        if (node.decoration_type) {
                            nodeElement.classList.add(`decoration-${node.decoration_type}`);
                        }
                        
                        // Add decoration icon if specified
                        if (node.decoration_icon) {
                            nodeElement.innerHTML = `<i class="fa ${node.decoration_icon}"></i>`;
                        }
                        break;
                }
                
                // Add node to layout
                layout.appendChild(nodeElement);
            });
        }
        
        // Add layout to container
        layoutContainer.appendChild(layout);
        
        // Update table statuses
        this.updateTableVisuals();
    },
    
    /**
     * Update table visual representations
     */
    updateTableVisuals: function() {
        if (!this.state.tableStatuses) return;
        
        // Update each table node
        this.container.querySelectorAll('.table-node').forEach(tableNode => {
            const tableName = tableNode.dataset.table;
            if (!tableName) return;
            
            const status = this.state.tableStatuses[tableName];
            if (status) {
                this.updateTableNode(tableNode, status);
            }
        });
    },
    
    /**
     * Update a single table node
     * @param {HTMLElement} tableNode - Table node element
     * @param {Object} status - Table status
     */
    updateTableNode: function(tableNode, status) {
        // Reset classes first
        tableNode.classList.remove('table-occupied', 'table-ordered', 'table-in-progress', 'table-ready', 'table-served');
        
        // Add appropriate classes based on status
        if (status.occupied) {
            tableNode.classList.add('table-occupied');
            
            // Add order status class if available
            if (status.order_status) {
                switch (status.order_status) {
                    case 'Draft':
                    case 'Sent to Kitchen':
                        tableNode.classList.add('table-ordered');
                        break;
                    case 'In Progress':
                        tableNode.classList.add('table-in-progress');
                        break;
                    case 'Ready':
                        tableNode.classList.add('table-ready');
                        break;
                    case 'Served':
                        tableNode.classList.add('table-served');
                        break;
                }
            }
            
            // Update guest count if available
            const capacityElement = tableNode.querySelector('.table-capacity');
            if (capacityElement && status.guests) {
                capacityElement.textContent = status.guests;
            }
        }
    },
    
    /**
     * Select a table
     * @param {string} tableName - Table name
     */
    selectTable: function(tableName) {
        // Deselect any previously selected table
        this.container.querySelectorAll('.table-node.selected').forEach(node => {
            node.classList.remove('selected');
        });
        
        // Select the new table
        const tableNode = this.container.querySelector(`.table-node[data-table="${tableName}"]`);
        if (tableNode) {
            tableNode.classList.add('selected');
        }
        
        // Update state
        this.state.selectedTable = tableName;
        
        // Load table order
        this.loadTableOrder(tableName);
    },
    
    /**
     * Load order for a table
     * @param {string} tableName - Table name
     */
    loadTableOrder: function(tableName) {
        frappe.call({
            method: 'imogi_pos.api.orders.get_table_order',
            args: {
                table: tableName,
                branch: this.settings.branch
            },
            callback: (response) => {
                if (response.message) {
                    // Store order in state
                    this.state.selectedOrder = response.message;
                    this.state.orders[tableName] = response.message;
                } else {
                    // No order for this table
                    this.state.selectedOrder = null;
                    this.state.orders[tableName] = null;
                }
                
                // Update order panel
                this.renderOrderPanel();
            },
            error: (err) => {
                console.error('Error loading table order:', err);
                this.showError('Error loading table order');
                
                // Clear order
                this.state.selectedOrder = null;
                this.renderOrderPanel();
            }
        });
    },
    
    /**
     * Render order panel
     */
    renderOrderPanel: function() {
        const orderPanel = this.container.querySelector('#order-panel');
        if (!orderPanel) return;
        
        // If no table is selected
        if (!this.state.selectedTable) {
            orderPanel.innerHTML = `
                <div class="order-panel-empty">
                    <p>Select a table to view order details</p>
                </div>
            `;
            return;
        }
        
        // Get table info
        const table = this.state.tables.find(t => t.name === this.state.selectedTable);
        
        // If no order for this table
        if (!this.state.selectedOrder) {
            orderPanel.innerHTML = `
                <div class="table-info">
                    <h3>Table: ${table ? table.table_name : this.state.selectedTable}</h3>
                    <div class="table-meta">
                        <span class="table-status">Available</span>
                        ${table ? `<span class="table-capacity">Capacity: ${table.capacity || 2}</span>` : ''}
                    </div>
                </div>
                <div class="order-actions">
                    <button id="new-order-btn" class="action-button primary">New Order</button>
                </div>
            `;
            
            // Bind new order button
            const newOrderBtn = orderPanel.querySelector('#new-order-btn');
            if (newOrderBtn) {
                newOrderBtn.addEventListener('click', () => {
                    this.createNewOrder();
                });
            }
            
            return;
        }
        
        // Render order details
        const order = this.state.selectedOrder;
        
        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                itemsHtml += `
                    <div class="order-item">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-qty">${item.qty}</div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                    </div>
                `;
            });
        } else {
            itemsHtml = `<div class="empty-items">No items in this order</div>`;
        }
        
        orderPanel.innerHTML = `
            <div class="table-info">
                <h3>Table: ${table ? table.table_name : this.state.selectedTable}</h3>
                <div class="table-meta">
                    <span class="table-status order-${order.workflow_state ? order.workflow_state.toLowerCase().replace(' ', '-') : 'draft'}">${order.workflow_state || 'Draft'}</span>
                    ${order.guests ? `<span class="table-guests">Guests: ${order.guests}</span>` : ''}
                </div>
            </div>
            
            <div class="order-info">
                <div class="order-header">
                    <h4>Order: ${order.name}</h4>
                    <div class="order-time">Created: ${this.formatDateTime(order.creation)}</div>
                </div>
                <div class="order-items">
                    ${itemsHtml}
                </div>
                <div class="order-totals">
                    <div class="total-row">
                        <div class="total-label">Subtotal</div>
                        <div class="total-value">${this.formatCurrency(order.net_total || 0)}</div>
                    </div>
                    ${order.taxes && order.taxes.length > 0 ? order.taxes.map(tax => `
                        <div class="total-row">
                            <div class="total-label">${tax.description}</div>
                            <div class="total-value">${this.formatCurrency(tax.tax_amount)}</div>
                        </div>
                    `).join('') : ''}
                    <div class="total-row grand-total">
                        <div class="total-label">Grand Total</div>
                        <div class="total-value">${this.formatCurrency(order.totals || 0)}</div>
                    </div>
                </div>
            </div>
            
            <div class="order-actions">
                <button id="edit-order-btn" class="action-button">Edit Order</button>
                <button id="send-kot-btn" class="action-button" ${order.workflow_state !== 'Draft' ? 'disabled' : ''}>Send to Kitchen</button>
                <button id="print-bill-btn" class="action-button">Print Bill</button>
                <button id="operations-btn" class="action-button">Operations <i class="fa fa-caret-down"></i></button>
            </div>
            
            <div class="operations-menu hidden" id="operations-menu">
                <button data-action="merge" class="operation-item">Merge Tables</button>
                <button data-action="switch" class="operation-item">Switch Table</button>
                <button data-action="split" class="operation-item">Split Bill</button>
                <button data-action="void" class="operation-item danger">Void Order</button>
            </div>
        `;
        
        // Bind order action buttons
        this.bindOrderActionButtons();
    },
    
    /**
     * Bind order action buttons
     */
    bindOrderActionButtons: function() {
        const orderPanel = this.container.querySelector('#order-panel');
        if (!orderPanel) return;
        
        // Edit order button
        const editOrderBtn = orderPanel.querySelector('#edit-order-btn');
        if (editOrderBtn) {
            editOrderBtn.addEventListener('click', () => {
                this.editOrder();
            });
        }
        
        // Send to kitchen button
        const sendKotBtn = orderPanel.querySelector('#send-kot-btn');
        if (sendKotBtn) {
            sendKotBtn.addEventListener('click', () => {
                this.sendToKitchen();
            });
        }
        
        // Print bill button
        const printBillBtn = orderPanel.querySelector('#print-bill-btn');
        if (printBillBtn) {
            printBillBtn.addEventListener('click', () => {
                this.printBill();
            });
        }
        
        // Operations menu button
        const operationsBtn = orderPanel.querySelector('#operations-btn');
        const operationsMenu = orderPanel.querySelector('#operations-menu');
        if (operationsBtn && operationsMenu) {
            operationsBtn.addEventListener('click', () => {
                operationsMenu.classList.toggle('hidden');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (event) => {
                if (!operationsBtn.contains(event.target) && !operationsMenu.contains(event.target)) {
                    operationsMenu.classList.add('hidden');
                }
            });
            
            // Bind operation buttons
            operationsMenu.querySelectorAll('.operation-item').forEach(button => {
                button.addEventListener('click', () => {
                    operationsMenu.classList.add('hidden');
                    
                    const action = button.dataset.action;
                    switch (action) {
                        case 'merge':
                            this.showMergeTablesDialog();
                            break;
                        case 'switch':
                            this.showSwitchTableDialog();
                            break;
                        case 'split':
                            this.navigateToSplitBill();
                            break;
                        case 'void':
                            this.showVoidOrderDialog();
                            break;
                    }
                });
            });
        }
    },
    
    /**
     * Create a new order for the selected table
     */
    createNewOrder: function() {
        if (!this.state.selectedTable) {
            this.showError('No table selected');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Creating new order...');
        
        frappe.call({
            method: 'imogi_pos.api.orders.open_or_create_for_table',
            args: {
                table: this.state.selectedTable,
                pos_profile: this.settings.posProfile,
                branch: this.settings.branch
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.name) {
                    // Navigate to waiter order page
                    window.location.href = `/app/waiter-order?pos_order=${response.message.name}`;
                } else {
                    this.showError('Failed to create new order');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to create new order');
            }
        });
    },
    
    /**
     * Edit the current order
     */
    editOrder: function() {
        if (!this.state.selectedOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Navigate to waiter order page
        window.location.href = `/app/waiter-order?pos_order=${this.state.selectedOrder.name}`;
    },
    
    /**
     * Send order to kitchen
     */
    sendToKitchen: function() {
        if (!this.state.selectedOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Sending to kitchen...');
        
        frappe.call({
            method: 'imogi_pos.api.kot.send_items_to_kitchen',
            args: {
                pos_order: this.state.selectedOrder.name
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Order sent to kitchen');
                    
                    // Reload order to update status
                    this.loadTableOrder(this.state.selectedTable);
                } else {
                    this.showError(`Failed to send to kitchen: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to send to kitchen');
            }
        });
    },
    
    /**
     * Print bill for the current order
     */
    printBill: function() {
        if (!this.state.selectedOrder) {
            this.showError('No order selected');
            return;
        }
        
        frappe.call({
            method: 'imogi_pos.api.printing.print_customer_bill',
            args: {
                pos_order: this.state.selectedOrder.name,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('Bill printed successfully');
                } else {
                    this.showError(`Failed to print bill: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showError('Failed to print bill');
            }
        });
    },
    
    /**
     * Show merge tables dialog
     */
    showMergeTablesDialog: function() {
        if (!this.state.selectedOrder || !this.state.selectedTable) {
            this.showError('No order selected');
            return;
        }
        
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Get occupied tables (exclude the selected one)
        const occupiedTables = [];
        Object.keys(this.state.tableStatuses).forEach(tableName => {
            if (tableName !== this.state.selectedTable && this.state.tableStatuses[tableName].occupied) {
                // Find table info
                const table = this.state.tables.find(t => t.name === tableName);
                if (table) {
                    occupiedTables.push({
                        name: tableName,
                        table_name: table.table_name || tableName,
                        order: this.state.tableStatuses[tableName].order
                    });
                }
            }
        });
        
        if (occupiedTables.length === 0) {
            this.showError('No other occupied tables to merge with');
            return;
        }
        
        // Build table options
        let tableOptionsHtml = '';
        occupiedTables.forEach(table => {
            tableOptionsHtml += `
                <div class="merge-table-option" data-table="${table.name}" data-order="${table.order}">
                    <div class="table-name">${table.table_name}</div>
                    <div class="table-order">${table.order || 'Unknown order'}</div>
                </div>
            `;
        });
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Merge Tables</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Select a table to merge with table ${this.state.selectedTable}:</p>
                        <div class="merge-tables-list">
                            ${tableOptionsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="cancel-merge-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-merge-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind table options
        modalContainer.querySelectorAll('.merge-table-option').forEach(option => {
            option.addEventListener('click', () => {
                const sourceTable = option.dataset.table;
                const sourceOrder = option.dataset.order;
                
                if (!sourceTable || !sourceOrder) {
                    this.showError('Invalid table or order selection');
                    return;
                }
                
                // Confirm merge
                this.showConfirmDialog(
                    'Confirm Merge',
                    `Are you sure you want to merge table ${sourceTable} into table ${this.state.selectedTable}?`,
                    'Merge Tables',
                    'Cancel',
                    () => {
                        this.mergeTables(sourceTable, sourceOrder);
                        modalContainer.classList.remove('active');
                    }
                );
            });
        });
    },
    
    /**
     * Merge tables
     * @param {string} sourceTable - Source table name
     * @param {string} sourceOrder - Source order name
     */
    mergeTables: function(sourceTable, sourceOrder) {
        if (!this.state.selectedOrder || !this.state.selectedTable) {
            this.showError('No destination order selected');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Merging tables...');
        
        frappe.call({
            method: 'imogi_pos.api.orders.merge_tables',
            args: {
                source_order: sourceOrder,
                target_order: this.state.selectedOrder.name,
                source_table: sourceTable,
                target_table: this.state.selectedTable
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Tables merged successfully');
                    
                    // Reload order to update items
                    this.loadTableOrder(this.state.selectedTable);
                    
                    // Refresh table statuses
                    this.refreshTableStatuses();
                } else {
                    this.showError(`Failed to merge tables: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to merge tables');
            }
        });
    },
    
    /**
     * Show switch table dialog
     */
    showSwitchTableDialog: function() {
        if (!this.state.selectedOrder || !this.state.selectedTable) {
            this.showError('No order selected');
            return;
        }
        
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Get available tables (not occupied)
        const availableTables = [];
        this.state.tables.forEach(table => {
            if (table.name !== this.state.selectedTable) {
                const status = this.state.tableStatuses[table.name];
                if (!status || !status.occupied) {
                    availableTables.push(table);
                }
            }
        });
        
        if (availableTables.length === 0) {
            this.showError('No available tables to switch to');
            return;
        }
        
        // Build table options
        let tableOptionsHtml = '';
        availableTables.forEach(table => {
            tableOptionsHtml += `
                <div class="switch-table-option" data-table="${table.name}">
                    <div class="table-name">${table.table_name || table.name}</div>
                    <div class="table-capacity">Capacity: ${table.capacity || 2}</div>
                </div>
            `;
        });
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Switch Table</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Select a table to move order ${this.state.selectedOrder.name} to:</p>
                        <div class="switch-tables-list">
                            ${tableOptionsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="cancel-switch-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind cancel button
        const cancelBtn = modalContainer.querySelector('#cancel-switch-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind table options
        modalContainer.querySelectorAll('.switch-table-option').forEach(option => {
            option.addEventListener('click', () => {
                const targetTable = option.dataset.table;
                
                if (!targetTable) {
                    this.showError('Invalid table selection');
                    return;
                }
                
                // Confirm switch
                this.showConfirmDialog(
                    'Confirm Switch',
                    `Are you sure you want to move the order from table ${this.state.selectedTable} to table ${targetTable}?`,
                    'Switch Table',
                    'Cancel',
                    () => {
                        this.switchTable(targetTable);
                        modalContainer.classList.remove('active');
                    }
                );
            });
        });
    },
    
    /**
     * Switch table
     * @param {string} targetTable - Target table name
     */
    switchTable: function(targetTable) {
        if (!this.state.selectedOrder || !this.state.selectedTable) {
            this.showError('No order selected');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Switching table...');
        
        frappe.call({
            method: 'imogi_pos.api.orders.switch_table',
            args: {
                pos_order: this.state.selectedOrder.name,
                source_table: this.state.selectedTable,
                target_table: targetTable
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Table switched successfully');
                    
                    // Update selected table
                    this.selectTable(targetTable);
                    
                    // Refresh table statuses
                    this.refreshTableStatuses();
                } else {
                    this.showError(`Failed to switch table: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to switch table');
            }
        });
    },
    
    /**
     * Navigate to split bill page
     */
    navigateToSplitBill: function() {
        if (!this.state.selectedOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Navigate to cashier console with the order selected
        window.location.href = `/app/cashier-console?order=${this.state.selectedOrder.name}`;
    },
    
    /**
     * Show void order dialog
     */
    showVoidOrderDialog: function() {
        if (!this.state.selectedOrder || !this.state.selectedTable) {
            this.showError('No order selected');
            return;
        }
        
        // Show confirmation dialog
        this.showConfirmDialog(
            'Void Order',
            `Are you sure you want to void order ${this.state.selectedOrder.name}? This action cannot be undone.`,
            'Void Order',
            'Cancel',
            () => {
                this.voidOrder();
            }
        );
    },
    
    /**
     * Void the current order
     */
    voidOrder: function() {
        if (!this.state.selectedOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Voiding order...');
        
        frappe.call({
            method: 'imogi_pos.api.orders.void_order',
            args: {
                pos_order: this.state.selectedOrder.name
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Order voided successfully');
                    
                    // Clear selected order
                    this.state.selectedOrder = null;
                    
                    // Refresh table statuses
                    this.refreshTableStatuses();
                    
                    // Update order panel
                    this.renderOrderPanel();
                } else {
                    this.showError(`Failed to void order: ${response.message && response.message.error || 'Unknown error'}`);
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to void order');
            }
        });
    },
    
    /**
     * Show loading indicator
     * @param {boolean} show - Whether to show or hide
     * @param {string} [message] - Optional message
     */
    showLoading: function(show, message = 'Loading...') {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        if (show) {
            modalContainer.innerHTML = `
                <div class="modal-overlay loading-overlay">
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message}</div>
                </div>
            `;
            modalContainer.classList.add('active');
        } else {
            modalContainer.innerHTML = '';
            modalContainer.classList.remove('active');
        }
    },
    
    /**
     * Show confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {string} confirmText - Confirm button text
     * @param {string} cancelText - Cancel button text
     * @param {Function} onConfirm - Confirm callback
     * @param {Function} [onCancel] - Optional cancel callback
     */
    showConfirmDialog: function(title, message, confirmText, cancelText, onConfirm, onCancel) {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button id="confirm-btn" class="modal-button primary">${confirmText}</button>
                        <button id="cancel-btn" class="modal-button">${cancelText}</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind buttons
        const confirmBtn = modalContainer.querySelector('#confirm-btn');
        const cancelBtn = modalContainer.querySelector('#cancel-btn');
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
                if (onConfirm) onConfirm();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
                if (onCancel) onCancel();
            });
        }
    },
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: function(message) {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-exclamation-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after delay
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    },
    
    /**
     * Show toast message
     * @param {string} message - Toast message
     */
    showToast: function(message) {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-check-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after delay
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    },
    
    /**
     * Format date and time
     * @param {string} datetime - ISO datetime string
     * @returns {string} Formatted date and time
     */
    formatDateTime: function(datetime) {
        if (!datetime) return '';
        
        const date = new Date(datetime);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    
    /**
     * Format currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency
     */
    formatCurrency: function(amount) {
        return frappe.format(amount, { fieldtype: 'Currency' });
    }
};