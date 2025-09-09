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
                        this.settings.printerSettings = {
                            interface: profile.imogi_printer_cashier_interface || 'OS',
                            printerName: profile.imogi_printer_cashier || '',
                            receiptFormat: profile.imogi_receipt_format || 'POS Receipt',
                            queueFormat: profile.imogi_queue_format || 'Queue Ticket',
                            printNotesOnReceipt: profile.imogi_print_notes_on_kiosk_receipt !== 0
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
                    this.addItemToCart(itemName);
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
                    this.addItemToCart(itemName);
                    
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
     * Add item to cart
     * @param {string} itemName - Item name to add
     */
    addItemToCart: function(itemName) {
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
                    
                    // Check if item is already in cart
                    const existingItemIndex = this.state.cart.findIndex(cartItem => 
                        cartItem.item === itemName && !cartItem.notes
                    );
                    
                    if (existingItemIndex !== -1) {
                        // Increment quantity
                        this.state.cart[existingItemIndex].qty += 1;
                        this.state.cart[existingItemIndex].amount = 
                            this.state.cart[existingItemIndex].qty * this.state.cart[existingItemIndex].rate;
                    } else {
                        // Add new item
                        this.state.cart.push({
                            item: itemName,
                            item_name: item.item_name,
                            qty: 1,
                            rate: item.standard_rate || 0,
                            amount: item.standard_rate || 0,
                            notes: ''
                        });
                    }
                    
                    // Update UI
                    this.renderCart();
                    
                    // Show prompt for notes if enabled
                    if (this.settings.allowNotes) {
                        this.promptForNotes(this.state.cart.length - 1);
                    }
                } else {
                    this.showError('Failed to add item');
                }
            },
            error: () => {
                this.showError('Failed to add item');
            }
        });
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
                    this.state.cart[itemIndex].notes = notes;
                    
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
            if (this.state.cart[index].qty > 1) {
                this.state.cart[index].qty -= 1;
                this.state.cart[index].amount = this.state.cart[index].qty * this.state.cart[index].rate;
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
            this.state.cart[index].qty += 1;
            this.state.cart[index].amount = this.state.cart[index].qty * this.state.cart[index].rate;
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
        
        // Show loading indicator
        this.showLoading(true, 'Processing your order...');
        
        // Create POS Order
        frappe.call({
            method: 'imogi_pos.api.orders.create_order',
            args: {
                pos_profile: this.settings.posProfile,
                branch: this.settings.branch,
                order_type: 'Kiosk',
                items: this.state.cart
            },
            callback: (response) => {
                if (response.message && response.message.name) {
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
                pos_order: orderName
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
};