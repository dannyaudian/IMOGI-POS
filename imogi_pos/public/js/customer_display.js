/**
 * IMOGI POS - Customer Display
 * 
 * Main module for the Customer Display interface
 * Handles:
 * - Device registration and pairing
 * - Display of order summaries
 * - Payment QR display
 * - Promotional content and tickers
 * - Realtime updates
 */

frappe.provide('imogi_pos.customer_display');

imogi_pos.customer_display = {
    // Settings and state
    settings: {
        deviceId: null,
        displayName: null,
        pairedOrder: null,
        pairedProfile: null,
        refreshInterval: 30000, // 30 seconds for heartbeat
    },
    state: {
        isRegistered: false,
        currentDisplay: 'welcome', // welcome, order, payment, promo
        currentOrder: null,
        currentPayment: null,
        blocks: [],
        heartbeatInterval: null,
        lastHeartbeat: null
    },
    
    /**
     * Initialize the Customer Display
     * @param {Object} options - Configuration options
     */
    init: function(options = {}) {
        this.options = Object.assign({
            container: '#customer-display',
            deviceNamePrefix: 'CD-',
            fullscreen: true
        }, options);
        
        this.container = document.querySelector(this.options.container);
        if (!this.container) {
            console.error('Customer Display container not found');
            return;
        }
        
        // Check if already registered
        this.loadDeviceInfo()
            .then(() => {
                this.renderUI();
                this.setupRealTimeUpdates();
                this.setupHeartbeat();
                
                // Auto fullscreen if configured
                if (this.options.fullscreen) {
                    this.requestFullscreen();
                }
            })
            .catch(err => {
                console.error('Failed to initialize Customer Display:', err);
                this.showRegistrationForm();
            });
    },
    
    /**
     * Load device information from localStorage or server
     * @returns {Promise} Promise resolving when device info is loaded
     */
    loadDeviceInfo: function() {
        return new Promise((resolve, reject) => {
            // Try to get from localStorage
            const deviceId = localStorage.getItem('imogi_customer_display_id');
            const displayName = localStorage.getItem('imogi_customer_display_name');
            
            if (deviceId && displayName) {
                this.settings.deviceId = deviceId;
                this.settings.displayName = displayName;
                this.state.isRegistered = true;
                
                // Verify with server
                this.verifyRegistration(deviceId)
                    .then(resolve)
                    .catch(err => {
                        // If verification fails, clear local storage and reject
                        localStorage.removeItem('imogi_customer_display_id');
                        localStorage.removeItem('imogi_customer_display_name');
                        reject(err);
                    });
            } else {
                reject(new Error('Device not registered'));
            }
        });
    },
    
    /**
     * Verify registration with server
     * @param {string} deviceId - Device ID to verify
     * @returns {Promise} Promise resolving when verification is complete
     */
    verifyRegistration: function(deviceId) {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'imogi_pos.api.customer_display.get_customer_display_config',
                args: {
                    device_id: deviceId
                },
                callback: (response) => {
                    if (response.message && response.message.is_active) {
                        // Update settings
                        this.settings.pairedOrder = response.message.paired_order || null;
                        this.settings.pairedProfile = response.message.paired_profile || null;
                        
                        // Load blocks
                        if (response.message.blocks) {
                            this.state.blocks = response.message.blocks;
                        }
                        
                        resolve(response.message);
                    } else {
                        reject(new Error('Device not active'));
                    }
                },
                error: (err) => {
                    reject(err);
                }
            });
        });
    },
    
    /**
     * Show registration form
     */
    showRegistrationForm: function() {
        if (!this.container) return;
        
        // Generate a unique display name suggestion
        const suggestedName = this.options.deviceNamePrefix + Math.floor(Math.random() * 1000);
        
        this.container.innerHTML = `
            <div class="registration-container">
                <div class="registration-header">
                    <h2>Customer Display Registration</h2>
                </div>
                <div class="registration-form">
                    <div class="form-group">
                        <label for="display-name">Display Name</label>
                        <input type="text" id="display-name" value="${suggestedName}" class="form-input">
                        <p class="form-help">Give this display a unique name for identification</p>
                    </div>
                    <div class="form-actions">
                        <button id="register-btn" class="btn btn-primary">Register Display</button>
                    </div>
                </div>
            </div>
        `;
        
        // Bind register button
        const registerBtn = this.container.querySelector('#register-btn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                const displayName = this.container.querySelector('#display-name').value.trim();
                if (displayName) {
                    this.registerDevice(displayName);
                }
            });
        }
    },
    
    /**
     * Register device with the server
     * @param {string} displayName - Display name for the device
     */
    registerDevice: function(displayName) {
        // Show loading state
        const registerBtn = this.container.querySelector('#register-btn');
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = 'Registering...';
        }
        
        frappe.call({
            method: 'imogi_pos.api.customer_display.register_display_device',
            args: {
                display_name: displayName,
                user_agent: navigator.userAgent
            },
            callback: (response) => {
                if (response.message && response.message.device_id) {
                    // Save to localStorage
                    localStorage.setItem('imogi_customer_display_id', response.message.device_id);
                    localStorage.setItem('imogi_customer_display_name', displayName);
                    
                    // Update settings
                    this.settings.deviceId = response.message.device_id;
                    this.settings.displayName = displayName;
                    this.state.isRegistered = true;
                    
                    // Initialize display
                    this.renderUI();
                    this.setupRealTimeUpdates();
                    this.setupHeartbeat();
                    
                    // Auto fullscreen if configured
                    if (this.options.fullscreen) {
                        this.requestFullscreen();
                    }
                } else {
                    // Show error
                    this.showError('Failed to register device');
                    
                    // Re-enable button
                    if (registerBtn) {
                        registerBtn.disabled = false;
                        registerBtn.textContent = 'Register Display';
                    }
                }
            },
            error: () => {
                // Show error
                this.showError('Failed to register device');
                
                // Re-enable button
                if (registerBtn) {
                    registerBtn.disabled = false;
                    registerBtn.textContent = 'Register Display';
                }
            }
        });
    },
    
    /**
     * Render the main UI
     */
    renderUI: function() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="customer-display-layout">
                <div class="display-header">
                    <div class="brand-container" id="brand-container">
                        <div class="brand-logo"></div>
                        <div class="brand-name"></div>
                    </div>
                    <div class="display-controls">
                        <button id="fullscreen-btn" class="control-button">
                            <i class="fa fa-expand"></i>
                        </button>
                        <button id="settings-btn" class="control-button">
                            <i class="fa fa-cog"></i>
                        </button>
                    </div>
                </div>
                <div class="display-content" id="display-content">
                    <div class="welcome-screen">
                        <div class="welcome-message">
                            <h2>Welcome</h2>
                            <p>Customer Display is ready</p>
                            <p class="device-info">Device ID: ${this.settings.deviceId}</p>
                            <p class="device-info">Name: ${this.settings.displayName}</p>
                        </div>
                    </div>
                </div>
                <div class="display-footer">
                    <div class="ticker-container" id="ticker-container">
                        <div class="ticker-content">Welcome to IMOGI POS Customer Display</div>
                    </div>
                </div>
            </div>
            <div id="error-container" class="error-container"></div>
        `;
        
        // Bind control buttons
        const fullscreenBtn = this.container.querySelector('#fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.requestFullscreen();
            });
        }
        
        const settingsBtn = this.container.querySelector('#settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
        
        // Load current blocks
        this.renderBlocks();
    },
    
    /**
     * Render blocks based on the current state
     */
    renderBlocks: function() {
        const displayContent = this.container.querySelector('#display-content');
        if (!displayContent) return;
        
        // Different rendering based on current display mode
        switch (this.state.currentDisplay) {
            case 'order':
                this.renderOrderDisplay(displayContent);
                break;
                
            case 'payment':
                this.renderPaymentDisplay(displayContent);
                break;
                
            case 'promo':
                this.renderPromoDisplay(displayContent);
                break;
                
            case 'welcome':
            default:
                // Already rendered in renderUI
                break;
        }
    },
    
    /**
     * Render order display
     * @param {HTMLElement} container - Container to render into
     */
    renderOrderDisplay: function(container) {
        if (!this.state.currentOrder) return;
        
        const order = this.state.currentOrder;
        
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
        }
        
        container.innerHTML = `
            <div class="order-display">
                <div class="order-header">
                    <h2>Order Summary</h2>
                    ${order.table ? `<div class="order-table">Table: ${order.table}</div>` : ''}
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
        `;
    },
    
    /**
     * Render payment display
     * @param {HTMLElement} container - Container to render into
     */
    renderPaymentDisplay: function(container) {
        if (!this.state.currentPayment) return;
        
        const payment = this.state.currentPayment;
        
        // Render QR code if available
        let qrHtml = '';
        if (payment.qr_image) {
            qrHtml = `
                <div class="payment-qr-container">
                    <img src="${payment.qr_image}" class="payment-qr" alt="Payment QR Code">
                    <p class="payment-qr-instructions">Scan QR code to pay</p>
                </div>
            `;
        } else if (payment.payment_url) {
            qrHtml = `
                <div class="payment-url-container">
                    <a href="${payment.payment_url}" target="_blank" class="payment-url-button">
                        Pay Online
                    </a>
                    <p class="payment-url-instructions">Click the button to pay online</p>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="payment-display">
                <div class="payment-header">
                    <h2>Payment Request</h2>
                </div>
                <div class="payment-amount-container">
                    <div class="payment-amount-label">Total Amount</div>
                    <div class="payment-amount">${this.formatCurrency(payment.amount || 0)}</div>
                </div>
                
                ${qrHtml}
                
                <div class="payment-info">
                    <div class="payment-status" id="payment-status">Awaiting Payment</div>
                    ${payment.expires_at ? `
                        <div class="payment-expiry">Expires: ${this.formatDateTime(payment.expires_at)}</div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    /**
     * Render promotional display
     * @param {HTMLElement} container - Container to render into
     */
    renderPromoDisplay: function(container) {
        // Render promotional blocks
        if (this.state.blocks.length === 0) {
            container.innerHTML = `
                <div class="promo-display">
                    <div class="promo-placeholder">
                        <h2>No promotional content available</h2>
                    </div>
                </div>
            `;
            return;
        }
        
        let blocksHtml = '';
        this.state.blocks.forEach(block => {
            switch (block.block_type) {
                case 'image':
                    blocksHtml += `
                        <div class="promo-block image-block">
                            <img src="${block.image_url}" alt="${block.title || 'Promotional Image'}">
                        </div>
                    `;
                    break;
                    
                case 'text':
                    blocksHtml += `
                        <div class="promo-block text-block">
                            ${block.title ? `<h3>${block.title}</h3>` : ''}
                            <p>${block.content}</p>
                        </div>
                    `;
                    break;
                    
                case 'html':
                    blocksHtml += `
                        <div class="promo-block html-block">
                            ${block.html_content}
                        </div>
                    `;
                    break;
            }
        });
        
        container.innerHTML = `
            <div class="promo-display">
                ${blocksHtml}
            </div>
        `;
    },
    
    /**
     * Set up realtime updates
     */
    setupRealTimeUpdates: function() {
        // Listen for updates for this device
        if (this.settings.deviceId) {
            frappe.realtime.on(`customer_display:device:${this.settings.deviceId}`, (data) => {
                if (data && data.action) {
                    this.handleRealtimeUpdate(data);
                }
            });
        }
        
        // Listen for payment updates
        frappe.realtime.on('payment_update', (data) => {
            if (data && this.state.currentPayment && 
                data.payment_request === this.state.currentPayment.payment_request) {
                this.handlePaymentUpdate(data);
            }
        });
        
        // Listen for paired order updates
        if (this.settings.pairedOrder) {
            frappe.realtime.on(`customer_display:order:${this.settings.pairedOrder}`, (data) => {
                if (data && data.order) {
                    this.updateOrder(data.order);
                }
            });
        }
    },
    
    /**
     * Handle realtime updates for this device
     * @param {Object} data - Update data
     */
    handleRealtimeUpdate: function(data) {
        switch (data.action) {
            case 'show_order':
                if (data.order) {
                    this.showOrder(data.order);
                }
                break;
                
            case 'show_payment':
                if (data.payment) {
                    this.showPayment(data.payment);
                }
                break;
                
            case 'show_promo':
                if (data.blocks) {
                    this.state.blocks = data.blocks;
                }
                this.showPromo();
                break;
                
            case 'show_welcome':
                this.showWelcome();
                break;
                
            case 'update_ticker':
                if (data.ticker_text) {
                    this.updateTicker(data.ticker_text);
                }
                break;
                
            case 'update_brand':
                if (data.brand) {
                    this.updateBrand(data.brand);
                }
                break;
                
            case 'pair_order':
                if (data.order_id) {
                    this.settings.pairedOrder = data.order_id;
                    
                    // Subscribe to the order updates
                    frappe.realtime.on(`customer_display:order:${data.order_id}`, (orderData) => {
                        if (orderData && orderData.order) {
                            this.updateOrder(orderData.order);
                        }
                    });
                }
                break;
                
            case 'unpair_order':
                this.settings.pairedOrder = null;
                this.showWelcome();
                break;
        }
    },
    
    /**
     * Handle payment updates
     * @param {Object} data - Payment update data
     */
    handlePaymentUpdate: function(data) {
        // Update payment status
        const paymentStatus = this.container.querySelector('#payment-status');
        if (paymentStatus) {
            if (data.status === 'Paid') {
                paymentStatus.textContent = 'Payment Successful';
                paymentStatus.classList.add('status-paid');
                
                // Show success animation
                this.showPaymentSuccess();
            } else if (data.status === 'Expired') {
                paymentStatus.textContent = 'Payment Expired';
                paymentStatus.classList.add('status-expired');
            }
        }
    },
    
    /**
     * Show order display
     * @param {Object} order - Order data
     */
    showOrder: function(order) {
        this.state.currentOrder = order;
        this.state.currentDisplay = 'order';
        
        const displayContent = this.container.querySelector('#display-content');
        if (displayContent) {
            this.renderOrderDisplay(displayContent);
        }
    },
    
    /**
     * Update current order
     * @param {Object} order - Updated order data
     */
    updateOrder: function(order) {
        // Only update if currently showing this order
        if (this.state.currentDisplay === 'order' && this.state.currentOrder) {
            this.state.currentOrder = order;
            
            const displayContent = this.container.querySelector('#display-content');
            if (displayContent) {
                this.renderOrderDisplay(displayContent);
            }
        }
    },
    
    /**
     * Show payment display
     * @param {Object} payment - Payment data
     */
    showPayment: function(payment) {
        this.state.currentPayment = payment;
        this.state.currentDisplay = 'payment';
        
        const displayContent = this.container.querySelector('#display-content');
        if (displayContent) {
            this.renderPaymentDisplay(displayContent);
        }
    },
    
    /**
     * Show promotional display
     */
    showPromo: function() {
        this.state.currentDisplay = 'promo';
        
        const displayContent = this.container.querySelector('#display-content');
        if (displayContent) {
            this.renderPromoDisplay(displayContent);
        }
    },
    
    /**
     * Show welcome screen
     */
    showWelcome: function() {
        this.state.currentDisplay = 'welcome';
        
        const displayContent = this.container.querySelector('#display-content');
        if (displayContent) {
            displayContent.innerHTML = `
                <div class="welcome-screen">
                    <div class="welcome-message">
                        <h2>Welcome</h2>
                        <p>Customer Display is ready</p>
                        <p class="device-info">Device ID: ${this.settings.deviceId}</p>
                        <p class="device-info">Name: ${this.settings.displayName}</p>
                    </div>
                </div>
            `;
        }
    },
    
    /**
     * Show payment success animation
     */
    showPaymentSuccess: function() {
        const displayContent = this.container.querySelector('#display-content');
        if (!displayContent) return;
        
        // Create success overlay
        const successOverlay = document.createElement('div');
        successOverlay.className = 'payment-success-overlay';
        successOverlay.innerHTML = `
            <div class="success-animation">
                <i class="fa fa-check-circle success-icon"></i>
                <h2>Payment Successful</h2>
            </div>
        `;
        
        // Add to display
        displayContent.appendChild(successOverlay);
        
        // Remove after animation
        setTimeout(() => {
            if (successOverlay.parentNode) {
                successOverlay.parentNode.removeChild(successOverlay);
            }
            
            // Return to welcome screen after delay
            setTimeout(() => {
                this.showWelcome();
            }, 2000);
        }, 3000);
    },
    
    /**
     * Update ticker text
     * @param {string} text - Ticker text
     */
    updateTicker: function(text) {
        const tickerContent = this.container.querySelector('.ticker-content');
        if (tickerContent) {
            tickerContent.textContent = text;
        }
    },
    
    /**
     * Update brand display
     * @param {Object} brand - Brand data
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
     * Set up heartbeat to keep device active
     */
    setupHeartbeat: function() {
        // Clear any existing interval
        if (this.state.heartbeatInterval) {
            clearInterval(this.state.heartbeatInterval);
        }
        
        // Set up new interval
        this.state.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.settings.refreshInterval);
        
        // Send initial heartbeat
        this.sendHeartbeat();
    },
    
    /**
     * Send heartbeat to server
     */
    sendHeartbeat: function() {
        if (!this.settings.deviceId) return;
        
        frappe.call({
            method: 'imogi_pos.api.customer_display.post_display_heartbeat',
            args: {
                device_id: this.settings.deviceId
            },
            callback: (response) => {
                if (response.message) {
                    this.state.lastHeartbeat = new Date();
                    
                    // If paired order has changed, update subscription
                    if (response.message.paired_order && 
                        response.message.paired_order !== this.settings.pairedOrder) {
                        
                        this.settings.pairedOrder = response.message.paired_order;
                        
                        // Subscribe to the new order
                        frappe.realtime.on(`customer_display:order:${response.message.paired_order}`, (data) => {
                            if (data && data.order) {
                                this.updateOrder(data.order);
                            }
                        });
                    }
                }
            }
        });
    },
    
    /**
     * Show settings overlay
     */
    showSettings: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Display Settings</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-section">
                            <h4>Device Information</h4>
                            <div class="info-row">
                                <div class="info-label">Device ID</div>
                                <div class="info-value">${this.settings.deviceId}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Display Name</div>
                                <div class="info-value">${this.settings.displayName}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Paired Order</div>
                                <div class="info-value">${this.settings.pairedOrder || 'None'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Last Heartbeat</div>
                                <div class="info-value">${this.state.lastHeartbeat ? this.formatDateTime(this.state.lastHeartbeat) : 'None'}</div>
                            </div>
                        </div>
                        <div class="settings-actions">
                            <button id="fullscreen-settings-btn" class="settings-button">
                                <i class="fa fa-expand"></i> Fullscreen
                            </button>
                            <button id="test-connection-btn" class="settings-button">
                                <i class="fa fa-sync"></i> Test Connection
                            </button>
                            <button id="reset-device-btn" class="settings-button danger">
                                <i class="fa fa-trash"></i> Reset Device
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind action buttons
        const fullscreenBtn = modalContainer.querySelector('#fullscreen-settings-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.requestFullscreen();
            });
        }
        
        const testConnectionBtn = modalContainer.querySelector('#test-connection-btn');
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => {
                this.sendHeartbeat();
                this.showToast('Connection test sent');
            });
        }
        
        const resetDeviceBtn = modalContainer.querySelector('#reset-device-btn');
        if (resetDeviceBtn) {
            resetDeviceBtn.addEventListener('click', () => {
                this.confirmResetDevice();
            });
        }
    },
    
    /**
     * Confirm device reset
     */
    confirmResetDevice: function() {
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        modalContainer.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Confirm Reset</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to reset this device? This will remove all device registration and require setup again.</p>
                    </div>
                    <div class="modal-footer">
                        <button id="confirm-reset-btn" class="modal-button danger">Reset Device</button>
                        <button id="cancel-reset-btn" class="modal-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(modalContainer);
        
        // Bind close button
        const closeBtn = modalContainer.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        // Bind action buttons
        const cancelBtn = modalContainer.querySelector('#cancel-reset-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
            });
        }
        
        const confirmBtn = modalContainer.querySelector('#confirm-reset-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.resetDevice();
                document.body.removeChild(modalContainer);
                
                // Close settings modal if open
                const settingsModal = document.querySelector('.modal-container');
                if (settingsModal) {
                    document.body.removeChild(settingsModal);
                }
            });
        }
    },
    
    /**
     * Reset device
     */
    resetDevice: function() {
        // Clear localStorage
        localStorage.removeItem('imogi_customer_display_name');
        
        // Clear settings and state
        this.settings.deviceId = null;
        this.settings.displayName = null;
        this.settings.pairedOrder = null;
        this.state.isRegistered = false;
        
        // Clear heartbeat interval
        if (this.state.heartbeatInterval) {
            clearInterval(this.state.heartbeatInterval);
            this.state.heartbeatInterval = null;
        }
        
        // Show registration form
        this.showRegistrationForm();
    },
    
    /**
     * Request fullscreen mode
     */
    requestFullscreen: function() {
        if (!this.container) return;
        
        if (this.container.requestFullscreen) {
            this.container.requestFullscreen();
        } else if (this.container.mozRequestFullScreen) { // Firefox
            this.container.mozRequestFullScreen();
        } else if (this.container.webkitRequestFullscreen) { // Chrome, Safari and Opera
            this.container.webkitRequestFullscreen();
        } else if (this.container.msRequestFullscreen) { // IE/Edge
            this.container.msRequestFullscreen();
        }
    },
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError: function(message) {
        const errorContainer = this.container.querySelector('#error-container');
        if (!errorContainer) return;
        
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.innerHTML = `
            <div class="error-content">
                <i class="fa fa-exclamation-circle error-icon"></i>
                <div class="error-text">${message}</div>
            </div>
            <button class="error-close">&times;</button>
        `;
        
        errorContainer.appendChild(errorElement);
        
        // Bind close button
        const closeBtn = errorElement.querySelector('.error-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                errorContainer.removeChild(errorElement);
            });
        }
        
        // Auto-remove after delay
        setTimeout(() => {
            if (errorElement.parentNode === errorContainer) {
                errorContainer.removeChild(errorElement);
            }
        }, 5000);
    },
    
    /**
     * Show toast message
     * @param {string} message - Toast message
     */
    showToast: function(message) {
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fa fa-info-circle toast-icon"></i>
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        document.body.appendChild(toastContainer);
        
        // Auto-remove after delay
        setTimeout(() => {
            document.body.removeChild(toastContainer);
        }, 3000);
    },
    
    /**
     * Format date and time
     * @param {Date|string} datetime - Date or ISO datetime string
     * @returns {string} Formatted date and time
     */
    formatDateTime: function(datetime) {
        if (!datetime) return '';
        
        const date = datetime instanceof Date ? datetime : new Date(datetime);
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