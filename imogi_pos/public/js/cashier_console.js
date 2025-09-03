/**
 * IMOGI POS - Cashier Console
 * 
 * Main module for the Cashier Console interface
 * Handles:
 * - Orders listing (ready/served)
 * - Split bill preview/commit
 * - SI generation (is_pos=1)
 * - Receipt/Customer Bill printing
 * - Customer lookup by phone
 * - Payment request and Customer Display integration
 * - Template-first catalog with variant picker
 */

frappe.provide('imogi_pos.cashier_console');

imogi_pos.cashier_console = {
    // Settings and state
    settings: {
        posProfile: null,
        branch: null,
        posDomain: 'Restaurant',
        posMode: 'Counter',
    },
    state: {
        currentOrder: null,
        orderList: [],
        filteredOrders: [],
        selectedItems: [],
        splitPreview: null,
        customerInfo: null,
        cart: [],
        activePaymentRequest: null,
        selectedPrinter: null,
        searchTerm: '',
        viewMode: 'orders', // orders, split, catalog, payment
        filterStatus: 'Ready',
        refreshInterval: null,
    },
    
    /**
     * Initialize the Cashier Console
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#cashier-console',
            profileSelector: '#pos-profile-selector',
            branchSelector: '#branch-selector',
            orderRefreshInterval: 30000, // 30 seconds
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Cashier Console container not found');
            return;
        }
        
        // Initialize components
        this.initializeNavigation();
        this.initializePOSProfile();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadOrders();
                this.setupRefreshInterval();
                this.setupRealTimeUpdates();
            })
            .catch(err => {
                console.error('Failed to initialize Cashier Console:', err);
                this.showError('Failed to initialize Cashier Console. Please refresh the page.');
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
                    this.loadOrders();
                },
                onProfileChange: (profile, details) => {
                    this.settings.posProfile = profile;
                    if (details) {
                        this.settings.posDomain = details.imogi_pos_domain || 'Restaurant';
                        this.settings.posMode = details.imogi_mode || 'Counter';
                    }
                    this.loadOrders();
                }
            });
        }
    },
    
    /**
     * Initialize POS Profile selection
     */
    initializePOSProfile: function() {
        const profileSelector = document.querySelector(this.options.profileSelector);
        if (!profileSelector) return;
        
        frappe.call({
            method: 'imogi_pos.api.public.get_allowed_pos_profiles',
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    profileSelector.innerHTML = '';
                    
                    response.message.forEach(profile => {
                        const option = document.createElement('option');
                        option.value = profile.name;
                        option.textContent = profile.profile_name || profile.name;
                        profileSelector.appendChild(option);
                    });
                    
                    // Set current profile
                    if (this.settings.posProfile) {
                        profileSelector.value = this.settings.posProfile;
                    } else if (profileSelector.options.length > 0) {
                        this.settings.posProfile = profileSelector.options[0].value;
                    }
                    
                    // Trigger change to load settings
                    profileSelector.dispatchEvent(new Event('change'));
                }
            }
        });
    },
    
    /**
     * Load settings based on POS Profile
     * @returns {Promise} Promise resolving when settings are loaded
     */
    loadSettings: function() {
        return new Promise((resolve, reject) => {
            if (!this.settings.posProfile) {
                // Use default profile
                frappe.call({
                    method: 'imogi_pos.api.public.get_default_pos_profile',
                    callback: (response) => {
                        if (response.message) {
                            this.settings.posProfile = response.message;
                            this.loadProfileSettings().then(resolve).catch(reject);
                        } else {
                            reject(new Error('No POS Profile available'));
                        }
                    },
                    error: reject
                });
                return;
            }
            
            this.loadProfileSettings().then(resolve).catch(reject);
        });
    },
    
    /**
     * Load settings from the current POS Profile
     * @returns {Promise} Promise resolving when profile settings are loaded
     */
    loadProfileSettings: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.public.get_pos_profile_details',
                args: {
                    profile: this.settings.posProfile
                },
                callback: (response) => {
                    if (response.message) {
                        const profile = response.message;
                        
                        // Set domain and mode
                        this.settings.posDomain = profile.imogi_pos_domain || 'Restaurant';
                        this.settings.posMode = profile.imogi_mode || 'Counter';
                        
                        // Set branch if available
                        if (profile.imogi_branch && !this.settings.branch) {
                            this.settings.branch = profile.imogi_branch;
                        }
                        
                        // Check if we need an active POS session
                        if (profile.imogi_require_pos_session && 
                            profile.imogi_enforce_session_on_cashier) {
                            this.checkActivePOSSession();
                        }
                        
                        // Set printer settings
                        this.settings.printerSettings = {
                            interface: profile.imogi_printer_cashier_interface || 'OS',
                            printerName: profile.imogi_printer_cashier || '',
                            receiptFormat: profile.imogi_receipt_format || 'POS Receipt',
                            customerBillFormat: profile.imogi_customer_bill_format || 'Customer Bill',
                            printNotesOnReceipt: profile.imogi_print_notes_on_receipt !== 0,
                            hideNotesOnTableBill: profile.imogi_hide_notes_on_table_bill !== 0
                        };
                        
                        // Load print service if available
                        if (window.IMOGIPrintService) {
                            IMOGIPrintService.init({
                                defaultInterface: this.settings.printerSettings.interface,
                                interfaces: {
                                    [this.settings.printerSettings.interface]: {
                                        deviceName: this.settings.printerSettings.printerName
                                    }
                                }
                            });
                        }
                        
                        resolve(profile);
                    } else {
                        reject(new Error('Failed to load POS Profile settings'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Check for active POS session
     */
    checkActivePOSSession: function() {
        frappe.call({
            method: 'imogi_pos.api.billing.check_pos_session',
            args: {
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                const info = response.message || {};

                if (!info.exists) {
                    // POS Session feature not available
                    this.hidePOSSessionUI();
                    this.showError('POS Session feature is unavailable. Continuing without session.');
                } else if (!info.active) {
                    // No active session
                    this.showError(
                        'No active POS Session found. Please open a POS Session first.',
                        'Open POS Session',
                        () => {
                            window.location.href = '/app/pos-session/new-pos-session';
                        }
                    );
                }
            }
        });
    },

    /**
     * Hide POS-session related UI elements
     */
    hidePOSSessionUI: function() {
        document.querySelectorAll('.pos-session-required').forEach(el => {
            el.classList.add('hidden');
        });
    },
    
    /**
     * Set up realtime updates
     */
    setupRealTimeUpdates: function() {
        // Listen for updates on orders
        if (this.settings.branch) {
            frappe.realtime.on(`pos_order:branch:${this.settings.branch}`, (data) => {
                if (data && data.action) {
                    // Handle different actions
                    if (data.action === 'update' && data.order) {
                        this.updateOrderInList(data.order);
                    } else if (data.action === 'new' && data.order) {
                        this.addOrderToList(data.order);
                    } else if (data.action === 'delete' && data.order_name) {
                        this.removeOrderFromList(data.order_name);
                    }
                }
            });
        }
        
        // Listen for payment updates
        frappe.realtime.on('payment_update', (data) => {
            if (data && data.payment_request === this.state.activePaymentRequest) {
                if (data.status === 'Paid') {
                    this.handlePaymentSuccess(data);
                } else if (data.status === 'Expired') {
                    this.handlePaymentExpired(data);
                }
            }
        });
    },
    
    /**
     * Set up periodic refresh interval
     */
    setupRefreshInterval: function() {
        // Clear any existing interval
        if (this.state.refreshInterval) {
            clearInterval(this.state.refreshInterval);
        }
        
        // Set up new interval
        this.state.refreshInterval = setInterval(() => {
            this.loadOrders();
        }, this.options.orderRefreshInterval);
    },
    
    /**
     * Load orders from server
     */
    loadOrders: function() {
        // Show loading indicator
        this.showLoading(true);
        
        frappe.call({
            method: 'imogi_pos.api.billing.list_orders_for_cashier',
            args: {
                pos_profile: this.settings.posProfile,
                branch: this.settings.branch,
                workflow_state: this.state.filterStatus
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && Array.isArray(response.message)) {
                    this.state.orderList = response.message;
                    this.filterOrders();
                    this.renderOrderList();
                } else {
                    this.state.orderList = [];
                    this.renderOrderList();
                }
            },
            error: (error) => {
                this.showLoading(false);
                this.showError('Failed to load orders: ' + (error.message || 'Unknown error'));
            }
        });
    },
    
    /**
     * Filter orders based on search term and status
     */
    filterOrders: function() {
        const searchTerm = this.state.searchTerm.toLowerCase();
        
        this.state.filteredOrders = this.state.orderList.filter(order => {
            // Filter by status if set
            if (this.state.filterStatus && order.workflow_state !== this.state.filterStatus) {
                return false;
            }
            
            // Filter by search term if set
            if (searchTerm) {
                const tableMatch = order.table_name && order.table_name.toLowerCase().includes(searchTerm);
                const orderMatch = order.name.toLowerCase().includes(searchTerm);
                const customerMatch = order.customer_name && order.customer_name.toLowerCase().includes(searchTerm);
                
                return tableMatch || orderMatch || customerMatch;
            }
            
            return true;
        });
    },
    
    /**
     * Update an order in the list
     * @param {Object} order - Updated order data
     */
    updateOrderInList: function(order) {
        const index = this.state.orderList.findIndex(o => o.name === order.name);
        
        if (index !== -1) {
            this.state.orderList[index] = order;
        } else {
            this.state.orderList.push(order);
        }
        
        this.filterOrders();
        this.renderOrderList();
        
        // If this is the current order, update details
        if (this.state.currentOrder && this.state.currentOrder.name === order.name) {
            this.state.currentOrder = order;
            this.renderOrderDetails();
        }
    },
    
    /**
     * Add a new order to the list
     * @param {Object} order - New order data
     */
    addOrderToList: function(order) {
        // Only add if not already in list
        if (!this.state.orderList.some(o => o.name === order.name)) {
            this.state.orderList.push(order);
            this.filterOrders();
            this.renderOrderList();
        }
    },
    
    /**
     * Remove an order from the list
     * @param {string} orderName - Order name to remove
     */
    removeOrderFromList: function(orderName) {
        this.state.orderList = this.state.orderList.filter(o => o.name !== orderName);
        this.filterOrders();
        this.renderOrderList();
        
        // If this is the current order, clear it
        if (this.state.currentOrder && this.state.currentOrder.name === orderName) {
            this.state.currentOrder = null;
            this.renderOrderDetails();
        }
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="cashier-console-layout">
                <div class="cashier-console-sidebar">
                    <div class="filter-bar">
                        <div class="search-container">
                            <input type="text" id="order-search" placeholder="Search orders..." class="search-input">
                            <button id="search-btn" class="search-button">
                                <i class="fa fa-search"></i>
                            </button>
                        </div>
                        <div class="filter-buttons">
                            <button data-status="Ready" class="filter-button ${this.state.filterStatus === 'Ready' ? 'active' : ''}">Ready</button>
                            <button data-status="Served" class="filter-button ${this.state.filterStatus === 'Served' ? 'active' : ''}">Served</button>
                            <button data-status="All" class="filter-button ${this.state.filterStatus === 'All' ? 'active' : ''}">All</button>
                        </div>
                    </div>
                    <div class="order-list" id="order-list">
                        <div class="loading-container">Loading orders...</div>
                    </div>
                </div>
                <div class="cashier-console-main">
                    <div class="cashier-console-header">
                        <div class="view-controls">
                            <button id="view-orders" class="view-button ${this.state.viewMode === 'orders' ? 'active' : ''}">Orders</button>
                            <button id="view-catalog" class="view-button ${this.state.viewMode === 'catalog' ? 'active' : ''}">Catalog</button>
                        </div>
                        <div class="action-buttons">
                            <button id="new-order-btn" class="action-button primary">New Order</button>
                            <button id="print-bill-btn" class="action-button" disabled>Print Bill</button>
                            <button id="split-bill-btn" class="action-button" disabled>Split Bill</button>
                            <button id="request-payment-btn" class="action-button accent" disabled>Request Payment</button>
                        </div>
                    </div>
                    <div class="cashier-console-content">
                        <div id="order-details" class="order-details-panel ${this.state.viewMode === 'orders' ? '' : 'hidden'}">
                            <div class="empty-state">
                                <i class="fa fa-receipt empty-icon"></i>
                                <h3>No Order Selected</h3>
                                <p>Select an order from the list or create a new one</p>
                            </div>
                        </div>
                        <div id="catalog-panel" class="catalog-panel ${this.state.viewMode === 'catalog' ? '' : 'hidden'}">
                            <div class="catalog-container">
                                <div class="catalog-sidebar">
                                    <div class="item-group-list" id="item-group-list">
                                        <div class="loading-container">Loading item groups...</div>
                                    </div>
                                </div>
                                <div class="catalog-main">
                                    <div class="catalog-items" id="catalog-items">
                                        <div class="loading-container">Loading items...</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="split-bill-panel" class="split-bill-panel ${this.state.viewMode === 'split' ? '' : 'hidden'}">
                            <div class="split-container">
                                <div class="split-header">
                                    <h3>Split Bill Preview</h3>
                                    <div class="split-controls">
                                        <button id="split-cancel" class="split-button">Cancel</button>
                                        <button id="split-confirm" class="split-button primary">Confirm Split</button>
                                    </div>
                                </div>
                                <div class="split-content" id="split-content">
                                    <div class="loading-container">Preparing split preview...</div>
                                </div>
                            </div>
                        </div>
                        <div id="payment-panel" class="payment-panel ${this.state.viewMode === 'payment' ? '' : 'hidden'}">
                            <div class="payment-container">
                                <div class="payment-header">
                                    <h3>Payment Request</h3>
                                    <div class="payment-controls">
                                        <button id="payment-cancel" class="payment-button">Cancel</button>
                                        <button id="payment-cash" class="payment-button primary">Cash Payment</button>
                                    </div>
                                </div>
                                <div class="payment-content" id="payment-content">
                                    <div class="loading-container">Preparing payment request...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="toast-container" class="toast-container"></div>
            <div id="modal-container" class="modal-container"></div>
        `;
        
        // Initial rendering
        this.renderOrderList();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Filter buttons
        this.container.querySelectorAll('.filter-button').forEach(button => {
            button.addEventListener('click', () => {
                const status = button.dataset.status;
                this.state.filterStatus = status === 'All' ? null : status;
                
                // Update active state
                this.container.querySelectorAll('.filter-button').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.status === (status || 'All'));
                });
                
                this.loadOrders();
            });
        });
        
        // Search input
        const searchInput = this.container.querySelector('#order-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.state.searchTerm = searchInput.value;
                this.filterOrders();
                this.renderOrderList();
            });
        }
        
        // View buttons
        this.container.querySelector('#view-orders').addEventListener('click', () => this.switchView('orders'));
        this.container.querySelector('#view-catalog').addEventListener('click', () => this.switchView('catalog'));
        
        // Action buttons
        this.container.querySelector('#new-order-btn').addEventListener('click', () => this.createNewOrder());
        this.container.querySelector('#print-bill-btn').addEventListener('click', () => this.printBill());
        this.container.querySelector('#split-bill-btn').addEventListener('click', () => this.showSplitBill());
        this.container.querySelector('#request-payment-btn').addEventListener('click', () => this.requestPayment());
        
        // Split bill panel
        this.container.querySelector('#split-cancel').addEventListener('click', () => this.cancelSplitBill());
        this.container.querySelector('#split-confirm').addEventListener('click', () => this.confirmSplitBill());
        
        // Payment panel
        this.container.querySelector('#payment-cancel').addEventListener('click', () => this.cancelPayment());
        this.container.querySelector('#payment-cash').addEventListener('click', () => this.processCashPayment());
    },
    
    /**
     * Switch between different views
     * @param {string} viewMode - View mode to switch to
     */
    switchView: function(viewMode) {
        this.state.viewMode = viewMode;
        
        // Update view buttons
        this.container.querySelectorAll('.view-button').forEach(button => {
            button.classList.toggle('active', 
                (button.id === 'view-orders' && viewMode === 'orders') || 
                (button.id === 'view-catalog' && viewMode === 'catalog')
            );
        });
        
        // Show/hide panels
        this.container.querySelector('#order-details').classList.toggle('hidden', viewMode !== 'orders');
        this.container.querySelector('#catalog-panel').classList.toggle('hidden', viewMode !== 'catalog');
        this.container.querySelector('#split-bill-panel').classList.toggle('hidden', viewMode !== 'split');
        this.container.querySelector('#payment-panel').classList.toggle('hidden', viewMode !== 'payment');
        
        // Load catalog if switching to catalog view
        if (viewMode === 'catalog') {
            this.loadCatalog();
        }
    },
    
    /**
     * Render the order list
     */
    renderOrderList: function() {
        const orderListElement = this.container.querySelector('#order-list');
        if (!orderListElement) return;
        
        if (this.state.filteredOrders.length === 0) {
            orderListElement.innerHTML = `
                <div class="empty-state small">
                    <i class="fa fa-receipt empty-icon"></i>
                    <p>No orders found</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        this.state.filteredOrders.forEach(order => {
            const isSelected = this.state.currentOrder && this.state.currentOrder.name === order.name;
            const statusClass = (order.workflow_state || '').toLowerCase().replace(' ', '-');
            
            html += `
                <div class="order-card ${isSelected ? 'selected' : ''} ${statusClass}" data-order="${order.name}">
                    <div class="order-header">
                        <div class="order-name">${order.name}</div>
                        <div class="order-status ${statusClass}">${order.workflow_state}</div>
                    </div>
                    <div class="order-info">
                        ${order.table_name ? `<div class="order-table">Table: ${order.table_name}</div>` : ''}
                        ${order.customer_name ? `<div class="order-customer">Customer: ${order.customer_name}</div>` : ''}
                        <div class="order-time">Created: ${this.formatTime(order.creation)}</div>
                    </div>
                    <div class="order-total">
                        <div class="total-amount">${this.formatCurrency(order.totals || 0)}</div>
                        <div class="items-count">${order.item_count || 0} items</div>
                    </div>
                </div>
            `;
        });
        
        orderListElement.innerHTML = html;
        
        // Add click events
        orderListElement.querySelectorAll('.order-card').forEach(card => {
            card.addEventListener('click', () => {
                const orderName = card.dataset.order;
                this.selectOrder(orderName);
            });
        });
    },
    
    /**
     * Select an order to view details
     * @param {string} orderName - Order name to select
     */
    selectOrder: function(orderName) {
        // Get order details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'POS Order',
                name: orderName
            },
            callback: (response) => {
                if (response.message) {
                    this.state.currentOrder = response.message;
                    
                    // Update selection in list
                    this.container.querySelectorAll('.order-card').forEach(card => {
                        card.classList.toggle('selected', card.dataset.order === orderName);
                    });
                    
                    // Enable action buttons
                    this.container.querySelector('#print-bill-btn').disabled = false;
                    this.container.querySelector('#split-bill-btn').disabled = false;
                    this.container.querySelector('#request-payment-btn').disabled = false;
                    
                    // Render order details
                    this.renderOrderDetails();
                    
                    // Switch to orders view if not already there
                    if (this.state.viewMode !== 'orders') {
                        this.switchView('orders');
                    }
                } else {
                    this.showError('Failed to load order details');
                }
            },
            error: () => {
                this.showError('Failed to load order details');
            }
        });
    },
    
    /**
     * Render order details
     */
    renderOrderDetails: function() {
        const detailsElement = this.container.querySelector('#order-details');
        if (!detailsElement) return;
        
        if (!this.state.currentOrder) {
            detailsElement.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-receipt empty-icon"></i>
                    <h3>No Order Selected</h3>
                    <p>Select an order from the list or create a new one</p>
                </div>
            `;
            return;
        }
        
        const order = this.state.currentOrder;
        
        let customerSection = '';
        if (order.customer) {
            customerSection = `
                <div class="customer-info">
                    <div class="info-header">
                        <h4>Customer Information</h4>
                        <button id="change-customer-btn" class="small-button">Change</button>
                    </div>
                    <div class="customer-details">
                        <div class="customer-name">${order.customer_name || order.customer}</div>
                        ${order.contact_mobile ? `<div class="customer-phone">${order.contact_mobile}</div>` : ''}
                    </div>
                </div>
            `;
        } else {
            customerSection = `
                <div class="customer-info">
                    <div class="info-header">
                        <h4>Customer Information</h4>
                        <button id="add-customer-btn" class="small-button primary">Add Customer</button>
                    </div>
                    <div class="customer-placeholder">
                        <p>No customer assigned</p>
                    </div>
                </div>
            `;
        }
        
        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                itemsHtml += `
                    <div class="item-row">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-qty">${item.qty}</div>
                        <div class="item-rate">${this.formatCurrency(item.rate)}</div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                    </div>
                `;
                
                // Add notes if any
                if (item.notes) {
                    itemsHtml += `
                        <div class="item-notes">
                            Note: ${item.notes}
                        </div>
                    `;
                }
            });
        } else {
            itemsHtml = `
                <div class="empty-items">
                    <p>No items in this order</p>
                </div>
            `;
        }
        
        detailsElement.innerHTML = `
            <div class="order-header-section">
                <div class="order-info-main">
                    <h3>${order.name}</h3>
                    <div class="order-meta">
                        <span class="order-status ${order.workflow_state ? order.workflow_state.toLowerCase().replace(' ', '-') : ''}">${order.workflow_state}</span>
                        ${order.table ? `<span class="order-table">Table: ${order.table}</span>` : ''}
                        <span class="order-time">Created: ${this.formatDateTime(order.creation)}</span>
                    </div>
                </div>
                <div class="order-actions">
                    <button id="edit-order-btn" class="action-button">Edit Order</button>
                </div>
            </div>
            
            ${customerSection}
            
            <div class="order-items-section">
                <div class="items-header">
                    <h4>Order Items</h4>
                </div>
                <div class="items-table">
                    <div class="item-header">
                        <div class="item-name">Item</div>
                        <div class="item-qty">Qty</div>
                        <div class="item-rate">Rate</div>
                        <div class="item-amount">Amount</div>
                    </div>
                    <div class="items-body">
                        ${itemsHtml}
                    </div>
                </div>
            </div>
            
            <div class="order-totals-section">
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
            
            <div class="invoice-status-section">
                ${order.sales_invoice ? `
                    <div class="invoice-info">
                        <span class="invoice-label">Invoice:</span>
                        <span class="invoice-value">
                            <a href="/app/sales-invoice/${order.sales_invoice}" target="_blank">${order.sales_invoice}</a>
                        </span>
                    </div>
                ` : `
                    <div class="invoice-placeholder">
                        <button id="generate-invoice-btn" class="action-button accent">Generate Invoice</button>
                    </div>
                `}
            </div>
        `;
        
        // Bind order detail events
        this.bindOrderDetailEvents();
    },
    
    /**
     * Bind events to order detail elements
     */
    bindOrderDetailEvents: function() {
        const changeCustomerBtn = this.container.querySelector('#change-customer-btn');
        if (changeCustomerBtn) {
            changeCustomerBtn.addEventListener('click', () => this.showCustomerSelector());
        }
        
        const addCustomerBtn = this.container.querySelector('#add-customer-btn');
        if (addCustomerBtn) {
            addCustomerBtn.addEventListener('click', () => this.showCustomerSelector());
        }
        
        const editOrderBtn = this.container.querySelector('#edit-order-btn');
        if (editOrderBtn) {
            editOrderBtn.addEventListener('click', () => this.editOrder());
        }
        
        const generateInvoiceBtn = this.container.querySelector('#generate-invoice-btn');
        if (generateInvoiceBtn) {
            generateInvoiceBtn.addEventListener('click', () => this.generateInvoice());
        }
    },
    
    /**
     * Show customer selector modal
     */
    showCustomerSelector: function() {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Customer</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="search-container">
                            <input type="text" id="customer-search" placeholder="Search by name or phone..." class="search-input">
                            <button id="customer-search-btn" class="search-button">
                                <i class="fa fa-search"></i>
                            </button>
                        </div>
                        <div class="customer-list" id="customer-list">
                            <div class="loading-container">Loading customers...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="create-customer-btn" class="modal-button">Create New Customer</button>
                        <button id="cancel-customer-btn" class="modal-button secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind modal events
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        const cancelBtn = modalContainer.querySelector('#cancel-customer-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        const createCustomerBtn = modalContainer.querySelector('#create-customer-btn');
        if (createCustomerBtn) {
            createCustomerBtn.addEventListener('click', () => {
                this.showCreateCustomerForm();
            });
        }
        
        // Load customers
        this.loadCustomers();
        
        // Bind search
        const searchInput = modalContainer.querySelector('#customer-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchCustomers(searchInput.value);
            });
            
            // Focus search input
            searchInput.focus();
        }
    },
    
    /**
     * Load customers for selector
     */
    loadCustomers: function() {
        const customerList = this.container.querySelector('#customer-list');
        if (!customerList) return;
        
        frappe.call({
            method: 'imogi_pos.api.customers.list_customers',
            args: {
                branch: this.settings.branch
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    this.renderCustomerList(response.message);
                } else {
                    customerList.innerHTML = `
                        <div class="empty-state small">
                            <p>No customers found</p>
                        </div>
                    `;
                }
            },
            error: () => {
                customerList.innerHTML = `
                    <div class="empty-state small">
                        <p>Failed to load customers</p>
                    </div>
                `;
            }
        });
    },
    
    /**
     * Search customers by name or phone
     * @param {string} searchTerm - Search term
     */
    searchCustomers: function(searchTerm) {
        if (!searchTerm || searchTerm.length < 3) {
            this.loadCustomers();
            return;
        }
        
        const customerList = this.container.querySelector('#customer-list');
        if (!customerList) return;
        
        customerList.innerHTML = `<div class="loading-container">Searching...</div>`;
        
        frappe.call({
            method: 'imogi_pos.api.customers.find_customer_by_phone',
            args: {
                phone: searchTerm,
                name_search: searchTerm
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    this.renderCustomerList(response.message);
                } else {
                    customerList.innerHTML = `
                        <div class="empty-state small">
                            <p>No customers found matching "${searchTerm}"</p>
                            <button id="quick-create-btn" class="action-button small">Create New Customer</button>
                        </div>
                    `;
                    
                    const quickCreateBtn = customerList.querySelector('#quick-create-btn');
                    if (quickCreateBtn) {
                        quickCreateBtn.addEventListener('click', () => {
                            this.showCreateCustomerForm(searchTerm);
                        });
                    }
                }
            },
            error: () => {
                customerList.innerHTML = `
                    <div class="empty-state small">
                        <p>Failed to search customers</p>
                    </div>
                `;
            }
        });
    },
    
    /**
     * Render customer list
     * @param {Array} customers - List of customers
     */
    renderCustomerList: function(customers) {
        const customerList = this.container.querySelector('#customer-list');
        if (!customerList) return;
        
        if (customers.length === 0) {
            customerList.innerHTML = `
                <div class="empty-state small">
                    <p>No customers found</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        customers.forEach(customer => {
            html += `
                <div class="customer-card" data-customer="${customer.name}">
                    <div class="customer-name">${customer.customer_name}</div>
                    ${customer.mobile_no ? `<div class="customer-phone">${customer.mobile_no}</div>` : ''}
                    ${customer.email_id ? `<div class="customer-email">${customer.email_id}</div>` : ''}
                </div>
            `;
        });
        
        customerList.innerHTML = html;
        
        // Add click events
        customerList.querySelectorAll('.customer-card').forEach(card => {
            card.addEventListener('click', () => {
                const customerName = card.dataset.customer;
                this.selectCustomer(customerName);
            });
        });
    },
    
    /**
     * Select a customer and attach to order
     * @param {string} customerName - Customer name to select
     */
    selectCustomer: function(customerName) {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        frappe.call({
            method: 'imogi_pos.api.customers.attach_customer_to_order_or_invoice',
            args: {
                customer: customerName,
                pos_order: this.state.currentOrder.name
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    // Close modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (modalContainer) {
                        modalContainer.classList.remove('active');
                    }
                    
                    // Update order
                    this.selectOrder(this.state.currentOrder.name);
                    this.showToast('Customer attached successfully');
                } else {
                    this.showError('Failed to attach customer');
                }
            },
            error: () => {
                this.showError('Failed to attach customer');
            }
        });
    },
    
    /**
     * Show form to create a new customer
     * @param {string} [initialPhone] - Initial phone number
     */
    showCreateCustomerForm: function(initialPhone = '') {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Customer</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-customer-form">
                            <div class="form-group">
                                <label for="customer-name">Customer Name</label>
                                <input type="text" id="customer-name" required class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="customer-phone">Phone Number</label>
                                <input type="tel" id="customer-phone" value="${initialPhone}" required class="form-input">
                            </div>
                            <div class="form-group">
                                <label for="customer-email">Email (Optional)</label>
                                <input type="email" id="customer-email" class="form-input">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button id="save-customer-btn" class="modal-button primary">Save Customer</button>
                        <button id="back-to-search-btn" class="modal-button secondary">Back to Search</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind modal events
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        const backBtn = modalContainer.querySelector('#back-to-search-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showCustomerSelector();
            });
        }
        
        const saveBtn = modalContainer.querySelector('#save-customer-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.createCustomer();
            });
        }
        
        // Handle form submission
        const form = modalContainer.querySelector('#create-customer-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createCustomer();
            });
        }
    },
    
    /**
     * Create a new customer
     */
    createCustomer: function() {
        const nameInput = this.container.querySelector('#customer-name');
        const phoneInput = this.container.querySelector('#customer-phone');
        const emailInput = this.container.querySelector('#customer-email');
        
        if (!nameInput || !phoneInput) return;
        
        const customerName = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const email = emailInput ? emailInput.value.trim() : '';
        
        if (!customerName || !phone) {
            this.showError('Customer name and phone are required');
            return;
        }
        
        frappe.call({
            method: 'imogi_pos.api.customers.quick_create_customer_with_contact',
            args: {
                customer_name: customerName,
                mobile_no: phone,
                email_id: email
            },
            callback: (response) => {
                if (response.message && response.message.customer) {
                    // Attach customer to order
                    this.selectCustomer(response.message.customer);
                } else {
                    this.showError('Failed to create customer');
                }
            },
            error: () => {
                this.showError('Failed to create customer');
            }
        });
    },
    
    /**
     * Edit the current order
     */
    editOrder: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Check if order is editable
        const editableStates = ['Draft', 'Sent to Kitchen', 'In Progress', 'Ready'];
        if (!editableStates.includes(this.state.currentOrder.workflow_state)) {
            this.showError('This order cannot be edited');
            return;
        }
        
        // Navigate to order form
        window.location.href = `/app/pos-order/${this.state.currentOrder.name}`;
    },
    
    /**
     * Create a new order
     */
    createNewOrder: function() {
        frappe.call({
            method: 'imogi_pos.api.orders.create_order',
            args: {
                pos_profile: this.settings.posProfile,
                branch: this.settings.branch,
                order_type: 'Counter'
            },
            callback: (response) => {
                if (response.message && response.message.name) {
                    // Navigate to order form
                    window.location.href = `/app/pos-order/${response.message.name}`;
                } else {
                    this.showError('Failed to create new order');
                }
            },
            error: () => {
                this.showError('Failed to create new order');
            }
        });
    },
    
    /**
     * Print bill for the current order
     */
    printBill: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Check if window.IMOGIPrintService is available
        if (!window.IMOGIPrintService) {
            this.showError('Print service not available');
            return;
        }
        
        // Print customer bill
        IMOGIPrintService.printCustomerBill(
            this.state.currentOrder.name,
            this.settings.posProfile
        ).then(() => {
            this.showToast('Bill printed successfully');
        }).catch(error => {
            this.showError('Failed to print bill: ' + error.message);
        });
    },
    
    /**
     * Show split bill interface
     */
    showSplitBill: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Switch to split view
        this.switchView('split');
        
        // Show loading
        const splitContent = this.container.querySelector('#split-content');
        if (splitContent) {
            splitContent.innerHTML = `<div class="loading-container">Preparing split preview...</div>`;
        }
        
        // Get split preview
        frappe.call({
            method: 'imogi_pos.api.billing.prepare_split_preview',
            args: {
                pos_order: this.state.currentOrder.name
            },
            callback: (response) => {
                if (response.message) {
                    this.state.splitPreview = response.message;
                    this.renderSplitPreview();
                } else {
                    this.showError('Failed to prepare split preview');
                    this.switchView('orders');
                }
            },
            error: () => {
                this.showError('Failed to prepare split preview');
                this.switchView('orders');
            }
        });
    },
    
    /**
     * Render split bill preview
     */
    renderSplitPreview: function() {
        const splitContent = this.container.querySelector('#split-content');
        if (!splitContent) return;
        
        if (!this.state.splitPreview) {
            splitContent.innerHTML = `
                <div class="empty-state">
                    <p>No split preview available</p>
                </div>
            `;
            return;
        }
        
        const preview = this.state.splitPreview;
        
        // Create preview UI
        let html = `
            <div class="split-preview">
                <div class="split-options">
                    <div class="split-option-group">
                        <label>Split Method</label>
                        <div class="split-option-buttons">
                            <button class="split-option-button active" data-method="equal">Equal</button>
                            <button class="split-option-button" data-method="item">By Item</button>
                            <button class="split-option-button" data-method="amount">By Amount</button>
                        </div>
                    </div>
                    <div class="split-option-group">
                        <label>Number of Bills</label>
                        <div class="split-number-selector">
                            <button class="split-number-btn" data-action="decrease">-</button>
                            <input type="number" id="split-count" min="2" max="10" value="2" class="split-number-input">
                            <button class="split-number-btn" data-action="increase">+</button>
                        </div>
                    </div>
                </div>
                
                <div class="split-bills-container" id="split-bills-container">
                    <!-- Split bills will be rendered here -->
                </div>
            </div>
        `;
        
        splitContent.innerHTML = html;
        
        // Bind split option events
        splitContent.querySelectorAll('.split-option-button').forEach(button => {
            button.addEventListener('click', () => {
                // Set active button
                splitContent.querySelectorAll('.split-option-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                
                // Update split method
                this.updateSplitMethod(button.dataset.method);
            });
        });
        
        // Bind split count events
        const splitCount = splitContent.querySelector('#split-count');
        if (splitCount) {
            splitCount.addEventListener('change', () => {
                this.updateSplitCount(parseInt(splitCount.value) || 2);
            });
            
            // Increase/decrease buttons
            splitContent.querySelectorAll('.split-number-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const action = button.dataset.action;
                    let count = parseInt(splitCount.value) || 2;
                    
                    if (action === 'increase') {
                        count = Math.min(count + 1, 10);
                    } else if (action === 'decrease') {
                        count = Math.max(count - 1, 2);
                    }
                    
                    splitCount.value = count;
                    this.updateSplitCount(count);
                });
            });
        }
        
        // Initial render with default method and count
        this.updateSplitMethod('equal');
    },
    
    /**
     * Update split method
     * @param {string} method - Split method (equal, item, amount)
     */
    updateSplitMethod: function(method) {
        this.state.splitMethod = method;
        
        // Get current split count
        const splitCount = this.container.querySelector('#split-count');
        const count = splitCount ? (parseInt(splitCount.value) || 2) : 2;
        
        // Update split preview with new method
        frappe.call({
            method: 'imogi_pos.api.billing.prepare_split_preview',
            args: {
                pos_order: this.state.currentOrder.name,
                method: method,
                count: count
            },
            callback: (response) => {
                if (response.message) {
                    this.state.splitPreview = response.message;
                    this.renderSplitBills();
                } else {
                    this.showError('Failed to update split preview');
                }
            },
            error: () => {
                this.showError('Failed to update split preview');
            }
        });
    },
    
    /**
     * Update split count
     * @param {number} count - Number of bills
     */
    updateSplitCount: function(count) {
        // Validate count
        count = Math.max(2, Math.min(count, 10));
        
        // Update split preview with new count
        frappe.call({
            method: 'imogi_pos.api.billing.prepare_split_preview',
            args: {
                pos_order: this.state.currentOrder.name,
                method: this.state.splitMethod || 'equal',
                count: count
            },
            callback: (response) => {
                if (response.message) {
                    this.state.splitPreview = response.message;
                    this.renderSplitBills();
                } else {
                    this.showError('Failed to update split preview');
                }
            },
            error: () => {
                this.showError('Failed to update split preview');
            }
        });
    },
    
    /**
     * Render split bills
     */
    renderSplitBills: function() {
        const container = this.container.querySelector('#split-bills-container');
        if (!container) return;
        
        if (!this.state.splitPreview || !this.state.splitPreview.bills) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>No split bills available</p>
                </div>
            `;
            return;
        }
        
        const bills = this.state.splitPreview.bills;
        
        let html = '';
        bills.forEach((bill, index) => {
            html += `
                <div class="split-bill-card">
                    <div class="split-bill-header">
                        <h4>Bill ${index + 1}</h4>
                        <div class="split-bill-total">${this.formatCurrency(bill.totals || 0)}</div>
                    </div>
                    <div class="split-bill-items">
            `;
            
            // Add items
            if (bill.items && bill.items.length > 0) {
                bill.items.forEach(item => {
                    html += `
                        <div class="split-item-row">
                            <div class="split-item-name">${item.item_name}</div>
                            <div class="split-item-qty">${item.qty}</div>
                            <div class="split-item-amount">${this.formatCurrency(item.amount)}</div>
                        </div>
                    `;
                });
            } else {
                html += `
                    <div class="empty-items small">
                        <p>No items in this bill</p>
                    </div>
                `;
            }
            
            html += `
                    </div>
                    <div class="split-bill-totals">
                        <div class="total-row">
                            <div class="total-label">Subtotal</div>
                            <div class="total-value">${this.formatCurrency(bill.net_total || 0)}</div>
                        </div>
                        ${bill.taxes && bill.taxes.length > 0 ? bill.taxes.map(tax => `
                            <div class="total-row">
                                <div class="total-label">${tax.description}</div>
                                <div class="total-value">${this.formatCurrency(tax.tax_amount)}</div>
                            </div>
                        `).join('') : ''}
                        <div class="total-row grand-total">
                            <div class="total-label">Grand Total</div>
                            <div class="total-value">${this.formatCurrency(bill.totals || 0)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    /**
     * Cancel split bill
     */
    cancelSplitBill: function() {
        this.state.splitPreview = null;
        this.switchView('orders');
    },
    
    /**
     * Confirm split bill
     */
    confirmSplitBill: function() {
        if (!this.state.currentOrder || !this.state.splitPreview) {
            this.showError('Invalid split configuration');
            return;
        }
        
        // Show loading
        const splitContent = this.container.querySelector('#split-content');
        if (splitContent) {
            splitContent.innerHTML = `<div class="loading-container">Processing split...</div>`;
        }
        
        // Process split
        frappe.call({
            method: 'imogi_pos.api.billing.process_split_bill',
            args: {
                pos_order: this.state.currentOrder.name,
                method: this.state.splitMethod || 'equal',
                count: this.state.splitPreview.bills.length
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('Split completed successfully');
                    
                    // Reload orders
                    this.loadOrders();
                    
                    // Return to order view
                    this.switchView('orders');
                    this.state.splitPreview = null;
                    this.state.currentOrder = null;
                    this.renderOrderDetails();
                } else {
                    this.showError('Failed to process split: ' + (response._server_messages || 'Unknown error'));
                    this.switchView('orders');
                }
            },
            error: () => {
                this.showError('Failed to process split');
                this.switchView('orders');
            }
        });
    },
    
    /**
     * Request payment for the current order
     */
    requestPayment: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Check if order already has an invoice
        if (this.state.currentOrder.sales_invoice) {
            this.showError('This order already has an invoice. Process payment from the invoice.');
            return;
        }
        
        // Switch to payment view
        this.switchView('payment');
        
        // Show loading
        const paymentContent = this.container.querySelector('#payment-content');
        if (paymentContent) {
            paymentContent.innerHTML = `<div class="loading-container">Preparing payment request...</div>`;
        }
        
        // Generate invoice first
        this.generateInvoice(true).then(invoice => {
            // Request payment
            frappe.call({
                method: 'imogi_pos.api.billing.request_payment',
                args: {
                    sales_invoice: invoice,
                    pos_profile: this.settings.posProfile
                },
                callback: (response) => {
                    if (response.message && response.message.payment_request) {
                        this.state.activePaymentRequest = response.message.payment_request;
                        this.renderPaymentRequest(response.message);
                    } else {
                        this.showError('Failed to create payment request');
                        this.switchView('orders');
                    }
                },
                error: () => {
                    this.showError('Failed to create payment request');
                    this.switchView('orders');
                }
            });
        }).catch(error => {
            this.showError('Failed to generate invoice: ' + error.message);
            this.switchView('orders');
        });
    },
    
    /**
     * Render payment request
     * @param {Object} paymentData - Payment request data
     */
    renderPaymentRequest: function(paymentData) {
        const paymentContent = this.container.querySelector('#payment-content');
        if (!paymentContent) return;
        
        if (!paymentData || !paymentData.payment_request) {
            paymentContent.innerHTML = `
                <div class="empty-state">
                    <p>No payment request available</p>
                </div>
            `;
            return;
        }
        
        // Render QR code if available
        let qrHtml = '';
        if (paymentData.qr_image) {
            qrHtml = `
                <div class="payment-qr-container">
                    <img src="${paymentData.qr_image}" class="payment-qr" alt="Payment QR Code">
                    <p class="payment-qr-instructions">Scan QR code to pay</p>
                </div>
            `;
        } else if (paymentData.payment_url) {
            qrHtml = `
                <div class="payment-url-container">
                    <a href="${paymentData.payment_url}" target="_blank" class="payment-url-button">
                        Pay Online
                    </a>
                    <p class="payment-url-instructions">Click the button to pay online</p>
                </div>
            `;
        }
        
        // Create payment UI
        paymentContent.innerHTML = `
            <div class="payment-request-details">
                <div class="payment-amount-container">
                    <div class="payment-amount-label">Total Amount</div>
                    <div class="payment-amount">${this.formatCurrency(paymentData.amount || 0)}</div>
                </div>
                
                ${qrHtml}
                
                <div class="payment-info">
                    <div class="payment-info-row">
                        <div class="payment-info-label">Payment Request</div>
                        <div class="payment-info-value">${paymentData.payment_request}</div>
                    </div>
                    <div class="payment-info-row">
                        <div class="payment-info-label">Invoice</div>
                        <div class="payment-info-value">${paymentData.sales_invoice}</div>
                    </div>
                    <div class="payment-info-row">
                        <div class="payment-info-label">Status</div>
                        <div class="payment-info-value" id="payment-status">Awaiting Payment</div>
                    </div>
                    ${paymentData.expires_at ? `
                        <div class="payment-info-row">
                            <div class="payment-info-label">Expires</div>
                            <div class="payment-info-value">${this.formatDateTime(paymentData.expires_at)}</div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="payment-actions">
                    <div class="payment-method-buttons">
                        <button id="payment-method-cash" class="payment-method-button">
                            <i class="fa fa-money-bill"></i>
                            Cash
                        </button>
                        <button id="payment-method-card" class="payment-method-button">
                            <i class="fa fa-credit-card"></i>
                            Card
                        </button>
                    </div>
                </div>
                
                <div class="customer-display-link">
                    <button id="show-on-display" class="link-button">
                        <i class="fa fa-external-link-alt"></i>
                        Show on Customer Display
                    </button>
                </div>
            </div>
        `;
        
        // Bind payment method events
        const cashBtn = paymentContent.querySelector('#payment-method-cash');
        if (cashBtn) {
            cashBtn.addEventListener('click', () => {
                this.processCashPayment();
            });
        }
        
        const cardBtn = paymentContent.querySelector('#payment-method-card');
        if (cardBtn) {
            cardBtn.addEventListener('click', () => {
                this.processCardPayment();
            });
        }
        
        // Bind display button
        const displayBtn = paymentContent.querySelector('#show-on-display');
        if (displayBtn) {
            displayBtn.addEventListener('click', () => {
                this.showOnCustomerDisplay(paymentData);
            });
        }
    },
    
    /**
     * Cancel payment
     */
    cancelPayment: function() {
        this.state.activePaymentRequest = null;
        this.switchView('orders');
    },
    
    /**
     * Process cash payment
     */
    processCashPayment: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Get sales invoice from current order or active payment request
        let salesInvoice = '';
        if (this.state.currentOrder.sales_invoice) {
            salesInvoice = this.state.currentOrder.sales_invoice;
        } else {
            const paymentStatus = this.container.querySelector('#payment-status');
            if (paymentStatus) {
                paymentStatus.textContent = 'Processing...';
            }
            
            // Need to generate invoice first
            return this.generateInvoice(true).then(invoice => {
                this.processCashPaymentForInvoice(invoice);
            }).catch(error => {
                this.showError('Failed to generate invoice: ' + error.message);
            });
        }
        
        this.processCashPaymentForInvoice(salesInvoice);
    },
    
    /**
     * Process cash payment for a specific invoice
     * @param {string} salesInvoice - Sales Invoice name
     */
    processCashPaymentForInvoice: function(salesInvoice) {
        // Show cash payment modal
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Get invoice details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Sales Invoice',
                name: salesInvoice
            },
            callback: (response) => {
                if (response.message) {
                    const invoice = response.message;
                    const grandTotal = invoice.grand_total || 0;
                    
                    modalContainer.innerHTML = `
                        <div class="modal-overlay">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3>Cash Payment</h3>
                                    <button class="modal-close">&times;</button>
                                </div>
                                <div class="modal-body">
                                    <div class="payment-amount-display">
                                        <div class="amount-label">Total Amount</div>
                                        <div class="amount-value">${this.formatCurrency(grandTotal)}</div>
                                    </div>
                                    <div class="cash-payment-form">
                                        <div class="form-group">
                                            <label for="cash-amount">Cash Received</label>
                                            <input type="number" id="cash-amount" min="${grandTotal}" value="${grandTotal}" step="0.01" class="form-input">
                                        </div>
                                        <div class="form-group">
                                            <label for="cash-change">Change</label>
                                            <input type="text" id="cash-change" value="0.00" readonly class="form-input">
                                        </div>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button id="submit-cash-payment" class="modal-button primary">Submit Payment</button>
                                    <button id="cancel-cash-payment" class="modal-button secondary">Cancel</button>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    // Show modal
                    modalContainer.classList.add('active');
                    
                    // Bind modal events
                    const closeBtn = modalContainer.querySelector('.modal-close');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => {
                            modalContainer.classList.remove('active');
                        });
                    }
                    
                    const cancelBtn = modalContainer.querySelector('#cancel-cash-payment');
                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => {
                            modalContainer.classList.remove('active');
                        });
                    }
                    
                    // Handle cash amount input
                    const cashAmountInput = modalContainer.querySelector('#cash-amount');
                    const cashChangeInput = modalContainer.querySelector('#cash-change');
                    if (cashAmountInput && cashChangeInput) {
                        cashAmountInput.addEventListener('input', () => {
                            const cashAmount = parseFloat(cashAmountInput.value) || grandTotal;
                            const change = Math.max(0, cashAmount - grandTotal);
                            cashChangeInput.value = change.toFixed(2);
                        });
                        
                        // Trigger initial calculation
                        cashAmountInput.dispatchEvent(new Event('input'));
                        
                        // Focus amount input
                        cashAmountInput.focus();
                        cashAmountInput.select();
                    }
                    
                    // Handle submit button
                    const submitBtn = modalContainer.querySelector('#submit-cash-payment');
                    if (submitBtn) {
                        submitBtn.addEventListener('click', () => {
                            const cashAmount = parseFloat(cashAmountInput.value) || grandTotal;
                            
                            // Validate cash amount
                            if (cashAmount < grandTotal) {
                                this.showError('Cash amount must be at least the total amount');
                                return;
                            }
                            
                            // Submit payment
                            this.submitCashPayment(salesInvoice, cashAmount);
                            
                            // Close modal
                            modalContainer.classList.remove('active');
                        });
                    }
                } else {
                    this.showError('Failed to load invoice details');
                }
            },
            error: () => {
                this.showError('Failed to load invoice details');
            }
        });
    },
    
    /**
     * Submit cash payment for an invoice
     * @param {string} salesInvoice - Sales Invoice name
     * @param {number} cashAmount - Cash amount received
     */
    submitCashPayment: function(salesInvoice, cashAmount) {
        // Show loading indicator
        this.showLoading(true, 'Processing payment...');
        
        // Process payment
        frappe.call({
            method: 'imogi_pos.api.billing.process_cash_payment',
            args: {
                sales_invoice: salesInvoice,
                amount: cashAmount,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Payment processed successfully');
                    
                    // Print receipt if configured
                    if (window.IMOGIPrintService && this.settings.printerSettings) {
                        IMOGIPrintService.printReceipt(
                            salesInvoice,
                            this.settings.posProfile
                        ).then(() => {
                            this.showToast('Receipt printed successfully');
                        }).catch(error => {
                            console.error('Failed to print receipt:', error);
                        });
                    }
                    
                    // Reload orders
                    this.loadOrders();
                    
                    // Return to order view
                    this.switchView('orders');
                    this.state.activePaymentRequest = null;
                    this.state.currentOrder = null;
                    this.renderOrderDetails();
                } else {
                    this.showError('Failed to process payment: ' + (response._server_messages || 'Unknown error'));
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to process payment');
            }
        });
    },
    
    /**
     * Process card payment
     */
    processCardPayment: function() {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Get sales invoice from current order or active payment request
        let salesInvoice = '';
        if (this.state.currentOrder.sales_invoice) {
            salesInvoice = this.state.currentOrder.sales_invoice;
        } else {
            const paymentStatus = this.container.querySelector('#payment-status');
            if (paymentStatus) {
                paymentStatus.textContent = 'Processing...';
            }
            
            // Need to generate invoice first
            return this.generateInvoice(true).then(invoice => {
                this.processCardPaymentForInvoice(invoice);
            }).catch(error => {
                this.showError('Failed to generate invoice: ' + error.message);
            });
        }
        
        this.processCardPaymentForInvoice(salesInvoice);
    },
    
    /**
     * Process card payment for a specific invoice
     * @param {string} salesInvoice - Sales Invoice name
     */
    processCardPaymentForInvoice: function(salesInvoice) {
        // Show card payment modal
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Get invoice details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Sales Invoice',
                name: salesInvoice
            },
            callback: (response) => {
                if (response.message) {
                    const invoice = response.message;
                    const grandTotal = invoice.grand_total || 0;
                    
                    modalContainer.innerHTML = `
                        <div class="modal-overlay">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3>Card Payment</h3>
                                    <button class="modal-close">&times;</button>
                                </div>
                                <div class="modal-body">
                                    <div class="payment-amount-display">
                                        <div class="amount-label">Total Amount</div>
                                        <div class="amount-value">${this.formatCurrency(grandTotal)}</div>
                                    </div>
                                    <div class="card-payment-form">
                                        <div class="form-group">
                                            <label for="card-reference">Card Reference/Authorization</label>
                                            <input type="text" id="card-reference" placeholder="Enter card reference or authorization code" class="form-input">
                                        </div>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button id="submit-card-payment" class="modal-button primary">Submit Payment</button>
                                    <button id="cancel-card-payment" class="modal-button secondary">Cancel</button>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    // Show modal
                    modalContainer.classList.add('active');
                    
                    // Bind modal events
                    const closeBtn = modalContainer.querySelector('.modal-close');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => {
                            modalContainer.classList.remove('active');
                        });
                    }
                    
                    const cancelBtn = modalContainer.querySelector('#cancel-card-payment');
                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => {
                            modalContainer.classList.remove('active');
                        });
                    }
                    
                    // Focus reference input
                    const referenceInput = modalContainer.querySelector('#card-reference');
                    if (referenceInput) {
                        referenceInput.focus();
                    }
                    
                    // Handle submit button
                    const submitBtn = modalContainer.querySelector('#submit-card-payment');
                    if (submitBtn) {
                        submitBtn.addEventListener('click', () => {
                            const reference = referenceInput ? referenceInput.value.trim() : '';
                            
                            // Submit payment
                            this.submitCardPayment(salesInvoice, reference);
                            
                            // Close modal
                            modalContainer.classList.remove('active');
                        });
                    }
                } else {
                    this.showError('Failed to load invoice details');
                }
            },
            error: () => {
                this.showError('Failed to load invoice details');
            }
        });
    },
    
    /**
     * Submit card payment for an invoice
     * @param {string} salesInvoice - Sales Invoice name
     * @param {string} reference - Card reference/authorization
     */
    submitCardPayment: function(salesInvoice, reference) {
        // Show loading indicator
        this.showLoading(true, 'Processing payment...');
        
        // Process payment
        frappe.call({
            method: 'imogi_pos.api.billing.process_card_payment',
            args: {
                sales_invoice: salesInvoice,
                reference: reference,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Payment processed successfully');
                    
                    // Print receipt if configured
                    if (window.IMOGIPrintService && this.settings.printerSettings) {
                        IMOGIPrintService.printReceipt(
                            salesInvoice,
                            this.settings.posProfile
                        ).then(() => {
                            this.showToast('Receipt printed successfully');
                        }).catch(error => {
                            console.error('Failed to print receipt:', error);
                        });
                    }
                    
                    // Reload orders
                    this.loadOrders();
                    
                    // Return to order view
                    this.switchView('orders');
                    this.state.activePaymentRequest = null;
                    this.state.currentOrder = null;
                    this.renderOrderDetails();
                } else {
                    this.showError('Failed to process payment: ' + (response._server_messages || 'Unknown error'));
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to process payment');
            }
        });
    },
    
    /**
     * Show payment QR on customer display
     * @param {Object} paymentData - Payment request data
     */
    showOnCustomerDisplay: function(paymentData) {
        if (!paymentData || !paymentData.payment_request) {
            this.showError('No payment data available');
            return;
        }
        
        frappe.call({
            method: 'imogi_pos.api.customer_display.publish_customer_display_update',
            args: {
                display_type: 'payment',
                payment_data: paymentData
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('Payment shown on customer display');
                } else {
                    this.showError('Failed to show payment on customer display');
                }
            },
            error: () => {
                this.showError('Failed to show payment on customer display');
            }
        });
    },
    
    /**
     * Generate invoice for the current order
     * @param {boolean} [silent=false] - Whether to show success message
     * @returns {Promise<string>} Promise resolving to invoice name
     */
    generateInvoice: function(silent = false) {
        return new Promise((resolve, reject) => {
            if (!this.state.currentOrder) {
                reject(new Error('No order selected'));
                return;
            }
            
            // Check if order already has an invoice
            if (this.state.currentOrder.sales_invoice) {
                resolve(this.state.currentOrder.sales_invoice);
                return;
            }
            
            // Show loading indicator
            this.showLoading(true, 'Generating invoice...');
            
            // Generate invoice
            frappe.call({
                method: 'imogi_pos.api.billing.generate_invoice',
                args: {
                    pos_order: this.state.currentOrder.name,
                    pos_profile: this.settings.posProfile
                },
                callback: (response) => {
                    this.showLoading(false);
                    
                    if (response.message && response.message.name) {
                        if (!silent) {
                            this.showToast('Invoice generated successfully');
                        }
                        
                        // Update order
                        this.selectOrder(this.state.currentOrder.name);
                        
                        resolve(response.message.name);
                    } else {
                        reject(new Error('Failed to generate invoice: ' + (response._server_messages || 'Unknown error')));
                    }
                },
                error: (error) => {
                    this.showLoading(false);
                    reject(new Error('Failed to generate invoice: ' + (error.message || 'Unknown error')));
                }
            });
        });
    },
    
    /**
     * Handle successful payment
     * @param {Object} data - Payment data
     */
    handlePaymentSuccess: function(data) {
        // Update payment status
        const paymentStatus = this.container.querySelector('#payment-status');
        if (paymentStatus) {
            paymentStatus.textContent = 'Paid';
            paymentStatus.classList.add('paid');
        }
        
        // Show success message
        this.showToast('Payment received successfully');
        
        // Print receipt if configured
        if (window.IMOGIPrintService && this.settings.printerSettings && data.sales_invoice) {
            IMOGIPrintService.printReceipt(
                data.sales_invoice,
                this.settings.posProfile
            ).then(() => {
                this.showToast('Receipt printed successfully');
            }).catch(error => {
                console.error('Failed to print receipt:', error);
            });
        }
        
        // Reload orders after a short delay
        setTimeout(() => {
            this.loadOrders();
            
            // Return to order view
            this.switchView('orders');
            this.state.activePaymentRequest = null;
            this.state.currentOrder = null;
            this.renderOrderDetails();
        }, 3000);
    },
    
    /**
     * Handle expired payment
     * @param {Object} data - Payment data
     */
    handlePaymentExpired: function(data) {
        // Update payment status
        const paymentStatus = this.container.querySelector('#payment-status');
        if (paymentStatus) {
            paymentStatus.textContent = 'Expired';
            paymentStatus.classList.add('expired');
        }
        
        // Show error message
        this.showError('Payment request expired');
    },
    
    /**
     * Load catalog for ordering
     */
    loadCatalog: function() {
        // Load item groups
        this.loadItemGroups();
        
        // Load default items (all or first group)
        this.loadItems();
    },
    
    /**
     * Load item groups
     */
    loadItemGroups: function() {
        const itemGroupList = this.container.querySelector('#item-group-list');
        if (!itemGroupList) return;
        
        // Show loading
        itemGroupList.innerHTML = `<div class="loading-container">Loading item groups...</div>`;
        
        frappe.call({
            method: 'imogi_pos.api.variants.get_item_groups',
            args: {
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    // Render item groups
                    this.renderItemGroups(response.message);
                } else {
                    itemGroupList.innerHTML = `
                        <div class="empty-state small">
                            <p>No item groups found</p>
                        </div>
                    `;
                }
            },
            error: () => {
                itemGroupList.innerHTML = `
                    <div class="empty-state small">
                        <p>Failed to load item groups</p>
                    </div>
                `;
            }
        });
    },
    
    /**
     * Render item groups
     * @param {Array} groups - Item groups
     */
    renderItemGroups: function(groups) {
        const itemGroupList = this.container.querySelector('#item-group-list');
        if (!itemGroupList) return;
        
        if (groups.length === 0) {
            itemGroupList.innerHTML = `
                <div class="empty-state small">
                    <p>No item groups found</p>
                </div>
            `;
            return;
        }
        
        // Add "All Items" option
        groups.unshift({
            name: 'All',
            item_group_name: 'All Items'
        });
        
        let html = '';
        groups.forEach(group => {
            html += `
                <div class="item-group-card ${group.name === 'All' ? 'active' : ''}" data-group="${group.name}">
                    <div class="item-group-name">${group.item_group_name}</div>
                </div>
            `;
        });
        
        itemGroupList.innerHTML = html;
        
        // Add click events
        itemGroupList.querySelectorAll('.item-group-card').forEach(card => {
            card.addEventListener('click', () => {
                // Set active group
                itemGroupList.querySelectorAll('.item-group-card').forEach(c => {
                    c.classList.remove('active');
                });
                card.classList.add('active');
                
                // Load items for this group
                const groupName = card.dataset.group;
                this.loadItems(groupName === 'All' ? null : groupName);
            });
        });
    },
    
    /**
     * Load items for a specific group
     * @param {string} [itemGroup] - Item group to filter by
     */
    loadItems: function(itemGroup = null) {
        const catalogItems = this.container.querySelector('#catalog-items');
        if (!catalogItems) return;
        
        // Show loading
        catalogItems.innerHTML = `<div class="loading-container">Loading items...</div>`;
        
        frappe.call({
            method: 'imogi_pos.api.variants.get_template_items',
            args: {
                pos_profile: this.settings.posProfile,
                item_group: itemGroup
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    // Render items
                    this.renderItems(response.message);
                } else {
                    catalogItems.innerHTML = `
                        <div class="empty-state">
                            <p>No items found</p>
                        </div>
                    `;
                }
            },
            error: () => {
                catalogItems.innerHTML = `
                    <div class="empty-state">
                        <p>Failed to load items</p>
                    </div>
                `;
            }
        });
    },
    
    /**
     * Render items
     * @param {Array} items - Items to render
     */
    renderItems: function(items) {
        const catalogItems = this.container.querySelector('#catalog-items');
        if (!catalogItems) return;
        
        if (items.length === 0) {
            catalogItems.innerHTML = `
                <div class="empty-state">
                    <p>No items found</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="catalog-grid">';
        items.forEach(item => {
            const hasVariants = item.has_variants === 1;
            const itemClass = hasVariants ? 'has-variants' : '';
            const itemIcon = hasVariants ? '<i class="fa fa-list variant-icon"></i>' : '';
            
            html += `
                <div class="catalog-item ${itemClass}" data-item="${item.name}" data-has-variants="${hasVariants ? 1 : 0}">
                    ${item.image ? `<div class="item-image"><img src="${item.image}" alt="${item.item_name}"></div>` : ''}
                    <div class="item-details">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-price">${this.formatCurrency(item.rate || 0)}</div>
                    </div>
                    ${itemIcon}
                </div>
            `;
        });
        html += '</div>';
        
        catalogItems.innerHTML = html;
        
        // Add click events
        catalogItems.querySelectorAll('.catalog-item').forEach(card => {
            card.addEventListener('click', () => {
                const itemName = card.dataset.item;
                const hasVariants = card.dataset.hasVariants === '1';
                
                if (hasVariants) {
                    this.showVariantPicker(itemName);
                } else {
                    this.addItemToOrder(itemName);
                }
            });
        });
    },
    
    /**
     * Show variant picker for an item template
     * @param {string} templateName - Item template name
     */
    showVariantPicker: function(templateName) {
        // Show modal for variant selection
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Show loading state
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Variant</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="loading-container">Loading variants...</div>
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
        
        // Load variants
        frappe.call({
            method: 'imogi_pos.api.variants.get_item_variants',
            args: {
                template: templateName
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message.variants)) {
                    // Render variants
                    this.renderVariantPicker(templateName, response.message);
                } else {
                    const modalBody = modalContainer.querySelector('.modal-body');
                    if (modalBody) {
                        modalBody.innerHTML = `
                            <div class="empty-state">
                                <p>No variants found for this item</p>
                            </div>
                        `;
                    }
                }
            },
            error: () => {
                const modalBody = modalContainer.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.innerHTML = `
                        <div class="empty-state">
                            <p>Failed to load variants</p>
                        </div>
                    `;
                }
            }
        });
    },
    
    /**
     * Render variant picker
     * @param {string} templateName - Item template name
     * @param {Object} data - Variant data
     */
    renderVariantPicker: function(templateName, data) {
        const modalBody = this.container.querySelector('.modal-body');
        if (!modalBody) return;
        
        const variants = data.variants || [];
        const attributes = data.attributes || [];
        
        if (variants.length === 0) {
            modalBody.innerHTML = `
                <div class="empty-state">
                    <p>No variants found for this item</p>
                </div>
            `;
            return;
        }
        
        // Create attribute filters if multiple attributes
        let attributeFiltersHtml = '';
        if (attributes.length > 0) {
            attributeFiltersHtml = `
                <div class="variant-filters">
                    ${attributes.map(attr => `
                        <div class="variant-filter">
                            <label>${attr.attribute}</label>
                            <select class="variant-attribute-select" data-attribute="${attr.attribute}">
                                <option value="">All</option>
                                ${attr.values.map(val => `
                                    <option value="${val}">${val}</option>
                                `).join('')}
                            </select>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        // Create variant list
        let variantsHtml = `
            <div class="variant-list" id="variant-list">
                ${variants.map(variant => `
                    <div class="variant-card" data-item="${variant.name}" data-attributes='${JSON.stringify(variant.attributes || {})}'>
                        <div class="variant-name">${variant.item_name}</div>
                        <div class="variant-attrs">
                            ${Object.entries(variant.attributes || {}).map(([attr, val]) => `
                                <span class="variant-attr">${attr}: ${val}</span>
                            `).join('')}
                        </div>
                        <div class="variant-price">${this.formatCurrency(variant.rate || 0)}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Put it all together
        modalBody.innerHTML = `
            ${attributeFiltersHtml}
            ${variantsHtml}
        `;
        
        // Bind attribute filter events
        const attributeSelects = modalBody.querySelectorAll('.variant-attribute-select');
        if (attributeSelects.length > 0) {
            attributeSelects.forEach(select => {
                select.addEventListener('change', () => {
                    this.filterVariants();
                });
            });
        }
        
        // Bind variant card events
        const variantCards = modalBody.querySelectorAll('.variant-card');
        if (variantCards.length > 0) {
            variantCards.forEach(card => {
                card.addEventListener('click', () => {
                    const itemName = card.dataset.item;
                    this.addItemToOrder(itemName);
                    
                    // Close modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (modalContainer) {
                        modalContainer.classList.remove('active');
                    }
                });
            });
        }
    },
    
    /**
     * Filter variants based on selected attributes
     */
    filterVariants: function() {
        const variantList = this.container.querySelector('#variant-list');
        if (!variantList) return;
        
        // Get selected attribute values
        const attributeSelects = this.container.querySelectorAll('.variant-attribute-select');
        const selectedAttributes = {};
        
        attributeSelects.forEach(select => {
            const attribute = select.dataset.attribute;
            const value = select.value;
            
            if (value) {
                selectedAttributes[attribute] = value;
            }
        });
        
        // Filter variant cards
        const variantCards = variantList.querySelectorAll('.variant-card');
        variantCards.forEach(card => {
            const attributes = JSON.parse(card.dataset.attributes || '{}');
            let show = true;
            
            // Check if variant matches all selected attributes
            Object.entries(selectedAttributes).forEach(([attr, value]) => {
                if (attributes[attr] !== value) {
                    show = false;
                }
            });
            
            // Show/hide variant
            card.style.display = show ? '' : 'none';
        });
    },
    
    /**
     * Add item to order
     * @param {string} itemName - Item name to add
     */
    addItemToOrder: function(itemName) {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        // Show loading
        this.showLoading(true, 'Adding item...');
        
        frappe.call({
            method: 'imogi_pos.api.orders.add_item_to_order',
            args: {
                pos_order: this.state.currentOrder.name,
                item: itemName,
                qty: 1
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Item added successfully');
                    
                    // Update order
                    this.selectOrder(this.state.currentOrder.name);
                } else {
                    this.showError('Failed to add item: ' + (response._server_messages || 'Unknown error'));
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to add item');
            }
        });
    },
    
    /**
     * Show loading indicator
     * @param {boolean} show - Whether to show or hide
     * @param {string} [message] - Optional message
     */
    showLoading: function(show, message = 'Loading...') {
        // Implementation depends on UI
        // Could use a global loading indicator or inline loading states
    },
    
    /**
     * Show error message
     * @param {string} message - Error message
     * @param {string} [buttonText] - Optional button text
     * @param {Function} [buttonCallback] - Optional button callback
     */
    showError: function(message, buttonText, buttonCallback) {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        
        let html = `
            <div class="toast-content">
                <i class="fa fa-exclamation-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        if (buttonText) {
            html += `<button class="toast-button">${buttonText}</button>`;
        }
        
        toast.innerHTML = html;
        toastContainer.appendChild(toast);
        
        // Add button click event
        if (buttonText && buttonCallback) {
            const button = toast.querySelector('.toast-button');
            if (button) {
                button.addEventListener('click', buttonCallback);
            }
        }
        
        // Auto-remove after delay unless has button
        if (!buttonText) {
            setTimeout(() => {
                toast.classList.add('toast-hiding');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 5000);
        }
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
     * Format time
     * @param {string} datetime - ISO datetime string
     * @returns {string} Formatted time
     */
    formatTime: function(datetime) {
        if (!datetime) return '';
        
        const date = new Date(datetime);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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