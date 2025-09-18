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
    discountPercent: 0,
    discountAmount: 0,
    priceLists: [],
    selectedPriceList: POS_PROFILE_DATA.selling_price_list || null,

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
      cartTotal: document.getElementById("cart-total"),
      discountPercentInput: document.getElementById("discount-percent-input"),
      discountAmountInput: document.getElementById("discount-amount-input"),
      checkoutBtn: document.getElementById("btn-checkout"),
      clearBtn: document.getElementById("btn-clear"),
      searchInput: document.getElementById("search-input"),
      categoriesContainer: document.getElementById("categories-container"),
      priceListSelect: document.getElementById("price-list-select"),

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

    // ====== INIT ======
    init: async function () {
      this.setupEventListeners();
      await this.loadPriceLists();
      await this.loadItems();
      this.renderCategories();
      await this.loadTaxTemplate();
      this.renderItems();
      this.updateCartTotals();
      this.syncDiscountInputs();
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

      this.elements.discountPercentInput?.addEventListener("input", (event) =>
        this.handleDiscountInput(event, "percent")
      );
      this.elements.discountAmountInput?.addEventListener("input", (event) =>
        this.handleDiscountInput(event, "amount")
      );

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
      });
    },

    // ====== LOAD DATA ======
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

      this.cart.forEach((item) => {
        const extra = this.getCartItemExtra(item);
        const baseRate = Object.prototype.hasOwnProperty.call(priceMap, item.item_code)
          ? priceMap[item.item_code]
          : typeof item._base_rate === "number"
            ? item._base_rate
            : (Number(item.rate) || 0) - extra;

        item._base_rate = Number.isFinite(baseRate) ? baseRate : 0;
        item.rate = item._base_rate + extra;
        item.amount = item.rate * item.qty;
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
          },
        });

        if (message) {
          // Hanya template & standalone (bukan variant child)
          this.items = message.filter((item) => !item.variant_of);
          this.filteredItems = [...this.items];

          // Lengkapi harga yang kosong
          await this.loadItemRates(!this.selectedPriceList);

          // Build kategori unik
          const set = new Set();
          this.items.forEach((it) => {
            const cat = it.menu_category || it.item_group;
            if (cat) set.add(cat);
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
      if (!priceList) return;
      const targetItems = force ? this.items : this.items.filter((it) => !it.standard_rate);
      if (!targetItems.length) return;
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
          const item = this.items.find((i) => i.name === row.item_code);
          if (item) item.standard_rate = row.price_list_rate;
        });
      } catch (err) {
        console.error("Error loading item rates:", err);
      }
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
            template_item: templateItem.name,
            price_list: this.selectedPriceList || null,
          },
        });
        return (message && message.variants) || [];
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

        html += `
          <div class="item-card" data-item="${item.name}">
            <div class="item-image" style="background-image: url('${imageUrl}')"></div>
            <div class="sold-out-badge">Sold Out</div>
            <div class="item-stock-pill"></div>
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
          if (card.classList.contains("sold-out")) return;
          const itemName = card.dataset.item;
          const item = this.items.find((i) => i.name === itemName);
          if (item) this.handleItemClick(item);
        });
      });

      // Apply sold-out state
      cards.forEach((card) => {
        const itemName = card.dataset.item;
        const item = this.items.find((i) => i.name === itemName);
        if (item) this.updateItemStock(item.name, item.actual_qty);
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
      if (this.elements.cartDiscount) this.elements.cartDiscount.textContent = formatRupiah(totals.discount);
      if (this.elements.cartTotal) this.elements.cartTotal.textContent = formatRupiah(totals.total);
      if (this.elements.paymentAmount)
        this.elements.paymentAmount.textContent = `${formatRupiah(totals.total)}`;

      if (this.elements.changeAmount)
        this.elements.changeAmount.textContent = `${formatRupiah(Math.max(0, this.cashAmount - totals.total))}`;

      if (this.elements.paymentConfirmBtn && this.paymentMethod === "cash") {
        this.elements.paymentConfirmBtn.disabled = this.cashAmount < totals.total;
      }
    },

    updateItemStock: function (itemCode, actualQty) {
      const item = this.items.find((i) => i.name === itemCode);
      if (item) item.actual_qty = actualQty;
      const card =
        this.elements.catalogGrid?.querySelector(`.item-card[data-item="${itemCode}"]`);
      if (!card) return;
      const stockPill = card.querySelector(".item-stock-pill");
      const numericQty = Number(actualQty);
      const hasNumericQty =
        actualQty !== null && actualQty !== undefined && !Number.isNaN(numericQty);
      let displayValue = "—";
      if (hasNumericQty) {
        if (Number.isInteger(numericQty)) {
          displayValue = `${numericQty}`;
        } else {
          displayValue = `${numericQty.toFixed(2).replace(/\.0+$/, "").replace(/\.([1-9])0$/, ".$1")}`;
        }
      }
      if (stockPill) {
        stockPill.textContent = displayValue;
        stockPill.classList.toggle("is-empty", hasNumericQty && numericQty <= 0);
        stockPill.classList.toggle("is-unknown", !hasNumericQty);
        stockPill.classList.toggle("is-available", hasNumericQty && numericQty > 0);
      }
      const isSoldOut = hasNumericQty && numericQty <= 0;
      card.classList.toggle("sold-out", isSoldOut);
      card.style.pointerEvents = isSoldOut ? "none" : "";
    },

    refreshStockLevels: async function () {
      try {
        const { message } = await frappe.call({
          method: "imogi_pos.api.variants.get_items_with_stock",
          args: {
            warehouse: POS_PROFILE_DATA.warehouse,
            limit: 500,
            pos_menu_profile: POS_PROFILE_DATA.pos_menu_profile || null,
          },
        });
        (message || []).forEach((u) => this.updateItemStock(u.name, u.actual_qty));
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

    handleDiscountInput: function (event, type) {
      if (!event?.target) return;
      const rawValue = event.target.value.replace(/,/g, ".").trim();
      if (rawValue === "") {
        if (type === "percent") this.discountPercent = 0;
        else this.discountAmount = 0;
        this.updateCartTotals();
        return;
      }

      if (!/^\d*\.?\d*$/.test(rawValue)) {
        const fallback = type === "percent" ? this.discountPercent : this.discountAmount;
        event.target.value = fallback ? `${fallback}` : "";
        return;
      }

      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        const fallback = type === "percent" ? this.discountPercent : this.discountAmount;
        event.target.value = fallback ? `${fallback}` : "";
        return;
      }

      const sanitized = Math.max(0, numericValue);
      if (type === "percent") this.discountPercent = sanitized;
      else this.discountAmount = sanitized;

      if (numericValue < 0) {
        event.target.value = sanitized ? `${sanitized}` : "0";
      }

      this.updateCartTotals();
    },

    handleItemClick: function (item) {
      if (item.has_variants) this.openVariantPicker(item);
      else this.openItemDetailModal(item);
    },

    openVariantPicker: async function (item) {
      this.selectedTemplateItem = item;
      this.selectedVariant = null;
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
      this.addItemToCart(this.selectedOptionItem, selectedOptions, this.pendingNotes);
      this.closeItemDetailModal();
    },

    addItemToCart: function (item, item_options = {}, notes = "") {
      if (!item) return;
      const baseRate = Number(item.standard_rate || 0);
      const extraRate = Number(item_options.extra_price || 0);
      const rate = baseRate + extraRate;
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
        const { discountPercent, discountAmount } = this.getNormalizedDiscounts();
        const orderArgs = {
          order_type: "Kiosk",
          service_type: this.orderType,
          branch: CURRENT_BRANCH,
          pos_profile: POS_PROFILE.name,
          customer: "Walk-in Customer",
          items: this.cart,
          selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
          discount_amount: discountAmount,
          discount_percent: discountPercent,
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
        const totals = this.calculateTotals();
        const invoiceArgs = {
          pos_order: this.posOrder,
          pos_profile: POS_PROFILE.name,
          mode_of_payment: "Online",
          amount: totals.total,
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
          const { discountPercent, discountAmount } = this.getNormalizedDiscounts();
          const orderArgs = {
            order_type: "Kiosk",
            service_type: this.orderType,
            branch: CURRENT_BRANCH,
            pos_profile: POS_PROFILE.name,
            customer: "Walk-in Customer",
            items: this.cart,
            selling_price_list: this.selectedPriceList || POS_PROFILE_DATA.selling_price_list || null,
            discount_amount: discountAmount,
            discount_percent: discountPercent,
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

          const totals = this.calculateTotals();
          const invoiceArgs = {
            pos_order: this.posOrder,
            pos_profile: POS_PROFILE.name,
            mode_of_payment: this.paymentMethod === "cash" ? "Cash" : "Online",
            amount: totals.total,
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
      this.discountPercent = 0;
      this.discountAmount = 0;
      this.syncDiscountInputs();
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
    getNormalizedDiscounts: function () {
      const discountPercent = Number.isFinite(this.discountPercent)
        ? Math.max(0, this.discountPercent)
        : 0;
      const discountAmount = Number.isFinite(this.discountAmount)
        ? Math.max(0, this.discountAmount)
        : 0;

      if (!Number.isFinite(this.discountPercent)) this.discountPercent = 0;
      if (!Number.isFinite(this.discountAmount)) this.discountAmount = 0;

      return { discountPercent, discountAmount };
    },

    calculateTotals: function () {
      const subtotal = this.cart.reduce((sum, it) => sum + it.amount, 0);
      const tax = subtotal * this.taxRate;
      const grossTotal = subtotal + tax;
      const { discountPercent, discountAmount } = this.getNormalizedDiscounts();

      const percentDiscount = grossTotal * (discountPercent / 100);
      const combinedDiscount = percentDiscount + discountAmount;
      const discount = Math.min(grossTotal, Math.max(0, combinedDiscount));
      const total = Math.max(0, grossTotal - discount);
      return { subtotal, tax, discount, total };
    },

    syncDiscountInputs: function () {
      if (this.elements.discountPercentInput) {
        this.elements.discountPercentInput.value =
          this.discountPercent > 0 ? `${this.discountPercent}` : "0";
      }
      if (this.elements.discountAmountInput) {
        this.elements.discountAmountInput.value =
          this.discountAmount > 0 ? `${this.discountAmount}` : "0";
      }
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
        this.updateItemStock(data.item_code, data.actual_qty);
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
