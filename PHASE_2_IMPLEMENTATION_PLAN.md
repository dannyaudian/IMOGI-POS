# Phase 2 Implementation Plan
## Cashier Integration & Customer Display

**Status:** Planning
**Priority:** HIGH
**Target:** Complete Cashier workflow and Customer Display integration

---

## 🎯 Objectives

### Primary Goals
1. **Cashier Console** - Complete POS transaction workflow
2. **Payment Processing** - Cash and QRIS payment methods
3. **Invoice Generation** - Create Sales Invoice from POS Order
4. **Customer Display Integration** - Real-time order display during checkout
5. **Order Completion** - Close orders and update table status

### Success Metrics
- ✅ Waiter can hand off orders to Cashier
- ✅ Cashier can view pending orders by table
- ✅ Payment processing (Cash, QRIS) works correctly
- ✅ Invoice generation follows ERPNext v15 standards
- ✅ Customer Display shows real-time order updates
- ✅ Table status updates after payment
- ✅ End-to-end workflow completes without errors

---

## 📋 Phase 2 Task Breakdown

### Task 1: Backend APIs for Cashier (Priority: HIGH)
**Location:** `imogi_pos/api/cashier.py` (new file)

#### Endpoints to Create:

1. **`get_pending_orders(branch, filters)`**
   - **Purpose:** Fetch orders ready for payment
   - **Returns:** List of POS Orders with status "Draft" or "Submitted"
   - **Fields:** order_name, table, customer, waiter, items, subtotal, tax, total, created_at
   - **Filters:** By table, by waiter, by time range
   - **Sorting:** Oldest first (FIFO)

2. **`get_order_details(order_name)`**
   - **Purpose:** Get complete order information for checkout
   - **Returns:** Full POS Order document with items, customer, payments
   - **Includes:** KOT status, item preparation state, modifiers

3. **`create_invoice_from_order(order_name, customer_info)`**
   - **Purpose:** Convert POS Order to Sales Invoice
   - **Process:**
     - Validate order is complete (all KOTs served)
     - Create Sales Invoice from POS Order
     - Copy items, taxes, totals
     - Set customer information
     - Set posting date/time
   - **Returns:** Sales Invoice name

4. **`process_payment(invoice_name, payments, mode_of_payment)`**
   - **Purpose:** Record payment against invoice
   - **Supports:** Cash, QRIS, Card, Split payment
   - **Process:**
     - Create Payment Entry
     - Link to Sales Invoice
     - Update payment status
     - Calculate change (for cash)
   - **Returns:** Payment Entry name, change amount

5. **`complete_order(order_name, invoice_name, payment_name)`**
   - **Purpose:** Finalize order and cleanup
   - **Process:**
     - Mark POS Order as "Completed"
     - Update table status to "Available"
     - Close all associated KOTs
     - Publish realtime event
     - Send data to Customer Display
   - **Returns:** Success message

6. **`get_payment_methods(branch)`**
   - **Purpose:** Get available payment methods for branch
   - **Returns:** List of Mode of Payment with QRIS config

7. **`split_bill(order_name, split_config)`**
   - **Purpose:** Split order into multiple invoices
   - **Config:** Split by items, by amount, or by percentage
   - **Returns:** List of invoice names

---

### Task 2: Cashier React Components (Priority: HIGH)
**Location:** `src/apps/cashier/` (refactor existing)

#### Components to Build:

1. **OrderList.jsx**
   ```jsx
   // Sidebar list of pending orders
   - Filter by table, waiter, time
   - Sort by oldest first
   - Status indicators (Ready for payment, Partial payment)
   - Order summary (table, total, items count)
   - Click to select order
   ```

2. **OrderDetails.jsx**
   ```jsx
   // Main panel showing selected order
   - Table and customer info
   - Item list with prices
   - Subtotal, tax, discount
   - Grand total
   - Order notes/instructions
   - KOT status indicators
   ```

3. **PaymentPanel.jsx**
   ```jsx
   // Payment entry interface
   - Payment method selector (Cash, QRIS, Card)
   - Amount input
   - Cash tendered & change calculator
   - QRIS QR code display
   - Split payment support
   - Process payment button
   ```

4. **InvoicePreview.jsx**
   ```jsx
   // Invoice preview before printing
   - Company header
   - Invoice number and date
   - Customer details
   - Item list with tax
   - Payment summary
   - Print button
   ```

5. **CustomerInfo.jsx**
   ```jsx
   // Customer selection/creation
   - Search existing customers
   - Quick create customer
   - Walk-in customer option
   - Customer details display
   ```

6. **CashierHeader.jsx**
   ```jsx
   // Top header with session info
   - Cashier name
   - Cash register session
   - Pending orders count
   - Clock
   - Logout button
   ```

---

### Task 3: Cashier Hooks & Logic (Priority: HIGH)
**Location:** `src/apps/cashier/hooks/`

#### Hooks to Create:

1. **usePendingOrders.js**
   ```javascript
   // Fetch and manage pending orders
   - Auto-refresh every 30s
   - Realtime updates on new orders
   - Filter and sort logic
   ```

2. **usePaymentProcessor.js**
   ```javascript
   // Handle payment processing
   - Validate payment amount
   - Process payment via API
   - Handle split payments
   - Calculate change
   - Error handling
   ```

3. **useInvoiceGenerator.js**
   ```javascript
   // Generate invoice from order
   - Create invoice API call
   - Validate order completion
   - Handle customer info
   - Print preview logic
   ```

4. **useCashierSession.js**
   ```javascript
   // Manage cashier session
   - Track opening/closing balance
   - Record transactions
   - Session report
   ```

5. **useQRISPayment.js**
   ```javascript
   // QRIS-specific payment logic
   - Generate QR code
   - Poll payment status
   - Timeout handling
   ```

---

### Task 4: Customer Display Integration (Priority: HIGH)
**Location:** `src/apps/customer-display/` (enhance existing)

#### Enhancements Needed:

1. **Real-time Order Updates**
   ```javascript
   // Subscribe to order events
   - Listen to 'order:updated' channel
   - Display current order items
   - Show running total
   - Update on payment processing
   ```

2. **Payment Status Display**
   ```jsx
   // Show payment progress
   - "Processing Payment..." state
   - Payment method display
   - Amount tendered/change
   - "Payment Complete" success screen
   ```

3. **Thank You Screen**
   ```jsx
   // Post-payment display
   - Thank you message
   - Invoice number
   - Total paid
   - Loyalty points (if applicable)
   - Timeout to idle screen
   ```

4. **Customer Display Backend**
   **Location:** `imogi_pos/api/customer_display.py` (new)
   
   **Endpoints:**
   - `send_order_to_display(device, order_data)` - Push order to display
   - `update_display_status(device, status, data)` - Update display state
   - `clear_display(device)` - Return to idle screen

---

### Task 5: Cashier App Refactor (Priority: HIGH)
**Location:** `src/apps/cashier/App.jsx`

#### App Structure:
```jsx
function App() {
  // State
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)

  // Hooks
  const { orders, loading, mutate } = usePendingOrders()
  const { processPayment, processing } = usePaymentProcessor()
  const { createInvoice, generating } = useInvoiceGenerator()

  // Layout
  return (
    <div className="cashier-container">
      <CashierHeader />
      <div className="cashier-main">
        <OrderList 
          orders={orders}
          selected={selectedOrder}
          onSelect={setSelectedOrder}
        />
        <OrderDetails order={selectedOrder} />
        <PaymentPanel 
          order={selectedOrder}
          mode={paymentMode}
          onModeChange={setPaymentMode}
          onProcess={handlePayment}
        />
      </div>
      {showInvoicePreview && (
        <InvoicePreview 
          order={selectedOrder}
          onClose={() => setShowInvoicePreview(false)}
          onPrint={handlePrint}
        />
      )}
    </div>
  )
}
```

---

## 🔄 Complete Workflow

### End-to-End Flow:

```
1. WAITER
   ├─ Select Table → Add Items → Send to Kitchen
   ├─ POS Order created (status: Draft)
   └─ KOTs sent to Kitchen

2. KITCHEN
   ├─ Receive KOTs → Prepare Items → Mark Ready → Serve
   └─ All KOTs marked as "Served"

3. CASHIER (Phase 2 Focus)
   ├─ View pending orders for table
   ├─ Select order → Verify items
   ├─ Select customer (walk-in or existing)
   ├─ Generate invoice from order
   ├─ Choose payment method (Cash/QRIS)
   ├─ Enter payment amount
   ├─ Process payment → Generate receipt
   ├─ Complete order → Clear table
   └─ Send thank you to Customer Display

4. CUSTOMER DISPLAY (Phase 2 Enhancement)
   ├─ Show order items during dining
   ├─ Display total during checkout
   ├─ Show payment processing
   ├─ Display thank you message
   └─ Return to idle screen
```

---

## 🗂️ File Structure (Phase 2)

### Backend
```
imogi_pos/api/
├── cashier.py (NEW)
│   ├── get_pending_orders()
│   ├── get_order_details()
│   ├── create_invoice_from_order()
│   ├── process_payment()
│   ├── complete_order()
│   ├── get_payment_methods()
│   └── split_bill()
└── customer_display.py (NEW)
    ├── send_order_to_display()
    ├── update_display_status()
    └── clear_display()
```

### Frontend
```
src/apps/cashier/
├── App.jsx (REFACTOR)
├── cashier.css (ENHANCE)
├── components/
│   ├── OrderList.jsx (NEW)
│   ├── OrderDetails.jsx (NEW)
│   ├── PaymentPanel.jsx (NEW)
│   ├── InvoicePreview.jsx (NEW)
│   ├── CustomerInfo.jsx (NEW)
│   ├── CashierHeader.jsx (NEW)
│   └── index.js (NEW)
├── hooks/
│   ├── usePendingOrders.js (NEW)
│   ├── usePaymentProcessor.js (NEW)
│   ├── useInvoiceGenerator.js (NEW)
│   ├── useCashierSession.js (NEW)
│   ├── useQRISPayment.js (NEW)
│   └── index.js (NEW)
└── utils/
    ├── paymentHelpers.js (NEW)
    ├── invoiceHelpers.js (NEW)
    └── index.js (NEW)

src/apps/customer-display/
├── App.jsx (ENHANCE)
├── customer-display.css (ENHANCE)
└── components/
    ├── OrderDisplay.jsx (ENHANCE)
    ├── PaymentStatus.jsx (NEW)
    ├── ThankYouScreen.jsx (NEW)
    └── IdleScreen.jsx (NEW)
```

---

## 💳 Payment Processing Details

### Cash Payment Flow
```javascript
1. Cashier enters amount tendered
2. System calculates change
3. Validate amount >= total
4. Create Payment Entry
5. Link to Sales Invoice
6. Submit payment
7. Print receipt
8. Display change amount
```

### QRIS Payment Flow
```javascript
1. Generate QRIS QR code
2. Display QR code to customer
3. Customer scans and pays
4. Poll payment gateway for status
5. Receive payment confirmation
6. Create Payment Entry
7. Submit payment
8. Print receipt
```

### Split Payment Flow
```javascript
1. Customer requests split
2. Cashier enters first payment (e.g., Cash: 50%)
3. System calculates remaining
4. Enter second payment (e.g., QRIS: 50%)
5. Validate total = 100%
6. Create multiple Payment Entries
7. Submit all payments
8. Print receipt
```

---

## 🧪 Testing Plan

### Unit Testing
- [ ] API endpoints return correct data
- [ ] Payment calculation accuracy
- [ ] Change calculation for cash
- [ ] Invoice generation from order
- [ ] Order completion updates table status

### Integration Testing
- [ ] Waiter → Cashier handoff
- [ ] Kitchen → Cashier status sync
- [ ] Payment → Invoice linking
- [ ] Customer Display realtime updates
- [ ] Multi-browser realtime events

### User Acceptance Testing
- [ ] Complete order flow (Waiter → Kitchen → Cashier)
- [ ] Cash payment with change
- [ ] QRIS payment with QR code
- [ ] Split payment across methods
- [ ] Invoice printing
- [ ] Customer Display during checkout
- [ ] Table status updates

### Performance Testing
- [ ] Handle 10+ concurrent orders
- [ ] Payment processing < 2s
- [ ] Invoice generation < 1s
- [ ] Realtime updates < 500ms
- [ ] Customer Display updates instantly

---

## 📊 Data Models

### POS Order (Enhanced)
```python
{
  "doctype": "POS Order",
  "name": "ORD-001",
  "table": "T-001",
  "customer": "CUST-001",
  "waiter": "USER-001",
  "status": "Draft",  # Draft → Submitted → Completed
  "items": [...],
  "total": 150000,
  "grand_total": 165000,
  "invoice": "INV-001",  # Linked Sales Invoice
  "payment_status": "Unpaid",  # Unpaid → Paid → Partial
  "completion_time": "2026-01-25 14:30:00"
}
```

### Sales Invoice (ERPNext Standard)
```python
{
  "doctype": "Sales Invoice",
  "name": "INV-001",
  "customer": "CUST-001",
  "pos_order": "ORD-001",  # Custom field
  "items": [...],
  "taxes": [...],
  "payments": [...],
  "grand_total": 165000,
  "outstanding_amount": 0,
  "status": "Paid"
}
```

### Payment Entry
```python
{
  "doctype": "Payment Entry",
  "payment_type": "Receive",
  "party_type": "Customer",
  "party": "CUST-001",
  "mode_of_payment": "Cash",
  "paid_amount": 165000,
  "references": [{
    "reference_doctype": "Sales Invoice",
    "reference_name": "INV-001",
    "allocated_amount": 165000
  }]
}
```

---

## 🎨 UI/UX Requirements

### Cashier Console
- **Clean Layout:** Order list | Order details | Payment panel (3 columns)
- **Quick Access:** Keyboard shortcuts for common actions
- **Visual Feedback:** Loading states, success/error messages
- **Print Support:** Receipt printing via browser print API
- **Responsive:** Works on tablets and desktops

### Customer Display
- **Large Fonts:** Readable from 2-3 meters
- **High Contrast:** Dark/light themes for visibility
- **Animations:** Smooth transitions between states
- **Timeout:** Auto-return to idle after 30s
- **Branding:** Company logo and colors

---

## 🔐 Security & Validation

### Payment Validation
- ✅ Verify order is complete (all KOTs served)
- ✅ Validate payment amount >= order total
- ✅ Check payment method is enabled
- ✅ Prevent duplicate payments
- ✅ Verify cashier permissions

### Invoice Validation
- ✅ Customer is required
- ✅ All items have valid pricing
- ✅ Taxes calculated correctly
- ✅ Invoice number is unique
- ✅ Posting date is valid

### Transaction Safety
- ✅ Use database transactions
- ✅ Rollback on errors
- ✅ Log all payment attempts
- ✅ Audit trail for completions

---

## 📈 Performance Optimizations

1. **Caching:** Cache payment methods, customer list
2. **Debouncing:** Debounce search inputs
3. **Lazy Loading:** Load order details on demand
4. **Optimistic UI:** Update UI before API confirmation
5. **Pagination:** Limit pending orders list to 50

---

## 🚀 Deployment Checklist

- [ ] Backend APIs tested
- [ ] Frontend components built
- [ ] Payment methods configured
- [ ] Customer Display profiles set up
- [ ] Printer configured (optional)
- [ ] QRIS gateway configured (if using)
- [ ] User permissions set
- [ ] Training materials created
- [ ] End-to-end testing complete
- [ ] Production deployment

---

## 📝 Documentation Deliverables

1. **API Documentation:** All cashier endpoints with examples
2. **User Guide:** Cashier workflow step-by-step
3. **Admin Guide:** Payment method setup, troubleshooting
4. **Testing Guide:** Test scenarios and expected results
5. **Quick Reference:** Keyboard shortcuts, common tasks

---

## 🎯 Success Criteria

### Must Have (Phase 2 MVP)
- ✅ View pending orders
- ✅ Generate invoice from order
- ✅ Process cash payment
- ✅ Process QRIS payment
- ✅ Complete order and clear table
- ✅ Customer Display shows order
- ✅ Print receipt

### Should Have
- ✅ Split payment
- ✅ Customer selection
- ✅ Payment history
- ✅ Change calculation
- ✅ Keyboard shortcuts

### Nice to Have
- 🔲 Loyalty points
- 🔲 Discount application
- 🔲 Void transaction
- 🔲 Reprint receipt
- 🔲 Email receipt

---

## ⏱️ Timeline Estimate

| Task | Estimated Time | Priority |
|------|---------------|----------|
| Backend APIs | 4-6 hours | HIGH |
| Cashier Components | 6-8 hours | HIGH |
| Cashier Hooks | 3-4 hours | HIGH |
| Customer Display Integration | 2-3 hours | HIGH |
| Payment Processing Logic | 3-4 hours | HIGH |
| Testing | 4-6 hours | HIGH |
| Documentation | 2-3 hours | MEDIUM |
| **Total** | **24-34 hours** | - |

---

## 🔗 Dependencies

### External
- ERPNext v15 (Sales Invoice, Payment Entry)
- QRIS Gateway (if using)
- Printer driver (optional)

### Internal
- Phase 1 complete (Kitchen, Waiter, APIs)
- Customer Display Editor configured
- POS Profile with payment methods

### Configuration
- Mode of Payment setup in ERPNext
- QRIS credentials (if using)
- Customer Display Profile per branch
- Printer settings

---

**Next Step:** Begin Task 1 - Create Backend APIs for Cashier

Would you like me to start implementing the cashier backend APIs?
