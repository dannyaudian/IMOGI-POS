frappe.ready(function() {
    function hasValidMenuCategory(value) {
        if (typeof value !== 'string') {
            return false;
        }
        return value.trim().length > 0;
    }

    // Initialize Self-Order App
    const SelfOrderApp = {
        // State
        items: [],
        filteredItems: [],
        cart: [],
        selectedCategory: 'all',
        searchQuery: '',
        selectedTemplateItem: null,
        selectedVariant: null,
        variantPool: new Map(),
        taxRate: 0,

        discountState: {
            cartQuantity: 0,
            autoPercent: 0,
            promo: null,
            applied: null,
            error: null,
            isApplying: false,
        },

        allowDiscounts:
            typeof ALLOW_DISCOUNTS !== 'undefined' && Boolean(ALLOW_DISCOUNTS),
        
        // Payment state
        paymentRequest: null,
        paymentTimer: null,
        paymentCountdown: PAYMENT_SETTINGS.payment_timeout || 300, // 5 minutes default
        
        // Element references
        elements: {
            itemsGrid: document.getElementById('items-grid'),
            cartItems: document.getElementById('cart-items'),
            cartSubtotal: document.getElementById('cart-subtotal'),
            cartTax: document.getElementById('cart-tax'),
            cartTotal: document.getElementById('cart-total'),
            cartDiscount: document.getElementById('cart-discount'),
            cartDiscountLabel: document.getElementById('cart-discount-label'),
            cartCount: document.getElementById('cart-count'),
            cartPanel: document.getElementById('cart-panel'),
            overlay: document.getElementById('overlay'),
            cartToggle: document.getElementById('cart-toggle'),
            cartClose: document.getElementById('cart-close'),
            submitBtn: document.getElementById('btn-submit'),
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
            variantModalClose: document.getElementById('variant-modal-close'),
            
            // Payment modal
            paymentModal: document.getElementById('payment-modal'),
            paymentAmount: document.getElementById('payment-amount'),
            paymentQrSection: document.getElementById('payment-qr-section'),
            paymentQr: document.getElementById('payment-qr'),
            paymentTimer: document.getElementById('payment-timer'),
            paymentCountdown: document.getElementById('payment-countdown'),
            paymentStatus: document.getElementById('payment-status'),
            paymentCancelBtn: document.getElementById('btn-payment-cancel'),
            paymentModalClose: document.getElementById('payment-modal-close'),

            promoSection: document.getElementById('promo-section'),
            promoButton: document.getElementById('btn-promo'),
            promoInputContainer: document.getElementById('promo-input-container'),
            promoInput: document.getElementById('promo-code-input'),
            promoApplyBtn: document.getElementById('promo-apply-btn'),
            promoCancelBtn: document.getElementById('promo-cancel-btn'),
            promoStatus: document.getElementById('promo-status'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text')
        },

        ensureVariantPool: function() {
            if (!(this.variantPool instanceof Map)) {
                this.variantPool = new Map();
            }
            return this.variantPool;
        },

        resetVariantPool: function() {
            this.variantPool = new Map();
        },

        collectTemplateLookupKeys: function(source) {
            if (!source || typeof source !== 'object') {
                return [];
            }

            const keys = [];
            const maybeAdd = (value) => {
                if (typeof value !== 'string') {
                    return;
                }
                const trimmed = value.trim();
                if (trimmed) {
                    keys.push(trimmed);
                }
            };

            maybeAdd(source.name);
            maybeAdd(source.item_code);
            maybeAdd(source.item_name);
            maybeAdd(source.template_item);
            maybeAdd(source.template_item_code);

            return Array.from(new Set(keys));
        },

        collectVariantTemplateKeys: function(variant) {
            if (!variant || typeof variant !== 'object') {
                return [];
            }

            const keys = [];
            const maybeAdd = (value) => {
                if (typeof value !== 'string') {
                    return;
                }
                const trimmed = value.trim();
                if (trimmed) {
                    keys.push(trimmed);
                }
            };

            maybeAdd(variant.variant_of);
            maybeAdd(variant.template_item);
            maybeAdd(variant.template_item_code);

            return Array.from(new Set(keys));
        },

        cacheVariantsForTemplate: function(templateItem, variants) {
            if (!Array.isArray(variants) || variants.length === 0) {
                return;
            }

            const pool = this.ensureVariantPool();
            const templateKeys = this.collectTemplateLookupKeys(templateItem);

            const allKeys = new Set(templateKeys);
            variants.forEach((variant) => {
                this.collectVariantTemplateKeys(variant).forEach((key) => allKeys.add(key));
            });

            if (!allKeys.size) {
                return;
            }

            allKeys.forEach((key) => {
                if (!pool.has(key) || !(pool.get(key) instanceof Map)) {
                    pool.set(key, new Map());
                }
            });

            variants.forEach((variant) => {
                allKeys.forEach((key) => {
                    const bucket = pool.get(key);
                    bucket.set(variant.name, variant);
                });
            });
        },

        getCachedVariantsForTemplate: function(templateItem) {
            if (!(this.variantPool instanceof Map)) {
                return [];
            }

            const keys = this.collectTemplateLookupKeys(templateItem);
            if (!keys.length) {
                return [];
            }

            const seen = new Map();
            keys.forEach((key) => {
                const bucket = this.variantPool.get(key);
                if (bucket && bucket instanceof Map) {
                    bucket.forEach((variant, variantName) => {
                        if (!seen.has(variantName)) {
                            seen.set(variantName, variant);
                        }
                    });
                }
            });

            return Array.from(seen.values());
        },

        getAllCachedVariants: function() {
            if (!(this.variantPool instanceof Map)) {
                return [];
            }

            const seen = new Map();
            this.variantPool.forEach((bucket) => {
                if (bucket && bucket instanceof Map) {
                    bucket.forEach((variant, variantName) => {
                        if (!seen.has(variantName)) {
                            seen.set(variantName, variant);
                        }
                    });
                }
            });

            return Array.from(seen.values());
        },

        computeVariantDisplayRate: function(variants) {
            if (!Array.isArray(variants) || !variants.length) {
                return null;
            }

            const numericRates = variants
                .map((variant) => Number(variant?.standard_rate))
                .filter((rate) => Number.isFinite(rate));

            if (!numericRates.length) {
                return null;
            }

            const positiveRates = numericRates.filter((rate) => rate > 0);
            if (positiveRates.length) {
                return Math.min(...positiveRates);
            }

            return Math.min(...numericRates);
        },

        refreshVariantDisplayRateForTemplate: function(templateItem) {
            if (!templateItem) {
                return null;
            }

            if (!templateItem.has_variants) {
                templateItem._variant_display_rate = null;
                return null;
            }

            const variants = this.getCachedVariantsForTemplate(templateItem);
            const displayRate = this.computeVariantDisplayRate(variants);
            templateItem._variant_display_rate = displayRate;

            return displayRate;
        },

        refreshAllVariantDisplayRates: function() {
            if (!Array.isArray(this.items)) {
                return;
            }

            this.items
                .filter((item) => item && item.has_variants)
                .forEach((templateItem) => this.refreshVariantDisplayRateForTemplate(templateItem));
        },

        getTemplateVariantDisplayRate: function(templateItem) {
            if (!templateItem || !templateItem.has_variants) {
                return null;
            }

            const stored = Number(templateItem._variant_display_rate);
            if (Number.isFinite(stored) && stored >= 0) {
                return stored;
            }

            return this.refreshVariantDisplayRateForTemplate(templateItem);
        },

        getDisplayRateForItem: function(item) {
            if (!item) {
                return 0;
            }

            const standardRate = Number(item.standard_rate);
            if (item.has_variants) {
                const templateRate = this.getTemplateVariantDisplayRate(item);
                if ((!Number.isFinite(standardRate) || standardRate <= 0) && Number.isFinite(templateRate)) {
                    return templateRate;
                }
            }

            return Number.isFinite(standardRate) ? standardRate : 0;
        },
        
        // Initialize the app
        init: async function() {
            // Check if session expired
            if (document.querySelector('.session-expired-container')) {
                return;
            }
            
            // Load existing order if available
            if (EXISTING_ORDER) {
                this.loadExistingOrder();
            }

            this.setupEventListeners();
            this.initDiscountControls();
            await this.loadItems();
            await this.loadTaxTemplate();
            this.renderItems();
            this.updateCartTotals();
            
            // Setup realtime updates if available
            if (frappe.realtime) {
                this.setupRealtimeUpdates();
            }
        },
        
        // Load existing order data
        loadExistingOrder: function() {
            try {
                // Format existing items to match our cart structure
                const existingItems = EXISTING_ORDER.items.map(item => ({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    qty: item.qty,
                    rate: item.rate,
                    amount: item.amount,
                    notes: item.notes || ''
                }));
                
                this.cart = existingItems;
                this.updateCartUI();
            } catch (error) {
                console.error('Error loading existing order:', error);
            }
        },
        
        // Set up event listeners
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
            
            // Cart toggle
            this.elements.cartToggle.addEventListener('click', this.toggleCart.bind(this));
            this.elements.cartClose.addEventListener('click', this.closeCart.bind(this));
            this.elements.overlay.addEventListener('click', this.closeCart.bind(this));
            
            // Cart buttons
            if (this.elements.submitBtn) {
                this.elements.submitBtn.addEventListener('click', this.handleSubmit.bind(this));
            }
            
            if (this.elements.checkoutBtn) {
                this.elements.checkoutBtn.addEventListener('click', this.handleCheckout.bind(this));
            }
            
            if (this.elements.clearBtn) {
                this.elements.clearBtn.addEventListener('click', this.clearCart.bind(this));
            }
            
            // Variant modal
            this.elements.variantModalClose.addEventListener('click', () => {
                this.closeVariantModal();
            });
            
            this.elements.variantCancelBtn.addEventListener('click', () => {
                this.closeVariantModal();
            });
            
            this.elements.variantAddBtn.addEventListener('click', () => {
                this.addSelectedVariantToCart();
            });
            
            // Payment modal
            this.elements.paymentModalClose.addEventListener('click', () => {
                this.cancelPayment();
            });
            
            this.elements.paymentCancelBtn.addEventListener('click', () => {
                this.cancelPayment();
            });
        },

        initDiscountControls: function() {
            if (!this.allowDiscounts) {
                if (this.elements.promoSection) {
                    this.elements.promoSection.style.display = 'none';
                }
                return;
            }

            if (this.elements.promoButton) {
                this.elements.promoButton.addEventListener('click', () => {
                    if (!this.cart.length) {
                        this.setPromoError(__('Add items to use a promo code.'));
                        return;
                    }
                    this.discountState.error = null;
                    this.showPromoInput();
                });
            }

            if (this.elements.promoCancelBtn) {
                this.elements.promoCancelBtn.addEventListener('click', () => {
                    this.cancelPromoInput();
                });
            }

            if (this.elements.promoApplyBtn) {
                this.elements.promoApplyBtn.addEventListener('click', () => {
                    this.handleApplyPromo();
                });
            }

            if (this.elements.promoInput) {
                this.elements.promoInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this.handleApplyPromo();
                    }
                });
            }

            if (this.elements.promoStatus) {
                this.elements.promoStatus.addEventListener('click', (event) => {
                    const target = event.target;
                    if (target && target.classList.contains('promo-remove')) {
                        event.preventDefault();
                        this.removePromoCode();
                    }
                });
            }

            this.refreshDiscountUI();
        },

        resetDiscountState: function() {
            this.discountState.cartQuantity = 0;
            this.discountState.autoPercent = 0;
            this.discountState.applied = null;
            this.discountState.error = null;
            this.discountState.isApplying = false;
            this.discountState.promo = null;
            if (this.elements.promoInput) {
                this.elements.promoInput.value = '';
            }
            this.hidePromoInput();
            this.refreshDiscountUI();
        },

        showPromoInput: function() {
            if (!this.allowDiscounts) {
                return;
            }
            const container = this.elements.promoInputContainer;
            if (!container) {
                return;
            }
            container.classList.remove('hidden');
            if (this.elements.promoButton) {
                this.elements.promoButton.disabled = true;
            }
            const input = this.elements.promoInput;
            if (input) {
                input.disabled = false;
                input.value = this.discountState.promo?.code || '';
                requestAnimationFrame(() => {
                    input.focus();
                    input.select();
                });
            }
        },

        hidePromoInput: function() {
            const container = this.elements.promoInputContainer;
            if (container) {
                container.classList.add('hidden');
            }
        },

        cancelPromoInput: function() {
            if (!this.allowDiscounts) {
                return;
            }
            const input = this.elements.promoInput;
            if (input) {
                input.value = this.discountState.promo?.code || '';
            }
            this.hidePromoInput();
            this.discountState.error = null;
            this.refreshDiscountUI();
        },

        handleApplyPromo: async function() {
            if (!this.allowDiscounts || this.discountState.isApplying) {
                return;
            }

            if (!this.cart.length) {
                this.setPromoError(__('Add items to use a promo code.'));
                return;
            }

            const input = this.elements.promoInput;
            const rawCode = (input?.value || '').trim();
            if (!rawCode) {
                this.setPromoError(__('Enter a promo code.'));
                return;
            }

            this.discountState.isApplying = true;
            this.discountState.error = null;
            this.refreshDiscountUI();

            try {
                const totals = this.calculateTotals();
                const payload = {
                    promo_code: rawCode,
                    pos_profile: POS_PROFILE,
                    branch: typeof BRANCH !== 'undefined' ? BRANCH : null,
                    quantity: this.discountState.cartQuantity,
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    total: totals.gross,
                    order_type: MODE || null,
                };
                if (TABLE) {
                    payload.table = TABLE;
                }

                const response = await frappe.call({
                    method: 'imogi_pos.api.pricing.validate_promo_code',
                    args: payload,
                });

                const result = response?.message ?? response;
                const normalized = this.normalizePromoResult(result, rawCode);
                if (!normalized || normalized.error) {
                    const message = normalized?.error || result?.message || __('Promo code is invalid or expired.');
                    this.discountState.promo = null;
                    this.setPromoError(message);
                } else {
                    this.discountState.promo = normalized;
                    this.discountState.error = null;
                    if (this.elements.promoInput) {
                        this.elements.promoInput.value = normalized.code;
                    }
                    this.hidePromoInput();
                }
            } catch (error) {
                console.error('Failed to validate promo code:', error);
                const message = error?.message || __('Failed to validate promo code. Please try again.');
                this.setPromoError(message);
            } finally {
                this.discountState.isApplying = false;
                this.updateCartTotals();
            }
        },

        removePromoCode: function() {
            if (!this.allowDiscounts) {
                return;
            }
            this.discountState.promo = null;
            this.discountState.error = null;
            if (this.elements.promoInput) {
                this.elements.promoInput.value = '';
            }
            this.hidePromoInput();
            this.updateCartTotals();
        },

        setPromoError: function(message) {
            if (!this.allowDiscounts) {
                return;
            }
            this.discountState.error = message ? String(message) : null;
            this.refreshDiscountUI();
        },

        refreshDiscountUI: function(totals) {
            if (!this.allowDiscounts) {
                if (this.elements.cartDiscountLabel) {
                    this.elements.cartDiscountLabel.textContent = __('Discount');
                }
                return;
            }

            if (!totals) {
                totals = this.calculateTotals();
            }

            const hasItems = this.cart.length > 0;

            if (this.elements.promoButton) {
                this.elements.promoButton.disabled = !hasItems || this.discountState.isApplying;
            }
            if (this.elements.promoApplyBtn) {
                this.elements.promoApplyBtn.disabled = this.discountState.isApplying;
            }
            if (this.elements.promoCancelBtn) {
                this.elements.promoCancelBtn.disabled = this.discountState.isApplying;
            }
            if (this.elements.promoInput) {
                this.elements.promoInput.disabled = this.discountState.isApplying;
            }

            if (!hasItems) {
                if (this.discountState.promo) {
                    this.discountState.promo = null;
                }
                this.hidePromoInput();
            }

            const labelEl = this.elements.cartDiscountLabel;
            if (labelEl) {
                const base = __('Discount');
                labelEl.textContent = totals.discountLabel ? `${base} (${totals.discountLabel})` : base;
            }

            const statusEl = this.elements.promoStatus;
            if (statusEl) {
                statusEl.classList.remove('error', 'success');
                let html = '';
                if (this.discountState.error) {
                    statusEl.classList.add('error');
                    html = escapeHtml(this.discountState.error);
                } else if (this.discountState.promo) {
                    const promo = this.discountState.promo;
                    statusEl.classList.add('success');
                    if (totals.discountSource === 'promo') {
                        const description =
                            promo.description || promo.message || __('Promo {0} applied', [promo.code]);
                        html = `${escapeHtml(description)} <button type="button" class="promo-remove">${__('Remove')}</button>`;
                    } else {
                        const infoMessage = __('Promo {0} saved. Automatic discount applied instead.', [promo.code]);
                        html = `${escapeHtml(infoMessage)} <button type="button" class="promo-remove">${__('Remove')}</button>`;
                    }
                } else if (totals.discountSource === 'auto' && totals.discountDescription) {
                    statusEl.classList.add('success');
                    html = escapeHtml(totals.discountDescription);
                }
                statusEl.innerHTML = html;
            }
        },

        normalizePromoResult: function(data, rawCode) {
            if (!data) {
                return { error: __('Promo code is invalid or expired.') };
            }
            if (data.error) {
                return { error: data.error };
            }
            if (data.valid === false) {
                return { error: data.message || __('Promo code is invalid or expired.') };
            }

            const code = (data.code || data.promo_code || rawCode || '').trim();
            if (!code) {
                return { error: __('Promo code is invalid or expired.') };
            }

            let percent = this.normalizeNumber(
                data.discount_percent ?? data.percent ?? data.percentage ?? 0
            );
            let amount = this.normalizeNumber(
                data.discount_amount ?? data.amount ?? data.value ?? 0
            );
            const type = String(data.discount_type || data.type || '').toLowerCase();

            let discountType = 'percent';
            if (type.includes('amount') || type.includes('value') || type.includes('fixed')) {
                discountType = 'amount';
            } else if (percent <= 0 && amount > 0) {
                discountType = 'amount';
            }

            percent = Math.max(0, percent);
            amount = Math.max(0, amount);
            if (discountType === 'percent' && percent <= 0 && amount > 0) {
                discountType = 'amount';
            } else if (discountType === 'amount' && amount <= 0 && percent > 0) {
                discountType = 'percent';
            }

            const normalizedPercent = discountType === 'percent' ? percent : 0;
            const normalizedAmount = discountType === 'amount' ? amount : 0;

            return {
                code: code.toUpperCase(),
                discountType,
                percent: normalizedPercent,
                amount: normalizedAmount,
                label:
                    data.label ||
                    data.title ||
                    (discountType === 'percent'
                        ? __('Promo {0} ({1}% off)', [code.toUpperCase(), normalizedPercent])
                        : __('Promo {0}', [code.toUpperCase()])),
                description:
                    data.description ||
                    data.message ||
                    data.detail ||
                    (discountType === 'percent'
                        ? __('{0}% discount applied.', [normalizedPercent])
                        : __('Discount applied.')),
                message: data.status_message || data.success_message || null,
            };
        },
        
        // Load item data
        loadItems: async function() {
            this.showLoading('Loading menu...');
            
            try {
                const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item',
                        filters: {
                            disabled: 0,
                            is_sales_item: 1,
                            menu_category: ['not in', ['', null]]
                        },
                        fields: ['name', 'item_name', 'item_code', 'description', 'image', 
                                'standard_rate', 'has_variants', 'variant_of', 'item_group',
                                'menu_category', 'photo', 'default_kitchen', 'default_kitchen_station'],
                        limit: 500
                    }
                });
                
                if (response.message) {
                    const payload = Array.isArray(response.message) ? response.message : [];
                    const templates = [];
                    const variants = [];
                    const standalone = [];
                    const templateIndex = new Map();
                    const registerTemplateKeys = (template) => {
                        if (!template) {
                            return;
                        }
                        const keys = [template.name, template.item_code].filter(Boolean);
                        keys.forEach((key) => {
                            if (!templateIndex.has(key)) {
                                templateIndex.set(key, template);
                            }
                        });
                    };

                    payload.forEach((item) => {
                        const hasVariants = Boolean(item.has_variants);
                        const isVariant = Boolean(item.variant_of);

                        if (hasVariants) {
                            templates.push(item);
                            registerTemplateKeys(item);
                        }

                        if (isVariant) {
                            variants.push(item);
                        } else if (!hasVariants) {
                            standalone.push(item);
                        }
                    });

                    const inheritFields = [
                        'menu_category',
                        'item_group',
                        'image',
                        'item_image',
                        'web_image',
                        'thumbnail',
                        'description',
                        'photo',
                        'default_kitchen',
                        'default_kitchen_station',
                    ];

                    variants.forEach((variant) => {
                        const template =
                            templateIndex.get(variant.variant_of) ||
                            templateIndex.get(variant.template_item) ||
                            templateIndex.get(variant.template_item_code);

                        if (template) {
                            inheritFields.forEach((field) => {
                                if ((variant[field] === undefined || variant[field] === null || variant[field] === '')
                                    && (template[field] !== undefined && template[field] !== null && template[field] !== '')) {
                                    variant[field] = template[field];
                                }
                            });
                        }
                    });

                    const combinedItems = [
                        ...standalone,
                        ...templates,
                    ];

                    this.items = combinedItems.filter(item => hasValidMenuCategory(item.menu_category));
                    this.filteredItems = [...this.items];

                    this.resetVariantPool();
                    variants.forEach((variant) => {
                        const template =
                            templateIndex.get(variant.variant_of) ||
                            templateIndex.get(variant.template_item) ||
                            templateIndex.get(variant.template_item_code) ||
                            { name: variant.variant_of || variant.template_item || variant.template_item_code || variant.name };
                        this.cacheVariantsForTemplate(template, [variant]);
                    });

                    this.refreshAllVariantDisplayRates();

                    // Load rates for items that don't have standard_rate
                    await this.loadItemRates();
                }

                this.hideLoading();
            } catch (error) {
                console.error("Error loading items:", error);
                this.showError("Failed to load menu items. Please try again.");
                this.hideLoading();
            }
        },
        
        loadItemRates: async function(force = false) {
            if (!Array.isArray(this.items) || !this.items.length) {
                return;
            }

            const priceList = 'Standard Selling';
            const itemTargets = force ? this.items : this.items.filter(item => !item.standard_rate);
            const cachedVariants = this.getAllCachedVariants();
            const variantTargets = force
                ? cachedVariants
                : cachedVariants.filter(variant => !variant.standard_rate);

            const lookupNames = Array.from(new Set(
                [...itemTargets, ...variantTargets]
                    .map(entry => entry && entry.name)
                    .filter(Boolean)
            ));

            if (!lookupNames.length) {
                this.refreshAllVariantDisplayRates();
                return;
            }

            try {
                const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Price',
                        filters: {
                            item_code: ['in', lookupNames],
                            price_list: priceList
                        },
                        fields: ['item_code', 'price_list_rate'],
                        limit_page_length: lookupNames.length
                    }
                });

                if (response.message) {
                    const variantMap = new Map();
                    cachedVariants.forEach((variant) => {
                        if (variant && variant.name) {
                            variantMap.set(variant.name, variant);
                        }
                    });

                    response.message.forEach(price => {
                        const rate = this.normalizeNumber(price.price_list_rate);
                        const item = this.items.find(i => i.name === price.item_code);
                        if (item) {
                            item.standard_rate = rate;
                            return;
                        }

                        const variant = variantMap.get(price.item_code);
                        if (variant) {
                            variant.standard_rate = rate;
                        }
                    });
                }
            } catch (error) {
                console.error("Error loading item rates:", error);
            }

            this.refreshAllVariantDisplayRates();
        },

        loadTaxTemplate: async function() {
            this.taxRate = 0.11;
            this.updateCartTotals();
        },

        loadVariantsForTemplate: async function(templateItem) {
            this.showLoading('Loading options...');

            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_item_variants',
                    args: {
                        template_item: templateItem.name
                    }
                });
                const payload = response.message;
                const variants = Array.isArray(payload)
                    ? payload
                    : ((payload && payload.variants) || []);
                if (variants.length) {
                    this.cacheVariantsForTemplate(templateItem, variants);
                    this.refreshVariantDisplayRateForTemplate(templateItem);
                    return variants;
                }

                const cached = this.getCachedVariantsForTemplate(templateItem);
                return cached.length ? cached : [];
            } catch (error) {
                console.error("Error loading variants:", error);
                this.showError("Failed to load options. Please try again.");
                const cached = this.getCachedVariantsForTemplate(templateItem);
                return cached.length ? cached : [];
            } finally {
                this.hideLoading();
            }
        },
        
        // Render items in the grid
        renderItems: function() {
            if (!this.filteredItems.length) {
                this.elements.itemsGrid.innerHTML = `
                    <div class="empty-items">
                        <p>No items found</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            
            this.filteredItems.forEach(item => {
                const imageUrl = item.photo || item.image || '/assets/imogi_pos/images/default-product-image.svg';
                const displayRate = this.getDisplayRateForItem(item);
                const formattedPrice = `${CURRENCY_SYMBOL} ${formatNumber(Number.isFinite(displayRate) ? displayRate : 0)}`;

                html += `
                    <div class="item-card" data-item="${item.name}">
                        <div class="item-image" style="background-image: url('${imageUrl}')"></div>
                        <div class="item-info">
                            <div class="item-name">${item.item_name}</div>
                            <div class="item-price">${formattedPrice}</div>
                            ${item.has_variants ? '<div class="item-has-variants">Multiple options</div>' : ''}
                        </div>
                    </div>
                `;
            });
            
            this.elements.itemsGrid.innerHTML = html;
            
            // Add click handlers to item cards
            const itemCards = this.elements.itemsGrid.querySelectorAll('.item-card');
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
        
        // Render cart items
        renderCart: function() {
            if (this.cart.length === 0) {
                this.elements.cartItems.innerHTML = `
                    <div class="empty-cart-message">
                        <div class="empty-cart-icon">
                            <i class="fa fa-shopping-cart"></i>
                        </div>
                        <p>Your cart is empty</p>
                        <p>Add items to get started</p>
                    </div>
                `;
                
                if (this.elements.submitBtn) {
                    this.elements.submitBtn.disabled = true;
                }
                
                if (this.elements.checkoutBtn) {
                    this.elements.checkoutBtn.disabled = true;
                }

                this.elements.clearBtn.disabled = true;
                if (this.allowDiscounts) {
                    this.resetDiscountState();
                }
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
                        <div class="cart-item-remove" data-index="${index}">Remove</div>
                    </div>
                `;
            });
            
            this.elements.cartItems.innerHTML = html;
            
            // Add event listeners to cart items
            const qtyMinusButtons = this.elements.cartItems.querySelectorAll('.qty-minus');
            const qtyPlusButtons = this.elements.cartItems.querySelectorAll('.qty-plus');
            const qtyInputs = this.elements.cartItems.querySelectorAll('.cart-item-qty');
            const removeButtons = this.elements.cartItems.querySelectorAll('.cart-item-remove');
            
            qtyMinusButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const index = parseInt(button.dataset.index, 10);
                    const currentQty = Number(this.cart[index] && this.cart[index].qty) || 0;
                    this.updateCartItemQuantity(index, currentQty - 1);
                });
            });

            qtyPlusButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const index = parseInt(button.dataset.index, 10);
                    const currentQty = Number(this.cart[index] && this.cart[index].qty) || 0;
                    this.updateCartItemQuantity(index, currentQty + 1);
                });
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
            
            if (this.elements.submitBtn) {
                this.elements.submitBtn.disabled = false;
            }
            
            if (this.elements.checkoutBtn) {
                this.elements.checkoutBtn.disabled = false;
            }

            this.elements.clearBtn.disabled = false;
            if (this.allowDiscounts) {
                this.refreshDiscountUI();
            }
        },
        
        // Render variants in the modal
        renderVariants: function(variants) {
            if (!variants || variants.length === 0) {
                this.elements.variantGrid.innerHTML = `
                    <div class="empty-variants">
                        <p>No options available for this item</p>
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
            
            // Add click handlers to variant cards
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
        
        // Update cart totals
        updateCartTotals: function() {
            const totals = this.calculateTotals();

            this.elements.cartSubtotal.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.subtotal)}`;
            this.elements.cartTax.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.tax)}`;
            if (this.elements.cartDiscount) {
                this.elements.cartDiscount.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.discountAmount)}`;
            }
            this.elements.cartTotal.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.total)}`;
            this.elements.cartCount.textContent = this.cart.reduce((sum, item) => sum + item.qty, 0);
            if (this.allowDiscounts) {
                this.refreshDiscountUI(totals);
            }
        },

        isItemSoldOut: function(item, actualQty, isComponentShortage) {
            if (!item && actualQty == null && typeof isComponentShortage === 'undefined') {
                return false;
            }

            const parseQty = (value) => {
                if (value === null || value === undefined || value === '') {
                    return null;
                }
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : null;
            };

            const parseShortage = (value) => {
                if (value === undefined) {
                    return false;
                }
                if (value === null || value === '') {
                    return false;
                }
                if (typeof value === 'string') {
                    const lowered = value.trim().toLowerCase();
                    if (!lowered) {
                        return false;
                    }
                    if (lowered === 'true') {
                        return true;
                    }
                    if (lowered === 'false') {
                        return false;
                    }
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) {
                        return numeric !== 0;
                    }
                }
                if (typeof value === 'number') {
                    return value !== 0;
                }
                return Boolean(value);
            };

            if (item && item.has_variants) {
                const cachedVariants = this.getCachedVariantsForTemplate(item) || [];
                if (cachedVariants.length) {
                    const hasAvailableVariant = cachedVariants.some((variant) => {
                        const qty = parseQty(variant?.actual_qty);
                        if (qty === null || qty <= 0) {
                            return false;
                        }
                        const shortageSource = Object.prototype.hasOwnProperty.call(variant || {}, 'is_component_shortage')
                            ? variant.is_component_shortage
                            : variant?.component_shortage;
                        const variantShortage = parseShortage(shortageSource);
                        return !variantShortage;
                    });

                    if (hasAvailableVariant) {
                        return false;
                    }
                }
            }

            const qtyValue = actualQty != null ? parseQty(actualQty) : parseQty(item?.actual_qty);
            const shortageFlag = typeof isComponentShortage !== 'undefined'
                ? parseShortage(isComponentShortage)
                : parseShortage(item?.is_component_shortage);

            return Boolean(shortageFlag) || (qtyValue !== null && qtyValue <= 0);
        },

        // Update the entire cart UI
        updateCartUI: function() {
            this.renderCart();
            this.updateCartTotals();
        },
        
        // Handle search input
        handleSearch: function() {
            this.searchQuery = this.elements.searchInput.value.toLowerCase();
            this.filterItems();
        },
        
        // Handle category selection
        selectCategory: function(category) {
            this.selectedCategory = category;
            
            // Update UI
            const pills = this.elements.categoriesContainer.querySelectorAll('.category-pill');
            pills.forEach(pill => {
                pill.classList.toggle('active', pill.dataset.category === category);
            });
            
            this.filterItems();
        },
        
        // Filter items based on search and category
        filterItems: function() {
            this.filteredItems = this.items.filter(item => {
                // Filter by search
                const matchesSearch = !this.searchQuery || 
                    item.item_name.toLowerCase().includes(this.searchQuery) ||
                    item.item_code.toLowerCase().includes(this.searchQuery) ||
                    (item.description && item.description.toLowerCase().includes(this.searchQuery));
                
                // Filter by category
                const matchesCategory = this.selectedCategory === 'all' ||
                    (hasValidMenuCategory(item.menu_category) &&
                        item.menu_category.trim() === this.selectedCategory);
                
                return matchesSearch && matchesCategory;
            });
            
            this.renderItems();
        },
        
        // Handle item click
        handleItemClick: function(item) {
            if (item.has_variants) {
                // Open variant picker
                this.openVariantPicker(item);
            } else {
                // Add directly to cart
                this.addItemToCart(item);
            }
        },
        
        // Open variant picker modal
        openVariantPicker: async function(item) {
            this.selectedTemplateItem = item;
            this.selectedVariant = null;
            
            // Reset notes if available
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
        
        // Close variant picker modal
        closeVariantModal: function() {
            this.elements.variantModal.style.display = 'none';
            this.selectedTemplateItem = null;
            this.selectedVariant = null;
        },
        
        // Add selected variant to cart
        addSelectedVariantToCart: function() {
            if (!this.selectedVariant) return;
            
            const notes = this.elements.itemNotes ? this.elements.itemNotes.value : '';
            
            this.addItemToCart(this.selectedVariant, notes);
            this.closeVariantModal();
        },
        
        // Add item to cart
        addItemToCart: function(item, notes = '') {
            // Check if item already in cart with same notes
            const existingIndex = this.cart.findIndex(i => 
                i.item_code === item.name && i.notes === notes
            );
            
            if (existingIndex >= 0) {
                // Update quantity
                const existingItem = this.cart[existingIndex];
                const currentQty = Number(existingItem && existingItem.qty) || 0;
                const updatedQty = currentQty + 1;

                existingItem.qty = updatedQty;
                const rate = Number(existingItem.rate) || 0;
                existingItem.amount = rate * updatedQty;
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
            
            // Update cart UI
            this.updateCartUI();
            
            // Open cart
            this.openCart();
            
            // Sync with server
            this.syncCartWithServer();
        },
        
        // Update cart item quantity
        updateCartItemQuantity: function(index, newQty) {
            const safeQty = Number(newQty);
            if (!Number.isFinite(safeQty) || safeQty < 1) {
                this.removeCartItem(index);
                return;
            }

            this.cart[index].qty = safeQty;
            const rate = Number(this.cart[index].rate) || 0;
            this.cart[index].amount = rate * safeQty;
            
            this.updateCartUI();
            
            // Sync with server
            this.syncCartWithServer();
        },
        
        // Remove item from cart
        removeCartItem: function(index) {
            this.cart.splice(index, 1);
            this.updateCartUI();
            
            // Sync with server
            this.syncCartWithServer();
        },
        
        // Clear cart
        clearCart: function() {
            if (!this.cart.length) return;
            
            if (confirm('Are you sure you want to clear your order?')) {
                this.cart = [];
                this.updateCartUI();
                
                // Sync with server
                this.syncCartWithServer();
            }
        },
        
        // Sync cart with server
        syncCartWithServer: async function() {
            try {
                // Only sync if we have a session ID
                if (!SESSION_ID) return;
                
                await frappe.call({
                    method: 'imogi_pos.api.self_order.update_session_cart',
                    args: {
                        session_id: SESSION_ID,
                        cart_items: this.cart
                    }
                });
            } catch (error) {
                console.error('Error syncing cart with server:', error);
            }
        },
        
        // Toggle cart panel
        toggleCart: function() {
            if (this.elements.cartPanel.classList.contains('open')) {
                this.closeCart();
            } else {
                this.openCart();
            }
        },
        
        // Open cart panel
        openCart: function() {
            this.elements.cartPanel.classList.add('open');
            this.elements.overlay.classList.add('open');
        },
        
        // Close cart panel
        closeCart: function() {
            this.elements.cartPanel.classList.remove('open');
            this.elements.overlay.classList.remove('open');
        },
        
        // Handle submit (Table mode)
        handleSubmit: async function() {
            if (!this.cart.length) return;

            this.showLoading('Submitting order to kitchen...');

            try {
                const totals = this.calculateTotals();
                const response = await frappe.call({
                    method: 'imogi_pos.api.self_order.submit_table_order',
                    args: {
                        session_id: SESSION_ID,
                        cart_items: this.cart,
                        table: TABLE,
                        pos_profile: POS_PROFILE,
                        branch: BRANCH,
                        discount_amount: totals.discountAmount,
                        discount_percent: totals.discountPercent,
                        promo_code: totals.promoCode
                    }
                });
                
                this.hideLoading();
                
                if (response.message && response.message.success) {
                    // Show success message
                    this.showSuccess('Order submitted to kitchen successfully');
                    
                    // Clear cart
                    this.cart = [];
                    this.updateCartUI();
                    this.closeCart();
                } else {
                    throw new Error(response.message?.error || 'Failed to submit order');
                }
            } catch (error) {
                this.hideLoading();
                this.showError('Failed to submit order: ' + (error.message || 'Unknown error'));
            }
        },
        
        // Handle checkout (Takeaway mode)
        handleCheckout: async function() {
            if (!this.cart.length) return;
            
            // Check if payment is required
            if (REQUIRE_PAYMENT && PAYMENT_SETTINGS.gateway_enabled) {
                this.openPaymentModal();
            } else {
                // Proceed without payment
                this.completeTakeawayOrder();
            }
        },
        
        // Open payment modal
        openPaymentModal: function() {
            const totals = this.calculateTotals();
            
            // Set payment amount
            this.elements.paymentAmount.textContent = `${CURRENCY_SYMBOL} ${formatNumber(totals.total)}`;
            
            // Show modal
            this.elements.paymentModal.style.display = 'flex';
            
            // Request payment QR
            this.requestPaymentQR();
        },
        
        // Request payment QR from server
        requestPaymentQR: async function() {
            this.showLoading('Generating payment QR code...');

            try {
                // First create a draft invoice and order
                const totals = this.calculateTotals();
                const checkoutResponse = await frappe.call({
                    method: 'imogi_pos.api.self_order.checkout_takeaway',
                    args: {
                        session_id: SESSION_ID,
                        cart_items: this.cart,
                        pos_profile: POS_PROFILE,
                        branch: BRANCH,
                        customer: 'Walk-in Customer',
                        discount_amount: totals.discountAmount,
                        discount_percent: totals.discountPercent,
                        promo_code: totals.promoCode
                    }
                });
                
                if (!checkoutResponse.message || !checkoutResponse.message.invoice) {
                    throw new Error('Failed to create invoice');
                }
                
                const invoice = checkoutResponse.message.invoice;
                
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
                this.hideLoading();
                this.showError("Failed to generate payment QR. Please try again.");
                this.closePaymentModal();
            }
        },
        
        // Start payment countdown timer
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
        
        // Update countdown display
        updateCountdownDisplay: function() {
            const minutes = Math.floor(this.paymentCountdown / 60);
            const seconds = this.paymentCountdown % 60;
            this.elements.paymentCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        },
        
        // Poll payment status
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
        
        // Handle successful payment
        handlePaymentSuccess: function() {
            // Stop countdown
            if (this.paymentTimer) {
                clearInterval(this.paymentTimer);
            }
            
            // Update status
            this.elements.paymentStatus.className = 'payment-status success';
            this.elements.paymentStatus.textContent = 'Payment successful!';
            
            // Close payment modal after a delay and show success message
            setTimeout(() => {
                this.closePaymentModal();
                this.showSuccess('Order has been placed and paid successfully');
                
                // Clear cart
                this.cart = [];
                this.updateCartUI();
                this.closeCart();
            }, 2000);
        },
        
        // Handle expired payment
        handlePaymentExpired: function() {
            // Update status
            this.elements.paymentStatus.className = 'payment-status error';
            this.elements.paymentStatus.textContent = 'Payment expired. Please try again.';
            
            // Close payment modal after a delay
            setTimeout(() => {
                this.closePaymentModal();
            }, 3000);
        },
        
        // Close payment modal
        closePaymentModal: function() {
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
            
            this.elements.paymentModal.style.display = 'none';
        },
        
        // Cancel payment
        cancelPayment: function() {
            this.closePaymentModal();
        },
        
        // Complete takeaway order without payment
        completeTakeawayOrder: async function() {
            this.showLoading('Processing your order...');

            try {
                const totals = this.calculateTotals();
                const response = await frappe.call({
                    method: 'imogi_pos.api.self_order.checkout_takeaway',
                    args: {
                        session_id: SESSION_ID,
                        cart_items: this.cart,
                        pos_profile: POS_PROFILE,
                        branch: BRANCH,
                        customer: 'Walk-in Customer',
                        skip_payment: true,
                        discount_amount: totals.discountAmount,
                        discount_percent: totals.discountPercent,
                        promo_code: totals.promoCode
                    }
                });
                
                this.hideLoading();
                
                if (response.message && response.message.success) {
                    // Show success message
                    this.showSuccess('Order has been placed successfully');
                    
                    // Clear cart
                    this.cart = [];
                    this.updateCartUI();
                    this.closeCart();
                } else {
                    throw new Error(response.message?.error || 'Failed to complete order');
                }
            } catch (error) {
                this.hideLoading();
                this.showError('Failed to complete order: ' + (error.message || 'Unknown error'));
            }
        },

        normalizeNumber: function(value) {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        },

        // Calculate cart totals
        calculateTotals: function() {
            const subtotal = this.cart.reduce((sum, item) => sum + item.amount, 0);
            const tax = subtotal * this.taxRate;
            const gross = subtotal + tax;

            const quantity = this.cart.reduce(
                (sum, item) => sum + this.normalizeNumber(item.qty),
                0
            );
            this.discountState.cartQuantity = quantity;

            let discountAmount = 0;
            let discountPercent = 0;
            let discountLabel = '';
            let discountDescription = '';
            let discountSource = null;
            let promoCode = null;

            let autoPercent = 0;
            let autoAmount = 0;
            let autoDescription = '';
            if (this.allowDiscounts && quantity >= 5 && gross > 0) {
                autoPercent = 10;
                autoAmount = gross * 0.1;
                autoDescription = __('Automatic 10% discount applied for 5 or more items.');
            }
            this.discountState.autoPercent = autoPercent;

            let promoAmount = 0;
            let promoPercent = 0;
            let promoLabel = '';
            let promoDescription = '';
            if (this.allowDiscounts && this.discountState.promo && gross > 0) {
                const promo = this.discountState.promo;
                promoLabel = promo.label || __('Promo {0}', [promo.code]);
                promoDescription = promo.description || promo.message || '';
                promoCode = promo.code || null;

                if (promo.discountType === 'percent' && promo.percent > 0) {
                    promoPercent = this.normalizeNumber(promo.percent);
                    promoAmount = gross * (promoPercent / 100);
                } else if (promo.discountType === 'amount' && promo.amount > 0) {
                    promoAmount = this.normalizeNumber(promo.amount);
                } else {
                    if (promo.percent > 0) {
                        promoPercent = this.normalizeNumber(promo.percent);
                        promoAmount = gross * (promoPercent / 100);
                    } else if (promo.amount > 0) {
                        promoAmount = this.normalizeNumber(promo.amount);
                    }
                }
            }

            promoAmount = Math.min(gross, Math.max(0, promoAmount));
            autoAmount = Math.min(gross, Math.max(0, autoAmount));

            if (this.allowDiscounts) {
                if (promoAmount > 0 && promoAmount >= autoAmount) {
                    discountAmount = promoAmount;
                    discountPercent = promoPercent;
                    discountLabel = promoLabel || __('Promo');
                    discountDescription =
                        promoDescription ||
                        (promoPercent > 0
                            ? __('{0}% discount applied.', [promoPercent])
                            : __('Discount applied.'));
                    discountSource = 'promo';
                } else if (autoAmount > 0) {
                    discountAmount = autoAmount;
                    discountPercent = autoPercent;
                    discountLabel = __('Auto 10%');
                    discountDescription = autoDescription;
                    discountSource = 'auto';
                    promoCode = null;
                } else {
                    promoCode = null;
                }
            } else {
                this.discountState.autoPercent = 0;
            }

            discountAmount = Math.min(gross, Math.max(0, discountAmount));
            const total = Math.max(0, gross - discountAmount);

            this.discountState.applied = discountSource
                ? {
                      type: discountSource,
                      amount: discountAmount,
                      percent: discountPercent,
                      code: promoCode,
                      label: discountLabel,
                      description: discountDescription,
                  }
                : null;

            return {
                subtotal,
                tax,
                gross,
                discountAmount,
                discountPercent,
                discountLabel,
                discountDescription,
                discountSource,
                promoCode,
                total,
            };
        },
        
        // Setup realtime updates
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
            
            // Listen for session updates
            if (SESSION_ID) {
                frappe.realtime.on(`self_order:session:${SESSION_ID}`, (data) => {
                    if (data.event_type === 'session_expired') {
                        // Reload the page to show expired message
                        window.location.reload();
                    }
                });
            }
            
            // Listen for order updates if we have a table
            if (TABLE) {
                frappe.realtime.on(`self_order:table:${TABLE}`, (data) => {
                    if (data.event_type === 'order_status_updated') {
                        // Update order status if needed
                    }
                });
            }
        },
        
        // Show loading overlay
        showLoading: function(message = 'Loading...') {
            this.elements.loadingText.textContent = message;
            this.elements.loadingOverlay.style.display = 'flex';
        },
        
        // Hide loading overlay
        hideLoading: function() {
            this.elements.loadingOverlay.style.display = 'none';
        },
        
        // Show error message
        showError: function(message) {
            alert(message);
        },
        
        // Show success message
        showSuccess: function(message) {
            // Replace current content with success message
            const mainContent = document.querySelector('.main-content');
            
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="success-message">
                        <div class="success-icon">
                            <i class="fa fa-check-circle"></i>
                        </div>
                        <h2 class="success-title">${message}</h2>
                        <div class="success-details">
                            Thank you for your order!
                            ${MODE === 'Table' ? 'Your order has been sent to the kitchen.' : 'Your order will be ready soon.'}
                        </div>
                        <button class="btn-success" onclick="window.location.reload()">Place Another Order</button>
                    </div>
                `;
            } else {
                alert(message);
            }
        }
    };
    
    // Helper function to format numbers
    function formatNumber(number) {
        return parseFloat(number).toFixed(2);
    }

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
    
    // Initialize the app
    SelfOrderApp.init();
});