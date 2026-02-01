# RESTAURANT FLOW IMPLEMENTATION GUIDE

## Overview

Implementasi lengkap restaurant-grade flow untuk IMOGI-POS:

**Waiter → Request Bill → Cashier Claim → Payment → Auto-release Table**

## Features Implemented

### 1. Backend API (Python/Frappe)

#### New Custom Fields on `POS Order`
- ✅ `request_payment` (Check) - Waiter has requested bill
- ✅ `requested_payment_at` (Datetime) - Timestamp when bill requested
- ✅ `paid_at` (Datetime) - Timestamp when order paid
- ✅ `claimed_by` (Link to User) - Already exists
- ✅ `claimed_at` (Datetime) - Already exists

#### New API Endpoints
Location: `imogi_pos/api/orders.py`

**1. `request_bill(pos_order_name)`**
- Waiter requests bill for dine-in order
- Validations:
  - Must be Dine-in with table
  - Not closed/cancelled
  - Not already paid
- Sets `request_payment=1`, `requested_payment_at=now()`
- Publishes realtime event `bill_requested`

**2. `claim_order(pos_order_name, opening_entry=None)`**
- Cashier claims order for payment
- **Concurrency guard**: Only one cashier can claim
- Validates claimed_by (rejects if already claimed by another user)
- **Robust POS Opening validation** (if opening_entry provided):
  - Opening exists and `status = "Open"`
  - POS Profile matches order's profile
  - User matches opening user (if scope = "User")
- Sets `claimed_by=current_user`, `claimed_at=now()`
- Idempotent: Returns success if already claimed by same user
- Publishes realtime event `order_claimed`

**3. `release_table_if_done(pos_order_name)`**
- Auto-releases table after payment/order closed
- **Idempotent**: Safe to call multiple times
- **Robust conditions** for release:
  1. Order has table assigned
  2. Order in FINAL state:
     - `workflow_state` in [Closed, Cancelled, Returned] **OR**
     - `paid_at` timestamp exists (invoice submitted)
  3. Table currently linked to this order (prevents race conditions)
- Sets table: `status=Available`, `current_pos_order=null`
- Publishes realtime event `table_released`
- **Called from multiple hooks:**
  - `process_payment()` - After invoice submit
  - `complete_order()` - Step 8 table release
  - `POSOrder.on_cancel()` - Rollback on order cancellation

#### Hooks Integration
Location: `imogi_pos/api/cashier.py`

**1. In `process_payment()` (after invoice submit)**
```python
# Set paid_at timestamp
frappe.db.set_value("POS Order", pos_order_name, "paid_at", now_datetime())

# Auto-release table
release_table_if_done(pos_order_name)
```

**2. In `complete_order()` (Step 8: Clear table status)**
```python
# Use restaurant flow helper with fallback
try:
    release_result = release_table_if_done(order_name)
except Exception:
    # Fallback to direct DB update
    frappe.db.set_value("Restaurant Table", table_name, "status", "Available")
```

**3. In `POSOrder.on_cancel()` (Rollback on cancellation)**
```python
def on_cancel(self):
    """Release table when order cancelled"""
    if self.table:
        release_table_if_done(self.name)
```

**Hook placement rationale:**
- **process_payment()**: Catches immediate payment success (invoice submitted)
- **complete_order()**: Catches workflow closure (closed state)
- **on_cancel()**: Rollback table for cancelled orders
- All hooks use same idempotent function for consistency

#### Edit Lock Enforcement
Location: `imogi_pos/api/orders.py`

**Centralized Helper Function:**
```python
def assert_order_editable(order_doc, allow_branch_manager_override=True):
    """
    Assert that order can be edited (Restaurant Flow edit lock).
    Raises PermissionError if order is claimed by another user.
    
    - Branch Manager can override (if allow_branch_manager_override=True)
    - Applied to ALL mutation endpoints for consistency
    """
```

**Applied to endpoints:**
- `add_item_to_order()` - Add new items
- `save_order()` - Update order/items
- Any other endpoint that mutates order state

**Enforcement:**
```python
# At start of mutation endpoints
assert_order_editable(order_doc, allow_branch_manager_override=True)

# Raises: frappe.PermissionError if claimed by another user
```

### 2. Frontend Components

#### Waiter App

**New Hook: `useBillRequest()`**
Location: `src/apps/waiter/hooks/useBillRequest.js`

```javascript
const { requestBill, claimOrder, loading, error } = useBillRequest()

// Request bill
await requestBill(posOrderName)

// Claim order (for cashier)
await claimOrder(posOrderName, openingEntry)
```

**New Component: `RequestBillButton`**
Location: `src/apps/waiter/components/RequestBillButton.jsx`

- Shows for dine-in orders with table
- Hides if already requested or paid
- Disabled during loading
- Shows status badge if already requested

Usage:
```jsx
<RequestBillButton 
  order={currentOrder} 
  onSuccess={(result) => refreshOrders()}
/>
```

#### Cashier Console

**Updated: `OrderListSidebar`**
Location: `src/apps/cashier-console/components/OrderListSidebar.jsx`

**New Filter:**
- ✅ "Requested Bills Only" toggle (Table mode)
- Filters orders where `request_payment=1`
- Shows count: `Requested Bills Only (5)`

**New Badges:**
- ✅ **Bill Requested** badge (orange) - Shows on orders with `request_payment=1`
- Shows alongside existing claim badges

**Enhanced Claim Button:**
- ✅ Primary style for bill requested orders: "Claim for Payment"
- Standard style for regular multi-session claims: "Claim"
- Disables during claim operation
- Shows spinner icon while processing

### 3. Database Migration

**Patch File:**
Location: `imogi_pos/patches/add_restaurant_flow_fields.py`

```python
def execute():
    """Add request_payment, requested_payment_at, paid_at fields"""
    custom_fields = {
        "POS Order": [
            {
                "fieldname": "request_payment",
                "fieldtype": "Check",
                "default": "0"
            },
            # ... other fields
        ]
    }
    create_custom_fields(custom_fields, update=True)
```

**Patch Entry:**
`imogi_pos/patches.txt`:
```
# v2.1 - Restaurant Flow Enhancement - February 2026
imogi_pos.patches.add_restaurant_flow_fields
```

**Fixtures Updated:**
`imogi_pos/fixtures/custom_field.json`:
- Added `request_payment` field definition
- Added `requested_payment_at` field definition  
- Added `paid_at` field definition

### 4. Testing

**Integration Test Suite:**
Location: `tests/test_restaurant_flow.py`

**Test Cases:**
1. ✅ `test_01_waiter_creates_order` - Waiter creates dine-in order
2. ✅ `test_02_waiter_requests_bill` - Request bill sets flags
3. ✅ `test_03_cashier_claims_order` - Cashier claims successfully
4. ✅ `test_04_concurrency_guard` - Second cashier cannot claim
5. ✅ `test_05_edit_lock_after_claim` - Waiter cannot edit after claim
6. ✅ `test_06_table_release_after_payment` - Table auto-released
7. ✅ `test_07_release_table_idempotent` - Idempotent release

Run tests:
```bash
bench --site [site] run-tests --test tests.test_restaurant_flow
```

## Deployment Steps

### 1. Backend Deployment

```bash
# 1. Pull latest code
cd ~/frappe-bench/apps/imogi_pos
git pull origin main

# 2. Run migration (applies patches)
bench --site [site] migrate

# 3. Clear cache
bench --site [site] clear-cache

# 4. Rebuild frontend
cd ~/frappe-bench
bench build --app imogi_pos

# 5. Restart services
sudo systemctl restart frappe-bench-web
sudo systemctl restart frappe-bench-workers
```

### 2. Verify Custom Fields

```bash
bench --site [site] console
```

```python
# Check POS Order fields
meta = frappe.get_meta("POS Order")
print(meta.has_field("request_payment"))  # Should print True
print(meta.has_field("requested_payment_at"))  # Should print True
print(meta.has_field("paid_at"))  # Should print True
```

### 3. Configure POS Profile

Enable waiter flow on POS Profile:

1. Go to: **POS Profile → [Your Profile]**
2. Set: `imogi_enable_waiter = 1`
3. Set: `imogi_mode = Table`
4. Save

### 4. Test End-to-End Flow

**Manual Testing Checklist:**

**Step 1: Setup**
- [ ] Table T1 status = Available
- [ ] POS Profile waiter enabled

**Step 2: Waiter Flow**
- [ ] Login as Waiter
- [ ] Create dine-in order for T1
- [ ] Table status → Occupied
- [ ] Add items to order
- [ ] Click "Request Bill"
- [ ] Badge shows "Bill Requested"

**Step 3: Cashier Flow**
- [ ] Login as Cashier (with active opening)
- [ ] Go to Cashier Console
- [ ] Toggle "Requested Bills Only"
- [ ] Order appears with "Bill Requested" badge
- [ ] Click "Claim for Payment"
- [ ] Badge changes to "Claimed"

**Step 4: Payment**
- [ ] Select claimed order
- [ ] Go to payment view
- [ ] Process payment (submit invoice)
- [ ] Complete order

**Step 5: Verify**
- [ ] Table T1 status → Available
- [ ] Table current_pos_order → null
- [ ] Order workflow_state → Closed
- [ ] Order paid_at → filled

## API Reference

### Request Bill

**Endpoint:** `imogi_pos.api.orders.request_bill`

**Parameters:**
- `pos_order_name` (str, required): POS Order name

**Response:**
```json
{
  "success": true,
  "message": "Bill requested successfully",
  "pos_order": "POS-ORD-2026-00001",
  "request_payment": 1,
  "requested_payment_at": "2026-02-01 14:30:00",
  "table": "T1",
  "workflow_state": "Draft"
}
```

**Errors:**
- `ValidationError`: Order not dine-in or no table
- `ValidationError`: Order already closed/paid
- `DoesNotExistError`: Order not found

### Claim Order

**Endpoint:** `imogi_pos.api.orders.claim_order`

**Parameters:**
- `pos_order_name` (str, required): POS Order name
- `opening_entry` (str, optional): POS Opening Entry

**Response:**
```json
{
  "success": true,
  "message": "Order claimed successfully",
  "pos_order": "POS-ORD-2026-00001",
  "claimed_by": "cashier@example.com",
  "claimed_at": "2026-02-01 14:35:00",
  "table": "T1",
  "customer": "Guest",
  "grand_total": 50000,
  "workflow_state": "Draft"
}
```

**Errors:**
- `ValidationError`: Already claimed by another user
- `ValidationError`: Order closed/cancelled
- `DoesNotExistError`: Order not found

### Release Table If Done

**Endpoint:** `imogi_pos.api.orders.release_table_if_done`

**Parameters:**
- `pos_order_name` (str, required): POS Order name

**Response:**
```json
{
  "success": true,
  "message": "Table T1 released",
  "table": "T1",
  "pos_order": "POS-ORD-2026-00001"
}
```

**Idempotent Response (already released):**
```json
{
  "success": true,
  "message": "Table T1 already released or reassigned",
  "table": "T1",
  "pos_order": "POS-ORD-2026-00001",
  "skipped": true
}
```

## Realtime Events

### bill_requested
Published when waiter requests bill.

```javascript
frappe.realtime.on('bill_requested', (data) => {
  console.log('Bill requested:', data.pos_order, data.table)
  // Refresh cashier orders list
})
```

### order_claimed
Published when cashier claims order.

```javascript
frappe.realtime.on('order_claimed', (data) => {
  console.log('Order claimed:', data.pos_order, 'by', data.claimed_by)
  // Update UI: show claimed badge
})
```

### table_released
Published when table is auto-released.

```javascript
frappe.realtime.on('table_released', (data) => {
  console.log('Table released:', data.table)
  // Refresh table layout
})
```

## Error Handling

### Common Error Scenarios

**1. Waiter tries to edit claimed order**
```
Error: Order claimed by John Doe for payment. Cannot edit items.
Type: PermissionError
Action: Wait for cashier to complete payment or contact Branch Manager
```

**2. Cashier tries to claim already-claimed order**
```
Error: Order already claimed by Jane Smith at 2026-02-01 14:35:00
Type: ValidationError
Action: Choose different order or wait for claim release
```

**3. Request bill for non-dine-in order**
```
Error: Bill request only available for Dine-in orders. Current type: Counter
Type: ValidationError
Action: Only use for dine-in table orders
```

## Performance Considerations

### Database Indexes
The `request_payment` field is **explicitly indexed** for fast filtering:

```python
# In custom_field.json and migration patch
{
    "fieldname": "request_payment",
    "search_index": 1,
    "in_standard_filter": 1
}
```

**Note:** Custom fields are NOT automatically indexed by Frappe. We explicitly set `search_index=1` in:
- Fixture: `imogi_pos/fixtures/custom_field.json`
- Patch: `imogi_pos/patches/add_restaurant_flow_fields.py`

This ensures fast queries when filtering `WHERE request_payment = 1` on large order lists.

### Caching
- API responses are not cached (real-time data)
- Custom fields loaded with POS Order document
- Realtime events use Socket.IO for low latency

### Concurrent Operations
- **Claim concurrency**: Protected by database-level checks
- **Table release**: Idempotent, safe for multiple calls
- **Payment**: Uses existing shift-based session locking

## Troubleshooting

### Table not releasing after payment

**Symptom:** Table stays "Occupied" after order closed.

**Solution:**
```bash
# Check order state
bench --site [site] console
```

```python
order = frappe.get_doc("POS Order", "POS-ORD-XXX")
print(f"State: {order.workflow_state}")
print(f"Paid: {order.paid_at}")

# Manually release
from imogi_pos.api.orders import release_table_if_done
result = release_table_if_done(order.name)
print(result)
```

### Claim button not showing

**Check:**
1. POS Profile: `imogi_enable_waiter = 1`
2. Order: `request_payment = 1`
3. Frontend: Clear browser cache (`Ctrl+Shift+R`)

### Fields not appearing

**Solution:**
```bash
# Re-run migration
bench --site [site] migrate

# Verify fields
bench --site [site] console
```

```python
meta = frappe.get_meta("POS Order")
print([f.fieldname for f in meta.fields if 'request' in f.fieldname])
# Should print: ['request_payment', 'requested_payment_at']
```

## Files Changed

### Backend (Python)
- ✅ `imogi_pos/api/orders.py` - New endpoints + edit lock
- ✅ `imogi_pos/api/cashier.py` - Auto-release hooks
- ✅ `imogi_pos/fixtures/custom_field.json` - Field definitions
- ✅ `imogi_pos/patches/add_restaurant_flow_fields.py` - Migration
- ✅ `imogi_pos/patches.txt` - Patch registration

### Frontend (React/JavaScript)
- ✅ `src/apps/waiter/hooks/useBillRequest.js` - Request/claim logic
- ✅ `src/apps/waiter/hooks/index.js` - Export hook
- ✅ `src/apps/waiter/components/RequestBillButton.jsx` - UI component
- ✅ `src/apps/waiter/components/index.js` - Export component
- ✅ `src/apps/cashier-console/components/OrderListSidebar.jsx` - Filter + badges

### Testing
- ✅ `tests/test_restaurant_flow.py` - Integration tests

## Next Steps / Future Enhancements

1. **Waiter Edit Lock UI** - Visual indicator when order locked
2. **Notification Sound** - Alert cashier when bill requested
3. **Table Timer** - Show how long table occupied
4. **Split Bill** - Support for bill splitting between multiple payments
5. **Partial Payment** - Allow partial payment before full closure
6. **Request History** - Log of all bill requests with timestamps
7. **Auto-claim** - Option for cashier to auto-claim next requested bill

## Support

For issues or questions:
- Check logs: `bench --site [site] show-log`
- Review error: `/api/method/imogi_pos.api.orders.request_bill`
- Contact: IMOGI POS Support Team

---

**Implementation Date:** February 1, 2026  
**Version:** 2.1.0  
**Status:** ✅ Production Ready
