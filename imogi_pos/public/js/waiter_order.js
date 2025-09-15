/**
 * IMOGI POS - Waiter Order
 * 
 * Main module for the Waiter Order interface
 * Handles:
 * - Table order management
 * - Template-first catalog with variant picker
 * - Item notes
 * - KOT submission
 * - Customer selection and attachment
 * - Order status updates
 */

frappe.provide('imogi_pos.waiter_order');

imogi_pos.waiter_order = {
    // Settings and state
    settings: {
        posProfile: null,
        branch: null,
        floor: null,
        table: null,
        posOrder: null,
        callServerTimeout: 5000, // 5 seconds
    },
    state: {
        order: null,
        orderItems: [],
        catalogItems: [],
        itemGroups: [],
        searchResults: [],
        selectedItemGroup: null,
        currentVariantItem: null,
        searchTerm: '',
        viewMode: 'catalog', // catalog, order
        customerId: null,
        customerName: null,
        customerPhone: null,
        kotSubmitted: false
    },
    
    /**
     * Initialize the Waiter Order
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#waiter-order',
            profileSelector: '#pos-profile-selector',
            branchSelector: '#branch-selector'
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Waiter Order container not found');
            return;
        }
        
        // Get parameters from URL
        this.settings.posOrder = this.getUrlParameter('pos_order');
        this.settings.table = this.getUrlParameter('table');
        this.settings.floor = this.getUrlParameter('floor');
        this.settings.posProfile = this.getUrlParameter('pos_profile');
        
        // Initialize components
        this.initializeNavigation();
        this.loadSettings()
            .then(() => {
                if (this.settings.posOrder) {
                    // Load existing order
                    this.loadOrder()
                        .then(() => {
                            this.renderUI();
                            this.bindEvents();
                            this.loadCatalog();
                        })
                        .catch(err => {
                            console.error('Failed to load order:', err);
                            this.showError('Failed to load order. Please try again.');
                        });
                } else if (this.settings.table) {
                    // Create or open order for table
                    this.openOrCreateForTable()
                        .then(() => {
                            this.renderUI();
                            this.bindEvents();
                            this.loadCatalog();
                        })
                        .catch(err => {
                            console.error('Failed to create order:', err);
                            this.showError('Failed to create order. Please try again.');
                        });
                } else {
                    // No order or table specified
                    this.showError('No order or table specified. Please go back and try again.');
                }
            })
            .catch(err => {
                console.error('Failed to initialize Waiter Order:', err);
                this.showError('Failed to initialize Waiter Order. Please refresh the page.');
            });
    },
    
    /**
     * Get parameter from URL
     * @param {string} name - Parameter name
     * @returns {string|null} Parameter value
     */
    getUrlParameter: function(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
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
                backUrl: '/app/table-display',
                onBranchChange: (branch) => {
                    this.settings.branch = branch;
                },
                onProfileChange: (profile) => {
                    this.settings.posProfile = profile;
                }
            });
        }
    },
    
    /**
     * Load settings
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
                            resolve();
                        } else {
                            reject(new Error('No POS Profile available'));
                        }
                    },
                    error: reject
                });
                return;
            }
            
            resolve();
        });
    },
    
    /**
     * Load existing order
     * @returns {Promise} Promise resolving when order is loaded
     */
    loadOrder: function() {
        return new Promise((resolve, reject) => {
            if (!this.settings.posOrder) {
                reject(new Error('No order specified'));
                return;
            }
            
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'POS Order',
                    name: this.settings.posOrder
                },
                callback: (response) => {
                    if (response.message) {
                        this.state.order = response.message;
                        
                        // Set settings from order
                        this.settings.table = this.state.order.table;
                        this.settings.branch = this.state.order.branch;
                        
                        // Set customer info
                        if (this.state.order.customer) {
                            this.state.customerId = this.state.order.customer;
                            this.state.customerName = this.state.order.customer_name;
                            this.state.customerPhone = this.state.order.contact_mobile;
                        }
                        
                        // Set KOT status
                        this.state.kotSubmitted = this.state.order.workflow_state !== 'Draft';
                        
                        // Copy order items
                        if (this.state.order.items && Array.isArray(this.state.order.items)) {
                            this.state.orderItems = this.state.order.items.map(item => ({
                                name: item.name,
                                item: item.item,
                                item_name: item.item_name,
                                qty: item.qty,
                                rate: item.rate,
                                amount: item.amount,
                                notes: item.notes || ''
                            }));
                        }
                        
                        resolve();
                    } else {
                        reject(new Error('Failed to load order'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Create or open order for table
     * @returns {Promise} Promise resolving when order is created or opened
     */
    openOrCreateForTable: function() {
        return new Promise((resolve, reject) => {
            if (!this.settings.table) {
                reject(new Error('No table specified'));
                return;
            }
            
            frappe.call({
                method: 'imogi_pos.api.orders.open_or_create_for_table',
                args: {
                    table: this.settings.table,
                    pos_profile: this.settings.posProfile,
                    branch: this.settings.branch,
                    floor: this.settings.floor
                },
                callback: (response) => {
                    if (response.message && response.message.name) {
                        // Load the created/opened order
                        this.settings.posOrder = response.message.name;
                        this.loadOrder().then(resolve).catch(reject);
                    } else {
                        reject(new Error('Failed to create or open order for table'));
                    }
                },
                error: reject
            });
        });
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="waiter-order-layout">
                <div class="waiter-order-sidebar">
                    <div class="order-info-panel">
                        <div class="order-header">
                            <h3>Order: ${this.state.order ? this.state.order.name : 'New Order'}</h3>
                            <div class="order-status ${this.state.order && this.state.order.workflow_state ? this.state.order.workflow_state.toLowerCase().replace(' ', '-') : 'draft'}">
                                ${this.state.order && this.state.order.workflow_state ? this.state.order.workflow_state : 'Draft'}
                            </div>
                        </div>
                        <div class="table-info">
                            <div class="info-row">
                                <div class="info-label">Table:</div>
                                <div class="info-value">${this.settings.table || 'Not specified'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Guests:</div>
                                <div class="info-value guests-editor">
                                    <input type="number" id="guests-input" min="1" max="50" value="${this.state.order && this.state.order.guests ? this.state.order.guests : 1}" class="guests-input">
                                    <button id="update-guests-btn" class="small-button">Update</button>
                                </div>
                            </div>
                        </div>
                        <div class="customer-info">
                            <div class="info-header">
                                <h4>Customer</h4>
                                <button id="select-customer-btn" class="small-button">
                                    ${this.state.customerId ? 'Change' : 'Add Customer'}
                                </button>
                            </div>
                            <div class="customer-details">
                                ${this.state.customerId ? `
                                    <div class="customer-name">${this.state.customerName || this.state.customerId}</div>
                                    ${this.state.customerPhone ? `<div class="customer-phone">${this.state.customerPhone}</div>` : ''}
                                ` : `
                                    <div class="no-customer">No customer assigned</div>
                                `}
                            </div>
                        </div>
                    </div>
                    
                    <div class="order-items-panel">
                        <div class="panel-header">
                            <h4>Order Items</h4>
                        </div>
                        <div class="order-items" id="order-items">
                            ${this.renderOrderItems()}
                        </div>
                        <div class="order-totals" id="order-totals">
                            ${this.renderOrderTotals()}
                        </div>
                    </div>
                    
                    <div class="order-actions">
                        <button id="send-to-kitchen-btn" class="action-button primary" ${this.state.kotSubmitted ? 'disabled' : ''}>
                            Send to Kitchen
                        </button>
                        <button id="print-kot-btn" class="action-button" ${!this.state.kotSubmitted ? 'disabled' : ''}>
                            Print KOT
                        </button>
                        <button id="save-order-btn" class="action-button">
                            Save Order
                        </button>
                        <button id="cancel-order-btn" class="action-button danger">
                            Cancel
                        </button>
                    </div>
                </div>
                
                <div class="waiter-order-main">
                    <div class="catalog-container">
                        <div class="catalog-sidebar">
                            <div class="search-container">
                                <input type="text" id="item-search" placeholder="Search items..." class="search-input">
                                <button id="search-btn" class="search-button">
                                    <i class="fa fa-search"></i>
                                </button>
                            </div>
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
            </div>
            
            <div id="modal-container" class="modal-container"></div>
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Bind events
        this.bindEvents();
    },
    
    /**
     * Render order items
     * @returns {string} HTML for order items
     */
    renderOrderItems: function() {
        if (!this.state.orderItems || this.state.orderItems.length === 0) {
            return `
                <div class="empty-items">
                    <p>No items in this order</p>
                </div>
            `;
        }
        
        let html = '';
        this.state.orderItems.forEach((item, index) => {
            html += `
                <div class="order-item">
                    <div class="item-header">
                        <div class="item-name">${item.item_name}</div>
                        <button class="item-remove" data-index="${index}">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                    ${item.options ? `
                        <div class="item-option">
                            ${this.formatSelectedOptions(item.options)} ${item.options.price ? `(+${this.formatCurrency(item.options.price)})` : ''}
                        </div>
                    ` : ''}
                    <div class="item-details">
                        <div class="item-price">${this.formatCurrency(item.rate)}</div>
                        <div class="item-qty-controls">
                            <button class="qty-btn qty-decrease" data-index="${index}">-</button>
                            <span class="item-qty">${item.qty}</span>
                            <button class="qty-btn qty-increase" data-index="${index}">+</button>
                        </div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                    </div>
                    ${item.notes ? `
                        <div class="item-notes">
                            <i class="fa fa-sticky-note notes-icon"></i>
                            <span class="notes-text">${item.notes}</span>
                            <button class="edit-notes-btn" data-index="${index}">
                                <i class="fa fa-pencil-alt"></i>
                            </button>
                        </div>
                    ` : `
                        <div class="item-notes-placeholder">
                            <button class="add-notes-btn" data-index="${index}">
                                <i class="fa fa-plus"></i> Add Notes
                            </button>
                        </div>
                    `}
                </div>
            `;
        });
        
        return html;
    },
    
    /**
     * Render order totals
     * @returns {string} HTML for order totals
     */
    renderOrderTotals: function() {
        // Calculate subtotal
        const subtotal = this.state.orderItems.reduce((sum, item) => sum + item.amount, 0);
        
        return `
            <div class="total-row">
                <div class="total-label">Subtotal</div>
                <div class="total-value">${this.formatCurrency(subtotal)}</div>
            </div>
            <div class="total-row grand-total">
                <div class="total-label">Total</div>
                <div class="total-value">${this.formatCurrency(subtotal)}</div>
            </div>
        `;
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Guests update button
        const updateGuestsBtn = this.container.querySelector('#update-guests-btn');
        if (updateGuestsBtn) {
            updateGuestsBtn.addEventListener('click', () => {
                this.updateGuests();
            });
        }
        
        // Select customer button
        const selectCustomerBtn = this.container.querySelector('#select-customer-btn');
        if (selectCustomerBtn) {
            selectCustomerBtn.addEventListener('click', () => {
                this.showCustomerSelector();
            });
        }
        
        // Search input
        const searchInput = this.container.querySelector('#item-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.state.searchTerm = searchInput.value;
                this.searchItems();
            });
        }
        
        // Search button
        const searchBtn = this.container.querySelector('#search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchItems();
            });
        }
        
        // Send to kitchen button
        const sendToKitchenBtn = this.container.querySelector('#send-to-kitchen-btn');
        if (sendToKitchenBtn) {
            sendToKitchenBtn.addEventListener('click', () => {
                this.sendToKitchen();
            });
        }
        
        // Print KOT button
        const printKotBtn = this.container.querySelector('#print-kot-btn');
        if (printKotBtn) {
            printKotBtn.addEventListener('click', () => {
                this.printKot();
            });
        }
        
        // Save order button
        const saveOrderBtn = this.container.querySelector('#save-order-btn');
        if (saveOrderBtn) {
            saveOrderBtn.addEventListener('click', () => {
                this.saveOrder();
            });
        }
        
        // Cancel button
        const cancelOrderBtn = this.container.querySelector('#cancel-order-btn');
        if (cancelOrderBtn) {
            cancelOrderBtn.addEventListener('click', () => {
                this.cancel();
            });
        }
        
        // Bind order item events
        this.bindOrderItemEvents();
    },
    
    /**
     * Bind order item events
     */
    bindOrderItemEvents: function() {
        // Remove buttons
        this.container.querySelectorAll('.item-remove').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.removeOrderItem(index);
            });
        });
        
        // Quantity decrease buttons
        this.container.querySelectorAll('.qty-decrease').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.decreaseOrderItemQty(index);
            });
        });
        
        // Quantity increase buttons
        this.container.querySelectorAll('.qty-increase').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.increaseOrderItemQty(index);
            });
        });
        
        // Add notes buttons
        this.container.querySelectorAll('.add-notes-btn').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.promptForNotes(index);
            });
        });
        
        // Edit notes buttons
        this.container.querySelectorAll('.edit-notes-btn').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.promptForNotes(index);
            });
        });
    },
    
    /**
     * Update guests count
     */
    updateGuests: function() {
        const guestsInput = this.container.querySelector('#guests-input');
        if (!guestsInput) return;
        
        const guests = parseInt(guestsInput.value) || 1;
        
        frappe.call({
            method: 'imogi_pos.api.orders.update_order_guests',
            args: {
                pos_order: this.settings.posOrder,
                guests: guests
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('Guests updated successfully');
                    
                    // Update local state
                    if (this.state.order) {
                        this.state.order.guests = guests;
                    }
                } else {
                    this.showError('Failed to update guests');
                }
            },
            error: () => {
                this.showError('Failed to update guests');
            }
        });
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
        if (!this.settings.posOrder) {
            this.showError('No order selected');
            return;
        }
        
        frappe.call({
            method: 'imogi_pos.api.customers.attach_customer_to_order_or_invoice',
            args: {
                customer: customerName,
                pos_order: this.settings.posOrder
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    // Close modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (modalContainer) {
                        modalContainer.classList.remove('active');
                    }
                    
                    // Update customer info
                    this.state.customerId = customerName;
                    this.state.customerName = response.message.customer_name || customerName;
                    this.state.customerPhone = response.message.contact_mobile || null;
                    
                    // Update UI
                    this.updateCustomerDisplay();
                    
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
     * Update customer display
     */
    updateCustomerDisplay: function() {
        const customerDetails = this.container.querySelector('.customer-details');
        if (!customerDetails) return;
        
        if (this.state.customerId) {
            customerDetails.innerHTML = `
                <div class="customer-name">${this.state.customerName || this.state.customerId}</div>
                ${this.state.customerPhone ? `<div class="customer-phone">${this.state.customerPhone}</div>` : ''}
            `;
        } else {
            customerDetails.innerHTML = `<div class="no-customer">No customer assigned</div>`;
        }
        
        // Update button text
        const selectCustomerBtn = this.container.querySelector('#select-customer-btn');
        if (selectCustomerBtn) {
            selectCustomerBtn.textContent = this.state.customerId ? 'Change' : 'Add Customer';
        }
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
     * Load catalog data
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
                    // Store item groups
                    this.state.itemGroups = response.message;
                    
                    // Render item groups
                    this.renderItemGroups();
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
     */
    renderItemGroups: function() {
        const itemGroupList = this.container.querySelector('#item-group-list');
        if (!itemGroupList) return;
        
        if (this.state.itemGroups.length === 0) {
            itemGroupList.innerHTML = `
                <div class="empty-state small">
                    <p>No item groups found</p>
                </div>
            `;
            return;
        }
        
        // Add "All Items" option
        const allGroups = [
            {
                name: 'All',
                item_group_name: 'All Items'
            },
            ...this.state.itemGroups
        ];
        
        let html = '';
        allGroups.forEach(group => {
            const isActive = (this.state.selectedItemGroup === group.name) || 
                             (!this.state.selectedItemGroup && group.name === 'All');
            
            html += `
                <div class="item-group-card ${isActive ? 'active' : ''}" data-group="${group.name}">
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
                this.state.selectedItemGroup = groupName === 'All' ? null : groupName;
                this.loadItems();
            });
        });
    },
    
    /**
     * Load items for the selected group
     */
    loadItems: function() {
        const catalogItems = this.container.querySelector('#catalog-items');
        if (!catalogItems) return;
        
        // Show loading
        catalogItems.innerHTML = `<div class="loading-container">Loading items...</div>`;
        
        frappe.call({
            method: 'imogi_pos.api.variants.get_template_items',
            args: {
                pos_profile: this.settings.posProfile,
                item_group: this.state.selectedItemGroup
            },
            callback: (response) => {
                if (response.message && Array.isArray(response.message)) {
                    // Store catalog items
                    this.state.catalogItems = response.message;
                    
                    // Render items
                    this.renderItems(this.state.catalogItems);
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
     * Search items
     */
    searchItems: function() {
        const searchTerm = this.state.searchTerm.trim().toLowerCase();
        
        if (!searchTerm) {
            // If search is cleared, show all items for current group
            this.renderItems(this.state.catalogItems);
            return;
        }
        
        // Filter items based on search term
        const filteredItems = this.state.catalogItems.filter(item => {
            return item.item_name.toLowerCase().includes(searchTerm) || 
                   item.name.toLowerCase().includes(searchTerm);
        });
        
        this.state.searchResults = filteredItems;
        this.renderItems(filteredItems);
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
                    this.handleItemSelection(itemName);
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
        
        // Store current variant item
        this.state.currentVariantItem = templateName;
        
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
                    this.renderVariantPicker(response.message);
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
     * @param {Object} data - Variant data
     */
    renderVariantPicker: function(data) {
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
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (modalContainer) {
                        modalContainer.classList.remove('active');
                    }
                    this.handleItemSelection(itemName);
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
     * Handle item selection and fetch option details
     * @param {string} itemName - Selected item name
     */
    handleItemSelection: function(itemName) {
        frappe.call({
            method: 'imogi_pos.api.items.get_item_options',
            args: { item: itemName },
            callback: (r) => {
                const data = r.message || {};
                if (Object.keys(data).length === 0) {
                    this.addItemToOrder(itemName);
                } else {
                    this.showItemOptionsModal(itemName, data);
                }
            },
            error: () => {
                this.addItemToOrder(itemName);
            }
        });
    },

    /**
     * Show dynamic item options modal
     * @param {string} itemName - Item to add
     * @param {Object} optionsData - Options returned from server
     */
    showItemOptionsModal: function(itemName, optionsData) {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;

        let fieldsHtml = '';
        Object.entries(optionsData).forEach(([field, choices]) => {
            if (!['size', 'spice', 'topping'].includes(field)) return;
            const title = this.toTitleCase(field);
            if (field === 'topping') {
                fieldsHtml += `<div class="option-group"><label>${title}</label>` +
                    choices.map(opt => {
                        const { label, value, price = 0 } = opt;
                        return `<label><input type="checkbox" class="option-checkbox" data-option="${field}" value="${value}" data-price="${price}"> ${label}</label>`;
                    }).join('') + '</div>';
            } else {
                fieldsHtml += `<div class="option-group"><label>${title}</label><select class="option-select" data-option="${field}">` +
                    `<option value="" data-price="0">Select ${title}</option>` +
                    choices.map(opt => {
                        const { label, value, price = 0 } = opt;
                        return `<option value="${value}" data-price="${price}">${label}</option>`;
                    }).join('') + '</select></div>';
            }
        });

        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Options</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">${fieldsHtml}</div>
                    <div class="modal-footer">
                        <button class="modal-cancel">Cancel</button>
                        <button class="modal-confirm">Add</button>
                    </div>
                </div>
            </div>`;

        modalContainer.classList.add('active');

        const close = () => modalContainer.classList.remove('active');
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        const cancelBtn = modalContainer.querySelector('.modal-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', close);

        const confirmBtn = modalContainer.querySelector('.modal-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const selectedOptions = {};
                let optionPrice = 0;

                modalContainer.querySelectorAll('.option-select').forEach(sel => {
                    const key = sel.dataset.option;
                    const opt = sel.options[sel.selectedIndex];
                    const value = sel.value;
                    const price = parseFloat(opt.dataset.price || 0);
                    if (value) {
                        selectedOptions[key] = value;
                        optionPrice += price;
                    }
                });

                const toppings = [];
                modalContainer.querySelectorAll('.option-checkbox:checked').forEach(cb => {
                    toppings.push(cb.value);
                    optionPrice += parseFloat(cb.dataset.price || 0);
                });
                if (toppings.length > 0) {
                    selectedOptions.topping = toppings;
                }

                selectedOptions.price = optionPrice;
                this.addItemToOrder(itemName, selectedOptions);
                close();
            });
        }
    },

    /**
     * Convert string to title case
     */
    toTitleCase: function(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    },

    /**
     * Format selected options for display
     */
    formatSelectedOptions: function(options) {
        if (!options) return '';
        return Object.entries(options)
            .filter(([k]) => k !== 'price')
            .map(([k, v]) => {
                const val = Array.isArray(v) ? v.join(', ') : v;
                return `${this.toTitleCase(k)}: ${val}`;
            }).join(', ');
    },
    
    /**
     * Add item to order
     * @param {string} itemName - Item name to add
     */
    addItemToOrder: function(itemName, options = {}) {
        // Show loading indicator
        this.showLoading(true, 'Adding item...');

        // Get item details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Item',
                name: itemName
            },
            callback: (response) => {
                if (response.message) {
                    const item = response.message;

                    // Calculate rate including option price
                    const optionPrice = options.price || 0;
                    const rate = (item.standard_rate || 0) + optionPrice;

                    // Check if item is already in order with same options
                    const existingItemIndex = this.state.orderItems.findIndex(orderItem =>
                        orderItem.item === itemName && !orderItem.notes &&
                        JSON.stringify(orderItem.options || {}) === JSON.stringify(options)
                    );

                    if (existingItemIndex !== -1) {
                        // Increment quantity
                        this.state.orderItems[existingItemIndex].qty += 1;
                        this.state.orderItems[existingItemIndex].amount =
                            this.state.orderItems[existingItemIndex].qty * this.state.orderItems[existingItemIndex].rate;
                    } else {
                        // Add new item
                        this.state.orderItems.push({
                            item: itemName,
                            item_name: item.item_name,
                            qty: 1,
                            rate: rate,
                            amount: rate,
                            notes: '',
                            options: options
                        });
                    }

                    // Update UI
                    this.updateOrderPanel();

                    // Hide loading indicator
                    this.showLoading(false);

                    // Show prompt for notes
                    this.promptForNotes(existingItemIndex !== -1 ? existingItemIndex : this.state.orderItems.length - 1);
                } else {
                    this.showLoading(false);
                    this.showError('Failed to add item');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to add item');
            }
        });
    },
    
    /**
     * Update order panel
     */
    updateOrderPanel: function() {
        const orderItems = this.container.querySelector('#order-items');
        const orderTotals = this.container.querySelector('#order-totals');
        
        if (orderItems) {
            orderItems.innerHTML = this.renderOrderItems();
            this.bindOrderItemEvents();
        }
        
        if (orderTotals) {
            orderTotals.innerHTML = this.renderOrderTotals();
        }
    },
    
    /**
     * Prompt for item notes
     * @param {number} itemIndex - Index of item in order
     */
    promptForNotes: function(itemIndex) {
        // Show modal for notes
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        const item = this.state.orderItems[itemIndex];
        if (!item) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Notes for ${item.item_name}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="item-notes">Special Instructions</label>
                            <textarea id="item-notes" class="form-textarea" 
                                placeholder="Any special instructions for this item?">${item.notes || ''}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="save-notes-btn" class="modal-button primary">Save Notes</button>
                        <button id="skip-notes-btn" class="modal-button">Skip</button>
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
        
        // Bind skip button
        const skipBtn = modalContainer.querySelector('#skip-notes-btn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind save button
        const saveBtn = modalContainer.querySelector('#save-notes-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const notesInput = modalContainer.querySelector('#item-notes');
                if (notesInput) {
                    const notes = notesInput.value.trim();
                    
                    // Update item notes
                    this.state.orderItems[itemIndex].notes = notes;
                    
                    // Update UI
                    this.updateOrderPanel();
                }
                
                // Close modal
                modalContainer.classList.remove('active');
            });
        }
    },
    
    /**
     * Remove item from order
     * @param {number} index - Index of item to remove
     */
    removeOrderItem: function(index) {
        if (index >= 0 && index < this.state.orderItems.length) {
            this.state.orderItems.splice(index, 1);
            
            // Update UI
            this.updateOrderPanel();
        }
    },
    
    /**
     * Decrease order item quantity
     * @param {number} index - Index of item to decrease
     */
    decreaseOrderItemQty: function(index) {
        if (index >= 0 && index < this.state.orderItems.length) {
            if (this.state.orderItems[index].qty > 1) {
                this.state.orderItems[index].qty -= 1;
                this.state.orderItems[index].amount = this.state.orderItems[index].qty * this.state.orderItems[index].rate;
                
                // Update UI
                this.updateOrderPanel();
            } else {
                // If quantity would go below 1, remove the item
                this.removeOrderItem(index);
            }
        }
    },
    
    /**
     * Increase order item quantity
     * @param {number} index - Index of item to increase
     */
    increaseOrderItemQty: function(index) {
        if (index >= 0 && index < this.state.orderItems.length) {
            this.state.orderItems[index].qty += 1;
            this.state.orderItems[index].amount = this.state.orderItems[index].qty * this.state.orderItems[index].rate;
            
            // Update UI
            this.updateOrderPanel();
        }
    },
    
    /**
     * Send order to kitchen
     */
    sendToKitchen: function() {
        if (this.state.orderItems.length === 0) {
            this.showError('No items in order');
            return;
        }
        
        // Save order first
        this.saveOrder(true)
            .then((itemRows) => {
                // Show loading indicator
                this.showLoading(true, 'Sending to kitchen...');

                // Send to kitchen
                frappe.call({
                    method: 'imogi_pos.api.kot.send_items_to_kitchen',
                    args: {
                        pos_order: this.settings.posOrder,
                        item_rows: itemRows
                    },
                    callback: (response) => {
                        this.showLoading(false);

                        if (response.message && response.message.success) {
                            this.showToast('Order sent to kitchen');

                            // Update KOT status
                            this.state.kotSubmitted = true;

                            // Update UI
                            const sendToKitchenBtn = this.container.querySelector('#send-to-kitchen-btn');
                            if (sendToKitchenBtn) {
                                sendToKitchenBtn.disabled = true;
                            }

                            const printKotBtn = this.container.querySelector('#print-kot-btn');
                            if (printKotBtn) {
                                printKotBtn.disabled = false;
                            }

                            // Update order status if needed
                            if (this.state.order) {
                                this.state.order.workflow_state = 'Sent to Kitchen';

                                // Update order status display
                                const orderStatus = this.container.querySelector('.order-status');
                                if (orderStatus) {
                                    orderStatus.textContent = 'Sent to Kitchen';
                                    orderStatus.className = 'order-status sent-to-kitchen';
                                }
                            }

                            // Ask if user wants to go back to table display
                            this.showConfirmDialog(
                                'Order Sent',
                                'Order has been sent to kitchen successfully. Do you want to go back to Table Display?',
                                'Go Back',
                                'Stay Here',
                                () => {
                                    window.location.href = '/app/table-display';
                                }
                            );
                        } else {
                            this.showError(`Failed to send to kitchen: ${response.message && response.message.error || 'Unknown error'}`);
                        }
                    },
                    error: () => {
                        this.showLoading(false);
                        this.showError('Failed to send to kitchen');
                    }
                });
            })
            .catch(error => {
                this.showError(`Failed to save order: ${error}`);
            });
    },
    
    /**
     * Print KOT for current order
     */
    printKot: function() {
        if (!this.settings.posOrder) {
            this.showError('No order to print');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Printing KOT...');
        
        frappe.call({
            method: 'imogi_pos.api.kot.print_kot',
            args: {
                pos_order: this.settings.posOrder
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('KOT printed successfully');
                } else {
                    this.showError('Failed to print KOT');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to print KOT');
            }
        });
    },
    
    /**
     * Save order
     * @param {boolean} [silent=false] - Whether to show success message
     * @returns {Promise} Promise resolving when order is saved
     */
    saveOrder: function(silent = false) {
        return new Promise((resolve, reject) => {
            if (this.state.orderItems.length === 0) {
                reject('No items in order');
                return;
            }
            
            // Show loading indicator
            if (!silent) {
                this.showLoading(true, 'Saving order...');
            }
            
            // Prepare order data
            const orderData = {
                pos_order: this.settings.posOrder,
                table: this.settings.table,
                items: this.state.orderItems.map(item => ({
                    item: item.item,
                    qty: item.qty,
                    rate: item.rate,
                    notes: item.notes
                })),
                customer: this.state.customerId
            };
            
            // Get guest count
            const guestsInput = this.container.querySelector('#guests-input');
            if (guestsInput) {
                orderData.guests = parseInt(guestsInput.value) || 1;
            }
            
            // Save order
            frappe.call({
                method: 'imogi_pos.api.orders.save_order',
                args: orderData,
                callback: (response) => {
                    if (!silent) {
                        this.showLoading(false);
                    }
                    
                    if (response.message && response.message.name) {
                        if (!silent) {
                            this.showToast('Order saved successfully');
                        }

                        // Update order name if needed
                        if (!this.settings.posOrder) {
                            this.settings.posOrder = response.message.name;

                            // Update URL without reloading
                            const url = new URL(window.location);
                            url.searchParams.set('pos_order', this.settings.posOrder);
                            window.history.pushState({}, '', url);

                            // Update order header
                            const orderHeader = this.container.querySelector('.order-header h3');
                            if (orderHeader) {
                                orderHeader.textContent = `Order: ${this.settings.posOrder}`;
                            }
                        }

                        const itemRows = (response.message.items || []).map(item => item.name);
                        resolve(itemRows);
                    } else {
                        if (!silent) {
                            this.showError('Failed to save order');
                        }
                        reject('Failed to save order');
                    }
                },
                error: (err) => {
                    if (!silent) {
                        this.showLoading(false);
                        this.showError('Failed to save order');
                    }
                    reject(err || 'Failed to save order');
                }
            });
        });
    },
    
    /**
     * Cancel the current order
     */
    cancel: function() {
        this.showConfirmDialog(
            'Cancel Order',
            'Are you sure you want to cancel this order? This cannot be undone.',
            'Yes, Cancel Order',
            'No, Keep Order',
            () => {
                // Show loading indicator
                this.showLoading(true, 'Cancelling order...');
                
                frappe.call({
                    method: 'imogi_pos.api.orders.cancel_order',
                    args: {
                        pos_order: this.settings.posOrder
                    },
                    callback: (response) => {
                        this.showLoading(false);
                        
                        if (response.message && response.message.success) {
                            this.showToast('Order cancelled successfully');
                            
                            // Redirect to table display
                            window.location.href = '/app/table-display';
                        } else {
                            this.showError('Failed to cancel order');
                        }
                    },
                    error: () => {
                        this.showLoading(false);
                        this.showError('Failed to cancel order');
                    }
                });
            }
        );
    },
    
    /**
     * Show confirm dialog
     * @param {string} title - Dialog title
     * @param {string} message - Dialog message
     * @param {string} confirmText - Text for confirm button
     * @param {string} cancelText - Text for cancel button
     * @param {Function} onConfirm - Callback for confirm
     */
    showConfirmDialog: function(title, message, confirmText, cancelText, onConfirm) {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button id="confirm-btn" class="modal-button danger">${confirmText}</button>
                        <button id="cancel-btn" class="modal-button">${cancelText}</button>
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
        const cancelBtn = modalContainer.querySelector('#cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
            });
        }
        
        // Bind confirm button
        const confirmBtn = modalContainer.querySelector('#confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                modalContainer.classList.remove('active');
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            });
        }
    },
    
    /**
     * Show a toast message
     * @param {string} message - Message to show
     * @param {string} [type='success'] - Message type (success, error, warning, info)
     */
    showToast: function(message, type = 'success') {
        const toastContainer = this.container.querySelector('#toast-container');
        if (!toastContainer) return;
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="toast-icon fa ${type === 'success' ? 'fa-check-circle' : 
                                         type === 'error' ? 'fa-times-circle' : 
                                         type === 'warning' ? 'fa-exclamation-triangle' : 
                                         'fa-info-circle'}"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        // Add to container
        toastContainer.appendChild(toast);
        
        // Remove after delay
        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    },
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: function(message) {
        this.showToast(message, 'error');
    },
    
    /**
     * Show loading indicator
     * @param {boolean} show - Whether to show or hide
     * @param {string} [message='Loading...'] - Loading message
     */
    showLoading: function(show, message = 'Loading...') {
        let loadingEl = document.querySelector('#global-loading');
        
        if (show) {
            if (!loadingEl) {
                loadingEl = document.createElement('div');
                loadingEl.id = 'global-loading';
                loadingEl.className = 'global-loading';
                loadingEl.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message}</div>
                `;
                document.body.appendChild(loadingEl);
            } else {
                loadingEl.querySelector('.loading-message').textContent = message;
            }
        } else if (loadingEl) {
            document.body.removeChild(loadingEl);
        }
    },
    
    /**
     * Format currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted amount
     */
    formatCurrency: function(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        
        return frappe.format(amount, { fieldtype: 'Currency' });
    }
};