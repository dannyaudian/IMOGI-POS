/* global frappe, __, POS_PROFILE, CURRENT_BRANCH, CURRENCY_SYMBOL, PAYMENT_SETTINGS, PRINT_SETTINGS, DOMAIN */

(function() {
  const init = async function () {
    "use strict";

    const POS_PROFILE_DATA = {};

  function determineMenuChannel(options = {}) {
    const { fallback = "POS", allowDomainInference = true } = options;

    const normalise = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const lowered = trimmed.toLowerCase();
      if (["restaurant", "resto"].includes(lowered)) return "Restaurant";
      if (["pos", "point-of-sale", "point_of_sale"].includes(lowered)) return "POS";
      if (["universal", "any", "all", "both"].includes(lowered)) return "Universal";
      return null;
    };

    const collectCandidate = (value, bucket) => {
      if (value === undefined || value === null) return;
      bucket.push(value);
    };

    const resolveFrom = (candidates) => {
      for (const candidate of candidates) {
        const channel = normalise(candidate);
        if (channel) return channel;
      }
      return null;
    };

    const explicitCandidates = [];

    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location?.search || "");
        collectCandidate(params.get("menu_channel"), explicitCandidates);
        collectCandidate(params.get("channel"), explicitCandidates);
      } catch (error) {
        console.warn("Failed to inspect URL parameters for menu channel", error);
      }

      collectCandidate(window.IMOGI_MENU_CHANNEL, explicitCandidates);
      collectCandidate(window.imogiMenuChannel, explicitCandidates);
      collectCandidate(window.menu_channel, explicitCandidates);
    }

    if (typeof document !== "undefined") {
      const { body } = document;
      if (body && body.dataset) {
        collectCandidate(body.dataset.menuChannel, explicitCandidates);
        collectCandidate(body.dataset.imogiMenuChannel, explicitCandidates);
      }

      const datasetElement = document.querySelector("[data-menu-channel]");
      if (datasetElement) {
        collectCandidate(datasetElement.getAttribute("data-menu-channel"), explicitCandidates);
        if (datasetElement.dataset) {
          collectCandidate(datasetElement.dataset.menuChannel, explicitCandidates);
        }
      }

      const meta = document.querySelector(
        'meta[name="menu-channel"], meta[name="imogi-menu-channel"]',
      );
      if (meta) {
        collectCandidate(meta.getAttribute("content"), explicitCandidates);
      }
    }

    const explicit = resolveFrom(explicitCandidates);
    if (explicit) {
      return explicit;
    }

    if (allowDomainInference) {
      const inferredCandidates = [];

      if (typeof DOMAIN === "string") {
        inferredCandidates.push(DOMAIN);
      }

      if (POS_PROFILE_DATA && typeof POS_PROFILE_DATA === "object") {
        inferredCandidates.push(POS_PROFILE_DATA.imogi_pos_domain);
      }

      if (typeof POS_PROFILE === "object" && POS_PROFILE !== null) {
        inferredCandidates.push(POS_PROFILE.imogi_pos_domain);
      }

      const inferred = resolveFrom(inferredCandidates);
      if (inferred) {
        return inferred;
      }
    }

    return normalise(fallback) || "POS";
  }

  const ACTIVE_MENU_CHANNEL = determineMenuChannel({
    fallback: "POS",
    allowDomainInference: false,
  });

  function normaliseCustomerInfo(source) {
    if (!source || typeof source !== "object") return null;

    const payload = {};
    const toText = (value) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text.length ? text : null;
    };

    const maybeAssign = (field, value) => {
      const cleaned = toText(value);
      if (cleaned) payload[field] = cleaned;
    };

    maybeAssign(
      "customer_full_name",
      source.customer_full_name || source.full_name || source.name || source.customer_name,
    );
    maybeAssign("customer_gender", source.customer_gender || source.gender);
    maybeAssign(
      "customer_phone",
      source.customer_phone || source.phone || source.mobile_no || source.mobile,
    );
    maybeAssign(
      "customer_identification",
      source.customer_identification || source.identification_status,
    );

    const ageValue =
      source.customer_age ?? source.age ?? source.age_range ?? source.ageRange;
    const ageText = toText(ageValue);
    if (ageText) {
      const numeric = Number(ageText);
      if (Number.isFinite(numeric) && ageText === String(numeric) && numeric >= 0) {
        payload.customer_age = Math.round(numeric);
      } else {
        payload.customer_age = ageText;
      }
    }

    return Object.keys(payload).length ? payload : null;
  }

  function collectCustomerInfo() {
    const aggregated = {};
    const merge = (source) => {
      const info = normaliseCustomerInfo(source);
      if (info) Object.assign(aggregated, info);
    };

    if (typeof window !== "undefined") {
      if (window.CUSTOMER_INFO && typeof window.CUSTOMER_INFO === "object") {
        merge(window.CUSTOMER_INFO);
      }
      if (window.customerInfo && typeof window.customerInfo === "object") {
        merge(window.customerInfo);
      }
    }

    const infoElement = document.querySelector("[data-customer-info]");
    if (infoElement) {
      merge({
        customer_full_name:
          infoElement.getAttribute("data-customer-full-name") ||
          infoElement.dataset.customerFullName ||
          infoElement.dataset.fullName ||
          infoElement.dataset.name,
        customer_gender:
          infoElement.getAttribute("data-customer-gender") ||
          infoElement.dataset.customerGender ||
          infoElement.dataset.gender,
        customer_phone:
          infoElement.getAttribute("data-customer-phone") ||
          infoElement.dataset.customerPhone ||
          infoElement.dataset.phone,
        customer_age:
          infoElement.getAttribute("data-customer-age") ||
          infoElement.dataset.customerAge ||
          infoElement.dataset.age,
      });
    }

    const fields = [
      "customer_full_name",
      "customer_gender",
      "customer_phone",
      "customer_age",
      "customer_identification",
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

  // ---- Helper: normalisasi order type dari string bebas ----
  function normalizeOrderType(value) {
    if (typeof value !== "string") return null;
    const v = value.toLowerCase();
    if (v.includes("dine")) return "Dine-in";
    if (v.includes("take")) return "Takeaway";
    if (v.includes("kiosk")) return "Kiosk";
    return null;
  }

  function getDefaultOrderType() {
    const candidates = [
      POS_PROFILE_DATA.default_service_type,
      POS_PROFILE_DATA.default_order_type,
      POS_PROFILE_DATA.service_type,
      POS_PROFILE_DATA.order_type,
    ];
    for (const c of candidates) {
      const t = normalizeOrderType(c);
      if (t) return t;
    }
    return "Takeaway";
  }

  // ---- Load POS Profile (aman untuk string/object) ----
  try {
    if (typeof POS_PROFILE === "string") {
      const { message } = await frappe.call({
        method: "imogi_pos.api.public.get_pos_profile_details",
        args: { profile: POS_PROFILE },
      });
      if (!message) throw new Error("POS profile not found");
      Object.assign(POS_PROFILE_DATA, message);
    } else if (typeof POS_PROFILE === "object" && POS_PROFILE !== null) {
      Object.assign(POS_PROFILE_DATA, POS_PROFILE);
    } else {
      throw new Error("Invalid POS profile");
    }
  } catch (error) {
    console.error("Failed to load POS profile:", error);
    frappe.msgprint({
      title: __("Error"),
      message: __(
        "Failed to load POS profile. Please refresh or contact the administrator."
      ),
      indicator: "red",
    });
    return;
  }

  // ===== Formatters (hindari simbol dobel) =====
  function formatRupiah(n) {
    const v = Number(n || 0);
    const s = Math.floor(v).toString();
    const r = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const sym = typeof CURRENCY_SYMBOL === "string" && CURRENCY_SYMBOL.trim()
      ? CURRENCY_SYMBOL.trim()
      : "Rp";
    return `${sym} ${r}`;
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function hasValidMenuCategory(value) {
    if (typeof value !== "string") return false;
    return value.trim().length > 0;
  }

  const RECEIPT_DATETIME_FORMATTER =
    typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function"
      ? new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;

  function normaliseReceiptDateTime(dateValue, timeValue) {
    if (dateValue && timeValue) {
      const datePart = String(dateValue).trim();
      const timePart = String(timeValue).trim();
      if (!datePart) return null;
      const sanitizedDate = datePart.split(" ")[0].split("T")[0];
      const sanitizedTime = (timePart || "00:00:00").split(" ")[0];
      const isoCandidate = `${sanitizedDate}T${sanitizedTime || "00:00:00"}`;
      return isoCandidate.replace(/\s+/g, "T");
    }

    if (dateValue) {
      const raw = String(dateValue).trim();
      if (!raw) return null;
      if (/^\d{2}:\d{2}/.test(raw)) return null;
      const replaced = raw.includes("T") ? raw : raw.replace(" ", "T");
      if (!replaced.includes("T")) return `${replaced}T00:00:00`;
      return replaced;
    }

    return null;
  }

  function deriveReceiptDateTime(orderDetails, invoiceDetails) {
    const candidates = [];

    if (invoiceDetails && typeof invoiceDetails === "object") {
      candidates.push(normaliseReceiptDateTime(invoiceDetails.posting_datetime));
      candidates.push(
        normaliseReceiptDateTime(
          invoiceDetails.posting_date,
          invoiceDetails.posting_time
        )
      );
      candidates.push(
        normaliseReceiptDateTime(
          invoiceDetails.transaction_date,
          invoiceDetails.transaction_time
        )
      );
      candidates.push(normaliseReceiptDateTime(invoiceDetails.creation));
      candidates.push(normaliseReceiptDateTime(invoiceDetails.modified));
    }

    if (orderDetails && typeof orderDetails === "object") {
      candidates.push(
        normaliseReceiptDateTime(orderDetails.posting_date, orderDetails.posting_time)
      );
      candidates.push(
        normaliseReceiptDateTime(
          orderDetails.transaction_date,
          orderDetails.transaction_time
        )
      );
      candidates.push(
        normaliseReceiptDateTime(orderDetails.order_date, orderDetails.order_time)
      );
      candidates.push(normaliseReceiptDateTime(orderDetails.creation));
      candidates.push(normaliseReceiptDateTime(orderDetails.modified));
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  }

  function formatReceiptDateTime(orderDetails, invoiceDetails) {
    const dateObj = deriveReceiptDateTime(orderDetails, invoiceDetails);
    if (!dateObj) return "";
    if (RECEIPT_DATETIME_FORMATTER) {
      return RECEIPT_DATETIME_FORMATTER.format(dateObj);
    }
    return dateObj.toLocaleString("id-ID");
  }

  function getActiveCashierName() {
    const candidates = [
      frappe?.session?.user_fullname,
      frappe?.session?.user,
      frappe?.boot?.user?.full_name,
      frappe?.boot?.user?.name,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }

    return "";
  }

  // ====== STATE ======
  const KioskApp = {
    items: [],
    filteredItems: [],
    cart: [],
    categories: [],
    selectedCategory: "all",
    searchQuery: "",
    selectedTemplateItem: null,
    selectedVariant: null,
    selectedOptionItem: null,
    pendingNotes: "",
    taxRate: 0,
    priceLists: [],
    selectedPriceList: POS_PROFILE_DATA.selling_price_list || null,
    basePriceList: POS_PROFILE_DATA.selling_price_list || null,
    promoCodes: [],
    itemIndex: new Map(),
    variantPool: new Map(),
    priceRefreshTimer: null,
    priceRefreshInFlight: false,
    priceRefreshQueued: false,
    selectionMemory: new Map(),

    discountState: {
      cartQuantity: 0,
      autoPercent: 0,
      promo: null,
      applied: null,
      error: null,
      isApplying: false,
    },

    allowDiscounts:
      typeof ALLOW_DISCOUNTS !== "undefined" && Boolean(ALLOW_DISCOUNTS),

    orderType: getDefaultOrderType(),
    tableNumber: null,

    posOrder: null,
    queueNumber: null,
    invoiceName: null,
    itemRows: [],
    latestOrderDetails: null,
    latestInvoiceDetails: null,
    customerInfo: collectCustomerInfo(),

    paymentRequest: null,
    paymentMethod: "cash",
    cashAmount: 0,
    paymentTimer: null,
    paymentCountdown: 300,

    customerInfo: {
      name: "",
      gender: "",
      phone: "",
      age: "",
      customerId: null,
    },
    customerSearchResults: [],
    customerSearchLoading: false,
    needsCustomerInfo: true,

    elements: {
      catalogGrid: document.getElementById("catalog-grid"),
      cartItems: document.getElementById("cart-items"),
      cartSubtotal: document.getElementById("cart-subtotal"),
      cartTax: document.getElementById("cart-tax"),
      cartDiscount: document.getElementById("cart-discount"),
      cartDiscountLabel: document.getElementById("cart-discount-label"),
      cartTotal: document.getElementById("cart-total"),
      checkoutBtn: document.getElementById("btn-checkout"),
      clearBtn: document.getElementById("btn-clear"),
      searchInput: document.getElementById("search-input"),
      categoriesContainer: document.getElementById("categories-container"),
      priceListSelect: document.getElementById("price-list-select"),
      promoSection: document.getElementById("promo-section"),
      promoButton: document.getElementById("btn-promo"),
      promoInputContainer: document.getElementById("promo-input-container"),
      promoSelect: document.getElementById("promo-code-select"),
      promoApplyBtn: document.getElementById("promo-apply-btn"),
      promoCancelBtn: document.getElementById("promo-cancel-btn"),
      promoStatus: document.getElementById("promo-status"),

      // Variant modal
      variantModal: document.getElementById("variant-modal"),
      variantGrid: document.getElementById("variant-grid"),
      itemNotes: document.getElementById("item-notes"),
      variantAddBtn: document.getElementById("btn-variant-add"),
      variantCancelBtn: document.getElementById("btn-variant-cancel"),

      // Item detail modal
      itemDetailModal: document.getElementById("item-detail-modal"),
      itemDetailImage: document.getElementById("item-detail-image"),
      itemOptions: document.getElementById("item-options"),
      itemDetailNotes: document.getElementById("item-detail-notes"),
      itemAddBtn: document.getElementById("btn-item-add"),
      itemCancelBtn: document.getElementById("btn-item-cancel"),

      // Payment modal
      paymentModal: document.getElementById("payment-modal"),
      paymentAmount: document.getElementById("payment-amount"),
      paymentQrSection: document.getElementById("payment-qr-section"),
      paymentCashSection: document.getElementById("payment-cash-section"),
      paymentQr: document.getElementById("payment-qr"),
      paymentTimer: document.getElementById("payment-timer"),
      paymentCountdown: document.getElementById("payment-countdown"),
      paymentStatus: document.getElementById("payment-status"),
      cashAmount: document.getElementById("cash-amount"),
      changeAmount: document.getElementById("change-amount"),
      paymentConfirmBtn: document.getElementById("btn-payment-confirm"),
      paymentCancelBtn: document.getElementById("btn-payment-cancel"),

      // Customer info modal
      customerModal: document.getElementById("customer-info-modal"),
      customerForm: document.getElementById("customer-info-form"),
      customerNameInput: document.getElementById("customer-name"),
      customerGenderSelect: document.getElementById("customer-gender"),
      customerIdentificationSelect: document.getElementById(
        "customer-identification",
      ),
      customerPhoneInput: document.getElementById("customer-phone"),
      customerAgeInput: document.getElementById("customer-age"),
      customerSaveBtn: document.getElementById("btn-customer-save"),
      customerSkipBtn: document.getElementById("btn-customer-skip"),
      customerError: document.getElementById("customer-info-error"),
      customerSearchBtn: document.getElementById("btn-customer-search"),
      customerSearchStatus: document.getElementById("customer-search-status"),
      customerSearchResults: document.getElementById("customer-search-results"),

      // Success modal
      successModal: document.getElementById("success-modal"),
      successBranding: document.getElementById("success-branding"),
      successQueueNumber: document.getElementById("success-queue-number"),
      successReceipt: document.getElementById("success-receipt"),
      successDoneBtn: document.getElementById("btn-success-done"),

      // Loading overlay
      loadingOverlay: document.getElementById("loading-overlay"),
      loadingText: document.getElementById("loading-text"),
    },

    lowStockComponentState: new Map(),

    // ====== PRICING HELPERS ======
    normalizeNumber: function (value) {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    },

    getPriceListByName: function (name) {
      if (!name) return null;
      return this.priceLists.find((pl) => pl.name === name) || null;
    },

    getSelectedPriceListMeta: function () {
      return this.getPriceListByName(this.selectedPriceList);
    },

    getSelectedPriceListAdjustment: function () {
      const meta = this.getSelectedPriceListMeta();
      if (!meta) return 0;
      return this.normalizeNumber(meta.adjustment);
    },

    registerCatalogItem: function (item) {
      if (!item || !item.name) return;
      if (!this.itemIndex || typeof this.itemIndex.set !== "function") {
        this.itemIndex = new Map();
      }
      this.itemIndex.set(item.name, item);
    },

    getCatalogItem: function (itemCode) {
      if (!itemCode) return null;
      if (!this.itemIndex || typeof this.itemIndex.get !== "function") {
        return null;
      }
      return this.itemIndex.get(itemCode) || null;
    },

    ensureVariantPool: function () {
      if (!(this.variantPool instanceof Map)) {
        this.variantPool = new Map();
      }
      return this.variantPool;
    },

    resetVariantPool: function () {
      this.variantPool = new Map();
    },

    collectTemplateLookupKeys: function (source) {
      if (!source || typeof source !== "object") return [];

      const keys = [];
      const maybeAdd = (value) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (trimmed) keys.push(trimmed);
      };

      maybeAdd(source.name);
      maybeAdd(source.item_code);
      maybeAdd(source.item_name);
      maybeAdd(source.template_item);
      maybeAdd(source.template_item_code);

      return Array.from(new Set(keys));
    },

    collectVariantTemplateKeys: function (variant) {
      if (!variant || typeof variant !== "object") return [];

      const keys = [];
      const maybeAdd = (value) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (trimmed) keys.push(trimmed);
      };

      maybeAdd(variant.variant_of);
      maybeAdd(variant.template_item);
      maybeAdd(variant.template_item_code);

      return Array.from(new Set(keys));
    },

    cacheVariantsForTemplate: function (templateItem, variants) {
      if (!Array.isArray(variants) || variants.length === 0) return;

      const pool = this.ensureVariantPool();
      const templateKeys = this.collectTemplateLookupKeys(templateItem);

      const allKeys = new Set(templateKeys);
      variants.forEach((variant) => {
        this.collectVariantTemplateKeys(variant).forEach((key) => allKeys.add(key));
      });

      if (!allKeys.size) return;

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

    getCachedVariantsForTemplate: function (templateItem) {
      if (!(this.variantPool instanceof Map)) return [];

      const keys = this.collectTemplateLookupKeys(templateItem);
      if (!keys.length) return [];

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

    getAllCachedVariants: function () {
      if (!(this.variantPool instanceof Map)) return [];

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

    computeVariantDisplayRate: function (variants) {
      if (!Array.isArray(variants) || !variants.length) return null;

      const numericRates = variants
        .map((variant) => Number(variant?.standard_rate))
        .filter((rate) => Number.isFinite(rate));

      if (!numericRates.length) return null;

      const positiveRates = numericRates.filter((rate) => rate > 0);
      if (positiveRates.length) {
        return Math.min(...positiveRates);
      }

      return Math.min(...numericRates);
    },

    refreshVariantDisplayRateForTemplate: function (templateItem) {
      if (!templateItem) return null;

      if (!templateItem.has_variants) {
        templateItem._variant_display_rate = null;
        return null;
      }

      const variants = this.getCachedVariantsForTemplate(templateItem);
      const displayRate = this.computeVariantDisplayRate(variants);
      templateItem._variant_display_rate = displayRate;

      return displayRate;
    },

    refreshAllVariantDisplayRates: function () {
      if (!Array.isArray(this.items)) return;

      this.items
        .filter((item) => item && item.has_variants)
        .forEach((templateItem) => this.refreshVariantDisplayRateForTemplate(templateItem));
    },

    getTemplateVariantDisplayRate: function (templateItem) {
      if (!templateItem || !templateItem.has_variants) return null;

      const stored = Number(templateItem._variant_display_rate);
      if (Number.isFinite(stored) && stored >= 0) {
        return stored;
      }

      return this.refreshVariantDisplayRateForTemplate(templateItem);
    },

    getDisplayRateForItem: function (item) {
      if (!item) return 0;

      const standardRate = Number(item.standard_rate);
      if (item.has_variants) {
        const templateRate = this.getTemplateVariantDisplayRate(item);
        if ((!Number.isFinite(standardRate) || standardRate <= 0) && Number.isFinite(templateRate)) {
          return templateRate;
        }
      }

      return Number.isFinite(standardRate) ? standardRate : 0;
    },

    applyPriceAdjustmentToCachedVariants: function () {
      const variants = this.getAllCachedVariants();
      if (variants.length) {
        this.applyPriceAdjustmentToItems(variants);
      }
      this.refreshAllVariantDisplayRates();
    },

    applyPriceAdjustmentToItem: function (item) {
      if (!item) return 0;

      if (
        !Object.prototype.hasOwnProperty.call(item, "_default_standard_rate") ||
        !Number.isFinite(item._default_standard_rate)
      ) {
        const baseSource = Object.prototype.hasOwnProperty.call(
          item,
          "imogi_base_standard_rate"
        )
          ? item.imogi_base_standard_rate
          : item.standard_rate;
        item._default_standard_rate = this.normalizeNumber(baseSource);
      }

      if (
        item.has_explicit_price_list_rate &&
        !Number.isFinite(item._explicit_standard_rate)
      ) {
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

    applyPriceAdjustmentToItems: function (items) {
      if (!Array.isArray(items)) return;
      items.forEach((item) => this.applyPriceAdjustmentToItem(item));
    },

    applyPriceAdjustmentToVariants: function (variants) {
      if (!Array.isArray(variants)) return [];
      return variants.map((variant) => {
        if (!variant) return variant;
        variant.has_explicit_price_list_rate = Number(
          variant.has_explicit_price_list_rate
        )
          ? 1
          : 0;
        if (variant.has_explicit_price_list_rate) {
          variant._explicit_standard_rate = this.normalizeNumber(
            variant.standard_rate
          );
        } else if (!Object.prototype.hasOwnProperty.call(variant, "_explicit_standard_rate")) {
          variant._explicit_standard_rate = null;
        }

        if (
          !Object.prototype.hasOwnProperty.call(variant, "_default_standard_rate") ||
          !Number.isFinite(variant._default_standard_rate)
        ) {
          const baseSource = Object.prototype.hasOwnProperty.call(
            variant,
            "imogi_base_standard_rate"
          )
            ? variant.imogi_base_standard_rate
            : variant.standard_rate;
          variant._default_standard_rate = this.normalizeNumber(baseSource);
        }

        this.applyPriceAdjustmentToItem(variant);
        return variant;
      });
    },

    getAdjustedRateForItemCode: function (itemCode) {
      const item = this.getCatalogItem(itemCode);
      if (!item) return null;
      if (Number.isFinite(item._explicit_standard_rate)) {
        return this.normalizeNumber(item._explicit_standard_rate);
      }
      const baseRate = this.normalizeNumber(item._default_standard_rate);
      return baseRate + this.getSelectedPriceListAdjustment();
    },

    // ====== INIT ======
    init: async function () {
      this.setupEventListeners();
      this.initDiscountControls();

      const promoPromise = this.loadPromoCodes();

      await this.loadPriceLists();
      await this.loadItems();
      this.renderCategories();
      await this.loadTaxTemplate();
      await promoPromise;
      this.renderItems();
      this.updateCartTotals();
      this.setupPrintService();

      if (frappe.realtime) this.setupRealtimeUpdates();
    },

    // ====== EVENTS ======
    setupEventListeners: function () {
      if (this.elements.priceListSelect) {
        this.elements.priceListSelect.addEventListener("change", (event) => {
          const value = event.target.value;
          this.handlePriceListChange(value);
        });
      }

      // Search
      if (this.elements.searchInput) {
        this.elements.searchInput.addEventListener(
          "input",
          this.handleSearch.bind(this)
        );
      }

      // Category filters
      if (this.elements.categoriesContainer) {
        this.elements.categoriesContainer.addEventListener("click", (e) => {
          const pill = e.target.closest(".category-pill");
          if (pill) this.selectCategory(pill.dataset.category);
        });
      }

      // Cart buttons
      this.elements.checkoutBtn?.addEventListener(
        "click",
        this.handleCheckout.bind(this)
      );
      this.elements.clearBtn?.addEventListener(
        "click",
        this.clearCart.bind(this)
      );

      // Variant modal
      this.elements.variantModal
        ?.querySelector(".modal-close")
        ?.addEventListener("click", () => this.closeVariantModal());
      this.elements.variantCancelBtn?.addEventListener("click", () =>
        this.closeVariantModal()
      );
      this.elements.variantAddBtn?.addEventListener("click", () =>
        this.addSelectedVariantToCart()
      );

      this.elements.itemNotes?.addEventListener("input", (event) => {
        this.pendingNotes = event.target.value || "";
      });

      this.elements.itemDetailNotes?.addEventListener("input", (event) => {
        this.pendingNotes = event.target.value || "";
      });

      // Item detail modal
      this.elements.itemDetailModal
        ?.querySelector(".modal-close")
        ?.addEventListener("click", () => this.closeItemDetailModal());
      this.elements.itemCancelBtn?.addEventListener("click", () =>
        this.closeItemDetailModal()
      );
      this.elements.itemAddBtn?.addEventListener("click", () =>
        this.confirmItemOptions()
      );

      // Customer info modal
      this.elements.customerModal
        ?.querySelector(".modal-close")
        ?.addEventListener("click", () => this.closeCustomerModal());
      this.elements.customerForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submitCustomerInfo();
      });
      this.elements.customerSaveBtn?.addEventListener("click", () =>
        this.submitCustomerInfo()
      );
      this.elements.customerSkipBtn?.addEventListener("click", () =>
        this.skipCustomerInfo()
      );
      this.elements.customerSearchBtn?.addEventListener("click", () =>
        this.searchCustomerByPhone()
      );
      const customerInputs = [
        this.elements.customerNameInput,
        this.elements.customerPhoneInput,
      ];
      customerInputs.forEach((input) =>
        input?.addEventListener("input", () => this.clearCustomerInfoError())
      );
      [
        this.elements.customerGenderSelect,
        this.elements.customerAgeInput,
        this.elements.customerIdentificationSelect,
      ].forEach((select) =>
        select?.addEventListener("change", () => this.clearCustomerInfoError())
      );

      // Payment modal
      this.elements.paymentModal
        ?.querySelector(".modal-close")
        ?.addEventListener("click", () => this.cancelPayment());
      this.elements.paymentCancelBtn?.addEventListener("click", () =>
        this.cancelPayment()
      );
      this.elements.paymentConfirmBtn?.addEventListener("click", () =>
        this.confirmPayment()
      );

      // Payment method selection
      const paymentOptions = document.querySelectorAll("button.payment-option");
      paymentOptions.forEach((option) => {
        option.addEventListener("click", () => {
          paymentOptions.forEach((o) => o.classList.remove("selected"));
          option.classList.add("selected");
          this.paymentMethod = option.dataset.method;
          this.togglePaymentMethod();
        });
      });

      // Keypad
      const keypadButtons = document.querySelectorAll(".keypad-button");
      keypadButtons.forEach((btn) =>
        btn.addEventListener("click", () =>
          this.handleKeypadInput(btn.dataset.value)
        )
      );

      // Success modal
      this.elements.successDoneBtn?.addEventListener("click", () => {
        this.closeSuccessModal();
        this.resetApp();
        window.location.reload();
      });
    },

    initDiscountControls: function () {
      if (!this.allowDiscounts) {
        if (this.elements.promoSection) {
          this.elements.promoSection.style.display = "none";
        }
        return;
      }

      this.elements.promoButton?.addEventListener("click", () => {
        if (!this.cart.length) {
          this.setPromoError(__("Add items to use a promo code."));
          return;
        }
        if (!this.promoCodes.length) {
          this.setPromoError(__("No promo codes are currently available."));
          return;
        }
        this.discountState.error = null;
        this.showPromoInput();
      });

      this.elements.promoCancelBtn?.addEventListener("click", () => {
        this.cancelPromoInput();
      });

      this.elements.promoApplyBtn?.addEventListener("click", () => {
        this.handleApplyPromo();
      });

      this.elements.promoSelect?.addEventListener("change", () => {
        this.discountState.error = null;
        this.refreshDiscountUI();
      });

      this.elements.promoStatus?.addEventListener("click", (event) => {
        const target = event.target;
        if (target && target.classList.contains("promo-remove")) {
          event.preventDefault();
          this.removePromoCode();
        }
      });

      this.refreshDiscountUI();
    },

    resetDiscountState: function () {
      this.discountState.cartQuantity = 0;
      this.discountState.autoPercent = 0;
      this.discountState.applied = null;
      this.discountState.error = null;
      this.discountState.isApplying = false;
      this.discountState.promo = null;
      if (this.elements.promoSelect) this.elements.promoSelect.value = "";
      this.hidePromoInput();
      this.refreshDiscountUI();
    },

    showPromoInput: function () {
      if (!this.allowDiscounts) return;
      const container = this.elements.promoInputContainer;
      if (!container) return;
      container.classList.remove("hidden");
      if (this.elements.promoButton) this.elements.promoButton.disabled = true;
      const select = this.elements.promoSelect;
      if (select) {
        select.disabled = false;
        const appliedCode = (this.discountState.promo?.code || "").toUpperCase();
        if (appliedCode && this.promoCodes.some((promo) => promo.code === appliedCode)) {
          select.value = appliedCode;
        } else {
          select.value = "";
        }
        requestAnimationFrame(() => {
          select.focus();
        });
      }
    },

    hidePromoInput: function () {
      const container = this.elements.promoInputContainer;
      if (container) container.classList.add("hidden");
    },

    cancelPromoInput: function () {
      if (!this.allowDiscounts) return;
      const select = this.elements.promoSelect;
      if (select) {
        const appliedCode = (this.discountState.promo?.code || "").toUpperCase();
        if (appliedCode && this.promoCodes.some((promo) => promo.code === appliedCode)) {
          select.value = appliedCode;
        } else {
          select.value = "";
        }
      }
      this.hidePromoInput();
      this.discountState.error = null;
      this.refreshDiscountUI();
    },

    handleApplyPromo: async function () {
      if (!this.allowDiscounts) return;
      if (this.discountState.isApplying) return;

      if (!this.cart.length) {
        this.setPromoError(__("Add items to use a promo code."));
        return;
      }

      const select = this.elements.promoSelect;
      const rawCode = (select?.value || "").trim();
      if (!rawCode) {
        this.setPromoError(__("Select a promo code."));
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
            POS_PROFILE_DATA?.name || (typeof POS_PROFILE === "object" ? POS_PROFILE.name : POS_PROFILE),
          branch: typeof CURRENT_BRANCH !== "undefined" ? CURRENT_BRANCH : null,
          quantity: this.discountState.cartQuantity,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.gross,
          order_type: this.orderType || null,
        };
        if (this.tableNumber) payload.table = this.tableNumber;

        const normalizeCategoryValue = (value) => {
          if (value === null || value === undefined) return null;
          const text = String(value).trim();
          return text || null;
        };

        payload.items = this.cart.map((entry) => {
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
            normalizeCategoryValue(entry.menu_category) ||
            normalizeCategoryValue(entry.category) ||
            normalizeCategoryValue(entry.item_group) ||
            null;

          if (!category && itemCode) {
            const catalog =
              this.getCatalogItem(itemCode) ||
              (entry.variant_of ? this.getCatalogItem(entry.variant_of) : null);
            if (catalog) {
              category =
                normalizeCategoryValue(catalog.menu_category) ||
                normalizeCategoryValue(catalog.item_group) ||
                null;
            }
          }

          if (category) {
            payloadItem.menu_category = category;
          }

          return payloadItem;
        });

        // Try native coupon code first (native-first approach)
        let nativeCoupon = await this.applyNativeCouponCode(rawCode);
        if (nativeCoupon) {
          this.discountState.promo = nativeCoupon;
          this.discountState.error = null;
          if (select) select.value = nativeCoupon.code;
          this.hidePromoInput();
        } else {
          // Fallback to custom promo code
          const response = await frappe.call({
            method: "imogi_pos.api.pricing.validate_promo_code",
            args: payload,
          });

          const result = response?.message ?? response;
          const normalized = this.normalizePromoResult(result, rawCode);
          if (!normalized || normalized.error) {
            const message = normalized?.error || result?.message || __("Promo code is invalid or expired.");
            this.discountState.promo = null;
            this.setPromoError(message);
          } else {
            this.discountState.promo = normalized;
            this.discountState.error = null;
            if (select) select.value = normalized.code;
            this.hidePromoInput();
          }
        }
      } catch (error) {
        console.error("Failed to validate promo code:", error);
        const message = error?.message || __("Failed to validate promo code. Please try again.");
        this.setPromoError(message);
      } finally {
        this.discountState.isApplying = false;
        this.updateCartTotals();
      }
    },

    /**
     * Check native ERPNext pricing rules for cart items
     * Native-first approach: check pricing rules automatically
     */
    checkNativePricingRules: async function() {
      if (!this.cart.length) return null;
      
      try {
        const customer = this.selectedCustomer || 'Walk-in Customer';
        const priceList = this.selectedPriceList || POS_PROFILE_DATA?.selling_price_list || 'Standard Selling';
        const posProfile = POS_PROFILE_DATA?.name || POS_PROFILE?.name || null;
        
        const response = await frappe.call({
          method: 'imogi_pos.api.native_pricing.apply_pricing_rules_to_items',
          args: {
            items: this.cart.map(item => ({
              item_code: item.item_code || item.item,
              qty: item.qty || item.quantity || 1,
              rate: item.rate || item.price || 0
            })),
            customer: customer,
            price_list: priceList,
            pos_profile: posProfile
          }
        });
        
        const result = response?.message || response;
        if (result && result.has_pricing_rules) {
          this.showPricingRuleIndicator(result);
          return result;
        }
        return null;
      } catch (error) {
        console.warn('Native pricing rules check failed:', error);
        return null;
      }
    },
    
    /**
     * Validate native ERPNext coupon code
     */
    applyNativeCouponCode: async function(couponCode) {
      if (!couponCode) return null;
      
      try {
        const customer = this.selectedCustomer || null;
        const response = await frappe.call({
          method: 'imogi_pos.api.native_pricing.validate_coupon_code',
          args: {
            coupon_code: couponCode,
            customer: customer
          }
        });
        
        const result = response?.message || response;
        if (result && result.valid) {
          return {
            code: couponCode,
            type: 'native_coupon',
            pricing_rule: result.pricing_rule,
            discount_type: result.discount_type,
            discount_percentage: result.discount_percentage || 0,
            discount_amount: result.discount_amount || 0
          };
        }
        return null;
      } catch (error) {
        console.warn('Native coupon validation failed:', error);
        return null;
      }
    },
    
    /**
     * Show visual indicator for active pricing rules
     */
    showPricingRuleIndicator: function(pricingResult) {
      if (!pricingResult || !pricingResult.has_pricing_rules) return;
      
      let indicator = document.querySelector('.pricing-rules-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'pricing-rules-indicator alert alert-success';
        indicator.style.cssText = 'margin: 10px; padding: 10px; font-size: 14px;';
        
        const cartSummary = document.querySelector('.cart-summary') || 
                          document.querySelector('.order-summary');
        if (cartSummary) {
          cartSummary.insertBefore(indicator, cartSummary.firstChild);
        }
      }
      
      let message = '🎁 ' + __('Active Promotions:');
      if (pricingResult.total_discount_amount > 0) {
        message += ' ' + __('Discount') + ' ' + format_currency(pricingResult.total_discount_amount);
      }
      if (pricingResult.free_items && pricingResult.free_items.length > 0) {
        message += ' | ' + __('Free Items') + ': ' + pricingResult.free_items.length;
      }
      
      indicator.innerHTML = message;
      indicator.style.display = 'block';
    },

    removePromoCode: function () {
      if (!this.allowDiscounts) return;
      this.discountState.promo = null;
      this.discountState.error = null;
      if (this.elements.promoSelect) this.elements.promoSelect.value = "";
      this.hidePromoInput();
      this.updateCartTotals();
      this.refreshDiscountUI();
      
      // Hide pricing rule indicator
      const indicator = document.querySelector('.pricing-rules-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    },

    setPromoError: function (message) {
      if (!this.allowDiscounts) return;
      this.discountState.error = message ? String(message) : null;
      this.refreshDiscountUI();
    },

    refreshDiscountUI: function (totals) {
      if (!this.allowDiscounts) {
        if (this.elements.cartDiscountLabel) this.elements.cartDiscountLabel.textContent = __("Discount");
        return;
      }

      if (!totals) {
        totals = this.calculateTotals();
      }

      const hasItems = this.cart.length > 0;
      const hasPromos = this.promoCodes.length > 0;
      const select = this.elements.promoSelect;
      const selectedValue = (select?.value || "").trim();

      if (this.elements.promoButton) {
        this.elements.promoButton.disabled =
          !hasItems || this.discountState.isApplying || !hasPromos;
      }
      if (this.elements.promoApplyBtn) {
        const canApply =
          hasItems && hasPromos && selectedValue && !this.discountState.isApplying;
        this.elements.promoApplyBtn.disabled = !canApply;
      }
      if (this.elements.promoCancelBtn) {
        this.elements.promoCancelBtn.disabled = this.discountState.isApplying;
      }
      if (select) {
        select.disabled = this.discountState.isApplying || !hasPromos;
        if (!hasPromos) {
          select.value = "";
        }
      }

      if (!hasItems) {
        if (this.discountState.promo) {
          this.discountState.promo = null;
        }
        this.hidePromoInput();
        if (select) select.value = "";
      }

      const labelEl = this.elements.cartDiscountLabel;
      if (labelEl) {
        const base = __("Discount");
        labelEl.textContent = totals.discountLabel ? `${base} (${totals.discountLabel})` : base;
      }

      const statusEl = this.elements.promoStatus;
      if (statusEl) {
        statusEl.classList.remove("error", "success");
        let html = "";
        if (this.discountState.error) {
          statusEl.classList.add("error");
          html = escapeHtml(this.discountState.error);
        } else if (this.discountState.promo) {
          const promo = this.discountState.promo;
          statusEl.classList.add("success");
          if (totals.discountSource === "promo") {
            const description =
              promo.description || promo.message || __("Promo {0} applied", [promo.code]);
            html = `${escapeHtml(description)} <button type="button" class="promo-remove">${__("Remove")}</button>`;
          } else {
            const infoMessage = __("Promo {0} saved. Automatic discount applied instead.", [
              promo.code,
            ]);
            html = `${escapeHtml(infoMessage)} <button type="button" class="promo-remove">${__("Remove")}</button>`;
          }
        } else if (totals.discountSource === "auto" && totals.discountDescription) {
          statusEl.classList.add("success");
          html = escapeHtml(totals.discountDescription);
        }
        statusEl.innerHTML = html;
      }
    },

    normalizePromoResult: function (data, rawCode) {
      if (!data) {
        return { error: __("Promo code is invalid or expired.") };
      }
      if (data.error) {
        return { error: data.error };
      }
      if (data.valid === false) {
        return { error: data.message || __("Promo code is invalid or expired.") };
      }

      const code = (data.code || data.promo_code || rawCode || "").trim();
      if (!code) {
        return { error: __("Promo code is invalid or expired.") };
      }

      let percent = this.normalizeNumber(
        data.discount_percent ?? data.percent ?? data.percentage ?? 0
      );
      let amount = this.normalizeNumber(
        data.discount_amount ?? data.amount ?? data.value ?? 0
      );
      const type = String(data.discount_type || data.type || "").toLowerCase();

      let discountType = "percent";
      if (type.includes("amount") || type.includes("value") || type.includes("fixed")) {
        discountType = "amount";
      } else if (percent <= 0 && amount > 0) {
        discountType = "amount";
      }

      percent = Math.max(0, percent);
      amount = Math.max(0, amount);
      if (discountType === "percent" && percent <= 0 && amount > 0) {
        discountType = "amount";
      } else if (discountType === "amount" && amount <= 0 && percent > 0) {
        discountType = "percent";
      }

      const normalizedPercent = discountType === "percent" ? percent : 0;
      const normalizedAmount = discountType === "amount" ? amount : 0;

      return {
        code: code.toUpperCase(),
        discountType,
        percent: normalizedPercent,
        amount: normalizedAmount,
        label:
          data.label ||
          data.title ||
          (discountType === "percent"
            ? __("Promo {0} ({1}% off)", [code.toUpperCase(), Math.max(0, percent)])
            : __("Promo {0}", [code.toUpperCase()])),
        description:
          data.description ||
          data.message ||
          data.detail ||
          (discountType === "percent"
            ? __("{0}% discount applied.", [Math.max(0, percent)])
            : __("Discount applied.")),
        message: data.status_message || data.success_message || null,
      };
    },

    // ====== LOAD DATA ======
    loadPromoCodes: async function () {
      if (!this.allowDiscounts) {
        this.promoCodes = [];
        this.renderPromoOptions();
        return;
      }

      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.pricing.list_active_promo_codes",
        });

        const response = Array.isArray(message)
          ? message
          : Array.isArray(message?.promo_codes)
            ? message.promo_codes
            : [];

        const normaliseText = (value) =>
          typeof value === "string" ? value.trim() : "";

        const parsed = response
          .map((row) => {
            const code = normaliseText(row?.code || row?.promo_code || row?.name);
            if (!code) return null;

            const label =
              normaliseText(row?.label) ||
              normaliseText(row?.title) ||
              normaliseText(row?.description) ||
              code;
            const description =
              normaliseText(row?.description) || normaliseText(row?.label) || "";
            const discountType = normaliseText(row?.discount_type || row?.type).toLowerCase();
            const discountValue = Number(
              row?.discount_value ?? row?.value ?? row?.discount ?? row?.percent ?? 0
            );

            return {
              code: code.toUpperCase(),
              label: label || code.toUpperCase(),
              description,
              discountType,
              discountValue: Number.isFinite(discountValue) ? discountValue : 0,
            };
          })
          .filter(Boolean);

        this.promoCodes = parsed;
      } catch (error) {
        console.error("Failed to load promo codes:", error);
        this.promoCodes = [];
      } finally {
        this.renderPromoOptions();
        this.refreshDiscountUI();
      }
    },

    renderPromoOptions: function () {
      const select = this.elements.promoSelect;
      if (!select) return;

      const placeholder = `<option value="">${escapeHtml(__("Select promo code"))}</option>`;
      const options = this.promoCodes
        .map((promo) => {
          const label = promo.label || promo.code;
          const description = promo.description ? ` title="${escapeHtml(promo.description)}"` : "";
          return `<option value="${escapeHtml(promo.code)}"${description}>${escapeHtml(label)}</option>`;
        })
        .join("");

      select.innerHTML = placeholder + options;

      const appliedCode = (this.discountState.promo?.code || "").toUpperCase();
      if (appliedCode && this.promoCodes.some((promo) => promo.code === appliedCode)) {
        select.value = appliedCode;
      } else {
        select.value = "";
      }
    },

    loadPriceLists: async function () {
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.pricing.get_allowed_price_lists",
          args: { pos_profile: POS_PROFILE_DATA.name },
        });

        const response = message || {};
        const lists = Array.isArray(response.price_lists) ? response.price_lists : [];

        this.priceLists = lists.map((row) => ({
          name: row.name,
          label: row.label || row.name,
          currency: row.currency || null,
          adjustment: this.normalizeNumber(row.adjustment),
        }));

        const defaultName =
          response.default_price_list ||
          this.selectedPriceList ||
          POS_PROFILE_DATA.selling_price_list ||
          (this.priceLists[0] ? this.priceLists[0].name : null);

        if (defaultName) {
          this.selectedPriceList = defaultName;
        }
      } catch (err) {
        console.error("Error loading price lists:", err);
        this.priceLists = [];
        if (!this.selectedPriceList) {
          this.selectedPriceList = POS_PROFILE_DATA.selling_price_list || null;
        }
      } finally {
        this.renderPriceListSelector();
      }
    },

    renderPriceListSelector: function () {
      const select = this.elements.priceListSelect;
      if (!select) return;

      const lists = this.priceLists;

      if (!lists.length) {
        const fallback = this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || "";
        const label = fallback || __("Not Set");
        select.innerHTML = `<option value="${escapeHtml(fallback)}">${escapeHtml(label)}</option>`;
        select.value = fallback;
        select.disabled = true;
        return;
      }

      const optionsHtml = lists
        .map((pl) => {
          const text = pl.currency
            ? `${escapeHtml(pl.label)} (${escapeHtml(pl.currency)})`
            : escapeHtml(pl.label);
          return `<option value="${escapeHtml(pl.name)}">${text}</option>`;
        })
        .join("");

      select.innerHTML = optionsHtml;

      const hasSelected = lists.some((pl) => pl.name === this.selectedPriceList);
      const value = hasSelected ? this.selectedPriceList : lists[0].name;

      this.selectedPriceList = value;
      select.value = value;
      select.disabled = lists.length <= 1;
    },

    handlePriceListChange: async function (priceList) {
      const previousPriceList = this.selectedPriceList;

      if (!priceList || priceList === previousPriceList) {
        this.renderPriceListSelector();
        return;
      }

      const select = this.elements.priceListSelect;
      this.selectedPriceList = priceList;
      if (select) select.disabled = true;

      this.showLoading("Updating prices...");
      try {
        await this.refreshPricesForSelectedList();
      } catch (err) {
        console.error("Failed to refresh prices:", err);
        this.showError("Failed to update prices. Please try again.");

        this.selectedPriceList = previousPriceList || null;
        if (select) {
          select.value = previousPriceList || "";
        }

        if (frappe && typeof frappe.show_alert === "function") {
          const previousLabel =
            previousPriceList &&
            (this.priceLists.find((pl) => pl.name === previousPriceList)?.label ||
              previousPriceList);

          frappe.show_alert({
            message: previousLabel
              ? __("Price list change cancelled. Reverted to {0}.", [previousLabel])
              : __("Price list change cancelled. Restored previous selection."),
            indicator: "orange",
          });
        }
      } finally {
        this.renderPriceListSelector();
        this.hideLoading();
      }
    },

    refreshPricesForSelectedList: async function () {
      await this.loadItemRates(true);
      this.renderItems();
      await this.recalculateCartPricing();
      this.renderCart();
      this.updateCartTotals();
    },

    recalculateCartPricing: async function () {
      if (!this.cart.length || !this.selectedPriceList) return;

      const itemCodes = Array.from(
        new Set(
          this.cart
            .map((item) => item.item_code)
            .filter((code) => typeof code === "string" && code)
        )
      );

      if (!itemCodes.length) return;

      let priceMap = {};
      try {
        const { message } = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "Item Price",
            filters: {
              item_code: ["in", itemCodes],
              price_list: this.selectedPriceList,
            },
            fields: ["item_code", "price_list_rate"],
            limit_page_length: itemCodes.length,
          },
        });
        priceMap = (message || []).reduce((acc, row) => {
          acc[row.item_code] = Number(row.price_list_rate || 0);
          return acc;
        }, {});
      } catch (err) {
        console.error("Failed to recalculate cart pricing:", err);
        priceMap = {};
      }

      const adjustment = this.getSelectedPriceListAdjustment();

      this.cart.forEach((item) => {
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
              const defaultRate = this.normalizeNumber(
                catalogItem._default_standard_rate
              );
              baseRate = defaultRate + adjustment;
            }
          } else {
            const fallbackBase =
              typeof item._base_rate === "number"
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

    getCartItemExtra: function (item) {
      if (item && typeof item._extra_rate === "number") {
        return item._extra_rate;
      }

      let options = item?.item_options;
      if (typeof options === "string" && options) {
        try {
          options = JSON.parse(options);
        } catch (err) {
          options = {};
        }
      }

      if (!options || typeof options !== "object") return 0;

      const extra = Number(options.extra_price || 0);
      return Number.isFinite(extra) ? extra : 0;
    },

    loadItems: async function () {
      this.showLoading("Loading catalog...");
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.variants.get_items_with_stock",
          args: {
            warehouse: POS_PROFILE_DATA.warehouse,
            limit: 500,
            pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null,
            price_list: this.selectedPriceList || null,
            base_price_list: this.basePriceList || null,
            menu_channel: ACTIVE_MENU_CHANNEL,
          },
        });

        if (message) {
          const payload = Array.isArray(message) ? message : [];
          const templates = [];
          const variants = [];
          const standalone = [];
          const templateIndex = new Map();
          const registerTemplateKeys = (template) => {
            if (!template) return;
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
            "menu_category",
            "item_group",
            "image",
            "item_image",
            "web_image",
            "thumbnail",
            "description",
            "photo",
            "default_kitchen",
            "default_kitchen_station",
          ];

          variants.forEach((variant) => {
            const template =
              templateIndex.get(variant.variant_of) ||
              templateIndex.get(variant.template_item) ||
              templateIndex.get(variant.template_item_code);

            if (template) {
              inheritFields.forEach((field) => {
                const variantValue = variant[field];
                const templateValue = template[field];
                if (
                  (variantValue === undefined || variantValue === null || variantValue === "") &&
                  templateValue !== undefined &&
                  templateValue !== null &&
                  templateValue !== ""
                ) {
                  variant[field] = templateValue;
                }
              });
            }
          });

          const combinedItems = [
            ...standalone,
            ...templates,
          ];

          const availableItems = combinedItems.filter((item) =>
            hasValidMenuCategory(item.menu_category)
          );

          if (this.itemIndex && typeof this.itemIndex.clear === "function") {
            this.itemIndex.clear();
          } else {
            this.itemIndex = new Map();
          }

          const pricingTargets = [];
          const seenPricingTargets = new Set();
          const registerPricingTarget = (item) => {
            if (!item || !item.name) return;
            if (seenPricingTargets.has(item.name)) return;
            seenPricingTargets.add(item.name);
            pricingTargets.push(item);
          };

          availableItems.forEach(registerPricingTarget);
          templates.forEach(registerPricingTarget);
          variants.forEach(registerPricingTarget);

          pricingTargets.forEach((item) => {
            item.has_explicit_price_list_rate = Number(
              item.has_explicit_price_list_rate
            )
              ? 1
              : 0;
            if (item.has_explicit_price_list_rate) {
              item._explicit_standard_rate = this.normalizeNumber(item.standard_rate);
            } else if (!Object.prototype.hasOwnProperty.call(item, "_explicit_standard_rate")) {
              item._explicit_standard_rate = null;
            }
            const baseSource = Object.prototype.hasOwnProperty.call(
              item,
              "imogi_base_standard_rate"
            )
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

          this.items = availableItems;
          this.filteredItems = [...this.items];
          this.refreshAllVariantDisplayRates();

          // Lengkapi harga yang kosong
          await this.loadItemRates(!this.selectedPriceList);

          // Build kategori unik
          const set = new Set();
          this.items.forEach((it) => {
            if (hasValidMenuCategory(it.menu_category)) {
              set.add(it.menu_category.trim());
            }
          });
          this.categories = Array.from(set);
        }
      } catch (err) {
        console.error("Error loading items:", err);
        this.showError("Failed to load items. Please try again.");
      } finally {
        this.hideLoading();
      }
    },

    loadItemRates: async function (force = false) {
      const priceList = this.selectedPriceList;
      if (!priceList || !this.items.length) return;

      if (force) {
        this.items.forEach((item) => {
          item.has_explicit_price_list_rate = 0;
          item._explicit_standard_rate = null;
        });
        this.getAllCachedVariants().forEach((variant) => {
          variant.has_explicit_price_list_rate = 0;
          variant._explicit_standard_rate = null;
        });
      }

      const targetItems = force ? this.items : this.items.filter((it) => !it.standard_rate);
      const cachedVariants = this.getAllCachedVariants();
      const targetVariants = force
        ? cachedVariants
        : cachedVariants.filter((variant) => !variant.standard_rate);
      const lookupNames = Array.from(
        new Set(
          [...targetItems, ...targetVariants]
            .map((entry) => entry && entry.name)
            .filter(Boolean)
        )
      );

      if (!lookupNames.length) {
        this.applyPriceAdjustmentToItems(this.items);
        this.applyPriceAdjustmentToCachedVariants();
        return;
      }
      try {
        const { message } = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "Item Price",
            filters: {
              item_code: ["in", lookupNames],
              price_list: priceList,
            },
            fields: ["item_code", "price_list_rate"],
            limit_page_length: lookupNames.length,
          },
        });
        (message || []).forEach((row) => {
          const itemCode = row.item_code;
          const rate = this.normalizeNumber(row.price_list_rate);
          const item = this.getCatalogItem(itemCode) || this.items.find((i) => i.name === itemCode);
          if (item) {
            item._explicit_standard_rate = rate;
            item.has_explicit_price_list_rate = 1;
          }
        });
      } catch (err) {
        console.error("Error loading item rates:", err);
      }

      this.applyPriceAdjustmentToItems(this.items);
      this.applyPriceAdjustmentToCachedVariants();
    },

    loadTaxTemplate: async function () {
      // TODO: ambil dari POS profile / tax template kalau ada
      this.taxRate = 0.11;
      this.updateCartTotals();
    },

    loadVariantsForTemplate: async function (templateItem) {
      this.showLoading("Loading variants...");
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.variants.get_item_variants",
          args: {
            item_template: templateItem.name,
            price_list: this.selectedPriceList || null,
            base_price_list: this.basePriceList || null,
            menu_channel: ACTIVE_MENU_CHANNEL,
          },
        });
        const variants = (message && message.variants) || [];
        const adjusted = this.applyPriceAdjustmentToVariants(variants);
        if (adjusted.length) {
          this.cacheVariantsForTemplate(templateItem, adjusted);
          this.refreshVariantDisplayRateForTemplate(templateItem);
        }
        return adjusted;
      } catch (err) {
        console.error("Error loading variants:", err);
        this.showError("Failed to load variants. Please try again.");
        const cached = this.getCachedVariantsForTemplate(templateItem);
        return cached.length ? cached : [];
      } finally {
        this.hideLoading();
      }
    },

    // ====== RENDER ======
    renderVariants: function (variants) {
      const container = this.elements.variantGrid;
      if (!container) return;

      container.innerHTML = "";
      this.selectedVariant = null;
      if (this.elements.variantAddBtn) {
        this.elements.variantAddBtn.disabled = true;
      }

      if (!Array.isArray(variants) || variants.length === 0) {
        container.innerHTML = `
          <div class="empty-variants">
            <p>${escapeHtml(__("No options available for this item"))}</p>
          </div>
        `;
        return;
      }

      const normalizeAttributes = (source) => {
        if (!source || typeof source !== "object") return [];
        return Object.keys(source)
          .map((key) => {
            const value = source[key];
            if (value === undefined || value === null || value === "") return null;

            if (typeof value === "object") {
              const normalizedValue =
                value.value ?? value.name ?? value.attribute_value ?? value.label ?? value.attribute_value_label;
              const displayValue =
                value.label ?? value.attribute_value_label ?? value.display ?? normalizedValue ?? "";
              const resolved = normalizedValue ?? displayValue;
              const text = resolved !== undefined && resolved !== null ? String(resolved).trim() : "";
              const finalLabel = value.attribute_label || value.label || key;
              if (!text) return null;
              return {
                label: finalLabel,
                value: displayValue !== undefined && displayValue !== null ? String(displayValue).trim() : text,
              };
            }

            const text = String(value).trim();
            if (!text) return null;
            return { label: key, value: text };
          })
          .filter(Boolean);
      };

      const collectPreferredVariantName = () => {
        const templateItem = this.selectedTemplateItem;
        if (!templateItem) return null;

        const keysToInspect = new Set();
        const primaryKey = this.resolveSelectionKey(templateItem);
        if (primaryKey) keysToInspect.add(primaryKey);
        const templateKey = this.resolveTemplateKey(templateItem);
        if (templateKey) keysToInspect.add(templateKey);
        if (templateItem.template_item_code) keysToInspect.add(templateItem.template_item_code);
        if (templateItem.template_item) keysToInspect.add(templateItem.template_item);

        for (const key of keysToInspect) {
          if (!key) continue;
          const memory = this.getRememberedSelection(key);
          if (!memory || typeof memory !== "object") continue;
          if (memory.preferred_item) return memory.preferred_item;
          const variantOption = memory.options && memory.options.variant;
          if (!variantOption) continue;
          if (typeof variantOption === "object" && variantOption !== null) {
            const candidate =
              variantOption.value || variantOption.name || variantOption.label || variantOption.item_code || null;
            if (candidate) return candidate;
          } else if (typeof variantOption === "string") {
            if (variantOption.trim()) return variantOption.trim();
          }
        }

        return null;
      };

      const preferredVariantName = collectPreferredVariantName();

      const cardsHtml = variants
        .map((variant) => {
          const attributes = normalizeAttributes(variant?.attributes);
          const soldOut = this.isItemSoldOut(variant);

          const attributeHtml = attributes
            .map(
              (attribute) =>
                `<span class="variant-attribute">${escapeHtml(attribute.label)}: ${escapeHtml(attribute.value)}</span>`,
            )
            .join("");

          const price = Number(variant?.standard_rate);
          const formattedPrice = escapeHtml(
            formatRupiah(Number.isFinite(price) ? price : 0),
          );

          const statusHtml = soldOut
            ? `<div class="variant-status">${escapeHtml(__("Sold Out"))}</div>`
            : "";

          const classes = ["variant-card"];
          if (soldOut) classes.push("sold-out");

          return `
            <div class="${classes.join(" ")}" data-variant="${escapeHtml(variant.name)}" data-sold-out="${soldOut ? "1" : "0"}">
              <div class="variant-name">${escapeHtml(variant.item_name || variant.name || "")}</div>
              <div class="variant-price">${formattedPrice}</div>
              ${attributeHtml ? `<div class="variant-attributes">${attributeHtml}</div>` : ""}
              ${statusHtml}
            </div>
          `;
        })
        .join("");

      container.innerHTML = cardsHtml;

      const variantCards = Array.from(container.querySelectorAll(".variant-card"));
      if (!variantCards.length) return;

      const findVariant = (name) => variants.find((variant) => variant && variant.name === name) || null;

      const selectVariant = (name) => {
        const targetCard = variantCards.find((card) => card.dataset.variant === name);
        const variant = name ? findVariant(name) : null;
        if (!targetCard || !variant) return;
        if (targetCard.dataset.soldOut === "1") return;

        variantCards.forEach((card) => card.classList.toggle("selected", card === targetCard));
        this.selectedVariant = variant;
        if (this.elements.variantAddBtn) {
          this.elements.variantAddBtn.disabled = false;
        }
      };

      variantCards.forEach((card) => {
        if (card.dataset.soldOut === "1") {
          card.setAttribute("aria-disabled", "true");
          card.setAttribute("title", __("Sold Out"));
          return;
        }

        card.addEventListener("click", () => {
          selectVariant(card.dataset.variant);
        });
      });

      const initialPreferred =
        preferredVariantName && variantCards.some((card) => card.dataset.variant === preferredVariantName)
          ? preferredVariantName
          : null;

      if (initialPreferred) {
        selectVariant(initialPreferred);
      } else {
        const firstAvailable = variantCards.find((card) => card.dataset.soldOut !== "1");
        if (firstAvailable) {
          selectVariant(firstAvailable.dataset.variant);
        }
      }
    },

    renderCategories: function () {
      const cats = ["all", ...this.categories];
      const html = cats
        .map((cat) => {
          const label = cat === "all" ? "All" : cat;
          const active = this.selectedCategory === cat ? " active" : "";
          return `<div class="category-pill${active}" data-category="${cat}">${label}</div>`;
        })
        .join("");
      if (this.elements.categoriesContainer)
        this.elements.categoriesContainer.innerHTML = html;
    },

    renderItems: function () {
      if (!this.elements.catalogGrid) return;

      if (!this.filteredItems.length) {
        this.elements.catalogGrid.innerHTML = `
          <div class="empty-catalog">
            <p>No items found</p>
          </div>`;
        return;
      }

      let html = "";
      this.filteredItems.forEach((item) => {
        const imageUrl =
          item.photo ||
          item.image ||
          "/assets/imogi_pos/images/default-product-image.svg";
        const isSoldOut = this.isItemSoldOut(item);
        const cardClasses = ["item-card"];
        if (isSoldOut) cardClasses.push("sold-out");

        const displayRate = this.getDisplayRateForItem(item);
        const formattedPrice = formatRupiah(Number.isFinite(displayRate) ? displayRate : 0);

        html += `
          <div class="${cardClasses.join(" ")}" data-item="${item.name}" aria-disabled="${
          isSoldOut ? "true" : "false"
        }">
            <span class="sold-out-badge" aria-hidden="${isSoldOut ? "false" : "true"}">Sold Out</span>
            <div class="item-image" style="background-image: url('${imageUrl}')"></div>
            <div class="item-info">
              <div class="item-name">${item.item_name}</div>
              <div class="item-price">${formattedPrice}</div>
              ${item.has_variants ? '<div class="item-has-variants">Multiple options</div>' : ""}
            </div>
          </div>
        `;
      });

      this.elements.catalogGrid.innerHTML = html;

      // Click handlers
      const cards = this.elements.catalogGrid.querySelectorAll(".item-card");
      cards.forEach((card) => {
        card.addEventListener("click", () => {
          const itemName = card.dataset.item;
          const item = this.items.find((i) => i.name === itemName);
          if (!item) return;
          if (this.isItemSoldOut(item)) return;
          this.handleItemClick(item);
        });
      });

      // Apply sold-out state
      cards.forEach((card) => {
        const itemName = card.dataset.item;
        const item = this.items.find((i) => i.name === itemName);
        if (item)
          this.updateItemStock(
            item.name,
            item.actual_qty,
            item.is_component_shortage,
            item.component_low_stock
          );
      });
    },

    renderCart: function () {
      console.log("🔄 renderCart() called, cart items:", this.cart.length);
      
      if (!this.elements.cartItems) {
        console.error("❌ cartItems element not found!");
        return;
      }
    
      if (this.cart.length === 0) {
        this.elements.cartItems.innerHTML = `
          <div class="empty-cart">
            <p>Your cart is empty</p>
            <p>Select items from the menu</p>
          </div>`;
        if (this.elements.checkoutBtn) this.elements.checkoutBtn.disabled = true;
        if (this.elements.clearBtn) this.elements.clearBtn.disabled = true;
        if (this.allowDiscounts) {
          this.resetDiscountState();
        }
        return;
      }
    
      // ============================================
      // FIX: Build HTML dengan concatenation biasa
      // JANGAN pakai template literal untuk data-index
      // ============================================
      
      let html = "";
      
      for (let i = 0; i < this.cart.length; i++) {
        const item = this.cart[i];
        const index = i; // PENTING: Pakai variable biasa, bukan template
        
        const itemOptions = item.item_options ? this.formatItemOptions(item.item_options) : "";
        const itemNotes = item.notes || "";
        const formattedAmount = formatRupiah(item.amount);
        
        // Build HTML tanpa template literal di data-index
        html += '<div class="cart-item" data-index="' + index + '">';
        html += '  <div class="cart-item-header">';
        html += '    <div class="cart-item-name">' + item.item_name + '</div>';
        html += '    <div class="cart-item-price">' + formattedAmount + '</div>';
        html += '  </div>';
        html += '  <div class="cart-item-controls">';
        html += '    <button type="button" class="qty-btn qty-minus" data-index="' + index + '">-</button>';
        html += '    <input type="number" class="cart-item-qty" value="' + item.qty + '" min="1" data-index="' + index + '" readonly>';
        html += '    <button type="button" class="qty-btn qty-plus" data-index="' + index + '">+</button>';
        html += '  </div>';
        
        if (itemOptions) {
          html += '  <div class="cart-item-options">' + itemOptions + '</div>';
        }
        
        if (itemNotes) {
          html += '  <div class="cart-item-notes">' + itemNotes + '</div>';
        }
        
        html += '  <div class="cart-item-remove" data-index="' + index + '">&times;</div>';
        html += '</div>';
      }
    
      this.elements.cartItems.innerHTML = html;
      console.log("✅ Cart HTML rendered");
      
      // Debug: Cek apakah data-index benar
      const buttons = this.elements.cartItems.querySelectorAll('.qty-btn');
      console.log("📊 Buttons rendered:", buttons.length);
      buttons.forEach((btn, idx) => {
        const dataIndex = btn.getAttribute('data-index');
        console.log(`   Button ${idx}: data-index="${dataIndex}" (type: ${typeof dataIndex})`);
      });
    
      // REMOVE old event listener
      if (this.cartClickHandler) {
        this.elements.cartItems.removeEventListener("click", this.cartClickHandler);
      }
    
      // CREATE new event handler - SIMPLIFIED
      this.cartClickHandler = (event) => {
        const target = event.target;
        
        console.log("🖱️ Click on:", target.tagName, target.className);
        
        // Pastikan yang diklik adalah button atau remove div
        if (target.tagName !== 'BUTTON' && !target.classList.contains('cart-item-remove')) {
          console.log("   ⚠️ Not a button or remove div, ignoring");
          return;
        }
        
        // Ambil data-index LANGSUNG dari target
        const indexStr = target.getAttribute("data-index");
        console.log("   📍 data-index attribute:", indexStr);
        console.log("   📍 typeof:", typeof indexStr);
        
        // Validasi string
        if (!indexStr || indexStr === "" || indexStr === "undefined" || indexStr === "null") {
          console.error("   ❌ Empty or invalid data-index");
          return;
        }
        
        // Parse ke integer
        const index = parseInt(indexStr, 10);
        console.log("   🔢 Parsed index:", index);
        
        // Validasi number
        if (isNaN(index)) {
          console.error("   ❌ NaN detected! indexStr was:", indexStr);
          console.error("   ❌ Button HTML:", target.outerHTML);
          return;
        }
        
        if (index < 0 || index >= this.cart.length) {
          console.error("   ❌ Index out of bounds:", index, "Cart length:", this.cart.length);
          return;
        }
    
        event.preventDefault();
        event.stopPropagation();
    
        console.log("   ✅ Valid index:", index);
        console.log("   📦 Cart item:", this.cart[index].item_name);
    
        // Handle actions
        if (target.classList.contains('qty-plus')) {
          console.log("   ➕ Incrementing quantity");
          this.updateCartItemQuantity(index, this.cart[index].qty + 1);
        } 
        else if (target.classList.contains('qty-minus')) {
          console.log("   ➖ Decrementing quantity");
          this.updateCartItemQuantity(index, this.cart[index].qty - 1);
        } 
        else if (target.classList.contains('cart-item-remove')) {
          console.log("   ❌ Removing item");
          this.removeCartItem(index);
        }
      };
    
      // ATTACH event listener
      this.elements.cartItems.addEventListener("click", this.cartClickHandler, false);
      console.log("✅ Event handler attached");
    
      // Enable buttons
      if (this.elements.checkoutBtn) this.elements.checkoutBtn.disabled = false;
      if (this.elements.clearBtn) this.elements.clearBtn.disabled = false;
      if (this.allowDiscounts) {
        this.refreshDiscountUI();
      }
    },

    updateCartTotals: function () {
      const totals = this.calculateTotals();
      if (this.elements.cartSubtotal) this.elements.cartSubtotal.textContent = formatRupiah(totals.subtotal);
      if (this.elements.cartTax) this.elements.cartTax.textContent = formatRupiah(totals.tax);
      if (this.elements.cartDiscount) this.elements.cartDiscount.textContent = formatRupiah(totals.discountAmount);
      if (this.elements.cartTotal) this.elements.cartTotal.textContent = formatRupiah(totals.total);
      if (this.elements.paymentAmount)
        this.elements.paymentAmount.textContent = `${formatRupiah(totals.total)}`;

      if (this.elements.changeAmount)
        this.elements.changeAmount.textContent = `${formatRupiah(Math.max(0, this.cashAmount - totals.total))}`;

      if (this.elements.paymentConfirmBtn && this.paymentMethod === "cash") {
        this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
      }

      if (this.allowDiscounts) {
        this.refreshDiscountUI(totals);
      }
      
      // Auto-check native pricing rules when cart changes (native-first approach)
      if (this.cart.length > 0 && !this._checkingPricingRules) {
        this._checkingPricingRules = true;
        this.checkNativePricingRules().finally(() => {
          this._checkingPricingRules = false;
        });
      }
    },

    isItemSoldOut: function (item, actualQty, isComponentShortage) {
      if (!item && actualQty == null && typeof isComponentShortage === "undefined") return false;

      const parseQty = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const parseShortage = (value) => {
        if (value === undefined) return false;
        if (value === null || value === "") return false;
        if (typeof value === "string") {
          const lowered = value.trim().toLowerCase();
          if (!lowered) return false;
          if (lowered === "true") return true;
          if (lowered === "false") return false;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) return numeric !== 0;
        }
        if (typeof value === "number") return value !== 0;
        return Boolean(value);
      };

      if (item && item.has_variants) {
        const cachedVariants = this.getCachedVariantsForTemplate(item) || [];
        if (cachedVariants.length) {
          let anyAvailableVariant = false;
          let allUnavailableOrShort = true;

          cachedVariants.forEach((variant) => {
            const qty = parseQty(variant?.actual_qty);
            const shortageSource = Object.prototype.hasOwnProperty.call(variant || {}, "is_component_shortage")
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
      const shortageFlag =
        typeof isComponentShortage !== "undefined"
          ? parseShortage(isComponentShortage)
          : parseShortage(item?.is_component_shortage);

      return Boolean(shortageFlag) || (qtySource !== null && qtySource <= 0);
    },

    updateItemStock: function (
      itemCode,
      actualQty,
      isComponentShortage,
      componentLowStock
    ) {
      if (!itemCode) return;

      const parseQty = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const parseShortage = (value) => {
        if (value === undefined) return undefined;
        if (value === null || value === "") return false;
        if (typeof value === "string") {
          const lowered = value.trim().toLowerCase();
          if (!lowered) return false;
          if (lowered === "true") return true;
          if (lowered === "false") return false;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) return numeric !== 0;
        }
        if (typeof value === "number") return value !== 0;
        return Boolean(value);
      };

      const qtyValue = parseQty(actualQty);
      const shortageProvided = typeof isComponentShortage !== "undefined";
      const shortageValue = shortageProvided ? parseShortage(isComponentShortage) : undefined;

      const itemsToRefresh = new Set();
      const registerForRefresh = (entry) => {
        if (entry) itemsToRefresh.add(entry);
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
          if (!bucket || !(bucket instanceof Map)) return;
          const variant = bucket.get(itemCode);
          if (!variant) return;

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
            (entry) => entry.name === templateName || entry.item_code === templateName
          );
          if (templateItem) {
            this.cacheVariantsForTemplate(templateItem, [updatedVariant]);
            registerForRefresh(templateItem);
          }
        }
      }

      const catalog = this.elements.catalogGrid;
      if (!catalog || !itemsToRefresh.size) return;

      const applySoldOutState = (entry) => {
        if (!entry || !entry.name) return;
        const soldOut = this.isItemSoldOut(entry);
        const cards = catalog.querySelectorAll(".item-card");
        for (const card of cards) {
          if (card.dataset.item === entry.name) {
            card.classList.toggle("sold-out", soldOut);
            card.setAttribute("aria-disabled", soldOut ? "true" : "false");
            const badge = card.querySelector(".sold-out-badge");
            if (badge) {
              badge.setAttribute("aria-hidden", soldOut ? "false" : "true");
            }
            break;
          }
        }
      };

      itemsToRefresh.forEach(applySoldOutState);
    },

    refreshStockLevels: async function () {
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.variants.get_items_with_stock",
          args: {
            warehouse: POS_PROFILE_DATA.warehouse,
            limit: 500,
            pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null,
            price_list: this.selectedPriceList || null,
            base_price_list: this.basePriceList || null,
            menu_channel: ACTIVE_MENU_CHANNEL,
          },
        });
        const responseItems = Array.isArray(message) ? message : [];
        const currentLow = new Map();

        responseItems.forEach((u) => {
          this.updateItemStock(
            u.name,
            u.actual_qty,
            u.is_component_shortage,
            u.component_low_stock
          );

          const components = Array.isArray(u.component_low_stock)
            ? u.component_low_stock
            : [];
          components.forEach((component) => {
            if (!component) return;
            const code = component.item_code || component.component_code || component.name;
            if (!code) return;
            const warehouse = component.warehouse || "";
            const key = `${code}::${warehouse}`;
            if (currentLow.has(key)) return;

            const qtyValue = Number(component.actual_qty);
            const normalizedQty = Number.isFinite(qtyValue)
              ? qtyValue
              : component.actual_qty;

            currentLow.set(key, {
              item_code: code,
              warehouse,
              item_name: component.item_name || code,
              stock_uom: component.stock_uom || "",
              actual_qty: normalizedQty,
            });
          });
        });

        const previous = this.lowStockComponentState || new Map();
        const newlyLow = [];
        currentLow.forEach((details, key) => {
          if (!previous.has(key)) {
            newlyLow.push(details);
          }
        });

        this.lowStockComponentState = currentLow;

        if (newlyLow.length) {
          const parts = newlyLow.map((component) => {
            const name = component.item_name || component.item_code;
            const qty = Number(component.actual_qty);
            let qtyText;
            if (Number.isFinite(qty)) {
              const rounded = Math.round(qty * 100) / 100;
              qtyText = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
            } else {
              qtyText = component.actual_qty;
            }
            const uom = component.stock_uom ? ` ${component.stock_uom}` : "";
            return `${name} (${qtyText}${uom})`;
          });

          const alertMessage =
            newlyLow.length === 1
              ? __("Component low on stock: {0}", [parts[0]])
              : __("Components low on stock: {0}", [parts.join(", ")]);

          if (typeof frappe !== "undefined" && frappe && typeof frappe.show_alert === "function") {
            frappe.show_alert({ message: alertMessage, indicator: "orange" });
          } else if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert(alertMessage);
          }
        }
      } catch (err) {
        console.error("Error refreshing stock levels:", err);
      }
    },

    // ====== HANDLERS ======
    handleSearch: function () {
      this.searchQuery = (this.elements.searchInput?.value || "").toLowerCase();
      this.filterItems();
    },

    selectCategory: function (category) {
      this.selectedCategory = category;
      // Update pill UI
      const pills = this.elements.categoriesContainer?.querySelectorAll(".category-pill") || [];
      pills.forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.category === category);
      });
      this.filterItems();
    },

    filterItems: function () {
      this.filteredItems = this.items.filter((item) => {
        const q = this.searchQuery;
        const matchesSearch =
          !q ||
          item.item_name.toLowerCase().includes(q) ||
          item.item_code.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q));
        const matchesCategory =
          this.selectedCategory === "all" ||
          item.item_group === this.selectedCategory ||
          item.menu_category === this.selectedCategory;
        return matchesSearch && matchesCategory;
      });
      this.renderItems();
    },

    handleItemClick: function (item) {
      if (!item) return;

      if (this.tryQuickAddItem(item)) {
        return;
      }

      if (item.has_variants) this.openVariantPicker(item);
      else this.openItemDetailModal(item);
    },

    openVariantPicker: async function (item) {
      this.selectedTemplateItem = item;
      this.selectedVariant = null;
      this.pendingNotes = "";
      if (this.elements.itemNotes) this.elements.itemNotes.value = "";
      if (this.elements.variantAddBtn) this.elements.variantAddBtn.disabled = true;
      if (this.elements.variantModal) this.elements.variantModal.style.display = "flex";

      const variants = await this.loadVariantsForTemplate(item);
      this.renderVariants(variants);
    },

    closeVariantModal: function () {
      if (this.elements.variantModal) this.elements.variantModal.style.display = "none";
      this.selectedTemplateItem = null;
      this.selectedVariant = null;
      if (this.elements.itemNotes) this.elements.itemNotes.value = "";
      this.pendingNotes = "";
    },

    addSelectedVariantToCart: async function () {
      if (!this.selectedVariant) return;

      const selectedVariant = this.selectedVariant;
      const notes = this.elements.itemNotes ? this.elements.itemNotes.value : "";

      let optionsPayload = null;
      let loadError = false;
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.items.get_item_options",
          args: {
            item: selectedVariant.name,
            menu_channel: ACTIVE_MENU_CHANNEL,
          },
        });
        optionsPayload = message || {};
      } catch (error) {
        loadError = true;
        console.error("Error preloading item options:", error);
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

    itemRequiresAdditionalOptions: function (optionsPayload) {
      if (!optionsPayload || typeof optionsPayload !== "object") return false;
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
      return groups.some((group) => Array.isArray(group) && group.length > 0);
    },

    openItemDetailModal: async function (item, notes = "", preloadedOptions = null) {
      this.selectedOptionItem = item;
      this.pendingNotes = notes || "";
      if (this.elements.itemDetailNotes)
        this.elements.itemDetailNotes.value = this.pendingNotes;

      const imageUrl =
        item.photo || item.image || "/assets/imogi_pos/images/default-product-image.svg";
      if (this.elements.itemDetailImage) {
        this.elements.itemDetailImage.style.backgroundImage = `url('${imageUrl}')`;
      }
      this.elements.itemDetailModal
        ?.querySelector(".modal-title")
        ?.replaceChildren(document.createTextNode(item.item_name));

      // Clear & hide while loading
      if (this.elements.itemOptions) {
        this.elements.itemOptions.innerHTML = "";
        this.elements.itemOptions.classList.add("hidden");
      }

      // Show modal
      if (this.elements.itemDetailModal) this.elements.itemDetailModal.style.display = "flex";

      if (preloadedOptions) {
        this.hideLoading();
        this.renderItemDetailOptions(preloadedOptions);
        return;
      }

      this.showLoading("Loading options...");
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.items.get_item_options",
          args: {
            item: item.name,
            menu_channel: ACTIVE_MENU_CHANNEL,
          },
        });
        const options = message || {};
        this.renderItemDetailOptions(options);
      } catch (err) {
        console.error("Error loading item options:", err);
        this.showError("Failed to load item options.");
      } finally {
        this.hideLoading();
      }
    },

    closeItemDetailModal: function () {
      if (this.elements.itemDetailModal) this.elements.itemDetailModal.style.display = "none";
      this.selectedOptionItem = null;
      if (this.elements.itemDetailNotes) this.elements.itemDetailNotes.value = "";
      this.pendingNotes = "";
    },

    renderItemDetailOptions: function (options) {
      const container = this.elements.itemOptions;
      if (!container) return;

      const variants = Array.isArray(options.variants)
        ? options.variants
        : Array.isArray(options.variant)
          ? options.variant
          : [];
      const sizes = options.sizes || options.size || [];
      const spices = options.spices || options.spice || [];
      const toppings = options.toppings || options.topping || [];

      let html = "";

      const getName = (opt) => opt.name || opt.label || opt.value || "";
      const getPrice = (opt) => Number(opt.price || 0);
      const isDefault = (opt) => !!(opt.default || opt.is_default);

      if (variants.length) {
        html += `<div class="option-block" data-group="variant" data-required="1">
          <div class="option-title">Variant</div>
          <div class="option-group">`;
        variants.forEach((opt) => {
          const name = getName(opt);
          const value = opt.value || name;
          const price = getPrice(opt);
          const checked = isDefault(opt) ? "checked" : "";
          const priceText = price ? ` (+${formatRupiah(price)})` : "";
          html += `<label><input type="radio" name="variant-option" value="${value}" data-label="${name}" data-price="${price}" ${checked}> ${name}${priceText}</label>`;
        });
        html += `</div></div>`;
      }

      if (sizes.length) {
        html += `<div class="option-block" data-group="size" data-required="1">
          <div class="option-title">Size</div>
          <div class="option-group">`;
        sizes.forEach((opt) => {
          const name = getName(opt);
          const price = getPrice(opt);
          const checked = isDefault(opt) ? "checked" : "";
          const priceText = price ? ` (+${formatRupiah(price)})` : "";
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
          const checked = isDefault(opt) ? "checked" : "";
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
          const checked = isDefault(opt) ? "checked" : "";
          const priceText = price ? ` (+${formatRupiah(price)})` : "";
          html += `<label><input type="checkbox" name="topping-option" value="${name}" data-price="${price}" ${checked}> ${name}${priceText}</label>`;
        });
        html += `</div></div>`;
      }

      if (html) {
        container.innerHTML = html;
        container.classList.remove("hidden");
      } else {
        container.innerHTML = "";
        container.classList.add("hidden");
      }
    },

    confirmItemOptions: function () {
      const container = this.elements.itemOptions;
      if (!container) return;

      const selectedOptions = { toppings: [] };
      let extra = 0;

      const variantGroup = container.querySelector('[data-group="variant"]');
      if (variantGroup) {
        const input = variantGroup.querySelector('input[name="variant-option"]:checked');
        if (!input) return this.showError("Please select variant");
        const name = input.dataset.label || input.value;
        const price = Number(input.dataset.price || 0);
        selectedOptions.variant = { name, value: input.value, price };
        extra += price;
      }

      const sizeGroup = container.querySelector('[data-group="size"]');
      if (sizeGroup) {
        const input = sizeGroup.querySelector('input[name="size-option"]:checked');
        if (!input) return this.showError("Please select size");
        selectedOptions.size = { name: input.value, price: Number(input.dataset.price || 0) };
        extra += selectedOptions.size.price;
      }

      const spiceGroup = container.querySelector('[data-group="spice"]');
      if (spiceGroup) {
        const input = spiceGroup.querySelector('input[name="spice-option"]:checked');
        if (!input) return this.showError("Please select spice level");
        selectedOptions.spice = { name: input.value };
      }

      const toppingGroup = container.querySelector('[data-group="topping"]');
      if (toppingGroup) {
        const inputs = toppingGroup.querySelectorAll('input[name="topping-option"]:checked');
        inputs.forEach((inp) => {
          const price = Number(inp.dataset.price || 0);
          selectedOptions.toppings.push({ name: inp.value, price });
          extra += price;
        });
      }

      selectedOptions.extra_price = Number(extra) || 0;
      const notesField = this.elements.itemDetailNotes;
      const notesValue = notesField ? notesField.value : this.pendingNotes;
      const finalNotes = notesValue || "";
      this.pendingNotes = finalNotes;
      this.addItemToCart(this.selectedOptionItem, selectedOptions, finalNotes);
      this.closeItemDetailModal();
    },

    addItemToCart: function (item, item_options = {}, notes = "") {
      if (!item) return;
      const baseRate = Number(item.standard_rate || 0);
      const extraRate = Number(item_options.extra_price || 0);
      const rate = baseRate + extraRate;
      const catalogItem =
        this.getCatalogItem(item.name) ||
        this.getCatalogItem(item.item_code) ||
        (item.variant_of ? this.getCatalogItem(item.variant_of) : null);
      const resolvedCategory =
        (item.menu_category && String(item.menu_category).trim()) ||
        (item.item_group && String(item.item_group).trim()) ||
        (catalogItem &&
          ((catalogItem.menu_category && String(catalogItem.menu_category).trim()) ||
            (catalogItem.item_group && String(catalogItem.item_group).trim()))) ||
        null;
      const existingIndex = this.cart.findIndex(
        (i) =>
          i.item_code === item.name &&
          i.notes === notes &&
          JSON.stringify(i.item_options || {}) === JSON.stringify(item_options)
      );

      if (existingIndex >= 0) {
        const existingItem = this.cart[existingIndex];
        const currentQty = Number(existingItem && existingItem.qty) || 0;
        const updatedQty = currentQty + 1;

        existingItem.qty = updatedQty;
        existingItem._base_rate = baseRate;
        existingItem._extra_rate = extraRate;
        existingItem.rate = baseRate + extraRate;
        existingItem.amount = existingItem.rate * updatedQty;
        if (!existingItem.menu_category && resolvedCategory) {
          existingItem.menu_category = resolvedCategory;
        }
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
          menu_category: resolvedCategory,
          _base_rate: baseRate,
          _extra_rate: extraRate,
        });
      }

      this.renderCart();
      this.updateCartTotals();
      this.rememberItemSelection(item, item_options, notes);
    },

    tryQuickAddItem: function (item) {
      const key = this.resolveSelectionKey(item);
      if (!key) return false;

      const memory = this.getRememberedSelection(key);
      if (!memory) return false;

      let targetItem = item;
      if (memory.preferred_item && memory.preferred_item !== key) {
        const preferred = this.getCatalogItem(memory.preferred_item);
        if (!preferred) return false;
        targetItem = preferred;
      }

      const normalizedOptions = this.cloneSelectionOptions(memory.options || {});
      const normalizedNotes = memory.notes || "";
      const targetKey = this.resolveSelectionKey(targetItem);
      if (!targetKey) return false;

      const targetSignature = JSON.stringify(normalizedOptions || {});
      const existingIndex = this.cart.findIndex((line) => {
        if (!line || line.item_code !== targetKey) return false;

        const lineNotes = line.notes || "";
        const lineSignature = JSON.stringify(line.item_options || {});
        return lineNotes === normalizedNotes && lineSignature === targetSignature;
      });

      if (existingIndex >= 0) {
        const currentQty = Number(this.cart[existingIndex].qty) || 0;
        this.updateCartItemQuantity(existingIndex, currentQty + 1);
        this.rememberItemSelection(targetItem, normalizedOptions, normalizedNotes);
      } else {
        this.addItemToCart(targetItem, normalizedOptions, normalizedNotes);
      }


      return true;
    },

    resolveSelectionKey: function (item) {
      if (!item) return null;
      if (typeof item === "string") return item;
      if (item.name) return item.name;
      if (item.item_code) return item.item_code;
      return null;
    },


    resolveTemplateKey: function (item) {
      if (!item || typeof item !== "object") return null;

      const candidates = [
        item.variant_of,
        item.template_item,
        item.template_item_code,
        item.parent_item,
        item.parent_item_code,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }

      return null;
    },


    cloneSelectionOptions: function (options) {
      if (!options) return {};
      if (typeof structuredClone === "function") {
        try {
          return structuredClone(options);
        } catch (error) {
          // Fallback to JSON clone below
        }
      }
      try {
        return JSON.parse(JSON.stringify(options));
      } catch (error) {
        if (Array.isArray(options)) return options.slice();
        if (typeof options === "object") return Object.assign({}, options);
        return {};
      }
    },

    ensureSelectionMemory: function () {
      if (!(this.selectionMemory instanceof Map)) {
        this.selectionMemory = new Map();
      }
      return this.selectionMemory;
    },

    rememberItemSelection: function (item, item_options = {}, notes = "") {
      const key = this.resolveSelectionKey(item);
      if (!key) return;

      const store = this.ensureSelectionMemory();
      const normalizedOptions = this.cloneSelectionOptions(item_options);
      const normalizedNotes = notes || "";

      store.set(key, {
        options: this.cloneSelectionOptions(normalizedOptions),
        notes: normalizedNotes,
      });

      const templateKey = this.resolveTemplateKey(item);
      if (templateKey && templateKey !== key) {
        store.set(templateKey, {
          options: this.cloneSelectionOptions(normalizedOptions),
          notes: normalizedNotes,
          preferred_item: key,
        });
      }
    },

    getRememberedSelection: function (key) {
      if (!key) return null;
      const store = this.ensureSelectionMemory();
      return store.get(key) || null;
    },

    formatItemOptions: function (options) {
      const parts = [];
      if (options.variant) {
        const variantName = typeof options.variant === "object"
          ? options.variant.name || options.variant.label || options.variant.value
          : options.variant;
        if (variantName) parts.push(`Variant: ${variantName}`);
      }
      if (options.size) parts.push(`Size: ${options.size.name}`);
      if (options.spice) parts.push(`Spice: ${options.spice.name}`);
      if (options.toppings?.length) parts.push(`Toppings: ${options.toppings.map((t) => t.name).join(", ")}`);
      return parts.join(" | ");
    },

    formatReceiptItemOptions: function (options) {
      if (!options) return "";

      let data = options;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (error) {
          return data.trim ? data.trim() : data;
        }
      }

      if (typeof data === "object" && data !== null) {
        return this.formatItemOptions(data).trim();
      }

      return String(data).trim();
    },

    updateCartItemQuantity: function (index, newQty) {
      console.log("📝 updateCartItemQuantity called");
      console.log("   Index:", index);
      console.log("   New Qty:", newQty);
      
      // Validasi index
      if (index < 0 || index >= this.cart.length) {
        console.error("❌ Invalid cart index:", index);
        return;
      }
    
      // Validasi & normalize quantity
      const normalizedQty = parseInt(newQty, 10);
      console.log("   Normalized Qty:", normalizedQty);
      
      // Jika quantity tidak valid atau < 1, hapus item
      if (!Number.isFinite(normalizedQty) || normalizedQty < 1) {
        console.log("   ⚠️ Qty < 1, removing item");
        return this.removeCartItem(index);
      }
    
      // Get cart item
      const cartItem = this.cart[index];
      console.log("   Before update:", {
        name: cartItem.item_name,
        qty: cartItem.qty,
        rate: cartItem.rate,
        amount: cartItem.amount
      });
      
      // Update quantity dan amount
      cartItem.qty = normalizedQty;
      cartItem.amount = cartItem.rate * normalizedQty;
      
      console.log("   After update:", {
        name: cartItem.item_name,
        qty: cartItem.qty,
        rate: cartItem.rate,
        amount: cartItem.amount
      });
      console.log("   ✅ Item updated successfully");
      
      // Re-render cart dan update totals
      this.renderCart();
      this.updateCartTotals();
    },

    removeCartItem: function (index) {
      console.log("🗑️ removeCartItem called, index:", index);
      
      if (index < 0 || index >= this.cart.length) {
        console.error("❌ Invalid cart index:", index);
        return;
      }
    
      const removedItem = this.cart[index];
      console.log("   Removing:", removedItem.item_name);
      
      this.cart.splice(index, 1);
      console.log("   ✅ Item removed, new cart length:", this.cart.length);
      
      this.renderCart();
      this.updateCartTotals();
    },

    clearCart: function () {
      if (!this.cart.length) return;
      if (confirm("Are you sure you want to clear your order?")) {
        this.cart = [];
        this.renderCart();
        this.updateCartTotals();
        this.customerInfo = {
          name: "",
          gender: "",
          phone: "",
          age: "",
          customerId: null,
        };
        this.needsCustomerInfo = true;
        this.resetCustomerForm();
        this.renderCustomerSearchResults([]);
        this.setCustomerSearchStatus("");
      }
    },

    showCustomerInfoError: function (message) {
      const el = this.elements.customerError;
      if (el) {
        el.textContent = message || "";
        el.classList.remove("hidden");
      } else if (message) {
        frappe.msgprint({
          title: __("Validation"),
          message,
          indicator: "orange",
        });
      }
    },

    clearCustomerInfoError: function () {
      const el = this.elements.customerError;
      if (el) {
        el.textContent = "";
        el.classList.add("hidden");
      }
    },

    populateCustomerForm: function () {
      const info = this.customerInfo || {};
      if (this.elements.customerNameInput)
        this.elements.customerNameInput.value = info.name || "";
      if (this.elements.customerGenderSelect)
        this.elements.customerGenderSelect.value = info.gender || "";
      if (this.elements.customerIdentificationSelect)
        this.elements.customerIdentificationSelect.value =
          info.customer_identification || "";
      if (this.elements.customerPhoneInput)
        this.elements.customerPhoneInput.value = info.phone || "";
      if (this.elements.customerAgeInput) {
        const ageValue =
          info && Object.prototype.hasOwnProperty.call(info, "age")
            ? info.age
            : "";
        const normalized =
          ageValue === 0
            ? "0"
            : ageValue !== undefined && ageValue !== null && ageValue !== ""
            ? String(ageValue)
            : "";
        this.elements.customerAgeInput.value = normalized;
      }
    },

    resetCustomerForm: function () {
      if (this.elements.customerForm) {
        this.elements.customerForm.reset();
      }
      if (this.elements.customerNameInput)
        this.elements.customerNameInput.value = "";
      if (this.elements.customerPhoneInput)
        this.elements.customerPhoneInput.value = "";
      if (this.elements.customerAgeInput)
        this.elements.customerAgeInput.value = "";
      if (this.elements.customerGenderSelect)
        this.elements.customerGenderSelect.value = "";
      if (this.elements.customerIdentificationSelect)
        this.elements.customerIdentificationSelect.value = "";
      this.renderCustomerSearchResults([]);
      this.setCustomerSearchStatus("");
      this.clearCustomerInfoError();
    },

    setCustomerSearchStatus: function (message, isError = false) {
      const el = this.elements.customerSearchStatus;
      if (!el) return;

      el.textContent = message || "";
      el.classList.toggle("error", Boolean(isError && message));
      el.classList.toggle("hidden", !message);
    },

    renderCustomerSearchResults: function (results) {
      const container = this.elements.customerSearchResults;
      if (!container) return;

      container.innerHTML = "";
      const hasResults = Array.isArray(results) && results.length > 0;
      container.classList.toggle("hidden", !hasResults);

      if (!hasResults) return;

      results.forEach((customer) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "customer-result";
        button.dataset.customerId = customer.customer;
        button.textContent = `${customer.customer_name || customer.customer} — ${
          customer.phone || customer.mobile_no || customer.mobile || ""
        }`;
        button.addEventListener("click", () => this.applyCustomerSelection(customer));
        container.appendChild(button);
      });
    },

    applyCustomerSelection: function (customerPayload) {
      if (!customerPayload) return;

      const currentInfo = this.customerInfo || {};
      this.customerInfo = {
        ...currentInfo,
        name:
          customerPayload.customer_name ||
          customerPayload.name ||
          currentInfo.name ||
          "",
        phone:
          customerPayload.phone ||
          customerPayload.mobile_no ||
          this.elements.customerPhoneInput?.value ||
          currentInfo.phone ||
          "",
        customerId: customerPayload.customer || customerPayload.name || null,
      };

      this.populateCustomerForm();
      this.setCustomerSearchStatus(
        __("Using existing customer: {0}", [this.customerInfo.name || "-"])
      );
    },

    searchCustomerByPhone: async function () {
      if (this.customerSearchLoading) return;

      const phone = (this.elements.customerPhoneInput?.value || "").trim();
      if (!phone) {
        this.showCustomerInfoError(
          __("Please enter a phone number to search for a customer."),
        );
        this.elements.customerPhoneInput?.focus();
        return;
      }

      this.customerSearchLoading = true;
      this.elements.customerSearchBtn?.setAttribute("disabled", "disabled");
      this.setCustomerSearchStatus(__("Searching for customer..."));
      this.clearCustomerInfoError();

      try {
        const { message: results } = await frappe.call({
          method: "imogi_pos.api.customers.find_customer_by_phone",
          args: { phone },
        });

        const matches = Array.isArray(results) ? results : [];
        this.customerSearchResults = matches;
        this.renderCustomerSearchResults(matches);

        if (!matches.length) {
          this.setCustomerSearchStatus(
            __("No matching customer found. A new customer will be created when you save."),
          );
          return;
        }

        this.setCustomerSearchStatus(
          __("Found {0} matching customer(s).", [matches.length]),
        );
      } catch (error) {
        console.error("Failed to search customer", error);
        this.setCustomerSearchStatus("", false);
        this.showCustomerInfoError(
          __("Unable to search customer. Please try again."),
        );
      } finally {
        this.customerSearchLoading = false;
        this.elements.customerSearchBtn?.removeAttribute("disabled");
      }
    },

    openCustomerModal: function () {
      this.populateCustomerForm();
      this.clearCustomerInfoError();
      if (this.elements.customerModal)
        this.elements.customerModal.style.display = "flex";
      requestAnimationFrame(() => {
        this.elements.customerNameInput?.focus();
      });
    },

    closeCustomerModal: function () {
      this.clearCustomerInfoError();
      if (this.elements.customerModal)
        this.elements.customerModal.style.display = "none";
    },

    ensureCustomerRecord: async function ({ name, phone }) {
      if (this.customerInfo?.customerId) return this.customerInfo.customerId;
      if (!phone) return null;

      const customerName =
        (typeof name === "string" && name.trim()) || __("Guest Customer");

      try {
        const { message: results } = await frappe.call({
          method: "imogi_pos.api.customers.find_customer_by_phone",
          args: { phone },
        });

        const matches = Array.isArray(results) ? results : [];
        if (matches.length) {
          const selected = matches[0];
          this.applyCustomerSelection(selected);
          this.renderCustomerSearchResults(matches);
          return selected.customer;
        }

        const { message: created } = await frappe.call({
          method: "imogi_pos.api.customers.quick_create_customer_with_contact",
          args: {
            customer_name: customerName,
            mobile_no: phone,
          },
        });

        if (created?.success && created.customer) {
          this.applyCustomerSelection(created.customer);
          this.renderCustomerSearchResults([]);
          return created.customer.customer;
        }

        if (created?.customer?.customer) {
          this.applyCustomerSelection(created.customer);
          return created.customer.customer;
        }

        throw new Error(created?.message || "Unable to create customer");
      } catch (error) {
        console.error("Failed to resolve customer", error);
        throw error;
      }
    },

    submitCustomerInfo: async function () {
      const name = (this.elements.customerNameInput?.value || "").trim();
      const gender = (this.elements.customerGenderSelect?.value || "").trim();
      const phone = (this.elements.customerPhoneInput?.value || "").trim();
      const ageRange = (this.elements.customerAgeInput?.value || "").trim();
      const identification =
        (this.elements.customerIdentificationSelect?.value || "").trim();

      this.clearCustomerInfoError();

      if (!gender) {
        this.showCustomerInfoError(
          __("Please select the customer's gender before continuing."),
        );
        this.elements.customerGenderSelect?.focus();
        return;
      }

      if (ageRange === "") {
        this.showCustomerInfoError(
          __("Please select the customer's age range before continuing."),
        );
        this.elements.customerAgeInput?.focus();
        return;
      }

      this.customerInfo = {
        gender,
        phone,
        age: ageRange,
        customerId: this.customerInfo?.customerId || null,
      };

      if (name) {
        this.customerInfo.name = name;
      }

      if (identification) {
        this.customerInfo.customer_identification = identification;
      }

      try {
        const customerId = await this.ensureCustomerRecord({ name, phone });
        if (customerId) {
          this.customerInfo.customerId = customerId;
        }
      } catch (error) {
        this.showCustomerInfoError(
          __("Failed to prepare customer record. Please try again."),
        );
        return;
      }

      this.needsCustomerInfo = false;
      this.closeCustomerModal();
      this.openPaymentModal();
    },

    skipCustomerInfo: function () {
      this.clearCustomerInfoError();
      this.closeCustomerModal();
    },

    handleCheckout: async function () {
      if (!this.cart.length) return;
      if (!(await this.ensureTableNumber())) return;
      if (this.needsCustomerInfo) {
        this.openCustomerModal();
        return;
      }
      this.openPaymentModal();
    },

    openPaymentModal: function () {
      const totals = this.calculateTotals();
      if (this.elements.paymentAmount)
        this.elements.paymentAmount.textContent = `${formatRupiah(totals.total)}`;

      // Reset cash fields
      this.cashAmount = 0;
      if (this.elements.cashAmount) this.elements.cashAmount.value = `${formatRupiah(0)}`;
      if (this.elements.changeAmount) this.elements.changeAmount.textContent = `${formatRupiah(0)}`;

      // Default method
      const mode = PAYMENT_SETTINGS?.payment_mode || "Mixed";
      if (mode === "Cash Only") this.paymentMethod = "cash";
      else if (PAYMENT_SETTINGS?.gateway_enabled) this.paymentMethod = "qr_code";
      else this.paymentMethod = "cash";

      this.togglePaymentMethod();

      if (this.elements.paymentModal) this.elements.paymentModal.style.display = "flex";

      if (this.paymentMethod === "qr_code" && PAYMENT_SETTINGS?.gateway_enabled) {
        this.requestPaymentQR();
      }
    },

    togglePaymentMethod: function () {
      const totals = this.calculateTotals();

      if (this.paymentMethod === "qr_code") {
        this.elements.paymentQrSection?.classList.remove("hidden");
        this.elements.paymentCashSection?.classList.add("hidden");
        if (this.elements.paymentConfirmBtn)
          this.elements.paymentConfirmBtn.disabled = !!PAYMENT_SETTINGS?.gateway_enabled;
      } else {
        this.elements.paymentQrSection?.classList.add("hidden");
        this.elements.paymentCashSection?.classList.remove("hidden");
        if (this.elements.paymentConfirmBtn)
          this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
      }
    },

    ensureTableNumber: async function () {
      if (this.orderType === "Dine-in" && !this.tableNumber) {
        try {
          const { message } = await frappe.call({
            method: "imogi_pos.api.orders.get_next_available_table",
            args: { branch: CURRENT_BRANCH },
          });
          this.tableNumber = message;
          frappe.msgprint({
            title: __("Table Assigned"),
            message: __("Please proceed to table {0}", [message]),
            indicator: "green",
          });
        } catch (e) {
          frappe.msgprint({
            title: __("No Table Available"),
            message:
              e.message ||
              __("All tables are currently occupied. Please wait for a table to become available."),
            indicator: "orange",
          });
          return false;
        }
      }
      return true;
    },

    requestPaymentQR: async function () {
      this.showLoading("Generating payment QR code...");
      try {
        // 1) Create POS Order
        const totals = this.calculateTotals();
        const resolvedCustomer =
          this.customerInfo?.customerId || "Walk-in Customer";

        const orderArgs = {
          order_type: "POS",
          service_type: this.orderType,
          branch: CURRENT_BRANCH,
          pos_profile: POS_PROFILE.name,
          customer: resolvedCustomer,
          items: this.cart,
          selling_price_list:
            this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
          discount_amount: totals.discountAmount,
          discount_percent: totals.discountPercent,
          promo_code: totals.promoCode,
        };
        if (this.tableNumber) orderArgs.table = this.tableNumber;

        const collectedInfo = collectCustomerInfo();
        if (collectedInfo) {
          this.customerInfo = { ...this.customerInfo, ...collectedInfo };
        }
        const infoPayload = { ...this.customerInfo };
        delete infoPayload.customerId;
        if (Object.keys(infoPayload).length) {
          orderArgs.customer_info = { ...infoPayload };
        }

        const orderResp = await frappe.call({
          method: "imogi_pos.api.orders.create_order",
          args: orderArgs,
        });
        if (!orderResp.message) throw new Error("Failed to create order");

        this.posOrder = orderResp.message.name;
        let orderDetails = orderResp.message;
        try {
          const { message: refreshed } = await frappe.call({
            method: "frappe.client.get",
            args: { doctype: "POS Order", name: this.posOrder },
          });
          if (refreshed) orderDetails = refreshed;
        } catch (orderError) {
          console.error("Failed to refresh POS Order before invoicing:", orderError);
        }

        this.queueNumber = orderDetails.queue_number || orderResp.message.queue_number;
        const orderItems = Array.isArray(orderDetails.items) && orderDetails.items.length
          ? orderDetails.items
          : orderResp.message.items || [];
        this.itemRows = orderItems.map((it) => it.name);
        this.latestOrderDetails = orderDetails;

        // 2) Create draft invoice
        const invoiceArgs = {
          pos_order: this.posOrder,
          pos_profile: POS_PROFILE.name,
          mode_of_payment: "Online",
          amount: totals.total,
          discount_amount: totals.discountAmount,
          discount_percent: totals.discountPercent,
          promo_code: totals.promoCode,
        };
        if (this.tableNumber) invoiceArgs.table = this.tableNumber;
        if (infoPayload) {
          invoiceArgs.customer_info = { ...infoPayload };
        }

        const invoiceResp = await frappe.call({
          method: "imogi_pos.api.billing.generate_invoice",
          args: invoiceArgs,
        });
        if (!invoiceResp.message) throw new Error("Failed to create invoice");

        const invoice = invoiceResp.message;
        this.invoiceName = invoice.name;
        this.latestInvoiceDetails = invoice;

        // 3) Request payment
        const payResp = await frappe.call({
          method: "imogi_pos.api.billing.request_payment",
          args: { sales_invoice: invoice.name },
        });
        if (!payResp.message) throw new Error("Failed to create payment request");

        this.paymentRequest = { ...payResp.message, invoice: invoice.name };

        // Render QR
        if (this.paymentRequest.qr_image) {
          this.elements.paymentQr.innerHTML = `<img src="${this.paymentRequest.qr_image}" alt="Payment QR Code">`;
        } else if (this.paymentRequest.payment_url) {
          this.elements.paymentQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
            this.paymentRequest.payment_url
          )}" alt="Payment QR Code">`;
        }

        // Countdown & polling
        this.startPaymentCountdown();
        if (!frappe.realtime) this.pollPaymentStatus();
      } catch (error) {
        if (error?.message?.includes("already occupied")) {
          this.hideLoading();
          frappe.msgprint({ title: __("Table In Use"), message: error.message, indicator: "red" });
          return;
        }
        console.error("Error requesting payment:", error);
        this.showError("Failed to generate payment QR. Please try another payment method.");
        this.paymentMethod = "cash";
        this.togglePaymentMethod();
        // Update UI selection
        const paymentOptions = document.querySelectorAll("button.payment-option");
        paymentOptions.forEach((o) => o.classList.remove("selected"));
        document.querySelector('button.payment-option[data-method="cash"]')?.classList.add("selected");
        this.latestOrderDetails = null;
        this.latestInvoiceDetails = null;
        this.invoiceName = null;
      } finally {
        this.hideLoading();
      }
    },

    startPaymentCountdown: function () {
      if (this.paymentTimer) clearInterval(this.paymentTimer);
      this.paymentCountdown = PAYMENT_SETTINGS?.payment_timeout || 300;
      this.updateCountdownDisplay();
      this.paymentTimer = setInterval(() => {
        this.paymentCountdown--;
        this.updateCountdownDisplay();
        if (this.paymentCountdown <= 0) {
          clearInterval(this.paymentTimer);
          this.handlePaymentExpired();
        }
      }, 1000);
    },

    updateCountdownDisplay: function () {
      const m = Math.floor(this.paymentCountdown / 60);
      const s = this.paymentCountdown % 60;
      if (this.elements.paymentCountdown)
        this.elements.paymentCountdown.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    },

    pollPaymentStatus: function () {
      if (!this.paymentRequest) return;
      const check = () => {
        frappe.call({
          method: "frappe.client.get",
          args: { doctype: "Payment Request", name: this.paymentRequest.name },
          callback: (r) => {
            const status = r.message?.status;
            if (status === "Paid") this.handlePaymentSuccess();
            else if (status === "Cancelled" || status === "Expired") this.handlePaymentExpired();
            else setTimeout(check, 5000);
          },
        });
      };
      setTimeout(check, 5000);
    },

    handlePaymentSuccess: function () {
      if (this.paymentTimer) clearInterval(this.paymentTimer);
      if (this.elements.paymentStatus) {
        this.elements.paymentStatus.className = "payment-status success";
        this.elements.paymentStatus.textContent = "Payment successful!";
      }
      setTimeout(() => {
        this.closePaymentModal();
        this.completeOrder();
      }, 2000);
    },

    handlePaymentExpired: function () {
      if (this.elements.paymentStatus) {
        this.elements.paymentStatus.className = "payment-status error";
        this.elements.paymentStatus.textContent = "Payment expired. Please try again.";
      }
      document.querySelector('button.payment-option[data-method="cash"]')?.click();
    },

    handleKeypadInput: function (value) {
      const totals = this.calculateTotals();
      if (value === "clear") this.cashAmount = 0;
      else this.cashAmount = this.cashAmount * 10 + parseInt(value, 10);

      if (this.elements.cashAmount) this.elements.cashAmount.value = `${formatRupiah(this.cashAmount)}`;
      const change = Math.max(0, this.cashAmount - totals.total);
      if (this.elements.changeAmount) this.elements.changeAmount.textContent = `${formatRupiah(change)}`;
      if (this.elements.paymentConfirmBtn)
        this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
    },

    cancelPayment: function () {
      if (this.paymentTimer) clearInterval(this.paymentTimer);
      if (this.paymentRequest) {
        frappe.call({
          method: "frappe.client.set_value",
          args: {
            doctype: "Payment Request",
            name: this.paymentRequest.name,
            fieldname: "status",
            value: "Cancelled",
          },
        });
        this.paymentRequest = null;
      }
      this.closePaymentModal();
    },

    closePaymentModal: function () {
      if (this.elements.paymentModal) this.elements.paymentModal.style.display = "none";
    },

    confirmPayment: function () {
      if (this.paymentMethod === "cash") this.completeOrder();
      else if (!PAYMENT_SETTINGS?.gateway_enabled) this.handlePaymentSuccess();
    },

    completeOrder: async function () {
      if (!(await this.ensureTableNumber())) return;
      this.showLoading("Completing your order...");
      try {
        let invoice;

        if (this.paymentRequest?.invoice) {
          invoice = { name: this.paymentRequest.invoice };
          this.invoiceName = invoice.name;
        } else {
          // Create order + invoice (cash)
          const totals = this.calculateTotals();
          const resolvedCustomer =
            this.customerInfo?.customerId || "Walk-in Customer";

          const orderArgs = {
            order_type: "POS",
            service_type: this.orderType,
            branch: CURRENT_BRANCH,
            pos_profile: POS_PROFILE.name,
            customer: resolvedCustomer,
            items: this.cart,
            selling_price_list:
              this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
            discount_amount: totals.discountAmount,
            discount_percent: totals.discountPercent,
            promo_code: totals.promoCode,
          };
          if (this.tableNumber) orderArgs.table = this.tableNumber;

          const collectedInfo = collectCustomerInfo();
          if (collectedInfo) {
            this.customerInfo = { ...this.customerInfo, ...collectedInfo };
          }
          const infoPayload = { ...this.customerInfo };
          delete infoPayload.customerId;
          if (Object.keys(infoPayload).length) {
            orderArgs.customer_info = { ...infoPayload };
          }

          const orderResp = await frappe.call({
            method: "imogi_pos.api.orders.create_order",
            args: orderArgs,
          });
          if (!orderResp.message) throw new Error("Failed to create order");

          this.posOrder = orderResp.message.name;
          let orderDetails = orderResp.message;
          try {
            const { message: refreshed } = await frappe.call({
              method: "frappe.client.get",
              args: { doctype: "POS Order", name: this.posOrder },
            });
            if (refreshed) orderDetails = refreshed;
          } catch (orderError) {
            console.error("Failed to refresh POS Order before invoicing:", orderError);
          }

          this.queueNumber = orderDetails.queue_number || orderResp.message.queue_number;
          const orderItems = Array.isArray(orderDetails.items) && orderDetails.items.length
            ? orderDetails.items
            : orderResp.message.items || [];
          this.itemRows = orderItems.map((it) => it.name);
          this.latestOrderDetails = orderDetails;

          const invoiceArgs = {
            pos_order: this.posOrder,
            pos_profile: POS_PROFILE.name,
            mode_of_payment: this.paymentMethod === "cash" ? "Cash" : "Online",
            amount: totals.total,
            discount_amount: totals.discountAmount,
            discount_percent: totals.discountPercent,
            promo_code: totals.promoCode,
          };
          if (this.tableNumber) invoiceArgs.table = this.tableNumber;
          if (infoPayload) {
            invoiceArgs.customer_info = { ...infoPayload };
          }

          const invResp = await frappe.call({
            method: "imogi_pos.api.billing.generate_invoice",
            args: invoiceArgs,
          });
          if (!invResp.message) throw new Error("Failed to create invoice");
          invoice = invResp.message;
          this.invoiceName = invoice.name;
          this.latestInvoiceDetails = invoice;
        }

        // KOT (restaurant only)
        if (DOMAIN === "Restaurant") {
          await frappe.call({
            method: "imogi_pos.api.kot.send_items_to_kitchen",
            args: {
              pos_order: this.posOrder,
              item_rows: this.itemRows || [],
            },
          });
        }

        // Printing
        if (PRINT_SETTINGS?.print_receipt) await this.printReceipt(invoice.name);
        if (PRINT_SETTINGS?.print_queue_ticket) await this.printQueueTicket();

        await this.showSuccessModal();
      } catch (error) {
        if (error?.message?.includes("already occupied")) {
          frappe.msgprint({
            title: __("Table In Use"),
            message: error.message,
            indicator: "red",
          });
        } else {
          console.error("Error completing order:", error);
          this.showError("An error occurred while completing your order. Please contact staff for assistance.");
        }
      } finally {
        this.hideLoading();
      }
    },

    printReceipt: async function (invoiceName) {
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.printing.print_receipt",
          args: { sales_invoice: invoiceName },
        });
        if (!message?.success) console.error("Failed to print receipt:", message?.error);
      } catch (err) {
        console.error("Error printing receipt:", err);
      }
    },

    printQueueTicket: async function () {
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.printing.print_queue_ticket",
          args: {
            queue_no: this.queueNumber,
            pos_profile: POS_PROFILE.name,
          },
        });
        if (!message?.success) console.error("Error printing queue ticket:", message?.error);
      } catch (err) {
        console.error("Error printing queue ticket:", err);
      }
    },

    renderSuccessReceipt: async function () {
      const receiptEl = this.elements.successReceipt;
      const brandingEl = this.elements.successBranding;
      if (!receiptEl) {
        if (brandingEl) {
          brandingEl.classList.add("hidden");
          brandingEl.innerHTML = "";
        }
        return;
      }

      receiptEl.classList.remove("hidden");
      receiptEl.innerHTML = `<div class="success-receipt-loading">${__("Loading receipt...")}</div>`;

      const applyBranding = (html) => {
        if (!brandingEl) return;
        if (html) {
          brandingEl.innerHTML = html;
          brandingEl.classList.remove("hidden");
        } else {
          brandingEl.classList.add("hidden");
          brandingEl.innerHTML = "";
        }
      };

      const createOrderBranding =
        typeof BRANCH_INFO === "object" && BRANCH_INFO !== null ? BRANCH_INFO : null;
      const createOrderBranchName =
        createOrderBranding?.display_name ||
        createOrderBranding?.name ||
        (typeof CURRENT_BRANCH === "string" ? CURRENT_BRANCH : "");
      const createOrderBranchAddressRaw =
        createOrderBranding?.address && String(createOrderBranding.address).trim()
          ? String(createOrderBranding.address)
          : "";
      const createOrderLogoCandidate =
        typeof RECEIPT_LOGO === "string" ? RECEIPT_LOGO.trim() : "";
      const createOrderAddressSource =
        createOrderBranchAddressRaw || createOrderBranchName;
      const createOrderAddressHtml = createOrderAddressSource
        ? createOrderAddressSource
            .split(/\r?\n/)
            .map((line) => escapeHtml(line.trim()))
            .filter(Boolean)
            .join("<br>")
        : "";
      const createOrderHasLogo = Boolean(createOrderLogoCandidate);
      const createOrderHasName = Boolean(createOrderBranchName);
      const createOrderHasAddress = Boolean(createOrderAddressHtml);
      const createOrderBrandingHtml =
        createOrderHasLogo || createOrderHasName || createOrderHasAddress
          ? `
              ${
                createOrderHasLogo
                  ? `<img src="${createOrderLogoCandidate}" alt="${escapeHtml(
                      createOrderBranchName || "Logo"
                    )}" class="success-branding-logo">`
                  : ""
              }
              ${
                createOrderHasName || createOrderHasAddress
                    ? `<div class="success-branding-details">
                        ${
                            createOrderHasName
                                ? `<div class="success-branding-name">${escapeHtml(
                                      createOrderBranchName
                                  )}</div>`
                                : ""
                        }
                        ${
                            createOrderHasAddress
                                ? `<div class="success-branding-address">${createOrderAddressHtml}</div>`
                                : ""
                        }
                      </div>`
                  : ""
              }
            `.trim()
          : "";
      applyBranding(createOrderBrandingHtml);

      const createOrderToNumber = (value) => {
        const num = parseFloat(value);
        return Number.isFinite(num) ? num : 0;
      };

      let orderDetails = this.latestOrderDetails;
      const orderName = this.posOrder;
      if (!orderDetails && orderName) {
        try {
          const { message } = await frappe.call({
            method: "frappe.client.get",
            args: { doctype: "POS Order", name: orderName },
          });
          if (message) {
            orderDetails = message;
            this.latestOrderDetails = message;
          }
        } catch (error) {
          console.error("Failed to fetch POS Order details:", error);
        }
      }

      let invoiceDetails = this.latestInvoiceDetails;
      const invoiceName = this.invoiceName || this.paymentRequest?.invoice;
      if (!invoiceDetails && invoiceName) {
        try {
          const { message } = await frappe.call({
            method: "frappe.client.get",
            args: { doctype: "Sales Invoice", name: invoiceName },
          });
          if (message) {
            invoiceDetails = message;
            this.latestInvoiceDetails = message;
          }
        } catch (error) {
          console.error("Failed to fetch Sales Invoice details:", error);
        }
      }

      if (!orderDetails && !invoiceDetails) {
        receiptEl.innerHTML = `<div class="success-receipt-empty">${__("Unable to load receipt details.")}</div>`;
        return;
      }

      const createOrderOrderNumber =
        orderDetails?.queue_number ||
        orderDetails?.name ||
        invoiceDetails?.name ||
        this.queueNumber ||
        "-";

      const createOrderDateDisplay = formatReceiptDateTime(
        orderDetails,
        invoiceDetails
      );
      const createOrderCashierDisplay = getActiveCashierName();

      const createOrderItemsSource = Array.isArray(orderDetails?.items) && orderDetails.items.length
        ? orderDetails.items
        : Array.isArray(invoiceDetails?.items) && invoiceDetails.items.length
          ? invoiceDetails.items
          : [];

      const createOrderItemRows = createOrderItemsSource.length
        ? createOrderItemsSource
            .map((item) => {
              const createOrderQtyValue = createOrderToNumber(item.qty ?? item.quantity ?? 0);
              const createOrderQtyDisplay = Number.isInteger(createOrderQtyValue)
                ? createOrderQtyValue
                : createOrderQtyValue.toFixed(2);
              const createOrderAmountValue =
                item.amount != null
                  ? createOrderToNumber(item.amount)
                  : createOrderToNumber(item.rate) * createOrderQtyValue;
              const createOrderOptionsText = this.formatReceiptItemOptions(item.item_options);
              const createOrderOptionsHtml = createOrderOptionsText
                ? `<div class="success-receipt-item-options">${escapeHtml(createOrderOptionsText)}</div>`
                : "";

              return `
                <tr>
                  <td>
                    <div class="success-receipt-item-name">${escapeHtml(item.item_name || item.item_code || item.item || "")}</div>
                    ${createOrderOptionsHtml}
                  </td>
                  <td>${createOrderQtyDisplay}</td>
                  <td>${formatRupiah(createOrderAmountValue)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="3">${__("No items found")}</td></tr>`;

      const createOrderSubtotalValue = createOrderToNumber(
        orderDetails?.subtotal ??
          invoiceDetails?.total ??
          invoiceDetails?.base_total ??
          0
      );

      let createOrderPb1Value = orderDetails?.pb1_amount;
      if (createOrderPb1Value == null) {
        createOrderPb1Value = (invoiceDetails?.taxes || []).reduce(
          (sum, tax) =>
            sum +
            createOrderToNumber(
              tax?.tax_amount ?? tax?.base_tax_amount ?? 0
            ),
          0
        );
      }
      createOrderPb1Value = createOrderToNumber(createOrderPb1Value);

      const createOrderGrossTotal = createOrderSubtotalValue + createOrderPb1Value;
      const createOrderDiscountCandidates = [
        orderDetails?.discount_amount,
        orderDetails?.discount_value,
        invoiceDetails?.discount_amount,
        invoiceDetails?.base_discount_amount,
        invoiceDetails?.total_discount_amount,
      ];
      let createOrderDiscountValue = createOrderDiscountCandidates.reduce((max, candidate) => {
        const numeric = createOrderToNumber(candidate);
        return numeric > max ? numeric : max;
      }, 0);
      if (createOrderDiscountValue <= 0) {
        const createOrderPercentCandidates = [
          orderDetails?.discount_percent,
          orderDetails?.discount_percentage,
          invoiceDetails?.discount_percentage,
          invoiceDetails?.additional_discount_percentage,
        ];
        const createOrderAppliedPercent = createOrderPercentCandidates.reduce((max, candidate) => {
          const numeric = createOrderToNumber(candidate);
          return numeric > max ? numeric : max;
        }, 0);
        if (createOrderAppliedPercent > 0) {
          createOrderDiscountValue =
            createOrderGrossTotal * (createOrderAppliedPercent / 100);
        }
      }
      createOrderDiscountValue = Math.min(
        createOrderGrossTotal,
        Math.max(0, createOrderDiscountValue)
      );

      const createOrderDocTotal = createOrderToNumber(
        orderDetails?.totals ??
          invoiceDetails?.rounded_total ??
          invoiceDetails?.grand_total ??
          invoiceDetails?.total ??
          invoiceDetails?.base_grand_total ??
          0
      );
      const createOrderComputedTotal = Math.max(
        0,
        createOrderGrossTotal - createOrderDiscountValue
      );
      const createOrderTotalValue =
        createOrderDocTotal > 0
          ? Math.max(0, createOrderDocTotal)
          : createOrderComputedTotal;

      receiptEl.innerHTML = `
        <div class="success-receipt-card">
          <div class="success-receipt-header">
            <div class="success-receipt-title">${__("Receipt")}</div>
            <div class="success-receipt-meta">
              <div class="success-receipt-label">${__("Order No.")}</div>
              <div class="success-receipt-value">${escapeHtml(
                createOrderOrderNumber || "-"
              )}</div>
            </div>
            ${
              createOrderDateDisplay || createOrderCashierDisplay
                ? `<div class="success-receipt-meta-row">
                    ${
                      createOrderDateDisplay
                        ? `<div class="success-receipt-meta">
                            <div class="success-receipt-label">${__("Date")}</div>
                            <div class="success-receipt-value">${escapeHtml(
                              createOrderDateDisplay
                            )}</div>
                          </div>`
                        : ""
                    }
                    ${
                      createOrderCashierDisplay
                        ? `<div class="success-receipt-meta">
                            <div class="success-receipt-label">${__("Cashier")}</div>
                            <div class="success-receipt-value">${escapeHtml(
                              createOrderCashierDisplay
                            )}</div>
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </div>
          <table class="success-receipt-table">
            <thead>
              <tr>
                <th>${__("Item")}</th>
                <th>${__("Qty")}</th>
                <th>${__("Amount")}</th>
              </tr>
            </thead>
            <tbody>
              ${createOrderItemRows}
            </tbody>
          </table>
          <div class="success-receipt-summary">
            <div class="success-receipt-summary-row">
              <span>${__("Subtotal")}</span>
              <span>${formatRupiah(createOrderSubtotalValue)}</span>
            </div>
            <div class="success-receipt-summary-row">
              <span>${__("PB1")}</span>
              <span>${formatRupiah(createOrderPb1Value)}</span>
            </div>
            ${
              createOrderDiscountValue > 0
                ? `<div class="success-receipt-summary-row discount">
                    <span>${__("Discount")}</span>
                    <span>- ${formatRupiah(createOrderDiscountValue)}</span>
                  </div>`
                : ""
            }
            <div class="success-receipt-summary-row total">
              <span>${__("Total")}</span>
              <span>${formatRupiah(createOrderTotalValue)}</span>
            </div>
          </div>
        </div>
      `;
    },

    showSuccessModal: async function () {
      if (this.elements.successQueueNumber) this.elements.successQueueNumber.textContent = this.queueNumber;
      if (this.elements.successModal) this.elements.successModal.style.display = "flex";
      await this.renderSuccessReceipt();
      // (Tidak redirect ke /service-select)
    },

    closeSuccessModal: function () {
      if (this.elements.successModal) this.elements.successModal.style.display = "none";
      if (this.elements.successReceipt) {
        this.elements.successReceipt.classList.add("hidden");
        this.elements.successReceipt.innerHTML = "";
      }
      if (this.elements.successBranding) {
        this.elements.successBranding.classList.add("hidden");
        this.elements.successBranding.innerHTML = "";
      }
    },

    resetApp: function () {
      this.cart = [];
      this.renderCart();
      this.updateCartTotals();

      this.paymentRequest = null;
      this.cashAmount = 0;
      this.queueNumber = null;
      this.posOrder = null;
      this.invoiceName = null;
      this.itemRows = [];
      this.latestOrderDetails = null;
      this.latestInvoiceDetails = null;

      if (this.elements.searchInput) this.elements.searchInput.value = "";
      this.searchQuery = "";
      this.selectCategory("all");

      if (this.elements.successReceipt) {
        this.elements.successReceipt.innerHTML = "";
        this.elements.successReceipt.classList.add("hidden");
      }
      if (this.elements.successBranding) {
        this.elements.successBranding.innerHTML = "";
        this.elements.successBranding.classList.add("hidden");
      }

      this.customerInfo = {
        name: "",
        gender: "",
        phone: "",
        age: "",
        customerId: null,
      };
      this.needsCustomerInfo = true;
      this.resetCustomerForm();
      this.renderCustomerSearchResults([]);
      this.setCustomerSearchStatus("");
    },

    // ====== UTILS ======
    calculateTotals: function () {
      const subtotal = this.cart.reduce((sum, it) => sum + it.amount, 0);
      const tax = subtotal * this.taxRate;
      const gross = subtotal + tax;

      const quantity = this.cart.reduce(
        (sum, item) => sum + this.normalizeNumber(item.qty),
        0
      );
      this.discountState.cartQuantity = quantity;

      let discountAmount = 0;
      let discountPercent = 0;
      let discountLabel = "";
      let discountDescription = "";
      let discountSource = null;
      let promoCode = null;

      let autoPercent = 0;
      let autoAmount = 0;
      let autoDescription = "";
      if (this.allowDiscounts && quantity >= 5 && gross > 0) {
        autoPercent = 10;
        autoAmount = gross * 0.1;
        autoDescription = __(
          "Automatic 10% discount applied for 5 or more items."
        );
      }
      this.discountState.autoPercent = autoPercent;

      let promoAmount = 0;
      let promoPercent = 0;
      let promoLabel = "";
      let promoDescription = "";
      if (this.allowDiscounts && this.discountState.promo && gross > 0) {
        const promo = this.discountState.promo;
        promoLabel = promo.label || __("Promo {0}", [promo.code]);
        promoDescription = promo.description || promo.message || "";
        promoCode = promo.code || null;

        if (promo.discountType === "percent" && promo.percent > 0) {
          promoPercent = this.normalizeNumber(promo.percent);
          promoAmount = gross * (promoPercent / 100);
        } else if (promo.discountType === "amount" && promo.amount > 0) {
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
          discountLabel = promoLabel || __("Promo");
          discountDescription =
            promoDescription ||
            (promoPercent > 0
              ? __("{0}% discount applied.", [promoPercent])
              : __("Discount applied."));
          discountSource = "promo";
        } else if (autoAmount > 0) {
          discountAmount = autoAmount;
          discountPercent = autoPercent;
          discountLabel = __("Auto 10%");
          discountDescription = autoDescription;
          discountSource = "auto";
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

    setupPrintService: function () {
      if (window.ImogiPrintService) {
        ImogiPrintService.init({
          profile: POS_PROFILE_DATA,
          defaultInterface: "OS",
        });
      } else {
        console.error("Print service not available");
      }
    },

    setupRealtimeUpdates: function () {
      // Payment
      frappe.realtime.on("payment:pr:*", (data) => {
        if (!this.paymentRequest) return;
        if (data.payment_request !== this.paymentRequest.name) return;
        if (data.status === "Paid") this.handlePaymentSuccess();
        else if (data.status === "Expired" || data.status === "Cancelled") this.handlePaymentExpired();
      });

      // Stock
      frappe.realtime.on("stock_update", (data) => {
        if (!data || data.warehouse !== POS_PROFILE_DATA.warehouse) return;
        this.updateItemStock(
          data.item_code,
          data.actual_qty,
          data.is_component_shortage,
          data.component_low_stock
        );
      });

      const scheduleRealtimePriceRefresh = () => {
        if (!this.selectedPriceList) return;

        if (this.priceRefreshTimer) {
          clearTimeout(this.priceRefreshTimer);
        }

        this.priceRefreshTimer = setTimeout(() => {
          this.priceRefreshTimer = null;
          if (this.priceRefreshInFlight) {
            this.priceRefreshQueued = true;
            return;
          }

          const executeRefresh = async () => {
            this.priceRefreshInFlight = true;
            try {
              await this.refreshPricesForSelectedList();
            } catch (error) {
              console.error("Failed to refresh prices after realtime update:", error);
            } finally {
              this.priceRefreshInFlight = false;
              if (this.priceRefreshQueued) {
                this.priceRefreshQueued = false;
                scheduleRealtimePriceRefresh();
              }
            }
          };

          executeRefresh();
        }, 400);
      };

      frappe.realtime.on("item_price_update", (data = {}) => {
        if (!data || !data.price_list) return;
        if (data.price_list !== this.selectedPriceList) return;

        scheduleRealtimePriceRefresh();
      });

      // Fallback periodic refresh
      setInterval(() => this.refreshStockLevels(), 60000);
    },

    showLoading: function (message = "Loading...") {
      if (!this.elements.loadingOverlay || !this.elements.loadingText) return;
      this.elements.loadingText.textContent = message;
      this.elements.loadingOverlay.style.display = "flex";
    },

    hideLoading: function () {
      if (!this.elements.loadingOverlay) return;
      this.elements.loadingOverlay.style.display = "none";
    },

    showError: function (message) {
      alert(message);
    },
  };

  // ====== BACA PARAM URL (tanpa redirect) ======
  const params = new URLSearchParams(window.location.search);
  const serviceParam = params.get("service");
  const paramOrderType = normalizeOrderType(serviceParam);
  if (paramOrderType) KioskApp.orderType = paramOrderType;

  const tableParam = params.get("table");
  if (KioskApp.orderType !== "Dine-in") {
    KioskApp.tableNumber = null;
  } else if (tableParam) {
    KioskApp.tableNumber = tableParam;
  } else {
    KioskApp.tableNumber = null;
  }

  // GO
  KioskApp.init();
  }; // End init function

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(); // End IIFE
