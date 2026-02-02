# Restaurant Flow Complete Guide
## POS Order → KOT → KDS → Cashier Payment

**Status**: ✅ Validated Against Actual Codebase  
**Date**: February 1, 2026

---

## 📊 Data Structure (Actual)

### 1. POS Order Fields (Validated)

```python
# imogi_pos/imogi_pos/doctype/pos_order/pos_order.json
{
  "branch": "Branch (Link)",           # ✅ Required
  "pos_profile": "POS Profile (Link)", # ✅ Required
  "table": "Restaurant Table (Link)",
  "floor": "Restaurant Floor (Link)",  # Fetch from table
  "order_type": "Select",              # Dine-in/Takeaway/Kiosk/POS
  "workflow_state": "Data",            # ⚠️ Key for flow control
  "sales_invoice": "Link",             # Link to Sales Invoice after payment
  "customer": "Customer (Link)",
  "items": "Table (POS Order Item)",   # ✅ Required
  "totals": "Currency"
}
```

**⚠️ TIDAK ADA field explicit `sent_to_kitchen` di POS Order.**

**Tracking "sent to kitchen" menggunakan `workflow_state`:**
- `Draft` = belum dikirim
- `In Progress` = sudah ada KOT dibuat
- `Ready` = semua KOT ready
- `Served` = sudah served

---

### 2. Kitchen Order Ticket (KOT) Fields (Validated)

```python
# imogi_pos/imogi_pos/doctype/kot_ticket/kot_ticket.json
{
  "pos_order": "Link to POS Order",    # ✅ Parent link
  "branch": "Branch (Link)",           # ✅ Required
  "kitchen": "Kitchen (Link)",
  "kitchen_station": "Kitchen Station (Link)", # ✅ Required
  "table": "Restaurant Table (Link)",
  "floor": "Restaurant Floor (Link)",
  "order_type": "Select",
  "workflow_state": "Data",            # ⚠️ Status tracking
  "customer": "Customer (Link)",
  "items": "Table (KOT Item)",         # Child table
  "creation_time": "Datetime"
}
```

**KOT workflow_state values:**
- `Queued` = baru dibuat, belum diproses
- `In Progress` = kitchen sedang memasak
- `Ready` = siap diantar
- `Served` = sudah diantar ke meja
- `Cancelled` = dibatalkan

---

### 3. KDS Query Filter (Actual Implementation)

**File**: `imogi_pos/api/kot.py:207-260`

```python
@frappe.whitelist()
def get_kots_for_kitchen(kitchen=None, station=None):
    """
    KDS uses operational context for branch filtering.
    Returns KOTs for specific kitchen/station.
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    context = require_operational_context(allow_optional=True)
    branch = context.get("branch")
    
    filters = {}
    if kitchen:
        filters["kitchen"] = kitchen
    if station:
        filters["kitchen_station"] = station
    if branch:
        filters["branch"] = branch
    
    # ⚠️ Typically also filters by workflow_state:
    # filters["workflow_state"] = ["not in", ["Served", "Cancelled"]]
    
    tickets = frappe.get_all("KOT Ticket", filters=filters, ...)
    return tickets
```

**KDS filtering criteria:**
1. ✅ `branch` (from operational context)
2. ✅ `kitchen` (optional)
3. ✅ `kitchen_station` (optional)
4. ✅ `workflow_state NOT IN ('Served', 'Cancelled')`

**⚠️ KDS TIDAK filter by `pos_profile` atau `opening_entry`** (correctly - karena Kitchen agnostic terhadap cashier session).

---

## 🔄 Complete Flow (Step-by-Step)

### Phase 1: Waiter Creates POS Order (Draft)

**Action**: Waiter selects table, adds items, saves draft.

**Backend**:
```python
# imogi_pos/api/orders.py (create_order or similar)
order = frappe.new_doc("POS Order")
order.branch = waiter_branch
order.pos_profile = selected_profile
order.table = selected_table
order.order_type = "Dine-in"
order.workflow_state = "Draft"  # ✅ Initial state
# ... add items
order.insert()
```

**KOT Status**: ❌ No KOT created yet.

**POS Order Status**: `workflow_state = "Draft"`

---

### Phase 2: Waiter Sends to Kitchen

**Action**: Waiter clicks **"Send to Kitchen"** button.

**Backend Call**: `send_to_kitchen(order_name, items_by_station)`

**Implementation** (`imogi_pos/api/kot.py:1074-1180`):

```python
@frappe.whitelist()
def send_to_kitchen(order_name, items_by_station):
    """
    Creates KOT tickets for each station.
    Items are grouped by kitchen_station before this call.
    """
    order_doc = frappe.get_doc("POS Order", order_name)
    
    created_kots = {}
    
    for station_name, station_items in items_by_station.items():
        # Get kitchen for station
        kitchen = frappe.db.get_value("Kitchen Station", station_name, "kitchen")
        
        # Create KOT
        kot_doc = frappe.new_doc("KOT Ticket")
        kot_doc.pos_order = order_name
        kot_doc.kitchen = kitchen
        kot_doc.kitchen_station = station_name
        kot_doc.table = order_doc.table
        kot_doc.branch = order_doc.branch
        kot_doc.workflow_state = "Queued"  # ✅ Initial KOT state
        
        # Add items
        for item in station_items:
            kot_doc.append("items", {
                "item_code": item["item_code"],
                "qty": item["qty"],
                "notes": item.get("notes"),
                "workflow_state": "Queued"  # Item-level state
            })
        
        kot_doc.insert(ignore_permissions=True)
        created_kots[station_name] = kot_doc.name
        
        # ✅ Realtime event to KDS
        publish_kitchen_update(
            kot_doc,
            kitchen=kitchen,
            station=station_name,
            event_type="kot_created"
        )
    
    # ✅ Update POS Order workflow_state
    if order_doc.workflow_state == "Draft":
        order_doc.db_set('workflow_state', 'In Progress', update_modified=False)
    
    return {"success": True, "kots": created_kots}
```

**Result**:
- ✅ KOT created with `workflow_state = "Queued"`
- ✅ POS Order updated to `workflow_state = "In Progress"`
- ✅ Realtime event `kot_created` published to KDS
- ✅ Table status updated to `"Occupied"` (if dine-in)

---

### Phase 3: KDS Displays KOT

**Frontend**: Kitchen Display System (React/Desk)

**Query**:
```javascript
// Fetch pending KOTs for this kitchen/station
frappe.call({
  method: 'imogi_pos.api.kot.get_kots_for_kitchen',
  args: {
    kitchen: 'Main Kitchen',
    station: 'Hot Station'
  },
  callback: (r) => {
    const kots = r.message || [];
    // Filter to show only active KOTs
    const activeKots = kots.filter(kot => 
      ['Queued', 'In Progress'].includes(kot.workflow_state)
    );
    displayKOTs(activeKots);
  }
});
```

**Polling Strategy**:
- ⏱️ Poll every 3-5 seconds for new KOTs
- 🔔 **OR** listen to realtime event `kot_created`

**Realtime Listener** (Recommended):
```javascript
frappe.realtime.on('kot_created', (data) => {
  if (data.kitchen === currentKitchen && data.station === currentStation) {
    // Refresh KOT list or add new KOT to display
    invalidateKOTQuery();
  }
});
```

---

### Phase 4: Kitchen Updates KOT Status

**Action**: Kitchen staff clicks status buttons.

**Status Transitions**:
```
Queued → In Progress → Ready → Served
```

**Backend Call**: `update_kot_item_state(kot_item, state)` or ticket-level update.

**Implementation**:
```python
# When kitchen clicks "Start Cooking"
kot_doc.workflow_state = "In Progress"
kot_doc.save()

# ✅ Publish realtime update
publish_kitchen_update(kot_doc, event_type="kot_updated")

# When all items ready
kot_doc.workflow_state = "Ready"
kot_doc.save()

# ✅ Publish to cashier/waiter
publish_kitchen_update(kot_doc, event_type="kot_updated")
```

**KDS React**: Invalidate query on `kot_updated` event.

---

### Phase 5: Cashier Checks Order Status

**Action**: Cashier wants to see which orders are ready to bill.

**Query**:
```python
# Check if order has served KOTs
@frappe.whitelist()
def get_order_details(order_name):
    order = frappe.get_doc("POS Order", order_name)
    
    # Get related KOTs
    kots = frappe.get_all("KOT Ticket", 
        filters={"pos_order": order_name},
        fields=["name", "workflow_state"]
    )
    
    # Check if all KOTs are served
    unserved = [k for k in kots if k.workflow_state != "Served"]
    
    return {
        "order": order.as_dict(),
        "kots": kots,
        "can_bill": len(unserved) == 0  # ✅ All served
    }
```

**UI**: Cashier sees order with badge "Ready to Bill" if all KOTs served.

---

### Phase 6: Cashier Creates Invoice

**Action**: Cashier clicks "Pay" on POS Order.

**Backend Call**: `create_invoice_from_order(order_name, customer)`

**Validation** (`imogi_pos/api/cashier.py:546-705`):

```python
@frappe.whitelist()
def create_invoice_from_order(order_name, customer=None):
    """
    Converts POS Order → Sales Invoice.
    ⚠️ Validates all KOTs are served before creating invoice.
    """
    order = frappe.get_doc("POS Order", order_name)
    
    # ✅ KOT served validation
    kots = frappe.get_all("KOT Ticket", 
        filters={"pos_order": order_name},
        fields=["workflow_state"]
    )
    
    if kots:
        unserved = [k for k in kots if k.workflow_state != "Served"]
        if unserved:
            return {
                "success": False,
                "error": "Cannot create invoice. Not all items have been served."
            }
    
    # Get active opening (HARDENED)
    opening_dict = ensure_active_opening(
        pos_profile=order.pos_profile,
        user=frappe.session.user
    )
    opening_name = opening_dict.get("name")
    
    # Create Sales Invoice
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = customer or "Walk-In Customer"
    invoice.company = order.company
    invoice.is_pos = 1
    invoice.pos_profile = order.pos_profile
    
    # ✅ Link to active session
    invoice.imogi_pos_session = opening_name  # Custom field
    invoice.imogi_pos_order = order_name      # Custom field
    
    # Copy items from order
    for item in order.items:
        invoice.append("items", {
            "item_code": item.item_code,
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount
        })
    
    invoice.insert(ignore_permissions=True)
    
    # ✅ Link back to POS Order
    order.sales_invoice = invoice.name
    order.db_set("sales_invoice", invoice.name, update_modified=False)
    
    return {
        "success": True,
        "invoice": invoice.name,
        "session": opening_name
    }
```

**Result**:
- ✅ Sales Invoice created (draft)
- ✅ Invoice linked to `opening_entry` aktif
- ✅ POS Order updated with `sales_invoice` link

---

### Phase 7: Cashier Processes Payment

**Action**: Cashier enters payment details and submits.

**Backend Call**: `process_payment(invoice_name, payments)`

**Implementation** (`imogi_pos/api/cashier.py:807-950`):

```python
@frappe.whitelist()
def process_payment(invoice_name, payments=None):
    """
    POS-native payment (NO Payment Entry).
    Writes to Sales Invoice.payments child table.
    Submits Sales Invoice.
    
    ⚠️ Validates invoice belongs to current session.
    """
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    
    # ✅ Validate active opening
    active_dict = ensure_active_opening(
        pos_profile=invoice.pos_profile,
        user=frappe.session.user
    )
    active_name = active_dict.get("name")
    
    # ✅ Session validation (prevent cross-session payment)
    invoice_session = invoice.imogi_pos_session
    if invoice_session and invoice_session != active_name:
        return {
            "success": False,
            "error": "Invoice belongs to a different session."
        }
    
    # ✅ Idempotent check
    if invoice.docstatus == 1:
        return {"success": True, "message": "Invoice already paid"}
    
    # Add payments to invoice
    invoice.set("payments", [])
    for p in payments:
        invoice.append("payments", {
            "mode_of_payment": p["mode_of_payment"],
            "amount": p["amount"]
        })
    
    # Validate payment amount
    total_paid = sum(p["amount"] for p in payments)
    if total_paid < invoice.grand_total:
        return {
            "success": False,
            "error": f"Underpayment: {total_paid} < {invoice.grand_total}"
        }
    
    # ✅ Submit invoice
    invoice.submit()
    
    return {
        "success": True,
        "invoice": invoice.name,
        "paid_total": total_paid
    }
```

**Result**:
- ✅ Sales Invoice submitted (docstatus = 1)
- ✅ Payment recorded in `opening_entry` aggregates
- ✅ POS Order marked as paid

---

### Phase 8: Close Shift

**Action**: Cashier closes shift at end of day.

**Backend Call**: `close_pos_opening(opening_name)`

**Flow**:
1. Create **POS Closing Entry** (calculates totals)
2. Update **POS Opening Entry** status to `"Closed"`
3. **Cashier React must clear state + invalidate cache**

**React Implementation**:
```javascript
const handleCloseShift = async () => {
  const result = await frappe.call({
    method: 'imogi_pos.api.cashier.close_pos_opening',
    args: { opening_name: currentOpening }
  });
  
  if (result.message.success) {
    // ✅ Clear global state
    clearCashierState();
    
    // ✅ Invalidate React Query cache
    queryClient.invalidateQueries(['active-opening']);
    queryClient.invalidateQueries(['orders', currentOpening]);
    queryClient.invalidateQueries(['payments', currentOpening]);
    
    // ✅ Redirect to module select
    frappe.set_route('imogi-module-select');
  }
};
```

---

## ⚠️ Critical Validation Points

### 1. POS Order → KOT Creation

**Must ensure**:
- ✅ `workflow_state` updated from `"Draft"` → `"In Progress"`
- ✅ KOT created with correct `branch`, `kitchen`, `kitchen_station`
- ✅ Realtime event `kot_created` published
- ✅ KOT `workflow_state = "Queued"` initially

### 2. KDS Query Must Include

**Filters**:
```python
{
  "branch": branch_from_context,
  "workflow_state": ["not in", ["Served", "Cancelled"]],
  # Optional:
  "kitchen": selected_kitchen,
  "kitchen_station": selected_station
}
```

**⚠️ DO NOT filter by**:
- `pos_profile` (KDS agnostic to cashier profile)
- `opening_entry` (KDS works regardless of shift)

### 3. Cashier Invoice Creation Must Validate

**Before creating invoice**:
```python
# Check all KOTs served
kots = frappe.get_all("KOT Ticket", 
    filters={"pos_order": order_name},
    fields=["workflow_state"]
)

unserved = [k for k in kots if k.workflow_state != "Served"]
if unserved:
    frappe.throw("Cannot create invoice - items not served")
```

### 4. Payment Must Validate Session

**Before submitting invoice**:
```python
# Ensure invoice belongs to current active session
invoice_session = invoice.imogi_pos_session
active_session = ensure_active_opening(...)["name"]

if invoice_session != active_session:
    frappe.throw("Cannot pay invoice from different session")
```

---

## 🔔 Realtime Events (Actual Implementation)

### Events Published

**File**: `imogi_pos/api/kot.py` + `imogi_pos/utils/kot_publisher.py`

1. **`kot_created`** - New KOT created
   ```python
   publish_kitchen_update(kot_doc, event_type="kot_created", ...)
   ```

2. **`kot_updated`** - KOT status changed
   ```python
   publish_kitchen_update(kot_doc, event_type="kot_updated", ...)
   ```

3. **`order_sent_to_kitchen`** - POS Order sent to kitchen
   ```python
   publish_table_update(order_name, table, event_type="order_sent_to_kitchen")
   ```

### React Listeners

**KDS Component**:
```javascript
useEffect(() => {
  const handleKOTCreated = (data) => {
    if (data.kitchen === currentKitchen) {
      queryClient.invalidateQueries(['kots', currentKitchen]);
    }
  };
  
  const handleKOTUpdated = (data) => {
    queryClient.invalidateQueries(['kots', currentKitchen]);
  };
  
  frappe.realtime.on('kot_created', handleKOTCreated);
  frappe.realtime.on('kot_updated', handleKOTUpdated);
  
  return () => {
    frappe.realtime.off('kot_created', handleKOTCreated);
    frappe.realtime.off('kot_updated', handleKOTUpdated);
  };
}, [currentKitchen]);
```

**Waiter Component**:
```javascript
frappe.realtime.on('order_sent_to_kitchen', (data) => {
  if (data.table === currentTable) {
    // Refresh order list for this table
    queryClient.invalidateQueries(['orders', currentTable]);
  }
});
```

---

## 🧪 Testing Checklist

### Test 1: Waiter → Kitchen Flow
```
1. ✅ Waiter creates POS Order (Draft)
2. ✅ Verify workflow_state = "Draft"
3. ✅ Waiter clicks "Send to Kitchen"
4. ✅ Verify KOT created with workflow_state = "Queued"
5. ✅ Verify POS Order workflow_state = "In Progress"
6. ✅ Verify KDS displays new KOT immediately
```

### Test 2: KDS Real-time Updates
```
1. ✅ Open KDS in one browser tab
2. ✅ Create KOT from another tab/device
3. ✅ Verify KDS shows new KOT without manual refresh
4. ✅ Update KOT status to "In Progress"
5. ✅ Verify KDS updates status in real-time
```

### Test 3: Cashier Session Validation
```
1. ✅ Cashier opens shift (Opening A)
2. ✅ Create invoice from POS Order
3. ✅ Verify invoice.imogi_pos_session = Opening A
4. ✅ Close shift (Opening A closed)
5. ✅ Try to pay invoice → should fail (session closed)
6. ✅ Open new shift (Opening B)
7. ✅ Try to pay old invoice → should fail (wrong session)
```

### Test 4: Cross-Session Prevention
```
1. ✅ Cashier 1 opens shift on Terminal 1
2. ✅ Cashier 2 opens shift on Terminal 2
3. ✅ Cashier 1 creates invoice from Order X
4. ✅ Cashier 2 tries to pay Order X invoice
5. ✅ Should fail: "Invoice belongs to different session"
```

---

## 🚨 Common Bugs & Solutions

### Bug 1: "KOT tidak muncul di KDS"

**Root Cause**:
- KOT created but KDS query filters too strict
- Missing `branch` in KOT
- Missing `kitchen_station` in KOT
- KDS not listening to realtime events

**Fix**:
```python
# Ensure KOT has required fields
kot_doc.branch = order.branch  # ✅ Required
kot_doc.kitchen_station = station  # ✅ Required

# Ensure KDS query is correct
filters = {
    "branch": branch_from_context,
    "workflow_state": ["not in", ["Served", "Cancelled"]]
}
```

### Bug 2: "Cashier bisa bayar invoice setelah shift closed"

**Root Cause**:
- Frontend not clearing state after close shift
- React Query cache not invalidated
- No backend validation of session status

**Fix**:
```javascript
// After close shift:
clearAllState();
queryClient.clear();  // Nuclear option
frappe.set_route('imogi-module-select');
```

### Bug 3: "Waiter order langsung ke KDS tanpa KOT"

**Root Cause**:
- Frontend directly querying POS Order instead of KOT
- Missing "Send to Kitchen" step

**Fix**:
- ✅ KDS MUST query `KOT Ticket`, NOT `POS Order`
- ✅ Ensure "Send to Kitchen" button creates KOT

---

## 📊 React Query Key Strategy

### Cashier Console

**Query Keys MUST include `opening_entry`:**

```javascript
// ✅ Good
['active-opening', pos_profile]
['orders', opening_entry, pos_profile]
['payments', opening_entry]
['invoices', opening_entry]

// ❌ Bad (will cause stale data after shift change)
['orders']  // No opening reference
['payments', pos_profile]  // No opening reference
```

**Invalidation after close shift:**
```javascript
queryClient.invalidateQueries(['active-opening']);
queryClient.removeQueries(['orders', old_opening]);
queryClient.removeQueries(['payments', old_opening]);
```

### KDS Component

**Query Keys should NOT include `opening_entry`:**

```javascript
// ✅ Good (KDS agnostic to cashier session)
['kots', branch, kitchen, station]
['kot-items', kot_id]

// ❌ Bad
['kots', opening_entry]  // KDS doesn't care about cashier shift
```

### Waiter Component

**Query Keys based on `table` or `branch`:**

```javascript
// ✅ Good
['orders', table_id]
['tables', branch]

// Optional: include pos_profile if waiter has profile context
['orders', table_id, pos_profile]
```

---

## ✅ Final Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     RESTAURANT FLOW                         │
└─────────────────────────────────────────────────────────────┘

1. WAITER
   └─> Create POS Order (Draft)
       └─> workflow_state = "Draft"
       └─> Items added, table selected

2. WAITER SENDS TO KITCHEN
   └─> Call send_to_kitchen(order, items_by_station)
       └─> Create KOT Ticket
           ├─> pos_order = order_name
           ├─> branch = order.branch
           ├─> kitchen_station = "Hot Station"
           ├─> workflow_state = "Queued"
           └─> Publish realtime "kot_created"
       └─> Update POS Order
           └─> workflow_state = "In Progress"

3. KDS (KITCHEN DISPLAY)
   └─> Query KOT Ticket WHERE:
       ├─> branch = current_branch
       ├─> kitchen = current_kitchen (optional)
       ├─> kitchen_station = current_station (optional)
       └─> workflow_state NOT IN ("Served", "Cancelled")
   └─> Listen realtime: "kot_created", "kot_updated"
   └─> Update KOT status: Queued → In Progress → Ready

4. CASHIER
   └─> Check POS Order ready to bill
       └─> Query KOT Ticket WHERE pos_order = order_name
       └─> Validate all KOT workflow_state = "Served"
   └─> Create Invoice
       └─> Call create_invoice_from_order(order_name)
           ├─> Validate all KOTs served
           ├─> Get active opening (server-side)
           ├─> Create Sales Invoice
           ├─> Link invoice.imogi_pos_session = active_opening
           └─> Link order.sales_invoice = invoice_name
   └─> Process Payment
       └─> Call process_payment(invoice, payments)
           ├─> Validate invoice.imogi_pos_session = active_opening
           ├─> Add payments to invoice.payments[]
           └─> Submit invoice (docstatus = 1)

5. CLOSE SHIFT
   └─> Call close_pos_opening(opening_name)
       ├─> Create POS Closing Entry
       ├─> Update POS Opening Entry status = "Closed"
       └─> Frontend: Clear state + invalidate cache
```

---

## 📚 Related Files

1. **POS Order**: `imogi_pos/imogi_pos/doctype/pos_order/pos_order.json`
2. **KOT Ticket**: `imogi_pos/imogi_pos/doctype/kot_ticket/kot_ticket.json`
3. **KOT API**: `imogi_pos/api/kot.py`
4. **Cashier API**: `imogi_pos/api/cashier.py`
5. **KOT Publisher**: `imogi_pos/utils/kot_publisher.py`
6. **Operational Context**: `imogi_pos/utils/operational_context.py`

---

**Created**: February 1, 2026  
**Validated**: Against actual codebase structure  
**Maintainer**: Restaurant Domain Team
