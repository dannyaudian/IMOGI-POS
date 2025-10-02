frappe.ready(async function() {
    const POS_PROFILE_DATA = {};

    function normaliseCustomerInfo(source) {
        if (!source || typeof source !== 'object') {
            return null;
        }

        const payload = {};
        const toText = (value) => {
            if (value === undefined || value === null) {
                return null;
            }
            const text = String(value).trim();
            return text.length ? text : null;
        };

        const maybeAssign = (field, value) => {
            const cleaned = toText(value);
            if (cleaned) {
                payload[field] = cleaned;
            }
        };

        maybeAssign(
            'customer_full_name',
            source.customer_full_name || source.full_name || source.name || source.customer_name,
        );
        maybeAssign('customer_gender', source.customer_gender || source.gender);
        maybeAssign(
            'customer_phone',
            source.customer_phone || source.phone || source.mobile_no || source.mobile,
        );

        const ageValue = source.customer_age ?? source.age;
        if (ageValue !== undefined && ageValue !== null && ageValue !== '') {
            const numeric = Number(ageValue);
            if (Number.isFinite(numeric) && numeric >= 0) {
                payload.customer_age = Math.round(numeric);
            }
        }

        return Object.keys(payload).length ? payload : null;
    }

    function collectCustomerInfo() {
        const aggregated = {};
        const merge = (source) => {
            const info = normaliseCustomerInfo(source);
            if (info) {
                Object.assign(aggregated, info);
            }
        };

        if (typeof window !== 'undefined') {
            if (window.CUSTOMER_INFO && typeof window.CUSTOMER_INFO === 'object') {
                merge(window.CUSTOMER_INFO);
            }
            if (window.customerInfo && typeof window.customerInfo === 'object') {
                merge(window.customerInfo);
            }
        }

        const infoElement = document.querySelector('[data-customer-info]');
        if (infoElement) {
            merge({
                customer_full_name:
                    infoElement.getAttribute('data-customer-full-name') ||
                    infoElement.dataset.customerFullName ||
                    infoElement.dataset.fullName ||
                    infoElement.dataset.name,
                customer_gender:
                    infoElement.getAttribute('data-customer-gender') ||
                    infoElement.dataset.customerGender ||
                    infoElement.dataset.gender,
                customer_phone:
                    infoElement.getAttribute('data-customer-phone') ||
                    infoElement.dataset.customerPhone ||
                    infoElement.dataset.phone,
                customer_age:
                    infoElement.getAttribute('data-customer-age') ||
                    infoElement.dataset.customerAge ||
                    infoElement.dataset.age,
            });
        }

        const fields = [
            'customer_full_name',
            'customer_gender',
            'customer_phone',
            'customer_age',
        ];
        const fieldSource = {};
        fields.forEach((field) => {
            const input = document.querySelector(`[name="${field}"]`);
            if (input && input.value) {
                fieldSource[field] = input.value;
            }
        });
        merge(fieldSource);

        return Object.keys(aggregated).length ? aggregated : null;
    }

    function hasValidMenuCategory(value) {
        if (typeof value !== 'string') {
            return false;
        }
        return value.trim().length > 0;
    }

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
        priceLists: [],
        selectedPriceList: POS_PROFILE_DATA.selling_price_list || null,
        basePriceList: POS_PROFILE_DATA.selling_price_list || null,
        itemIndex: new Map(),
        variantPool: new Map(),

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
        customerInfo: collectCustomerInfo(),

        // Payment state
        paymentRequest: null,
        // Default will be set when opening payment modal
        paymentMethod: 'cash',
        cashAmount: 0,
        paymentTimer: null,
        paymentCountdown: 300, // 5 minutes

        customerInfo: {
            name: '',
            gender: '',
            phone: '',
            age: '',
        },
        needsCustomerInfo: true,

        // Element references
        elements: {
            catalogGrid: document.getElementById('catalog-grid'),
            cartItems: document.getElementById('cart-items'),
            cartSubtotal: document.getElementById('cart-subtotal'),
            cartTax: document.getElementById('cart-tax'),
            cartDiscount: document.getElementById('cart-discount'),
            cartDiscountLabel: document.getElementById('cart-discount-label'),
            cartTotal: document.getElementById('cart-total'),
            checkoutBtn: document.getElementById('btn-checkout'),
            clearBtn: document.getElementById('btn-clear'),
            searchInput: document.getElementById('search-input'),
            categoriesContainer: document.getElementById('categories-container'),
            priceListSelect: document.getElementById('price-list-select'),
            promoSection: document.getElementById('promo-section'),
            promoButton: document.getElementById('btn-promo'),
            promoInputContainer: document.getElementById('promo-input-container'),
            promoInput: document.getElementById('promo-code-input'),
            promoApplyBtn: document.getElementById('promo-apply-btn'),
            promoCancelBtn: document.getElementById('promo-cancel-btn'),
            promoStatus: document.getElementById('promo-status'),
            
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
            itemDetailNotes: document.getElementById('item-detail-notes'),
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

            // Customer info modal
            customerModal: document.getElementById('customer-info-modal'),
            customerForm: document.getElementById('customer-info-form'),
            customerNameInput: document.getElementById('customer-name'),
            customerGenderSelect: document.getElementById('customer-gender'),
            customerPhoneInput: document.getElementById('customer-phone'),
            customerAgeInput: document.getElementById('customer-age'),
            customerSaveBtn: document.getElementById('btn-customer-save'),
            customerSkipBtn: document.getElementById('btn-customer-skip'),
            customerError: document.getElementById('customer-info-error'),
            
            // Success modal
            successModal: document.getElementById('success-modal'),
            successQueueNumber: document.getElementById('success-queue-number'),
            successReceipt: document.getElementById('success-receipt'),
            successDoneBtn: document.getElementById('btn-success-done'),
            
            // Loading overlay
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text')
        },

        // Pricing helpers
        normalizeNumber: function(value) {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        },

        getPriceListByName: function(name) {
            if (!name) {
                return null;
            }
            return this.priceLists.find(pl => pl.name === name) || null;
        },

        getSelectedPriceListMeta: function() {
            return this.getPriceListByName(this.selectedPriceList);
        },

        getSelectedPriceListAdjustment: function() {
            const meta = this.getSelectedPriceListMeta();
            if (!meta) {
                return 0;
            }
            return this.normalizeNumber(meta.adjustment);
        },

        registerCatalogItem: function(item) {
            if (!item || !item.name) {
                return;
            }
            if (!this.itemIndex || typeof this.itemIndex.set !== 'function') {
                this.itemIndex = new Map();
            }
            this.itemIndex.set(item.name, item);
        },

        getCatalogItem: function(itemCode) {
            if (!itemCode) {
                return null;
            }
            if (!this.itemIndex || typeof this.itemIndex.get !== 'function') {
                return null;
            }
            return this.itemIndex.get(itemCode) || null;
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

        applyPriceAdjustmentToCachedVariants: function() {
            const variants = this.getAllCachedVariants();
            if (variants.length) {
                this.applyPriceAdjustmentToItems(variants);
            }
            this.refreshAllVariantDisplayRates();
        },

        applyPriceAdjustmentToItem: function(item) {
            if (!item) {
                return 0;
            }

            if (!Object.prototype.hasOwnProperty.call(item, '_default_standard_rate')
                || !Number.isFinite(item._default_standard_rate)) {
                const baseSource = Object.prototype.hasOwnProperty.call(item, 'imogi_base_standard_rate')
                    ? item.imogi_base_standard_rate
                    : item.standard_rate;
                item._default_standard_rate = this.normalizeNumber(baseSource);
            }

            if (item.has_explicit_price_list_rate && !Number.isFinite(item._explicit_standard_rate)) {
                item._explicit_standard_rate = this.normalizeNumber(item.standard_rate);
            }

            const hasExplicit = Number.isFinite(item._explicit_standard_rate);
            const baseRate = hasExplicit
                ? this.normalizeNumber(item._explicit_standard_rate)
                : this.normalizeNumber(item._default_standard_rate);
            const adjustment = this.getSelectedPriceListAdjustment();
            const finalRate = hasExplicit ? baseRate : baseRate + adjustment;

            item.standard_rate = finalRate;
            item._has_explicit_price = hasExplicit;
            this.registerCatalogItem(item);

            return finalRate;
        },

        applyPriceAdjustmentToItems: function(items) {
            if (!Array.isArray(items)) {
                return;
            }
            items.forEach(item => this.applyPriceAdjustmentToItem(item));
        },

        applyPriceAdjustmentToVariants: function(variants) {
            if (!Array.isArray(variants)) {
                return [];
            }
            return variants.map(variant => {
                if (!variant) {
                    return variant;
                }
                variant.has_explicit_price_list_rate = Number(variant.has_explicit_price_list_rate) ? 1 : 0;
                if (variant.has_explicit_price_list_rate) {
                    variant._explicit_standard_rate = this.normalizeNumber(variant.standard_rate);
                } else if (!Object.prototype.hasOwnProperty.call(variant, '_explicit_standard_rate')) {
                    variant._explicit_standard_rate = null;
                }

                if (!Object.prototype.hasOwnProperty.call(variant, '_default_standard_rate')
                    || !Number.isFinite(variant._default_standard_rate)) {
                    const baseSource = Object.prototype.hasOwnProperty.call(variant, 'imogi_base_standard_rate')
                        ? variant.imogi_base_standard_rate
                        : variant.standard_rate;
                    variant._default_standard_rate = this.normalizeNumber(baseSource);
                }

                this.applyPriceAdjustmentToItem(variant);
                return variant;
            });
        },

        getAdjustedRateForItemCode: function(itemCode) {
            const item = this.getCatalogItem(itemCode);
            if (!item) {
                return null;
            }
            if (Number.isFinite(item._explicit_standard_rate)) {
                return this.normalizeNumber(item._explicit_standard_rate);
            }
            const baseRate = this.normalizeNumber(item._default_standard_rate);
            return baseRate + this.getSelectedPriceListAdjustment();
        },

        // Initialize
        init: async function() {
            this.setupEventListeners();
            this.initDiscountControls();
            await this.loadPriceLists();
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

            if (this.elements.itemNotes) {
                this.elements.itemNotes.addEventListener('input', (event) => {
                    this.pendingNotes = event.target.value || '';
                });
            }

            if (this.elements.itemDetailNotes) {
                this.elements.itemDetailNotes.addEventListener('input', (event) => {
                    this.pendingNotes = event.target.value || '';
                });
            }

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

            // Customer info modal
            if (this.elements.customerModal) {
                const closeBtn = this.elements.customerModal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        this.closeCustomerModal();
                    });
                }
            }
            if (this.elements.customerForm) {
                this.elements.customerForm.addEventListener('submit', (event) => {
                    event.preventDefault();
                    this.submitCustomerInfo();
                });
            }
            if (this.elements.customerSaveBtn) {
                this.elements.customerSaveBtn.addEventListener('click', () => {
                    this.submitCustomerInfo();
                });
            }
            if (this.elements.customerSkipBtn) {
                this.elements.customerSkipBtn.addEventListener('click', () => {
                    this.skipCustomerInfo();
                });
            }
            const customerInputs = [
                this.elements.customerNameInput,
                this.elements.customerPhoneInput,
                this.elements.customerAgeInput,
            ];
            customerInputs.forEach((input) => {
                if (input) {
                    input.addEventListener('input', () => {
                        this.clearCustomerInfoError();
                    });
                }
            });
            if (this.elements.customerGenderSelect) {
                this.elements.customerGenderSelect.addEventListener('change', () => {
                    this.clearCustomerInfoError();
                });
            }

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
                    pos_profile:
                        POS_PROFILE_DATA?.name || (typeof POS_PROFILE === 'object' ? POS_PROFILE.name : POS_PROFILE),
                    branch: typeof CURRENT_BRANCH !== 'undefined' ? CURRENT_BRANCH : null,
                    quantity: this.discountState.cartQuantity,
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    total: totals.gross,
                    order_type: this.orderType || null,
                };
                if (this.tableNumber) {
                    payload.table = this.tableNumber;
                }

                const normalizeCategoryValue = value => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const text = String(value).trim();
                    return text || null;
                };

                payload.items = this.cart.map(entry => {
                    const itemCode = entry.item_code || entry.item || null;
                    const payloadItem = {};
                    if (itemCode) {
                        payloadItem.item_code = itemCode;
                        payloadItem.item = itemCode;
                    }

                    const numericQty = Number(entry.qty ?? entry.quantity);
                    if (Number.isFinite(numericQty)) {
                        payloadItem.qty = numericQty;
                        payloadItem.quantity = numericQty;
                    } else if (entry.qty !== undefined) {
                        payloadItem.qty = entry.qty;
                    }

                    let category =
                        normalizeCategoryValue(entry.menu_category)
                        || normalizeCategoryValue(entry.category)
                        || normalizeCategoryValue(entry.item_group)
                        || null;

                    if (!category && itemCode) {
                        const catalog =
                            this.getCatalogItem(itemCode)
                            || (entry.variant_of ? this.getCatalogItem(entry.variant_of) : null);
                        if (catalog) {
                            category =
                                normalizeCategoryValue(catalog.menu_category)
                                || normalizeCategoryValue(catalog.item_group)
                                || null;
                        }
                    }

                    if (category) {
                        payloadItem.menu_category = category;
                    }

                    return payloadItem;
                });

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
                    currency: row.currency || null,
                    adjustment: this.normalizeNumber(row.adjustment)
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

            const adjustment = this.getSelectedPriceListAdjustment();

            this.cart.forEach(item => {
                const extra = this.normalizeNumber(this.getCartItemExtra(item));
                let baseRate;

                if (Object.prototype.hasOwnProperty.call(priceMap, item.item_code)) {
                    baseRate = this.normalizeNumber(priceMap[item.item_code]);
                    const catalogItem = this.getCatalogItem(item.item_code);
                    if (catalogItem) {
                        catalogItem._explicit_standard_rate = baseRate;
                        catalogItem.has_explicit_price_list_rate = 1;
                        this.applyPriceAdjustmentToItem(catalogItem);
                    }
                } else {
                    const catalogItem = this.getCatalogItem(item.item_code);
                    if (catalogItem) {
                        if (Number.isFinite(catalogItem._explicit_standard_rate)) {
                            baseRate = this.normalizeNumber(catalogItem._explicit_standard_rate);
                        } else {
                            const defaultRate = this.normalizeNumber(catalogItem._default_standard_rate);
                            baseRate = defaultRate + adjustment;
                        }
                    } else {
                        const fallbackBase = typeof item._base_rate === 'number'
                            ? item._base_rate
                            : (Number(item.rate) || 0) - extra;
                        baseRate = Number.isFinite(fallbackBase) ? fallbackBase : 0;
                    }
                }

                const safeBase = Number.isFinite(baseRate) ? baseRate : 0;
                item._base_rate = safeBase;
                item._extra_rate = extra;
                const finalRate = safeBase + extra;
                item.rate = finalRate;
                item.amount = finalRate * item.qty;
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
                        price_list: this.selectedPriceList || null,
                        base_price_list: this.basePriceList || null
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

                    if (this.itemIndex && typeof this.itemIndex.clear === 'function') {
                        this.itemIndex.clear();
                    } else {
                        this.itemIndex = new Map();
                    }

                    const pricingTargets = [];
                    const seenPricingTargets = new Set();
                    const registerPricingTarget = (item) => {
                        if (!item || !item.name) {
                            return;
                        }
                        if (seenPricingTargets.has(item.name)) {
                            return;
                        }
                        seenPricingTargets.add(item.name);
                        pricingTargets.push(item);
                    };

                    combinedItems.forEach(registerPricingTarget);
                    templates.forEach(registerPricingTarget);
                    variants.forEach(registerPricingTarget);

                    pricingTargets.forEach((item) => {
                        item.has_explicit_price_list_rate = Number(item.has_explicit_price_list_rate) ? 1 : 0;
                        if (item.has_explicit_price_list_rate) {
                            item._explicit_standard_rate = this.normalizeNumber(item.standard_rate);
                        } else if (!Object.prototype.hasOwnProperty.call(item, '_explicit_standard_rate')) {
                            item._explicit_standard_rate = null;
                        }
                        const baseSource = Object.prototype.hasOwnProperty.call(item, 'imogi_base_standard_rate')
                            ? item.imogi_base_standard_rate
                            : item.standard_rate;
                        item._default_standard_rate = this.normalizeNumber(baseSource);
                        this.applyPriceAdjustmentToItem(item);
                    });

                    this.resetVariantPool();
                    variants.forEach((variant) => {
                        const template =
                            templateIndex.get(variant.variant_of) ||
                            templateIndex.get(variant.template_item) ||
                            templateIndex.get(variant.template_item_code) ||
                            { name: variant.variant_of || variant.template_item || variant.template_item_code || variant.name };
                        this.cacheVariantsForTemplate(template, [variant]);
                    });

                    this.items = combinedItems;
                    this.filteredItems = [...this.items];
                    this.refreshAllVariantDisplayRates();

                    // Load rates for items that don't have standard_rate
                    await this.loadItemRates(!this.selectedPriceList);

                    // Build unique list of categories from loaded items
                    const categorySet = new Set();
                    this.items.forEach(item => {
                        if (hasValidMenuCategory(item.menu_category)) {
                            categorySet.add(item.menu_category.trim());
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
            if (!priceList || !this.items.length) {
                return;
            }

            if (force) {
                this.items.forEach(item => {
                    item.has_explicit_price_list_rate = 0;
                    item._explicit_standard_rate = null;
                });
                this.getAllCachedVariants().forEach((variant) => {
                    variant.has_explicit_price_list_rate = 0;
                    variant._explicit_standard_rate = null;
                });
            }

            const targetItems = force ? this.items : this.items.filter(item => !item.standard_rate);
            const cachedVariants = this.getAllCachedVariants();
            const targetVariants = force
                ? cachedVariants
                : cachedVariants.filter(variant => !variant.standard_rate);
            const lookupNames = Array.from(new Set(
                [...targetItems, ...targetVariants]
                    .map(item => item && item.name)
                    .filter(Boolean)
            ));

            if (!lookupNames.length) {
                this.applyPriceAdjustmentToItems(this.items);
                this.applyPriceAdjustmentToCachedVariants();
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
                    response.message.forEach(price => {
                        const rate = this.normalizeNumber(price.price_list_rate);
                        const item = this.getCatalogItem(price.item_code) || this.items.find(i => i.name === price.item_code);
                        if (item) {
                            item._explicit_standard_rate = rate;
                            item.has_explicit_price_list_rate = 1;
                        }
                    });
                }
            } catch (error) {
                console.error('Error loading item rates:', error);
            }

            this.applyPriceAdjustmentToItems(this.items);
            this.applyPriceAdjustmentToCachedVariants();
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
                        item_template: templateItem.name,
                        price_list: this.selectedPriceList || null

                    }
                });

                const variants = (message && message.variants) || [];
                const adjusted = this.applyPriceAdjustmentToVariants(variants);
                if (adjusted.length) {
                    this.cacheVariantsForTemplate(templateItem, adjusted);
                    this.refreshVariantDisplayRateForTemplate(templateItem);
                }
                return adjusted;
            } catch (error) {
                console.error("Error loading variants:", error);
                this.showError("Failed to load variants. Please try again.");
                const cached = this.getCachedVariantsForTemplate(templateItem);
                return cached.length ? cached : [];
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
                const isSoldOut = this.isItemSoldOut(item);
                const cardClasses = ['item-card'];
                if (isSoldOut) {
                    cardClasses.push('sold-out');
                }

                const displayRate = this.getDisplayRateForItem(item);
                const formattedPrice = formatRupiah(Number.isFinite(displayRate) ? displayRate : 0);
                html += `
                    <div class="${cardClasses.join(' ')}" data-item="${item.name}" aria-disabled="${isSoldOut ? 'true' : 'false'}">
                        <span class="sold-out-badge" aria-hidden="${isSoldOut ? 'false' : 'true'}">Sold Out</span>
                        <div class="item-image" style="background-image: url('${imageUrl}')"></div>
                        <div class="item-info">
                            <div class="item-name">${item.item_name}</div>
                            <div class="item-price">${formattedPrice}</div>
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
                    if (!item) {
                        return;
                    }
                    if (this.isItemSoldOut(item)) {
                        return;
                    }
                    this.handleItemClick(item);
                });
            });

            // Update cached stock quantities for rendered items
            itemCards.forEach(card => {
                const itemName = card.dataset.item;
                const item = this.items.find(i => i.name === itemName);
                if (item) {
                    this.updateItemStock(item.name, item.actual_qty, item.is_component_shortage);
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
                        ${item.item_options ? `<div class="cart-item-options">${this.formatItemOptions(item.item_options)}</div>` : ''}
                        ${item.notes ? `<div class="cart-item-notes">${item.notes}</div>` : ''}
                        <div class="cart-item-remove" data-index="${index}">&times;</div>
                    </div>
                `;
            });
            
            this.elements.cartItems.innerHTML = html;

            const resolveCartIndex = (node) => {
                if (!(node instanceof Element)) {
                    return -1;
                }
                const carrier = node.closest('[data-index]') || node.closest('.cart-item');
                if (!carrier) {
                    return -1;
                }
                const value = Number(carrier.getAttribute('data-index'));
                return Number.isInteger(value) ? value : -1;
            };

            // Add event listeners
            const qtyInputs = this.elements.cartItems.querySelectorAll('.cart-item-qty');

            if (!this.cartClickHandler) {
                this.cartClickHandler = event => {
                    const { target } = event;
                    if (!(target instanceof Element)) {
                        return;
                    }

                    const control = target.closest('.qty-btn, .cart-item-remove');
                    if (!control || !this.elements.cartItems.contains(control)) {
                        return;
                    }

                    const index = resolveCartIndex(control);
                    if (index < 0 || index >= this.cart.length) {
                        return;
                    }

                    const cartItem = this.cart[index];
                    if (!cartItem) {
                        return;
                    }

                    if (control.classList.contains('qty-plus')) {
                        event.preventDefault();
                        this.updateCartItemQuantity(index, cartItem.qty + 1);
                    } else if (control.classList.contains('qty-minus')) {
                        event.preventDefault();
                        this.updateCartItemQuantity(index, cartItem.qty - 1);
                    } else if (control.classList.contains('cart-item-remove')) {
                        this.removeCartItem(index);
                    }
                };
                this.elements.cartItems.addEventListener('click', this.cartClickHandler);
            }

            qtyInputs.forEach(input => {
                input.addEventListener('change', () => {
                    const index = resolveCartIndex(input);
                    if (index < 0) {
                        return;
                    }
                    this.updateCartItemQuantity(index, parseInt(input.value) || 1);
                });
            });

            this.elements.checkoutBtn.disabled = false;
            this.elements.clearBtn.disabled = false;
            if (this.allowDiscounts) {
                this.refreshDiscountUI();
            }
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
                this.elements.cartDiscount.textContent = formatRupiah(totals.discountAmount);
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
                if (value === undefined || value === null || value === '') {
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
                    let anyAvailableVariant = false;
                    let allUnavailableOrShort = true;

                    cachedVariants.forEach((variant) => {
                        const qty = parseQty(variant?.actual_qty);
                        const shortageSource = Object.prototype.hasOwnProperty.call(variant || {}, 'is_component_shortage')
                            ? variant.is_component_shortage
                            : variant?.component_shortage;
                        const variantShortage = Boolean(parseShortage(shortageSource));

                        if (!variantShortage && qty !== null && qty > 0) {
                            anyAvailableVariant = true;
                        }

                        if (!variantShortage) {
                            if (qty === null || qty > 0) {
                                allUnavailableOrShort = false;
                            }
                        }
                    });

                    if (anyAvailableVariant) {
                        return false;
                    }

                    if (allUnavailableOrShort) {
                        return true;
                    }

                    return false;
                }
            }

            const qtySource = actualQty != null ? parseQty(actualQty) : parseQty(item?.actual_qty);
            const shortageFlag = typeof isComponentShortage !== 'undefined'
                ? parseShortage(isComponentShortage)
                : parseShortage(item?.is_component_shortage);

            return Boolean(shortageFlag) || (qtySource !== null && qtySource <= 0);
        },

        updateItemStock: function(itemCode, actualQty, isComponentShortage, componentLowStock) {
            if (!itemCode) {
                return;
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
                    return undefined;
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

            const qtyValue = parseQty(actualQty);
            const shortageProvided = typeof isComponentShortage !== 'undefined';
            const shortageValue = shortageProvided ? parseShortage(isComponentShortage) : undefined;

            const itemsToRefresh = new Set();
            const registerForRefresh = (entry) => {
                if (entry) {
                    itemsToRefresh.add(entry);
                }
            };

            const item = this.items.find((i) => i.name === itemCode);
            if (item) {
                if (qtyValue !== null) {
                    item.actual_qty = qtyValue;
                }
                if (shortageProvided) {
                    item.is_component_shortage = shortageValue;
                }
                if (Array.isArray(componentLowStock)) {
                    item.component_low_stock = componentLowStock;
                }
                registerForRefresh(item);
            }

            let updatedVariant = null;
            if (this.variantPool instanceof Map) {
                this.variantPool.forEach((bucket) => {
                    if (!bucket || !(bucket instanceof Map)) {
                        return;
                    }
                    const variant = bucket.get(itemCode);
                    if (!variant) {
                        return;
                    }

                    if (qtyValue !== null) {
                        variant.actual_qty = qtyValue;
                    }
                    if (shortageProvided) {
                        variant.is_component_shortage = shortageValue;
                    }
                    if (Array.isArray(componentLowStock)) {
                        variant.component_low_stock = componentLowStock;
                    }

                    updatedVariant = variant;
                });
            }

            if (updatedVariant) {
                const templateName =
                    updatedVariant.variant_of ||
                    updatedVariant.template_item ||
                    updatedVariant.template_item_code ||
                    null;
                if (templateName) {
                    const templateItem = this.items.find(
                        (entry) => entry.name === templateName || entry.item_code === templateName,
                    );
                    if (templateItem) {
                        this.cacheVariantsForTemplate(templateItem, [updatedVariant]);
                        registerForRefresh(templateItem);
                    }
                }
            }

            const catalog = this.elements.catalogGrid;
            if (!catalog || !itemsToRefresh.size) {
                return;
            }

            const applySoldOutState = (itemEntry) => {
                if (!itemEntry || !itemEntry.name) {
                    return;
                }
                const soldOut = this.isItemSoldOut(itemEntry);
                const cards = catalog.querySelectorAll('.item-card');
                for (const card of cards) {
                    if (card.dataset.item === itemEntry.name) {
                        card.classList.toggle('sold-out', soldOut);
                        card.setAttribute('aria-disabled', soldOut ? 'true' : 'false');
                        const badge = card.querySelector('.sold-out-badge');
                        if (badge) {
                            badge.setAttribute('aria-hidden', soldOut ? 'false' : 'true');
                        }
                        break;
                    }
                }
            };

            itemsToRefresh.forEach(applySoldOutState);
        },

        refreshStockLevels: async function() {
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.variants.get_items_with_stock',
                    args: {
                        warehouse: POS_PROFILE_DATA.warehouse,
                        limit: 500,
                        pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null,
                        price_list: this.selectedPriceList || null,
                        base_price_list: this.basePriceList || null
                    }
                });
                if (response.message) {
                    response.message.forEach(updated => {
                        this.updateItemStock(updated.name, updated.actual_qty, updated.is_component_shortage);
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
                // Open detail modal for options
                this.openItemDetailModal(item);
            }
        },
        
        openVariantPicker: async function(item) {
            this.selectedTemplateItem = item;
            this.selectedVariant = null;
            this.pendingNotes = '';

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
            if (this.elements.itemNotes) {
                this.elements.itemNotes.value = '';
            }
            this.pendingNotes = '';
        },
        
        addSelectedVariantToCart: async function() {
            if (!this.selectedVariant) return;

            const selectedVariant = this.selectedVariant;
            const notes = this.elements.itemNotes ? this.elements.itemNotes.value : '';

            let optionsPayload = null;
            let loadError = false;
            try {
                const response = await frappe.call({
                    method: 'imogi_pos.api.items.get_item_options',
                    args: { item: selectedVariant.name }
                });
                optionsPayload = (response && response.message) || {};
            } catch (error) {
                loadError = true;
                console.error('Error preloading item options:', error);
            }

            if (loadError) {
                this.closeVariantModal();
                this.openItemDetailModal(selectedVariant, notes);
                return;
            }

            const requiresOptions = this.itemRequiresAdditionalOptions(optionsPayload);
            this.closeVariantModal();

            if (!requiresOptions) {
                this.addItemToCart(selectedVariant, {}, notes);
                return;
            }

            this.openItemDetailModal(selectedVariant, notes, optionsPayload);
        },

        itemRequiresAdditionalOptions: function(optionsPayload) {
            if (!optionsPayload || typeof optionsPayload !== 'object') return false;

            const resolveArray = (primary, fallback) => {
                if (Array.isArray(primary)) return primary;
                if (Array.isArray(fallback)) return fallback;
                return [];
            };

            const groups = [
                resolveArray(optionsPayload.variants, optionsPayload.variant),
                resolveArray(optionsPayload.sizes, optionsPayload.size),
                resolveArray(optionsPayload.spices, optionsPayload.spice),
                resolveArray(optionsPayload.toppings, optionsPayload.topping),
            ];

            return groups.some(group => Array.isArray(group) && group.length > 0);
        },

        openItemDetailModal: async function(item, notes = '', preloadedOptions = null) {
            this.selectedOptionItem = item;
            this.pendingNotes = notes || '';
            if (this.elements.itemDetailNotes) {
                this.elements.itemDetailNotes.value = this.pendingNotes;
            }

            const imageUrl = item.photo || item.image || '/assets/erpnext/images/default-product-image.png';
            this.elements.itemDetailImage.style.backgroundImage = `url('${imageUrl}')`;
            this.elements.itemDetailModal.querySelector('.modal-title').textContent = item.item_name;

            // Clear and hide options section while loading
            this.elements.itemOptions.innerHTML = '';
            this.elements.itemOptions.classList.add('hidden');

            // Show modal
            this.elements.itemDetailModal.style.display = 'flex';

            if (preloadedOptions) {
                this.hideLoading();
                this.renderItemDetailOptions(preloadedOptions);
                return;
            }

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
            if (this.elements.itemDetailNotes) {
                this.elements.itemDetailNotes.value = '';
            }
            this.pendingNotes = '';
        },

        renderItemDetailOptions: function(options) {
          const container = this.elements.itemOptions;
        
          // Terima dua bentuk kunci: sizes/spices/toppings ATAU size/spice/topping
          const variants = Array.isArray(options.variants)
            ? options.variants
            : Array.isArray(options.variant)
              ? options.variant
              : [];
          const sizes    = options.sizes    || options.size    || [];
          const spices   = options.spices   || options.spice   || [];
          const toppings = options.toppings || options.topping || [];
        
          let html = '';
        
          // Helper untuk ambil nama/price/default lintas-bentuk
          const getName    = opt => opt.name || opt.label || opt.value || '';
          const getPrice   = opt => Number(opt.price || 0);
          const isDefault  = opt => !!(opt.default || opt.is_default);
        
          if (variants.length) {
            html += `<div class="option-block" data-group="variant" data-required="1">
              <div class="option-title">Variant</div>
              <div class="option-group">`;
            variants.forEach((opt) => {
              const name = getName(opt);
              const value = opt.value || name;
              const price = getPrice(opt);
              const checked = isDefault(opt) ? 'checked' : '';
              const priceText = price ? ` (+${CURRENCY_SYMBOL} ${formatNumber(price)})` : '';
              html += `<label><input type="radio" name="variant-option" value="${value}" data-label="${name}" data-price="${price}" ${checked}> ${name}${priceText}</label>`;
            });
            html += `</div></div>`;
          }

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

          const variantGroup = container.querySelector('[data-group="variant"]');
          if (variantGroup) {
            const input = variantGroup.querySelector('input[name="variant-option"]:checked');
            if (!input) { this.showError('Please select variant'); return; }
            const name = input.dataset.label || input.value;
            const price = Number(input.dataset.price || 0);
            selectedOptions.variant = { name, value: input.value, price };
            extra += price;
          }

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
          const notesField = this.elements.itemDetailNotes;
          const notesValue = notesField ? notesField.value : this.pendingNotes;
          const finalNotes = notesValue || '';
          this.pendingNotes = finalNotes;
          this.addItemToCart(this.selectedOptionItem, selectedOptions, finalNotes);
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
            if (options.variant) {
                const variantName = typeof options.variant === 'object'
                    ? (options.variant.name || options.variant.label || options.variant.value)
                    : options.variant;
                if (variantName) {
                    parts.push(`Variant: ${variantName}`);
                }
            }
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
                this.customerInfo = {
                    name: '',
                    gender: '',
                    phone: '',
                    age: '',
                };
                this.needsCustomerInfo = true;
                this.resetCustomerForm();
            }
        },

        showCustomerInfoError: function(message) {
            const el = this.elements.customerError;
            if (el) {
                el.textContent = message || '';
                el.classList.remove('hidden');
            } else if (message) {
                frappe.msgprint({
                    title: __('Validation'),
                    message,
                    indicator: 'orange'
                });
            }
        },

        clearCustomerInfoError: function() {
            const el = this.elements.customerError;
            if (el) {
                el.textContent = '';
                el.classList.add('hidden');
            }
        },

        populateCustomerForm: function() {
            const info = this.customerInfo || {};
            if (this.elements.customerNameInput) {
                this.elements.customerNameInput.value = info.name || '';
            }
            if (this.elements.customerGenderSelect) {
                this.elements.customerGenderSelect.value = info.gender || '';
            }
            if (this.elements.customerPhoneInput) {
                this.elements.customerPhoneInput.value = info.phone || '';
            }
            if (this.elements.customerAgeInput) {
                const ageValue = Object.prototype.hasOwnProperty.call(info || {}, 'age')
                    ? info.age
                    : '';
                const normalized = ageValue === 0
                    ? '0'
                    : ageValue !== undefined && ageValue !== null && ageValue !== ''
                        ? String(ageValue)
                        : '';
                this.elements.customerAgeInput.value = normalized;
            }
        },

        resetCustomerForm: function() {
            if (this.elements.customerForm) {
                this.elements.customerForm.reset();
            }
            if (this.elements.customerNameInput) {
                this.elements.customerNameInput.value = '';
            }
            if (this.elements.customerPhoneInput) {
                this.elements.customerPhoneInput.value = '';
            }
            if (this.elements.customerAgeInput) {
                this.elements.customerAgeInput.value = '';
            }
            if (this.elements.customerGenderSelect) {
                this.elements.customerGenderSelect.value = '';
            }
            this.clearCustomerInfoError();
        },

        openCustomerModal: function() {
            this.populateCustomerForm();
            this.clearCustomerInfoError();
            if (this.elements.customerModal) {
                this.elements.customerModal.style.display = 'flex';
            }
            requestAnimationFrame(() => {
                this.elements.customerNameInput?.focus();
            });
        },

        closeCustomerModal: function() {
            this.clearCustomerInfoError();
            if (this.elements.customerModal) {
                this.elements.customerModal.style.display = 'none';
            }
        },

        submitCustomerInfo: function() {
            const name = (this.elements.customerNameInput?.value || '').trim();
            const gender = this.elements.customerGenderSelect?.value || '';
            const phone = (this.elements.customerPhoneInput?.value || '').trim();
            const ageRaw = this.elements.customerAgeInput?.value || '';
            const age = ageRaw !== '' ? Number(ageRaw) : '';

            this.clearCustomerInfoError();

            if (!name) {
                this.showCustomerInfoError(__('Please enter the customer name or continue without filling the form.'));
                this.elements.customerNameInput?.focus();
                return;
            }

            if (age !== '' && (Number.isNaN(age) || age < 0)) {
                this.showCustomerInfoError(__('Please enter a valid age or leave it blank.'));
                this.elements.customerAgeInput?.focus();
                return;
            }

            this.customerInfo = {
                name,
                gender,
                phone,
                age: age === '' || Number.isNaN(age) ? '' : age,
            };
            this.needsCustomerInfo = false;
            this.closeCustomerModal();
            this.openPaymentModal();
        },

        skipCustomerInfo: function() {
            this.customerInfo = {
                name: '',
                gender: '',
                phone: '',
                age: '',
            };
            this.needsCustomerInfo = false;
            this.resetCustomerForm();
            this.closeCustomerModal();
            this.openPaymentModal();
        },

        handleCheckout: async function() {
            if (!this.cart.length) return;


            // Ensure table number is set for dine-in orders
            if (!(await this.ensureTableNumber())) {
                return;

            }

            if (this.needsCustomerInfo) {
                this.openCustomerModal();
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
                const totals = this.calculateTotals();
                const orderArgs = {
                    order_type: 'Kiosk',
                    service_type: this.orderType,
                    branch: CURRENT_BRANCH,
                    pos_profile: POS_PROFILE.name,
                    customer: 'Walk-in Customer',
                    items: this.cart,
                    selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
                    discount_amount: totals.discountAmount,
                    discount_percent: totals.discountPercent,
                    promo_code: totals.promoCode
                };
                if (this.tableNumber) {
                    orderArgs.table = this.tableNumber;
                }
                const collectedInfo = collectCustomerInfo();
                this.customerInfo = collectedInfo || this.customerInfo;
                const infoPayload = this.customerInfo;
                if (infoPayload) {
                    orderArgs.customer_info = { ...infoPayload };
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
                const invoiceArgs = {
                    pos_order: this.posOrder,
                    pos_profile: POS_PROFILE.name,
                    mode_of_payment: 'Online',
                    amount: totals.total,
                    discount_amount: totals.discountAmount,
                    discount_percent: totals.discountPercent,
                    promo_code: totals.promoCode
                };
                if (this.tableNumber) {
                    invoiceArgs.table = this.tableNumber;
                }
                if (infoPayload) {
                    invoiceArgs.customer_info = { ...infoPayload };
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
                    const totals = this.calculateTotals();
                    const orderArgs = {
                        order_type: 'Kiosk',
                        service_type: this.orderType,
                        branch: CURRENT_BRANCH,
                        pos_profile: POS_PROFILE.name,
                        customer: 'Walk-in Customer',
                        items: this.cart,
                        selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
                        discount_amount: totals.discountAmount,
                        discount_percent: totals.discountPercent,
                        promo_code: totals.promoCode
                    };
                    if (this.tableNumber) {
                        orderArgs.table = this.tableNumber;
                    }
                    const collectedInfo = collectCustomerInfo();
                    this.customerInfo = collectedInfo || this.customerInfo;
                    const infoPayload = this.customerInfo;
                    if (infoPayload) {
                        orderArgs.customer_info = { ...infoPayload };
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

                    const invoiceArgs = {
                        pos_order: this.posOrder,
                        pos_profile: POS_PROFILE.name,
                        mode_of_payment: this.paymentMethod === 'cash' ? 'Cash' : 'Online',
                        amount: totals.total,
                        discount_amount: totals.discountAmount,
                        discount_percent: totals.discountPercent,
                        promo_code: totals.promoCode
                    };
                    if (this.tableNumber) {
                        invoiceArgs.table = this.tableNumber;
                    }
                    if (infoPayload) {
                        invoiceArgs.customer_info = { ...infoPayload };
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

            this.customerInfo = {
                name: '',
                gender: '',
                phone: '',
                age: '',
            };
            this.needsCustomerInfo = true;
            this.resetCustomerForm();

            // Clear stored service type and redirect to selection page
            localStorage.removeItem('imogi_service_type');
            window.location.href = '/service-select';
        },

        // Utils
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
                this.updateItemStock(data.item_code, data.actual_qty, data.is_component_shortage);
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
