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

import './utils/options';

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

    selectionMemory: Object.create(null),
    
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

                    this.settings.sellingPriceList = this.state.order.selling_price_list || null;
                    this.settings.basePriceList = (
                        this.state.order.imogi_base_price_list ||
                        this.state.order.base_price_list ||
                        null
                    );

                    const toolkit = imogi_pos.utils && imogi_pos.utils.options;
                    const helperBag = (toolkit && toolkit.__helpers) || {};
                    const sumAdditionalPrice = helperBag.sumAdditionalPrice || (() => 0);
                    const hasAnyLinkedItem = helperBag.hasAnyLinkedItem || (() => false);

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
                        this.state.orderItems = this.state.order.items.map(item => {
                            const counters = this.normalizeCounters(item.counters);
                            const kitchenStatus = this.getKitchenStatusFromCounters(counters);
                            let parsedOptions = {};
                            if (item.item_options) {
                                if (typeof item.item_options === 'string') {
                                    try {
                                        parsedOptions = JSON.parse(item.item_options);
                                    } catch (error) {
                                        console.warn('Failed to parse stored item options', error);
                                        parsedOptions = {};
                                    }
                                } else if (typeof item.item_options === 'object') {
                                    parsedOptions = item.item_options;
                                }
                            }

                            const templateItem = item.template_item || item.item_template || null;
                            const skuChanged = Boolean(templateItem && templateItem !== item.item);
                            const expectedLinked = hasAnyLinkedItem(parsedOptions);

                            return {
                                name: item.name,
                                item: item.item,
                                item_code: item.item,
                                template_item: templateItem,
                                item_name: item.item_name,
                                qty: item.qty,
                                rate: item.rate,
                                amount: item.amount,
                                notes: item.notes || '',
                                item_options: parsedOptions,
                                options: parsedOptions,
                                base_rate: item.base_rate || item.rate,
                                additional_price_total: sumAdditionalPrice(parsedOptions),
                                sku_changed: skuChanged,
                                expected_linked_item: expectedLinked,
                                requires_variant: expectedLinked,
                                counters,
                                kitchen_status: kitchenStatus,
                            };
                        });
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
            const counters = this.normalizeCounters(item.counters);
            if (counters && counters !== item.counters) {
                item.counters = counters;
            }

            const kitchenStatus = this.getKitchenStatusFromCounters(counters);
            if (kitchenStatus) {
                const existingStatus = item.kitchen_status || {};
                if (
                    existingStatus.className !== kitchenStatus.className ||
                    existingStatus.timestamp !== kitchenStatus.timestamp
                ) {
                    item.kitchen_status = kitchenStatus;
                }
            } else if (item.kitchen_status) {
                item.kitchen_status = null;
            }

            const displayStatus = item.kitchen_status || kitchenStatus;
            const statusTime = displayStatus ? this.formatKitchenStatusTime(displayStatus.timestamp) : '';
            
            // Check if item is a template
            const isTemplate = item.has_variants === 1 || item.has_variants === true;
            const templateClass = isTemplate ? 'template-item' : '';
            
            html += `
                <div class="order-item ${templateClass}">
                    <div class="item-header">
                        <div class="item-title">
                            <div class="item-name">
                                ${item.item_name}
                                ${isTemplate ? '<span class="template-badge"><i class="fa fa-list"></i> Template</span>' : ''}
                            </div>
                            ${displayStatus ? `
                                <div class="item-status">
                                    <span class="status-badge ${displayStatus.className}">${displayStatus.label}</span>
                                    ${statusTime ? `<span class="status-time">${statusTime}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <button class="item-remove" data-index="${index}">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                    ${isTemplate ? `
                        <div class="item-variant-action">
                            <button class="select-variant-btn" data-index="${index}" data-item-row="${item.name || ''}" data-item-code="${item.item || ''}">
                                <i class="fa fa-edit"></i> Select Variant
                            </button>
                        </div>
                    ` : ''}
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
        
        // Select variant buttons
        this.container.querySelectorAll('.select-variant-btn').forEach(button => {
            button.addEventListener('click', () => {
                const itemRow = button.dataset.itemRow;
                const itemCode = button.dataset.itemCode;
                this.showVariantPickerForOrderItem(itemCode, itemRow);
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
     * @param {string} orderItemRow - Optional: Order item row name for conversion
     */
    showVariantPicker: function(templateName, orderItemRow = null) {
        // Show modal for variant selection
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Store current variant item and context
        this.state.currentVariantItem = templateName;
        this.variantPickerContext = {
            templateName: templateName,
            orderItemRow: orderItemRow,
            mode: orderItemRow ? 'convert' : 'add'
        };
        
        const modalTitle = orderItemRow ? 'Select Variant to Replace Template' : 'Select Variant';
        
        // Show loading state
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${modalTitle}</h3>
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
                this.variantPickerContext = null;
            });
        }
        
        // Load variants
        frappe.call({
            method: 'imogi_pos.api.variants.get_item_variants',
            args: {
                item_template: templateName
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
     * Show variant picker for existing order item (convert template to variant)
     * @param {string} templateName - Item template name
     * @param {string} orderItemRow - Order item row name
     */
    showVariantPickerForOrderItem: function(templateName, orderItemRow) {
        this.showVariantPicker(templateName, orderItemRow);
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
        const attributeLabelMap = {};
        const attributeValueLabelMap = {};

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
                            ${(() => {
                                const attributeKey = attr.name || attr.fieldname || attr.attribute;
                                if (!attributeKey) {
                                    return '';
                                }
                                const attributeLabel = attr.label || attr.name || attr.attribute || attributeKey;
                                const attributeValues = (attr.values || []).map(val => {
                                    if (val && typeof val === 'object') {
                                        return {
                                            value: val.value ?? val.name ?? '',
                                            label: val.label ?? val.value ?? val.name ?? ''
                                        };
                                    }
                                    return { value: val, label: val };
                                }).filter(option => option.value !== undefined && option.value !== null && option.value !== '');

                                attributeLabelMap[attributeKey] = attributeLabel;
                                if (!attributeValueLabelMap[attributeKey]) {
                                    attributeValueLabelMap[attributeKey] = {};
                                }

                                const optionsHtml = attributeValues.map(option => {
                                    const optionValue = String(option.value);
                                    const optionLabel = option.label || optionValue;
                                    attributeValueLabelMap[attributeKey][optionValue] = optionLabel;
                                    return `<option value="${optionValue}">${optionLabel}</option>`;
                                }).join('');

                                return `
                                    <label>${attributeLabel}</label>
                                    <select class="variant-attribute-select" data-attribute="${attributeKey}">
                                        <option value="">All</option>
                                        ${optionsHtml}
                                    </select>
                                `;
                            })()}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Create variant list
        let variantsHtml = `
            <div class="variant-list" id="variant-list">
                ${variants.map(variant => {
                    const normalizedAttributes = {};
                    const variantAttributesHtml = Object.entries(variant.attributes || {}).map(([attrKey, attrValue]) => {
                        const attributeLabel = attributeLabelMap[attrKey] || attrKey;
                        let normalizedValue = attrValue;
                        let displayValue = attrValue;

                        if (attrValue && typeof attrValue === 'object') {
                            normalizedValue = attrValue.value ?? attrValue.name ?? '';
                            displayValue = attrValue.label ?? attrValue.value ?? attrValue.name ?? '';
                        }

                        const normalizedString = normalizedValue !== undefined && normalizedValue !== null ? String(normalizedValue) : '';

                        if (normalizedString) {
                            normalizedAttributes[attrKey] = normalizedString;
                        }

                        const valueLabelMap = attributeValueLabelMap[attrKey] || {};
                        const lookupLabel = normalizedString ? valueLabelMap[normalizedString] : undefined;
                        const finalDisplayValue = lookupLabel || displayValue || normalizedString;

                        return `<span class="variant-attr">${attributeLabel}: ${finalDisplayValue}</span>`;
                    }).join('');

                    const displayRate = (
                        variant.rate !== undefined && variant.rate !== null && variant.rate !== ''
                    )
                        ? variant.rate
                        : (
                            variant.standard_rate !== undefined && variant.standard_rate !== null
                                ? variant.standard_rate
                                : 0
                        );

                    return `
                        <div class="variant-card" data-item="${variant.name}" data-attributes='${JSON.stringify(normalizedAttributes)}'>
                            <div class="variant-name">${variant.item_name}</div>
                            <div class="variant-attrs">${variantAttributesHtml}</div>
                            <div class="variant-price">${this.formatCurrency(displayRate)}</div>
                        </div>
                    `;
                }).join('')}
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
                    
                    // Check if we're in convert mode or add mode
                    if (this.variantPickerContext && this.variantPickerContext.mode === 'convert') {
                        // Convert existing template item to variant
                        this.selectVariantForOrderItem(this.variantPickerContext.orderItemRow, itemName);
                    } else {
                        // Add new variant to order
                        this.handleItemSelection(itemName);
                    }
                    
                    // Clear context
                    this.variantPickerContext = null;
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

            if (attribute && value !== '') {
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
                const variantValue = attributes[attr];
                if (variantValue === undefined || String(variantValue) !== String(value)) {
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
        const remembered = this.getRememberedSelection(itemName);
        if (remembered) {
            const clonedOptions = this.cloneSelectionOptions(remembered.options);
            const notes = remembered.notes || '';
            this.addItemToOrder(itemName, clonedOptions, 1, notes);
            return;
        }

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

        const escapeAttr = (value) => {
            if (value === undefined || value === null) {
                return '';
            }
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        let fieldsHtml = '';
        Object.entries(optionsData).forEach(([field, choices]) => {
            if (!['size', 'spice', 'topping', 'variant'].includes(field)) return;
            const title = this.toTitleCase(field);
            if (field === 'topping') {
                fieldsHtml += `<div class="option-group" data-option="${field}"><label>${title}</label>` +
                    choices.map(opt => {
                        const { label, value, price = 0, linked_item: linkedItem } = opt;
                        const linkedAttr = linkedItem ? ` data-linked-item="${escapeAttr(linkedItem)}"` : '';
                        const labelAttr = label ? ` data-label="${escapeAttr(label)}"` : '';
                        return `<label><input type="checkbox" class="option-checkbox" data-option="${field}" value="${value}" data-price="${price}"${linkedAttr}${labelAttr}> ${label}</label>`;
                    }).join('') + '</div>';
            } else if (field === 'variant') {
                fieldsHtml += `<div class="option-group" data-option="${field}" data-required="1"><label>${title}</label>` +
                    choices.map((opt, index) => {
                        const { label, value, price = 0, default: isDefault, linked_item: linkedItem } = opt;
                        const checked = isDefault ? 'checked' : '';
                        const optionId = `option-${field}-${index}`;
                        const priceText = price ? ` (+${this.formatCurrency(price)})` : '';
                        const linkedAttr = linkedItem ? ` data-linked-item="${escapeAttr(linkedItem)}"` : '';
                        const labelAttr = label ? ` data-label="${escapeAttr(label)}"` : '';
                        return `<label for="${optionId}"><input type="radio" id="${optionId}" class="option-radio" name="option-${field}" data-option="${field}" value="${value}" data-price="${price}"${linkedAttr}${labelAttr} ${checked}> ${label}${priceText}</label>`;
                    }).join('') + '</div>';
            } else {
                fieldsHtml += `<div class="option-group" data-option="${field}"><label>${title}</label><select class="option-select" data-option="${field}">` +
                    `<option value="" data-price="0">Select ${title}</option>` +
                    choices.map(opt => {
                        const { label, value, price = 0, linked_item: linkedItem } = opt;
                        const linkedAttr = linkedItem ? ` data-linked-item="${escapeAttr(linkedItem)}"` : '';
                        const labelAttr = label ? ` data-label="${escapeAttr(label)}"` : '';
                        return `<option value="${value}" data-price="${price}"${linkedAttr}${labelAttr}>${label}</option>`;
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
                const missing = [];

                const buildOptionPayload = (value, label, linkedItem, priceValue) => {
                    if (!value) {
                        return null;
                    }
                    const payload = {
                        value: value,
                        name: label && label !== '' ? label : value,
                    };
                    if (linkedItem && linkedItem !== '') {
                        payload.linked_item = linkedItem;
                    }
                    const numericPrice = Number(priceValue || 0) || 0;
                    if (numericPrice) {
                        payload.additional_price = numericPrice;
                    } else {
                        payload.additional_price = 0;
                    }
                    return payload;
                };

                modalContainer.querySelectorAll('.option-group[data-option]').forEach(group => {
                    const key = group.dataset.option;
                    const required = group.dataset.required === '1';

                    const select = group.querySelector('.option-select');
                    if (select) {
                        const opt = select.options[select.selectedIndex];
                        const value = select.value;
                        const price = parseFloat((opt && opt.dataset.price) || 0);
                        if (value) {
                            const linkedItem = (opt && opt.dataset.linkedItem) || '';
                            const label = (opt && (opt.dataset.label || opt.textContent)) || value;
                            selectedOptions[key] = buildOptionPayload(value, label, linkedItem, price) || value;
                            optionPrice += price;
                        } else if (required) {
                            missing.push(this.toTitleCase(key));
                        }
                        return;
                    }

                    const radio = group.querySelector('.option-radio:checked');
                    if (radio) {
                        const linkedItem = radio.dataset.linkedItem || '';
                        const price = parseFloat(radio.dataset.price || 0);
                        const label = radio.dataset.label || radio.value;
                        selectedOptions[key] = buildOptionPayload(radio.value, label, linkedItem, price) || radio.value;
                        optionPrice += price;
                        return;
                    } else if (group.querySelector('.option-radio') && required) {
                        missing.push(this.toTitleCase(key));
                        return;
                    }

                    const checkboxes = group.querySelectorAll('.option-checkbox:checked');
                    if (checkboxes.length) {
                        const values = [];
                        checkboxes.forEach(cb => {
                            const price = parseFloat(cb.dataset.price || 0);
                            optionPrice += price;
                            const linkedItem = cb.dataset.linkedItem || '';
                            const label = cb.dataset.label || cb.value;
                            const payload = buildOptionPayload(cb.value, label, linkedItem, price) || cb.value;
                            if (payload) {
                                values.push(payload);
                            }
                        });
                        if (values.length) {
                            selectedOptions[key] = values;
                        }
                    } else if (group.querySelector('.option-checkbox') && required) {
                        missing.push(this.toTitleCase(key));
                    }
                });

                if (missing.length) {
                    this.showError('Please select: ' + missing.join(', '));
                    return;
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
        const extractValue = (value) => {
            if (Array.isArray(value)) {
                return value
                    .map(item => extractValue(item))
                    .filter(part => part !== '')
                    .join(', ');
            }

            if (value === undefined || value === null) {
                return '';
            }

            if (typeof value === 'object') {
                const nested = value.name || value.label || value.value;
                if (nested !== undefined && nested !== null && nested !== '') {
                    return String(nested);
                }
                return '';
            }

            return String(value);
        };

        return Object.entries(options)
            .filter(([k]) => !['price', 'extra_price'].includes(k))
            .map(([k, v]) => {
                const val = extractValue(v);
                if (!val) return null;
                return `${this.toTitleCase(k)}: ${val}`;
            })
            .filter(Boolean)
            .join(', ');
    },

    getCatalogItemDetails: function(itemCode) {
        if (!itemCode) return null;
        const collections = [
            this.state.catalogItems || [],
            this.state.searchResults || [],
        ];
        for (const items of collections) {
            const match = items.find(item => item && item.name === itemCode);
            if (match) {
                return match;
            }
        }
        return null;
    },

    getOptionsSignature: function(options) {
        try {
            return JSON.stringify(options || {});
        } catch (error) {
            console.warn('Failed to serialise options payload', error);
            return '';
        }
    },

    buildPricingContext: function({ itemCode, qty = 1, itemDetails = null } = {}) {
        const order = this.state.order || {};
        const priceList = order.selling_price_list || this.settings.sellingPriceList || null;
        const basePriceList = (
            order.imogi_base_price_list ||
            order.base_price_list ||
            this.settings.basePriceList ||
            null
        );

        return {
            qty,
            priceList,
            basePriceList,
            posProfile: this.settings.posProfile || null,
            itemName: (itemDetails && itemDetails.item_name) || itemCode,
        };
    },

    hasUnresolvedSku: function(line) {
        if (!line) return false;
        if (!line.expected_linked_item) return false;
        if (!line.template_item) return false;
        if (line.sku_changed) return false;
        if (line.item && line.template_item && line.item !== line.template_item) {
            return false;
        }
        return true;
    },

    ensureAllSkusResolved: function(lines) {
        const unresolved = (lines || []).filter(item => this.hasUnresolvedSku(item));
        if (unresolved.length) {
            const names = unresolved
                .map(item => item.item_name || item.item || 'Unknown Item')
                .join(', ');
            throw new Error(`Please select a specific variant for: ${names}`);
        }
    },

    /**
     * Select variant for existing order item (convert template to variant)
     * @param {string} orderItemRow - Order item row name
     * @param {string} variantItem - Variant item code
     */
    selectVariantForOrderItem: function(orderItemRow, variantItem) {
        if (!this.settings.posOrder) {
            this.showError('No order selected');
            return;
        }
        
        if (!orderItemRow || !variantItem) {
            this.showError('Invalid parameters');
            return;
        }
        
        // Show loading
        this.showToast('Converting to variant...', 'info');
        
        frappe.call({
            method: 'imogi_pos.api.variants.choose_variant_for_order_item',
            args: {
                pos_order: this.settings.posOrder,
                order_item_row: orderItemRow,
                variant_item: variantItem
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.showToast('Template converted to variant successfully', 'success');
                    
                    // Reload order to reflect changes
                    this.loadOrder();
                } else {
                    const errorMsg = response.message && response.message.message 
                        ? response.message.message 
                        : 'Failed to convert template to variant';
                    this.showError(errorMsg);
                }
            },
            error: (error) => {
                const errorMsg = error && error.message 
                    ? error.message 
                    : 'Failed to convert template to variant';
                this.showError(errorMsg);
            }
        });
    },

    /**
     * Add item to order
     * @param {string} itemName - Item name to add
     */
    addItemToOrder: function(itemName, options = {}, quantity = 1, notes = '') {
        const toolkit = imogi_pos.utils && imogi_pos.utils.options;
        const resolver = toolkit && typeof toolkit.applyOptionsToLine === 'function'
            ? toolkit.applyOptionsToLine
            : null;

        if (!resolver) {
            this.showError('Option resolver unavailable. Please refresh the page.');
            return;
        }

        const itemDetails = this.getCatalogItemDetails(itemName) || {};
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const itemNotes = notes || '';
        const line = {
            item: itemName,
            item_code: itemName,
            template_item: itemName,
            item_name: itemDetails.item_name || itemName,
            qty: qty,
            rate: 0,
            amount: 0,
            notes: itemNotes,
            item_options: options || {},
            options: options || {},
            requires_variant: Number(itemDetails.has_variants) === 1,
            counters: this.normalizeCounters({}),
            kitchen_status: null,
        };

        const context = this.buildPricingContext({
            itemCode: itemName,
            qty,
            itemDetails,
        });

        this.showLoading(true, 'Adding item...');

        resolver(line, options, context)
            .then(() => {
                const signature = this.getOptionsSignature(line.item_options);
                const existingItemIndex = this.state.orderItems.findIndex(orderItem => {
                    if (!orderItem || (orderItem.notes && orderItem.notes.trim())) {
                        return false;
                    }
                    const existingSignature = this.getOptionsSignature(orderItem.item_options || orderItem.options);
                    return orderItem.item === line.item && existingSignature === signature;
                });

                if (existingItemIndex !== -1) {
                    const existingItem = this.state.orderItems[existingItemIndex];
                    const currentQty = Number(existingItem && existingItem.qty) || 0;
                    const incomingQty = Number(line.qty) || 0;
                    const updatedQty = currentQty + incomingQty;
                    const rate = Number(existingItem.rate) || 0;

                    existingItem.qty = updatedQty;
                    existingItem.amount = updatedQty * rate;
                } else {
                    this.state.orderItems.push(line);
                }

                this.updateOrderPanel();

                const promptIndex = existingItemIndex !== -1
                    ? existingItemIndex
                    : this.state.orderItems.length - 1;

                this.rememberItemSelection(itemName, line.item_options, line.notes);

                const targetItem = this.state.orderItems[promptIndex];
                const needsNotesPrompt = !(targetItem && targetItem.notes && targetItem.notes.trim());
                if (needsNotesPrompt) {
                    this.promptForNotes(promptIndex);
                }
            })
            .catch((error) => {
                console.error('Failed to add item to order', error);
                const message = (error && error.message) ? error.message : 'Failed to add item';
                this.showError(message);
            })
            .finally(() => {
                this.showLoading(false);
            });
    },

    cloneSelectionOptions: function(options) {
        if (!options) {
            return {};
        }

        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(options);
            } catch (error) {
                // Fallback to JSON cloning below
            }
        }

        try {
            return JSON.parse(JSON.stringify(options));
        } catch (error) {
            if (Array.isArray(options)) {
                return options.slice();
            }
            if (typeof options === 'object') {
                return Object.assign({}, options);
            }
            return {};
        }
    },

    ensureSelectionMemory: function() {
        if (!this.selectionMemory || typeof this.selectionMemory !== 'object') {
            this.selectionMemory = Object.create(null);
        }
        return this.selectionMemory;
    },

    rememberItemSelection: function(itemName, options = {}, notes = '') {
        if (!itemName) {
            return;
        }
        const store = this.ensureSelectionMemory();
        store[itemName] = {
            options: this.cloneSelectionOptions(options),
            notes: notes || ''
        };
    },

    getRememberedSelection: function(itemName) {
        if (!itemName) {
            return null;
        }
        const store = this.ensureSelectionMemory();
        return store[itemName] || null;
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
                    const cartItem = this.state.orderItems[itemIndex];
                    if (cartItem) {
                        cartItem.notes = notes;
                        this.rememberItemSelection(
                            cartItem.item || cartItem.item_code,
                            cartItem.item_options || cartItem.options,
                            notes
                        );
                    }

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
            const item = this.state.orderItems[index];
            const currentQty = Number(item && item.qty) || 0;

            if (currentQty > 1) {
                const nextQty = currentQty - 1;
                const rate = Number(item.rate) || 0;

                item.qty = nextQty;
                item.amount = nextQty * rate;

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
            const item = this.state.orderItems[index];
            const currentQty = Number(item && item.qty) || 0;
            const rate = Number(item.rate) || 0;
            const nextQty = currentQty + 1;

            item.qty = nextQty;
            item.amount = nextQty * rate;

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

            try {
                this.ensureAllSkusResolved(this.state.orderItems);
            } catch (error) {
                const message = (error && error.message) ? error.message : error;
                if (!silent) {
                    this.showError(message);
                }
                reject(message);
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
                    item_code: item.item,
                    template_item: item.template_item || null,
                    qty: item.qty,
                    rate: item.rate,
                    notes: item.notes,
                    item_options: item.item_options || item.options || {}
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
     * Parse counters field from POS Order Item
     * @param {Object|string|null} rawCounters - Raw counters value
     * @returns {Object} Parsed counters object
     */
    parseCounters: function(rawCounters) {
        if (!rawCounters) {
            return {};
        }

        if (typeof rawCounters === 'object' && !Array.isArray(rawCounters)) {
            return { ...rawCounters };
        }

        if (typeof rawCounters === 'string') {
            try {
                const parsed = JSON.parse(rawCounters);
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            } catch (error) {
                console.warn('Failed to parse counters for POS Order Item', error);
            }
        }

        return {};
    },

    /**
     * Normalize counters into a predictable lowercase-keyed object
     * @param {Object|string|null} rawCounters - Raw counters value
     * @returns {Object} Normalized counters
     */
    normalizeCounters: function(rawCounters) {
        if (rawCounters && typeof rawCounters === 'object' && rawCounters.__normalized) {
            return rawCounters;
        }

        const parsed = this.parseCounters(rawCounters);
        const normalized = {};

        if (Array.isArray(parsed)) {
            parsed.forEach(entry => {
                if (!entry) {
                    return;
                }

                const keySource = entry.key || entry.name || entry.state || entry.status;
                const value = this.getTimestampValue(entry.value || entry.timestamp || entry.time || entry.datetime || entry);
                if (!keySource || !value) {
                    return;
                }

                const normalizedKey = String(keySource).toLowerCase();
                normalized[normalizedKey] = value;
            });
        } else {
            Object.keys(parsed || {}).forEach(key => {
                if (!key) {
                    return;
                }

                const normalizedKey = String(key).toLowerCase();
                const value = this.getTimestampValue(parsed[key]);

                if (value) {
                    normalized[normalizedKey] = value;
                }
            });
        }

        Object.defineProperty(normalized, '__normalized', {
            value: true,
            enumerable: false,
            configurable: false,
        });

        return normalized;
    },

    /**
     * Extract a usable timestamp string from a counter value
     * @param {*} rawValue - Raw counter value
     * @returns {string|null} Timestamp string if available
     */
    getTimestampValue: function(rawValue) {
        if (!rawValue) {
            return null;
        }

        if (typeof rawValue === 'string' || typeof rawValue === 'number') {
            return String(rawValue);
        }

        if (typeof rawValue === 'object') {
            const possibleKeys = ['timestamp', 'time', 'datetime', 'date', 'value'];
            for (const key of possibleKeys) {
                if (rawValue[key]) {
                    return String(rawValue[key]);
                }
            }
        }

        return null;
    },

    /**
     * Determine kitchen status information from counters
     * @param {Object} counters - Parsed counters object
     * @returns {Object|null} Kitchen status data
     */
    getKitchenStatusFromCounters: function(counters) {
        if (!counters || typeof counters !== 'object') {
            return null;
        }

        const statusPriority = [
            { key: 'served', label: 'Served', className: 'served' },
            { key: 'ready', label: 'Ready', className: 'ready' },
            { key: 'preparing', label: 'In Progress', className: 'in-progress' },
            { key: 'sent', label: 'Queued', className: 'queued' },
            { key: 'cancelled', label: 'Cancelled', className: 'cancelled' }
        ];

        for (const status of statusPriority) {
            const value = counters[status.key] || counters[status.key.toUpperCase()];
            const timestamp = this.getTimestampValue(value);
            if (timestamp) {
                return {
                    label: status.label,
                    className: status.className,
                    timestamp,
                };
            }
        }

        return null;
    },

    /**
     * Format kitchen status timestamp into human readable time
     * @param {string|Object} timestamp - ISO timestamp or object containing timestamp
     * @returns {string} Formatted time string
     */
    formatKitchenStatusTime: function(timestamp) {
        const rawValue = this.getTimestampValue(timestamp);
        if (!rawValue) {
            return '';
        }

        try {
            const date = new Date(rawValue);
            if (Number.isNaN(date.getTime())) {
                return '';
            }

            return date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.warn('Failed to format kitchen status time', error);
            return '';
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
