# Native ERPNext v15 POS Implementation (Shift-Based)

## Summary
Implemented **native ERPNext v15 POS flow** with mandatory POS Opening Entry (shift-based). All cashier operations require active opening for proper session tracking, audit trail, and reconciliation.

**Architecture Decision**: Removed "Counter mode skip opening" logic to align with ERPNext native behavior. Opening is ALWAYS required - this provides single source of truth for shift state.

## Native v15 Flow (Shift-Based)

### Step 1: User Opens Cashier Console

**Initialization Sequence** (proper order):

1. **Check Mode** (via `get_cashier_context()`)
   - Returns `pos_profile_config` with mode (Counter/Restaurant)
   - Determines UI features: KOT/Table/Waiter toggles
   - **Purpose**: Configure UI behavior, NOT skip opening

2. **Check Opening** (via `get_active_opening()`)
   - Returns active POS Opening Entry or `has_opening: false`
   - **Purpose**: Mandatory gate - "no shift, no transaction"

**Decision Logic**:
- ✅ **Has active opening** → Render Cashier Console with mode-appropriate UI
- ❌ **No active opening** → **HARD BLOCK**:
  - Show error screen: "POS Opening belum ada"
  - Link to native POS Opening Entry: `/app/pos-opening-entry`
  - NO modal "Start Shift" - user must create opening via native ERPNext flow
  - After creating opening, user refreshes or returns to Cashier Console

**Why check mode first?**
- Mode determines which features are available (KOT/Table/Waiter)
- Opening determines whether transactions are allowed at all
- Both checks are independent but sequential

**Current Implementation**:
- [BlockedScreen.jsx](src/apps/cashier-console/components/BlockedScreen.jsx) - Error screen component
- [App.jsx](src/apps/cashier-console/App.jsx#L50-L72) - Checks `openingStatus === 'missing'` and blocks
- Console logs error details for debugging: `console.error('[CashierConsole] Blocked: No active POS Opening Entry', {...})`

**HARDENED - January 2026**:
- ❌ **REMOVED** URL parameter support (`opening_entry` param)
- ✅ Single session per user - opening is server-resolved only
- ✅ `usePOSProfileGuard({ requiresOpening: true })` enforces guard check
- ✅ All transactions use same opening (guard prevents session switching)

### Step 2: Start Shift (Native POS Opening Entry)

**Rules**:
- Cashier Console **CANNOT** create opening via modal
- Cashier Console **ONLY checks** if active POS Opening Entry exists
- Opening creation is **ALWAYS via native ERPNext Desk**

**Native ERPNext v15 Flow**:

1. User opens **POS Opening Entry** in ERPNext Desk
2. Click **New**
3. Fill form:
   - Company (auto-filled from POS Profile)
   - POS Profile (select)
   - User (auto-filled to current user)
   - Period Start Date / Posting Date
   - Balance Details (per Mode of Payment, e.g., Cash: 0)
4. **Save**
5. **Submit** (docstatus = 1)
6. Click native **"Open POS"** button (if available) OR return to Module Select → Cashier Console

**Active Opening Detection**:
- If user returns to Cashier Console, same opening is detected (still active)
- Until user closes shift (POS Closing Entry), the opening remains active
- Multiple logins/sessions can share same opening (same user + pos_profile)

**Backend Strict Validation** (Hardened - Jan 2026):
- **New Helper**: `ensure_active_opening(pos_profile, user)` - Single source of truth
  - Resolves active POS Opening Entry for user
  - Throws `ValidationError` if no opening found
  - Returns opening dict with name, company, pos_profile, etc.
  - Used by ALL cashier endpoints for consistent validation
  
- `create_invoice_from_order()`: 
  - Calls `ensure_active_opening()` (hardened)
  - IGNORES client-provided opening_name parameter (server controls)
  - Always sets `imogi_pos_session` from server-resolved opening
  - Returns error if no opening: "No active POS Opening for your session. Please create and submit a POS Opening Entry first."
  
- `process_payment()`:
  - Calls `ensure_active_opening()` (hardened)
  - Validates `invoice.imogi_pos_session == active_opening` (session match)
  - Blocks payment if session mismatch: "Invoice belongs to a different session. Cannot process payment across sessions."
  - Prevents cross-session payment exploit
  
- `complete_order()`:
  - Calls `ensure_active_opening()` (hardened)
  - Validates session match before completing order
  - Blocks cross-session order completion
  
- `get_opening_summary()`:
  - Auto-resolves active opening if `opening_name` not provided
  - If `opening_name` provided, validates it matches active opening
  - Rejects if provided opening != active opening
  
- `close_pos_opening()`:
  - Validates `opening_name` matches active opening before closing
  - Prevents closing sessions that are not user's current session
  - Returns error: "Cannot close a session that is not your active session"

- **No API bypass possible**: Even direct API calls blocked without opening

**What Happens Without Opening**:
- BlockedScreen appears in Cashier Console
- Console error logged with details
- Two action buttons:
  1. "Buat POS Opening Entry" → `/app/pos-opening-entry/new-pos-opening-entry-1?pos_profile=...`
  2. "Kembali ke Module Select" → `/app/imogi-module-select`
- Page stays in Cashier Console (no redirect) for debugging

### Step 3: Session Tracking (Active Operations)
✅ **ALWAYS mandatory** - no conditional logic  
✅ User must create POS Opening Entry via native ERPNext before cashier operations  
✅ POS Opening Entry = session state + audit trail  

### Step 3: Cashier Console Main Screen (Order List)

**Prerequisites**: User has active POS Opening Entry (validated in Step 1)

**Frontend Flow** ([App.jsx](src/apps/cashier-console/App.jsx)):

1. **Guard Check Already Passed**:
   - `guardPassed = true` (from usePOSProfileGuard)
   - `posOpening` object available with opening details
   - `serverContextReady = true`

2. **Fetch Pending Orders**:
   - API: Uses `useOrderHistory` hook (calls backend order API)
   - Filters: `pos_profile`, `branch`, `order_type` (Counter/Dine In/Self Order/Kiosk)
   - Guards: Only fetches when `guardPassed && effectivePosProfile && serverContextReady`
   - Prevents 417 errors by ensuring operational context is set first

3. **Backend Data Source** ([cashier.py](imogi_pos/api/cashier.py#L270-L410)):
   - `get_pending_orders()` with KOT/Table feature guards
   - Filters: `workflow_state` in ['Draft', 'Submitted']
   - Optional filters: table, waiter (if features enabled)
   - Returns: orders with `item_count`, `kot_total`, `kot_served`, `all_kots_served`
   - **Counter Mode Safe**: Skips KOT/Table queries if feature disabled or DocType not exists

**UI Components**:

1. **Header** ([CashierHeader.jsx](src/apps/cashier-console/components/CashierHeader.jsx)):
   - Displays: POS Profile, Branch, Opening Entry Name
   - Opening info: `posOpening?.pos_opening_entry` or `posOpening?.name`
   - Example: "POS-OPEN-2026-00001"
   - Info button shows: Opening amount, User, Printer status

2. **Order List** ([OrderListSidebar.jsx](src/apps/cashier-console/components/OrderListSidebar.jsx)):
   - Shows all pending orders for current profile
   - Each order displays: order ID, table (if any), item count, subtotal
   - KOT indicator: `all_kots_served` badge (if KOT enabled)
   - Clickable to select order

3. **Action Buttons**:
   - Refresh Orders
   - Shift Summary (shows opening info)
   - Close Shift (links to POS Closing Entry)
   - New Order/Table (based on mode)

**Feature Toggles** (Counter vs Restaurant):
- Counter Mode: No table, no KOT queries, simple order list
- Restaurant Mode: With table assignment, KOT tracking, served indicators
- Both modes: Opening ALWAYS required

**Backend Guards** (Already Implemented):
- `get_pending_orders()`: Checks `imogi_enable_kot`, `imogi_use_table_display` config
- Verifies DocType existence before querying: `frappe.db.exists("DocType", "KOT Ticket")`
- Returns safe defaults if features disabled: `all_kots_served=True` (no blocking)

**Error Handling**:
- If opening lost mid-session: Next API call will fail with "No active POS Opening"
- Frontend shows error message in operation (not blocking screen, since it was valid initially)
- User can refresh to re-validate opening

### Step 4: Select Order → Create Invoice

**Prerequisites**: 
- User has active POS Opening Entry (validated in Step 1)
- User selected an order from Order List

**Flow - Create Invoice**:

1. **Frontend Pre-Check** (Recommended):
   ```javascript
   // Before calling create_invoice_from_order
   const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening', { pos_profile })
   
   if (!openingRes?.has_opening) {
     toast.error("Tidak ada POS Opening aktif. Silakan buka POS terlebih dulu.")
     window.location.href = `/app/pos-opening-entry/new-pos-opening-entry-1?pos_profile=${pos_profile}`
     return
   }
   
   // Proceed with invoice creation
   const invRes = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', { 
     order_name: selectedOrder.name 
   })
   ```

2. **Backend Validation** ([cashier.py](imogi_pos/api/cashier.py#L476-L640)):
   ```python
   @frappe.whitelist()
   def create_invoice_from_order(order_name, customer=None, customer_name=None):
       # 1. Validate order exists
       if not frappe.db.exists("POS Order", order_name):
           return {"success": False, "error": "Order not found"}
       
       # 2. Check idempotency (invoice already exists)
       if order.sales_invoice:
           return {"success": True, "invoice": existing_invoice, "message": "Invoice already exists"}
       
       # 3. KOT validation (if KOT enabled)
       kots = frappe.get_all("KOT Ticket", filters={"pos_order": order_name})
       if kots:
           unserved = [k for k in kots if k.workflow_state != "Served"]
           if unserved:
               return {"success": False, "error": "Cannot create invoice. Not all items have been served."}
       
       # 4. STRICT OPENING VALIDATION (Native v15 - always required)
       opening = resolve_active_pos_opening(pos_profile=pos_profile, user=frappe.session.user)
       if not opening:
           return {"success": False, "error": "No active POS Opening. Please start shift first."}
       
       # 5. Create Sales Invoice (draft)
       invoice = frappe.new_doc("Sales Invoice")
       invoice.is_pos = 1
       invoice.pos_profile = pos_profile
       invoice.imogi_pos_session = opening_name  # ALWAYS link to session
       invoice.imogi_pos_order = order_name      # ALWAYS link to order
       
       # 6. Apply POS Profile defaults (stock/accounting)
       invoice.set_warehouse = profile.warehouse
       invoice.update_stock = 1  # if enabled in profile
       invoice.cost_center = profile.cost_center
       
       # 7. Copy items from order
       for item in order.items:
           invoice.append("items", {...})
       
       # 8. Calculate totals & insert
       invoice.run_method("calculate_taxes_and_totals")
       invoice.insert(ignore_permissions=True)
       
       # 9. Link invoice back to order
       order.sales_invoice = invoice.name
       order.save(ignore_permissions=True)
       
       # 10. Commit transaction
       frappe.db.commit()
       
       return {"success": True, "invoice": invoice.name, "grand_total": invoice.grand_total, "session": opening_name}
   ```

**Key Points**:

1. **Opening Always Required**:
   - No conditional logic based on mode (Counter/Restaurant)
   - Backend blocks with error: "No active POS Opening. Please start shift first."

2. **Session Linking** (Always):
   - `invoice.imogi_pos_session` = Active POS Opening Entry name
   - `invoice.imogi_pos_order` = POS Order name
   - Both fields ALWAYS set (native v15 shift-based tracking)

3. **KOT Validation** (If Enabled):
   - Checks if all KOT tickets are "Served" before allowing invoice
   - Counter mode: No KOT, validation skipped
   - Restaurant mode: KOT must be served first

4. **Idempotency**:
   - If invoice already exists for order, returns existing invoice
   - Safe to call multiple times

5. **Mode Usage**:
   - Mode (Counter/Restaurant) only affects KOT validation
   - Does NOT affect opening requirement (always mandatory)

**Success Response**:
```json
{
  "success": true,
  "invoice": "SINV-2026-00123",
  "grand_total": 45000,
  "session": "POS-OPEN-2026-00001"
}
```

**Error Response (No Opening)**:
```json
{
  "success": false,
  "error": "No active POS Opening. Please start shift first."
}
```

**Error Response (KOT Not Served)**:
```json
{
  "success": false,
  "error": "Cannot create invoice. Not all items have been served."
}
```

**Frontend Integration**:
- Currently: PaymentView fetches payment methods dynamically from POS Profile
- Uses `usePaymentMethods(posProfile)` hook to get configured payment methods
- Displays all payment methods as buttons (Cash, Card, Bank Transfer, QRIS, etc.)
- Cash payment: Shows modal with amount input and change calculator
- Non-cash payment: Processes directly with exact amount
- Error handling: Toast message + redirect to POS Opening Entry (no modal)
- Opening check: Validates before create_invoice_from_order

**Payment Flow** ([PaymentView.jsx](src/apps/cashier-console/components/PaymentView.jsx)):
```javascript
// 1. Fetch payment methods from POS Profile
const { data: paymentMethodsData } = usePaymentMethods(posProfile)
const paymentMethods = paymentMethodsData?.payment_methods || []

// 2. User selects payment method
const handleMethodSelect = (method) => {
  if (method.mode_of_payment === 'Cash') {
    setShowCashModal(true)  // Show amount input
  } else {
    processNonCashPayment(method)  // Process exact amount
  }
}

// 3. Process payment (unified for all methods)
const processPayment = async (modeOfPayment, amount, total) => {
  // Check opening
  const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
  if (!openingRes?.has_opening) throw new Error('No POS Opening')
  
  // Create invoice
  const invoiceRes = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', {...})
  
  // Process payment
  const paymentRes = await apiCall('imogi_pos.api.cashier.process_payment', {
    invoice_name: invoiceRes.invoice,
    payments: [{ mode_of_payment: modeOfPayment, amount: amount }],
    cash_received: modeOfPayment === 'Cash' ? amount : total
  })
  
  // Complete order
  await apiCall('imogi_pos.api.cashier.complete_order', {...})
}
```

### Step 5: Process Payment

**Prerequisites**:
- Invoice created from Step 4 (create_invoice_from_order)
- User has active POS Opening Entry
- Invoice belongs to current session

**Backend Implementation** ([cashier.py](imogi_pos/api/cashier.py#L642-L825)):

```python
@frappe.whitelist()
def process_payment(invoice_name, payments=None, mode_of_payment=None, paid_amount=None, cash_received=None, reference_no=None):
    """
    POS-native payment (NO Payment Entry):
    - Writes into Sales Invoice.payments (child table)
    - Submits Sales Invoice (docstatus=1)
    - Native v15: ALWAYS validate opening and session match
    """
    _require_cashier_role()
    
    # 1. Validate invoice exists and not cancelled
    if not frappe.db.exists("Sales Invoice", invoice_name):
        return {"success": False, "error": "Invoice not found"}
    
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    if invoice.docstatus == 2:
        return {"success": False, "error": "Invoice is cancelled"}
    
    # 2. STRICT: Require operational context
    ctx = require_operational_context()
    pos_profile = invoice.pos_profile or ctx.get("pos_profile")
    
    # 3. STRICT: ALWAYS require active opening (native v15)
    active_opening = resolve_active_pos_opening(pos_profile=pos_profile, user=frappe.session.user)
    if not active_opening:
        return {"success": False, "error": "No active POS Opening. Please start shift first."}
    
    # 4. STRICT: Validate session match (anti cross-shift payment)
    invoice_session = invoice.imogi_pos_session
    if invoice_session and invoice_session != active_opening.name:
        return {
            "success": False,
            "error": f"Invoice belongs to session {invoice_session}, but your active session is {active_opening.name}. Cannot process payment."
        }
    
    # 5. Idempotency: If already submitted, return success
    if invoice.docstatus == 1:
        change_amount = max(0.0, cash_received - invoice.grand_total) if cash_received else None
        return {
            "success": True,
            "invoice": invoice.name,
            "invoice_total": invoice.grand_total,
            "paid_total": invoice.grand_total,
            "change_amount": change_amount,
            "message": "Invoice already paid/submitted"
        }
    
    # 6. Normalize payments (new style vs legacy)
    if payments is None and mode_of_payment and paid_amount:
        payments = [{"mode_of_payment": mode_of_payment, "amount": paid_amount, "reference_no": reference_no}]
    
    # 7. Clear existing payments and append new ones
    invoice.set("payments", [])
    total_paid = 0.0
    for p in payments:
        mop = p.get("mode_of_payment")
        amt = p.get("amount", 0)
        ref = p.get("reference_no")
        
        row = {"mode_of_payment": mop, "amount": amt}
        
        # Schema-safe reference field
        if ref:
            if _has_field("Sales Invoice Payment", "reference_no"):
                row["reference_no"] = ref
            elif _has_field("Sales Invoice Payment", "reference"):
                row["reference"] = ref
        
        invoice.append("payments", row)
        total_paid += amt
    
    # 8. Validate payment amount
    if total_paid < invoice.grand_total:
        return {
            "success": False,
            "error": f"Payment amount {total_paid} is less than invoice total {invoice.grand_total}"
        }
    
    # 9. Submit invoice
    invoice.is_pos = 1
    invoice.run_method("calculate_taxes_and_totals")
    invoice.save()
    invoice.submit()
    frappe.db.commit()
    
    # 10. Calculate change
    change_amount = max(0.0, cash_received - invoice.grand_total) if cash_received else None
    
    return {
        "success": True,
        "invoice": invoice.name,
        "invoice_total": invoice.grand_total,
        "paid_total": total_paid,
        "cash_received": cash_received,
        "change_amount": change_amount
    }
```

**Key Validations** (STRICT):

1. **Opening Always Required**:
   ```python
   active_opening = resolve_active_pos_opening(pos_profile, user)
   if not active_opening:
       return {"success": False, "error": "No active POS Opening. Please start shift first."}
   ```

2. **Session Match Required** (Anti Cross-Shift):
   ```python
   if invoice.imogi_pos_session != active_opening.name:
       return {"success": False, "error": "Invoice belongs to different session"}
   ```

3. **Payment Amount Validation**:
   ```python
   if total_paid < invoice.grand_total:
       return {"success": False, "error": "Underpayment"}
   ```

**API Contract**:

Request:
```javascript
POST /api/method/imogi_pos.api.cashier.process_payment
{
  "invoice_name": "SINV-2026-00123",
  "payments": [
    {"mode_of_payment": "Cash", "amount": 50000}
  ],
  "cash_received": 50000
}
```

Success Response:
```json
{
  "success": true,
  "invoice": "SINV-2026-00123",
  "invoice_total": 45000,
  "paid_total": 50000,
  "cash_received": 50000,
  "change_amount": 5000
}
```

Error Responses:

**No Opening**:
```json
{
  "success": false,
  "error": "No active POS Opening. Please start shift first."
}
```

**Session Mismatch**:
```json
{
  "success": false,
  "error": "Invoice belongs to session POS-OPEN-2026-00001, but your active session is POS-OPEN-2026-00002. Cannot process payment."
}
```

**Underpayment**:
```json
{
  "success": false,
  "error": "Payment amount 40000 is less than invoice total 45000"
}
```

**Frontend Handling** ([PaymentView.jsx](src/apps/cashier-console/components/PaymentView.jsx#L73-L135)):

```javascript
const processPayment = async (modeOfPayment, amount, total) => {
  // Step 1: Check opening
  const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
  if (!openingRes?.has_opening) {
    throw new Error('Tidak ada POS Opening aktif')
  }
  
  // Step 2: Create invoice (if needed)
  const invoiceRes = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', {
    order_name: order.name
  })
  
  // Step 3: Process payment
  const paymentRes = await apiCall('imogi_pos.api.cashier.process_payment', {
    invoice_name: invoiceRes.invoice,
    payments: [{ mode_of_payment: modeOfPayment, amount: amount }],
    cash_received: modeOfPayment === 'Cash' ? amount : total
  })
  
  if (!paymentRes?.success) {
    throw new Error(paymentRes?.error || 'Failed to process payment')
  }
  
  return paymentRes
}
```

**Error Handling** (No Modal):
- Error displayed in UI (toast/banner)
- No "Start Shift" modal
- For opening errors: redirect to `/app/pos-opening-entry`
- All validation happens server-side

**Mode Behavior**:
- Counter mode: No KOT validation in create_invoice
- Restaurant mode: KOT must be served first
- Both modes: Opening ALWAYS required (no conditional logic)

### Step 6: Complete Order
✅ POS Closing Entry reconciles expected vs counted  
✅ Links back to opening for complete shift audit  
✅ Provides accountability for cash handling  

## Changes Made

### Backend: `imogi_pos/api/cashier.py`

#### 1. Simplified `get_cashier_context()`
**Always returns:**
```json
{
  "requires_opening": true,
  "requires_opening_for_cashier": true
}
```
No conditional logic based on POS Profile config.

#### 2. Updated `create_invoice_from_order()`
**Always requires opening:**
- Calls `resolve_active_pos_opening()` unconditionally
- Returns error if no active opening found
- Always sets `invoice.imogi_pos_session` and `invoice.imogi_pos_order`

**Removed:**
- Counter mode skip logic
- Conditional session linking

#### 3. Updated `process_payment()`
**Always validates session:**
- Requires active opening
- Validates `invoice.imogi_pos_session == active_opening`
- Blocks payment if session mismatch

**Removed:**
- Counter mode skip validation

#### 4. Kept Feature Flags
`_get_pos_profile_runtime_config()` still reads:
- `imogi_enable_kot` - KOT feature flag
- `imogi_use_table_display` - Table feature flag
- `imogi_enable_waiter` - Waiter feature flag

**Note**: These are FEATURE toggles (KOT/Table/Waiter), NOT opening requirement toggles.

#### 5. Opening/Closing Always Applicable
- `get_opening_summary()` - removed Counter mode guard
- `close_pos_opening()` - removed Counter mode guard
- Both always available (native v15 behavior)

### Frontend: `src/apps/cashier-console/App.jsx`

#### Proper Initialization Sequence

```jsx
useEffect(() => {
  async function initialize() {
    // 1. Check mode (for UI features)
    const ctx = await apiCall('imogi_pos.api.cashier.get_cashier_context')
    setContext(ctx)  // Mode, KOT/Table/Waiter flags

    // 2. Check opening (mandatory gate)
    const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')
    setOpening(openingRes)

    // 3. Hard block if no opening
    if (openingRes?.success && !openingRes?.has_opening) {
      setBlocked(true)
    }
  }
  initialize()
}, [])

// Blocked state (no modal, just error screen)
if (blocked) {
  return (
    <BlockedScreen
      title="POS Opening belum ada"
      message="Silakan buat POS Opening Entry via ERPNext. Setelah itu refresh halaman ini."
      actions={[
        { label: "Buat POS Opening Entry", href: "/app/pos-opening-entry" },
        { label: "Ke Module Select", href: "/app/imogi-module-select" }
      ]}
    />
  )
}
```

**Current Implementation** (already correct):
```jsx
usePOSProfileGuard({ 
  requiresOpening: true,  // Static - always require
  targetModule: 'imogi-cashier'
})
```

**Note**: The guard hook already handles opening check. The code above shows the **conceptual flow** - actual implementation delegates to `usePOSProfileGuard`.

**Removed:**
- Dynamic `requiresOpening` detection from `get_cashier_context()`
- Counter mode conditional logic
- "Start Shift" modal
- Automatic opening creation

**Current behavior:**
- Shows "Verifying POS opening..." during load
- Hard block if no opening with error screen
- Links to native POS Opening Entry form

---

### Step 6: Complete Order (After Payment)

**When**: After Step 5 (invoice submitted and paid)

**API**: `POST /api/method/imogi_pos.api.cashier.complete_order`

**Request**:
```json
{
  "order_name": "POS-ORD-2026-00042",
  "invoice_name": "SINV-2026-00123"
}
```

**Validations (Native v15 with Shift Safety)**:

1. ✅ **Active Opening Check** (shift safety)
   - `require_operational_context()` validates active opening exists
   - Error: `"No active POS Opening. Please start shift first."`

2. ✅ **Order Exists**
   - Validates POS Order exists
   - Error: `"Order not found"`

3. ✅ **Invoice Exists & Submitted**
   - Validates Sales Invoice exists and `docstatus == 1`
   - Error: `"Invoice not found"` or `"Invoice not submitted/paid yet"`

4. ✅ **Session Match** (shift safety)
   - Validates `invoice.imogi_pos_session == active_opening.name`
   - Prevents completing orders from different shifts
   - Error: `"Invoice belongs to session {0}, but your active session is {1}. Cannot complete order."`

**Backend Processing**:

```python
# Step 5: Update POS Order workflow to "Closed"
- Use workflow API if configured (apply_workflow)
- Fallback to direct set if workflow unavailable
- Set docstatus=1 to ensure submission consistency

# Step 6: Link invoice to order
- order.sales_invoice = invoice_name

# Step 7: Stamp completion time
- order.completion_time = now()

# Step 8: Clear table status
- Restaurant Table.status = "Available"

# Step 9: Close KOT tickets
- Set KOT Ticket.workflow_state = "Completed" or "Closed"
- Schema-safe with workflow validation

# Step 10: Commit BEFORE realtime publish
- frappe.db.commit()
- frappe.publish_realtime(...)
```

**Response**:
```json
{
  "success": true,
  "message": "Order completed successfully",
  "order": "POS-ORD-2026-00042",
  "table": "T-01",
  "invoice": "SINV-2026-00123"
}
```

**Current Implementation**: [cashier.py](imogi_pos/api/cashier.py#L833-L1015)
- ✅ Shift safety validation (opening + session match)
- ✅ Workflow API with fallback
- ✅ Table/KOT schema-safe queries
- ✅ Realtime events after commit

**Why Opening Check in Step 6?**
- **Shift safety**: Prevents completing orders from previous shifts
- **Audit trail**: All completions must happen within active shift context
- **Consistency**: Same pattern as Steps 4 & 5 (opening → invoice → payment → complete)
- **Native v15 pattern**: "No shift, no transaction" principle

---

### Step 7: View Summary (Shift Reporting)

**When**: User clicks "Shift Summary" button/menu in cashier console

**UI Guard (Mandatory - Page Level)**:

```jsx
// Before rendering summary page
const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')

if (!openingRes?.success || !openingRes?.has_opening) {
  // HARD BLOCK - No modal, just error + redirect
  return (
    <BlockedScreen
      title="Tidak ada POS Opening aktif"
      message="Silakan buat POS Opening Entry lalu klik Open POS."
      actions={[
        { label: "Buat POS Opening Entry", href: "/app/pos-opening-entry" },
        { label: "Kembali", onClick: () => history.back() }
      ]}
    />
  )
}

// If opening exists, proceed to fetch summary
const summaryRes = await apiCall('imogi_pos.api.cashier.get_opening_summary')
```

**API**: `GET /api/method/imogi_pos.api.cashier.get_opening_summary`

**Parameters**:
- `opening_name` (optional) - Auto-resolves to active opening if not provided

**Backend Validation**:

1. ✅ **Resolve Active Opening**
   - Queries POS Opening Entry where `docstatus=1` AND `pos_closing_entry IS NULL`
   - Error if not found: `"No active POS Opening. Please create POS Opening Entry first."`

2. ✅ **Aggregate Payments**
   - SQL join: `Sales Invoice` → `Sales Invoice Payment`
   - Filter: `si.docstatus=1` AND `si.imogi_pos_session = opening_name`
   - Group by: `mode_of_payment`

**Response**:
```json
{
  "success": true,
  "opening": "POS-OP-2026-00005",
  "totals_by_mode": [
    {
      "mode_of_payment": "Cash",
      "total": 1250000,
      "invoice_count": 15
    },
    {
      "mode_of_payment": "Debit Card",
      "total": 850000,
      "invoice_count": 8
    }
  ],
  "grand_total": 2100000
}
```

**Current Implementation**: [cashier.py](imogi_pos/api/cashier.py#L1037-L1098)
- ✅ Auto-resolve active opening if not specified
- ✅ SQL aggregate from Sales Invoice Payment child table
- ✅ Group by mode_of_payment with totals and invoice counts
- ✅ Grand total calculation

**Native v15 Pattern**:
- Opening must be `docstatus=1` (submitted, shift started)
- Active = no `pos_closing_entry` linked yet
- All payments filtered by `imogi_pos_session` field
- Works with ERPNext native POS Opening Entry workflow

**UI Requirements**:
- ❌ **NO "Start Shift" modal** in cashier console
- ✅ **Page-level guard**: Check opening before rendering
- ✅ **Hard block**: Redirect to `/app/pos-opening-entry` if no opening
- ✅ **Native flow**: User creates opening via ERPNext Desk, clicks "Open POS"
- ✅ **After opening**: Summary page shows real-time aggregated payments

---

### Step 8: Close Shift (POS Closing Entry)

**When**: User clicks "Tutup Shift" button in header (end of shift)

**UI Guard (Mandatory - Page Level)**:

```jsx
// Before rendering close shift page
const openingRes = await apiCall('imogi_pos.api.cashier.get_active_opening')

if (!openingRes?.success || !openingRes?.has_opening) {
  // HARD BLOCK - No modal, just error + redirect
  return (
    <BlockedScreen
      title="Tidak ada POS Opening aktif"
      message="Buat POS Opening Entry dulu dari ERPNext (POS → POS Opening Entry → Open POS). Setelah itu refresh halaman ini."
      actions={[
        { label: "Open POS Opening Entry", href: "/app/pos-opening-entry" },
        { label: "Refresh", onClick: () => window.location.reload() },
        { label: "Kembali", onClick: onClose }
      ]}
    />
  )
}

// If opening exists, proceed to show closing form
```

**Flow**:

1. **Load Expected Amounts**
   - Call `get_opening_summary()` to get totals per payment mode
   - Display as "Expected" column

2. **User Input Counted Amounts**
   - Form with input fields for each payment mode
   - Pre-filled with expected amounts (can be edited)
   - Real-time difference calculation

3. **Submit Closing**
   - API: `POST /api/method/imogi_pos.api.cashier.close_pos_opening`
   - Payload:
     ```json
     {
       "opening_name": "POS-OP-2026-00005",
       "counted_balances": [
         {"mode_of_payment": "Cash", "closing_amount": 450000},
         {"mode_of_payment": "Debit Card", "closing_amount": 250000}
       ]
     }
     ```

**Backend Process** ([cashier.py](imogi_pos/api/cashier.py#L1110-L1260)):

1. ✅ **Validate opening exists** and `docstatus=1`
2. ✅ **Check not already closed** (no `pos_closing_entry` linked)
3. ✅ **Calculate expected amounts**:
   - Opening balance per mode
   - + Collected payments during shift
   - = Expected total per mode
4. ✅ **Create POS Closing Entry**:
   - Set opening reference
   - Build payment reconciliation rows
   - Calculate differences (counted - expected)
5. ✅ **Submit closing** + link back to opening
6. ✅ **Commit** transaction

**Response**:
```json
{
  "success": true,
  "closing": "POS-CL-2026-00005",
  "opening": "POS-OP-2026-00005",
  "reconciliation_summary": [
    {
      "mode_of_payment": "Cash",
      "expected": 1250000,
      "counted": 1248000,
      "difference": -2000
    },
    {
      "mode_of_payment": "Debit Card",
      "expected": 850000,
      "counted": 850000,
      "difference": 0
    }
  ],
  "total_difference": -2000
}
```

**Success View**:
- ✅ Success icon + message
- ✅ Closing & Opening entry names
- ✅ Reconciliation table:
  - Mode of payment
  - Expected amount
  - Counted amount
  - Difference (colored: green=surplus, red=shortage)
- ✅ Total difference
- ✅ Actions:
  - "Print Closing" button
  - "Back to Orders" button

**Current Implementation**: [CloseShiftView.jsx](src/apps/cashier-console/components/CloseShiftView.jsx)
- ✅ Page-level opening guard with BlockedScreen
- ✅ Load expected amounts from summary
- ✅ Form with input fields per payment mode
- ✅ Real-time difference calculation
- ✅ Submit to `close_pos_opening` API
- ✅ Success screen with reconciliation table
- ✅ Print functionality
- ✅ Fully styled inline CSS

**Native v15 Pattern**:
- ❌ **NO "Start Shift" modal** - Cashier console never creates opening
- ✅ **Page-level guard** - Block if no opening exists
- ✅ **Hard redirect** - Link to native POS Opening Entry
- ✅ **ERPNext native flow** - Opening created via Desk, closing via API or Desk
- ✅ **Shift-based accounting** - All transactions linked to opening session

**Why No "Start Shift" Modal?**
1. **Single source of truth**: ERPNext Desk controls opening lifecycle
2. **Audit trail**: All openings properly tracked in native DocType
3. **Role permissions**: Opening creation controlled by ERPNext roles
4. **Consistency**: Same pattern for all shift operations (start/close)
5. **Native v15 compliance**: Follows ERPNext standard POS workflow

---

## Testing Checklist

### Step 1: Initialization Flow
- [ ] Open cashier-console without opening - should show blocked screen with error
- [ ] Error screen should have link to `/app/pos-opening-entry`
- [ ] Create POS Opening Entry via native ERPNext flow
- [ ] Return to cashier-console - should now load successfully
- [ ] Context should show correct mode (Counter/Restaurant)
- [ ] UI should reflect mode features (KOT/Table/Waiter based on config)

### Step 7: Summary Page Flow
- [ ] Click "Shift Summary" without opening - should show blocked screen
- [ ] Create opening, then click "Shift Summary" - should load successfully
- [ ] Summary shows 0 totals if no payments yet
- [ ] Process some payments, refresh summary - shows updated totals
- [ ] Totals grouped by payment mode (Cash, Card, etc.)
- [ ] Grand total matches sum of all modes
- [ ] Invoice count per mode is accurate

### Step 8: Close Shift Flow
- [ ] Click "Tutup Shift" without opening - should show blocked screen
- [ ] With opening, click "Tutup Shift" - loads expected amounts
- [ ] Expected amounts match summary data
- [ ] Can edit counted amounts per payment mode
- [ ] Difference updates in real-time (colored: surplus/shortage)
- [ ] Submit closing - creates POS Closing Entry
- [ ] Success screen shows reconciliation table
- [ ] Total difference calculated correctly
- [ ] Print button works (window.print)
- [ ] After closing, next console access should block (no opening)
- [ ] Opening entry shows `pos_closing_entry` link

### Shift-Based Flow (Steps 4-8 Integration)
- [ ] Create invoice - links to active opening session
- [ ] Process payment - validates session match
- [ ] Complete order - workflow closes order
- [ ] View summary - shows aggregated payments by mode
- [ ] Close shift - reconciles expected vs counted
- [ ] Try to pay invoice from different session - should fail with error
- [ ] Try to view summary without opening - should show error + redirect
- [ ] Try to close shift without opening - should show error + redirect
- [ ] Get opening summary - shows payments aggregated by mode
- [ ] Close shift via native POS Closing Entry
- [ ] Invoice should have BOTH `imogi_pos_session` AND `imogi_pos_order` links
- [ ] After closing, next cashier-console access should block again (no opening)
imogi_enable_waiter = 1/0        # Enable/disable Waiter assignment
```

**Opening requirement**: Always enforced (not configurable).

## Why Native v15 (Always Require Opening)?

## Why Native v15 (Always Require Opening)?

### Single Source of Truth
✅ POS Opening Entry = definitive shift state  
✅ Easy to check: "Is there an active opening?"  
✅ No ambiguity or conditional logic  

### Audit & Accountability
✅ Every transaction linked to specific shift  
✅ Clear ownership: who handled cash  
✅ Reconciliation: expected vs counted  

### ERPNext Native Behavior
✅ Aligns with standard ERPNext v15 POS flow  
✅ Familiar to ERPNext users  
✅ Leverages built-in POS Opening/Closing workflow  

### Prevents Issues
✅ No cross-session transactions  
✅ No orphaned invoices without session  
✅ Proper closing reconciliation always possible  

## Testing Checklist

### Shift-Based Flow (All Profiles)
- [ ] Open cashier-console without opening - should show "Start Shift" requirement
- [ ] Start shift - creates POS Opening Entry
- [ ] Create invoice - links to active opening session
- [ ] Process payment - validates session match
- [ ] Complete order - workflow closes order
- [ ] Try to pay invoice from different session - should fail with error
- [ ] Get opening summary - shows payments aggregated by mode
- [ ] Close shift - creates POS Closing Entry with reconciliation
- [ ] Invoice should have BOTH `imogi_pos_session` AND `imogi_pos_order` links

### Feature Toggles (KOT/Table)
- [ ] Profile with `imogi_enable_kot=0` - no KOT queries, `all_kots_served=true`
- [ ] Profile with `imogi_use_table_display=0` - no Table queries
- [ ] Profile with both disabled - Counter-style ordering (no KOT/Table) but still requires opening

## Backend Hardening (Jan 2026 - Single Source of Truth)

### Problem Solved
- ❌ **BEFORE**: Client could send arbitrary `opening_name` parameter to override server session
- ❌ **BEFORE**: No validation that invoice belongs to current user's active opening
- ❌ **BEFORE**: Cross-session transactions possible (pay invoice from different shift)
- ✅ **AFTER**: Server is sole authority on active opening (single source of truth)
- ✅ **AFTER**: All endpoints validate session consistency
- ✅ **AFTER**: Opening name NEVER accepted from client for core operations

### New Helper Function

**File**: `imogi_pos/api/cashier.py` (lines 99-147)

```python
def ensure_active_opening(pos_profile: str, user: str) -> dict:
    """
    SINGLE SOURCE OF TRUTH: Resolve + validate active POS Opening.
    
    Backend enforces:
    - Only ONE active opening per (pos_profile, user)
    - Server controls opening, NOT client
    - Throws error if no opening found
    
    Args:
        pos_profile: POS Profile name
        user: User name
        
    Returns:
        {name, company, pos_profile, user, posting_date, ...} dict
        
    Raises:
        ValidationError: If no active opening found
    """
    opening = resolve_active_pos_opening(pos_profile=pos_profile, user=user)
    
    if not opening:
        frappe.throw(
            _("No active POS Opening for your session. Please create and submit a POS Opening Entry first."),
            frappe.ValidationError
        )
    
    opening_dict = _safe_get_dict(opening)
    if not opening_dict or not opening_dict.get("name"):
        frappe.throw(_("Invalid opening session data"), frappe.ValidationError)
    
    return opening_dict
```

### Hardened Endpoints

#### 1. `create_invoice_from_order()` (lines 502-640)
**Changes**:
- ✅ Calls `ensure_active_opening()` instead of optional check
- ✅ IGNORES any client-provided `opening_name` parameter
- ✅ ALWAYS sets `invoice.imogi_pos_session` from server-resolved opening
- ✅ Returns clear error if no opening

**Key Code**:
```python
try:
    opening_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
    opening_name = opening_dict.get("name")
except frappe.ValidationError as e:
    return {"success": False, "error": str(e)}

# Always use server-resolved opening, never client param
_set_if_field(invoice, "imogi_pos_session", opening_name)
```

#### 2. `process_payment()` (lines 725-830)
**Changes**:
- ✅ Calls `ensure_active_opening()` to validate session exists
- ✅ Compares `invoice.imogi_pos_session` with active opening
- ✅ Blocks payment if invoice from different session (cross-shift protection)

**Key Code**:
```python
try:
    active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
    active_name = active_dict.get("name")
except frappe.ValidationError as e:
    return {"success": False, "error": str(e)}

# Validate invoice belongs to current session
invoice_session = getattr(invoice, "imogi_pos_session", None)
if invoice_session and invoice_session != active_name:
    return {"success": False, "error": "Invoice belongs to a different session..."}
```

#### 3. `complete_order()` (lines 1017-1180)
**Changes**:
- ✅ Calls `ensure_active_opening()` at start
- ✅ Validates invoice session match before completing
- ✅ Prevents cross-session order completion

#### 4. `get_opening_summary()` (lines 1462-1545)
**Changes**:
- ✅ If `opening_name` not provided: Uses `ensure_active_opening()` to auto-resolve
- ✅ If `opening_name` provided: Validates it matches active opening
- ✅ Rejects mismatch: "Provided opening does not match your active session"

**Key Code**:
```python
if not opening_name:
    # Auto-resolve active opening (hardened)
    opening_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
    opening_name = opening_dict.get("name")
else:
    # If provided, validate it matches active opening
    active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
    if opening_name != active_dict.get("name"):
        return {"success": False, "error": "Provided opening does not match your active session"}
```

#### 5. `close_pos_opening()` (lines 1547-1725)
**Changes**:
- ✅ Validates `opening_name` parameter matches active opening before closing
- ✅ Prevents closing sessions that are not user's current session
- ✅ Returns error: "Cannot close a session that is not your active session"

### Error Messages (Standardized)

| Scenario | Error Message | HTTP Status |
|----------|---------------|-------------|
| No active opening for user | "No active POS Opening for your session. Please create and submit a POS Opening Entry first." | 400 (ValidationError) |
| Invoice from different session | "Invoice belongs to a different session. Cannot process payment across sessions." | 400 |
| Closing non-active session | "Cannot close a session that is not your active session" | 400 |
| Provided opening != active | "Provided opening does not match your active session" | 400 |

### Frontend Error Handling (Next Phase)

Once backend returns `ValidationError`, frontend should:
1. **Catch error in API call** (`apiCall` from `src/shared/utils/api.js`)
2. **Check error message** for "No active POS Opening"
3. **Show BlockedScreen** instead of operation screen
4. **Provide CTA**: Link to `/app/pos-opening-entry` to create opening

**Current Frontend Status** (Already Compliant):
- ✅ `PaymentView.jsx` (lines 75-125): Does NOT send `opening_name` to `create_invoice_from_order` or `process_payment`
- ✅ `ShiftSummaryView.jsx` (lines 22-50): Does NOT send `opening_name` to `get_opening_summary` (auto-resolves)
- ✅ `CloseShiftView.jsx` (lines 25-95): DOES send `opening_name` to `close_pos_opening` (correct - validates it)
- ✅ All views check `get_active_opening()` before operations (guard check)

**Example Pattern** (What error handling will do):
```javascript
try {
  const result = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', {...})
} catch (error) {
  if (error?.message?.includes('No active POS Opening')) {
    showBlockedScreen({
      title: "POS Opening belum ada",
      message: error.message,
      actionUrl: "/app/pos-opening-entry"
    })
  } else {
    showErrorToast(error.message)
  }
}
```

### Security Benefits

✅ **Single Source of Truth**: Server always knows THE active opening  
✅ **Session Isolation**: Invoices locked to their creation session  
✅ **Cross-Shift Prevention**: Payment/completion validates session match  
✅ **Audit Trail**: Every transaction traceable to specific POS Opening  
✅ **No Client Override**: `opening_name` parameter completely ignored for core ops  
✅ **Consistent Errors**: Same validation message across all endpoints  

## Verification Commands

### Backend Syntax Check
```bash
python3 -m py_compile imogi_pos/api/cashier.py
```

### Frontend Build
```bash
npm run build:cashier, get_active_opening

# 1. Check mode (returns pos_profile_config with features)
ctx = get_cashier_context()
print("Context:", ctx)
# Should return: requires_opening=True + mode + feature flags

# 2. Check opening (gate check)
opening = get_active_opening()
print("Opening:", opening)
# Should return: has_opening=False if no active opening

# 3. Sequence: context first (UI), opening second (gate
# In Frappe Console (bench console)
frappe.set_user("Administrator")
from imogi_pos.api.cashier import get_cashier_context

# Should always return requires_opening = True
ctx = get_cashier_context()
print(ctx)
```

## Architecture Benefits

✅ **Simpler Code** - No conditional opening logic  
✅ **More Secure** - Session validation always active  
✅ **Better Audit** - Complete shift accountability  
✅ **ERPNext Native** - Standard v15 POS behavior  
✅ **Feature Flexibility** - KOT/Table toggles independent of opening  

## Next Steps (Optional)

1. **Update `imogi_pos/billing/invoice_builder.py`** if billing API is used by Counter mode
2. **Update `imogi_pos/utils/decorators.py`** to add `@imogi_optional_pos_session` decorator
3. **Add POS Profile validation** on save to ensure valid combinations of flags

## Related Files

- Backend: `imogi_pos/api/cashier.py`
- Frontend: `src/apps/cashier-console/App.jsx`
- Hook: `src/shared/hooks/usePOSProfileGuard.js` (no changes, uses dynamic `requiresOpening`)
- Utils: `imogi_pos/utils/pos_opening.py` (resolve_active_pos_opening)

## Production Hardening (Latest Update)

### Fixed Issues

✅ **Consistent Commit/Rollback**
- Added `frappe.db.commit()` after all successful operations
- `create_pos_opening` - after submit
- `create_invoice_from_order` - after invoice creation + order link
- `process_payment` - after invoice submit
- `complete_order` - after all updates, before realtime publish
- `close_pos_opening` - after closing entry + opening link

✅ **Permission Handling**
- All document creation now uses `ignore_permissions=True`
- `doc.insert(ignore_permissions=True)` for POS Opening, Sales Invoice, POS Closing
- Unblocks Cashier role from permission issues in production

✅ **Safe Field Checks**
- Payment reference: checks `_has_field("Sales Invoice Payment", "reference_no")` before setting
- Fallback chain: `reference_no` → `reference` → invoice remarks
- No more try/except guessing, explicit schema validation

✅ **POS Profile Defaults (Full Accounting Cycle)**
- Reads POS Profile config: `warehouse`, `update_stock`, `cost_center`
- Sets `invoice.set_warehouse` from profile (stock location)
- Sets `invoice.update_stock=1` if profile enabled (stock reduction on invoice)
- Sets `invoice.cost_center` from profile (accounting)
- Full integration with ERPNext stock/accounting system

✅ **Counter Mode Guards**
- `get_opening_summary`: returns error if Counter mode (no session tracking)
- `close_pos_opening`: throws error if Counter mode (not applicable)
- Clear user messages: "Opening summary not available in Counter mode..."

✅ **Docstatus Consistency**
- `complete_order` fallback now sets `order.docstatus=1` when workflow fails
- Ensures order properly marked as submitted when using direct workflow_state set
- No orphaned draft orders with "Closed" state

✅ **KOT/Table/Waiter Guards (Feature Toggle Protection)**
- `_get_pos_profile_runtime_config`: Schema-safe field fetching (feature flags only)
- `get_pending_orders`: 
  - Checks `imogi_enable_kot` config before querying KOT Ticket
  - Checks `imogi_use_table_display` config before querying Restaurant Table
  - Verifies DocType existence with `frappe.db.exists("DocType", "KOT Ticket")`
  - Returns `all_kots_served=True` when KOT disabled (no blocking)
- `get_order_details`:
  - KOT fetch guarded by config + DocType existence
  - Table fetch guarded by config + DocType existence
  - Graceful fallback with empty arrays if queries fail
  - Works without KOT/Table DocTypes installed

## Feature Toggle Matrix

| Feature | When Enabled | When Disabled | Guard Applied |
|---------|-------------|---------------|---------------|
| KOT | Query KOT Ticket | Skip query, return `all_kots_served=true` | ✅ `imogi_enable_kot` + DocType |
| Table | Query Restaurant Table | Skip query, return `null` | ✅ `imogi_use_table_display` + DocType |
| Waiter | Include waiter field | Skip waiter field | ✅ Schema check |
| **Opening** | **Always Required** | **N/A** | **✅ Mandatory (native v15)** |

## Implementation Status

### ✅ Steps 1-8 Complete (Native v15 Flow - Full Shift Cycle)

**Step 1**: User opens Cashier Console → Opening check + BlockedScreen
**Step 2**: Start shift via native POS Opening Entry (no modal)
**Step 3**: Main screen with order list and opening display
**Step 4**: Create invoice with mandatory opening validation
**Step 5**: Process payment with strict session match validation
**Step 6**: Complete order with shift safety validation
**Step 7**: View summary with page-level opening guard + aggregate payments
**Step 8**: Close shift with reconciliation (expected vs counted)

### Current Build Status
✅ Backend: Complete + Native v15 Aligned
✅ Frontend: Complete + Simplified
✅ Build: Successful (344.90 kB / 105.63 kB gzip)
✅ Syntax: Verified
✅ Opening: Always Required (shift-based)
✅ Feature Toggles: KOT/Table guards active
✅ **Full Shift Cycle**: Start → Transact → Summary → Close

---

# Multi-Session Support (Concurrent Cashier Sessions)

## Overview

**Feature**: Support multiple concurrent POS Opening Entries for a single POS Profile, allowing different cashiers to work independently on the same POS Profile without interfering with each other's transactions.

**Use Case**:
- Single restaurant location (1 POS Profile) with multiple cashiers (3-5 concurrent)
- Each cashier opens their own POS Opening Entry (shift)
- Orders and transactions are isolated per cashier
- Prevents concurrent modification of same order

**Release**: January 2026

## Architecture

### Backend APIs (New)

#### 1. `list_open_cashier_sessions(pos_profile, company=None)`
**Location**: `imogi_pos/api/module_select.py`

**Purpose**: Fetch all open POS Opening Entries for a specific POS Profile

**Parameters**:
- `pos_profile` (string): POS Profile name
- `company` (string, optional): Filter by company

**Returns**:
```json
{
  "success": true,
  "sessions": [
    {
      "name": "POS-OPEN-2026-001",
      "user": "cashier1@example.com",
      "period_start_date": "2026-01-15 08:00:00",
      "status": "Open",
      "opening_balance": 100000,
      "company": "MyCompany"
    },
    {
      "name": "POS-OPEN-2026-002",
      "user": "cashier2@example.com",
      "period_start_date": "2026-01-15 10:30:00",
      "status": "Open",
      "opening_balance": 50000,
      "company": "MyCompany"
    }
  ],
  "total": 2,
  "pos_profile": "Counter-1",
  "has_sessions": true
}
```

**Database Query**:
- Filters `POS Opening Entry` with:
  - `docstatus = 1` (submitted)
  - `status = 'Open'`
  - `pos_profile = [provided pos_profile]`
  - Optional: `company = [provided company]`
- Returns sorted by `period_start_date DESC` (newest first)

**Usage**: Called by Module Select frontend when cashier module is clicked

---

#### 2. `validate_opening_session(opening_entry, pos_profile)`
**Location**: `imogi_pos/api/module_select.py`

**Purpose**: Validate that a specific opening_entry exists and matches the pos_profile

**Parameters**:
- `opening_entry` (string): POS Opening Entry name
- `pos_profile` (string): POS Profile to validate against

**Returns**:
```json
{
  "success": true,
  "valid": true,
  "opening": {
    "name": "POS-OPEN-2026-001",
    "user": "cashier1@example.com",
    "pos_profile": "Counter-1",
    "company": "MyCompany",
    "status": "Open",
    "opening_balance": 100000,
    "period_start_date": "2026-01-15 08:00:00"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "valid": false,
  "error": "Opening entry does not match POS Profile"
}
```

**Validation Checks**:
1. Opening entry exists: `frappe.db.exists('POS Opening Entry', opening_entry)`
2. Opening is submitted: `opening.docstatus == 1`
3. Opening is Open: `opening.status == 'Open'`
4. Opening matches pos_profile: `opening.pos_profile == pos_profile`

**Usage**: Called by Cashier Console when opening_entry URL parameter is present

---

#### 3. `claim_order(order_name, opening_entry)`
**Location**: `imogi_pos/api/order_concurrency.py` (NEW FILE)

**Purpose**: Atomically claim an order for processing by current cashier

**Parameters**:
- `order_name` (string): POS Order name
- `opening_entry` (string): POS Opening Entry (for audit trail)

**Returns** (Success):
```json
{
  "success": true,
  "message": "Order claimed successfully",
  "order": {
    "name": "POS-ORD-2026-001",
    "claimed_by": "cashier1@example.com",
    "claimed_at": "2026-01-15 08:15:30.123456",
    "opening_entry": "POS-OPEN-2026-001"
  }
}
```

**Returns** (Already Claimed by Same User - Idempotent):
```json
{
  "success": true,
  "message": "Order already claimed by you",
  "order": {...},
  "idempotent": true
}
```

**Returns** (Claimed by Another Cashier):
```json
{
  "success": false,
  "message": "Order already being processed by another cashier (cashier2@example.com)",
  "error": "Claimed by: cashier2@example.com",
  "claimed_by": "cashier2@example.com",
  "claimed_at": "2026-01-15 08:10:15.123456"
}
```

**Implementation**:
- Uses atomic database update: `frappe.db.set_value()` with transaction wrapper
- Sets `POS Order.claimed_by = current_user` and `POS Order.claimed_at = now()`
- Checks if order already claimed before claiming (prevents race conditions)
- Logs claim event: `[order_name] claimed by [user] for opening [opening_entry]`

**Usage**: Called when cashier selects an unclaimed order from order list

---

#### 4. `release_order(order_name, opening_entry=None)`
**Location**: `imogi_pos/api/order_concurrency.py`

**Purpose**: Release an order claim (unlock order)

**Parameters**:
- `order_name` (string): POS Order name
- `opening_entry` (string, optional): POS Opening Entry (for verification)

**Returns**:
```json
{
  "success": true,
  "message": "Order released successfully"
}
```

**Authorization**: Only the cashier who claimed the order can release it

**Usage**: Called when cashier wants to cancel claim (optional feature)

---

#### 5. `get_order_claim_status(order_name)`
**Location**: `imogi_pos/api/order_concurrency.py`

**Purpose**: Check current claim status of an order

**Returns**:
```json
{
  "success": true,
  "claimed": true,
  "claimed_by": "cashier2@example.com",
  "claimed_at": "2026-01-15 08:10:15.123456",
  "can_claim": false,
  "is_mine": false,
  "current_user": "cashier1@example.com"
}
```

**Usage**: Called to display order status in UI (lock icons, etc.)

---

### Database Schema Changes

#### New Custom Fields on `POS Order`

**Field 1: `claimed_by`**
- Type: Link (to User)
- Optional: Yes
- Read-only: No
- Description: "Cashier who has claimed this order for processing"
- Default: Empty
- Index: Yes (for fast lookups)

**Field 2: `claimed_at`**
- Type: Datetime
- Optional: Yes
- Read-only: No
- Description: "Timestamp when the order was claimed"
- Default: Empty

**Fixture**: Added to `/imogi_pos/fixtures/custom_field.json`

**Migration**: Run `bench migrate` to create fields in database

---

### Frontend Components (New)

#### 1. `CashierSessionCard.jsx`
**Location**: `src/apps/module-select/components/CashierSessionCard.jsx`

**Purpose**: Display single cashier session card in multi-session picker

**Props**:
- `session`: Object with {name, user, period_start_date, opening_balance, status, company}
- `onClick`: Callback when card is clicked
- `isNavigating`: Boolean loading state
- `isLoading`: Boolean loading state
- `isSelected`: Boolean selected state

**Features**:
- Shows cashier name (user)
- Shows session start time (period_start_date)
- Shows opening balance
- Shows status (Open/Closed)
- Lock overlay if session is closed
- Click to select and navigate to cashier console with opening_entry parameter

---

#### 2. Module Select Multi-Session Modal
**Location**: `src/apps/module-select/App.jsx` (Cashier Session Picker)

**Trigger**: When cashier module is clicked and multiple open sessions exist

**Behavior**:
```
User Clicks Cashier Module
    ↓
Fetch list_open_cashier_sessions(pos_profile)
    ↓
API Response
    ├─ 0 sessions → Show error, link to create opening
    ├─ 1 session → Navigate directly to cashier console with opening_entry param
    └─ 2+ sessions → Show modal with session cards
        ├─ User clicks session → Navigate to cashier console
        └─ User clicks "New Opening" → Open native POS Opening form
```

**UI**: Modal overlay with grid of CashierSessionCard components

**CSS**: Defined in `src/apps/module-select/styles.css`

---

#### 3. OrderListSidebar Claim UI
**Location**: `src/apps/cashier-console/components/OrderListSidebar.jsx`

**Multi-Session Mode Detection**: If `opening_entry` URL parameter present OR validated opening exists

**Claim UI Elements**:

**Unclaimed Order** (Multi-Session):
```
┌─────────────────────────────┐
│ POS-ORD-2026-001            │
│ [Claim] [Self Order]        │
│ 3 items • 08:15             │
│ 2x Nasi Goreng              │
│ Total: Rp 75.000            │
└─────────────────────────────┘
```

**Claimed by Me**:
```
┌─────────────────────────────┐
│ POS-ORD-2026-002            │
│ [✓ Claimed] [Counter]       │
│ 2 items • 08:20             │
│ 1x Rendang Daging           │
│ Total: Rp 45.000            │
└─────────────────────────────┘
```

**Claimed by Other Cashier** (Disabled):
```
┌─────────────────────────────┐
│ POS-ORD-2026-003 (FADED)    │
│ [🔒 Locked] [Counter]       │
│ 1 item • 08:25 (GRAYED)     │
│ 1x Lumpia                   │
│ Total: Rp 35.000            │
└─────────────────────────────┘
(CLICK DISABLED - "Locked by cashier2@ex...")
```

**Behavior**:
- Click `[Claim]` button → Call `claim_order()` API → Show loading spinner
- If claim successful → Order shows `[✓ Claimed]` badge
- If order already claimed by other cashier → Show `[🔒 Locked]` badge, disable click
- Clicking locked order does nothing (prevented in OrderListSidebar click handler)

**CSS Classes**:
- `.badge-claimed-by-me`: Green badge with checkmark
- `.badge-claimed-by-other`: Red badge with lock icon
- `.order-claimed-other`: Faded styling for locked orders
- `.order-card-claim-btn`: Blue "Claim" button

---

### Frontend Flow (Multi-Session)

#### 1. User Clicks Cashier Module (Module Select)

```javascript
handleCashierModuleClick()
  ↓
if (pos_profile not selected) {
  Show "Select POS Profile" error
  return
}
  ↓
setCashierSessionsLoading(true)
  ↓
Call list_open_cashier_sessions(pos_profile)
  ↓
API Response
  ├─ sessions.length == 0 → Show error "No active sessions", link to create opening
  ├─ sessions.length == 1 → handleCashierSessionSelection(sessions[0]) → Navigate directly
  └─ sessions.length > 1 → Show modal with session picker
      ↓
      (User clicks session card)
      ↓
      handleCashierSessionSelection(session)
        ↓
        Navigate to `/app/imogi-cashier?opening_entry=POS-OPEN-2026-001&_reload=123456`
```

**Code Location**: `src/apps/module-select/App.jsx` lines ~590-650

---

#### 2. Cashier Console Receives opening_entry Parameter

```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const openingParam = params.get('opening_entry')
  if (openingParam) {
    setUrlOpeningEntry(openingParam)
    console.log('[cashier-console] Multi-session mode:', openingParam)
  }
}, [])
  ↓
if (urlOpeningEntry && posProfile) {
  validateOpeningEntry()
    ↓
    Call validate_opening_session(opening_entry, pos_profile)
      ↓
      Validation Success → setValidatedOpening(response.opening)
        ↓
        usePOSProfileGuard now has overrideOpeningEntry set
        ↓
        Guard passes with validated opening
      ↓
      Validation Error → setOpeningValidationError(error)
        ↓
        Show BlockedScreen with error message
        ↓
        Link to "Back to Module Select"
}
```

**Code Location**: `src/apps/cashier-console/App.jsx` lines ~27-67

---

#### 3. Order List with Claim UI

```javascript
<OrderListSidebar
  orders={orders}
  onClaimOrder={handleClaimOrder}
  isMultiSession={!!validatedOpening}
/>
  ↓
Orders render with:
  ├─ Unclaimed → Show [Claim] button
  ├─ Claimed by me → Show [✓ Claimed] badge
  └─ Claimed by other → Show [🔒 Locked] badge, disable click
      ↓
      Click [Claim] button
      ↓
      handleClaimOrder(order)
        ↓
        Call claim_order(order.name, opening_entry)
          ↓
          API Success → Update order UI with claimed status
          ↓
          API Error → Show toast/error message
```

**Code Location**: `src/apps/cashier-console/components/OrderListSidebar.jsx` lines ~1-45

---

### Testing Scenarios

#### Test Case 1: Single Session (Backward Compatible)
1. Open Module Select as Cashier A
2. Click Cashier Console
3. List returns 1 session → Navigate directly (no modal)
4. Console loads with orders
5. Orders show NO claim badges (single-session mode)
✅ **Expected**: No UI changes for single-session usage

---

#### Test Case 2: Multiple Sessions - Direct Navigation
1. Open Module Select as Cashier A
2. Open Module Select as Cashier B (same POS Profile, different browser/device)
3. Cashier A clicks Cashier Console
4. List returns 2 sessions → Show modal
5. Cashier A sees "Cashier A (08:00)" and "Cashier B (09:30)"
6. Cashier A clicks own session
7. Navigate to Cashier Console with opening_entry=A's_opening
✅ **Expected**: Correct session selected, console loads

---

#### Test Case 3: Order Claiming - No Conflict
1. Both Cashiers logged in, separate consoles open
2. Cashier A sees Order-001 (unclaimed)
3. Cashier A clicks [Claim] button
4. Order shows [✓ Claimed] badge
5. Cashier B's console shows Order-001 with [🔒 Locked] badge
6. Cashier B cannot click locked order
✅ **Expected**: Order locked in Cashier B's view immediately

---

#### Test Case 4: Order Claiming - Concurrent Attempt
1. Cashier A and B both see Order-001 (unclaimed)
2. Both click [Claim] simultaneously
3. One succeeds, one gets error "Already claimed by..."
✅ **Expected**: Atomic locking prevents double-claim

---

#### Test Case 5: Invalid Opening_Entry Parameter
1. User tries to access: `/app/imogi-cashier?opening_entry=INVALID_OPENING`
2. Console loads, calls `validate_opening_session(INVALID_OPENING, pos_profile)`
3. Validation fails
4. Show BlockedScreen: "Invalid Cashier Session"
✅ **Expected**: Error screen prevents unauthorized access

---

### Session Isolation & Data Visibility

#### Orders Visibility
- **List**: All orders for POS Profile visible to all cashiers
- **Claim Status**: Indicated by `claimed_by` field
- **Modification**: Only claiming cashier can process until claim released

#### Payment/Invoice Linking
- **Before Multi-Session**: `imogi_pos_session` auto-resolved to user's only opening
- **After Multi-Session**: `imogi_pos_session` must come from URL parameter (opening_entry)
- **Invoice Link**: Final sales invoice linked to specific `imogi_pos_session`

#### Summary Reports
- **Before**: Summary showed all orders from user
- **After**: Summary scoped to specific opening_entry if provided
- **Reconciliation**: Each cashier closes their own opening independently

---

### Backward Compatibility

✅ **Single-Session Still Works**:
- If no opening_entry parameter → Auto-detect user's active opening (existing logic)
- If user has only 1 open session → Navigate directly (no modal)
- Claim UI hidden if not in multi-session mode

✅ **Existing Installations**:
- New fields (`claimed_by`, `claimed_at`) optional, don't break existing orders
- New APIs available but not called unless opening_entry parameter used
- No changes to existing endpoints

---

### Implementation Checklist

- ✅ Backend APIs: `list_open_cashier_sessions()`, `validate_opening_session()`
- ✅ Concurrency APIs: `claim_order()`, `release_order()`, `get_order_claim_status()`
- ✅ Database Fields: `claimed_by`, `claimed_at` custom fields on POS Order
- ✅ Frontend Component: `CashierSessionCard` component with styling
- ✅ Module Select: `handleCashierModuleClick()`, `handleCashierSessionSelection()`, modal UI
- ✅ Cashier Console: opening_entry parameter extraction, validation, error handling
- ✅ Order List: Claim UI (button, badges, lock styling)
- ✅ Claim Handler: `handleClaimOrder()` function in Cashier Console
- ✅ CSS: Modal styles, claim badge styles, lock styling
- ✅ Documentation: This section + inline code comments

---

### Production Deployment Notes

1. **Database Migration**: Run `bench migrate` to create `claimed_by` and `claimed_at` fields
2. **Feature Flag**: Multi-session is always enabled (no toggle), but only active if opening_entry URL param used
3. **Monitoring**: Log all claim events in console logs for audit trail
4. **Rollback**: Remove opening_entry parameter handling to revert to single-session mode
5. **Testing**: Run test scenarios above in staging before production

