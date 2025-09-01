frappe.ready(function() {
    // Initialize Customer Display
    const CustomerDisplay = {
        config: CONFIG,
        deviceId: DEVICE_ID,
        isRegistered: IS_REGISTERED,
        displayConfig: DISPLAY_CONFIG,
        linkedOrder: LINKED_ORDER,
        tickerMessage: TICKER_MESSAGE,
        promotionalContent: PROMOTIONAL_CONTENT,
        branding: BRANDING,
        currencySymbol: CURRENCY_SYMBOL,
        currentPaymentRequest: null,
        
        // State tracking
        heartbeatInterval: null,
        refreshInterval: null,
        activePromoIndex: 0,
        promoInterval: null,
        
        init: function() {
            if (!this.isRegistered) {
                // Not registered, show registration screen
                this.hideLoading();
                return;
            }
            
            // Render display
            this.renderDisplay();
            
            // Setup intervals
            this.setupHeartbeat();
            this.setupAutoRefresh();
            
            // Setup realtime updates
            this.setupRealtimeUpdates();
            
            // Setup fullscreen
            if (this.config.fullscreen) {
                this.setupFullscreen();
            }
            
            // Hide loading screen
            this.hideLoading();
        },
        
        renderDisplay: function() {
            const displayContainer = document.getElementById('customer-display');
            const blocks = this.displayConfig.blocks || [];
            let html = '';
            
            blocks.forEach(block => {
                const height = block.height || 'auto';
                const positionClass = `block-${block.position || 'middle'}`;
                
                html += `<div class="display-block block-${block.type} ${positionClass}" style="height: ${height};" id="block-${block.type}">`;
                
                // Render block content based on type
                switch (block.type) {
                    case 'branding':
                        html += this.renderBrandingBlock();
                        break;
                    case 'order_summary':
                        html += this.renderOrderSummaryBlock();
                        break;
                    case 'payment':
                        html += this.renderPaymentBlock();
                        break;
                    case 'ticker':
                        html += this.renderTickerBlock(block.content || this.tickerMessage);
                        break;
                    case 'promotion':
                        html += this.renderPromotionBlock();
                        break;
                    default:
                        html += `<div>Unsupported block type: ${block.type}</div>`;
                }
                
                html += '</div>';
            });
            
            displayContainer.innerHTML = html;
            displayContainer.style.display = 'flex';
            
            // Initialize promotional content slideshow if present
            if (blocks.some(block => block.type === 'promotion')) {
                this.startPromotionSlideshow();
            }
        },
        
        renderBrandingBlock: function() {
            return `
                <div class="branding-container">
                    ${this.branding.logo ?
                        (this.branding.logo_dark ?
                            `<picture><source srcset="${this.branding.logo_dark}" media="(prefers-color-scheme: dark)"><img src="${this.branding.logo}" alt="${this.branding.name}" class="brand-logo"></picture>` :
                            `<img src="${this.branding.logo}" alt="${this.branding.name}" class="brand-logo">`)
                        : `<div class="brand-name">${this.branding.name}</div>`}
                </div>
            `;
        },
        
        renderOrderSummaryBlock: function() {
            if (!this.linkedOrder) {
                return `
                    <div class="empty-order">
                        <p>No order currently linked to this display.</p>
                    </div>
                `;
            }
            
            const order = this.linkedOrder;
            let itemsHtml = '';
            
            order.items.forEach(item => {
                itemsHtml += `
                    <div class="order-item">
                        <div class="item-name-qty">
                            <span class="item-qty">${item.qty}x</span>
                            <span class="item-name">${item.item_name}</span>
                        </div>
                        <div class="item-amount">${this.formatCurrency(item.amount)}</div>
                    </div>
                `;
            });
            
            return `
                <div class="order-container">
                    <div class="order-header">
                        <div class="order-title">Order Summary</div>
                        <div class="order-meta">
                            ${order.table ? `<div class="order-meta-item">Table ${order.table}</div>` : ''}
                            <div class="order-meta-item">${order.timestamp}</div>
                        </div>
                    </div>
                    
                    <div class="order-items">
                        ${itemsHtml}
                    </div>
                    
                    <div class="order-total">
                        <span>Total</span>
                        <span>${this.formatCurrency(order.total)}</span>
                    </div>
                </div>
            `;
        },
        
        renderPaymentBlock: function() {
            return `
                <div class="payment-container" id="payment-container">
                    <div class="payment-waiting">
                        <div class="payment-header">Awaiting Payment Request</div>
                        <p class="payment-instructions">
                            Your payment information will appear here when ready.
                        </p>
                    </div>
                </div>
            `;
        },
        
        renderTickerBlock: function(message) {
            return `
                <div class="ticker-wrapper">
                    <div class="ticker-content">${message}</div>
                </div>
            `;
        },
        
        renderPromotionBlock: function() {
            if (!this.promotionalContent || this.promotionalContent.length === 0) {
                return `
                    <div class="promotion-container">
                        <div class="promotion-slide active">
                            <div class="promotion-content">
                                Welcome to ${this.branding.name}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            let slidesHtml = '';
            this.promotionalContent.forEach((promo, index) => {
                slidesHtml += `
                    <div class="promotion-slide ${index === 0 ? 'active' : ''}">
                        ${promo.image ? `<img src="${promo.image}" alt="${promo.title}" class="promotion-image">` : ''}
                        <div class="promotion-title">${promo.title || ''}</div>
                        <div class="promotion-content">${promo.content || ''}</div>
                    </div>
                `;
            });
            
            return `
                <div class="promotion-container">
                    ${slidesHtml}
                </div>
            `;
        },
        
        updatePaymentBlock: function(paymentData) {
            const container = document.getElementById('payment-container');
            if (!container) return;
            
            this.currentPaymentRequest = paymentData;
            
            // Format expiry time
            let expiryText = '';
            if (paymentData.expires_at) {
                const expiryDate = new Date(paymentData.expires_at);
                expiryText = `Valid until ${expiryDate.toLocaleTimeString()}`;
            }
            
            container.innerHTML = `
                <div class="payment-active">
                    <div class="payment-header">Please Complete Payment</div>
                    <div class="payment-amount">${this.formatCurrency(paymentData.amount)}</div>
                    
                    ${paymentData.qr_image ? 
                        `<img src="${paymentData.qr_image}" alt="Payment QR Code" class="payment-qr">` : ''}
                    
                    <div class="payment-instructions">
                        Scan the QR code above with your payment app to complete your transaction.
                    </div>
                    
                    ${paymentData.payment_url ? 
                        `<div class="payment-link">
                            <a href="${paymentData.payment_url}" target="_blank">${paymentData.payment_url}</a>
                        </div>` : ''}
                    
                    ${expiryText ? `<div class="payment-expires">${expiryText}</div>` : ''}
                </div>
            `;
        },
        
        clearPaymentBlock: function() {
            const container = document.getElementById('payment-container');
            if (!container) return;
            
            this.currentPaymentRequest = null;
            
            container.innerHTML = `
                <div class="payment-waiting">
                    <div class="payment-header">Payment Completed</div>
                    <p class="payment-instructions">
                        Thank you for your payment!
                    </p>
                </div>
            `;
            
            // After 5 seconds, return to waiting state
            setTimeout(() => {
                if (!this.currentPaymentRequest) {
                    container.innerHTML = `
                        <div class="payment-waiting">
                            <div class="payment-header">Awaiting Payment Request</div>
                            <p class="payment-instructions">
                                Your payment information will appear here when ready.
                            </p>
                        </div>
                    `;
                }
            }, 5000);
        },
        
        setupHeartbeat: function() {
            // Clear any existing interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
            
            // Setup heartbeat ping
            this.heartbeatInterval = setInterval(() => {
                this.sendHeartbeat();
            }, this.config.heartbeat_interval || 30000);
            
            // Send initial heartbeat
            this.sendHeartbeat();
        },
        
        sendHeartbeat: function() {
            frappe.call({
                method: 'imogi_pos.api.customer_display.post_display_heartbeat',
                args: {
                    device_id: this.deviceId
                },
                callback: function(response) {
                    // Silent success
                },
                error: function(err) {
                    console.error('Heartbeat error:', err);
                }
            });
        },
        
        setupAutoRefresh: function() {
            // Clear any existing interval
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            // Setup auto refresh
            this.refreshInterval = setInterval(() => {
                window.location.reload();
            }, this.config.refresh_interval || 300000);
        },
        
        startPromotionSlideshow: function() {
            if (!this.promotionalContent || this.promotionalContent.length <= 1) return;
            
            // Clear any existing interval
            if (this.promoInterval) {
                clearInterval(this.promoInterval);
            }
            
            // Setup slideshow
            this.promoInterval = setInterval(() => {
                this.activePromoIndex = (this.activePromoIndex + 1) % this.promotionalContent.length;
                this.updatePromotionSlides();
            }, 10000); // Change every 10 seconds
        },
        
        updatePromotionSlides: function() {
            const slides = document.querySelectorAll('.promotion-slide');
            if (!slides.length) return;
            
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === this.activePromoIndex);
            });
        },
        
        setupRealtimeUpdates: function() {
            if (!frappe.realtime) return;
            
            // Listen for updates to this specific device
            const deviceChannel = `customer_display:device:${this.deviceId}`;
            frappe.realtime.on(deviceChannel, (data) => {
                if (data.event_type === 'refresh') {
                    window.location.reload();
                } else if (data.event_type === 'update_order') {
                    this.linkedOrder = data.order;
                    this.renderOrderSummaryBlock();
                } else if (data.event_type === 'clear_order') {
                    this.linkedOrder = null;
                    this.renderOrderSummaryBlock();
                }
            });
            
            // Listen for payment request updates
            frappe.realtime.on('payment:pr:*', (data) => {
                if (data.event_type === 'payment_request') {
                    this.updatePaymentBlock(data.data);
                } else if (data.event_type === 'payment_completed') {
                    this.clearPaymentBlock();
                } else if (data.event_type === 'payment_expired') {
                    // If it's the current payment request that expired
                    if (this.currentPaymentRequest && 
                        this.currentPaymentRequest.payment_request === data.payment_request) {
                        this.clearPaymentBlock();
                    }
                }
            });
            
            // If linked to an order, listen for order updates
            if (this.linkedOrder) {
                const orderChannel = `customer_display:order:${this.linkedOrder.name}`;
                frappe.realtime.on(orderChannel, (data) => {
                    if (data.event_type === 'update_order') {
                        this.linkedOrder = data.order;
                        
                        // Update the order summary block
                        const summaryBlock = document.getElementById('block-order_summary');
                        if (summaryBlock) {
                            summaryBlock.innerHTML = this.renderOrderSummaryBlock();
                        }
                    }
                });
            }
        },
        
        setupFullscreen: function() {
            // Add fullscreen button
            const fullscreenBtn = document.createElement('button');
            fullscreenBtn.className = 'fullscreen-btn';
            fullscreenBtn.innerHTML = '<i class="fa fa-expand"></i>';
            fullscreenBtn.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                z-index: 1000;
                background: rgba(0,0,0,0.3);
                color: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0.3;
                transition: opacity 0.3s;
            `;
            
            document.body.appendChild(fullscreenBtn);
            
            // Show button on mouse movement
            document.addEventListener('mousemove', () => {
                fullscreenBtn.style.opacity = '1';
                
                // Hide after 3 seconds of inactivity
                clearTimeout(this.fullscreenBtnTimeout);
                this.fullscreenBtnTimeout = setTimeout(() => {
                    fullscreenBtn.style.opacity = '0.3';
                }, 3000);
            });
            
            // Toggle fullscreen on click
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
            
            // Also allow keyboard shortcut (F11 or F)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
                    this.toggleFullscreen();
                    e.preventDefault();
                }
            });
            
            // Try to auto-enter fullscreen mode on init
            if (this.config.fullscreen) {
                setTimeout(() => {
                    this.requestFullscreen();
                }, 1000);
            }
        },
        
        toggleFullscreen: function() {
            if (!document.fullscreenElement) {
                this.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        },
        
        requestFullscreen: function() {
            const docEl = document.documentElement;
            
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen();
            } else if (docEl.mozRequestFullScreen) { // Firefox
                docEl.mozRequestFullScreen();
            } else if (docEl.webkitRequestFullscreen) { // Chrome, Safari, Opera
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) { // IE/Edge
                docEl.msRequestFullscreen();
            }
        },
        
        hideLoading: function() {
            const loadingScreen = document.querySelector('.loading-screen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }
        },
        
        formatCurrency: function(value) {
            return this.currencySymbol + ' ' + parseFloat(value).toFixed(2);
        }
    };
    
    // Initialize the customer display
    CustomerDisplay.init();
});

// Handle visibility changes (tab switching)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Page is now visible, refresh to get latest data
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
});