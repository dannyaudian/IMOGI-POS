/**
 * IMOGI POS - Kiosk
 *
 * Main module for the Kiosk interface
 * Handles:
 * - Item catalog browsing
 * - Cart management
 * - Variant selection
 * - Payment processing
 * - Receipt printing
 * - Customer Display integration
 */

import './utils/options';

frappe.provide('imogi_pos.kiosk');

imogi_pos.kiosk = {
    // Settings and state
    settings: {
        posProfile: null,
        branch: null,
        posDomain: 'Restaurant',
        allowGuest: false,
        sessionTimeout: 180000, // 3 minutes
    },
    state: {
        cart: [],
        selectedItemGroup: null,
        catalogItems: [],
        itemGroups: [],
        currentVariantItem: null,
        activePaymentRequest: null,
        inactivityTimer: null,
        searchTerm: '',
        viewMode: 'catalog', // catalog, payment, receipt
        searchResults: []
    },

    selectionMemory: Object.create(null),
    
    /**
     * Initialize the Kiosk
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#kiosk',
            profileSelector: '#pos-profile-selector',
            branchSelector: '#branch-selector',
            sessionTimeout: 180000, // 3 minutes
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Kiosk container not found');
            return;
        }
        
        // Initialize components
        this.initializeNavigation();
        this.initializePOSProfile();
        this.loadSettings()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadCatalog();
                this.setupInactivityTimer();
            })
            .catch(err => {
                console.error('Failed to initialize Kiosk:', err);
                this.showError('Failed to initialize Kiosk. Please refresh the page.');
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
                    this.loadCatalog();
                },
                onProfileChange: (profile, details) => {
                    this.settings.posProfile = profile;
                    if (details) {
                        this.settings.posDomain = details.imogi_pos_domain || 'Restaurant';
                    }
                    this.loadSettings().then(() => this.loadCatalog());
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
            args: {
                mode: 'Kiosk'
            },
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
                    args: {
                        mode: 'Kiosk'
                    },
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

                        this.settings.sellingPriceList = profile.selling_price_list || null;
                        this.settings.basePriceList = (
                            profile.imogi_base_price_list ||
                            profile.base_price_list ||
                            null
                        );

                        // Set branch if available
                        if (profile.imogi_branch && !this.settings.branch) {
                            this.settings.branch = profile.imogi_branch;
                        }
                        
                        // Set kiosk specific settings
                        this.settings.allowGuest = profile.imogi_kiosk_allow_guest || false;
                        this.settings.sessionTimeout = (profile.imogi_kiosk_session_timeout || 3) * 60000; // Convert minutes to milliseconds
                        this.settings.allowNotes = profile.imogi_kiosk_allow_item_notes || false;
                        this.settings.cashlessOnly = profile.imogi_kiosk_cashless_only || false;
                        this.settings.printQueueTicket = profile.imogi_kiosk_print_queue_ticket || false;
                        this.settings.allowedItemGroups = profile.imogi_kiosk_allowed_item_groups || [];
                        
                        // Check if we need an active POS session
                        if (profile.imogi_require_pos_session && 
                            profile.imogi_enforce_session_on_kiosk &&
                            !this.settings.allowGuest) {
                            this.checkActivePOSSession();
                        }
                        
                        // Set printer settings
                        const printerInterface = profile.imogi_printer_cashier_interface || 'OS';
                        const interfaceConfig = {};

                        if (printerInterface === 'LAN') {
                            interfaceConfig.adapter_config = {
                                host: profile.imogi_printer_cashier || '',
                                port: profile.imogi_printer_port || 9100
                            };
                        } else if (printerInterface === 'Bluetooth') {
                            interfaceConfig.deviceName = profile.imogi_bt_cashier_device_name || profile.imogi_printer_cashier || '';
                            interfaceConfig.adapter_config = {
                                device_name: profile.imogi_bt_cashier_device_name || '',
                                vendor_profile: profile.imogi_bt_cashier_vendor_profile || 'ESC/POS',
                                retry_count: profile.imogi_bt_retry || 2
                            };

                            if (profile.imogi_print_bridge_url) {
                                interfaceConfig.adapter_config.bridge_url = profile.imogi_print_bridge_url;
                                interfaceConfig.adapter_config.bridge_token = profile.imogi_print_bridge_token;
                            }
                        }

                        this.settings.printerSettings = {
                            interface: printerInterface,
                            printerName: profile.imogi_printer_cashier || '',
                            receiptFormat: profile.imogi_receipt_format || 'POS Receipt',
                            queueFormat: profile.imogi_queue_format || 'Queue Ticket',
                            printNotesOnReceipt: profile.imogi_print_notes_on_kiosk_receipt !== 0
                        };

                        // Load print service if available
                        if (window.IMOGIPrintService) {
                            IMOGIPrintService.init({
                                defaultInterface: printerInterface,
                                interfaces: {
                                    [printerInterface]: interfaceConfig
                                },
                                autoDetect: false
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
     * Show modal with options to continue shopping or view cart
     */
    showCartPrompt: function() {
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Item Added</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>What would you like to do next?</p>
                    </div>
                    <div class="modal-footer">
                        <button id="continue-shopping-btn" class="modal-button">Continue Shopping</button>
                        <button id="view-cart-btn" class="modal-button primary">View Cart</button>
                    </div>
                </div>
            </div>`;

        modalContainer.classList.add('active');

        const close = () => modalContainer.classList.remove('active');

        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);

        const continueBtn = modalContainer.querySelector('#continue-shopping-btn');
        if (continueBtn) continueBtn.addEventListener('click', close);

        const viewCartBtn = modalContainer.querySelector('#view-cart-btn');
        if (viewCartBtn) {
            viewCartBtn.addEventListener('click', () => {
                const cartSection = this.container.querySelector('.kiosk-cart');
                if (cartSection) {
                    cartSection.scrollIntoView({ behavior: 'smooth' });
                    const checkoutBtn = cartSection.querySelector('#checkout-btn');
                    if (checkoutBtn) checkoutBtn.focus();
                }
                close();
            });
        }
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
     * Set up inactivity timer
     */
    setupInactivityTimer: function() {
        // Clear any existing timer
        if (this.state.inactivityTimer) {
            clearTimeout(this.state.inactivityTimer);
        }
        
        // Set up new timer
        this.resetInactivityTimer();
        
        // Add event listeners to reset timer on activity
        ['click', 'touchstart', 'mousemove', 'keypress'].forEach(event => {
            document.addEventListener(event, () => {
                this.resetInactivityTimer();
            });
        });
    },
    
    /**
     * Reset inactivity timer
     */
    resetInactivityTimer: function() {
        // Clear existing timer
        if (this.state.inactivityTimer) {
            clearTimeout(this.state.inactivityTimer);
        }
        
        // Set new timer
        this.state.inactivityTimer = setTimeout(() => {
            this.handleInactivity();
        }, this.settings.sessionTimeout);
    },
    
    /**
     * Handle inactivity timeout
     */
    handleInactivity: function() {
        // Only reset if cart has items
        if (this.state.cart.length > 0) {
            // Show confirmation dialog
            this.showConfirmDialog(
                'Session Timeout',
                'Your session has timed out due to inactivity. Would you like to continue or reset?',
                'Continue',
                'Reset Session',
                () => {
                    // Continue - just reset the timer
                    this.resetInactivityTimer();
                },
                () => {
                    // Reset session
                    this.resetSession();
                }
            );
        }
    },
    
    /**
     * Reset the session
     */
    resetSession: function() {
        // Clear cart
        this.state.cart = [];
        
        // Update UI
        this.renderCart();
        
        // Return to catalog view
        this.switchView('catalog');
        
        // Reset timer
        this.resetInactivityTimer();
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        this.container.innerHTML = `
            <div class="kiosk-layout">
                <div class="kiosk-sidebar">
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
                
                <div class="kiosk-main">
                    <div class="kiosk-content">
                        <div id="catalog-view" class="kiosk-view ${this.state.viewMode === 'catalog' ? '' : 'hidden'}">
                            <div class="catalog-items" id="catalog-items">
                                <div class="loading-container">Loading items...</div>
                            </div>
                        </div>
                        
                        <div id="payment-view" class="kiosk-view ${this.state.viewMode === 'payment' ? '' : 'hidden'}">
                            <div class="payment-container" id="payment-container">
                                <div class="payment-header">
                                    <h3>Payment</h3>
                                </div>
                                <div class="payment-content" id="payment-content">
                                    <div class="loading-container">Preparing payment...</div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="receipt-view" class="kiosk-view ${this.state.viewMode === 'receipt' ? '' : 'hidden'}">
                            <div class="receipt-container" id="receipt-container">
                                <div class="receipt-header">
                                    <h3>Receipt</h3>
                                </div>
                                <div class="receipt-content" id="receipt-content">
                                    <div class="loading-container">Preparing receipt...</div>
                                </div>
                                <div class="receipt-actions">
                                    <button id="new-order-btn" class="action-button primary">New Order</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="kiosk-cart">
                        <div class="cart-header">
                            <h3>Your Order</h3>
                            <button id="clear-cart-btn" class="small-button" ${this.state.cart.length === 0 ? 'disabled' : ''}>
                                <i class="fa fa-trash"></i> Clear
                            </button>
                        </div>
                        <div class="cart-items" id="cart-items">
                            <div class="empty-cart">
                                <i class="fa fa-shopping-cart empty-icon"></i>
                                <p>Your cart is empty</p>
                            </div>
                        </div>
                        <div class="cart-totals" id="cart-totals">
                            <div class="total-row">
                                <div class="total-label">Subtotal</div>
                                <div class="total-value">$0.00</div>
                            </div>
                            <div class="total-row grand-total">
                                <div class="total-label">Total</div>
                                <div class="total-value">$0.00</div>
                            </div>
                        </div>
                        <div class="cart-actions">
                            <button id="checkout-btn" class="action-button primary" disabled>
                                Checkout <span class="total-badge">$0.00</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="modal-container" class="modal-container"></div>
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Initial rendering
        this.renderCart();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
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
        
        // Clear cart button
        const clearCartBtn = this.container.querySelector('#clear-cart-btn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }
        
        // Checkout button
        const checkoutBtn = this.container.querySelector('#checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => {
                this.checkout();
            });
        }
        
        // New order button
        const newOrderBtn = this.container.querySelector('#new-order-btn');
        if (newOrderBtn) {
            newOrderBtn.addEventListener('click', () => {
                this.resetSession();
            });
        }
    },
    
    /**
     * Switch between different views
     * @param {string} viewMode - View mode to switch to
     */
    switchView: function(viewMode) {
        this.state.viewMode = viewMode;
        
        // Show/hide views
        this.container.querySelector('#catalog-view').classList.toggle('hidden', viewMode !== 'catalog');
        this.container.querySelector('#payment-view').classList.toggle('hidden', viewMode !== 'payment');
        this.container.querySelector('#receipt-view').classList.toggle('hidden', viewMode !== 'receipt');
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
                pos_profile: this.settings.posProfile,
                allowed_groups: this.settings.allowedItemGroups
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
                item_group: this.state.selectedItemGroup,
                allowed_groups: this.settings.allowedItemGroups
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
            const variantIndicator = hasVariants
                ? `<span class="item-variant-indicator"><i class="fa fa-list variant-icon"></i></span>`
                : '';
            const description = item.description ? `<div class="item-desc">${item.description}</div>` : '';

            html += `
                <div class="catalog-item ${itemClass}" data-item="${item.name}" data-has-variants="${hasVariants ? 1 : 0}">
                    ${item.image ? `<div class="item-image"><img src="${item.image}" alt="${item.item_name}"></div>` : ''}
                    <div class="item-details">
                        <div class="item-header">
                            <div class="item-name">${item.item_name}</div>
                            ${variantIndicator}
                        </div>
                        <div class="item-body">
                            ${description}
                            <div class="item-price">${this.formatCurrency(item.rate || 0)}</div>
                        </div>
                    </div>
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
            this.addItemToCart(itemName, clonedOptions, 1, notes);
            return;
        }

        frappe.call({
            method: 'imogi_pos.api.items.get_item_options',
            args: { item: itemName },
            callback: (r) => {
                const data = r.message || {};
                if (Object.keys(data).length === 0) {
                    this.addItemToCart(itemName);
                } else {
                    this.showItemOptionsModal(itemName, data);
                }
            },
            error: () => {
                this.addItemToCart(itemName);
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

        const catalogItem = this.state.catalogItems.find(item => item.name === itemName);
        let itemHeaderData = {
            image: catalogItem ? catalogItem.image : '',
            name: catalogItem ? (catalogItem.item_name || itemName) : itemName,
            description: catalogItem
                ? (catalogItem.short_description || catalogItem.description || '')
                : ''
        };

        const headerHtml = `
            <div class="modal-item-header">
                <div class="modal-item-image" data-modal-item-image></div>
                <div class="modal-item-info">
                    <div class="modal-item-name" data-modal-item-name></div>
                    <div class="modal-item-desc" data-modal-item-desc></div>
                </div>
            </div>
        `;

        const escapeAttr = (value) => {
            if (!value) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        const applyHeaderData = (data) => {
            const headerImageEl = modalContainer.querySelector('[data-modal-item-image]');
            const headerNameEl = modalContainer.querySelector('[data-modal-item-name]');
            const headerDescEl = modalContainer.querySelector('[data-modal-item-desc]');

            const resolvedName = data && data.name ? data.name : itemName;
            if (headerNameEl) {
                headerNameEl.textContent = resolvedName;
            }

            if (headerImageEl) {
                if (data && data.image) {
                    headerImageEl.innerHTML = `<img src="${data.image}" alt="${escapeAttr(resolvedName)}">`;
                    headerImageEl.style.display = '';
                } else {
                    headerImageEl.innerHTML = '';
                    headerImageEl.style.display = 'none';
                }
            }

            if (headerDescEl) {
                if (data && data.description) {
                    headerDescEl.innerHTML = data.description;
                    headerDescEl.style.display = '';
                } else {
                    headerDescEl.innerHTML = '';
                    headerDescEl.style.display = 'none';
                }
            }
        };

        let fieldsHtml = '';
        Object.entries(optionsData).forEach(([field, choices]) => {
            if (!Array.isArray(choices)) return;
            if (!['size', 'spice', 'topping', 'sugar', 'ice', 'variant'].includes(field)) return;

            const title = this.toTitleCase(field);
            const isTopping = field === 'topping';
            const optionType = isTopping ? 'checkbox' : 'radio';
            const requiredAttr = isTopping ? '' : ' data-required="1"';

            fieldsHtml += `
                <div class="option-group" data-option="${field}"${requiredAttr}>
                    <div class="option-group-title">${title}</div>
                    <div class="option-cards">
                        ${choices.map((opt, index) => {
                            const { label, value, price = 0, default: isDefault, linked_item: linkedItem } = opt;
                            const optionId = `option-${field}-${index}`;
                            const rawPrice = parseFloat(price);
                            const priceValue = Number.isFinite(rawPrice) ? rawPrice : 0;
                            const priceDisplay = priceValue ? `<span class="option-card-price">+${this.formatCurrency(priceValue)}</span>` : '';
                            const checkedAttr = isDefault ? ' checked' : '';
                            const nameAttr = isTopping ? `option-${field}[]` : `option-${field}`;
                            const linkedAttr = linkedItem ? ` data-linked-item="${escapeAttr(linkedItem)}"` : '';
                            const labelAttr = label ? ` data-label="${escapeAttr(label)}"` : '';
                            return `
                                <div class="option-card-wrapper">
                                    <input type="${optionType}" id="${optionId}" class="option-input" name="${nameAttr}" data-option="${field}" value="${value}" data-price="${priceValue}"${linkedAttr}${labelAttr}${checkedAttr}>
                                    <label for="${optionId}" class="option-card">
                                        <span class="option-card-label">${label}</span>
                                        ${priceDisplay}
                                    </label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        const quantityControlHtml = `
            <div class="option-group quantity-group">
                <div class="option-group-title">Quantity</div>
                <div class="quantity-control">
                    <button type="button" class="quantity-btn" data-change="-1">-</button>
                    <input type="number" class="quantity-input" min="1" value="1">
                    <button type="button" class="quantity-btn" data-change="1">+</button>
                </div>
            </div>
        `;

        const notesFieldHtml = this.settings.allowNotes ? `
            <div class="option-group notes-group">
                <div class="option-group-title">Special Instructions</div>
                <textarea class="item-notes" placeholder="Any special instructions for this item?"></textarea>
            </div>
        ` : '';

        const summaryHtml = `
            <div class="option-summary">
                <div class="summary-row">
                    <span>Base Price</span>
                    <span class="summary-value" data-summary="base">--</span>
                </div>
                <div class="summary-row">
                    <span>Option Surcharge</span>
                    <span class="summary-value" data-summary="options">${this.formatCurrency(0)}</span>
                </div>
                <div class="summary-row">
                    <span>Quantity</span>
                    <span class="summary-value" data-summary="quantity">1</span>
                </div>
                <div class="summary-row summary-total">
                    <span>Total</span>
                    <span class="summary-value" data-summary="total">--</span>
                </div>
            </div>
        `;

        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Options</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">${fieldsHtml}${quantityControlHtml}${notesFieldHtml}</div>
                    <div class="option-footer">
                        ${summaryHtml}
                        <button type="button" class="modal-confirm btn btn-primary btn-lg">Add</button>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-cancel">Cancel</button>
                    </div>
                </div>
            </div>`;

        modalContainer.classList.add('active');

        applyHeaderData(itemHeaderData);

        const close = () => modalContainer.classList.remove('active');
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        const cancelBtn = modalContainer.querySelector('.modal-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', close);

        const quantityInput = modalContainer.querySelector('.quantity-input');
        const quantityButtons = modalContainer.querySelectorAll('.quantity-btn');
        const confirmBtn = modalContainer.querySelector('.modal-confirm');
        const notesInput = modalContainer.querySelector('.item-notes');
        const optionInputs = modalContainer.querySelectorAll('.option-input');
        const optionGroups = modalContainer.querySelectorAll('.option-group[data-option]');
        const summaryBaseEl = modalContainer.querySelector('[data-summary="base"]');
        const summaryOptionEl = modalContainer.querySelector('[data-summary="options"]');
        const summaryQtyEl = modalContainer.querySelector('[data-summary="quantity"]');
        const summaryTotalEl = modalContainer.querySelector('[data-summary="total"]');

        let basePrice = 0;
        let hasBasePrice = false;

        const parsePrice = (value) => {
            const price = parseFloat(value);
            return isNaN(price) ? 0 : price;
        };

        const getQuantity = () => {
            if (!quantityInput) return 1;
            let value = parseInt(quantityInput.value, 10);
            if (isNaN(value) || value < 1) {
                value = 1;
            }
            if (quantityInput.value !== String(value)) {
                quantityInput.value = value;
            }
            return value;
        };

        const computeOptionSurcharge = () => {
            let total = 0;
            optionInputs.forEach(input => {
                if (input.checked) {
                    total += parsePrice(input.dataset.price);
                }
            });
            return total;
        };

        const buildOptionPayload = (value, label, linkedItem, priceValue) => {
            if (value === undefined || value === null || value === '') {
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

        const updateSummary = () => {
            const optionPrice = computeOptionSurcharge();
            const qty = getQuantity();

            if (summaryBaseEl) {
                summaryBaseEl.textContent = hasBasePrice ? this.formatCurrency(basePrice) : '--';
            }
            if (summaryOptionEl) {
                summaryOptionEl.textContent = this.formatCurrency(optionPrice);
            }
            if (summaryQtyEl) {
                summaryQtyEl.textContent = qty;
            }
            if (summaryTotalEl) {
                const total = (basePrice + optionPrice) * qty;
                summaryTotalEl.textContent = hasBasePrice ? this.formatCurrency(total) : '--';
            }
            if (confirmBtn) {
                const total = (basePrice + optionPrice) * qty;
                confirmBtn.textContent = hasBasePrice ? `Add ${this.formatCurrency(total)}` : 'Add';
            }
        };

        // Remove error highlight when changing selection and keep summary in sync
        optionInputs.forEach(input => {
            input.addEventListener('change', () => {
                const group = input.closest('.option-group');
                if (group) {
                    group.classList.remove('option-group-error');
                }
                updateSummary();
            });
        });

        quantityButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const change = parseInt(btn.dataset.change, 10) || 0;
                const current = getQuantity();
                let next = current + change;
                if (next < 1) next = 1;
                if (quantityInput) {
                    quantityInput.value = next;
                }
                updateSummary();
            });
        });

        if (quantityInput) {
            ['change', 'input'].forEach(evt => {
                quantityInput.addEventListener(evt, () => {
                    updateSummary();
                });
            });
        }

        const catalogItem = this.state.catalogItems.find(item => item.name === itemName);
        if (catalogItem && typeof catalogItem.rate !== 'undefined') {
            basePrice = parsePrice(catalogItem.rate);
            hasBasePrice = true;
        }

        updateSummary();

        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'Item',
                filters: { name: itemName },
                fieldname: ['standard_rate', 'image', 'item_name', 'short_description', 'description']
            },
            callback: (resp) => {
                if (resp && resp.message) {
                    const info = resp.message;
                    if (typeof info.standard_rate !== 'undefined') {
                        basePrice = parsePrice(info.standard_rate);
                        hasBasePrice = true;
                    }

                    itemHeaderData = {
                        image: info.image || itemHeaderData.image || '',
                        name: info.item_name || itemHeaderData.name || itemName,
                        description: (info.short_description || info.description || itemHeaderData.description || '')
                    };

                    applyHeaderData(itemHeaderData);
                    updateSummary();
                }
            }
        });

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const selectedOptions = {};
                let optionPrice = 0;
                const missing = [];

                optionGroups.forEach(group => {
                    const key = group.dataset.option;
                    const required = group.dataset.required === '1';
                    const inputs = group.querySelectorAll('.option-input');
                    const selected = Array.from(inputs).filter(input => input.checked);

                    group.classList.remove('option-group-error');

                    if (required && selected.length === 0) {
                        missing.push(this.toTitleCase(key));
                        group.classList.add('option-group-error');
                        return;
                    }

                    if (selected.length === 0) {
                        return;
                    }

                    if (selected[0].type === 'checkbox') {
                        const values = selected.map(input => {
                            const price = parsePrice(input.dataset.price);
                            optionPrice += price;
                            const linkedItem = input.dataset.linkedItem || '';
                            const optionLabel = input.dataset.label || '';
                            return buildOptionPayload(input.value, optionLabel, linkedItem, price) || input.value;
                        }).filter(Boolean);
                        if (values.length) {
                            selectedOptions[key] = values;
                        }
                    } else {
                        const input = selected[0];
                        const price = parsePrice(input.dataset.price);
                        optionPrice += price;
                        const linkedItem = input.dataset.linkedItem || '';
                        const optionLabel = input.dataset.label || '';
                        selectedOptions[key] = buildOptionPayload(input.value, optionLabel, linkedItem, price) || input.value;
                    }
                });

                if (missing.length) {
                    this.showError('Please select: ' + missing.join(', '));
                    return;
                }

                const qty = getQuantity();

                const finalizeAdd = () => {
                    const totalPrice = (basePrice + optionPrice) * qty;
                    selectedOptions.price = optionPrice;
                    const message = hasBasePrice
                        ? `Total: ${this.formatCurrency(totalPrice)}`
                        : `Estimated total: ${this.formatCurrency(totalPrice)}`;
                    this.showToast(message);
                    const notes = notesInput ? notesInput.value.trim() : '';
                    this.addItemToCart(itemName, selectedOptions, qty, notes);
                    close();
                };

                const ensureBasePrice = () => {
                    if (hasBasePrice) {
                        finalizeAdd();
                        return;
                    }
                    frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { name: itemName },
                            fieldname: ['standard_rate']
                        },
                        callback: (resp) => {
                            if (resp && resp.message) {
                                basePrice = parsePrice(resp.message.standard_rate);
                                hasBasePrice = true;
                                updateSummary();
                            }
                            finalizeAdd();
                        },
                        error: finalizeAdd
                    });
                };

                ensureBasePrice();
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
        return {
            qty,
            priceList: this.settings.sellingPriceList || null,
            basePriceList: this.settings.basePriceList || null,
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
     * Add item to cart
     * @param {string} itemName - Item name to add
     * @param {Object} [options] - Selected options
     * @param {number} [quantity=1] - Quantity to add
     * @param {string} [notes=''] - Notes for the item
     */
    addItemToCart: function(itemName, options = {}, quantity = 1, notes = '') {
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
        const itemNotes = (notes || '').trim();

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
        };

        const context = this.buildPricingContext({
            itemCode: itemName,
            qty,
            itemDetails,
        });

        resolver(line, options, context)
            .then(() => {
                const signature = this.getOptionsSignature(line.item_options);
                const existingItemIndex = this.state.cart.findIndex(cartItem => {
                    if (!cartItem) {
                        return false;
                    }
                    const existingSignature = this.getOptionsSignature(cartItem.item_options || cartItem.options);
                    return (
                        cartItem.item === line.item &&
                        (cartItem.notes || '') === itemNotes &&
                        existingSignature === signature
                    );
                });

                if (existingItemIndex !== -1) {
                    const existingItem = this.state.cart[existingItemIndex];
                    const currentQty = Number(existingItem && existingItem.qty) || 0;
                    const incomingQty = Number(line.qty) || 0;
                    const updatedQty = currentQty + incomingQty;

                    existingItem.qty = updatedQty;
                    const rate = Number(existingItem.rate) || 0;
                    existingItem.amount = updatedQty * rate;
                } else {
                    this.state.cart.push(line);
                }

                this.renderCart();
                this.showToast('Item added to cart');
                this.showToast(`${line.item_name} added to cart`);
                this.showCartPrompt();
                this.rememberItemSelection(itemName, line.item_options, itemNotes);
            })
            .catch((error) => {
                console.error('Failed to add item to cart', error);
                const message = (error && error.message) ? error.message : 'Failed to add item';
                this.showError(message);
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
     * Prompt for item notes
     * @param {number} itemIndex - Index of item in cart
     */
    promptForNotes: function(itemIndex) {
        // Show modal for notes
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        const item = this.state.cart[itemIndex];
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
                    const cartItem = this.state.cart[itemIndex];
                    if (cartItem) {
                        cartItem.notes = notes;
                        this.rememberItemSelection(
                            cartItem.item || cartItem.item_code,
                            cartItem.item_options || cartItem.options,
                            notes
                        );
                    }

                    // Update UI
                    this.renderCart();
                }
                
                // Close modal
                modalContainer.classList.remove('active');
            });
        }
    },
    
    /**
     * Render the cart
     */
    renderCart: function() {
        const cartItems = this.container.querySelector('#cart-items');
        const cartTotals = this.container.querySelector('#cart-totals');
        const checkoutBtn = this.container.querySelector('#checkout-btn');
        const clearCartBtn = this.container.querySelector('#clear-cart-btn');
        
        if (!cartItems || !cartTotals || !checkoutBtn || !clearCartBtn) return;
        
        // Enable/disable buttons based on cart state
        clearCartBtn.disabled = this.state.cart.length === 0;
        checkoutBtn.disabled = this.state.cart.length === 0;
        
        if (this.state.cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fa fa-shopping-cart empty-icon"></i>
                    <p>Your cart is empty</p>
                </div>
            `;
            
            cartTotals.innerHTML = `
                <div class="total-row">
                    <div class="total-label">Subtotal</div>
                    <div class="total-value">${this.formatCurrency(0)}</div>
                </div>
                <div class="total-row grand-total">
                    <div class="total-label">Total</div>
                    <div class="total-value">${this.formatCurrency(0)}</div>
                </div>
            `;
            
            checkoutBtn.innerHTML = `Checkout <span class="total-badge">${this.formatCurrency(0)}</span>`;
            
            return;
        }
        
        // Calculate totals
        const subtotal = this.state.cart.reduce((sum, item) => sum + item.amount, 0);
        
        // Render cart items
        let html = '';
        this.state.cart.forEach((item, index) => {
            html += `
                <div class="cart-item">
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
                    ` : this.settings.allowNotes ? `
                        <div class="item-notes-placeholder">
                            <button class="add-notes-btn" data-index="${index}">
                                <i class="fa fa-plus"></i> Add Notes
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        cartItems.innerHTML = html;
        
        // Render totals
        cartTotals.innerHTML = `
            <div class="total-row">
                <div class="total-label">Subtotal</div>
                <div class="total-value">${this.formatCurrency(subtotal)}</div>
            </div>
            <div class="total-row grand-total">
                <div class="total-label">Total</div>
                <div class="total-value">${this.formatCurrency(subtotal)}</div>
            </div>
        `;
        
        // Update checkout button
        checkoutBtn.innerHTML = `Checkout <span class="total-badge">${this.formatCurrency(subtotal)}</span>`;
        
        // Bind cart item events
        this.bindCartItemEvents();
    },
    
    /**
     * Bind cart item events
     */
    bindCartItemEvents: function() {
        // Remove buttons
        this.container.querySelectorAll('.item-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = parseInt(button.dataset.index);
                this.removeCartItem(index);
            });
        });
        
        // Quantity decrease buttons
        this.container.querySelectorAll('.qty-decrease').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.decreaseCartItemQty(index);
            });
        });
        
        // Quantity increase buttons
        this.container.querySelectorAll('.qty-increase').forEach(button => {
            button.addEventListener('click', () => {
                const index = parseInt(button.dataset.index);
                this.increaseCartItemQty(index);
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
     * Remove item from cart
     * @param {number} index - Index of item to remove
     */
    removeCartItem: function(index) {
        if (index >= 0 && index < this.state.cart.length) {
            this.state.cart.splice(index, 1);
            this.renderCart();
        }
    },
    
    /**
     * Decrease cart item quantity
     * @param {number} index - Index of item to decrease
     */
    decreaseCartItemQty: function(index) {
        if (index >= 0 && index < this.state.cart.length) {
            const item = this.state.cart[index];
            const currentQty = Number(item && item.qty) || 0;

            if (currentQty > 1) {
                const nextQty = currentQty - 1;
                const rate = Number(item.rate) || 0;

                item.qty = nextQty;
                item.amount = nextQty * rate;
                this.renderCart();
            } else {
                // If quantity would go below 1, remove the item
                this.removeCartItem(index);
            }
        }
    },
    
    /**
     * Increase cart item quantity
     * @param {number} index - Index of item to increase
     */
    increaseCartItemQty: function(index) {
        if (index >= 0 && index < this.state.cart.length) {
            const item = this.state.cart[index];
            const currentQty = Number(item && item.qty) || 0;
            const rate = Number(item && item.rate) || 0;
            const nextQty = currentQty + 1;

            item.qty = nextQty;
            item.amount = nextQty * rate;
            this.renderCart();
        }
    },
    
    /**
     * Clear the cart
     */
    clearCart: function() {
        if (this.state.cart.length === 0) return;
        
        // Confirm before clearing
        this.showConfirmDialog(
            'Clear Cart',
            'Are you sure you want to clear your cart?',
            'Clear Cart',
            'Cancel',
            () => {
                this.state.cart = [];
                this.renderCart();
            }
        );
    },
    
    /**
     * Proceed to checkout
     */
    checkout: function() {
        if (this.state.cart.length === 0) {
            this.showError('Your cart is empty');
            return;
        }

        try {
            this.ensureAllSkusResolved(this.state.cart);
        } catch (error) {
            const message = (error && error.message) ? error.message : error;
            this.showError(message);
            return;
        }

        // Show loading indicator
        this.showLoading(true, 'Processing your order...');

        // Create POS Order
        const payloadItems = this.state.cart.map(item => {
            const itemOptions = item.item_options || item.options || {};
            return Object.assign({}, item, { item_options: itemOptions });
        });

        frappe.call({
            method: 'imogi_pos.api.orders.create_order',
            args: {
                pos_profile: this.settings.posProfile,
                branch: this.settings.branch,
                order_type: 'Kiosk',
                items: payloadItems
            },
            callback: (response) => {
                if (response.message && response.message.name) {
                    // Store POS Order item row names for KOT
                    this.kotItemRows = (response.message.items || []).map(item => item.name);

                    // Generate invoice with chosen payment mode
                    const mop = prompt('Enter payment mode (e.g., Cash, Card, Online)', 'Cash');
                    this.generateInvoice(response.message.name, mop || 'Cash');
                } else {
                    this.showLoading(false);
                    this.showError('Failed to create order');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to create order');
            }
        });
    },
    
    /**
     * Generate invoice for order
     * @param {string} orderName - POS Order name
     */
    generateInvoice: function(orderName, modeOfPayment = 'Cash') {
        const amount = this.state.cart.reduce((sum, item) => sum + (item.amount || 0), 0);
        frappe.call({
            method: 'imogi_pos.api.billing.generate_invoice',
            args: {
                pos_order: orderName,
                pos_profile: this.settings.posProfile,
                mode_of_payment: modeOfPayment,
                amount: amount
            },
            callback: (response) => {
                if (response.message && response.message.name) {
                    // If cashless only, request payment
                    if (this.settings.cashlessOnly) {
                        this.requestPayment(response.message.name);
                    } else {
                        // Otherwise show payment options
                        this.showPaymentOptions(orderName, response.message.name);
                    }
                } else {
                    this.showLoading(false);
                    this.showError('Failed to generate invoice');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to generate invoice');
            }
        });
    },
    
    /**
     * Show payment options
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     */
    showPaymentOptions: function(orderName, invoiceName) {
        this.showLoading(false);
        
        // Show payment options modal
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Payment Options</h3>
                    </div>
                    <div class="modal-body">
                        <div class="payment-options">
                            <div class="payment-option" data-method="cash">
                                <i class="fa fa-money-bill payment-icon"></i>
                                <div class="payment-option-name">Cash</div>
                            </div>
                            <div class="payment-option" data-method="card">
                                <i class="fa fa-credit-card payment-icon"></i>
                                <div class="payment-option-name">Card</div>
                            </div>
                            <div class="payment-option" data-method="online">
                                <i class="fa fa-qrcode payment-icon"></i>
                                <div class="payment-option-name">Online Payment</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        modalContainer.classList.add('active');
        
        // Bind payment option events
        modalContainer.querySelectorAll('.payment-option').forEach(option => {
            option.addEventListener('click', () => {
                const method = option.dataset.method;
                
                // Close modal
                modalContainer.classList.remove('active');
                
                // Process payment based on method
                switch (method) {
                    case 'cash':
                        this.processCashPayment(orderName, invoiceName);
                        break;
                    case 'card':
                        this.processCardPayment(orderName, invoiceName);
                        break;
                    case 'online':
                        this.requestPayment(invoiceName);
                        break;
                }
            });
        });
    },
    
    /**
     * Process cash payment
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     */
    processCashPayment: function(orderName, invoiceName) {
        // Get invoice details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Sales Invoice',
                name: invoiceName
            },
            callback: (response) => {
                if (response.message) {
                    const invoice = response.message;
                    const grandTotal = invoice.grand_total || 0;
                    
                    // Show cash payment modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (!modalContainer) return;
                    
                    modalContainer.innerHTML = `
                        <div class="modal-overlay">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3>Cash Payment</h3>
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
                                </div>
                            </div>
                        </div>
                    `;
                    
                    // Show modal
                    modalContainer.classList.add('active');
                    
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
                            
                            // Close modal
                            modalContainer.classList.remove('active');
                            
                            // Submit payment
                            this.submitCashPayment(orderName, invoiceName, cashAmount);
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
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     * @param {number} cashAmount - Cash amount received
     */
    submitCashPayment: function(orderName, invoiceName, cashAmount) {
        // Show loading indicator
        this.showLoading(true, 'Processing payment...');
        
        // Process payment
        frappe.call({
            method: 'imogi_pos.api.billing.process_cash_payment',
            args: {
                sales_invoice: invoiceName,
                amount: cashAmount,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    // Complete the order process
                    this.finalizeOrder(orderName, invoiceName);
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
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     */
    processCardPayment: function(orderName, invoiceName) {
        // Get invoice details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Sales Invoice',
                name: invoiceName
            },
            callback: (response) => {
                if (response.message) {
                    const invoice = response.message;
                    const grandTotal = invoice.grand_total || 0;
                    
                    // Show card payment modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (!modalContainer) return;
                    
                    modalContainer.innerHTML = `
                        <div class="modal-overlay">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3>Card Payment</h3>
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
                                </div>
                            </div>
                        </div>
                    `;
                    
                    // Show modal
                    modalContainer.classList.add('active');
                    
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
                            
                            // Validate reference
                            if (!reference) {
                                this.showError('Please enter a card reference');
                                return;
                            }
                            
                            // Close modal
                            modalContainer.classList.remove('active');
                            
                            // Submit payment
                            this.submitCardPayment(orderName, invoiceName, reference);
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
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     * @param {string} reference - Card reference/authorization
     */
    submitCardPayment: function(orderName, invoiceName, reference) {
        // Show loading indicator
        this.showLoading(true, 'Processing payment...');
        
        // Process payment
        frappe.call({
            method: 'imogi_pos.api.billing.process_card_payment',
            args: {
                sales_invoice: invoiceName,
                reference: reference,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    // Complete the order process
                    this.finalizeOrder(orderName, invoiceName);
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
     * Request online payment
     * @param {string} invoiceName - Sales Invoice name
     */
    requestPayment: function(invoiceName) {
        // Switch to payment view
        this.switchView('payment');
        
        // Show loading
        const paymentContent = this.container.querySelector('#payment-content');
        if (paymentContent) {
            paymentContent.innerHTML = `<div class="loading-container">Preparing payment request...</div>`;
        }
        
        // Request payment
        frappe.call({
            method: 'imogi_pos.api.billing.request_payment',
            args: {
                sales_invoice: invoiceName,
                pos_profile: this.settings.posProfile
            },
            callback: (response) => {
                if (response.message && response.message.payment_request) {
                    this.state.activePaymentRequest = response.message.payment_request;
                    this.renderPaymentRequest(response.message);
                    
                    // Show on customer display if available
                    this.showOnCustomerDisplay(response.message);
                    
                    // Set up payment listener
                    this.setupPaymentListener(response.message);
                } else {
                    this.showError('Failed to create payment request');
                    this.switchView('catalog');
                }
            },
            error: () => {
                this.showError('Failed to create payment request');
                this.switchView('catalog');
            }
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
                    <img src="${paymentData.qr_image}"
                 class="payment-qr" alt="Payment QR Code">
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
                    <button id="cancel-payment-btn" class="action-button">Cancel Payment</button>
                </div>
            </div>
        `;
        
        // Bind cancel button
        const cancelBtn = paymentContent.querySelector('#cancel-payment-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.cancelPayment();
            });
        }
    },
    
    /**
     * Set up payment listener
     * @param {Object} paymentData - Payment request data
     */
    setupPaymentListener: function(paymentData) {
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
        
        // Get sales invoice from payment data
        const invoiceName = data.sales_invoice;
        if (!invoiceName) {
            this.showError('Missing invoice information');
            return;
        }
        
        // Get order name from the invoice
        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'Sales Invoice',
                filters: { name: invoiceName },
                fieldname: 'imogi_pos_order'
            },
            callback: (response) => {
                if (response.message && response.message.imogi_pos_order) {
                    const orderName = response.message.imogi_pos_order;
                    
                    // Finalize the order
                    this.finalizeOrder(orderName, invoiceName);
                } else {
                    this.showError('Failed to get order information');
                }
            },
            error: () => {
                this.showError('Failed to get order information');
            }
        });
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
     * Cancel payment
     */
    cancelPayment: function() {
        this.state.activePaymentRequest = null;
        this.switchView('catalog');
    },
    
    /**
     * Show payment QR on customer display
     * @param {Object} paymentData - Payment request data
     */
    showOnCustomerDisplay: function(paymentData) {
        if (!paymentData || !paymentData.payment_request) {
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
                }
            }
        });
    },
    
    /**
     * Finalize order after payment
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     */
    finalizeOrder: function(orderName, invoiceName) {
        // Send items to kitchen
        frappe.call({
            method: 'imogi_pos.api.kot.send_items_to_kitchen',
            args: {
                pos_order: orderName,
                item_rows: this.kotItemRows || []
            },
            callback: (response) => {
                // Print receipt
                if (window.IMOGIPrintService && this.settings.printerSettings) {
                    IMOGIPrintService.printReceipt(
                        invoiceName,
                        this.settings.posProfile
                    ).then(() => {
                        this.showToast('Receipt printed successfully');
                    }).catch(error => {
                        console.error('Failed to print receipt:', error);
                    });
                    
                    // Print queue ticket if enabled
                    if (this.settings.printQueueTicket) {
                        IMOGIPrintService.printQueueTicket(
                            orderName,
                            this.settings.posProfile
                        ).catch(error => {
                            console.error('Failed to print queue ticket:', error);
                        });
                    }
                }
                
                // Show receipt
                this.showReceipt(orderName, invoiceName);
            }
        });
    },
    
    /**
     * Show receipt after order is complete
     * @param {string} orderName - POS Order name
     * @param {string} invoiceName - Sales Invoice name
     */
    showReceipt: function(orderName, invoiceName) {
        // Switch to receipt view
        this.switchView('receipt');
        
        // Get order details
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'POS Order',
                name: orderName
            },
            callback: (response) => {
                if (response.message) {
                    const order = response.message;
                    
                    // Get invoice details
                    frappe.call({
                        method: 'frappe.client.get',
                        args: {
                            doctype: 'Sales Invoice',
                            name: invoiceName
                        },
                        callback: (invoiceResponse) => {
                            if (invoiceResponse.message) {
                                const invoice = invoiceResponse.message;
                                
                                // Render receipt
                                this.renderReceipt(order, invoice);
                            } else {
                                this.showError('Failed to load invoice details');
                            }
                        },
                        error: () => {
                            this.showError('Failed to load invoice details');
                        }
                    });
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
     * Render receipt
     * @param {Object} order - POS Order data
     * @param {Object} invoice - Sales Invoice data
     */
    renderReceipt: function(order, invoice) {
        const receiptContent = this.container.querySelector('#receipt-content');
        if (!receiptContent) return;
        
        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                itemsHtml += `
                    <div class="receipt-item">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-qty">${item.qty} x ${this.formatCurrency(item.rate)}</div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                    </div>
                    ${item.notes && this.settings.printerSettings.printNotesOnReceipt ? `
                        <div class="receipt-item-notes">${item.notes}</div>
                    ` : ''}
                `;
            });
        }
        
        receiptContent.innerHTML = `
            <div class="receipt">
                <div class="receipt-header">
                    <h3>Thank You For Your Order</h3>
                    <div class="receipt-order-number">
                        <span class="receipt-label">Order #:</span>
                        <span class="receipt-value">${order.name}</span>
                    </div>
                    <div class="receipt-date">
                        <span class="receipt-label">Date:</span>
                        <span class="receipt-value">${this.formatDateTime(order.creation)}</span>
                    </div>
                    ${invoice.name ? `
                        <div class="receipt-invoice">
                            <span class="receipt-label">Invoice #:</span>
                            <span class="receipt-value">${invoice.name}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="receipt-items">
                    ${itemsHtml}
                </div>
                
                <div class="receipt-totals">
                    <div class="receipt-total-row">
                        <div class="total-label">Subtotal</div>
                        <div class="total-value">${this.formatCurrency(order.net_total || 0)}</div>
                    </div>
                    ${invoice.taxes && invoice.taxes.length > 0 ? invoice.taxes.map(tax => `
                        <div class="receipt-total-row">
                            <div class="total-label">${tax.description}</div>
                            <div class="total-value">${this.formatCurrency(tax.tax_amount)}</div>
                        </div>
                    `).join('') : ''}
                    <div class="receipt-total-row grand-total">
                        <div class="total-label">Grand Total</div>
                        <div class="total-value">${this.formatCurrency(order.totals || 0)}</div>
                    </div>
                </div>
                
                <div class="receipt-footer">
                    <p>Your order has been sent to the kitchen.</p>
                    <p>Please wait for your order to be ready.</p>
                </div>
            </div>
        `;
        
        // Clear cart after successful order
        this.state.cart = [];
        this.renderCart();
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
        return frappe.format_currency(amount, 'IDR');
    }
};/**
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
                backUrl: '/restaurant/tables',
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
            
            // For templates, show price display ("from X" or range)
            let priceText;
            if (hasVariants && item.price_display) {
                priceText = item.price_display;
            } else {
                priceText = this.formatCurrency(item.standard_rate || 0);
            }
            
            html += `
                <div class="catalog-item ${itemClass}" data-item="${item.name}" data-has-variants="${hasVariants ? 1 : 0}">
                    ${item.image ? `<div class="item-image"><img src="${item.image}" alt="${item.item_name}"></div>` : ''}
                    <div class="item-details">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-price">${priceText}</div>
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
        
        // Validate no template items (must be variants)
        // Only block items that are templates AND haven't been converted to variants yet
        const templateItems = this.state.orderItems.filter(item => {
            // Check if item is a template (requires_variant = true)
            // AND hasn't been converted to variant yet (item still equals template_item)
            const isTemplate = item.requires_variant === true || item.requires_variant === 1;
            const isUnresolved = item.item === item.template_item;
            return isTemplate && isUnresolved;
        });
        
        if (templateItems.length > 0) {
            const itemNames = templateItems.map(item => item.item_name || item.item).join(', ');
            this.showError(`Cannot send template items to kitchen. Please select variants first for: ${itemNames}`);
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
                                this.state.order.workflow_state = 'In Progress';

                                // Update order status display
                                const orderStatus = this.container.querySelector('.order-status');
                                if (orderStatus) {
                                    orderStatus.textContent = 'In Progress';
                                    orderStatus.className = 'order-status in-progress';
                                }
                            }

                            // Ask if user wants to go back to table display
                            this.showConfirmDialog(
                                'Order Sent',
                                'Order has been sent to kitchen successfully. Do you want to go back to Table Display?',
                                'Go Back',
                                'Stay Here',
                                () => {
                                    window.location.href = '/restaurant/tables';
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
                            window.location.href = '/restaurant/tables';
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
                        const printerInterface = profile.imogi_printer_cashier_interface || 'OS';
                        const interfaceConfig = {};

                        if (printerInterface === 'LAN') {
                            interfaceConfig.adapter_config = {
                                host: profile.imogi_printer_cashier || '',
                                port: profile.imogi_printer_port || 9100
                            };
                        } else if (printerInterface === 'Bluetooth') {
                            interfaceConfig.deviceName = profile.imogi_bt_cashier_device_name || profile.imogi_printer_cashier || '';
                            interfaceConfig.adapter_config = {
                                device_name: profile.imogi_bt_cashier_device_name || '',
                                vendor_profile: profile.imogi_bt_cashier_vendor_profile || 'ESC/POS',
                                retry_count: profile.imogi_bt_retry || 2
                            };

                            if (profile.imogi_print_bridge_url) {
                                interfaceConfig.adapter_config.bridge_url = profile.imogi_print_bridge_url;
                                interfaceConfig.adapter_config.bridge_token = profile.imogi_print_bridge_token;
                            }
                        }

                        this.settings.printerSettings = {
                            interface: printerInterface,
                            printerName: profile.imogi_printer_cashier || '',
                            receiptFormat: profile.imogi_receipt_format || 'POS Receipt',
                            customerBillFormat: profile.imogi_customer_bill_format || 'Customer Bill',
                            printNotesOnReceipt: profile.imogi_print_notes_on_receipt !== 0,
                            hideNotesOnTableBill: profile.imogi_hide_notes_on_table_bill !== 0
                        };

                        // Load print service if available
                        if (window.IMOGIPrintService) {
                            IMOGIPrintService.init({
                                defaultInterface: printerInterface,
                                interfaces: {
                                    [printerInterface]: interfaceConfig
                                },
                                autoDetect: false
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
                const queueMatch = order.queue_number && String(order.queue_number).includes(searchTerm);

                return tableMatch || orderMatch || customerMatch || queueMatch;
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
                        <div class="order-name">${order.queue_number ? `#${order.queue_number}` : order.name}</div>
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
                // Check if item is a template (has_variants)
                const isTemplate = item.has_variants === 1 || item.has_variants === true;
                const templateClass = isTemplate ? 'template-item' : '';
                
                itemsHtml += `
                    <div class="item-row ${templateClass}" data-item-row="${item.name || ''}" data-item-code="${item.item || ''}">
                        <div class="item-name">
                            ${item.item_name}
                            ${isTemplate ? '<span class="template-badge"><i class="fa fa-list"></i> Template</span>' : ''}
                        </div>
                        <div class="item-qty">${item.qty}</div>
                        <div class="item-rate">${this.formatCurrency(item.rate)}</div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                        ${isTemplate ? `
                            <div class="item-actions">
                                <button class="select-variant-btn" data-item-row="${item.name}" data-item-code="${item.item}" title="Select Variant">
                                    <i class="fa fa-edit"></i> Select Variant
                                </button>
                            </div>
                        ` : ''}
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
        const paymentModeSelect = this.container.querySelector('#payment-mode');
        if (generateInvoiceBtn) {
            generateInvoiceBtn.addEventListener('click', () => {
                const mop = paymentModeSelect ? paymentModeSelect.value : '';
                if (!mop) {
                    this.showError('Please select a payment mode');
                    return;
                }
                this.generateInvoice(false, mop);
            });
        }
        
        // Bind Select Variant buttons
        const selectVariantBtns = this.container.querySelectorAll('.select-variant-btn');
        if (selectVariantBtns.length > 0) {
            selectVariantBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const itemRow = btn.dataset.itemRow;
                    const itemCode = btn.dataset.itemCode;
                    this.showVariantPickerForOrderItem(itemCode, itemRow);
                });
            });
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
            method: 'imogi_pos.api.orders.create_staff_order',
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
        this.generateInvoice(true, 'Online').then(invoice => {
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
            return this.generateInvoice(true, 'Cash').then(invoice => {
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
            return this.generateInvoice(true, 'Card').then(invoice => {
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
    generateInvoice: function(silent = false, modeOfPayment) {
        return new Promise((resolve, reject) => {
            if (!this.state.currentOrder) {
                reject(new Error('No order selected'));
                return;
            }

            if (!modeOfPayment) {
                reject(new Error('Mode of payment is required'));
                return;
            }

            if (this.state.currentOrder.sales_invoice) {
                resolve(this.state.currentOrder.sales_invoice);
                return;
            }

            this.showLoading(true, 'Generating invoice...');

            const amount = this.state.currentOrder.grand_total || this.state.currentOrder.rounded_total || this.state.currentOrder.total;

            frappe.call({
                method: 'imogi_pos.api.billing.generate_invoice',
                args: {
                    pos_order: this.state.currentOrder.name,
                    pos_profile: this.settings.posProfile,
                    mode_of_payment: modeOfPayment,
                    amount: amount
                },
                callback: (response) => {
                    this.showLoading(false);

                    if (response.message && response.message.name) {
                        if (!silent) {
                            this.showToast('Invoice generated successfully');
                        }

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
            
            // For templates, show price display ("from X" or range)
            let priceText;
            if (hasVariants && item.price_display) {
                priceText = item.price_display;
            } else {
                priceText = this.formatCurrency(item.standard_rate || 0);
            }
            
            html += `
                <div class="catalog-item ${itemClass}" data-item="${item.name}" data-has-variants="${hasVariants ? 1 : 0}">
                    ${item.image ? `<div class="item-image"><img src="${item.image}" alt="${item.item_name}"></div>` : ''}
                    <div class="item-details">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-price">${priceText}</div>
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
     * @param {string} orderItemRow - Optional: Order item row name for conversion
     */
    showVariantPicker: function(templateName, orderItemRow = null) {
        // Show modal for variant selection
        const modalContainer = this.container.querySelector('#modal-container');
        if (!modalContainer) return;
        
        // Store context for later use
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
     * Show variant picker for existing order item (convert template to variant)
     * @param {string} templateName - Item template name
     * @param {string} orderItemRow - Order item row name
     */
    showVariantPickerForOrderItem: function(templateName, orderItemRow) {
        this.showVariantPicker(templateName, orderItemRow);
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
                    
                    // Check if we're in convert mode or add mode
                    if (this.variantPickerContext && this.variantPickerContext.mode === 'convert') {
                        // Convert existing template item to variant
                        this.selectVariantForOrderItem(this.variantPickerContext.orderItemRow, itemName);
                    } else {
                        // Add new variant to order
                        this.addItemToOrder(itemName);
                    }
                    
                    // Close modal
                    const modalContainer = this.container.querySelector('#modal-container');
                    if (modalContainer) {
                        modalContainer.classList.remove('active');
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
     * Select variant for existing order item (convert template to variant)
     * @param {string} orderItemRow - Order item row name
     * @param {string} variantItem - Variant item code
     */
    selectVariantForOrderItem: function(orderItemRow, variantItem) {
        if (!this.state.currentOrder) {
            this.showError('No order selected');
            return;
        }
        
        if (!orderItemRow || !variantItem) {
            this.showError('Invalid parameters');
            return;
        }
        
        // Show loading
        this.showLoading(true, 'Converting to variant...');
        
        frappe.call({
            method: 'imogi_pos.api.variants.choose_variant_for_order_item',
            args: {
                pos_order: this.state.currentOrder.name,
                order_item_row: orderItemRow,
                variant_item: variantItem
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    this.showToast('Template converted to variant successfully');
                    
                    // Reload order to reflect changes
                    this.selectOrder(this.state.currentOrder.name);
                } else {
                    const errorMsg = response.message && response.message.message 
                        ? response.message.message 
                        : 'Failed to convert template to variant';
                    this.showError(errorMsg);
                }
            },
            error: (error) => {
                this.showLoading(false);
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