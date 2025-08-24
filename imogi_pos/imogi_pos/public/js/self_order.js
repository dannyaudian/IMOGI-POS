/**
 * IMOGI POS - Self Order
 * 
 * Main module for the Self Order interface
 * Handles:
 * - Template-first catalog with variant picker
 * - Cart management
 * - Item notes
 * - Checkout process
 * - Table orders
 * - Session management
 * - QR-based authentication
 */

frappe.provide('imogi_pos.self_order');

imogi_pos.self_order = {
    // Settings and state
    settings: {
        posProfile: null,
        branch: null,
        table: null,
        orderType: 'Dine-in', // Dine-in, Takeaway
        token: null,
        slug: null,
        allowGuest: true,
        requirePayment: false,
        callServerTimeout: 5000, // 5 seconds
        sessionExpiryInterval: 60000, // 1 minute
    },
    state: {
        session: null,
        sessionExpiry: null,
        cart: [],
        catalogItems: [],
        itemGroups: [],
        searchResults: [],
        selectedItemGroup: null,
        currentVariantItem: null,
        searchTerm: '',
        viewMode: 'catalog', // catalog, cart, checkout, payment, confirmation
        orderCreated: false,
        errorState: null,
        expiryChecker: null,
        kotSubmitted: false,
        orderNumber: null
    },
    
    /**
     * Initialize the Self Order
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#self-order',
            token: null,
            slug: null,
            sessionTimeout: 30 * 60 * 1000 // 30 minutes
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Self Order container not found');
            return;
        }
        
        // Get token/slug from options or URL
        this.settings.token = this.options.token || this.getUrlParameter('token');
        this.settings.slug = this.options.slug || this.getUrlParameter('slug');
        this.settings.table = this.options.table || this.getUrlParameter('table');
        
        // Check if we have a token or slug
        if (!this.settings.token && !this.settings.slug) {
            this.showError('Invalid session. No token or slug provided.');
            return;
        }
        
        // Initialize session
        this.initializeSession()
            .then(() => {
                this.renderUI();
                this.bindEvents();
                this.loadCatalog();
                this.setupSessionExpiry();
            })
            .catch(err => {
                console.error('Failed to initialize Self Order:', err);
                this.showErrorState('Failed to initialize Self Order. Please try scanning the QR code again.');
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
     * Initialize session
     * @returns {Promise} Promise resolving when session is initialized
     */
    initializeSession: function() {
        return new Promise((resolve, reject) => {
            // Check if we have an existing session in localStorage
            const savedSession = localStorage.getItem('imogi_self_order_session');
            if (savedSession) {
                try {
                    const session = JSON.parse(savedSession);
                    
                    // Verify if session is valid for current token/slug
                    if ((this.settings.token && session.token === this.settings.token) || 
                        (this.settings.slug && session.slug === this.settings.slug)) {
                        
                        // Check expiry
                        const expiry = new Date(session.expires_on);
                        const now = new Date();
                        
                        if (expiry > now) {
                            // Session is valid
                            this.state.session = session;
                            this.settings.posProfile = session.pos_profile;
                            this.settings.branch = session.branch;
                            this.settings.table = session.table;
                            this.settings.orderType = session.order_type || 'Dine-in';
                            this.settings.allowGuest = session.allow_guest !== false;
                            this.settings.requirePayment = session.require_payment === true;
                            
                            // Load cart from session
                            if (session.cart && Array.isArray(session.cart)) {
                                this.state.cart = session.cart;
                            }
                            
                            resolve();
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse saved session');
                }
            }
            
            // Create new session
            this.createSession()
                .then(resolve)
                .catch(reject);
        });
    },
    
    /**
     * Create a new session
     * @returns {Promise} Promise resolving when session is created
     */
    createSession: function() {
        return new Promise((resolve, reject) => {
            // Show loading
            this.showLoading(true, 'Creating session...');
            
            frappe.call({
                method: 'imogi_pos.api.self_order.create_session',
                args: {
                    token: this.settings.token,
                    slug: this.settings.slug,
                    table: this.settings.table
                },
                callback: (response) => {
                    this.showLoading(false);
                    
                    if (response.message && response.message.success) {
                        // Save session
                        this.state.session = response.message.session;
                        
                        // Save session to localStorage
                        localStorage.setItem('imogi_self_order_session', JSON.stringify(this.state.session));
                        
                        // Set settings from session
                        this.settings.posProfile = this.state.session.pos_profile;
                        this.settings.branch = this.state.session.branch;
                        this.settings.table = this.state.session.table;
                        this.settings.orderType = this.state.session.order_type || 'Dine-in';
                        this.settings.allowGuest = this.state.session.allow_guest !== false;
                        this.settings.requirePayment = this.state.session.require_payment === true;
                        
                        // Setup expiry checker
                        this.setupSessionExpiry();
                        
                        resolve();
                    } else {
                        reject(new Error(response.message && response.message.error || 'Failed to create session'));
                    }
                },
                error: (err) => {
                    this.showLoading(false);
                    reject(err);
                }
            });
        });
    },
    
    /**
     * Setup session expiry checker
     */
    setupSessionExpiry: function() {
        // Clear existing checker
        if (this.state.expiryChecker) {
            clearInterval(this.state.expiryChecker);
        }
        
        // Calculate expiry time
        if (this.state.session && this.state.session.expires_on) {
            const expiry = new Date(this.state.session.expires_on);
            this.state.sessionExpiry = expiry;
            
            // Set up expiry checker
            this.state.expiryChecker = setInterval(() => {
                this.checkSessionExpiry();
            }, this.settings.sessionExpiryInterval);
        }
    },
    
    /**
     * Check session expiry
     */
    checkSessionExpiry: function() {
        if (!this.state.sessionExpiry) return;
        
        const now = new Date();
        const expiry = this.state.sessionExpiry;
        
        // Show warning if less than 5 minutes remaining
        const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
        if (expiry - now < fiveMinutes && expiry > now) {
            this.showSessionExpiryWarning();
        }
        
        // If expired, show expiry message
        if (now >= expiry) {
            this.handleSessionExpiry();
        }
    },
    
    /**
     * Show session expiry warning
     */
    showSessionExpiryWarning: function() {
        // Only show once per minute
        if (this.state.expiryWarningShown) return;
        
        // Show toast
        const minutesLeft = Math.ceil((this.state.sessionExpiry - new Date()) / (60 * 1000));
        this.showToast(`Your session will expire in ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'}. Please complete your order soon.`);
        
        // Mark as shown
        this.state.expiryWarningShown = true;
        
        // Reset after 1 minute
        setTimeout(() => {
            this.state.expiryWarningShown = false;
        }, 60000);
    },
    
    /**
     * Handle session expiry
     */
    handleSessionExpiry: function() {
        // Clear checker
        if (this.state.expiryChecker) {
            clearInterval(this.state.expiryChecker);
        }
        
        // Show expiry message
        this.showErrorState('Your session has expired. Please scan the QR code again to place a new order.');
        
        // Clear session
        localStorage.removeItem('imogi_self_order_session');
        this.state.session = null;
    },
    
    /**
     * Extend session
     * @returns {Promise} Promise resolving when session is extended
     */
    extendSession: function() {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.self_order.extend_session',
                args: {
                    session_id: this.state.session.name
                },
                callback: (response) => {
                    if (response.message && response.message.success) {
                        // Update session
                        this.state.session.expires_on = response.message.expires_on;
                        
                        // Save to localStorage
                        localStorage.setItem('imogi_self_order_session', JSON.stringify(this.state.session));
                        
                        // Update expiry
                        this.state.sessionExpiry = new Date(response.message.expires_on);
                        
                        this.showToast('Your session has been extended');
                        resolve();
                    } else {
                        reject(new Error(response.message && response.message.error || 'Failed to extend session'));
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
            <div class="self-order-layout">
                <div class="self-order-header">
                    <div class="brand-container" id="brand-container">
                        <div class="brand-logo"></div>
                        <div class="brand-name"></div>
                    </div>
                    <div class="header-right">
                        <div class="header-info">
                            ${this.settings.table ? `<div class="table-info">Table: ${this.settings.table}</div>` : ''}
                            <div class="order-type-info">${this.settings.orderType}</div>
                        </div>
                        <button class="cart-button" id="cart-button">
                            <i class="fa fa-shopping-cart"></i>
                            <span class="cart-count" id="cart-count">0</span>
                        </button>
                    </div>
                </div>
                
                <div class="self-order-content">
                    <div id="catalog-view" class="self-order-view ${this.state.viewMode === 'catalog' ? '' : 'hidden'}">
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
                    
                    <div id="cart-view" class="self-order-view ${this.state.viewMode === 'cart' ? '' : 'hidden'}">
                        <div class="cart-container">
                            <div class="cart-header">
                                <h2>Your Order</h2>
                                <button id="back-to-catalog-btn" class="back-button">
                                    <i class="fa fa-arrow-left"></i> Back to Menu
                                </button>
                            </div>
                            <div class="cart-items" id="cart-items">
                                <div class="empty-cart">
                                    <i class="fa fa-shopping-cart empty-icon"></i>
                                    <p>Your cart is empty</p>
                                </div>
                            </div>
                            <div class="cart-summary" id="cart-summary">
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
                                    <button id="clear-cart-btn" class="action-button" ${this.state.cart.length === 0 ? 'disabled' : ''}>
                                        Clear All
                                    </button>
                                    <button id="checkout-btn" class="action-button primary" ${this.state.cart.length === 0 ? 'disabled' : ''}>
                                        ${this.settings.orderType === 'Dine-in' ? 'Place Order' : 'Checkout'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="checkout-view" class="self-order-view ${this.state.viewMode === 'checkout' ? '' : 'hidden'}">
                        <div class="checkout-container">
                            <div class="checkout-header">
                                <h2>Checkout</h2>
                                <button id="back-to-cart-btn" class="back-button">
                                    <i class="fa fa-arrow-left"></i> Back to Cart
                                </button>
                            </div>
                            <div class="checkout-content" id="checkout-content">
                                <div class="loading-container">Preparing checkout...</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="payment-view" class="self-order-view ${this.state.viewMode === 'payment' ? '' : 'hidden'}">
                        <div class="payment-container">
                            <div class="payment-header">
                                <h2>Payment</h2>
                            </div>
                            <div class="payment-content" id="payment-content">
                                <div class="loading-container">Preparing payment...</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="confirmation-view" class="self-order-view ${this.state.viewMode === 'confirmation' ? '' : 'hidden'}">
                        <div class="confirmation-container">
                            <div class="confirmation-header">
                                <h2>Order Confirmation</h2>
                            </div>
                            <div class="confirmation-content" id="confirmation-content">
                                <div class="loading-container">Processing order...</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="self-order-footer">
                    <div class="disclaimer" id="disclaimer-text"></div>
                </div>
            </div>
            
            <div id="modal-container" class="modal-container"></div>
            <div id="toast-container" class="toast-container"></div>
        `;
        
        // Set disclaimer text
        if (this.state.session && this.state.session.disclaimer) {
            const disclaimerElement = this.container.querySelector('#disclaimer-text');
            if (disclaimerElement) {
                disclaimerElement.textContent = this.state.session.disclaimer;
            }
        }
        
        // Set brand info
        if (this.state.session && this.state.session.brand) {
            this.updateBrand(this.state.session.brand);
        }
        
        // Update cart count
        this.updateCartCount();
        
        // Initial rendering
        this.renderCart();
    },
    
    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Cart button
        const cartButton = this.container.querySelector('#cart-button');
        if (cartButton) {
            cartButton.addEventListener('click', () => {
                this.switchView('cart');
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
        
        // Back to catalog button
        const backToCatalogBtn = this.container.querySelector('#back-to-catalog-btn');
        if (backToCatalogBtn) {
            backToCatalogBtn.addEventListener('click', () => {
                this.switchView('catalog');
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
                this.processCheckout();
            });
        }
        
        // Back to cart button
        const backToCartBtn = this.container.querySelector('#back-to-cart-btn');
        if (backToCartBtn) {
            backToCartBtn.addEventListener('click', () => {
                this.switchView('cart');
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
        this.container.querySelector('#cart-view').classList.toggle('hidden', viewMode !== 'cart');
        this.container.querySelector('#checkout-view').classList.toggle('hidden', viewMode !== 'checkout');
        this.container.querySelector('#payment-view').classList.toggle('hidden', viewMode !== 'payment');
        this.container.querySelector('#confirmation-view').classList.toggle('hidden', viewMode !== 'confirmation');
        
        // If switching to cart, render it
        if (viewMode === 'cart') {
            this.renderCart();
        }
        
        // If switching to checkout, prepare checkout
        if (viewMode === 'checkout') {
            this.prepareCheckout();
        }
    },
    
    /**
     * Update brand information
     * @param {Object} brand - Brand information
     */
    updateBrand: function(brand) {
        const brandContainer = this.container.querySelector('#brand-container');
        if (!brandContainer) return;
        
        const brandLogo = brandContainer.querySelector('.brand-logo');
        const brandName = brandContainer.querySelector('.brand-name');
        
        if (brand.logo_url && brandLogo) {
            brandLogo.innerHTML = `<img src="${brand.logo_url}" alt="${brand.name || 'Brand Logo'}">`;
        }
        
        if (brand.name && brandName) {
            brandName.textContent = brand.name;
        }
        
        // Apply brand colors if provided
        if (brand.primary_color) {
            document.documentElement.style.setProperty('--brand-primary', brand.primary_color);
        }
        
        if (brand.accent_color) {
            document.documentElement.style.setProperty('--brand-accent', brand.accent_color);
        }
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
                    
                    // Save cart to session
                    this.saveCartToSession();
                    
                    // Update UI
                    this.updateCartCount();
                    
                    // Hide loading indicator
                    this.showLoading(false);
                    
                    // Show prompt for notes
                    this.promptForNotes(existingItemIndex !== -1 ? existingItemIndex : this.state.cart.length - 1);
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
                    
                    // Save cart to session
                    this.saveCartToSession();
                }
                
                // Close modal
                modalContainer.classList.remove('active');
            });
        }
    },
    
    /**
     * Save cart to session
     */
    saveCartToSession: function() {
        if (!this.state.session) return;
        
        // Update session object
        this.state.session.cart = this.state.cart;
        
        // Save to localStorage
        localStorage.setItem('imogi_self_order_session', JSON.stringify(this.state.session));
        
        // Optionally save to server
        this.saveCartToServer();
    },
    
    /**
     * Save cart to server
     */
    saveCartToServer: function() {
        if (!this.state.session) return;
        
        // Don't wait for response to keep UI responsive
        frappe.call({
            method: 'imogi_pos.api.self_order.update_session_cart',
            args: {
                session_id: this.state.session.name,
                cart: this.state.cart
            },
            callback: (response) => {
                if (!response.message || !response.message.success) {
                    console.warn('Failed to save cart to server');
                }
            }
        });
    },
    
    /**
     * Update cart count
     */
    updateCartCount: function() {
        const cartCount = this.container.querySelector('#cart-count');
        if (!cartCount) return;
        
        const count = this.state.cart.reduce((sum, item) => sum + item.qty, 0);
        cartCount.textContent = count;
        
        // Enable/disable cart button
        const cartButton = this.container.querySelector('#cart-button');
        if (cartButton) {
            cartButton.disabled = count === 0;
        }
        
        // Enable/disable checkout button
        const checkoutBtn = this.container.querySelector('#checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.disabled = count === 0;
        }
        
        // Enable/disable clear cart button
        const clearCartBtn = this.container.querySelector('#clear-cart-btn');
        if (clearCartBtn) {
            clearCartBtn.disabled = count === 0;
        }
    },
    
    /**
     * Render the cart
     */
    renderCart: function() {
        const cartItems = this.container.querySelector('#cart-items');
        const cartTotals = this.container.querySelector('#cart-totals');
        
        if (!cartItems || !cartTotals) return;
        
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
        
        // Bind cart item events
        this.bindCartItemEvents();
    },
    
    /**
     * Bind cart item events
     */
    bindCartItemEvents: function() {
        // Remove buttons
        this.container.querySelectorAll('.item-remove').forEach(button => {
            button.addEventListener('click', () => {
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
            
            // Save cart to session
            this.saveCartToSession();
            
            // Update UI
            this.renderCart();
            this.updateCartCount();
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
                
                // Save cart to session
                this.saveCartToSession();
                
                // Update UI
                this.renderCart();
                this.updateCartCount();
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
            
            // Save cart to session
            this.saveCartToSession();
            
            // Update UI
            this.renderCart();
            this.updateCartCount();
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
                
                // Save cart to session
                this.saveCartToSession();
                
                // Update UI
                this.renderCart();
                this.updateCartCount();
            }
        );
    },
    
    /**
     * Process checkout
     */
    processCheckout: function() {
        if (this.state.cart.length === 0) {
            this.showError('Your cart is empty');
            return;
        }
        
        // For Dine-in, we send directly to kitchen
        if (this.settings.orderType === 'Dine-in') {
            this.submitTableOrder();
        } else {
            // For Takeaway, show checkout screen
            this.switchView('checkout');
        }
    },
    
    /**
     * Prepare checkout
     */
    prepareCheckout: function() {
        const checkoutContent = this.container.querySelector('#checkout-content');
        if (!checkoutContent) return;
        
        // Show loading
        checkoutContent.innerHTML = `<div class="loading-container">Preparing checkout...</div>`;
        
        // Calculate totals
        const subtotal = this.state.cart.reduce((sum, item) => sum + item.amount, 0);
        
        // Render checkout content
        let itemsHtml = '';
        this.state.cart.forEach(item => {
            itemsHtml += `
                <div class="checkout-item">
                    <div class="item-name">${item.item_name}</div>
                    <div class="item-qty">${item.qty} x ${this.formatCurrency(item.rate)}</div>
                    <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                </div>
                ${item.notes ? `<div class="checkout-item-notes">${item.notes}</div>` : ''}
            `;
        });
        
        checkoutContent.innerHTML = `
            <div class="checkout-summary">
                <div class="checkout-items">
                    ${itemsHtml}
                </div>
                <div class="checkout-totals">
                    <div class="total-row">
                        <div class="total-label">Subtotal</div>
                        <div class="total-value">${this.formatCurrency(subtotal)}</div>
                    </div>
                    <div class="total-row grand-total">
                        <div class="total-label">Total</div>
                        <div class="total-value">${this.formatCurrency(subtotal)}</div>
                    </div>
                </div>
            </div>
            
            <div class="checkout-actions">
                <button id="submit-order-btn" class="action-button primary">Place Order & Pay</button>
            </div>
        `;
        
        // Bind submit button
        const submitBtn = checkoutContent.querySelector('#submit-order-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.submitTakeawayOrder();
            });
        }
    },
    
    /**
     * Submit table order (Dine-in)
     */
    submitTableOrder: function() {
        if (this.state.cart.length === 0) {
            this.showError('Your cart is empty');
            return;
        }
        
        // Check if table is set
        if (!this.settings.table) {
            this.showError('No table specified. Please scan the table QR code again.');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Submitting order...');
        
        frappe.call({
            method: 'imogi_pos.api.self_order.submit_table_order',
            args: {
                session_id: this.state.session.name,
                cart: this.state.cart
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    // Mark KOT as submitted
                    this.state.kotSubmitted = true;
                    
                    // Store order number
                    if (response.message.order_name) {
                        this.state.orderNumber = response.message.order_name;
                    }
                    
                    // Clear cart
                    this.state.cart = [];
                    this.saveCartToSession();
                    this.updateCartCount();
                    
                    // Show confirmation
                    this.showTableOrderConfirmation();
                } else {
                    this.showError(response.message && response.message.error || 'Failed to submit order');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to submit order');
            }
        });
    },
    
    /**
     * Show table order confirmation
     */
    showTableOrderConfirmation: function() {
        // Switch to confirmation view
        this.switchView('confirmation');
        
        const confirmationContent = this.container.querySelector('#confirmation-content');
        if (!confirmationContent) return;
        
        confirmationContent.innerHTML = `
            <div class="confirmation-success">
                <div class="success-icon">
                    <i class="fa fa-check-circle"></i>
                </div>
                <h3>Order Submitted Successfully</h3>
                ${this.state.orderNumber ? `<p>Order #: ${this.state.orderNumber}</p>` : ''}
                <p>Your order has been sent to the kitchen and will be prepared shortly.</p>
                <div class="confirmation-actions">
                    <button id="new-order-btn" class="action-button primary">Place Another Order</button>
                </div>
            </div>
        `;
        
        // Bind new order button
        const newOrderBtn = confirmationContent.querySelector('#new-order-btn');
        if (newOrderBtn) {
            newOrderBtn.addEventListener('click', () => {
                this.switchView('catalog');
            });
        }
    },
    
    /**
     * Submit takeaway order
     */
    submitTakeawayOrder: function() {
        if (this.state.cart.length === 0) {
            this.showError('Your cart is empty');
            return;
        }
        
        // Show loading indicator
        this.showLoading(true, 'Processing order...');
        
        frappe.call({
            method: 'imogi_pos.api.self_order.checkout_takeaway',
            args: {
                session_id: this.state.session.name,
                cart: this.state.cart
            },
            callback: (response) => {
                this.showLoading(false);
                
                if (response.message && response.message.success) {
                    // Check if payment is required
                    if (response.message.payment_required && response.message.payment) {
                        // Show payment view
                        this.showPaymentView(response.message.payment);
                    } else {
                        // Mark KOT as submitted
                        this.state.kotSubmitted = true;
                        
                        // Store order number
                        if (response.message.order_name) {
                            this.state.orderNumber = response.message.order_name;
                        }
                        
                        // Clear cart
                        this.state.cart = [];
                        this.saveCartToSession();
                        this.updateCartCount();
                        
                        // Show confirmation
                        this.showTakeawayOrderConfirmation();
                    }
                } else {
                    this.showError(response.message && response.message.error || 'Failed to process order');
                }
            },
            error: () => {
                this.showLoading(false);
                this.showError('Failed to process order');
            }
        });
    },
    
    /**
     * Show payment view
     * @param {Object} paymentData - Payment data
     */
    showPaymentView: function(paymentData) {
        // Switch to payment view
        this.switchView('payment');
        
        const paymentContent = this.container.querySelector('#payment-content');
        if (!paymentContent) return;
        
        if (!paymentData) {
            paymentContent.innerHTML = `
                <div class="empty-state">
                    <p>No payment information available</p>
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
                    <button id="cancel-payment-btn" class="action-button">Cancel</button>
                </div>
            </div>
        `;
        
        // Bind cancel button
        const cancelBtn = paymentContent.querySelector('#cancel-payment-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.switchView('checkout');
            });
        }
        
        // Setup payment listener
        this.setupPaymentListener(paymentData.payment_request);
    },
    
    /**
     * Setup payment listener
     * @param {string} paymentRequestId - Payment request ID
     */
    setupPaymentListener: function(paymentRequestId) {
        // Listen for payment updates
        frappe.realtime.on('payment_update', (data) => {
            if (data && data.payment_request === paymentRequestId) {
                if (data.status === 'Paid') {
                    this.handlePaymentSuccess(data);
                } else if (data.status === 'Expired') {
                    this.handlePaymentExpired(data);
                }
            }
        });
    },
    
    /**
     * Handle payment success
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
        this.showToast('Payment successful!');
        
        // Mark KOT as submitted
        this.state.kotSubmitted = true;
        
        // Store order number
        if (data.order_name) {
            this.state.orderNumber = data.order_name;
        }
        
        // Clear cart
        this.state.cart = [];
        this.saveCartToSession();
        this.updateCartCount();
        
        // Show confirmation after a short delay
        setTimeout(() => {
            this.showTakeawayOrderConfirmation();
        }, 2000);
    },
    
    /**
     * Handle payment expiry
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
        this.showError('Payment request expired. Please try again.');
    },
    
    /**
     * Show takeaway order confirmation
     */
    showTakeawayOrderConfirmation: function() {
        // Switch to confirmation view
        this.switchView('confirmation');
        
        const confirmationContent = this.container.querySelector('#confirmation-content');
        if (!confirmationContent) return;
        
        confirmationContent.innerHTML = `
            <div class="confirmation-success">
                <div class="success-icon">
                    <i class="fa fa-check-circle"></i>
                </div>
                <h3>Order Placed Successfully</h3>
                ${this.state.orderNumber ? `<p>Order #: ${this.state.orderNumber}</p>` : ''}
                <p>Your order has been confirmed and will be prepared shortly.</p>
                <div class="confirmation-actions">
                    <button id="new-order-btn" class="action-button primary">Place Another Order</button>
                </div>
            </div>
        `;
        
        // Bind new order button
        const newOrderBtn = confirmationContent.querySelector('#new-order-btn');
        if (newOrderBtn) {
            newOrderBtn.addEventListener('click', () => {
                this.switchView('catalog');
            });
        }
    },
    
    /**
     * Show loading indicator
     * @param {boolean} show - Whether to show or hide
     * @param {string} [message] - Optional message
     */
    showLoading: function(show, message = 'Loading...') {
        // If we already have a loading container, update it
        let loadingContainer = document.querySelector('.loading-overlay');
        
        if (show) {
            if (!loadingContainer) {
                loadingContainer = document.createElement('div');
                loadingContainer.className = 'loading-overlay';
                loadingContainer.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-message">${message}</div>
                `;
                document.body.appendChild(loadingContainer);
            } else {
                loadingContainer.querySelector('.loading-message').textContent = message;
                loadingContainer.style.display = 'flex';
            }
        } else if (loadingContainer) {
            loadingContainer.style.display = 'none';
        }
    },
    
    /**
     * Show error state
     * @param {string} message - Error message
     */
    showErrorState: function(message) {
        this.state.errorState = message;
        
        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">
                    <i class="fa fa-exclamation-circle"></i>
                </div>
                <h3>Something went wrong</h3>
                <p>${message}</p>
                <button id="retry-btn" class="action-button primary">Try Again</button>
            </div>
        `;
        
        // Bind retry button
        const retryBtn = this.container.querySelector('#retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                window.location.reload();
            });
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