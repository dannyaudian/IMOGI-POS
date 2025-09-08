// cashier-console/index.js
/* global frappe, __ */

frappe.ready(function () {
  // ====== Guard: context vars from Jinja ======
  const POS_PROFILE        = window.POS_PROFILE ?? null;
  const ACTIVE_POS_SESSION = window.ACTIVE_POS_SESSION ?? null;
  const CURRENT_BRANCH     = window.CURRENT_BRANCH ?? null;
  const CURRENCY_SYMBOL    = window.CURRENCY_SYMBOL ?? 'Rp';
  const DOMAIN             = window.DOMAIN ?? 'Restaurant';

  // ====== Early checks ======
  if (!POS_PROFILE) {
    frappe.msgprint(__('No POS Profile found. Please contact your administrator.'));
    // jangan return; biar UI tetep render, tapi tombol disabled
  }

  // ====== Element refs ======
  const orderList         = document.getElementById('order-list');
  const orderTabs         = document.querySelectorAll('.order-tab');
  const checkoutItems     = document.getElementById('checkout-items');
  const findCustomerBtn   = document.getElementById('find-customer');
  const customerNameEl    = document.getElementById('customer-name');
  const customerDetailsEl = document.getElementById('customer-details');
  const refreshOrdersBtn  = document.getElementById('refresh-orders');
  const createOrderBtn    = document.getElementById('create-order');
  const searchInput       = document.querySelector('.search-input'); // class di template

  // Checkout totals
  const subtotalEl        = document.getElementById('subtotal');
  const taxAmountEl       = document.getElementById('tax-amount');
  const discountAmountEl  = document.getElementById('discount-amount');
  const grandTotalEl      = document.getElementById('grand-total');

  // Actions
  const generateInvoiceBtn = document.getElementById('btn-generate-invoice');
  const requestPaymentBtn  = document.getElementById('btn-request-payment');
  const printBillBtn       = document.getElementById('btn-print-bill');
  const paymentModeSelect  = document.getElementById('payment-mode');

  // ====== State ======
  // Map label tab → nama state di DB (SAMAKAN dengan Workflow kamu)
  // Kalau state di DB beda, edit nilai kanan.
  const STATE_MAP = {
    'Ready'  : 'Ready',          // ubah ke 'Ready to Serve' jika begitu di DB
    'Served' : 'Served',
    'All'    : null
  };

  let currentTab     = 'Ready';
  let allOrders      = [];  // sumber asli
  let currentOrders  = [];  // hasil filter/pencarian
  let selectedOrder  = null;
  let selectedCustomer = null;
  let invoiceDoc     = null;
  let searchQuery    = '';

  // ====== Init ======
  init();

  function init() {
    setupEventListeners();
    initPrintService();
    setupRealtimeUpdates();
    loadOrders();
  }

  function setupEventListeners() {
    // Switch tabs
    orderTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        orderTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.status || 'All';
        loadOrders();
      });
    });

    refreshOrdersBtn?.addEventListener('click', loadOrders);
    createOrderBtn?.addEventListener('click', openCreateOrderDialog);
    findCustomerBtn?.addEventListener('click', openCustomerSearch);
    generateInvoiceBtn?.addEventListener('click', generateInvoice);
    requestPaymentBtn?.addEventListener('click', requestPayment);
    printBillBtn?.addEventListener('click', printBill);

    searchInput?.addEventListener('input', (e) => {
      searchQuery = (e.target.value || '').trim().toLowerCase();
      filterOrders();
    });
  }

  /* =========================
     Data loading & rendering
     ========================= */
  function loadOrders() {
    showLoading('Loading orders…');

    const args = {
      branch: CURRENT_BRANCH,
      pos_profile: POS_PROFILE
    };

    const wf = STATE_MAP[currentTab] ?? null;
    if (wf) args.workflow_state = wf; // hanya kirim kalau ada mappingnya

    console.debug('[loadOrders] args =', args);

    frappe.call({
      method: 'imogi_pos.api.billing.list_orders_for_cashier',
      args
    })
    .then((r) => {
      const payload = (r && r.message) || [];
      console.debug('[loadOrders] received', payload);
      allOrders = Array.isArray(payload) ? payload : [];
      applySearchTo(allOrders);
      renderOrders();
      // Reset selection jika order yang dipilih hilang
      if (selectedOrder && !currentOrders.find(o => o.name === selectedOrder.name)) {
        resetSelection();
      }
    })
    .fail((err) => {
      console.error('[loadOrders] error', err);
      showError('Failed to load orders');
      allOrders = [];
      currentOrders = [];
      renderOrders();
    })
    .always(hideLoading);
  }

  function applySearchTo(source) {
    if (!searchQuery) {
      currentOrders = source.slice(0);
      return;
    }
    currentOrders = source.filter(order => {
      const s = searchQuery;
      return (
        (order.name && order.name.toLowerCase().includes(s)) ||
        (order.table && String(order.table).toLowerCase().includes(s)) ||
        (order.customer_name && order.customer_name.toLowerCase().includes(s))
      );
    });
  }

  function filterOrders() {
    applySearchTo(allOrders);
    renderOrders();
  }

  function renderOrders() {
    if (!orderList) return;

    if (!currentOrders.length) {
      orderList.innerHTML = `
        <div class="empty-state">
          <p>No ${(currentTab || 'selected').toLowerCase()} orders found</p>
        </div>`;
      return;
    }

    const html = currentOrders.map(order => {
      const orderDate = order.creation ? new Date(order.creation) : null;
      const time = orderDate ? orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const amount = safeTotal(order);
      const itemsCount = (order.items && order.items.length) || 0;
      const isSelected = selectedOrder && selectedOrder.name === order.name;

      return `
        <div class="order-card ${isSelected ? 'selected' : ''}" data-order="${order.name}">
          <div class="order-meta">
            <span>${escapeHtml(order.name)}</span>
            <span>${escapeHtml(time)}</span>
          </div>
          <div class="order-info">
            <div>
              <strong>${escapeHtml(order.table ? 'Table ' + order.table : (order.order_type || ''))}</strong>
              ${(order.customer && order.customer !== 'Walk-in Customer')
                 ? ' • ' + escapeHtml(order.customer_name || order.customer)
                 : ''}
            </div>
            <div class="order-amount">${formatCurrency(amount)}</div>
          </div>
          <div class="order-items">
            ${itemsCount} item(s) • ${escapeHtml(order.workflow_state || '')}
          </div>
        </div>`;
    }).join('');

    orderList.innerHTML = html;

    // bind click
    orderList.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('click', () => {
        const orderName = card.dataset.order;
        selectOrder(orderName);
      });
    });
  }

  /* =========================
     Selection & checkout pane
     ========================= */
  function resetSelection() {
    selectedOrder = null;
    selectedCustomer = null;
    invoiceDoc = null;

    customerNameEl.textContent = __('Walk-in Customer');
    customerDetailsEl.innerHTML = '';
    checkoutItems.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>${__('Select an order to checkout')}</strong>
          <div style="font-size:12px;margin-top:4px">${__('Choose an item on the left to see details here.')}</div>
        </div>
      </div>`;

    subtotalEl.textContent = '0.00';
    taxAmountEl.textContent = '0.00';
    discountAmountEl.textContent = '0.00';
    grandTotalEl.textContent = '0.00';

    generateInvoiceBtn.disabled = true;
    requestPaymentBtn.disabled = true;
    printBillBtn.disabled = true;
  }

  function selectOrder(orderName) {
    const order = currentOrders.find(o => o.name === orderName);
    if (!order) return;

    selectedOrder = order;

    // UI highlight
    document.querySelectorAll('.order-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.order === orderName);
    });

    // Customer
    if (order.customer && order.customer !== 'Walk-in Customer') {
      customerNameEl.textContent = order.customer_name || order.customer;
      selectedCustomer = { name: order.customer, customer_name: order.customer_name };
      loadCustomerDetails(order.customer);
    } else {
      customerNameEl.textContent = __('Walk-in Customer');
      customerDetailsEl.innerHTML = '';
      selectedCustomer = null;
    }

    // Items & totals
    renderCheckoutItems(order);
    updateTotals(order);

    // Buttons
    generateInvoiceBtn.disabled = false;
    printBillBtn.disabled = false;
    invoiceDoc = null;
    requestPaymentBtn.disabled = true;
  }

    function renderCheckoutItems(order) {
      if (!checkoutItems) return;
      const html = (order.items || []).map(item => `
        <div class="checkout-item">
          ${item.image ? `<div class="item-image"><img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.item_name || item.item || '')}"></div>` : ''}
          <div class="item-details">
            <div class="item-name">${escapeHtml(item.item_name || item.item || '')}</div>
            ${item.notes ? `<div class="item-notes">${escapeHtml(item.notes)}</div>` : ''}
          </div>
          <div class="item-quantity-price">
            <span>${Number(item.qty || 0)}x</span>
            <span>${formatCurrency(Number(item.amount || item.net_amount || 0))}</span>
          </div>
        </div>
      `).join('');
      checkoutItems.innerHTML = html || '<div class="empty-state">No items</div>';
    }

  function updateTotals(order) {
    const subtotal  = Number(order.net_total || order.total || 0);
    const taxes     = Number(order.total_taxes_and_charges || 0);
    const discountAmt  = Number(order.discount_amount || 0);
    const discountPct  = Number(order.discount_percent || 0);
    const promoCode    = order.promo_code || '';
    const grand     = safeTotal(order);

    let discountText = formatCurrency(discountAmt);
    if (discountPct) discountText += ` (${discountPct}%)`;
    if (promoCode) discountText += ` [${promoCode}]`;

    subtotalEl.textContent = formatCurrency(subtotal);
    taxAmountEl.textContent = formatCurrency(taxes);
    discountAmountEl.textContent = discountText;
    grandTotalEl.textContent = formatCurrency(grand);
  }

  function safeTotal(order) {
    // fallback berurutan agar kompatibel berbagai backend
    return Number(
      order.totals ??
      order.grand_total ??
      order.rounded_total ??
      order.total ??
      0
    );
  }

  /* =========================
     Actions
     ========================= */
  function openCreateOrderDialog() {
    const dialog = new frappe.ui.Dialog({
      title: __('Create Order'),
      fields: [
        {
          fieldname: 'order_type',
          label: __('Order Type'),
          fieldtype: 'Select',
          options: ['Dine-in', 'Takeaway'],
          reqd: 1
        },
        {
          fieldname: 'table',
          label: __('Table'),
          fieldtype: 'Data',
          depends_on: "eval:doc.order_type=='Dine-in'",
          mandatory_depends_on: "eval:doc.order_type=='Dine-in'"
        }
      ],
      primary_action_label: __('Create'),
      primary_action(values) {
        dialog.hide();
        createOrder(values);
      }
    });
    dialog.show();
  }

  function createOrder(values) {
    showLoading('Creating order…');
    frappe.call({
      method: 'imogi_pos.api.orders.create_order',
      args: {
        order_type : values.order_type,
        table      : values.table || null,
        branch     : CURRENT_BRANCH,
        pos_profile: POS_PROFILE
      }
    })
    .then(r => {
      hideLoading();
      if (r && r.message) {
        showSuccess(__('Order created successfully'));
        loadOrders();
      } else {
        showError(__('Failed to create order'));
      }
    })
    .fail(err => {
      hideLoading();
      console.error('[createOrder] error', err);
      showError(__('Failed to create order'));
    });
  }

  function generateInvoice() {
    if (!selectedOrder) return;

    const mop = paymentModeSelect?.value;
    if (!mop) {
      showError(__('Please select a mode of payment'));
      return;
    }

    showLoading('Generating invoice…');

    frappe.call({
      method: 'imogi_pos.api.billing.generate_invoice',
      args: {
        pos_order     : selectedOrder.name,
        pos_profile   : POS_PROFILE,
        pos_session   : ACTIVE_POS_SESSION || null,  // kirim null kalau tidak ada
        mode_of_payment: mop,
        amount        : safeTotal(selectedOrder)
      }
    })
    .then((r) => {
      hideLoading();
      if (r && r.message) {
        invoiceDoc = r.message;
        selectedOrder.sales_invoice = invoiceDoc.name;
        showSuccess(__('Invoice generated successfully'));
        requestPaymentBtn.disabled = false;

        // refresh linked invoice without resetting selection
        loadLinkedInvoice(invoiceDoc.name);
      } else {
        showError(__('Failed to generate invoice'));
      }
    })
    .fail((err) => {
      hideLoading();
      console.error('[generateInvoice] error', err);
      showError(__('Failed to generate invoice'));
    });
  }

  function loadLinkedInvoice(invoiceName) {
    frappe.call({
      method: 'frappe.client.get',
      args: { doctype: 'Sales Invoice', name: invoiceName }
    }).then((r) => {
      if (r && r.message) {
        invoiceDoc = r.message;
        requestPaymentBtn.disabled = false;
      }
    });
  }

  function requestPayment() {
    if (!invoiceDoc) return;

    showLoading('Requesting payment…');

    frappe.call({
      method: 'imogi_pos.api.billing.request_payment',
      args: {
        sales_invoice: invoiceDoc.name
      }
    })
    .then((r) => {
      hideLoading();
      if (r && r.message) {
        const paymentRequest = r.message;
        sendToCustomerDisplay(paymentRequest);
        showSuccess(__('Payment request created successfully'));
        // refresh orders for UI consistency
        loadOrders();
      } else {
        showError(__('Failed to create payment request'));
      }
    })
    .fail((err) => {
      hideLoading();
      console.error('[requestPayment] error', err);
      showError(__('Failed to request payment'));
    });
  }

  function sendToCustomerDisplay(paymentRequest) {
    frappe.call({
      method: 'imogi_pos.api.customer_display.publish_customer_display_update',
      args: {
        event_type: 'payment_request',
        data: {
          payment_request: paymentRequest.name,
          qr_image: paymentRequest.qr_image,
          payment_url: paymentRequest.payment_url,
          amount: paymentRequest.grand_total,
          currency: paymentRequest.currency,
          expires_at: paymentRequest.expires_at
        }
      }
    });
  }

  function printBill() {
    if (!selectedOrder) return;

    showLoading('Preparing bill for printing…');

    frappe.call({
      method: 'imogi_pos.api.printing.print_customer_bill',
      args: { pos_order: selectedOrder.name, pos_profile: POS_PROFILE }
    })
    .then((r) => {
      hideLoading();
      if (r && r.message) {
        const d = r.message;
        if (window.ImogiPrintService) {
          ImogiPrintService.print({
            type: 'customer_bill',
            data: d.html,
            printer: d.printer,
            copies: d.copies || 1
          })
          .then(() => showSuccess(__('Bill printed successfully')))
          .catch(err => showError('Print failed: ' + (err?.message || err)));
        } else {
          showError('Print service not available');
        }
      } else {
        showError(__('Failed to prepare bill for printing'));
      }
    })
    .fail((err) => {
      hideLoading();
      console.error('[printBill] error', err);
      showError(__('Failed to prepare bill'));
    });
  }

  function attachCustomerToOrder(customerName) {
    if (!selectedOrder) return;
    frappe.call({
      method: 'imogi_pos.api.customers.attach_customer_to_order_or_invoice',
      args: {
        document_type: 'POS Order',
        document_name: selectedOrder.name,
        customer: customerName
      }
    })
    .then((r) => {
      if (r && r.message) {
        showSuccess(__('Customer attached to order'));
        selectedOrder.customer = customerName;
        selectedOrder.customer_name = selectedCustomer?.customer_name || customerName;
      } else {
        showError(__('Failed to attach customer to order'));
      }
    })
    .fail((err) => showError('Error attaching customer: ' + (err?.message || err)));
  }

  /* =========================
     Customer modal (jQuery)
     ========================= */
  function openCustomerSearch() {
    const modalHtml = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${__('Find Customer')}</h5>
            <button type="button" class="close" data-dismiss="modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="phone-search">${__('Phone Number')}</label>
              <input type="text" id="phone-search" class="form-control" placeholder="${__('Enter phone number…')}">
            </div>
            <div id="customer-search-results" class="mt-3"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">${__('Close')}</button>
            <button type="button" class="btn btn-primary" id="search-customer-btn">${__('Search')}</button>
            <button type="button" class="btn btn-success" id="create-customer-btn">${__('Create New')}</button>
          </div>
        </div>
      </div>`;

    const modal = $('<div class="modal" tabindex="-1" role="dialog"></div>');
    modal.html(modalHtml);
    modal.modal('show');

    modal.find('#search-customer-btn').on('click', function () {
      const phone = modal.find('#phone-search').val();
      if (!phone) return;
      searchCustomerByPhone(phone, modal);
    });

    modal.find('#create-customer-btn').on('click', function () {
      const phone = modal.find('#phone-search').val();
      if (!phone) return;
      createCustomer(phone, modal);
    });

    modal.find('#phone-search').on('keypress', function (e) {
      if (e.which === 13) modal.find('#search-customer-btn').click();
    });
  }

  function searchCustomerByPhone(phone, modal) {
    const resultsContainer = modal.find('#customer-search-results');
    resultsContainer.html('<div class="text-center">Searching...</div>');

    frappe.call({
      method: 'imogi_pos.api.customers.find_customer_by_phone',
      args: { phone }
    })
    .then((r) => {
      const rows = (r && r.message) || [];
      if (!rows.length) {
        resultsContainer.html(`<div class="alert alert-info">${__('No customers found with this phone number')}</div>`);
        return;
      }
      const html = `
        <div class="list-group">
          ${rows.map(c => `
            <a href="#" class="list-group-item list-group-item-action customer-result"
               data-name="${escapeAttr(c.name)}" data-customer-name="${escapeAttr(c.customer_name)}">
              <div class="d-flex justify-content-between align-items-center">
                <h6 class="mb-1">${escapeHtml(c.customer_name)}</h6>
                <small>${escapeHtml(c.name)}</small>
              </div>
              <p class="mb-1">${escapeHtml(c.mobile_no || '')}</p>
            </a>`).join('')}
        </div>`;
      resultsContainer.html(html);

      resultsContainer.find('.customer-result').on('click', function (e) {
        e.preventDefault();
        const customerName = $(this).data('name');
        const displayName  = $(this).data('customer-name');
        selectCustomer({ name: customerName, customer_name: displayName });
        if (selectedOrder) attachCustomerToOrder(customerName);
        modal.modal('hide');
      });
    })
    .fail((err) => {
      resultsContainer.html(`<div class="alert alert-danger">Error: ${escapeHtml(err?.message || String(err))}</div>`);
    });
  }

  function createCustomer(phone, modal) {
    const resultsContainer = modal.find('#customer-search-results');
    resultsContainer.html('<div class="text-center">Creating customer...</div>');

    frappe.call({
      method: 'imogi_pos.api.customers.quick_create_customer_with_contact',
      args: { mobile_no: phone, customer_name: 'New Customer' }
    })
    .then((r) => {
      if (r && r.message) {
        const c = r.message;
        resultsContainer.html(`<div class="alert alert-success">${__('Customer created successfully')}: ${escapeHtml(c.customer_name)}</div>`);
        selectCustomer({ name: c.name, customer_name: c.customer_name });
        if (selectedOrder) attachCustomerToOrder(c.name);
        setTimeout(() => modal.modal('hide'), 1200);
      } else {
        resultsContainer.html('<div class="alert alert-danger">Failed to create customer</div>');
      }
    })
    .fail((err) => {
      resultsContainer.html(`<div class="alert alert-danger">Error: ${escapeHtml(err?.message || String(err))}</div>`);
    });
  }

  function selectCustomer(customer) {
    selectedCustomer = customer;
    customerNameEl.textContent = customer.customer_name || customer.name;
    loadCustomerDetails(customer.name);
  }

  function loadCustomerDetails(customerName) {
    frappe.call({
      method: 'frappe.client.get',
      args: { doctype: 'Customer', name: customerName }
    }).then((r) => {
      const c = r && r.message;
      if (!c) return;
      const parts = [];
      if (c.mobile_no) parts.push(`<div>Phone: ${escapeHtml(c.mobile_no)}</div>`);
      if (c.email_id) parts.push(`<div>Email: ${escapeHtml(c.email_id)}</div>`);
      if (c.customer_group) parts.push(`<div>Group: ${escapeHtml(c.customer_group)}</div>`);
      customerDetailsEl.innerHTML = parts.join('') || '';
    });
  }

  /* =========================
     Realtime & printing
     ========================= */
  function initPrintService() {
    if (window.ImogiPrintService) {
      ImogiPrintService.init({
        profile: POS_PROFILE,
        defaultInterface: 'OS'
      });
    } else {
      console.warn('Print service not available');
    }
  }

  function setupRealtimeUpdates() {
    if (!frappe.realtime) return;
    // Order updates
    frappe.realtime.on('pos_order_updated', (data) => {
      if (!data?.branch || data.branch === CURRENT_BRANCH) {
        loadOrders();
      }
    });
    // Payment updates
    frappe.realtime.on('payment_status_updated', (data) => {
      if (invoiceDoc && data?.invoice === invoiceDoc.name && data.status === 'Paid') {
        showSuccess(__('Payment received!'));
        loadOrders();
      }
    });
  }

  /* =========================
     Helpers
     ========================= */
  function formatCurrency(value) {
    const v = Number(value || 0);
    // tetap pakai symbol custom di depan
    return `${CURRENCY_SYMBOL} ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  }

  function showLoading(message = 'Loading...') {
    if (!window.$) return; // jaga-jaga kalau jQuery belum ada
    if (!$('#loading-indicator').length) {
      $('body').append(`
        <div id="loading-indicator" style="position:fixed;inset:0;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;z-index:1000">
          <div style="background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1)">
            <div class="loading-spinner" style="border:3px solid #f3f3f3;border-top:3px solid #111;border-radius:50%;width:30px;height:30px;animation:spin 1s linear infinite;margin:0 auto 10px"></div>
            <div id="loading-message">${escapeHtml(message)}</div>
          </div>
        </div>
        <style>@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}</style>
      `);
    } else {
      $('#loading-message').text(message);
      $('#loading-indicator').show();
    }
  }

  function hideLoading() {
    if (!window.$) return;
    $('#loading-indicator').hide();
  }

  function showSuccess(message) { showToast(message, 'success'); }
  function showError(message) { showToast(message, 'error'); }

  function showToast(message, type = 'info') {
    if (!window.$) { console.log(type.toUpperCase(), message); return; }
    let bg = '#2196f3';
    if (type === 'success') bg = '#4caf50';
    if (type === 'error') bg = '#f44336';

    if (!$('#toast-container').length) {
      $('body').append(`<div id="toast-container" style="position:fixed;top:20px;right:20px;z-index:1001"></div>`);
    }
    const id = 'toast-' + Date.now();
    $('#toast-container').append(`
      <div id="${id}" style="min-width:260px;margin-bottom:10px;background:${bg};color:#fff;padding:12px 14px;border-radius:6px;box-shadow:0 2px 5px rgba(0,0,0,.2);display:flex;justify-content:space-between;align-items:center">
        <span>${escapeHtml(message)}</span>
        <button style="background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer">&times;</button>
      </div>
    `);
    $(`#${id} button`).on('click', () => $(`#${id}`).remove());
    setTimeout(() => { $(`#${id}`).fadeOut(400, function(){ $(this).remove(); }); }, 3000);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g, '&quot;'); }
});
