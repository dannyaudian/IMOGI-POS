frappe.ready(async function() {
    const POS_PROFILE_DATA = {};

    try {
        if (typeof POS_PROFILE === 'string') {
            const { message } = await frappe.call({
                method: 'imogi_pos.api.public.get_pos_profile_details',
                args: { profile: POS_PROFILE }
            });
            if (!message) {
                throw new Error('POS profile not found');
            }
            Object.assign(POS_PROFILE_DATA, message);
        } else if (typeof POS_PROFILE === 'object' && POS_PROFILE !== null) {
            Object.assign(POS_PROFILE_DATA, POS_PROFILE);
        } else {
            throw new Error('Invalid POS profile');
        }
    } catch (error) {
        console.error('Failed to load POS profile:', error);
        frappe.msgprint({
            title: __('Error'),
            message: __('Failed to load POS profile. Please refresh or contact the administrator.'),
            indicator: 'red'
        });
        return;
    }

    // =====================
    // State Management
    // =====================
    const KioskApp = {
        // State
        items: [],
        filteredItems: [],
        cart: [],
        categories: [],
        selectedCategory: 'all',
        searchQuery: '',
        selectedTemplateItem: null,
        selectedVariant: null,
        taxRate: 0,
        discountPercent: 0,
        discountAmount: 0,

        // Tracking the created POS Order
        posOrder: null,

        // Queue number for the last created order
        queueNumber: null,

        // Payment state
        paymentRequest: null,
        paymentMethod: 'qr_code',
        cashAmount: 0,
        paymentTimer: null,
        paymentCountdown: 300, // 5 minutes
        
        // Element references
        elements: {
            catalogGrid: document.getElementById('catalog-grid'),
            cartItems: document.getElementById('cart-items'),
            cartSubtotal: document.getElementById('cart-subtotal'),
            cartTax: document.getElementById('cart-tax'),
            cartDiscount: document.getElementById('cart-discount'),
            cartTotal: document.getElementById('cart-total'),
            checkoutBtn: document.getElementById('btn-checkout'),
            clearBtn: document.getElementById('btn-clear'),
            searchInput: document.getElementById('search-input'),
            categoriesContainer: document.getElementById('categories-container'),
            
            // Variant modal
            variantModal: document.getElementById('variant-modal'),
            variantGrid: document.getElementById('variant-grid'),
            itemNotes: document.getElementById('item-notes'),
            variantAddBtn: document.getElementById('btn-variant-add'),
            variantCancelBtn: document.getElementById('btn-variant-cancel'),
            
            // Payment modal
            paymentModal: document.getElementById('payment-modal'),
            paymentAmount: document.getElementById('payment-amount'),
            paymentQrSection: document.getElementById('payment-qr-section'),
            paymentCashSection: document.getElementById('payment-cash-section'),
            paymentQr: document.getElementById('payment-qr'),
            paymentTimer: document.getElementById('payment-timer'),
            paymentCountdown: document.getElementById('payment-countdown'),
            paymentStatus: document.getElementById('payment-status'),
            cashAmount: document.getElementById('cash-amount'),
            changeAmount: document.getElementById('change-amount'),
            paymentConfirmBtn: document.getElementById('btn-payment-confirm'),
            paymentCancelBtn: document.getElementById('btn-payment-cancel'),
            
            // Success modal
            successModal: document.getElementById('success-modal'),
            successQueueNumber: document.getElementById('success-queue-number'),
            successDoneBtn: document.getElementById('btn-success-done'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text')
        },
        
        // Initialize
        init: async function() {
            this.setupEventListeners();
            await this.loadItems();
            this.renderCategories();
            await this.loadTaxTemplate();
            this.renderItems();
            this.updateCartTotals();
            this.setupPrintService();
            
            // Setup realtime if available
            if (frappe.realtime) {
                this.setupRealtimeUpdates();
            }
        },
        
        // Event listeners
        setupEventListeners: function() {
            // Search
            this.elements.searchInput.addEventListener('input', this.handleSearch.bind(this));
            
            // Category filters
            this.elements.categoriesContainer.addEventListener('click', (e) => {
                const pill = e.target.closest('.category-pill');
                if (pill) {
                    this.selectCategory(pill.dataset.category);
                }
            });
            
            // Cart buttons
            this.elements.checkoutBtn.addEventListener('click', this.handleCheckout.bind(this));
            this.elements.clearBtn.addEventListener('click', this.clearCart.bind(this));
            
            // Variant modal
            this.elements.variantModal.querySelector('.modal-close').addEventListener('click', () => {
                this.closeVariantModal();
            });
            this.elements.variantCancelBtn.addEventListener('click', () => {
                this.closeVariantModal();
            });
            this.elements.variantAddBtn.addEventListener('click', () => {
                this.addSelectedVariantToCart();
            });
            
            // Payment modal
            this.elements.paymentModal.querySelector('.modal-close').addEventListener('click', () => {
                this.cancelPayment();
            });
            this.elements.paymentCancelBtn.addEventListener('click', () => {
                this.cancelPayment();
            });
            this.elements.paymentConfirmBtn.addEventListener('click', () => {
                this.confirmPayment();
            });
            
            // Payment method selection
            const paymentOptions = document.querySelectorAll('.payment-option');
            paymentOptions.forEach(option => {
                option.addEventListener('click', () => {
                    paymentOptions.forEach(o => o.classList.remove('selected'));
                    option.classList.add('selected');
                    this.paymentMethod = option.dataset.method;
                    this.togglePaymentMethod();
                });
            });
            
            // Keypad
            const keypadButtons = document.querySelectorAll('.keypad-button');
            keypadButtons.forEach(button => {
                button.addEventListener('click', () => {
                    this.handleKeypadInput(button.dataset.value);
                });
            });
            
            // Success modal
            this.elements.successDoneBtn.addEventListener('click', () => {
                this.closeSuccessModal();
                this.resetApp();
            });
        },
        
        // Data loading
        loadItems: async function() {
            this.showLoading('Loading catalog...');
            
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_items_with_stock',
                    args: {
                        warehouse: POS_PROFILE_DATA.warehouse,
                        limit: 500
                    }
                });

                if (response.message) {
                    // Filter out variants but include template items and standalone items
                    this.items = response.message.filter(item => !item.variant_of);
                    this.filteredItems = [...this.items];

                    // Load rates for items that don't have standard_rate
                    await this.loadItemRates();

                    // Build unique list of categories from loaded items
                    const categorySet = new Set();
                    this.items.forEach(item => {
                        const category = item.menu_category || item.item_group;
                        if (category) {
                            categorySet.add(category);
                        }
                    });
                    this.categories = Array.from(categorySet);
                }
                
                this.hideLoading();
            } catch (error) {
                console.error("Error loading items:", error);
                this.showError("Failed to load items. Please try again.");
                this.hideLoading();
            }
        },
        
        loadItemRates: async function() {
            const itemsWithoutRate = this.items.filter(item => !item.standard_rate);
            if (!itemsWithoutRate.length) return;
            
            try {
                const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Price',
                        filters: {
                            item_code: ['in', itemsWithoutRate.map(item => item.name)],
                            price_list: POS_PROFILE_DATA.selling_price_list
                        },
                        fields: ['item_code', 'price_list_rate']
                    }
                });
                
                if (response.message) {
                    // Update item rates
                    response.message.forEach(price => {
                        const item = this.items.find(i => i.name === price.item_code);
                        if (item) {
                            item.standard_rate = price.price_list_rate;
                        }
                    });
                }
            } catch (error) {
                console.error("Error loading item rates:", error);
            }
        },

        loadTaxTemplate: async function() {
            this.taxRate = 0.11;
            this.updateCartTotals();
        },

        loadVariantsForTemplate: async function(templateItem) {
            this.showLoading('Loading variants...');
            
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_item_variants',
                    args: {
                        template_item: templateItem.name
                    }
                });
                
                this.hideLoading();
                
                if (response.message) {
                    return response.message;
                }
                
                return [];
            } catch (error) {
                console.error("Error loading variants:", error);
                this.showError("Failed to load variants. Please try again.");
                this.hideLoading();
                return [];
            }
        },
        
        // Rendering
        renderCategories: function() {
            const categories = ['all', ...this.categories];
            const html = categories.map(cat => {
                const label = cat === 'all' ? 'All' : cat;
                const activeClass = this.selectedCategory === cat ? ' active' : '';
                return `<div class="category-pill${activeClass}" data-category="${cat}">${label}</div>`;
            }).join('');
            this.elements.categoriesContainer.innerHTML = html;
        },

        renderItems: function() {
            if (!this.filteredItems.length) {
                this.elements.catalogGrid.innerHTML = `
                    <div class="empty-catalog">
                        <p>No items found</p>
                    </div>
                `;
                return;
            }

            let html = '';
            this.filteredItems.forEach(item => {
                const imageUrl = item.photo || item.image || '/assets/erpnext/images/default-product-image.png';

                html += `
                    <div class="item-card" data-item="${item.name}">
                        <div class="item-image" style="background-image: url('${imageUrl}')"></div>
                        <div class="item-info">
                            <div class="item-name">${item.item_name}</div>
                            <div class="item-price">${formatRupiah(item.standard_rate || 0)}</div>
                            ${item.has_variants ? '<div class="item-has-variants">Multiple options</div>' : ''}
                        </div>
                    </div>
                `;
            });

            this.elements.catalogGrid.innerHTML = html;

            // Add click handlers
            const itemCards = this.elements.catalogGrid.querySelectorAll('.item-card');
            itemCards.forEach(card => {
                card.addEventListener('click', () => {
                    const itemName = card.dataset.item;
                    const item = this.items.find(i => i.name === itemName);
                    if (item) {
                        this.handleItemClick(item);
                    }
                });
            });
        },
        
        renderCart: function() {
            if (this.cart.length === 0) {
                this.elements.cartItems.innerHTML = `
                    <div class="empty-cart">
                        <p>Your cart is empty</p>
                        <p>Select items from the menu</p>
                    </div>
                `;
                
                this.elements.checkoutBtn.disabled = true;
                this.elements.clearBtn.disabled = true;
                return;
            }
            
            let html = '';
            
            this.cart.forEach((item, index) => {
                html += `
                    <div class="cart-item" data-index="${index}">
                        <div class="cart-item-header">
                            <div class="cart-item-name">${item.item_name}</div>
                            <div class="cart-item-price">${CURRENCY_SYMBOL} ${formatNumber(item.amount)}</div>
                        </div>
                        <div class="cart-item-controls">
                            <button class="qty-btn qty-minus" data-index="${index}">-</button>
                            <input type="number" class="cart-item-qty" value="${item.qty}" min="1" data-index="${index}">
                            <button class="qty-btn qty-plus" data-index="${index}">+</button>
                        </div>
                        ${item.notes ? `<div class="cart-item-notes">${item.notes}</div>` : ''}
                        <div class="cart-item-remove" data-index="${index}">&times;</div>
                    </div>
                `;
            });
            
            this.elements.cartItems.innerHTML = html;

            // Add event listeners
            const qtyInputs = this.elements.cartItems.querySelectorAll('.cart-item-qty');
            const removeButtons = this.elements.cartItems.querySelectorAll('.cart-item-remove');

            this.elements.cartItems.addEventListener('click', e => {
                const index = Number(e.target.dataset.index);
                if (e.target.classList.contains('qty-plus')) {
                    e.preventDefault();
                    this.updateCartItemQuantity(index, this.cart[index].qty + 1);
                } else if (e.target.classList.contains('qty-minus')) {
                    e.preventDefault();
                    this.updateCartItemQuantity(index, this.cart[index].qty - 1);
                }
            });

            qtyInputs.forEach(input => {
                input.addEventListener('change', () => {
                    const index = parseInt(input.dataset.index);
                    this.updateCartItemQuantity(index, parseInt(input.value) || 1);
                });
            });

            removeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const index = parseInt(button.dataset.index);
                    this.removeCartItem(index);
                });
            });
            
            this.elements.checkoutBtn.disabled = false;
            this.elements.clearBtn.disabled = false;
        },
        
        renderVariants: function(variants) {
            if (!variants || variants.length === 0) {
                this.elements.variantGrid.innerHTML = `
                    <div class="empty-variants">
                        <p>No variants available for this item</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            
            variants.forEach(variant => {
                const attributes = variant.attributes || {};
                let attributesHtml = '';
                
                Object.keys(attributes).forEach(attr => {
                    attributesHtml += `
                        <div class="variant-attribute">
                            <span>${attr}:</span>
                            <span>${attributes[attr]}</span>
                        </div>
                    `;
                });
                
                html += `
                    <div class="variant-card" data-variant="${variant.name}">
                        <div class="variant-name">${variant.item_name}</div>
                        <div class="variant-price">${CURRENCY_SYMBOL} ${formatNumber(variant.standard_rate || 0)}</div>
                        ${attributesHtml ? `<div class="variant-attributes">${attributesHtml}</div>` : ''}
                    </div>
                `;
            });
            
            this.elements.variantGrid.innerHTML = html;
            
            // Add click handlers
            const variantCards = this.elements.variantGrid.querySelectorAll('.variant-card');
            variantCards.forEach(card => {
                card.addEventListener('click', () => {
                    variantCards.forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    
                    const variantName = card.dataset.variant;
                    this.selectedVariant = variants.find(v => v.name === variantName);
                    this.elements.variantAddBtn.disabled = false;
                });
            });
        },
        
        updateCartTotals: function() {
            const totals = this.calculateTotals();
            this.elements.cartSubtotal.textContent = formatRupiah(totals.subtotal);
            this.elements.cartTax.textContent = formatRupiah(totals.tax);
            if (this.elements.cartDiscount) {
                this.elements.cartDiscount.textContent = formatRupiah(totals.discount);
            }
            this.elements.cartTotal.textContent = formatRupiah(totals.total);
        },

        updateItemStock: function(itemCode, actualQty) {
            if (actualQty == null) {
                console.warn(`updateItemStock called without actualQty for ${itemCode}`);
                return;
            }
            const item = this.items.find(i => i.name === itemCode);
            if (item) {
                item.actual_qty = actualQty;
            }
            // Previously we toggled sold-out styles and badges here.
            // With the removal of the sold-out overlay, we only update the item's stock data.
        },

        refreshStockLevels: async function() {
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_items_with_stock',
                    args: {
                        warehouse: POS_PROFILE_DATA.warehouse,
                        limit: 500
                    }
                });
                if (response.message) {
                    response.message.forEach(updated => {
                        this.updateItemStock(updated.name, updated.actual_qty);
                    });
                }
            } catch (error) {
                console.error('Error refreshing stock levels:', error);
            }
        },

        // Event handlers
        handleSearch: function() {
            this.searchQuery = this.elements.searchInput.value.toLowerCase();
            this.filterItems();
        },
        
        selectCategory: function(category) {
            this.selectedCategory = category;
            
            // Update UI
            const pills = this.elements.categoriesContainer.querySelectorAll('.category-pill');
            pills.forEach(pill => {
                pill.classList.toggle('active', pill.dataset.category === category);
            });
            
            this.filterItems();
        },
        
        filterItems: function() {
            this.filteredItems = this.items.filter(item => {
                // Filter by search
                const matchesSearch = !this.searchQuery || 
                    item.item_name.toLowerCase().includes(this.searchQuery) ||
                    item.item_code.toLowerCase().includes(this.searchQuery) ||
                    (item.description && item.description.toLowerCase().includes(this.searchQuery));
                
                // Filter by category
                const matchesCategory = this.selectedCategory === 'all' || 
                    item.item_group === this.selectedCategory ||
                    item.menu_category === this.selectedCategory;
                
                return matchesSearch && matchesCategory;
            });
            
            this.renderItems();
        },
        
        handleItemClick: function(item) {
            if (item.has_variants) {
                // Open variant picker
                this.openVariantPicker(item);
            } else {
                // Add directly to cart
                this.addItemToCart(item);
            }
        },
        
        openVariantPicker: async function(item) {
            this.selectedTemplateItem = item;
            this.selectedVariant = null;
            
            // Reset notes
            if (this.elements.itemNotes) {
                this.elements.itemNotes.value = '';
            }
            
            // Disable add button until variant is selected
            this.elements.variantAddBtn.disabled = true;
            
            // Show modal
            this.elements.variantModal.style.display = 'flex';
            
            // Load variants
            const variants = await this.loadVariantsForTemplate(item);
            
            // Render variants
            this.renderVariants(variants);
        },
        
        closeVariantModal: function() {
            this.elements.variantModal.style.display = 'none';
            this.selectedTemplateItem = null;
            this.selectedVariant = null;
        },
        
        addSelectedVariantToCart: function() {
            if (!this.selectedVariant) return;
            
            const notes = this.elements.itemNotes ? this.elements.itemNotes.value : '';
            
            this.addItemToCart(this.selectedVariant, notes);
            this.closeVariantModal();
        },
        
        addItemToCart: function(item, notes = '') {
            // Check if item already in cart
            const existingIndex = this.cart.findIndex(i => i.item_code === item.name && i.notes === notes);
            
            if (existingIndex >= 0) {
                // Update quantity
                this.cart[existingIndex].qty += 1;
                this.cart[existingIndex].amount = this.cart[existingIndex].rate * this.cart[existingIndex].qty;
            } else {
                // Add new item
                this.cart.push({
                    item_code: item.name,
                    item_name: item.item_name,
                    qty: 1,
                    rate: item.standard_rate || 0,
                    amount: item.standard_rate || 0,
                    notes: notes,
                    kitchen: item.default_kitchen,
                    kitchen_station: item.default_kitchen_station
                });
            }
            
            this.renderCart();
            this.updateCartTotals();
        },
        
        updateCartItemQuantity: function(index, newQty) {
            if (newQty < 1) {
                this.removeCartItem(index);
                return;
            }
            
            this.cart[index].qty = newQty;
            this.cart[index].amount = this.cart[index].rate * newQty;
            
            this.renderCart();
            this.updateCartTotals();
        },
        
        removeCartItem: function(index) {
            this.cart.splice(index, 1);
            this.renderCart();
            this.updateCartTotals();
        },
        
        clearCart: function() {
            if (!this.cart.length) return;
            
            if (confirm('Are you sure you want to clear your order?')) {
                this.cart = [];
                this.renderCart();
                this.updateCartTotals();
            }
        },
        
        handleCheckout: function() {
            if (!this.cart.length) return;
            
            // Open payment modal
            this.openPaymentModal();
        },
        
        openPaymentModal: function() {
            const totals = this.calculateTotals();
            
            // Set payment amount
            this.elements.paymentAmount.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.total)}`;
            
            // Set cash amount to 0
            this.cashAmount = 0;
            this.elements.cashAmount.value = `${CURRENCY_SYMBOL} 0.00`;
            this.elements.changeAmount.textContent = `${CURRENCY_SYMBOL} 0.00`;
            
            // Set default payment method
            this.paymentMethod = 'qr_code';
            this.togglePaymentMethod();
            
            // Show modal
            this.elements.paymentModal.style.display = 'flex';
            
            // If payment gateway is enabled and QR selected, request payment QR
            if (this.paymentMethod === 'qr_code' && PAYMENT_SETTINGS.gateway_enabled) {
                this.requestPaymentQR();
            }
        },
        
        togglePaymentMethod: function() {
            // Show/hide sections based on payment method
            if (this.paymentMethod === 'qr_code') {
                this.elements.paymentQrSection.classList.remove('hidden');
                this.elements.paymentCashSection.classList.add('hidden');

                // Disable confirm button if gateway enabled (will be enabled when payment confirmed)
                // Otherwise, enable it for simulation mode
                this.elements.paymentConfirmBtn.disabled = PAYMENT_SETTINGS.gateway_enabled;
            } else {
                this.elements.paymentQrSection.classList.add('hidden');
                this.elements.paymentCashSection.classList.remove('hidden');

                // Enable confirm button when cash amount >= total
                const totals = this.calculateTotals();
                this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
            }
        },
        
        requestPaymentQR: async function() {
            this.showLoading('Generating payment QR code...');

            try {
                // Create POS Order first
                const orderResponse = await frappe.call({
                    method: 'imogi_pos.api.orders.create_order',
                    args: {
                        order_type: 'Kiosk',
                        branch: CURRENT_BRANCH,
                        pos_profile: POS_PROFILE.name,
                        customer: 'Walk-in Customer',
                        items: this.cart
                    }
                });

                if (!orderResponse.message) {
                    throw new Error('Failed to create order');
                }

                this.posOrder = orderResponse.message.name;
                this.queueNumber = orderResponse.message.queue_number;
                this.itemRows = (orderResponse.message.items || []).map(item => item.name);

                // Create draft invoice for payment
                const totals = this.calculateTotals();
                const invoiceResponse = await frappe.call({
                    method: 'imogi_pos.api.billing.generate_invoice',
                    args: {
                        pos_order: this.posOrder,
                        pos_profile: POS_PROFILE.name,
                        pos_session: ACTIVE_POS_SESSION,
                        mode_of_payment: 'Online',
                        amount: totals.total
                    }
                });
                
                if (!invoiceResponse.message) {
                    throw new Error('Failed to create invoice');
                }
                
                const invoice = invoiceResponse.message;
                
                // Now request payment
                const paymentResponse = await frappe.call({
                    method: 'imogi_pos.api.billing.request_payment',
                    args: {
                        sales_invoice: invoice.name
                    }
                });
                
                this.hideLoading();
                
                if (!paymentResponse.message) {
                    throw new Error('Failed to create payment request');
                }
                
                // Store payment request and invoice
                this.paymentRequest = {
                    ...paymentResponse.message,
                    invoice: invoice.name
                };
                
                // Update UI with payment QR
                if (this.paymentRequest.qr_image) {
                    this.elements.paymentQr.innerHTML = `<img src="${this.paymentRequest.qr_image}" alt="Payment QR Code">`;
                } else if (this.paymentRequest.payment_url) {
                    // Fallback to QR code generation from URL
                    this.elements.paymentQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.paymentRequest.payment_url)}" alt="Payment QR Code">`;
                }
                
                // Start countdown
                this.startPaymentCountdown();
                
                // Check payment status periodically if realtime not available
                if (!frappe.realtime) {
                    this.pollPaymentStatus();
                }
                
            } catch (error) {
                console.error("Error requesting payment:", error);
                this.showError("Failed to generate payment QR. Please try another payment method.");
                this.hideLoading();
                
                // Switch to cash as fallback
                const cashOption = document.querySelector('.payment-option[data-method="cash"]');
                if (cashOption) {
                    cashOption.click();
                }
            }
        },
        
        startPaymentCountdown: function() {
            // Clear existing timer
            if (this.paymentTimer) {
                clearInterval(this.paymentTimer);
            }
            
            // Set countdown from settings or default to 5 minutes
            this.paymentCountdown = PAYMENT_SETTINGS.payment_timeout || 300;
            this.updateCountdownDisplay();
            
            // Start countdown
            this.paymentTimer = setInterval(() => {
                this.paymentCountdown--;
                this.updateCountdownDisplay();
                
                if (this.paymentCountdown <= 0) {
                    clearInterval(this.paymentTimer);
                    this.handlePaymentExpired();
                }
            }, 1000);
        },
        
        updateCountdownDisplay: function() {
            const minutes = Math.floor(this.paymentCountdown / 60);
            const seconds = this.paymentCountdown % 60;
            this.elements.paymentCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        },
        
        pollPaymentStatus: function() {
            if (!this.paymentRequest) return;
            
            const checkStatus = () => {
                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Payment Request',
                        name: this.paymentRequest.name
                    },
                    callback: (response) => {
                        if (response.message) {
                            const status = response.message.status;
                            
                            if (status === 'Paid') {
                                this.handlePaymentSuccess();
                            } else if (status === 'Cancelled' || status === 'Expired') {
                                this.handlePaymentExpired();
                            } else {
                                // Continue polling
                                setTimeout(checkStatus, 5000);
                            }
                        }
                    }
                });
            };
            
            // Start polling
            setTimeout(checkStatus, 5000);
        },
        
        handlePaymentSuccess: function() {
            // Stop countdown
            if (this.paymentTimer) {
                clearInterval(this.paymentTimer);
            }
            
            // Update status
            this.elements.paymentStatus.className = 'payment-status success';
            this.elements.paymentStatus.textContent = 'Payment successful!';
            
            // Close payment modal after a delay and proceed
            setTimeout(() => {
                this.closePaymentModal();
                this.completeOrder();
            }, 2000);
        },
        
        handlePaymentExpired: function() {
            // Update status
            this.elements.paymentStatus.className = 'payment-status error';
            this.elements.paymentStatus.textContent = 'Payment expired. Please try again.';
            
            // Switch to cash as fallback
            const cashOption = document.querySelector('.payment-option[data-method="cash"]');
            if (cashOption) {
                cashOption.click();
            }
        },
        
        handleKeypadInput: function(value) {
            const totals = this.calculateTotals();
            
            if (value === 'clear') {
                this.cashAmount = 0;
            } else {
                // Add digit
                this.cashAmount = this.cashAmount * 10 + parseInt(value);
            }
            
            // Update display
            this.elements.cashAmount.value = `${CURRENCY_SYMBOL} ${formatNumber(this.cashAmount)}`;
            
            // Calculate change
            const change = Math.max(0, this.cashAmount - totals.total);
            this.elements.changeAmount.textContent = `${CURRENCY_SYMBOL} ${formatNumber(change)}`;
            
            // Enable confirm button when cash amount >= total
            this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
        },
        
        cancelPayment: function() {
            // Stop countdown
            if (this.paymentTimer) {
                clearInterval(this.paymentTimer);
            }
            
            // If there's an active payment request, cancel it
            if (this.paymentRequest) {
                frappe.call({
                    method: 'frappe.client.set_value',
                    args: {
                        doctype: 'Payment Request',
                        name: this.paymentRequest.name,
                        fieldname: 'status',
                        value: 'Cancelled'
                    }
                });
                
                this.paymentRequest = null;
            }
            
            this.closePaymentModal();
        },
        
        closePaymentModal: function() {
            this.elements.paymentModal.style.display = 'none';
        },
        
        confirmPayment: function() {
            if (this.paymentMethod === 'cash') {
                // Simulate cash payment success
                this.completeOrder();
            } else {
                // For QR payment in simulation mode (gateway disabled)
                if (!PAYMENT_SETTINGS.gateway_enabled) {
                    this.handlePaymentSuccess();
                }
            }
        },
        
        completeOrder: async function() {
            this.showLoading('Completing your order...');
            
            try {
                // If payment was made, we already have an invoice
                // If cash payment, create invoice now
                let invoice;
                
                if (this.paymentRequest && this.paymentRequest.invoice) {
                    // Use existing invoice
                    invoice = { name: this.paymentRequest.invoice };
                } else {
                    // Create POS Order and invoice
                    const orderResponse = await frappe.call({
                        method: 'imogi_pos.api.orders.create_order',
                        args: {
                            order_type: 'Kiosk',
                            branch: CURRENT_BRANCH,
                            pos_profile: POS_PROFILE.name,
                            customer: 'Walk-in Customer',
                            items: this.cart
                        }
                    });

                    if (!orderResponse.message) {
                        throw new Error('Failed to create order');
                    }

                    this.posOrder = orderResponse.message.name;
                    this.queueNumber = orderResponse.message.queue_number;
                    this.itemRows = (orderResponse.message.items || []).map(item => item.name);

                    const totals = this.calculateTotals();
                    const response = await frappe.call({
                        method: 'imogi_pos.api.billing.generate_invoice',
                        args: {
                            pos_order: this.posOrder,
                            pos_profile: POS_PROFILE.name,
                            pos_session: ACTIVE_POS_SESSION,
                            mode_of_payment: this.paymentMethod === 'cash' ? 'Cash' : 'Online',
                            amount: totals.total
                        }
                    });

                    if (!response.message) {
                        throw new Error('Failed to create invoice');
                    }

                    invoice = response.message;
                }
                
                // Send items to kitchen (KOT)
                if (DOMAIN === 'Restaurant') {
                    await frappe.call({
                        method: 'imogi_pos.api.kot.send_items_to_kitchen',
                        args: {
                            pos_order: this.posOrder,
                            item_rows: this.itemRows || []
                        }
                    });
                }
                
                // Auto-print receipt if enabled
                if (PRINT_SETTINGS.print_receipt) {
                    await this.printReceipt(invoice.name);
                }
                
                // Auto-print queue ticket if enabled
                if (PRINT_SETTINGS.print_queue_ticket) {
                    await this.printQueueTicket();
                }
                
                this.hideLoading();
                
                // Show success modal
                this.showSuccessModal();
                
            } catch (error) {
                console.error("Error completing order:", error);
                this.showError("An error occurred while completing your order. Please contact staff for assistance.");
                this.hideLoading();
            }
        },
        
        printReceipt: async function(invoiceName) {
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.printing.print_receipt',
                    args: {
                        sales_invoice: invoiceName
                    }
                });

                if (response.message) {
                    if (response.message.success) {
                        console.log(
                            `Receipt printed via ${response.message.adapter}`
                        );
                    } else {
                        console.error(
                            'Failed to print receipt:',
                            response.message.error
                        );
                    }
                }
            } catch (error) {
                console.error("Error printing receipt:", error);
            }
        },
        
        printQueueTicket: async function() {
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.printing.print_queue_ticket',
                    args: {
                        queue_no: this.queueNumber,
                        pos_profile: POS_PROFILE.name
                    }
                });

                if (!response.message?.success) {
                    console.error(
                        "Error printing queue ticket:",
                        response.message?.error
                    );
                }
            } catch (error) {
                console.error("Error printing queue ticket:", error);
            }
        },
        
        showSuccessModal: function() {
            // Set queue number
            this.elements.successQueueNumber.textContent = this.queueNumber;

            // Show modal
            this.elements.successModal.style.display = 'flex';

            // Update the next queue number for subsequent orders
            NEXT_QUEUE_NUMBER = this.queueNumber + 1;
        },
        
        closeSuccessModal: function() {
            this.elements.successModal.style.display = 'none';
        },
        
        resetApp: function() {
            // Clear cart
            this.cart = [];
            this.renderCart();
            this.updateCartTotals();
            
            // Reset payment state
            this.paymentRequest = null;
            this.cashAmount = 0;
            this.queueNumber = null;
            
            // Clear search
            this.elements.searchInput.value = '';
            this.searchQuery = '';
            
            // Reset category filter
            this.selectCategory('all');
            
            // Reload items
            this.loadItems();
        },
        
        // Utils
        calculateTotals: function() {
            const subtotal = this.cart.reduce((sum, item) => sum + item.amount, 0);
            const tax = subtotal * this.taxRate;
            const discount = (subtotal + tax) * (this.discountPercent / 100) + this.discountAmount;
            const total = subtotal + tax - discount;

            return {
                subtotal,
                tax,
                discount,
                total
            };
        },
        
        setupPrintService: function() {
            // Initialize the print service from the shared module
            if (window.ImogiPrintService) {
                ImogiPrintService.init({
                    profile: POS_PROFILE_DATA,
                    defaultInterface: 'OS' // Fallback to OS printing if profile doesn't specify
                });
            } else {
                console.error("Print service not available");
            }
        },
        
        setupRealtimeUpdates: function() {
            // Listen for payment updates
            frappe.realtime.on('payment:pr:*', (data) => {
                // Check if it's our payment request
                if (this.paymentRequest && data.payment_request === this.paymentRequest.name) {
                    if (data.status === 'Paid') {
                        this.handlePaymentSuccess();
                    } else if (data.status === 'Expired' || data.status === 'Cancelled') {
                        this.handlePaymentExpired();
                    }
                }
            });

            // Listen for stock updates
            frappe.realtime.on('stock_update', (data) => {
                if (!data || data.warehouse !== POS_PROFILE_DATA.warehouse) {
                    return;
                }
                this.updateItemStock(data.item_code, data.actual_qty);
            });

            // Periodic refresh as fallback
            setInterval(() => {
                this.refreshStockLevels();
            }, 60000);
        },
        
        showLoading: function(message = "Loading...") {
            this.elements.loadingText.textContent = message;
            this.elements.loadingOverlay.style.display = 'flex';
        },
        
        hideLoading: function() {
            this.elements.loadingOverlay.style.display = 'none';
        },
        
        showError: function(message) {
            alert(message);
        }
    };

    function formatRupiah(angka) {
        if (angka === 0 || angka === '0') return 'Rp 0,-';
        
        var number_string = angka.toString().replace(/[^,\d]/g, ''),
        split   = number_string.split(','),
        sisa    = split[0].length % 3,
        rupiah  = split[0].substr(0, sisa),
        ribuan  = split[0].substr(sisa).match(/\d{3}/gi);
            
        if (ribuan) {
            separator = sisa ? '.' : '';
            rupiah += separator + ribuan.join('.');
        }
        
        rupiah = split[1] != undefined ? rupiah + ',' + split[1] : rupiah;
        return 'Rp ' + rupiah + ',-';
        }
    
    // Helper function to format numbers
    function formatNumber(number) {
         return formatRupiah(number);
    }
    
    // Initialize the app
    KioskApp.init();
});
