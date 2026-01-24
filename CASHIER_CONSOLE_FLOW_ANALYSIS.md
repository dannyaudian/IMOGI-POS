# Cashier Console - Flow Analysis & Error Check

## 📋 Overview
Cashier Console adalah interface untuk kasir di mode **Counter** untuk memproses order dan pembayaran.

---

## 🎭 Domain & Mode Scenarios

### **Domain: Restaurant**

#### **Mode: Table**
❌ **TIDAK COMPATIBLE**  
**Behavior:** Redirect ke `/restaurant/waiter`  
**Reason:** Table mode menggunakan table management dan waiter interface, bukan cashier console

**Flow:**
```
User → /counter/pos
  ↓
Check: imogi_mode = "Table"
  ↓
Redirect → /restaurant/waiter
```

#### **Mode: Counter** 
✅ **PRIMARY USE CASE**  
**Behavior:** Cashier Console berfungsi penuh  
**Reason:** Ini adalah mode utama untuk kasir counter

**Flow:**
```
Order dari Waiter/Kiosk
  ↓
Cashier Console memproses
  ↓
Generate Invoice → Request Payment → Complete
```

**Typical Use Cases:**
- Restaurant dengan counter untuk takeaway
- Food court counter
- Quick service restaurant

#### **Mode: Kiosk**
❌ **TIDAK COMPATIBLE**  
**Behavior:** Redirect ke `/restaurant/waiter?mode=kiosk`  
**Reason:** Kiosk adalah self-service terminal, bukan untuk kasir

**Flow:**
```
User → /counter/pos
  ↓
Check: imogi_mode = "Kiosk"
  ↓
Redirect → /restaurant/waiter?mode=kiosk
```

#### **Mode: Self-Order**
❌ **TIDAK COMPATIBLE**  
**Behavior:** Redirect ke `/restaurant/self-order`  
**Reason:** Self-order untuk customer scanning QR, bukan untuk kasir

**Flow:**
```
User → /counter/pos
  ↓
Check: imogi_mode = "Self-Order"
  ↓
Redirect → /restaurant/self-order
```

---

### **Domain: Retail**

#### **Mode: Table**
⚠️ **NOT APPLICABLE**  
**Behavior:** Redirect ke `/restaurant/waiter` (akan error karena domain mismatch)  
**Reason:** Table mode tidak relevan untuk retail

**Recommended Fix:** Block combination di POS Profile validation

#### **Mode: Counter**
✅ **IDEAL USE CASE**  
**Behavior:** Cashier Console untuk retail checkout  
**Reason:** Perfect fit untuk retail POS

**Flow:**
```
Customer brings items to counter
  ↓
Cashier scans/selects items (via Waiter interface)
  ↓
Order ready with items
  ↓
Cashier Console:
  - Select order
  - Add/find customer (for loyalty)
  - Select payment mode
  - Generate invoice
  - Request payment or direct payment
  ↓
Print receipt
```

**Typical Use Cases:**
- Toko retail
- Minimarket
- Pharmacy counter
- Convenience store

#### **Mode: Kiosk**
✅ **CONDITIONAL USE**  
**Behavior:** Self-service retail kiosk  
**Reason:** Customer self-checkout kemudian kasir supervise

**Flow:**
```
Customer → Self-service kiosk
  ↓
Scan items → Create order
  ↓
Order status: "Ready for Payment"
  ↓
Cashier Console:
  - Monitor kiosk orders
  - Assist if needed
  - Complete payment
```

**Typical Use Cases:**
- Supermarket self-checkout
- Automated retail kiosk

#### **Mode: Self-Order**
⚠️ **NOT TYPICAL**  
**Behavior:** Lebih cocok untuk restaurant  
**Reason:** Self-order biasanya untuk F&B

---

### **Domain: Service**

#### **Mode: Table**
⚠️ **NOT APPLICABLE**  
**Behavior:** Table management tidak relevan untuk service business  
**Reason:** Service domain tidak menggunakan table

#### **Mode: Counter**
✅ **PRIMARY USE CASE**  
**Behavior:** Service counter untuk booking/pembayaran  
**Reason:** Counter adalah main interface untuk service business

**Flow:**
```
Customer books service (salon, spa, clinic)
  ↓
Service completed
  ↓
Cashier Console:
  - Select completed service order
  - Review services rendered
  - Add products sold (if any)
  - Find/create customer
  - Generate invoice
  - Request payment
  ↓
Print receipt
```

**Typical Use Cases:**
- Salon/spa checkout
- Clinic payment counter
- Service center payment
- Repair shop checkout

#### **Mode: Kiosk**
✅ **CONDITIONAL USE**  
**Behavior:** Self-service booking kiosk  
**Reason:** Customer self-book kemudian pay di counter

**Flow:**
```
Customer → Booking kiosk
  ↓
Select service → Book appointment
  ↓
Service completed
  ↓
Cashier Console processes payment
```

**Typical Use Cases:**
- Clinic check-in kiosk
- Salon booking kiosk

#### **Mode: Self-Order**
⚠️ **NOT TYPICAL**  
**Behavior:** Jarang digunakan untuk service  
**Reason:** Service biasanya butuh consultation

---

## 📊 Compatibility Matrix

| Domain / Mode | Table | Counter | Kiosk | Self-Order |
|---------------|-------|---------|-------|------------|
| **Restaurant** | ❌ Redirect | ✅ Primary | ❌ Redirect | ❌ Redirect |
| **Retail** | ⚠️ Invalid | ✅ Ideal | ✅ Conditional | ⚠️ Rare |
| **Service** | ⚠️ Invalid | ✅ Primary | ✅ Conditional | ⚠️ Rare |

**Legend:**
- ✅ Fully supported and recommended
- ⚠️ Technically possible but not recommended
- ❌ Not compatible, will redirect

---

## 🔄 Complete Flow Scenarios

### **Skenario 1: Order Baru dari Waiter (Normal Flow)**
**Tahapan:**
1. ✅ Waiter membuat order di `/restaurant/waiter`
2. ✅ Order masuk dengan status "Ready" 
3. ✅ Kasir refresh/auto-load orders di Cashier Console
4. ✅ Kasir klik order → muncul di sidebar kanan
5. ✅ Kasir pilih Mode of Payment → klik "Generate Invoice"
6. ✅ Invoice terbuat, tombol "Request Payment" aktif
7. ✅ Kasir klik "Request Payment" → Payment Request terkirim ke Customer Display
8. ✅ Customer bayar via QRIS/online
9. ✅ Status berubah → Order selesai

**✅ STATUS: WORKING**

---

### **Skenario 2: Create Order dari Cashier Console**
**Tahapan:**
1. ✅ Kasir klik tombol "Create Order"
2. ✅ Dialog muncul: pilih Order Type (Dine-in/Takeaway) dan Table
3. ✅ Submit → API `create_staff_order` dipanggil
4. ✅ Order baru terbuat dengan status "Ready"
5. ✅ Order muncul di list
6. ✅ Kasir select order → lanjut ke generate invoice

**⚠️ MASALAH DITEMUKAN:**
- Order yang dibuat **KOSONG** (tidak ada items)
- Tidak ada cara untuk **add items** dari Cashier Console
- Kasir tidak bisa edit order untuk menambah items

**🔧 SOLUSI YANG DIBUTUHKAN:**
```javascript
// Opsi 1: Redirect ke waiter interface untuk add items
// Opsi 2: Add item selector di Cashier Console
// Opsi 3: Disable tombol "Create Order" di Counter mode
```

---

### **Skenario 3: Find/Create Customer**
**Tahapan:**
1. ✅ Kasir klik "Find / Create" di Customer section
2. ✅ Modal muncul dengan input phone number
3. ✅ Kasir search by phone → hasil muncul
4. ✅ Kasir pilih customer → customer attached ke order
5. ✅ Customer details muncul di sidebar

**Alternative: Create New Customer**
1. ✅ Kasir input phone number
2. ✅ Klik "Create New"
3. ✅ API `quick_create_customer_with_contact` terpanggil
4. ✅ Customer terbuat → auto attached ke order

**✅ STATUS: WORKING**

---

### **Skenario 4: Print Bill**
**Tahapan:**
1. ✅ Kasir select order
2. ✅ Klik "Print Bill"
3. ✅ API `print_customer_bill` terpanggil
4. ✅ HTML template di-generate
5. ✅ Print via ImogiPrintService (atau fallback ke browser print)

**✅ STATUS: WORKING** (with fallback)

---

### **Skenario 5: Order Filtering & Search**
**Tahapan:**
1. ✅ Default: tampil semua orders dengan status "Ready"
2. ✅ Kasir klik tab "Served" → filter orders dengan status "Served"
3. ✅ Kasir klik tab "All" → tampil semua orders
4. ✅ Kasir ketik di search box → filter by:
   - Order name
   - Table number
   - Customer name
   - Queue number

**✅ STATUS: WORKING**

---

### **Skenario 6: Realtime Updates**
**Tahapan:**
1. ✅ Socket realtime aktif
2. ✅ Event `pos_order_updated` → auto refresh orders
3. ✅ Event `payment_status_updated` → notifikasi payment received

**✅ STATUS: WORKING**

---

### **Skenario 7: Mode Validation & Redirect**
**Tahapan:**
1. ✅ User akses `/counter/pos`
2. ✅ System cek POS Profile mode
3. ✅ Jika mode bukan "Counter" → redirect ke page yang sesuai:
   - Table → `/restaurant/waiter`
   - Kiosk → `/restaurant/waiter?mode=kiosk`
   - Self-Order → `/restaurant/self-order`

**✅ STATUS: WORKING** (baru diperbaiki)

---

## 🎯 Domain-Specific Workflows

### **Restaurant + Counter Mode**

**Complete Workflow:**
```
┌─────────────────────────────────────────────────────────────┐
│                   RESTAURANT - COUNTER MODE                  │
└─────────────────────────────────────────────────────────────┘

[Customer Orders at Counter]
         ↓
[Waiter creates order via /restaurant/waiter]
         ↓
Order Type: Takeaway
Items: Added via item selector
         ↓
[Order saved with status "Ready"]
         ↓
┌──────────────────────────────────────┐
│      CASHIER CONSOLE PROCESSING      │
└──────────────────────────────────────┘
         ↓
[Kasir selects order from "Ready" tab]
         ↓
[Optional: Find/add customer]
         ↓
[Select payment mode: Cash/Card/QRIS]
         ↓
[Generate Invoice]
         ↓
┌─── Payment Branch ───┐
│                      │
├─ Cash → Direct payment → Print receipt
│
├─ Card → Request payment → Card terminal
│
└─ QRIS → Request payment → Customer Display
              ↓
         [Customer scans & pays]
              ↓
         [Payment confirmed]
              ↓
         [Order completed]
```

**Key Points:**
- Order MUST have items (created via waiter interface)
- Support walk-in customers (no customer required)
- Fast checkout process
- Multiple payment methods

---

### **Retail + Counter Mode**

**Complete Workflow:**
```
┌─────────────────────────────────────────────────────────────┐
│                    RETAIL - COUNTER MODE                     │
└─────────────────────────────────────────────────────────────┘

[Customer brings items to counter]
         ↓
[Kasir scans/inputs items]
Via: /restaurant/waiter (reused for item entry)
         ↓
Order Type: Counter Sale
Items: Scanned one by one
         ↓
┌──────────────────────────────────────┐
│      CASHIER CONSOLE PROCESSING      │
└──────────────────────────────────────┘
         ↓
[Order auto-selected or kasir selects]
         ↓
[Find customer by phone (for loyalty)]
         ↓
[Apply discounts/promotions if applicable]
         ↓
[Select payment mode]
         ↓
[Generate Invoice]
         ↓
┌─── Payment Options ───┐
│                       │
├─ Cash → Calculate change → Print receipt
│
├─ Card/E-wallet → Process payment
│
└─ Mixed payment → Split between methods
              ↓
         [Print receipt]
              ↓
         [Customer leaves]
```

**Key Points:**
- Fast scanning/item entry
- Customer loyalty integration
- Discount/promotion support
- Multiple payment methods
- Receipt printing mandatory

---

### **Service + Counter Mode**

**Complete Workflow:**
```
┌─────────────────────────────────────────────────────────────┐
│                   SERVICE - COUNTER MODE                     │
└─────────────────────────────────────────────────────────────┘

[Customer books service earlier]
         ↓
[Service rendered]
         ↓
[Staff marks service as completed]
         ↓
Order: Created with service items + products
Status: "Ready for Payment"
         ↓
┌──────────────────────────────────────┐
│      CASHIER CONSOLE PROCESSING      │
└──────────────────────────────────────┘
         ↓
[Kasir selects completed service order]
         ↓
[Review services rendered]
- Haircut, Spa treatment, etc.
         ↓
[Add retail products if sold]
- Shampoo, products, etc.
         ↓
[Find/create customer]
(Important for service history)
         ↓
[Apply membership discounts]
         ↓
[Generate Invoice]
         ↓
[Request payment]
         ↓
[Print receipt + service details]
```

**Key Points:**
- Order created by service staff
- Customer information important (history/membership)
- Can combine services + products
- Membership/package support
- Detailed receipt with service breakdown

---

### **Restaurant + Table Mode (For Comparison)**

**Why NOT in Cashier Console:**
```
┌─────────────────────────────────────────────────────────────┐
│            RESTAURANT - TABLE MODE (WAITER FLOW)             │
└─────────────────────────────────────────────────────────────┘

[Customer sits at table]
         ↓
[Waiter takes order via /restaurant/waiter]
         ↓
Order linked to: Table 5
         ↓
[Kitchen prepares food]
         ↓
[Food served to table]
         ↓
[Customer requests bill]
         ↓
┌──────────────────────────────────────┐
│    PAYMENT AT TABLE (NOT COUNTER)    │
└──────────────────────────────────────┘
         ↓
[Waiter generates invoice at table]
         ↓
[Customer pays at table or counter]
         ↓
[Table status: Available]
```

**Key Difference:**
- Payment happens at table or via waiter interface
- Cashier Console NOT used in pure table service
- If customer pays at counter → Order already has invoice
- Cashier Console only monitors, doesn't create invoices

---

## 🔀 Cross-Mode Scenarios

### **Hybrid: Restaurant with Table + Counter**

**Scenario:** Restaurant dengan dine-in (table) dan takeaway (counter)

**Setup:**
```
POS Profile 1: Restaurant + Table → /restaurant/waiter
POS Profile 2: Restaurant + Counter → /counter/pos
```

**Flow:**
```
┌──── DINE-IN (Table) ────┐  ┌──── TAKEAWAY (Counter) ────┐
│                          │  │                             │
│ Waiter interface         │  │ Waiter creates order        │
│ Table management         │  │ Order Type: Takeaway        │
│ Kitchen routing          │  │ Status: Ready               │
│ Payment at table         │  │ → Cashier Console           │
│                          │  │ → Generate Invoice          │
│                          │  │ → Payment                   │
└──────────────────────────┘  └─────────────────────────────┘
```

### **Hybrid: Retail with Kiosk + Counter**

**Scenario:** Supermarket dengan self-checkout dan kasir

**Setup:**
```
POS Profile 1: Retail + Kiosk → Self-service checkout
POS Profile 2: Retail + Counter → Cashier supervision
```

**Flow:**
```
┌──── SELF-CHECKOUT (Kiosk) ────┐
│                                │
│ Customer scans items           │
│ System creates order           │
│ Status: "Pending Verification" │
│         ↓                      │
│   ┌─────────────────┐         │
│   │ IF AGE-RESTRICTED         │
│   │ OR ISSUES         │        │
│   └─────────────────┘         │
│         ↓                      │
└─────────┼──────────────────────┘
          ↓
┌──── CASHIER INTERVENTION ────┐
│                               │
│ Cashier Console               │
│ → Verify age                  │
│ → Resolve issues              │
│ → Complete payment            │
└───────────────────────────────┘
```

---

## 🐛 Issues & Bugs Found

### **1. ❌ CRITICAL: Order Creation Without Items**
**Masalah:**
- Tombol "Create Order" membuat order kosong
- Tidak ada UI untuk add items di Cashier Console
- Order kosong tidak bisa di-invoice (akan error)

**Impact:** Kasir tidak bisa create order yang lengkap dari Console

**Recommended Fix:**
```javascript
// Option A: Disable create order button in Counter mode
if (DOMAIN === "Retail" && MODE === "Counter") {
  createOrderBtn?.setAttribute('disabled', 'true');
  createOrderBtn?.setAttribute('title', 'Use waiter interface to create orders with items');
}

// Option B: Redirect to waiter interface for item selection
function openCreateOrderDialog() {
  if (!hasItemSelector) {
    frappe.msgprint({
      title: __('Add Items Required'),
      message: __('Please use the Waiter interface to create orders with items.'),
      indicator: 'blue',
      primary_action: {
        label: __('Go to Waiter Interface'),
        action: () => window.location.href = '/restaurant/waiter'
      }
    });
    return;
  }
  // ... existing code
}
```

---

### **2. ⚠️ WARNING: Invoice Generation Without Validation**
**Masalah:**
- `generateInvoice()` tidak cek apakah order punya items
- Bisa generate invoice untuk order kosong

**Impact:** Error di backend atau invoice dengan grand_total = 0

**Recommended Fix:**
```javascript
function generateInvoice() {
  if (!selectedOrder) return;
  
  // Add validation
  if (!selectedOrder.items || selectedOrder.items.length === 0) {
    showError(__('Cannot generate invoice for order without items'));
    return;
  }
  
  const mop = paymentModeSelect?.value;
  if (!mop) {
    showError(__('Please select a mode of payment'));
    return;
  }
  
  // ... rest of code
}
```

---

### **3. ⚠️ WARNING: Missing Error Handling for Payment**
**Masalah:**
- `requestPayment()` tidak handle case jika customer display offline
- Tidak ada retry mechanism
- Tidak ada visual feedback jika payment request gagal

**Impact:** Payment request bisa gagal silently
### **Core Functionality**
- [ ] Create order with items via waiter → Process in cashier
- [ ] Create empty order → Should show error/warning
- [ ] Generate invoice with valid order → Should succeed
- [ ] Generate invoice with empty order → Should fail gracefully
- [ ] Request payment → Should send to customer display
- [ ] Search/filter orders → Should work correctly
- [ ] Attach customer → Should update order
- [ ] Print bill → Should work with fallback
- [ ] Realtime updates → Should refresh automatically
- [ ] Mode validation → Should redirect if wrong mode

### **Domain & Mode Testing**

**Restaurant + Counter:**
- [ ] Takeaway order → Complete checkout
- [ ] Walk-in customer → No customer required
- [ ] Customer with loyalty → Find & attach customer
- [ ] Multiple payment methods → Cash, Card, QRIS
- [ ] Split payment → (Future feature)

**Retail + Counter:**
- [ ] Scan items → Create order via waiter
- [ ] Apply discount → Coupon/promotion
- [ ] Customer loyalty → Point redemption
- [ ] Fast checkout → < 30 seconds
- [ ] Receipt printing → Mandatory

**Service + Counter:**
- [ ] Service completion → Payment
- [ ] Service + Products → Combined invoice
- [ ] Membership discount → Applied correctly
- [ ] Service history → Customer profile updated
- [ ] Detailed receipt → Service breakdown

**Cross-Mode:**
- [ ] Restaurant Table → Redirect to waiter
- [ ] Restaurant Kiosk → Redirect to kiosk
- [ ] Retail Kiosk → Monitor & supervise
- [ ] Invalid mode combination → Error message

### **Edge Cases**
- [ ] No POS Profile → Error page
- [ ] No active session → Warning (if required)
- [ ] No branch access → Permission denied
- [ ] Network offline → Graceful degradation
- [ ] Customer display offline → Warning but continue
- [ ] Printer offline → Fallback to browser print

### **Performance**
- [ ] Load 100+ orders → < 2 seconds
- [ ] Realtime updates → < 500ms delay
- [ ] Search filtering → Instant
- [ ] Invoice generation → < 3 seconds
- [ ] Payment request → < 2 seconds

### **Security**
- [ ] Role validation → Only Cashier/Manager access
- [ ] Branch isolation → Only see own branch orders
- [ ] Customer data → Protected/encrypted
- [ ] Payment data → Secure transmission
- [ ] Session validation → Auto-logout if needed

---

## 🔮 Future Enhancements by Domain

### **Restaurant**
- [ ] Split bill by person
- [ ] Tip management
- [ ] Delivery integration
- [ ] Kitchen status visibility

### **Retail**
- [ ] Barcode scanner support
- [ ] Inventory check during checkout
- [ ] Customer display with item images
- [ ] Digital receipt (email/SMS)

### **Service**
- [ ] Appointment scheduling integration
- [ ] Package/membership management
- [ ] Therapist/staff allocation
- [ ] Service rating/feedback

---

## 📚 Related Documentation

- [www/README.md](www/README.md) - URL structure & routing
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [api/billing.py](imogi_pos/api/billing.py) - Billing API endpoints
- [api/orders.py](imogi_pos/api/orders.py) - Order management
- [fixtures/custom_field.json](imogi_pos/fixtures/custom_field.json) - Domain & mode definitions

---

**Last Updated:** January 24, 2026
**Status:** Analysis Complete with Domain Scenarios - Awaiting Prioritization
**Maintainer:** IMOGI POS Team
  frappe.call({
    method: 'imogi_pos.api.billing.request_payment',
    args: { sales_invoice: invoiceDoc.name }
  })
  .then((r) => {
    hideLoading();
    if (r && r.message) {
      const paymentRequest = r.message;
      sendToCustomerDisplay(paymentRequest);
      showSuccess(__('Payment request sent. Amount: ') + formatCurrency(amount));
      loadOrders();
    } else {
      showError(__('Failed to create payment request'));
    }
  })
  .fail((err) => {
    hideLoading();
    console.error('[requestPayment] error', err);
    
    // Better error message
    const errorMsg = err?.exc || err?.message || 'Unknown error';
    showError(__('Payment request failed: ') + errorMsg);
  });
}
```

---

### **4. ℹ️ INFO: Tab State Mapping Unclear**
**Masalah:**
- `STATE_MAP` hardcoded: `{'Ready': 'Ready', 'Served': 'Served', 'All': null}`
- Tidak konsisten dengan workflow states yang sebenarnya
- Comment mengatakan "ubah ke 'Ready to Serve' jika begitu di DB"

**Impact:** Filter bisa tidak jalan jika workflow state berbeda

**Recommended Fix:**
```javascript
// Load state mapping from backend
function loadWorkflowStates() {
  frappe.call({
    method: 'imogi_pos.api.billing.get_cashier_workflow_states',
    args: { pos_profile: POS_PROFILE }
  }).then(r => {
    if (r && r.message) {
      // Update STATE_MAP dynamically
      Object.assign(STATE_MAP, r.message);
    }
  });
}
```

---

### **5. ℹ️ INFO: Customer Display Integration Not Verified**
**Masalah:**
- `sendToCustomerDisplay()` tidak ada error handling
- Tidak tahu apakah customer display device aktif
- Tidak ada feedback jika gagal kirim

**Impact:** Silent failure jika customer display offline

**Recommended Fix:**
```javascript
function sendToCustomerDisplay(paymentRequest) {
  // ... existing payload code ...
  
  return frappe.call({
    method: 'imogi_pos.api.customer_display.publish_customer_display_update',
    args: {
      event_type: 'payment_request',
      data: payload
    }
  }).then(r => {
    console.log('✅ Payment request sent to customer display');
    return r;
  }).catch(err => {
    console.warn('⚠️ Failed to send to customer display:', err);
    // Show warning but don't block the process
    showToast(__('Customer display may be offline'), 'warning');
  });
}
```

---

### **6. ℹ️ INFO: Total Calculation Inconsistency**
**Masalah:**
- `updateTotals()` menghitung tax sebagai 11% dari subtotal
- `safeTotal()` mengambil dari berbagai field: `totals`, `grand_total`, `rounded_total`, `total`
- Tidak konsisten dengan perhitungan backend

**Impact:** Bisa ada perbedaan antara total di frontend vs backend

**Recommended Fix:**
```javascript
function updateTotals(order) {
  // Always use backend-calculated totals
  const subtotal = Number(order.net_total || 0);
  const tax = Number(order.total_taxes_and_charges || 0);
  const discount = Number(order.discount_amount || 0);
  const grand = Number(order.grand_total || 0);
  
  // Display with clear breakdown
  subtotalEl.textContent = formatCurrency(subtotal);
  taxAmountEl.textContent = formatCurrency(tax);
  discountAmountEl.textContent = formatCurrency(discount);
  grandTotalEl.textContent = formatCurrency(grand);
}
```

---

## 🎯 Priority Fixes

### **P0 - Critical (Must Fix)**
1. ❌ **Order Creation Without Items** - Disable atau redirect ke waiter interface
2. ⚠️ **Invoice Validation** - Check items before generating invoice

### **P1 - High (Should Fix)**
3. ⚠️ **Payment Error Handling** - Better error messages and retry
4. ⚠️ **Customer Display Feedback** - Show status of customer display

### **P2 - Medium (Nice to Have)**
5. ℹ️ **Dynamic State Mapping** - Load workflow states from backend
6. ℹ️ **Total Calculation** - Use backend totals consistently

---

## 📊 Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CASHIER CONSOLE FLOW                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│ Page Load    │
└──────┬───────┘
       │
       ├─► Check Mode (Counter only)
       ├─► Load Orders (status: Ready)
       ├─► Setup Realtime
       └─► Init Print Service

┌──────────────────────────────────────────────────────────────┐
│                      ORDER PROCESSING                         │
└──────────────────────────────────────────────────────────────┘

[Waiter Creates Order] ──► [Order Ready] ──┐
                                            │
[Cashier Creates Order] ──► [Order Empty] ─┤  ❌ PROBLEM!
                                            │
                                            ▼
                              ┌─────────────────────┐
                              │ Cashier Selects     │
                              │ Order from List     │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Optional:           │
                              │ Find/Add Customer   │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Select Payment Mode │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Generate Invoice    │ ⚠️ Need validation
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Request Payment     │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
          ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
          │ Customer Display │  │ Customer Pays   │  │ Print Bill      │
          │ Shows QR         │  │ (QRIS/Online)   │  │ (Optional)      │
          └─────────────────┘  └────────┬────────┘  └─────────────────┘
                                        │
                              ┌─────────▼──────────┐
                              │ Payment Confirmed  │
                              │ Order Completed    │
                              └────────────────────┘
```

---

## 🔍 Code Quality Issues

### **1. Magic Numbers**
```javascript
const tax = subtotal * 0.11;  // ❌ Hardcoded tax rate
```
**Fix:** Use config from POS Profile

### **2. Inconsistent Error Handling**
```javascript
.fail((err) => {
  console.error('[loadOrders] error', err);
  showError('Failed to load orders');  // ❌ Generic message
})
```
**Fix:** Show specific error from backend

### **3. Mixed Promise Handling**
```javascript
frappe.call().then().fail().always()  // ❌ jQuery style
```
**Fix:** Use consistent async/await or .catch()

---

## ✅ Recommendations

### **Short Term (This Sprint)**
1. ✅ Add validation before invoice generation - **IMPLEMENTED**
2. ✅ Disable "Create Order" button or add warning - **IMPLEMENTED**
3. ✅ Improve error messages - **IMPLEMENTED**
4. ✅ Add loading states for all actions - **IMPLEMENTED**

### **Medium Term (Next Sprint)**
1. ⏳ Add item selector to Cashier Console - **PENDING** (Complex UI change)
2. ✅ Implement retry mechanism for payment - **IMPLEMENTED**
3. ✅ Add customer display status indicator - **IMPLEMENTED**
4. ✅ Load workflow states dynamically - **IMPLEMENTED**

### **Long Term (Backlog)**
1. Add order editing capabilities
2. Implement split payment
3. Add offline mode support
4. Refactor to TypeScript for better type safety

---

## 📝 Testing Checklist

- [ ] Create order with items via waiter → Process in cashier
- [ ] Create empty order → Should show error/warning
- [ ] Generate invoice with valid order → Should succeed
- [ ] Generate invoice with empty order → Should fail gracefully
- [ ] Request payment → Should send to customer display
- [ ] Search/filter orders → Should work correctly
- [ ] Attach customer → Should update order
- [ ] Print bill → Should work with fallback
- [ ] Realtime updates → Should refresh automatically
- [ ] Mode validation → Should redirect if wrong mode

---

**Last Updated:** January 24, 2026
**Status:** Analysis Complete - Awaiting Prioritization
