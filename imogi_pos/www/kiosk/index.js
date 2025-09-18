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

    // Determine service type from URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    let serviceType = urlParams.get('service');
    if (!serviceType) {
        serviceType = localStorage.getItem('imogi_service_type');
    }
    if (!serviceType) {
        window.location.href = '/service-select';
        return;
    }
    // Persist the service type for subsequent visits
    localStorage.setItem('imogi_service_type', serviceType);

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
        selectedOptionItem: null,
        pendingNotes: '',
        taxRate: 0,
        discountPercent: 0,
        discountAmount: 0,
        priceLists: [],
        selectedPriceList: POS_PROFILE_DATA.selling_price_list || null,
        serviceType: serviceType,

        // Order type and table
        orderType: 'Takeaway',
        tableNumber: null,

        // Tracking the created POS Order
        posOrder: null,

        // Queue number for the last created order
        queueNumber: null,

        itemRows: [],
        latestOrderDetails: null,
        latestInvoiceDetails: null,

        // Payment state
        paymentRequest: null,
        // Default will be set when opening payment modal
        paymentMethod: 'cash',
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
            discountPercentInput: document.getElementById('discount-percent-input'),
            discountAmountInput: document.getElementById('discount-amount-input'),
            checkoutBtn: document.getElementById('btn-checkout'),
            clearBtn: document.getElementById('btn-clear'),
            searchInput: document.getElementById('search-input'),
            categoriesContainer: document.getElementById('categories-container'),
            priceListSelect: document.getElementById('price-list-select'),
            
            // Variant modal
            variantModal: document.getElementById('variant-modal'),
            variantGrid: document.getElementById('variant-grid'),
            itemNotes: document.getElementById('item-notes'),
            variantAddBtn: document.getElementById('btn-variant-add'),
            variantCancelBtn: document.getElementById('btn-variant-cancel'),

            // Item detail modal
            itemDetailModal: document.getElementById('item-detail-modal'),
            itemDetailImage: document.getElementById('item-detail-image'),
            itemOptions: document.getElementById('item-options'),
            itemAddBtn: document.getElementById('btn-item-add'),
            itemCancelBtn: document.getElementById('btn-item-cancel'),
            
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
            successReceipt: document.getElementById('success-receipt'),
            successDoneBtn: document.getElementById('btn-success-done'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text')
        },
        
        // Initialize
        init: async function() {
            this.setupEventListeners();
            await this.loadPriceLists();
            await this.loadItems();
            this.renderCategories();
            await this.loadTaxTemplate();
            this.renderItems();
            this.updateCartTotals();
            this.syncDiscountInputs();
            this.setupPrintService();

            // Setup realtime if available
            if (frappe.realtime) {
                this.setupRealtimeUpdates();
            }
        },
        
        // Event listeners
        setupEventListeners: function() {
            if (this.elements.priceListSelect) {
                this.elements.priceListSelect.addEventListener('change', (event) => {
                    const value = event.target.value;
                    this.handlePriceListChange(value);
                });
            }

            // Search
            this.elements.searchInput.addEventListener('input', this.handleSearch.bind(this));
            
            // Category filters
            this.elements.categoriesContainer.addEventListener('click', (e) => {
                const pill = e.target.closest('.category-pill');
                if (pill) {
                    this.selectCategory(pill.dataset.category);
                }
            });

            if (this.elements.discountPercentInput) {
                this.elements.discountPercentInput.addEventListener('input', (event) => {
                    this.handleDiscountInput(event, 'percent');
                });
            }
            if (this.elements.discountAmountInput) {
                this.elements.discountAmountInput.addEventListener('input', (event) => {
                    this.handleDiscountInput(event, 'amount');
                });
            }

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

            // Item detail modal
            this.elements.itemDetailModal.querySelector('.modal-close').addEventListener('click', () => {
                this.closeItemDetailModal();
            });
            this.elements.itemCancelBtn.addEventListener('click', () => {
                this.closeItemDetailModal();
            });
            this.elements.itemAddBtn.addEventListener('click', () => {
                this.confirmItemOptions();
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
            const paymentOptions = document.querySelectorAll('button.payment-option');
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
                localStorage.removeItem('imogi_service_type');
                window.location.href = '/service-select';
            });
        },
        
        // Data loading
        loadPriceLists: async function() {
            try {
                const { message } = await frappe.call({
                    method: 'imogi_pos.api.pricing.get_allowed_price_lists',
                    args: { pos_profile: POS_PROFILE_DATA.name }
                });

                const response = message || {};
                const lists = Array.isArray(response.price_lists) ? response.price_lists : [];

                this.priceLists = lists.map(row => ({
                    name: row.name,
                    label: row.label || row.name,
                    currency: row.currency || null
                }));

                const defaultName = response.default_price_list
                    || this.selectedPriceList
                    || POS_PROFILE_DATA.selling_price_list
                    || (this.priceLists[0] ? this.priceLists[0].name : null);

                if (defaultName) {
                    this.selectedPriceList = defaultName;
                }
            } catch (error) {
                console.error('Error loading price lists:', error);
                this.priceLists = [];
                if (!this.selectedPriceList) {
                    this.selectedPriceList = POS_PROFILE_DATA.selling_price_list || null;
                }
            } finally {
                this.renderPriceListSelector();
            }
        },

        renderPriceListSelector: function() {
            const select = this.elements.priceListSelect;
            if (!select) {
                return;
            }

            const lists = this.priceLists;

            if (!lists.length) {
                const fallback = this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || '';
                const label = fallback || __('Not Set');
                select.innerHTML = `<option value="${escapeHtml(fallback)}">${escapeHtml(label)}</option>`;
                select.value = fallback;
                select.disabled = true;
                return;
            }

            const optionsHtml = lists.map(pl => {
                const text = pl.currency
                    ? `${escapeHtml(pl.label)} (${escapeHtml(pl.currency)})`
                    : escapeHtml(pl.label);
                return `<option value="${escapeHtml(pl.name)}">${text}</option>`;
            }).join('');

            select.innerHTML = optionsHtml;

            const hasSelected = lists.some(pl => pl.name === this.selectedPriceList);
            const value = hasSelected ? this.selectedPriceList : lists[0].name;

            this.selectedPriceList = value;
            select.value = value;
            select.disabled = lists.length <= 1;
        },

        handlePriceListChange: async function(priceList) {
            const previousPriceList = this.selectedPriceList;

            if (!priceList || priceList === previousPriceList) {
                this.renderPriceListSelector();
                return;
            }

            const select = this.elements.priceListSelect;
            this.selectedPriceList = priceList;

            if (select) {
                select.disabled = true;
            }

            this.showLoading('Updating prices...');
            try {
                await this.refreshPricesForSelectedList();
            } catch (error) {
                console.error('Failed to refresh prices:', error);
                this.showError('Failed to update prices. Please try again.');

                this.selectedPriceList = previousPriceList || null;
                if (select) {
                    select.value = previousPriceList || '';
                }

                if (frappe && typeof frappe.show_alert === 'function') {
                    const previousLabel = previousPriceList && (this.priceLists.find(pl => pl.name === previousPriceList)?.label || previousPriceList);

                    frappe.show_alert({
                        message: previousLabel
                            ? __('Price list change cancelled. Reverted to {0}.', [previousLabel])
                            : __('Price list change cancelled. Restored previous selection.'),
                        indicator: 'orange'
                    });
                }
            } finally {
                this.renderPriceListSelector();
                this.hideLoading();
            }
        },

        refreshPricesForSelectedList: async function() {
            await this.loadItemRates(true);
            this.renderItems();
            await this.recalculateCartPricing();
            this.renderCart();
            this.updateCartTotals();
        },

        recalculateCartPricing: async function() {
            if (!this.cart.length || !this.selectedPriceList) {
                return;
            }

            const itemCodes = Array.from(new Set(
                this.cart
                    .map(item => item.item_code)
                    .filter(code => typeof code === 'string' && code)
            ));

            if (!itemCodes.length) {
                return;
            }

            let priceMap = {};
            try {
                const { message } = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Price',
                        filters: {
                            item_code: ['in', itemCodes],
                            price_list: this.selectedPriceList
                        },
                        fields: ['item_code', 'price_list_rate'],
                        limit_page_length: itemCodes.length
                    }
                });
                priceMap = (message || []).reduce((acc, row) => {
                    acc[row.item_code] = Number(row.price_list_rate || 0);
                    return acc;
                }, {});
            } catch (error) {
                console.error('Failed to recalculate cart pricing:', error);
                priceMap = {};
            }

            this.cart.forEach(item => {
                const extra = this.getCartItemExtra(item);
                const baseRate = Object.prototype.hasOwnProperty.call(priceMap, item.item_code)
                    ? priceMap[item.item_code]
                    : typeof item._base_rate === 'number'
                        ? item._base_rate
                        : (Number(item.rate) || 0) - extra;

                item._base_rate = Number.isFinite(baseRate) ? baseRate : 0;
                const safeExtra = Number.isFinite(extra) ? extra : 0;
                item._extra_rate = safeExtra;
                item.rate = item._base_rate + safeExtra;
                item.amount = item.rate * item.qty;
            });
        },

        getCartItemExtra: function(item) {
            if (item && typeof item._extra_rate === 'number') {
                return item._extra_rate;
            }

            let options = item?.item_options;
            if (typeof options === 'string' && options) {
                try {
                    options = JSON.parse(options);
                } catch (error) {
                    options = {};
                }
            }

            if (!options || typeof options !== 'object') {
                return 0;
            }

            const extra = Number(options.extra_price || 0);
            return Number.isFinite(extra) ? extra : 0;
        },

        loadItems: async function() {
            this.showLoading('Loading catalog...');

            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_items_with_stock',
                    args: {
                        warehouse: POS_PROFILE_DATA.warehouse,
                        limit: 500,
                        pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null,
                        price_list: this.selectedPriceList || null
                    }
                });

                if (response.message) {
                    // Filter out variants but include template items and standalone items
                    this.items = response.message.filter(item => !item.variant_of);
                    this.filteredItems = [...this.items];

                    // Load rates for items that don't have standard_rate
                    await this.loadItemRates(!this.selectedPriceList);

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
                console.error('Error loading items:', error);
                this.showError('Failed to load items. Please try again.');
                this.hideLoading();
            }
        },

        loadItemRates: async function(force = false) {
            const priceList = this.selectedPriceList;
            if (!priceList) {
                return;
            }
            const targetItems = force ? this.items : this.items.filter(item => !item.standard_rate);
            if (!targetItems.length) {
                return;
            }

            try {
                const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Price',
                        filters: {
                            item_code: ['in', targetItems.map(item => item.name)],
                            price_list: priceList
                        },
                        fields: ['item_code', 'price_list_rate'],
                        limit_page_length: targetItems.length
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
                console.error('Error loading item rates:', error);
            }
        },

        loadTaxTemplate: async function() {
            this.taxRate = 0.11;
            this.updateCartTotals();
        },

        loadVariantsForTemplate: async function(templateItem) {
            this.showLoading('Loading variants...');

            try {
                const { message } = await frappe.call({
                    method: 'imogi_pos.api.variants.get_item_variants',
                    args: {
                        template_item: templateItem.name,
                        price_list: this.selectedPriceList || null
                    }
                });

                return (message && message.variants) || [];
            } catch (error) {
                console.error("Error loading variants:", error);
                this.showError("Failed to load variants. Please try again.");
                return [];
            } finally {
                this.hideLoading();
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
                        <div class="sold-out-badge">Sold Out</div>
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
                    if (card.classList.contains('sold-out')) {
                        return;
                    }
                    const itemName = card.dataset.item;
                    const item = this.items.find(i => i.name === itemName);
                    if (item) {
                        this.handleItemClick(item);
                    }
                });
            });

            // Apply sold-out state to rendered items
            itemCards.forEach(card => {
                const itemName = card.dataset.item;
                const item = this.items.find(i => i.name === itemName);
                if (item) {
                    this.updateItemStock(item.name, item.actual_qty);
                }
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
                        ${item.item_options ? `<div class="cart-item-options">${this.formatItemOptions(item.item_options)}</div>` : ''}
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
            if (this.elements.paymentAmount) {
                this.elements.paymentAmount.textContent = formatRupiah(totals.total);
            }
            if (this.elements.changeAmount) {
                const change = Math.max(0, this.cashAmount - totals.total);
                this.elements.changeAmount.textContent = formatRupiah(change);
            }
            if (this.elements.paymentConfirmBtn && this.paymentMethod === 'cash') {
                this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
            }
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
            const card = this.elements.catalogGrid.querySelector(`.item-card[data-item="${itemCode}"]`);
            if (card) {
                if (actualQty <= 0) {
                    card.classList.add('sold-out');
                    card.style.pointerEvents = 'none';
                } else {
                    card.classList.remove('sold-out');
                    card.style.pointerEvents = '';
                }
            }
        },

        refreshStockLevels: async function() {
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_items_with_stock',
                    args: {
                        warehouse: POS_PROFILE_DATA.warehouse,
                        limit: 500,
                        pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null
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

        handleDiscountInput: function(event, type) {
            if (!event || !event.target) {
                return;
            }
            const rawValue = event.target.value.replace(/,/g, '.').trim();
            if (rawValue === '') {
                if (type === 'percent') {
                    this.discountPercent = 0;
                } else {
                    this.discountAmount = 0;
                }
                this.updateCartTotals();
                return;
            }

            if (!/^\d*\.?\d*$/.test(rawValue)) {
                const fallback = type === 'percent' ? this.discountPercent : this.discountAmount;
                event.target.value = fallback ? `${fallback}` : '0';
                return;
            }

            const numericValue = Number(rawValue);
            if (Number.isNaN(numericValue)) {
                const fallback = type === 'percent' ? this.discountPercent : this.discountAmount;
                event.target.value = fallback ? `${fallback}` : '0';
                return;
            }

            const sanitized = Math.max(0, numericValue);
            if (type === 'percent') {
                this.discountPercent = sanitized;
            } else {
                this.discountAmount = sanitized;
            }

            if (numericValue < 0) {
                event.target.value = sanitized ? `${sanitized}` : '0';
            }

            this.updateCartTotals();
        },
        
        handleItemClick: function(item) {
            if (item.has_variants) {
                // Open variant picker
                this.openVariantPicker(item);
            } else {
                // Open detail modal for options
                this.openItemDetailModal(item);
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

            this.closeVariantModal();
            this.openItemDetailModal(this.selectedVariant, notes);
        },

        openItemDetailModal: async function(item, notes = '') {
            this.selectedOptionItem = item;
            this.pendingNotes = notes || '';

            const imageUrl = item.photo || item.image || '/assets/erpnext/images/default-product-image.png';
            this.elements.itemDetailImage.style.backgroundImage = `url('${imageUrl}')`;
            this.elements.itemDetailModal.querySelector('.modal-title').textContent = item.item_name;

            // Clear and hide options section while loading
            this.elements.itemOptions.innerHTML = '';
            this.elements.itemOptions.classList.add('hidden');

            // Show modal
            this.elements.itemDetailModal.style.display = 'flex';

            this.showLoading('Loading options...');
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.items.get_item_options',
                    args: { item: item.name }
                });
                this.hideLoading();
                const options = response.message || {};
                this.renderItemDetailOptions(options);
            } catch (error) {
                console.error('Error loading item options:', error);
                this.hideLoading();
                this.showError('Failed to load item options.');
            }
        },

        closeItemDetailModal: function() {
            this.elements.itemDetailModal.style.display = 'none';
            this.selectedOptionItem = null;
            this.pendingNotes = '';
        },

        renderItemDetailOptions: function(options) {
          const container = this.elements.itemOptions;
        
          // Terima dua bentuk kunci: sizes/spices/toppings ATAU size/spice/topping
          const sizes    = options.sizes    || options.size    || [];
          const spices   = options.spices   || options.spice   || [];
          const toppings = options.toppings || options.topping || [];
        
          let html = '';
        
          // Helper untuk ambil nama/price/default lintas-bentuk
          const getName    = opt => opt.name || opt.label || opt.value || '';
          const getPrice   = opt => Number(opt.price || 0);
          const isDefault  = opt => !!(opt.default || opt.is_default);
        
          if (sizes.length) {
            html += `<div class="option-block" data-group="size" data-required="1">
              <div class="option-title">Size</div>
              <div class="option-group">`;
            sizes.forEach((opt, i) => {
              const name = getName(opt);
              const price = getPrice(opt);
              const checked = isDefault(opt) ? 'checked' : '';
              const priceText = price ? ` (+${CURRENCY_SYMBOL} ${formatNumber(price)})` : '';
              html += `<label><input type="radio" name="size-option" value="${name}" data-price="${price}" ${checked}> ${name}${priceText}</label>`;
            });
            html += `</div></div>`;
          }
        
          if (spices.length) {
            html += `<div class="option-block" data-group="spice" data-required="1">
              <div class="option-title">Spice</div>
              <div class="option-group">`;
            spices.forEach((opt) => {
              const name = getName(opt);
              const checked = isDefault(opt) ? 'checked' : '';
              html += `<label><input type="radio" name="spice-option" value="${name}" ${checked}> ${name}</label>`;
            });
            html += `</div></div>`;
          }
        
          if (toppings.length) {
            html += `<div class="option-block" data-group="topping">
              <div class="option-title">Toppings</div>
              <div class="option-group">`;
            toppings.forEach((opt) => {
              const name = getName(opt);
              const price = getPrice(opt);
              const checked = isDefault(opt) ? 'checked' : '';
              const priceText = price ? ` (+${CURRENCY_SYMBOL} ${formatNumber(price)})` : '';
              html += `<label><input type="checkbox" name="topping-option" value="${name}" data-price="${price}" ${checked}> ${name}${priceText}</label>`;
            });
            html += `</div></div>`;
          }
        
          if (html) {
            container.innerHTML = html;
            container.classList.remove('hidden');
          } else {
            container.innerHTML = '';
            container.classList.add('hidden');
          }
        },


        confirmItemOptions: function() {
          const container = this.elements.itemOptions;
          const selectedOptions = { toppings: [] };
          let extra = 0;
        
          const sizeGroup = container.querySelector('[data-group="size"]');
          if (sizeGroup) {
            const input = sizeGroup.querySelector('input[name="size-option"]:checked');
            if (!input) { this.showError('Please select size'); return; }
            const name = input.value;
            const price = Number(input.dataset.price || 0);
            selectedOptions.size = { name, price };
            extra += price;
          }
        
          const spiceGroup = container.querySelector('[data-group="spice"]');
          if (spiceGroup) {
            const input = spiceGroup.querySelector('input[name="spice-option"]:checked');
            if (!input) { this.showError('Please select spice level'); return; }
            selectedOptions.spice = { name: input.value };
          }
        
          const toppingGroup = container.querySelector('[data-group="topping"]');
          if (toppingGroup) {
            const inputs = toppingGroup.querySelectorAll('input[name="topping-option"]:checked');
            inputs.forEach(inp => {
              const price = Number(inp.dataset.price || 0);
              selectedOptions.toppings.push({ name: inp.value, price });
              extra += price;
            });
          }
        
          selectedOptions.extra_price = Number(extra) || 0;
          this.addItemToCart(this.selectedOptionItem, selectedOptions, this.pendingNotes);
          this.closeItemDetailModal();
        },

        addItemToCart: function(item, item_options = {}, notes = '') {
            if (!item) {
                return;
            }

            const baseRate = Number(item.standard_rate || 0);
            const extraRate = Number(item_options.extra_price || 0);
            const safeBase = Number.isFinite(baseRate) ? baseRate : 0;
            const safeExtra = Number.isFinite(extraRate) ? extraRate : 0;
            const rate = safeBase + safeExtra;

            const existingIndex = this.cart.findIndex(i => i.item_code === item.name && i.notes === notes && JSON.stringify(i.item_options || {}) === JSON.stringify(item_options));

            if (existingIndex >= 0) {
                const cartItem = this.cart[existingIndex];
                cartItem.qty += 1;
                cartItem._base_rate = safeBase;
                cartItem._extra_rate = safeExtra;
                cartItem.rate = safeBase + safeExtra;
                cartItem.amount = cartItem.rate * cartItem.qty;
            } else {
                this.cart.push({
                    item_code: item.name,
                    item_name: item.item_name,
                    qty: 1,
                    rate: rate,
                    amount: rate,
                    notes: notes,
                    item_options: item_options,
                    kitchen: item.default_kitchen,
                    kitchen_station: item.default_kitchen_station,
                    _base_rate: safeBase,
                    _extra_rate: safeExtra
                });
            }

            this.renderCart();
            this.updateCartTotals();
        },

        formatItemOptions: function(options) {
            const parts = [];
            if (options.size) {
                parts.push(`Size: ${options.size.name}`);
            }
            if (options.spice) {
                parts.push(`Spice: ${options.spice.name}`);
            }
            if (options.toppings && options.toppings.length) {
                parts.push(`Toppings: ${options.toppings.map(t => t.name).join(', ')}`);
            }
            return parts.join(' | ');
        },
        
        updateCartItemQuantity: function(index, newQty) {
            if (newQty < 1) {
                this.removeCartItem(index);
                return;
            }

            const cartItem = this.cart[index];
            const detectedExtra = this.getCartItemExtra(cartItem);
            const safeExtra = Number.isFinite(cartItem._extra_rate)
                ? cartItem._extra_rate
                : Number.isFinite(detectedExtra)
                    ? detectedExtra
                    : 0;
            const numericRate = Number(cartItem.rate);
            const baseFromRate = Number.isFinite(numericRate) ? numericRate - safeExtra : 0;
            const safeBase = Number.isFinite(cartItem._base_rate)
                ? cartItem._base_rate
                : Number.isFinite(baseFromRate)
                    ? baseFromRate
                    : 0;

            cartItem._base_rate = safeBase;
            cartItem._extra_rate = safeExtra;
            cartItem.rate = safeBase + safeExtra;
            cartItem.qty = newQty;
            cartItem.amount = cartItem.rate * newQty;

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
        
        handleCheckout: async function() {
            if (!this.cart.length) return;


            // Ensure table number is set for dine-in orders
            if (!(await this.ensureTableNumber())) {
                return;

            }

            // Open payment modal
            this.openPaymentModal();
        },

        openPaymentModal: function() {
            const totals = this.calculateTotals();

            // Set payment amount
            this.elements.paymentAmount.textContent = formatRupiah(totals.total);

            // Reset cash fields
            this.cashAmount = 0;
            this.elements.cashAmount.value = formatRupiah(0);
            this.elements.changeAmount.textContent = formatRupiah(0);

            // Determine default payment method based on settings
            const mode = PAYMENT_SETTINGS.payment_mode || 'Mixed';
            if (mode === 'Cash Only') {
                this.paymentMethod = 'cash';
            } else if (PAYMENT_SETTINGS.gateway_enabled) {
                this.paymentMethod = 'qr_code';
            } else {
                // Gateway unavailable, fall back to cash
                this.paymentMethod = 'cash';
            }

            // Update UI for the selected method and reevaluate confirm button
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

        ensureTableNumber: async function() {
            if (this.orderType === 'Dine-in' && !this.tableNumber) {
                try {
                    const { message } = await frappe.call({
                        method: 'imogi_pos.api.orders.get_next_available_table',
                        args: { branch: CURRENT_BRANCH }
                    });

                    this.tableNumber = message;
                    localStorage.setItem('imogi_table_number', message);
                    frappe.msgprint({
                        title: __('Table Assigned'),
                        message: __('Please proceed to table {0}', [message]),
                        indicator: 'green'
                    });
                } catch (e) {
                    frappe.msgprint({
                        title: __('No Table Available'),
                        message: e.message || __('All tables are currently occupied. Please wait for a table to become available.'),
                        indicator: 'orange'
                    });
                    return false;
                }
            }
            return true;
        },

        requestPaymentQR: async function() {
            this.showLoading('Generating payment QR code...');

            try {
                // Create POS Order first
                const { discountPercent, discountAmount } = this.getNormalizedDiscounts();
                const orderArgs = {
                    order_type: 'Kiosk',
                    service_type: this.orderType,
                    branch: CURRENT_BRANCH,
                    pos_profile: POS_PROFILE.name,
                    customer: 'Walk-in Customer',
                    items: this.cart,
                    selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
                    discount_amount: discountAmount,
                    discount_percent: discountPercent
                };
                if (this.tableNumber) {
                    orderArgs.table = this.tableNumber;
                }
                const orderResponse = await frappe.call({
                    method: 'imogi_pos.api.orders.create_order',
                    args: orderArgs
                });

                if (!orderResponse.message) {
                    throw new Error('Failed to create order');
                }

                this.posOrder = orderResponse.message.name;
                let orderDetails = orderResponse.message;
                try {
                    const { message: refreshed } = await frappe.call({
                        method: 'frappe.client.get',
                        args: {
                            doctype: 'POS Order',
                            name: this.posOrder
                        }
                    });
                    if (refreshed) {
                        orderDetails = refreshed;
                    }
                } catch (orderError) {
                    console.error('Failed to refresh POS Order before invoicing:', orderError);
                }

                this.queueNumber = orderDetails.queue_number || orderResponse.message.queue_number;
                const orderItems = Array.isArray(orderDetails.items) && orderDetails.items.length
                    ? orderDetails.items
                    : orderResponse.message.items || [];
                this.itemRows = orderItems.map(item => item.name);
                this.latestOrderDetails = orderDetails;

                // Create draft invoice for payment
                const totals = this.calculateTotals();
                const invoiceArgs = {
                    pos_order: this.posOrder,
                    pos_profile: POS_PROFILE.name,
                    mode_of_payment: 'Online',
                    amount: totals.total
                };
                if (this.tableNumber) {
                    invoiceArgs.table = this.tableNumber;
                }
                const invoiceResponse = await frappe.call({
                    method: 'imogi_pos.api.billing.generate_invoice',
                    args: invoiceArgs
                });
                
                if (!invoiceResponse.message) {
                    throw new Error('Failed to create invoice');
                }

                const invoice = invoiceResponse.message;
                this.latestInvoiceDetails = invoice;

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
                if (error?.message && error.message.includes("already occupied")) {
                    this.hideLoading();
                    frappe.msgprint({
                        title: __('Table In Use'),
                        message: error.message,
                        indicator: 'red'
                    });
                    return;
                }

                console.error("Error requesting payment:", error);
                this.showError("Failed to generate payment QR. Please try another payment method.");
                this.hideLoading();

                // Switch to cash as fallback
                this.paymentMethod = 'cash';
                this.togglePaymentMethod();

                // Update UI selection
                const paymentOptions = document.querySelectorAll('button.payment-option');
                paymentOptions.forEach(o => o.classList.remove('selected'));
                const cashOption = document.querySelector('button.payment-option[data-method="cash"]');
                if (cashOption) {
                    cashOption.classList.add('selected');
                }

                // Recalculate confirm button state based on current cash amount
                const totals = this.calculateTotals();
                this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
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
            const cashOption = document.querySelector('button.payment-option[data-method="cash"]');
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
            this.elements.cashAmount.value = formatRupiah(this.cashAmount);

            // Calculate change
            const change = Math.max(0, this.cashAmount - totals.total);
            this.elements.changeAmount.textContent = formatRupiah(change);

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
            if (!(await this.ensureTableNumber())) {
                return;
            }
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
                    const { discountPercent, discountAmount } = this.getNormalizedDiscounts();
                    const orderArgs = {
                        order_type: 'Kiosk',
                        service_type: this.orderType,
                        branch: CURRENT_BRANCH,
                        pos_profile: POS_PROFILE.name,
                        customer: 'Walk-in Customer',
                        items: this.cart,
                        selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
                        discount_amount: discountAmount,
                        discount_percent: discountPercent
                    };
                    if (this.tableNumber) {
                        orderArgs.table = this.tableNumber;
                    }
                    const orderResponse = await frappe.call({
                        method: 'imogi_pos.api.orders.create_order',
                        args: orderArgs
                    });

                    if (!orderResponse.message) {
                        throw new Error('Failed to create order');
                    }

                    this.posOrder = orderResponse.message.name;
                    let orderDetails = orderResponse.message;
                    try {
                        const { message: refreshed } = await frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'POS Order',
                                name: this.posOrder
                            }
                        });
                        if (refreshed) {
                            orderDetails = refreshed;
                        }
                    } catch (orderError) {
                        console.error('Failed to refresh POS Order before invoicing:', orderError);
                    }

                    this.queueNumber = orderDetails.queue_number || orderResponse.message.queue_number;
                    const orderItems = Array.isArray(orderDetails.items) && orderDetails.items.length
                        ? orderDetails.items
                        : orderResponse.message.items || [];
                    this.itemRows = orderItems.map(item => item.name);
                    this.latestOrderDetails = orderDetails;

                    const totals = this.calculateTotals();
                    const invoiceArgs = {
                        pos_order: this.posOrder,
                        pos_profile: POS_PROFILE.name,
                        mode_of_payment: this.paymentMethod === 'cash' ? 'Cash' : 'Online',
                        amount: totals.total
                    };
                    if (this.tableNumber) {
                        invoiceArgs.table = this.tableNumber;
                    }
                    const response = await frappe.call({
                        method: 'imogi_pos.api.billing.generate_invoice',
                        args: invoiceArgs
                    });

                    if (!response.message) {
                        throw new Error('Failed to create invoice');
                    }

                    invoice = response.message;
                    this.latestInvoiceDetails = invoice;
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
                
                let orderDetails = null;
                let invoiceDetails = null;

                if (this.posOrder || invoice?.name) {
                    try {
                        const [orderResponseDetails, invoiceResponseDetails] = await Promise.all([
                            this.posOrder
                                ? frappe.call({
                                      method: 'frappe.client.get',
                                      args: {
                                          doctype: 'POS Order',
                                          name: this.posOrder
                                      }
                                  })
                                : Promise.resolve({}),
                            invoice?.name
                                ? frappe.call({
                                      method: 'frappe.client.get',
                                      args: {
                                          doctype: 'Sales Invoice',
                                          name: invoice.name
                                      }
                                  })
                                : Promise.resolve({})
                        ]);

                        orderDetails = orderResponseDetails?.message || null;
                        invoiceDetails = invoiceResponseDetails?.message || null;
                    } catch (detailsError) {
                        console.error('Failed to fetch receipt details:', detailsError);
                    }
                }

                this.hideLoading();

                // Show success modal
                this.showSuccessModal(orderDetails, invoiceDetails);
                
            } catch (error) {
                if (error?.message && error.message.includes("already occupied")) {
                    this.hideLoading();
                    frappe.msgprint({
                        title: __('Table In Use'),
                        message: error.message,
                        indicator: 'red'
                    });
                    return;
                }
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
        
        showSuccessModal: function(orderDetails = null, invoiceDetails = null) {
            const queueNumber = orderDetails?.queue_number || this.queueNumber || orderDetails?.name || '';

            if (queueNumber) {
                this.queueNumber = queueNumber;
            }

            // Set queue number
            this.elements.successQueueNumber.textContent = this.queueNumber || '';

            // Render receipt details
            this.renderSuccessReceipt(orderDetails, invoiceDetails);

            // Show modal
            this.elements.successModal.style.display = 'flex';

            // Update the next queue number for subsequent orders
            const numericQueue = parseInt(this.queueNumber, 10);
            if (!Number.isNaN(numericQueue)) {
                NEXT_QUEUE_NUMBER = numericQueue + 1;
            }
        },

        closeSuccessModal: function() {
            this.elements.successModal.style.display = 'none';
            if (this.elements.successReceipt) {
                this.elements.successReceipt.classList.add('hidden');
                this.elements.successReceipt.innerHTML = '';
            }
        },

        renderSuccessReceipt: function(orderDetails, invoiceDetails) {
            if (!this.elements.successReceipt) {
                return;
            }

            if (!orderDetails && !invoiceDetails) {
                this.elements.successReceipt.classList.add('hidden');
                this.elements.successReceipt.innerHTML = '';
                return;
            }

            const receiptContainer = this.elements.successReceipt;
            receiptContainer.classList.remove('hidden');

            const toNumber = (value) => {
                const num = parseFloat(value);
                return Number.isFinite(num) ? num : 0;
            };

            const orderNumber = orderDetails?.queue_number || orderDetails?.name || invoiceDetails?.name || '-';
            const itemsSource = Array.isArray(orderDetails?.items) && orderDetails.items.length
                ? orderDetails.items
                : Array.isArray(invoiceDetails?.items)
                    ? invoiceDetails.items
                    : [];

            const itemRows = itemsSource.length
                ? itemsSource
                      .map((item) => {
                          const lineQty = item.qty || 0;
                          const lineTotal =
                              item.amount != null
                                  ? item.amount
                                  : (item.rate || 0) * lineQty;
                          const optionsText = this.formatReceiptItemOptions(item.item_options);
                          const optionsHtml = optionsText
                              ? `<div class="success-receipt-item-options">${escapeHtml(optionsText)}</div>`
                              : '';

                          return `
                              <tr>
                                <td>
                                  <div class="success-receipt-item-name">${escapeHtml(item.item_name || item.item_code || item.item || '')}</div>
                                  ${optionsHtml}
                                </td>
                                <td>${lineQty}</td>
                                <td>${formatRupiah(lineTotal)}</td>
                              </tr>
                          `;
                      })
                      .join('')
                : `<tr><td colspan="3">${__('No items found')}</td></tr>`;

            const subtotalValue = toNumber(
                orderDetails?.subtotal ??
                invoiceDetails?.total ??
                invoiceDetails?.base_total ??
                0
            );
            let pb1Value = orderDetails?.pb1_amount;
            if (pb1Value == null) {
                pb1Value = (invoiceDetails?.taxes || []).reduce((sum, tax) => {
                    const amount = toNumber(tax?.tax_amount ?? tax?.base_tax_amount ?? 0);
                    return sum + amount;
                }, 0);
            }
            pb1Value = toNumber(pb1Value);

            const grossTotal = subtotalValue + pb1Value;
            const discountCandidates = [
                orderDetails?.discount_amount,
                orderDetails?.discount_value,
                invoiceDetails?.discount_amount,
                invoiceDetails?.base_discount_amount,
                invoiceDetails?.total_discount_amount
            ];
            let discountValue = discountCandidates.reduce((max, candidate) => {
                const numeric = toNumber(candidate);
                return numeric > max ? numeric : max;
            }, 0);
            if (discountValue <= 0) {
                const percentCandidates = [
                    orderDetails?.discount_percent,
                    orderDetails?.discount_percentage,
                    invoiceDetails?.discount_percentage,
                    invoiceDetails?.additional_discount_percentage
                ];
                const appliedPercent = percentCandidates.reduce((max, candidate) => {
                    const numeric = toNumber(candidate);
                    return numeric > max ? numeric : max;
                }, 0);
                if (appliedPercent > 0) {
                    discountValue = grossTotal * (appliedPercent / 100);
                }
            }
            discountValue = Math.min(grossTotal, Math.max(0, discountValue));

            const docTotal = toNumber(
                orderDetails?.totals ??
                invoiceDetails?.rounded_total ??
                invoiceDetails?.grand_total ??
                invoiceDetails?.total ??
                invoiceDetails?.base_grand_total ??
                0
            );
            const computedTotal = Math.max(0, grossTotal - discountValue);
            const totalValue = docTotal > 0 ? Math.max(0, docTotal) : computedTotal;

            receiptContainer.innerHTML = `
                <div class="success-receipt-header">
                  <div class="success-receipt-title">${__('Receipt')}</div>
                  <div class="success-receipt-meta">
                    <div class="success-receipt-label">${__('Order No.')}</div>
                    <div class="success-receipt-value">${escapeHtml(orderNumber || '-')}</div>
                  </div>
                </div>
                <table class="success-receipt-table">
                  <thead>
                    <tr>
                      <th>${__('Item')}</th>
                      <th>${__('Qty')}</th>
                      <th>${__('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows}
                  </tbody>
                </table>
                <div class="success-receipt-summary">
                  <div class="success-receipt-summary-row">
                    <span>${__('Subtotal')}</span>
                    <span>${formatRupiah(subtotalValue)}</span>
                  </div>
                  <div class="success-receipt-summary-row">
                    <span>${__('PB1')}</span>
                    <span>${formatRupiah(pb1Value)}</span>
                  </div>
                  ${
                    discountValue > 0
                        ? `<div class="success-receipt-summary-row discount">
                            <span>${__('Discount')}</span>
                            <span>- ${formatRupiah(discountValue)}</span>
                          </div>`
                        : ''
                  }
                  <div class="success-receipt-summary-row total">
                    <span>${__('Total')}</span>
                    <span>${formatRupiah(totalValue)}</span>
                  </div>
                </div>
            `;
        },

        formatReceiptItemOptions: function(options) {
            if (!options) {
                return '';
            }

            let parsedOptions = options;
            if (typeof options === 'string') {
                try {
                    parsedOptions = JSON.parse(options);
                } catch (error) {
                    return String(options);
                }
            }

            if (parsedOptions && typeof parsedOptions === 'object') {
                const formatted = this.formatItemOptions(parsedOptions);
                return formatted || '';
            }

            return String(parsedOptions);
        },
        
        resetApp: function() {
            // Clear cart
            this.cart = [];
            this.discountPercent = 0;
            this.discountAmount = 0;
            this.syncDiscountInputs();
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

            // Clear stored service type and redirect to selection page
            localStorage.removeItem('imogi_service_type');
            window.location.href = '/service-select';
        },

        // Utils
        getNormalizedDiscounts: function() {
            const discountPercent = Number.isFinite(this.discountPercent)
                ? Math.max(0, this.discountPercent)
                : 0;
            const discountAmount = Number.isFinite(this.discountAmount)
                ? Math.max(0, this.discountAmount)
                : 0;

            if (!Number.isFinite(this.discountPercent)) {
                this.discountPercent = 0;
            }
            if (!Number.isFinite(this.discountAmount)) {
                this.discountAmount = 0;
            }

            return { discountPercent, discountAmount };
        },

        calculateTotals: function() {
            const subtotal = this.cart.reduce((sum, item) => sum + item.amount, 0);
            const tax = subtotal * this.taxRate;
            const grossTotal = subtotal + tax;
            const { discountPercent, discountAmount } = this.getNormalizedDiscounts();

            const percentDiscount = grossTotal * (discountPercent / 100);
            const combinedDiscount = percentDiscount + discountAmount;
            const discount = Math.min(grossTotal, Math.max(0, combinedDiscount));
            const total = Math.max(0, grossTotal - discount);

            return {
                subtotal,
                tax,
                discount,
                total
            };
        },

        syncDiscountInputs: function() {
            if (this.elements.discountPercentInput) {
                this.elements.discountPercentInput.value = this.discountPercent > 0 ? `${this.discountPercent}` : '0';
            }
            if (this.elements.discountAmountInput) {
                this.elements.discountAmountInput.value = this.discountAmount > 0 ? `${this.discountAmount}` : '0';
            }
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

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    // Determine service type and table number
    const params = new URLSearchParams(window.location.search);
    const serviceParam = params.get('service') || localStorage.getItem('imogi_service_type');
    let orderType = 'Takeaway';
    if (serviceParam && serviceParam.toLowerCase().includes('dine')) {
        orderType = 'Dine-in';
    }
    localStorage.setItem('imogi_service_type', orderType);
    KioskApp.orderType = orderType;

    const tableParam = params.get('table') || localStorage.getItem('imogi_table_number');
    if (orderType !== 'Dine-in') {
        KioskApp.tableNumber = null;
        localStorage.removeItem('imogi_table_number');
    } else if (tableParam) {
        KioskApp.tableNumber = tableParam;
        localStorage.setItem('imogi_table_number', tableParam);
    }

    // Initialize the app
    KioskApp.init();
});
