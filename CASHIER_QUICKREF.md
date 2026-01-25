# Cashier Console - Quick Reference

## 🚀 Quick Start

### Build & Run
```bash
# Development
VITE_APP=cashier-payment npm run dev

# Production build
VITE_APP=cashier-payment npm run build

# Access
http://localhost:8000/cashier-payment
```

---

## 📁 File Structure

```
src/apps/cashier-payment/
├── App.jsx                 # Main app component
├── main.jsx               # React entry point
├── index.html             # HTML template
├── cashier.css            # Complete styles
├── components/
│   ├── OrderList.jsx      # Pending orders sidebar
│   ├── OrderDetails.jsx   # Order info display
│   ├── PaymentPanel.jsx   # Payment processing
│   ├── InvoicePreview.jsx # Receipt modal
│   ├── CustomerInfo.jsx   # Customer selection
│   ├── CashierHeader.jsx  # Top header
│   └── index.js           # Exports
├── hooks/
│   ├── usePaymentProcessor.js  # Payment workflow
│   ├── useCashierSession.js    # Session state
│   ├── useQRISPayment.js       # QRIS handling
│   └── index.js                # Exports
└── utils/
    ├── cashier-utils.js        # Helper functions
    └── index.js                # Exports
```

---

## 🎯 Component API

### OrderList
```jsx
<OrderList
  orders={[]}           // Array of pending orders
  selectedOrder={null}  // Currently selected order name
  onOrderSelect={fn}    // Callback(orderName)
  loading={false}       // Loading state
/>
```

### OrderDetails
```jsx
<OrderDetails
  order={{}}    // POS Order document
  kots={[]}     // Kitchen Order Tickets
  table={{}}    // Restaurant Table
  customer={{}} // Customer
  loading={false}
/>
```

### PaymentPanel
```jsx
<PaymentPanel
  order={{}}              // Current order
  paymentMethods={[]}     // Available methods
  onProcessPayment={fn}   // Callback(paymentData)
  processing={false}      // Processing state
  disabled={false}        // Disable input
/>
```

### CustomerInfo
```jsx
<CustomerInfo
  currentCustomer={null}  // Selected customer
  onCustomerSelect={fn}   // Callback(customer)
  onCustomerCreate={fn}   // Callback(newCustomer)
  disabled={false}
/>
```

---

## 🎣 Hooks Usage

### usePaymentProcessor
```javascript
const {
  processCompletePayment,  // Main function
  processing,              // Boolean state
  currentStep,            // 'invoice' | 'payment' | 'complete'
  result,                 // Payment result
  error,                  // Error message
  reset                   // Reset function
} = usePaymentProcessor()

// Process payment
await processCompletePayment({
  order_name: 'ORD-001',
  customer: 'CUST-001',
  customer_name: 'John Doe',
  mode_of_payment: 'Cash',
  paid_amount: 200000,
  reference_no: '',
  table: 'T-001'
})
```

### useCashierSession
```javascript
const {
  cashier,          // Current user name
  branch,           // Active branch
  sessionStart,     // Session start Date
  sessionDuration   // Duration string (e.g., "2h 15m")
} = useCashierSession()
```

### useQRISPayment
```javascript
const {
  qrCode,              // QR code data
  loading,             // Loading state
  paymentStatus,       // 'pending' | 'success' | 'failed'
  generateQRCode,      // Function(amount, merchantId)
  checkPaymentStatus,  // Function(transactionId)
  reset                // Reset function
} = useQRISPayment()
```

---

## 🛠️ Utility Functions

### Payment
```javascript
import { calculateChange, validatePaymentAmount } from './utils'

// Calculate change
const change = calculateChange(200000, 165000) // 35000

// Validate payment
const { valid, message } = validatePaymentAmount(150000, 165000)
// { valid: false, message: 'Payment amount is less than total' }
```

### Display
```javascript
import { formatCurrency, getTimeElapsed } from './utils'

// Format currency
formatCurrency(165000) // "Rp 165.000"

// Time elapsed
getTimeElapsed('2026-01-25 14:30:00') // "5 minutes ago"
```

### KOT Status
```javascript
import { areAllKOTsServed, getKOTStatusSummary } from './utils'

// Check if all served
areAllKOTsServed(kots) // true/false

// Get summary
getKOTStatusSummary(kots)
// { total: 3, served: 2, preparing: 1, ready: 0 }
```

---

## 🔌 API Endpoints

### Get Pending Orders
```javascript
const { data, isLoading, mutate } = usePendingOrders(branch, filters)
// Auto-refresh: 10 seconds
// data.orders = [...] 
```

### Get Order Details
```javascript
const { data, isLoading } = useOrderDetails(orderName)
// data.order = {...}
// data.kots = [...]
// data.table = {...}
// data.customer = {...}
```

### Create Invoice
```javascript
const { trigger } = useCreateInvoice()
const result = await trigger({
  order_name: 'ORD-001',
  customer: 'CUST-001',
  customer_name: 'John Doe'
})
// result.invoice = 'INV-001'
```

### Process Payment
```javascript
const { trigger } = useProcessPayment()
const result = await trigger({
  invoice_name: 'INV-001',
  mode_of_payment: 'Cash',
  paid_amount: 200000,
  reference_no: ''
})
// result.payment_entry = 'PAY-001'
// result.change_amount = 35000
```

### Complete Order
```javascript
const { trigger } = useCompleteOrder()
await trigger({
  order_name: 'ORD-001',
  invoice_name: 'INV-001',
  payment_name: 'PAY-001'
})
```

---

## 🎨 Styling Classes

### Layout
```css
.cashier-container      /* Main container */
.cashier-header         /* Top header */
.cashier-main           /* 3-column grid */
.cashier-sidebar        /* Left column */
.cashier-center         /* Middle column */
.cashier-payment        /* Right column */
```

### Order List
```css
.order-list-item        /* Order card */
.order-list-item.active /* Selected order */
.status-badge.ready     /* Ready badge */
.status-badge.preparing /* Preparing badge */
```

### Payment
```css
.payment-method-btn           /* Payment method button */
.payment-method-btn.active    /* Selected method */
.amount-input                 /* Amount input */
.quick-amount-btn            /* Quick amount button */
.btn-process-payment         /* Main payment button */
```

### Invoice
```css
.invoice-preview-overlay  /* Modal overlay */
.invoice-preview-modal    /* Modal container */
.invoice-content          /* Printable content */
```

---

## 🔄 Complete Workflow

```
1. Cashier selects order from OrderList
   ↓
2. OrderDetails shows items, KOTs, totals
   ↓
3. CustomerInfo - select/create customer
   ↓
4. PaymentPanel - choose method, enter amount
   ↓
5. Click "Process Payment"
   ↓
6. usePaymentProcessor orchestrates:
   - Create invoice
   - Show processing on display
   - Process payment
   - Complete order
   - Show thank you on display
   ↓
7. InvoicePreview shows receipt
   ↓
8. Print receipt (optional)
   ↓
9. Click "Complete Order"
   ↓
10. Order cleared, table available
```

---

## ⚡ Performance Tips

1. **Auto-refresh intervals:**
   - Pending orders: 10s
   - Payment methods: 60s
   - Order details: On focus only

2. **Avoid unnecessary re-renders:**
   - Use React.memo for expensive components
   - Memoize callbacks with useCallback
   - Memoize computed values with useMemo

3. **Loading states:**
   - Always show spinners during async operations
   - Disable buttons during processing
   - Show progress indicators

---

## 🐛 Common Issues

### "Items not served" error
- Ensure all KOTs have `workflow_state = 'Served'`
- Check KOT status in OrderDetails component

### Payment validation fails
- Verify paid_amount >= grand_total
- Check payment method has configured account

### Customer display not updating
- Verify table has assigned Customer Display Profile
- Check Socket.IO connection
- Ensure realtime events are published

### Receipt not printing
- Check browser print permissions
- Verify print CSS styles
- Test with browser's Print Preview

---

## 📚 Related Documentation

- **Backend APIs:** `PHASE_2_API_IMPLEMENTATION.md`
- **Implementation Plan:** `PHASE_2_IMPLEMENTATION_PLAN.md`
- **Complete Guide:** `CASHIER_REACT_COMPLETE.md`

---

## 🆘 Support

For issues or questions:
1. Check error messages in browser console
2. Review component props and data flow
3. Verify API responses in Network tab
4. Check Frappe error logs
5. Review workflow in documentation

---

**Last Updated:** January 25, 2026
