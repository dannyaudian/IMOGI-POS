/* global frappe, __, POS_PROFILE, CURRENT_BRANCH, CURRENCY_SYMBOL, PAYMENT_SETTINGS, PRINT_SETTINGS, DOMAIN */

frappe.ready(async function () {
  "use strict";

  const POS_PROFILE_DATA = {};

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

    paymentRequest: null,
    paymentMethod: "cash",
    cashAmount: 0,
    paymentTimer: null,
    paymentCountdown: 300,

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

      // Success modal
      successModal: document.getElementById("success-modal"),
      successQueueNumber: document.getElementById("success-queue-number"),
      successReceipt: document.getElementById("success-receipt"),
      successDoneBtn: document.getElementById("btn-success-done"),

      // Loading overlay
      loadingOverlay: document.getElementById("loading-overlay"),
      loadingText: document.getElementById("loading-text"),
    },

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
      } catch (error) {
        console.error("Failed to validate promo code:", error);
        const message = error?.message || __("Failed to validate promo code. Please try again.");
        this.setPromoError(message);
      } finally {
        this.discountState.isApplying = false;
        this.updateCartTotals();
      }
    },

    removePromoCode: function () {
      if (!this.allowDiscounts) return;
      this.discountState.promo = null;
      this.discountState.error = null;
      if (this.elements.promoSelect) this.elements.promoSelect.value = "";
      this.hidePromoInput();
      this.updateCartTotals();
      this.refreshDiscountUI();
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
          },
        });

        if (message) {
          // Hanya template & standalone (bukan variant child)
          this.items = message.filter(
            (item) => !item.variant_of && hasValidMenuCategory(item.menu_category)
          );

          if (this.itemIndex && typeof this.itemIndex.clear === "function") {
            this.itemIndex.clear();
          } else {
            this.itemIndex = new Map();
          }

          this.items.forEach((item) => {
            item.has_explicit_price_list_rate = Number(
              item.has_explicit_price_list_rate
            )
              ? 1
              : 0;
            if (item.has_explicit_price_list_rate) {
              item._explicit_standard_rate = this.normalizeNumber(item.standard_rate);
            } else {
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

          this.filteredItems = [...this.items];

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
      }

      const targetItems = force ? this.items : this.items.filter((it) => !it.standard_rate);
      if (!targetItems.length) {
        this.applyPriceAdjustmentToItems(this.items);
        return;
      }
      try {
        const { message } = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "Item Price",
            filters: {
              item_code: ["in", targetItems.map((it) => it.name)],
              price_list: priceList,
            },
            fields: ["item_code", "price_list_rate"],
            limit_page_length: targetItems.length,
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
          },
        });
        const variants = (message && message.variants) || [];
        return this.applyPriceAdjustmentToVariants(variants);
      } catch (err) {
        console.error("Error loading variants:", err);
        this.showError("Failed to load variants. Please try again.");
        return [];
      } finally {
        this.hideLoading();
      }
    },

    // ====== RENDER ======
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
          "/assets/erpnext/images/default-product-image.png";
        const isSoldOut = this.isItemSoldOut(item);
        const cardClasses = ["item-card"];
        if (isSoldOut) cardClasses.push("sold-out");

        html += `
          <div class="${cardClasses.join(" ")}" data-item="${item.name}" aria-disabled="${
          isSoldOut ? "true" : "false"
        }">
            <div class="item-image" style="background-image: url('${imageUrl}')"></div>
            <div class="item-info">
              <div class="item-name">${item.item_name}</div>
              <div class="item-price">${formatRupiah(item.standard_rate || 0)}</div>
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
        if (item) this.updateItemStock(item.name, item.actual_qty, item.is_component_shortage);
      });
    },

    renderCart: function () {
      if (!this.elements.cartItems) return;

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

      let html = "";
      this.cart.forEach((item, index) => {
        html += `
          <div class="cart-item" data-index="${index}">
            <div class="cart-item-header">
              <div class="cart-item-name">${item.item_name}</div>
              <div class="cart-item-price">${formatRupiah(item.amount)}</div>
            </div>
            <div class="cart-item-controls">
              <button class="qty-btn qty-minus" data-index="${index}">-</button>
              <input type="number" class="cart-item-qty" value="${item.qty}" min="1" data-index="${index}">
              <button class="qty-btn qty-plus" data-index="${index}">+</button>
            </div>
            ${item.item_options ? `<div class="cart-item-options">${this.formatItemOptions(item.item_options)}</div>` : ""}
            ${item.notes ? `<div class="cart-item-notes">${item.notes}</div>` : ""}
            <div class="cart-item-remove" data-index="${index}">&times;</div>
          </div>`;
      });

      this.elements.cartItems.innerHTML = html;

      // Quantity & remove handlers
      this.elements.cartItems.addEventListener("click", (e) => {
        const index = Number(e.target.dataset.index);
        if (Number.isNaN(index)) return;

        if (e.target.classList.contains("qty-plus")) {
          e.preventDefault();
          this.updateCartItemQuantity(index, this.cart[index].qty + 1);
        } else if (e.target.classList.contains("qty-minus")) {
          e.preventDefault();
          this.updateCartItemQuantity(index, this.cart[index].qty - 1);
        } else if (e.target.classList.contains("cart-item-remove")) {
          this.removeCartItem(index);
        }
      });

      const qtyInputs = this.elements.cartItems.querySelectorAll(".cart-item-qty");
      qtyInputs.forEach((input) => {
        input.addEventListener("change", () => {
          const idx = parseInt(input.dataset.index, 10);
          this.updateCartItemQuantity(idx, parseInt(input.value, 10) || 1);
        });
      });

      if (this.elements.checkoutBtn) this.elements.checkoutBtn.disabled = false;
      if (this.elements.clearBtn) this.elements.clearBtn.disabled = false;
      if (this.allowDiscounts) {
        this.refreshDiscountUI();
      }
    },

    renderVariants: function (variants) {
      if (!this.elements.variantGrid) return;

      if (!variants || variants.length === 0) {
        this.elements.variantGrid.innerHTML = `
          <div class="empty-variants">
            <p>No variants available for this item</p>
          </div>`;
        return;
      }

      let html = "";
      variants.forEach((variant) => {
        const attributes = variant.attributes || {};
        const attrs = Object.keys(attributes)
          .map(
            (k) => `
          <div class="variant-attribute">
            <span>${k}:</span><span>${attributes[k]}</span>
          </div>`
          )
          .join("");

        html += `
          <div class="variant-card" data-variant="${variant.name}">
            <div class="variant-name">${variant.item_name}</div>
            <div class="variant-price">${formatRupiah(variant.standard_rate || 0)}</div>
            ${attrs ? `<div class="variant-attributes">${attrs}</div>` : ""}
          </div>`;
      });

      this.elements.variantGrid.innerHTML = html;

      const cards = this.elements.variantGrid.querySelectorAll(".variant-card");
      cards.forEach((card) => {
        card.addEventListener("click", () => {
          cards.forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          const variantName = card.dataset.variant;
          this.selectedVariant = variants.find((v) => v.name === variantName);
          if (this.elements.variantAddBtn) this.elements.variantAddBtn.disabled = false;
        });
      });
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
    },

    isItemSoldOut: function (item, actualQty, isComponentShortage) {
      if (!item && actualQty == null && typeof isComponentShortage === "undefined") return false;

      const qtySource = actualQty != null ? Number(actualQty) : Number(item?.actual_qty);
      const qty = Number.isFinite(qtySource) ? qtySource : null;
      const shortageFlag =
        typeof isComponentShortage !== "undefined"
          ? Boolean(isComponentShortage)
          : Boolean(item?.is_component_shortage);

      return Boolean(shortageFlag) || (qty !== null && qty <= 0);
    },

    updateItemStock: function (itemCode, actualQty, isComponentShortage) {
      const item = this.items.find((i) => i.name === itemCode);
      if (item) {
        if (actualQty != null && actualQty !== undefined) {
          const parsedQty = Number(actualQty);
          item.actual_qty = Number.isFinite(parsedQty) ? parsedQty : item.actual_qty;
        }
        if (typeof isComponentShortage !== "undefined") {
          item.is_component_shortage = Boolean(isComponentShortage);
        }
      }

      const soldOut = this.isItemSoldOut(item, actualQty, isComponentShortage);
      const catalog = this.elements.catalogGrid;
      if (!catalog) return;

      const card = Array.from(catalog.querySelectorAll(".item-card")).find(
        (el) => el.dataset.item === itemCode
      );
      if (!card) return;

      card.classList.toggle("sold-out", soldOut);
      card.setAttribute("aria-disabled", soldOut ? "true" : "false");
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
          },
        });
        (message || []).forEach((u) =>
          this.updateItemStock(u.name, u.actual_qty, u.is_component_shortage)
        );
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

    addSelectedVariantToCart: function () {
      if (!this.selectedVariant) return;
      const notes = this.elements.itemNotes ? this.elements.itemNotes.value : "";
      this.closeVariantModal();
      this.openItemDetailModal(this.selectedVariant, notes);
    },

    openItemDetailModal: async function (item, notes = "") {
      this.selectedOptionItem = item;
      this.pendingNotes = notes || "";
      if (this.elements.itemDetailNotes)
        this.elements.itemDetailNotes.value = this.pendingNotes;

      const imageUrl =
        item.photo || item.image || "/assets/erpnext/images/default-product-image.png";
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

      this.showLoading("Loading options...");
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.items.get_item_options",
          args: { item: item.name },
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
        this.cart[existingIndex].qty += 1;
        this.cart[existingIndex]._base_rate = baseRate;
        this.cart[existingIndex]._extra_rate = extraRate;
        this.cart[existingIndex].rate = baseRate + extraRate;
        this.cart[existingIndex].amount = this.cart[existingIndex].rate * this.cart[existingIndex].qty;
        if (!this.cart[existingIndex].menu_category && resolvedCategory) {
          this.cart[existingIndex].menu_category = resolvedCategory;
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
      if (newQty < 1) return this.removeCartItem(index);
      this.cart[index].qty = newQty;
      this.cart[index].amount = this.cart[index].rate * newQty;
      this.renderCart();
      this.updateCartTotals();
    },

    removeCartItem: function (index) {
      this.cart.splice(index, 1);
      this.renderCart();
      this.updateCartTotals();
    },

    clearCart: function () {
      if (!this.cart.length) return;
      if (confirm("Are you sure you want to clear your order?")) {
        this.cart = [];
        this.renderCart();
        this.updateCartTotals();
      }
    },

    handleCheckout: async function () {
      if (!this.cart.length) return;
      if (!(await this.ensureTableNumber())) return;
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
        const orderArgs = {
          order_type: "POS",
          service_type: this.orderType,
          branch: CURRENT_BRANCH,
          pos_profile: POS_PROFILE.name,
          customer: "Walk-in Customer",
          items: this.cart,
          selling_price_list:
            this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
          discount_amount: totals.discountAmount,
          discount_percent: totals.discountPercent,
          promo_code: totals.promoCode,
        };
        if (this.tableNumber) orderArgs.table = this.tableNumber;

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
          const orderArgs = {
            order_type: "POS",
            service_type: this.orderType,
            branch: CURRENT_BRANCH,
            pos_profile: POS_PROFILE.name,
            customer: "Walk-in Customer",
            items: this.cart,
            selling_price_list:
              this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
            discount_amount: totals.discountAmount,
            discount_percent: totals.discountPercent,
            promo_code: totals.promoCode,
          };
          if (this.tableNumber) orderArgs.table = this.tableNumber;

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
      if (!receiptEl) return;

      receiptEl.classList.remove("hidden");
      receiptEl.innerHTML = `<div class="success-receipt-loading">${__("Loading receipt...")}</div>`;

      const toNumber = (value) => {
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

      const orderNumber =
        orderDetails?.queue_number ||
        orderDetails?.name ||
        invoiceDetails?.name ||
        this.queueNumber ||
        "-";

      const itemsSource = Array.isArray(orderDetails?.items) && orderDetails.items.length
        ? orderDetails.items
        : Array.isArray(invoiceDetails?.items) && invoiceDetails.items.length
          ? invoiceDetails.items
          : [];

      const itemRows = itemsSource.length
        ? itemsSource
            .map((item) => {
              const qtyValue = toNumber(item.qty ?? item.quantity ?? 0);
              const qtyDisplay = Number.isInteger(qtyValue) ? qtyValue : qtyValue.toFixed(2);
              const amountValue =
                item.amount != null
                  ? toNumber(item.amount)
                  : toNumber(item.rate) * qtyValue;
              const optionsText = this.formatReceiptItemOptions(item.item_options);
              const optionsHtml = optionsText
                ? `<div class="success-receipt-item-options">${escapeHtml(optionsText)}</div>`
                : "";

              return `
                <tr>
                  <td>
                    <div class="success-receipt-item-name">${escapeHtml(item.item_name || item.item_code || item.item || "")}</div>
                    ${optionsHtml}
                  </td>
                  <td>${qtyDisplay}</td>
                  <td>${formatRupiah(amountValue)}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="3">${__("No items found")}</td></tr>`;

      const subtotalValue = toNumber(
        orderDetails?.subtotal ??
          invoiceDetails?.total ??
          invoiceDetails?.base_total ??
          0
      );

      let pb1Value = orderDetails?.pb1_amount;
      if (pb1Value == null) {
        pb1Value = (invoiceDetails?.taxes || []).reduce(
          (sum, tax) => sum + toNumber(tax?.tax_amount ?? tax?.base_tax_amount ?? 0),
          0
        );
      }
      pb1Value = toNumber(pb1Value);

      const grossTotal = subtotalValue + pb1Value;
      const discountCandidates = [
        orderDetails?.discount_amount,
        orderDetails?.discount_value,
        invoiceDetails?.discount_amount,
        invoiceDetails?.base_discount_amount,
        invoiceDetails?.total_discount_amount,
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
          invoiceDetails?.additional_discount_percentage,
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

      receiptEl.innerHTML = `
        <div class="success-receipt-header">
          <div class="success-receipt-title">${__("Receipt")}</div>
          <div class="success-receipt-meta">
            <div class="success-receipt-label">${__("Order No.")}</div>
            <div class="success-receipt-value">${escapeHtml(orderNumber || "-")}</div>
          </div>
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
            ${itemRows}
          </tbody>
        </table>
        <div class="success-receipt-summary">
          <div class="success-receipt-summary-row">
            <span>${__("Subtotal")}</span>
            <span>${formatRupiah(subtotalValue)}</span>
          </div>
          <div class="success-receipt-summary-row">
            <span>${__("PB1")}</span>
            <span>${formatRupiah(pb1Value)}</span>
          </div>
          ${
            discountValue > 0
              ? `<div class="success-receipt-summary-row discount">
                  <span>${__("Discount")}</span>
                  <span>- ${formatRupiah(discountValue)}</span>
                </div>`
              : ""
          }
          <div class="success-receipt-summary-row total">
            <span>${__("Total")}</span>
            <span>${formatRupiah(totalValue)}</span>
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
      if (this.elements.successReceipt) this.elements.successReceipt.classList.add("hidden");
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
        this.updateItemStock(data.item_code, data.actual_qty, data.is_component_shortage);
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
});
