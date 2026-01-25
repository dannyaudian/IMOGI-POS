// cashier-console/index.js
/* global frappe, __ */

frappe.ready(function () {
  // ====== Guard: context vars from Jinja ======
  const POS_PROFILE        = window.POS_PROFILE ?? null;
  const ACTIVE_POS_SESSION = window.ACTIVE_POS_SESSION ?? null;
  const CURRENT_BRANCH     = window.CURRENT_BRANCH ?? null;
  const CURRENT_BRANCH_LABEL = window.CURRENT_BRANCH_LABEL ?? null;
  const CURRENCY_SYMBOL    = window.CURRENCY_SYMBOL ?? 'Rp';
  const DOMAIN             = window.DOMAIN ?? 'Restaurant';
  const MODE               = window.MODE ?? 'Counter';

  // Debug: Log domain and mode
  console.log('POS Configuration:');
  console.log('  Domain:', DOMAIN, '(Restaurant/Retail/Service)');
  console.log('  Mode:', MODE, '(Table/Counter/Kiosk/Self-Order)');
  console.log('  Branch:', CURRENT_BRANCH_LABEL || CURRENT_BRANCH);
  console.log('  Full Mode Display:', DOMAIN + ' - ' + MODE);

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
  // Counter mode: menampilkan pending orders yang siap untuk di-checkout
  // Setelah klik "Create Order", order masuk ke list ini untuk di-checkout
  const STATE_MAP = {
    'Draft'     : 'Draft',
    'Pending'   : 'Pending',
    'Ready'     : 'Ready',
    'Confirmed' : 'Confirmed',
    'All'       : null
  };

  let currentTab     = 'All';  // Default ke All untuk menampilkan semua pending orders
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
    checkCustomerDisplayStatus();
    loadWorkflowStates();
    loadOrders();
  }

  function loadWorkflowStates() {
    // Load workflow states dynamically from backend
    frappe.call({
      method: 'frappe.client.get_list',
      args: {
        doctype: 'Workflow State',
        filters: {},
        fields: ['name'],
        limit_page_length: 100
      }
    }).then(r => {
      if (r && r.message && r.message.length > 0) {
        console.log('✅ Loaded workflow states:', r.message);
        // Keep existing STATE_MAP but log available states
        r.message.forEach(state => {
          console.log('  -', state.name);
        });
      }
    }).catch(err => {
      console.warn('Could not load workflow states:', err);
    });
  }

  function checkCustomerDisplayStatus() {
    const statusContainer = document.querySelector('.customer-display-status');
    if (!statusContainer) return;

    frappe.call({
      method: 'imogi_pos.api.customer_display.check_display_status',
      args: { branch: CURRENT_BRANCH }
    })
    .then(r => {
      const isOnline = r && r.message && r.message.online;
      updateCustomerDisplayStatus(isOnline);
      statusContainer.style.display = 'flex';
    })
    .catch(() => {
      updateCustomerDisplayStatus(false);
      statusContainer.style.display = 'flex';
    });

    // Check every 30 seconds
    setInterval(() => {
      frappe.call({
        method: 'imogi_pos.api.customer_display.check_display_status',
        args: { branch: CURRENT_BRANCH },
        silent: true
      })
      .then(r => {
        const isOnline = r && r.message && r.message.online;
        updateCustomerDisplayStatus(isOnline);
      })
      .catch(() => updateCustomerDisplayStatus(false));
    }, 30000);
  }

  function updateCustomerDisplayStatus(isOnline) {
    const badge = document.getElementById('display-status-badge');
    const icon = document.getElementById('display-status-icon');
    
    if (!badge || !icon) return;

    icon.className = 'fa fa-circle ' + (isOnline ? 'online' : 'offline');
    badge.textContent = '';
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(' ' + (isOnline ? __('Online') : __('Offline'))));
    
    badge.className = 'status-indicator badge badge-' + (isOnline ? 'success' : 'secondary');
    badge.title = isOnline ? __('Customer display is online') : __('Customer display is offline');
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
    
    // Disable create order in Counter mode - orders should come from waiter interface
    if (MODE === 'Counter') {
      if (createOrderBtn) {
        createOrderBtn.disabled = true;
        createOrderBtn.title = 'Orders are created from the Waiter interface';
        createOrderBtn.style.opacity = '0.5';
        createOrderBtn.style.cursor = 'not-allowed';
      }
    } else {
      createOrderBtn?.addEventListener('click', openCreateOrderDialog);
    }
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

    console.debug('[loadOrders] Loading pending orders with args:', args);
    console.debug('[loadOrders] User Domain:', DOMAIN, 'Mode:', MODE);

    frappe.call({
      method: 'imogi_pos.api.billing.list_counter_order_history',
      args
    })
    .then((r) => {
      const payload = (r && r.message) || [];
      console.debug('[loadOrders] received', payload);
      console.debug('[loadOrders] Number of orders:', Array.isArray(payload) ? payload.length : 0);
      // Ensure item metadata is properly structured
      allOrders = Array.isArray(payload) ? payload.map(order => ({
        ...order,
        items: (order.items || []).map(item => ({
          ...item,
          rate: Number(item.rate || 0)
        }))
      })) : [];
      applySearchTo(allOrders);
      renderOrders();
      // Reset selection jika order yang dipilih hilang
      if (selectedOrder && !currentOrders.find(o => o.name === selectedOrder.name)) {
        resetSelection();
      }
    })
    .fail((err) => {
      console.error('[loadOrders] error', err);
      console.error('[loadOrders] error details:', {
        message: err?.message,
        exc: err?.exc,
        _server_messages: err?._server_messages
      });
      const errorMsg = err?._server_messages || err?.message || 'Unknown error';
      showError(__('Failed to load orders: ') + errorMsg);
      allOrders = [];
      currentOrders = [];
      renderOrders();
    })
    .always(() => {
      console.debug('[loadOrders] Request completed, hiding loading indicator');
      hideLoading();
    });
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
        (order.customer_name && order.customer_name.toLowerCase().includes(s)) ||
        (order.queue_number && String(order.queue_number).includes(s))
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
          <p>${currentTab === 'All' ? 'No orders found. Click "Create Order" to start.' : 'No ' + currentTab.toLowerCase() + ' orders found'}</p>
        </div>`;
      return;
    }

    const html = currentOrders.map(order => {
      const orderDate = order.creation ? new Date(order.creation) : null;
      const time = orderDate ? orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const amount = safeTotal(order);
      const isSelected = selectedOrder && selectedOrder.name === order.name;
      const itemsHtml = (order.items || []).map(it => `
        <div class="order-item">
          ${it.image ? `<div class="order-item-img"><img src="${escapeAttr(it.image)}" alt="${escapeAttr(it.item_name || it.item || '')}"></div>` : ''}
          <div class="order-item-name">${escapeHtml(it.item_name || it.item || '')}</div>
          <div class="order-item-meta">${Number(it.qty || 0)}x ${formatCurrency(Number(it.rate || 0))}</div>
        </div>`).join('');

      const displayName = order.queue_number ? `#${escapeHtml(String(order.queue_number))}` : escapeHtml(order.name);
      return `
        <div class="order-card ${isSelected ? 'selected' : ''}" data-order="${order.name}">
          <div class="order-meta">
            <span>${displayName}</span>
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
          <div class="order-items">${itemsHtml}</div>
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
            <span>${formatCurrency(Number(item.rate || 0))}</span>
          </div>
        </div>
      `).join('');
      checkoutItems.innerHTML = html || '<div class="empty-state">No items</div>';
    }

  function updateTotals(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.rate || 0)), 0);
    const tax = subtotal * 0.11;
    const discountAmount = Number(order.discount_amount || 0);
    const discountPercent = Number(order.discount_percent || 0);
    const promoCode = order.promo_code || '';
    const discount = (subtotal + tax) * (discountPercent / 100) + discountAmount;
    const grand = subtotal + tax - discount;

    let discountText = formatCurrency(discount);
    if (discountPercent) discountText += ` (${discountPercent}%)`;
    if (promoCode) discountText += ` [${promoCode}]`;

    subtotalEl.textContent = formatCurrency(subtotal);
    taxAmountEl.textContent = formatCurrency(tax);
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
    console.log('[openCreateOrderDialog] handler fired');
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
      method: 'imogi_pos.api.orders.create_staff_order',
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

    // Validate order has items
    if (!selectedOrder.items || selectedOrder.items.length === 0) {
      showError(__('Cannot generate invoice: Order has no items'));
      return;
    }

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

    // Validate payment amount
    const amount = safeTotal(selectedOrder);
    if (amount <= 0) {
      showError(__('Cannot request payment: Total amount is zero'));
      return;
    }

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
      const errorMsg = err?.exc || err?._server_messages || err?.message || 'Unknown error';
      showError(__('Payment request failed: ') + errorMsg);
    });
  }

  function sendToCustomerDisplay(paymentRequest, retryCount = 0) {
    const fallbackBranch =
      (typeof window.IMOGIBranch !== 'undefined' &&
        typeof window.IMOGIBranch.get === 'function'
          ? window.IMOGIBranch.get()
          : null);

    const branchId = CURRENT_BRANCH ?? fallbackBranch ?? null;
    const branchLabel =
      CURRENT_BRANCH_LABEL ?? (branchId ? branchId : null);

    const payload = {
      payment_request: paymentRequest.name,
      qr_image: paymentRequest.qr_image,
      payment_url: paymentRequest.payment_url,
      amount: paymentRequest.grand_total,
      currency: paymentRequest.currency,
      expires_at: paymentRequest.expires_at
    };

    if (branchId) {
      payload.branch_id = branchId;
      if (!payload.branch) {
        payload.branch = branchId;
      }
    }

    if (branchLabel) {
      payload.branch_label = branchLabel;
    }

    return frappe.call({
      method: 'imogi_pos.api.customer_display.publish_customer_display_update',
      args: {
        event_type: 'payment_request',
        data: payload
      }
    })
    .then(r => {
      console.log('✅ Payment request sent to customer display');
      updateCustomerDisplayStatus(true);
      return r;
    })
    .catch(err => {
      console.warn('⚠️ Failed to send to customer display:', err);
      updateCustomerDisplayStatus(false);
      
      // Retry mechanism (max 2 retries)
      if (retryCount < 2) {
        console.log(`Retrying... (${retryCount + 1}/2)`);
        setTimeout(() => {
          sendToCustomerDisplay(paymentRequest, retryCount + 1);
        }, 2000);
      } else {
        showToast(__('Customer display may be offline. Payment request created.'), 'warning');
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
          console.warn('ImogiPrintService not available; falling back to browser print');
          showError(__('Imogi Print Service not available. Using browser print.'));
          if (d && d.html) {
            const w = window.open('', '_blank');
            if (w) {
              w.document.write(d.html);
              w.document.close();
              w.focus();
              w.print();
            }
          }
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
    
    showLoading(__('Attaching customer...'));
    
    frappe.call({
      method: 'imogi_pos.api.customers.attach_customer_to_order_or_invoice',
      args: {
        document_type: 'POS Order',
        document_name: selectedOrder.name,
        customer: customerName
      }
    })
    .then((r) => {
      hideLoading();
      if (r && r.message) {
        showSuccess(__('Customer attached successfully'));
        selectedOrder.customer = customerName;
        selectedOrder.customer_name = selectedCustomer?.customer_name || customerName;
        // Reload order to get updated data
        loadOrders();
      } else {
        showError(__('Failed to attach customer to order'));
      }
    })
    .fail((err) => {
      hideLoading();
      const errorMsg = err?._server_messages || err?.message || 'Unknown error';
      showError(__('Error attaching customer: ') + errorMsg);
    });
  }

  /* =========================
     Customer modal (jQuery)
     ========================= */
  function openCustomerSearch() {
    const modalHtml = `
      <div class="modal-dialog modal-dialog-small">
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
      console.warn('ImogiPrintService not available');
      showError(__('Imogi Print Service is not available. Browser printing will be used.'));
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

  function formatNumber(value) {
    const v = Number(value || 0);
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
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

  // ====== Item Selector & Order Creation (NEW) ======
  let itemsData = { items: [], categories: [] };
  let cartItems = [];  // { item_code, item_name, qty, rate, amount }

  function openItemSelector() {
    const modal = document.getElementById('item-selector-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    cartItems = [];  // Reset cart
    loadItemsForSelector();
    renderCart();
  }

  function closeItemSelector() {
    const modal = document.getElementById('item-selector-modal');
    if (modal) modal.style.display = 'none';
  }

  function loadItemsForSelector() {
    const itemGrid = document.getElementById('item-grid');
    if (!itemGrid) return;
    
    itemGrid.innerHTML = '<div class="loading-items">Loading items...</div>';
    
    frappe.call({
      method: 'imogi_pos.api.items.get_items_for_counter',
      args: {
        pos_profile: POS_PROFILE,
        branch: CURRENT_BRANCH
      }
    })
    .then(r => {
      if (r && r.message) {
        itemsData = r.message;
        renderItems();
        populateCategories();
      }
    })
    .fail(err => {
      console.error('Failed to load items:', err);
      itemGrid.innerHTML = '<div class="loading-items">Failed to load items. Please try again.</div>';
    });
  }

  function populateCategories() {
    const select = document.getElementById('category-filter');
    if (!select || !itemsData.categories) return;
    
    // Keep "All Categories" option
    const options = ['<option value="">All Categories</option>'];
    itemsData.categories.forEach(cat => {
      options.push(`<option value="${escapeAttr(cat.name)}">${escapeHtml(cat.category_name || cat.name)}</option>`);
    });
    select.innerHTML = options.join('');
  }

  function renderItems() {
    const itemGrid = document.getElementById('item-grid');
    if (!itemGrid || !itemsData.items) return;
    
    const searchTerm = (document.getElementById('item-search')?.value || '').toLowerCase();
    const categoryFilter = document.getElementById('category-filter')?.value || '';
    
    let filtered = itemsData.items;
    
    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter(item => item.menu_category === categoryFilter);
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item => 
        (item.item_name || '').toLowerCase().includes(searchTerm) ||
        (item.item_code || '').toLowerCase().includes(searchTerm) ||
        (item.description || '').toLowerCase().includes(searchTerm)
      );
    }
    
    if (filtered.length === 0) {
      itemGrid.innerHTML = '<div class="loading-items">No items found.</div>';
      return;
    }
    
    const html = filtered.map(item => {
      const inStock = item.in_stock !== false;
      const stockClass = inStock ? '' : ' out-of-stock';
      const stockText = item.actual_qty != null ? `Stock: ${item.actual_qty}` : 'Available';
      const imageUrl = item.image || '/assets/imogi_pos/images/placeholder-item.png';
      
      return `
        <div class="item-card${stockClass}" data-item-code="${escapeAttr(item.item_code)}" data-rate="${item.rate || 0}">
          <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(item.item_name)}" class="item-card-image" 
               onerror="this.src='/assets/imogi_pos/images/placeholder-item.png'">
          <div class="item-card-name" title="${escapeAttr(item.item_name)}">${escapeHtml(item.item_name)}</div>
          <div class="item-card-price">${CURRENCY_SYMBOL} ${formatNumber(item.rate || 0)}</div>
          <div class="item-card-stock">${escapeHtml(stockText)}</div>
        </div>
      `;
    }).join('');
    
    itemGrid.innerHTML = html;
    
    // Add click handlers
    itemGrid.querySelectorAll('.item-card:not(.out-of-stock)').forEach(card => {
      card.addEventListener('click', () => {
        const itemCode = card.dataset.itemCode;
        const rate = parseFloat(card.dataset.rate) || 0;
        const item = itemsData.items.find(i => i.item_code === itemCode);
        if (item) {
          addItemToCart(item, rate);
        }
      });
    });
  }

  function addItemToCart(item, rate) {
    // Check if item already in cart
    const existing = cartItems.find(ci => ci.item_code === item.item_code);
    
    if (existing) {
      // Increase quantity
      existing.qty += 1;
      existing.amount = existing.qty * existing.rate;
    } else {
      // Add new item
      cartItems.push({
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1,
        rate: rate,
        amount: rate,
        notes: ''
      });
    }
    
    renderCart();
  }

  function updateCartItemQty(itemCode, delta) {
    const item = cartItems.find(ci => ci.item_code === itemCode);
    if (!item) return;
    
    item.qty += delta;
    if (item.qty <= 0) {
      // Remove item
      cartItems = cartItems.filter(ci => ci.item_code !== itemCode);
    } else {
      item.amount = item.qty * item.rate;
    }
    
    renderCart();
  }

  function removeCartItem(itemCode) {
    cartItems = cartItems.filter(ci => ci.item_code !== itemCode);
    renderCart();
  }

  function renderCart() {
    const cartItemsEl = document.getElementById('cart-items');
    const submitBtn = document.getElementById('submit-order');
    
    if (!cartItemsEl) return;
    
    if (cartItems.length === 0) {
      cartItemsEl.innerHTML = '<div class="empty-cart">No items added yet</div>';
      if (submitBtn) submitBtn.disabled = true;
    } else {
      const html = cartItems.map(item => `
        <div class="cart-item">
          <div class="cart-item-details">
            <div class="cart-item-name">${escapeHtml(item.item_name)}</div>
            <div class="cart-item-price">${CURRENCY_SYMBOL} ${formatNumber(item.rate)} × ${item.qty}</div>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-item="${escapeAttr(item.item_code)}" data-action="minus">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-item="${escapeAttr(item.item_code)}" data-action="plus">+</button>
          </div>
          <div class="cart-item-remove" data-item="${escapeAttr(item.item_code)}" title="Remove">×</div>
        </div>
      `).join('');
      
      cartItemsEl.innerHTML = html;
      if (submitBtn) submitBtn.disabled = false;
      
      // Add event listeners
      cartItemsEl.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemCode = btn.dataset.item;
          const delta = btn.dataset.action === 'plus' ? 1 : -1;
          updateCartItemQty(itemCode, delta);
        });
      });
      
      cartItemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          removeCartItem(btn.dataset.item);
        });
      });
    }
    
    // Update totals
    const subtotal = cartItems.reduce((sum, item) => sum + item.amount, 0);
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    
    if (subtotalEl) subtotalEl.textContent = formatNumber(subtotal);
    if (totalEl) totalEl.textContent = formatNumber(subtotal);
  }

  function submitNewOrder() {
    if (cartItems.length === 0) {
      showError(__('Please add items to the order'));
      return;
    }
    
    const orderType = document.querySelector('input[name="order-type"]:checked')?.value || 'Takeaway';
    
    showLoading('Creating order...');
    
    frappe.call({
      method: 'imogi_pos.api.orders.create_counter_order',
      args: {
        pos_profile: POS_PROFILE,
        branch: CURRENT_BRANCH,
        items: cartItems,
        order_type: orderType
      }
    })
    .then(r => {
      if (r && r.message) {
        showSuccess(__('Order created successfully: {0}', [r.message.name]));
        closeItemSelector();
        loadOrders();  // Refresh history
      }
    })
    .fail(err => {
      console.error('Failed to create order:', err);
      const errorMsg = err?._server_messages || err?.message || 'Unknown error';
      showError(__('Failed to create order: ') + errorMsg);
    })
    .always(hideLoading);
  }

  // Setup event listeners for item selector
  function setupItemSelectorListeners() {
    const createBtn = document.getElementById('create-order');
    const closeBtn = document.getElementById('close-item-selector');
    const searchInput = document.getElementById('item-search');
    const categoryFilter = document.getElementById('category-filter');
    const submitBtn = document.getElementById('submit-order');
    const modalBackdrop = document.querySelector('.modal-backdrop');
    
    if (createBtn) {
      createBtn.addEventListener('click', openItemSelector);
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', closeItemSelector);
    }
    
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', closeItemSelector);
    }
    
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderItems(), 300);
      });
    }
    
    if (categoryFilter) {
      categoryFilter.addEventListener('change', renderItems);
    }
    
    if (submitBtn) {
      submitBtn.addEventListener('click', submitNewOrder);
    }
  }

  // Call setup after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupItemSelectorListeners);
  } else {
    setupItemSelectorListeners();
  }
});

