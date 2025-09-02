frappe.ready(function() {
    // Check if required variables are defined
    if (!POS_PROFILE) {
        frappe.msgprint(__('No POS Profile found. Please contact your administrator.'));
        return;
    }

    // Ensure the FRAPPE_CSRF_TOKEN is available
    if (!FRAPPE_CSRF_TOKEN) {
        console.error("CSRF token not available. Authentication may have failed.");
        // Continue anyway as frappe might handle this
    }

    const orderList = document.getElementById('order-list');
    const orderTabs = document.querySelectorAll('.order-tab');
    const checkoutItems = document.getElementById('checkout-items');
    const findCustomerBtn = document.getElementById('find-customer');
    const customerName = document.getElementById('customer-name');
    const customerDetails = document.getElementById('customer-details');
    const refreshOrdersBtn = document.getElementById('refresh-orders');
    const searchInput = document.querySelector('.search-input');
    
    // Checkout elements
    const subtotalEl = document.getElementById('subtotal');
    const taxAmountEl = document.getElementById('tax-amount');
    const discountAmountEl = document.getElementById('discount-amount');
    const grandTotalEl = document.getElementById('grand-total');
    
    // Action buttons
    const generateInvoiceBtn = document.getElementById('btn-generate-invoice');
    const requestPaymentBtn = document.getElementById('btn-request-payment');
    const printBillBtn = document.getElementById('btn-print-bill');
    
    // State management
    let currentTab = 'Ready';
    let currentOrders = [];
    let selectedOrder = null;
    let selectedCustomer = null;
    let invoiceDoc = null;
    let searchQuery = '';
    
    // Initialize
    init();
    
    // Functions
    function init() {
        loadOrders();
        setupEventListeners();
        initPrintService();
        
        // Set up realtime updates
        setupRealtimeUpdates();
    }
    
    function setupEventListeners() {
        // Order tab switching
        orderTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                orderTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentTab = tab.dataset.status;
                loadOrders();
            });
        });
        
        // Refresh orders button
        refreshOrdersBtn.addEventListener('click', loadOrders);
        
        // Find/Create customer button
        findCustomerBtn.addEventListener('click', openCustomerSearch);
        
        // Generate invoice button
        generateInvoiceBtn.addEventListener('click', generateInvoice);
        
        // Request payment button
        requestPaymentBtn.addEventListener('click', requestPayment);
        
        // Print bill button
        printBillBtn.addEventListener('click', printBill);
        
        // Search input
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            filterOrders();
        });
    }
    
    function loadOrders() {
        showLoading();

        const args = {
            branch: CURRENT_BRANCH,
            pos_profile: POS_PROFILE
        };
        if (currentTab !== 'All') {
            args.status = currentTab;
        }

        frappe.call({
            method: 'imogi_pos.api.billing.list_orders_for_cashier',
            args: args,
            callback: function(response) {
                if (response.message) {
                    currentOrders = response.message;
                    renderOrders();
                    hideLoading();
                } else {
                    showError("Failed to load orders");
                }
            },
            error: function(err) {
                console.error("Error loading orders:", err);
                showError("Failed to load orders: " + err.message);
                hideLoading();
            }
        });
    }
    
    function renderOrders() {
        if (currentOrders.length === 0) {
            orderList.innerHTML = `
                <div class="empty-state">
                    <p>No ${currentTab.toLowerCase()} orders found</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        currentOrders.forEach(order => {
            const orderDate = new Date(order.creation);
            const formattedDate = orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            html += `
                <div class="order-card ${selectedOrder && selectedOrder.name === order.name ? 'selected' : ''}" 
                     data-order="${order.name}">
                    <div class="order-meta">
                        <span>${order.name}</span>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="order-info">
                        <div>
                            <strong>${order.table ? 'Table ' + order.table : order.order_type}</strong>
                            ${order.customer !== 'Walk-in Customer' ? ' • ' + order.customer_name : ''}
                        </div>
                        <div class="order-amount">${formatCurrency(order.grand_total)}</div>
                    </div>
                    <div class="order-items">
                        ${order.items.length} item(s) • ${order.workflow_state}
                    </div>
                </div>
            `;
        });
        
        orderList.innerHTML = html;
        
        // Add click event to order cards
        document.querySelectorAll('.order-card').forEach(card => {
            card.addEventListener('click', () => {
                const orderName = card.dataset.order;
                selectOrder(orderName);
            });
        });
    }
    
    function filterOrders() {
        if (!searchQuery) {
            renderOrders();
            return;
        }
        
        const filteredOrders = currentOrders.filter(order => {
            const searchLower = searchQuery.toLowerCase();
            return (
                order.name.toLowerCase().includes(searchLower) ||
                (order.table && order.table.toLowerCase().includes(searchLower)) ||
                (order.customer_name && order.customer_name.toLowerCase().includes(searchLower))
            );
        });
        
        currentOrders = filteredOrders;
        renderOrders();
    }
    
    function selectOrder(orderName) {
        const order = currentOrders.find(o => o.name === orderName);
        if (!order) return;
        
        selectedOrder = order;
        
        // Update UI
        document.querySelectorAll('.order-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.order === orderName);
        });
        
        // Update customer info
        if (order.customer && order.customer !== 'Walk-in Customer') {
            customerName.textContent = order.customer_name || order.customer;
            selectedCustomer = {
                name: order.customer,
                customer_name: order.customer_name
            };
            
            // Load additional customer details
            loadCustomerDetails(order.customer);
        } else {
            customerName.textContent = 'Walk-in Customer';
            customerDetails.innerHTML = '';
            selectedCustomer = null;
        }
        
        // Update checkout items
        renderCheckoutItems(order);
        
        // Update totals
        updateTotals(order);
        
        // Enable buttons
        generateInvoiceBtn.disabled = false;
        printBillBtn.disabled = false;
        
        // Reset invoice doc
        invoiceDoc = null;
        requestPaymentBtn.disabled = true;
    }
    
    function renderCheckoutItems(order) {
        let html = '';
        
        order.items.forEach(item => {
            html += `
                <div class="checkout-item">
                    <div class="item-details">
                        <div class="item-name">${item.item_name}</div>
                        ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
                    </div>
                    <div class="item-quantity-price">
                        <span>${item.qty}x</span>
                        <span>${formatCurrency(item.amount)}</span>
                    </div>
                </div>
            `;
        });
        
        checkoutItems.innerHTML = html;
    }
    
    function updateTotals(order) {
        subtotalEl.textContent = formatCurrency(order.net_total);
        taxAmountEl.textContent = formatCurrency(order.total_taxes_and_charges || 0);
        discountAmountEl.textContent = formatCurrency(order.discount_amount || 0);
        grandTotalEl.textContent = formatCurrency(order.grand_total);
    }
    
    function generateInvoice() {
        if (!selectedOrder) return;
        
        showLoading("Generating invoice...");
        
        frappe.call({
            method: 'imogi_pos.api.billing.generate_invoice',
            args: {
                pos_order: selectedOrder.name,
                pos_profile: POS_PROFILE,
                pos_session: ACTIVE_POS_SESSION
            },
            callback: function(response) {
                hideLoading();
                if (response.message) {
                    invoiceDoc = response.message;
                    showSuccess("Invoice generated successfully");
                    
                    // Update buttons
                    requestPaymentBtn.disabled = false;
                    
                    // If there's already a Sales Invoice linked, get its details
                    if (selectedOrder.sales_invoice) {
                        loadLinkedInvoice(selectedOrder.sales_invoice);
                    }
                } else {
                    showError("Failed to generate invoice");
                }
            },
            error: function(err) {
                hideLoading();
                console.error("Error generating invoice:", err);
                showError("Failed to generate invoice: " + err.message);
            }
        });
    }
    
    function loadLinkedInvoice(invoiceName) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Sales Invoice',
                name: invoiceName
            },
            callback: function(response) {
                if (response.message) {
                    invoiceDoc = response.message;
                    requestPaymentBtn.disabled = false;
                }
            }
        });
    }
    
    function requestPayment() {
        if (!invoiceDoc) return;
        
        showLoading("Requesting payment...");
        
        frappe.call({
            method: 'imogi_pos.api.billing.request_payment',
            args: {
                invoice: invoiceDoc.name,
                amount: invoiceDoc.grand_total,
                customer: invoiceDoc.customer
            },
            callback: function(response) {
                hideLoading();
                if (response.message) {
                    const paymentRequest = response.message;
                    
                    // Send to customer display if configured
                    sendToCustomerDisplay(paymentRequest);
                    
                    showSuccess("Payment request created successfully");
                } else {
                    showError("Failed to create payment request");
                }
            },
            error: function(err) {
                hideLoading();
                console.error("Error requesting payment:", err);
                showError("Failed to request payment: " + err.message);
            }
        });
    }
    
    function sendToCustomerDisplay(paymentRequest) {
        // Check if customer display integration is enabled
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
        
        showLoading("Preparing bill for printing...");
        
        frappe.call({
            method: 'imogi_pos.api.printing.print_customer_bill',
            args: {
                pos_order: selectedOrder.name,
                pos_profile: POS_PROFILE
            },
            callback: function(response) {
                hideLoading();
                if (response.message) {
                    const printData = response.message;
                    
                    // Send to print service
                    ImogiPrintService.print({
                        type: 'customer_bill',
                        data: printData.html,
                        printer: printData.printer,
                        copies: printData.copies || 1
                    })
                    .then(() => {
                        showSuccess("Bill printed successfully");
                    })
                    .catch(err => {
                        showError("Print failed: " + err.message);
                    });
                } else {
                    showError("Failed to prepare bill for printing");
                }
            },
            error: function(err) {
                hideLoading();
                console.error("Error preparing bill:", err);
                showError("Failed to prepare bill: " + err.message);
            }
        });
    }
    
    function openCustomerSearch() {
        // Create a simple modal for customer search
        const modalHtml = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Find Customer</h5>
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="phone-search">Phone Number</label>
                            <input type="text" id="phone-search" class="form-control" placeholder="Enter phone number...">
                        </div>
                        <div id="customer-search-results" class="mt-3"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" id="search-customer-btn">Search</button>
                        <button type="button" class="btn btn-success" id="create-customer-btn">Create New</button>
                    </div>
                </div>
            </div>
        `;
        
        const modal = $('<div class="modal" tabindex="-1" role="dialog"></div>');
        modal.html(modalHtml);
        modal.modal('show');
        
        // Set up event handlers
        modal.find('#search-customer-btn').on('click', function() {
            const phone = modal.find('#phone-search').val();
            if (!phone) return;
            
            searchCustomerByPhone(phone, modal);
        });
        
        modal.find('#create-customer-btn').on('click', function() {
            const phone = modal.find('#phone-search').val();
            if (!phone) return;
            
            createCustomer(phone, modal);
        });
        
        // Enter key in search field
        modal.find('#phone-search').on('keypress', function(e) {
            if (e.which === 13) {
                modal.find('#search-customer-btn').click();
            }
        });
    }
    
    function searchCustomerByPhone(phone, modal) {
        const resultsContainer = modal.find('#customer-search-results');
        resultsContainer.html('<div class="text-center">Searching...</div>');
        
        frappe.call({
            method: 'imogi_pos.api.customers.find_customer_by_phone',
            args: { phone: phone },
            callback: function(response) {
                if (response.message && response.message.length > 0) {
                    let html = '<div class="list-group">';
                    response.message.forEach(customer => {
                        html += `
                            <a href="#" class="list-group-item list-group-item-action customer-result" 
                               data-name="${customer.name}" data-customer-name="${customer.customer_name}">
                                <div class="d-flex justify-content-between align-items-center">
                                    <h6 class="mb-1">${customer.customer_name}</h6>
                                    <small>${customer.name}</small>
                                </div>
                                <p class="mb-1">${customer.mobile_no || ''}</p>
                            </a>
                        `;
                    });
                    html += '</div>';
                    resultsContainer.html(html);
                    
                    // Set up click handlers for results
                    resultsContainer.find('.customer-result').on('click', function() {
                        const customerName = $(this).data('name');
                        const customerDisplayName = $(this).data('customer-name');
                        
                        selectCustomer({
                            name: customerName,
                            customer_name: customerDisplayName
                        });
                        
                        if (selectedOrder) {
                            attachCustomerToOrder(customerName);
                        }
                        
                        modal.modal('hide');
                    });
                } else {
                    resultsContainer.html('<div class="alert alert-info">No customers found with this phone number</div>');
                }
            },
            error: function(err) {
                resultsContainer.html(`<div class="alert alert-danger">Error: ${err.message}</div>`);
            }
        });
    }
    
    function createCustomer(phone, modal) {
        const resultsContainer = modal.find('#customer-search-results');
        resultsContainer.html('<div class="text-center">Creating customer...</div>');
        
        frappe.call({
            method: 'imogi_pos.api.customers.quick_create_customer_with_contact',
            args: { 
                phone: phone,
                customer_name: 'New Customer'
            },
            callback: function(response) {
                if (response.message) {
                    const customer = response.message;
                    
                    resultsContainer.html(`
                        <div class="alert alert-success">
                            Customer created successfully: ${customer.customer_name}
                        </div>
                    `);
                    
                    // Select the newly created customer
                    selectCustomer({
                        name: customer.name,
                        customer_name: customer.customer_name
                    });
                    
                    if (selectedOrder) {
                        attachCustomerToOrder(customer.name);
                    }
                    
                    setTimeout(() => {
                        modal.modal('hide');
                    }, 1500);
                } else {
                    resultsContainer.html('<div class="alert alert-danger">Failed to create customer</div>');
                }
            },
            error: function(err) {
                resultsContainer.html(`<div class="alert alert-danger">Error: ${err.message}</div>`);
            }
        });
    }
    
    function selectCustomer(customer) {
        selectedCustomer = customer;
        customerName.textContent = customer.customer_name || customer.name;
        
        // Load customer details
        loadCustomerDetails(customer.name);
    }
    
    function loadCustomerDetails(customerName) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Customer',
                name: customerName
            },
            callback: function(response) {
                if (response.message) {
                    const customer = response.message;
                    let detailsHtml = '';
                    
                    if (customer.mobile_no) {
                        detailsHtml += `<div>Phone: ${customer.mobile_no}</div>`;
                    }
                    
                    if (customer.email_id) {
                        detailsHtml += `<div>Email: ${customer.email_id}</div>`;
                    }
                    
                    if (customer.customer_group) {
                        detailsHtml += `<div>Group: ${customer.customer_group}</div>`;
                    }
                    
                    customerDetails.innerHTML = detailsHtml;
                }
            }
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
            },
            callback: function(response) {
                if (response.message) {
                    showSuccess("Customer attached to order");
                    
                    // Update the selected order
                    selectedOrder.customer = customerName;
                    selectedOrder.customer_name = selectedCustomer.customer_name;
                } else {
                    showError("Failed to attach customer to order");
                }
            },
            error: function(err) {
                showError("Error attaching customer: " + err.message);
            }
        });
    }
    
    function initPrintService() {
        // Initialize the print service from the shared module
        if (window.ImogiPrintService) {
            ImogiPrintService.init({
                profile: POS_PROFILE,
                defaultInterface: 'OS' // Fallback to OS printing if profile doesn't specify
            });
        } else {
            console.error("Print service not available");
        }
    }
    
    function setupRealtimeUpdates() {
        if (frappe.realtime) {
            // Listen for order updates
            frappe.realtime.on('pos_order_updated', function(data) {
                // Only refresh if it's the same branch
                if (!data.branch || data.branch === CURRENT_BRANCH) {
                    loadOrders();
                }
            });
            
            // Listen for payment updates
            frappe.realtime.on('payment_status_updated', function(data) {
                if (invoiceDoc && data.invoice === invoiceDoc.name) {
                    if (data.status === 'Paid') {
                        showSuccess("Payment received!");
                        loadOrders(); // Refresh orders list
                    }
                }
            });
        }
    }
    
    // Helper functions
    function formatCurrency(value) {
        return CURRENCY_SYMBOL + ' ' + Number(value).toFixed(2);
    }
    
    function showLoading(message = "Loading...") {
        if (!$('#loading-indicator').length) {
            $('body').append(`
                <div id="loading-indicator" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255,255,255,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                ">
                    <div style="
                        background: white;
                        padding: 20px;
                        border-radius: 5px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    ">
                        <div class="loading-spinner" style="
                            border: 3px solid #f3f3f3;
                            border-top: 3px solid var(--primary-color);
                            border-radius: 50%;
                            width: 30px;
                            height: 30px;
                            animation: spin 2s linear infinite;
                            margin: 0 auto 10px;
                        "></div>
                        <div id="loading-message">${message}</div>
                    </div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `);
        } else {
            $('#loading-message').text(message);
            $('#loading-indicator').show();
        }
    }
    
    function hideLoading() {
        $('#loading-indicator').hide();
    }
    
    function showSuccess(message) {
        showToast(message, 'success');
    }
    
    function showError(message) {
        showToast(message, 'error');
    }
    
    function showToast(message, type = 'info') {
        let bgColor = '#4caf50'; // success
        if (type === 'error') bgColor = '#f44336';
        if (type === 'info') bgColor = '#2196f3';
        
        if (!$('#toast-container').length) {
            $('body').append(`
                <div id="toast-container" style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1001;
                "></div>
            `);
        }
        
        const toastId = 'toast-' + Date.now();
        $('#toast-container').append(`
            <div id="${toastId}" style="
                min-width: 250px;
                margin-bottom: 10px;
                background-color: ${bgColor};
                color: white;
                padding: 15px;
                border-radius: 4px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span>${message}</span>
                <button style="
                    background: transparent;
                    border: none;
                    color: white;
                    font-size: 16px;
                    cursor: pointer;
                ">&times;</button>
            </div>
        `);
        
        $(`#${toastId} button`).on('click', function() {
            $(`#${toastId}`).remove();
        });
        
        setTimeout(() => {
            $(`#${toastId}`).fadeOut(500, function() {
                $(this).remove();
            });
        }, 3000);
    }
});