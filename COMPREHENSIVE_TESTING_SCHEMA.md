# IMOGI POS - Comprehensive Testing Schema

**Version:** 2.0  
**Date:** January 28, 2026  
**Purpose:** Complete testing schema for all modules with positive and negative flow scenarios

---

## Table of Contents

1. [Core Modules Overview](#core-modules-overview)
2. [Module 1: Orders Module](#module-1-orders-module)
3. [Module 2: Billing Module](#module-2-billing-module)
4. [Module 3: Kitchen Order Tickets (KOT) Module](#module-3-kitchen-order-tickets-kot-module)
5. [Module 4: Authorization & Access Control](#module-4-authorization--access-control)
6. [Module 5: Pricing Module](#module-5-pricing-module)
7. [Module 6: Customers & Items Module](#module-6-customers--items-module)
8. [Module 7: Layout & Table Display Module](#module-7-layout--table-display-module)
9. [Cross-Module Integration Tests](#cross-module-integration-tests)

---

## Core Modules Overview

The IMOGI POS application consists of the following key modules:

| Module | File | Primary Functions | Status |
|--------|------|-------------------|--------|
| **Orders** | `api/orders.py` | Create, read, update orders | ⬜ |
| **Billing** | `api/billing.py` | Invoice creation, payments, tax | ⬜ |
| **KOT** | `api/kot.py` | Kitchen tickets, status tracking | ⬜ |
| **Authorization** | `utils/permission_manager.py` | Access control, role-based | ⬜ |
| **Pricing** | `api/pricing.py` | Price calculation, discounts | ⬜ |
| **Customers** | `api/customers.py` | Customer management | ⬜ |
| **Items** | `api/items.py` | Item catalog, variants | ⬜ |
| **Layout** | `api/layout.py` | Table layout, floor display | ⬜ |

---

# Module 1: Orders Module

**File:** `imogi_pos/api/orders.py`  
**Key Functions:** 
- `create_pos_order()`
- `update_pos_order()`
- `get_pos_orders()`
- `void_pos_order()`
- `apply_pricing_rules_to_items()`

## 1.1 Positive Flow Tests

### Test 1.1.1: Create Simple Order
**Scenario:** Create a basic order with single item
**Prerequisites:**
- Valid POS Profile exists
- Customer exists
- Item exists with active status

**Test Steps:**
```
1. Call create_pos_order() with:
   - pos_profile: "RESTAURANT-01"
   - customer: "CUST001"
   - items: [{"item_code": "ITEM001", "qty": 2, "rate": 100000}]
   
2. Verify response includes:
   - order_id (UUID)
   - order_status: "Draft"
   - total_qty: 2
   - net_total: 200000
   - timestamp
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "id": "uuid-xxx",
    "status": "Draft",
    "pos_profile": "RESTAURANT-01",
    "customer": "CUST001",
    "items": [{"item_code": "ITEM001", "qty": 2}],
    "net_total": 200000,
    "timestamp": "2026-01-28T10:00:00Z"
  }
}
```

**Pass Criteria:** ✓ Order created successfully with all fields populated

---

### Test 1.1.2: Create Order with Multiple Items
**Scenario:** Create order with variant items and item options
**Prerequisites:**
- Items with variants exist
- Item options configured

**Test Steps:**
```
1. Call create_pos_order() with:
   - items: [
       {"item_code": "ITEM001", "qty": 1, "variant": "SIZE-L"},
       {"item_code": "ITEM002", "qty": 2, "options": ["extra_cheese", "spicy"]},
       {"item_code": "ITEM003", "qty": 1}
     ]
   
2. Verify each item is processed correctly
3. Verify total_qty = 4
4. Verify all options preserved
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "items": [
      {"item_code": "ITEM001", "qty": 1, "variant": "SIZE-L"},
      {"item_code": "ITEM002", "qty": 2, "options": ["extra_cheese", "spicy"]},
      {"item_code": "ITEM003", "qty": 1}
    ],
    "total_qty": 4
  }
}
```

**Pass Criteria:** ✓ All items and variants properly recorded

---

### Test 1.1.3: Update Order Items
**Scenario:** Modify order items before submission
**Prerequisites:**
- Order in Draft status exists

**Test Steps:**
```
1. Retrieve existing order
2. Call update_pos_order() with:
   - order_id: "uuid-xxx"
   - items: [
       {"item_code": "ITEM001", "qty": 3},  // qty changed
       {"item_code": "ITEM004", "qty": 1}   // new item
     ]
3. Verify old items replaced with new
4. Verify net_total recalculated
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "id": "uuid-xxx",
    "items": [
      {"item_code": "ITEM001", "qty": 3},
      {"item_code": "ITEM004", "qty": 1}
    ],
    "net_total": 300000
  }
}
```

**Pass Criteria:** ✓ Items updated and totals recalculated

---

### Test 1.1.4: Apply Pricing Rules to Order
**Scenario:** Apply automatic pricing rules and discounts
**Prerequisites:**
- Pricing rules configured
- Customer qualifies for rules

**Test Steps:**
```
1. Create order with items eligible for pricing rules
2. Verify pricing rules applied automatically
3. Verify discount calculated correctly
4. Verify net_total reflects discount
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "items": [
      {
        "item_code": "ITEM001",
        "rate": 100000,
        "discount_percentage": 10,
        "final_rate": 90000
      }
    ],
    "discount_total": 10000,
    "net_total": 90000
  }
}
```

**Pass Criteria:** ✓ Pricing rules applied correctly

---

### Test 1.1.5: Get Orders List with Filters
**Scenario:** Retrieve filtered order list
**Prerequisites:**
- Multiple orders exist

**Test Steps:**
```
1. Call get_pos_orders() with filters:
   - status: "Draft"
   - pos_profile: "RESTAURANT-01"
   - limit: 10
   
2. Verify returned list filtered correctly
3. Verify pagination works
```

**Expected Output:**
```json
{
  "success": true,
  "orders": [
    {"id": "uuid-1", "status": "Draft"},
    {"id": "uuid-2", "status": "Draft"}
  ],
  "total": 2,
  "page": 1,
  "limit": 10
}
```

**Pass Criteria:** ✓ Correct orders returned with proper filtering

---

### Test 1.1.6: Apply Coupon/Promo Code
**Scenario:** Apply promotional code to order
**Prerequisites:**
- Active promo code exists
- Order exists

**Test Steps:**
```
1. Call apply_pricing_rules_to_items() with promo code
2. Verify discount applied correctly
3. Verify net_total reduced appropriately
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "promo_code": "PROMO2026",
    "discount_percentage": 15,
    "discount_amount": 30000,
    "net_total": 170000
  }
}
```

**Pass Criteria:** ✓ Promo code validated and discount applied

---

### Test 1.1.7: Order Timestamp Validation
**Scenario:** Verify order timestamps and concurrency handling
**Prerequisites:**
- Order exists

**Test Steps:**
```
1. Get order with timestamp: 2026-01-28T10:00:00Z
2. Update order with different timestamp value
3. Verify timestamp comparison works
4. Apply concurrent update with modified timestamp
```

**Expected Output:**
```json
{
  "success": true,
  "message": "Order timestamp validated"
}
```

**Pass Criteria:** ✓ Timestamp handling prevents conflicts

---

## 1.2 Negative Flow Tests

### Test 1.2.1: Create Order with Invalid POS Profile
**Scenario:** Attempt to create order with non-existent POS Profile
**Test Steps:**
```
1. Call create_pos_order() with:
   - pos_profile: "INVALID-PROFILE"
   - items: [...]

2. Verify error response
```

**Expected Output:**
```json
{
  "success": false,
  "error": "POS Profile 'INVALID-PROFILE' not found",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Proper validation error returned

---

### Test 1.2.2: Create Order with Invalid Item Code
**Scenario:** Attempt to create order with non-existent item
**Test Steps:**
```
1. Call create_pos_order() with:
   - items: [{"item_code": "INVALID-ITEM", "qty": 1}]

2. Verify item validation failure
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'INVALID-ITEM' not found",
  "error_code": "ITEM_NOT_FOUND"
}
```

**Pass Criteria:** ✓ Item validation prevents invalid items

---

### Test 1.2.3: Create Order with Disabled Item
**Scenario:** Attempt to create order with disabled item
**Prerequisites:**
- Item exists but marked as disabled

**Test Steps:**
```
1. Call create_pos_order() with disabled item
2. Verify order creation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'ITEM001' is disabled",
  "error_code": "ITEM_DISABLED"
}
```

**Pass Criteria:** ✓ Disabled items rejected

---

### Test 1.2.4: Create Order with Insufficient Quantity
**Scenario:** Attempt to create order with negative quantity
**Test Steps:**
```
1. Call create_pos_order() with:
   - items: [{"item_code": "ITEM001", "qty": -5}]

2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Quantity must be greater than 0",
  "error_code": "INVALID_QUANTITY"
}
```

**Pass Criteria:** ✓ Invalid quantities rejected

---

### Test 1.2.5: Create Order with Zero Quantity
**Scenario:** Attempt to create order with zero quantity
**Test Steps:**
```
1. Call create_pos_order() with:
   - items: [{"item_code": "ITEM001", "qty": 0}]

2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Quantity must be greater than 0",
  "error_code": "INVALID_QUANTITY"
}
```

**Pass Criteria:** ✓ Zero quantities rejected

---

### Test 1.2.6: Create Order with Missing Customer
**Scenario:** Create order without required customer
**Test Steps:**
```
1. Call create_pos_order() with:
   - customer: null
   - items: [...]

2. Verify appropriate handling
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer is required",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Missing customer rejected

---

### Test 1.2.7: Create Order with Invalid Customer
**Scenario:** Attempt to create order with non-existent customer
**Test Steps:**
```
1. Call create_pos_order() with:
   - customer: "INVALID-CUSTOMER"
   - items: [...]

2. Verify customer validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer 'INVALID-CUSTOMER' not found",
  "error_code": "CUSTOMER_NOT_FOUND"
}
```

**Pass Criteria:** ✓ Customer validation enforced

---

### Test 1.2.8: Create Order with Empty Items List
**Scenario:** Attempt to create order with no items
**Test Steps:**
```
1. Call create_pos_order() with:
   - items: []

2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Order must contain at least one item",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Empty item list rejected

---

### Test 1.2.9: Update Non-existent Order
**Scenario:** Attempt to update order that doesn't exist
**Test Steps:**
```
1. Call update_pos_order() with:
   - order_id: "invalid-uuid"
   - items: [...]

2. Verify order not found error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Order 'invalid-uuid' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Non-existent order handled gracefully

---

### Test 1.2.10: Update Order with Stale Timestamp
**Scenario:** Attempt to update order with outdated timestamp (concurrency conflict)
**Test Steps:**
```
1. Get order with current timestamp: T1
2. Another user updates order (timestamp now T2)
3. First user attempts update with T1 timestamp

4. Verify concurrency error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Order has been modified by another user",
  "error_code": "TIMESTAMP_MISMATCH"
}
```

**Pass Criteria:** ✓ Timestamp conflict detected

---

### Test 1.2.11: Create Order for Wrong Branch
**Scenario:** User creates order for branch they don't have access to
**Prerequisites:**
- User only has access to Branch-A
- Attempt to create order for Branch-B

**Test Steps:**
```
1. Call create_pos_order() with:
   - pos_profile: "BRANCH-B-PROFILE"
   - items: [...]

2. Verify authorization check fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "You don't have permission to access this POS Profile",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Branch access validated

---

### Test 1.2.12: Create Order with Invalid Item Options
**Scenario:** Attempt to apply invalid options to item
**Prerequisites:**
- Item has configured options
- Attempted invalid option

**Test Steps:**
```
1. Call create_pos_order() with:
   - items: [
       {
         "item_code": "ITEM001",
         "qty": 1,
         "options": ["invalid_option"]
       }
     ]

2. Verify option validation
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Invalid option 'invalid_option' for item 'ITEM001'",
  "error_code": "INVALID_OPTION"
}
```

**Pass Criteria:** ✓ Invalid options rejected

---

### Test 1.2.13: Void Order - Success
**Scenario:** Cancel/void an existing order
**Prerequisites:**
- Order in Draft status exists

**Test Steps:**
```
1. Call void_pos_order() with:
   - order_id: "uuid-xxx"
   - reason: "Customer cancelled"

2. Verify order marked as void
```

**Expected Output:**
```json
{
  "success": true,
  "order": {
    "id": "uuid-xxx",
    "status": "Void",
    "void_reason": "Customer cancelled"
  }
}
```

**Pass Criteria:** ✓ Order voided successfully

---

### Test 1.2.14: Void Already Submitted Order
**Scenario:** Attempt to void order that's already billed/submitted
**Prerequisites:**
- Order in Submitted status

**Test Steps:**
```
1. Call void_pos_order() with submitted order_id
2. Verify void rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot void order with status 'Submitted'",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ Void operation limited to Draft orders

---

### Test 1.2.15: Duplicate Item Addition
**Scenario:** Add same item multiple times and verify aggregation
**Test Steps:**
```
1. Create order with:
   - items: [
       {"item_code": "ITEM001", "qty": 2},
       {"item_code": "ITEM001", "qty": 3}
     ]

2. Verify items aggregated or handled correctly
```

**Expected Output (either aggregation):**
```json
{
  "success": true,
  "order": {
    "items": [
      {"item_code": "ITEM001", "qty": 5}  // aggregated
    ]
  }
}
```

**Pass Criteria:** ✓ Duplicate items handled correctly

---

# Module 2: Billing Module

**File:** `imogi_pos/api/billing.py`  
**Key Functions:**
- `validate_pos_session()`
- `create_sales_invoice()`
- `apply_payment()`
- `process_refund()`
- `notify_stock_update()`
- `get_active_pos_session()`

## 2.1 Positive Flow Tests

### Test 2.1.1: Create Sales Invoice from Order
**Scenario:** Convert order to sales invoice
**Prerequisites:**
- Order in submitted status
- POS Opening Entry exists (if required)
- Customer valid
- Warehouse has stock

**Test Steps:**
```
1. Call create_sales_invoice() with:
   - order_id: "uuid-xxx"
   - pos_profile: "RESTAURANT-01"
   - items: [...from order...]
   
2. Verify invoice created
3. Verify is_pos=1
4. Verify status is Draft
5. Verify net_total matches order
```

**Expected Output:**
```json
{
  "success": true,
  "invoice": {
    "name": "ACC-2026-00001",
    "is_pos": true,
    "status": "Draft",
    "pos_profile": "RESTAURANT-01",
    "customer": "CUST001",
    "net_total": 200000,
    "outstanding_amount": 200000
  }
}
```

**Pass Criteria:** ✓ Invoice created with correct POS attributes

---

### Test 2.1.2: Submit Sales Invoice
**Scenario:** Submit invoice to make it final
**Prerequisites:**
- Invoice in Draft status

**Test Steps:**
```
1. Submit sales invoice
2. Verify status changed to Submitted
3. Verify accounts updated
4. Verify stock impacted
```

**Expected Output:**
```json
{
  "success": true,
  "invoice": {
    "name": "ACC-2026-00001",
    "status": "Submitted",
    "docstatus": 1
  }
}
```

**Pass Criteria:** ✓ Invoice submitted successfully

---

### Test 2.1.3: Apply Full Payment
**Scenario:** Apply payment to invoice until fully paid
**Prerequisites:**
- Submitted invoice with outstanding amount

**Test Steps:**
```
1. Call apply_payment() with:
   - invoice_name: "ACC-2026-00001"
   - amount: 200000
   - payment_method: "CASH"
   - mode_of_payment: "Cash"
   
2. Verify payment recorded
3. Verify outstanding_amount = 0
4. Verify invoice status = Paid
```

**Expected Output:**
```json
{
  "success": true,
  "payment": {
    "invoice": "ACC-2026-00001",
    "amount_paid": 200000,
    "outstanding": 0,
    "payment_method": "CASH",
    "status": "Paid"
  }
}
```

**Pass Criteria:** ✓ Full payment applied and invoice marked paid

---

### Test 2.1.4: Apply Partial Payment
**Scenario:** Apply partial payment to invoice
**Prerequisites:**
- Submitted invoice with outstanding amount

**Test Steps:**
```
1. Call apply_payment() with:
   - invoice_name: "ACC-2026-00001"
   - amount: 100000
   - outstanding_before: 200000
   
2. Verify partial payment recorded
3. Verify outstanding_amount = 100000
4. Verify invoice status still unpaid
```

**Expected Output:**
```json
{
  "success": true,
  "payment": {
    "invoice": "ACC-2026-00001",
    "amount_paid": 100000,
    "outstanding": 100000,
    "payment_method": "CASH",
    "status": "Partial Payment"
  }
}
```

**Pass Criteria:** ✓ Partial payment applied correctly

---

### Test 2.1.5: Apply Multiple Payment Methods
**Scenario:** Pay invoice with multiple methods
**Prerequisites:**
- Submitted invoice with outstanding amount

**Test Steps:**
```
1. Apply payment method 1: 100000 CASH
2. Apply payment method 2: 100000 CARD
3. Verify both payments recorded
4. Verify outstanding = 0
```

**Expected Output:**
```json
{
  "success": true,
  "payment": {
    "invoice": "ACC-2026-00001",
    "payments": [
      {"method": "CASH", "amount": 100000},
      {"method": "CARD", "amount": 100000}
    ],
    "total_paid": 200000,
    "outstanding": 0
  }
}
```

**Pass Criteria:** ✓ Multiple payment methods combined correctly

---

### Test 2.1.6: Apply Payment with Rounding
**Scenario:** Apply payment with rounding tolerance
**Prerequisites:**
- Invoice with rounding-prone total (e.g., 199.99)
- Rounding tolerance configured

**Test Steps:**
```
1. Invoice net_total: 199999
2. Apply payment: 200000
3. Verify rounding tolerance applied
4. Verify payment accepted
```

**Expected Output:**
```json
{
  "success": true,
  "payment": {
    "amount_paid": 200000,
    "rounding_applied": 1,
    "outstanding": 0
  }
}
```

**Pass Criteria:** ✓ Rounding tolerance applied correctly

---

### Test 2.1.7: Process Refund
**Scenario:** Refund paid invoice
**Prerequisites:**
- Paid invoice exists

**Test Steps:**
```
1. Call process_refund() with:
   - invoice_name: "ACC-2026-00001"
   - refund_amount: 200000
   - refund_method: "CASH"
   
2. Verify refund recorded
3. Verify accounts reversed
4. Verify stock returned
```

**Expected Output:**
```json
{
  "success": true,
  "refund": {
    "invoice": "ACC-2026-00001",
    "refund_amount": 200000,
    "refund_method": "CASH",
    "status": "Refunded"
  }
}
```

**Pass Criteria:** ✓ Refund processed and accounts reversed

---

### Test 2.1.8: Validate POS Session Exists
**Scenario:** Verify POS session validation passes when session exists
**Prerequisites:**
- POS Opening Entry exists and active
- POS Profile requires session

**Test Steps:**
```
1. Call validate_pos_session() with:
   - pos_profile: "RESTAURANT-01"
   
2. Verify session found
3. Verify session active
```

**Expected Output:**
```json
{
  "success": true,
  "session": {
    "pos_opening_entry": "POS-2026-00001",
    "status": "Open",
    "user": "manager@imogi.com"
  }
}
```

**Pass Criteria:** ✓ Session validation passes

---

### Test 2.1.9: Get Active POS Session
**Scenario:** Retrieve active POS session for user
**Prerequisites:**
- User has active POS session

**Test Steps:**
```
1. Call get_active_pos_session() with scope
2. Verify session returned with details
```

**Expected Output:**
```json
{
  "success": true,
  "session": {
    "name": "POS-2026-00001",
    "user": "manager@imogi.com",
    "pos_profile": "RESTAURANT-01",
    "opening_time": "2026-01-28T08:00:00Z",
    "status": "Open"
  }
}
```

**Pass Criteria:** ✓ Active session retrieved

---

### Test 2.1.10: Notify Stock Update
**Scenario:** Publish stock level updates after invoice submission
**Prerequisites:**
- Submitted invoice with items

**Test Steps:**
```
1. Submit invoice with items
2. Verify stock notification published
3. Verify KDS received notification
```

**Expected Output:**
```json
{
  "success": true,
  "message": "Stock update notifications published",
  "items_notified": 3
}
```

**Pass Criteria:** ✓ Stock notifications published to relevant systems

---

## 2.2 Negative Flow Tests

### Test 2.2.1: Create Invoice Without POS Session (Required)
**Scenario:** Attempt to bill without active POS session when required
**Prerequisites:**
- POS Profile has enforce_session=true
- No active POS Opening Entry

**Test Steps:**
```
1. Call create_sales_invoice() with
   - pos_profile: "RESTAURANT-01" (requires session)
   - No active session exists
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "No active POS Opening Entry found. Please open a session before proceeding.",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Session requirement enforced

---

### Test 2.2.2: Create Invoice with Invalid Customer
**Scenario:** Attempt to bill with non-existent customer
**Test Steps:**
```
1. Call create_sales_invoice() with:
   - customer: "INVALID-CUST"
   
2. Verify customer validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer 'INVALID-CUST' not found",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Customer validation enforced

---

### Test 2.2.3: Create Invoice with Disabled Item
**Scenario:** Attempt to bill item marked as disabled
**Prerequisites:**
- Item marked as disabled

**Test Steps:**
```
1. Call create_sales_invoice() with disabled item
2. Verify item validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'ITEM001' is disabled",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Disabled items rejected

---

### Test 2.2.4: Create Invoice with Insufficient Stock
**Scenario:** Attempt to bill when warehouse has insufficient stock
**Prerequisites:**
- Warehouse has 5 units
- Attempt to bill 10 units

**Test Steps:**
```
1. Call create_sales_invoice() with:
   - item_code: "ITEM001"
   - qty: 10
   - warehouse: has only 5 units
   
2. Verify stock validation
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Insufficient stock for item 'ITEM001'. Available: 5, Required: 10",
  "error_code": "NEGATIVE_STOCK_ERROR"
}
```

**Pass Criteria:** ✓ Insufficient stock prevented

---

### Test 2.2.5: Apply Payment Exceeding Invoice Amount
**Scenario:** Attempt to apply payment more than outstanding
**Prerequisites:**
- Invoice outstanding: 100000
- Attempt payment: 150000

**Test Steps:**
```
1. Call apply_payment() with:
   - amount: 150000
   - outstanding: 100000
   
2. Verify overpayment handling
```

**Expected Output (depends on configuration):**
```json
{
  "success": false,
  "error": "Payment amount 150000 exceeds outstanding amount 100000",
  "error_code": "OVERPAYMENT_NOT_ALLOWED"
}
```

**Pass Criteria:** ✓ Overpayment prevented or handled

---

### Test 2.2.6: Apply Negative Payment
**Scenario:** Attempt to apply negative/zero payment
**Test Steps:**
```
1. Call apply_payment() with:
   - amount: -50000
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Payment amount must be greater than 0",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Negative payments rejected

---

### Test 2.2.7: Apply Payment to Non-existent Invoice
**Scenario:** Attempt to apply payment to invoice that doesn't exist
**Test Steps:**
```
1. Call apply_payment() with:
   - invoice_name: "ACC-2099-00999"
   
2. Verify invoice not found error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Invoice 'ACC-2099-00999' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Invoice existence validated

---

### Test 2.2.8: Apply Payment to Draft Invoice
**Scenario:** Attempt to apply payment to unsubmitted invoice
**Prerequisites:**
- Invoice in Draft status

**Test Steps:**
```
1. Call apply_payment() with draft invoice
2. Verify payment rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot apply payment to draft invoice",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ Payment limited to submitted invoices

---

### Test 2.2.9: Process Refund Exceeding Paid Amount
**Scenario:** Attempt to refund more than paid
**Prerequisites:**
- Invoice paid: 100000
- Attempt refund: 150000

**Test Steps:**
```
1. Call process_refund() with:
   - refund_amount: 150000
   - paid_amount: 100000
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Refund amount 150000 exceeds paid amount 100000",
  "error_code": "INVALID_REFUND"
}
```

**Pass Criteria:** ✓ Excessive refund prevented

---

### Test 2.2.10: Process Refund on Unpaid Invoice
**Scenario:** Attempt to refund invoice with no payment
**Prerequisites:**
- Invoice in Draft or unpaid status

**Test Steps:**
```
1. Call process_refund() with unpaid invoice
2. Verify refund rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot refund unpaid invoice",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ Refund limited to paid invoices

---

### Test 2.2.11: Validate Session - Session Required But None Exists
**Scenario:** Validate session when required but none active
**Prerequisites:**
- POS Profile requires session
- No active session

**Test Steps:**
```
1. Call validate_pos_session() with:
   - pos_profile: "RESTAURANT-01"
   - enforce_session: true
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "No active POS Opening Entry found",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Session requirement enforced

---

### Test 2.2.12: Get Active Session - No Session for User
**Scenario:** Attempt to get session for user with no active session
**Test Steps:**
```
1. Call get_active_pos_session()
2. Verify null/empty response
```

**Expected Output:**
```json
{
  "success": true,
  "session": null
}
```

**Pass Criteria:** ✓ Null response for user with no session

---

### Test 2.2.13: Apply Payment with Invalid Method
**Scenario:** Attempt to apply payment with non-existent method
**Test Steps:**
```
1. Call apply_payment() with:
   - payment_method: "BITCOIN"  // not configured
   
2. Verify method validation
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Payment method 'BITCOIN' not configured",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Payment method validated

---

### Test 2.2.14: Create Invoice with Branch Access Violation
**Scenario:** User creates invoice for branch they don't access
**Prerequisites:**
- User only has access to Branch-A
- Attempt invoice for Branch-B

**Test Steps:**
```
1. Call create_sales_invoice() with:
   - pos_profile: "BRANCH-B-PROFILE"
   
2. Verify authorization check fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "You don't have permission to access this branch",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Branch access enforced

---

### Test 2.2.15: Submit Already Submitted Invoice
**Scenario:** Attempt to submit invoice twice
**Prerequisites:**
- Invoice already submitted

**Test Steps:**
```
1. Call submit on already-submitted invoice
2. Verify duplicate submission prevented
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Invoice already submitted",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ Duplicate submission prevented

---

# Module 3: Kitchen Order Tickets (KOT) Module

**File:** `imogi_pos/api/kot.py` & `imogi_pos/kitchen/kot_service.py`  
**Key Functions:**
- `create_kot_ticket()`
- `update_kot_item_state()`
- `get_kot_tickets()`
- `update_kot_ticket_status()`
- `print_kot()`
- `publish_kitchen_update()`

## 3.1 Positive Flow Tests

### Test 3.1.1: Create KOT Ticket from Order
**Scenario:** Generate kitchen order ticket from order items
**Prerequisites:**
- Order with items submitted
- Kitchen routing configured

**Test Steps:**
```
1. Call create_kot_ticket() with:
   - order_id: "uuid-xxx"
   - pos_profile: "RESTAURANT-01"
   
2. Verify KOT ticket created
3. Verify items routed to correct stations
4. Verify status = "New"
5. Verify timestamp recorded
```

**Expected Output:**
```json
{
  "success": true,
  "kot": {
    "id": "KOT-2026-00001",
    "order_id": "uuid-xxx",
    "status": "New",
    "kitchen_station": "MAIN-KITCHEN",
    "items": [
      {
        "item_code": "ITEM001",
        "qty": 2,
        "status": "Pending"
      }
    ],
    "timestamp": "2026-01-28T10:30:00Z"
  }
}
```

**Pass Criteria:** ✓ KOT created with proper routing

---

### Test 3.1.2: Create Multiple KOT Tickets for Different Stations
**Scenario:** Order items route to different kitchen stations
**Prerequisites:**
- Items in order route to GRILL, PASTRY, BEVERAGE stations

**Test Steps:**
```
1. Create order with items for multiple stations
2. Call create_kot_ticket()
3. Verify separate KOT created per station
```

**Expected Output:**
```json
{
  "success": true,
  "kots": [
    {
      "id": "KOT-2026-00001",
      "kitchen_station": "GRILL",
      "items": [...]
    },
    {
      "id": "KOT-2026-00002",
      "kitchen_station": "PASTRY",
      "items": [...]
    },
    {
      "id": "KOT-2026-00003",
      "kitchen_station": "BEVERAGE",
      "items": [...]
    }
  ]
}
```

**Pass Criteria:** ✓ Correct routing to multiple stations

---

### Test 3.1.3: Update KOT Item Status - In Progress
**Scenario:** Kitchen staff mark item as being prepared
**Prerequisites:**
- KOT ticket exists with items in Pending status

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - kot_id: "KOT-2026-00001"
   - item_code: "ITEM001"
   - status: "In Progress"
   
2. Verify item status updated
3. Verify waiter display notified
4. Verify KDS updated
```

**Expected Output:**
```json
{
  "success": true,
  "item": {
    "item_code": "ITEM001",
    "status": "In Progress",
    "started_at": "2026-01-28T10:35:00Z"
  }
}
```

**Pass Criteria:** ✓ Item status updated and notified

---

### Test 3.1.4: Update KOT Item Status - Ready
**Scenario:** Kitchen staff mark item as ready to serve
**Prerequisites:**
- Item in "In Progress" status

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - status: "Ready"
   
2. Verify item marked ready
3. Verify waiter notified
4. Verify customer display updated
```

**Expected Output:**
```json
{
  "success": true,
  "item": {
    "item_code": "ITEM001",
    "status": "Ready",
    "completed_at": "2026-01-28T10:45:00Z"
  }
}
```

**Pass Criteria:** ✓ Ready status propagated to all displays

---

### Test 3.1.5: Update KOT Item Status - Rejected
**Scenario:** Kitchen staff reject item (out of stock, quality issue)
**Prerequisites:**
- KOT item in pending/in-progress

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - status: "Rejected"
   - rejection_reason: "Out of stock"
   
2. Verify rejection recorded
3. Verify waiter notified
4. Verify system prompts for alternative
```

**Expected Output:**
```json
{
  "success": true,
  "item": {
    "item_code": "ITEM001",
    "status": "Rejected",
    "rejection_reason": "Out of stock",
    "rejected_at": "2026-01-28T10:35:00Z"
  }
}
```

**Pass Criteria:** ✓ Rejection recorded and communicated

---

### Test 3.1.6: Get KOT Tickets List with Filter
**Scenario:** Retrieve KOT tickets for specific kitchen station
**Prerequisites:**
- Multiple KOT tickets exist

**Test Steps:**
```
1. Call get_kot_tickets() with:
   - kitchen_station: "MAIN-KITCHEN"
   - status: "New"
   - limit: 20
   
2. Verify correct tickets returned
3. Verify filtered by status
```

**Expected Output:**
```json
{
  "success": true,
  "kots": [
    {
      "id": "KOT-2026-00001",
      "status": "New",
      "kitchen_station": "MAIN-KITCHEN"
    },
    {
      "id": "KOT-2026-00002",
      "status": "New",
      "kitchen_station": "MAIN-KITCHEN"
    }
  ],
  "total": 2
}
```

**Pass Criteria:** ✓ Correct filtering and pagination

---

### Test 3.1.7: Update KOT Ticket Status - Completed
**Scenario:** Mark entire KOT as completed when all items ready
**Prerequisites:**
- All items in KOT have status "Ready"

**Test Steps:**
```
1. Call update_kot_ticket_status() with:
   - kot_id: "KOT-2026-00001"
   - status: "Completed"
   
2. Verify KOT marked completed
3. Verify timestamp recorded
```

**Expected Output:**
```json
{
  "success": true,
  "kot": {
    "id": "KOT-2026-00001",
    "status": "Completed",
    "completed_at": "2026-01-28T10:50:00Z"
  }
}
```

**Pass Criteria:** ✓ KOT completion recorded

---

### Test 3.1.8: Print KOT Ticket
**Scenario:** Print KOT for kitchen staff
**Prerequisites:**
- KOT ticket exists
- Printer configured

**Test Steps:**
```
1. Call print_kot() with:
   - kot_id: "KOT-2026-00001"
   - printer_device: "KITCHEN-PRINTER-01"
   
2. Verify print job sent
3. Verify print log recorded
```

**Expected Output:**
```json
{
  "success": true,
  "print": {
    "kot_id": "KOT-2026-00001",
    "printer": "KITCHEN-PRINTER-01",
    "status": "Sent",
    "timestamp": "2026-01-28T10:30:00Z"
  }
}
```

**Pass Criteria:** ✓ Print job sent to device

---

### Test 3.1.9: Publish Kitchen Update Realtime
**Scenario:** Publish KOT update via realtime to connected clients
**Prerequisites:**
- KOT item status changed
- Kitchen Display System connected

**Test Steps:**
```
1. Update item status to "Ready"
2. Call publish_kitchen_update() with:
   - kot_ticket: KOT-2026-00001
   - event_type: "kot_item_ready"
   
3. Verify message published
4. Verify KDS receives update
```

**Expected Output:**
```json
{
  "success": true,
  "event": {
    "type": "kot_item_ready",
    "kot_id": "KOT-2026-00001",
    "item": "ITEM001",
    "status": "Ready",
    "timestamp": "2026-01-28T10:45:00Z"
  }
}
```

**Pass Criteria:** ✓ Realtime update published

---

### Test 3.1.10: Update KOT Item with Special Instructions
**Scenario:** Items with special cooking instructions
**Prerequisites:**
- Order contains items with notes

**Test Steps:**
```
1. Create order with item notes:
   - "No salt"
   - "Extra spicy"
   
2. Create KOT ticket
3. Verify notes displayed in KOT
4. Verify kitchen staff sees instructions
```

**Expected Output:**
```json
{
  "success": true,
  "kot": {
    "items": [
      {
        "item_code": "ITEM001",
        "qty": 1,
        "special_instructions": "No salt, Extra spicy"
      }
    ]
  }
}
```

**Pass Criteria:** ✓ Special instructions captured and displayed

---

## 3.2 Negative Flow Tests

### Test 3.2.1: Create KOT Without Kitchen Routing Configuration
**Scenario:** Attempt to create KOT when kitchen routing not configured
**Prerequisites:**
- No kitchen routing setup for items

**Test Steps:**
```
1. Create order with items
2. Call create_kot_ticket()
3. Verify error for missing routing
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Kitchen routing not configured for item 'ITEM001'",
  "error_code": "ROUTING_NOT_FOUND"
}
```

**Pass Criteria:** ✓ Missing routing configuration detected

---

### Test 3.2.2: Create KOT Without Restaurant Domain
**Scenario:** Attempt to create KOT for non-restaurant POS Profile
**Prerequisites:**
- POS Profile domain is "Retail"

**Test Steps:**
```
1. Call create_kot_ticket() with:
   - pos_profile: "RETAIL-PROFILE" (domain: Retail)
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Kitchen operations are only available for Restaurant domain",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Domain validation enforced

---

### Test 3.2.3: Update KOT Item Status - Invalid Transition
**Scenario:** Attempt invalid status transition (e.g., Pending→Ready without In Progress)
**Prerequisites:**
- Item in Pending status
- Workflow requires In Progress step

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - status: "Ready"  // skip In Progress
   
2. Verify invalid transition rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot transition from 'Pending' to 'Ready' directly",
  "error_code": "INVALID_STATE_TRANSITION"
}
```

**Pass Criteria:** ✓ Invalid transitions blocked

---

### Test 3.2.4: Update Non-existent KOT Item
**Scenario:** Attempt to update item that doesn't exist in KOT
**Test Steps:**
```
1. Call update_kot_item_state() with:
   - kot_id: "KOT-2026-00001"
   - item_code: "NONEXISTENT"
   
2. Verify item not found error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'NONEXISTENT' not found in KOT 'KOT-2026-00001'",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Item existence validated

---

### Test 3.2.5: Update KOT with Invalid Rejection Reason
**Scenario:** Reject item without providing reason
**Prerequisites:**
- Rejection reason is required

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - status: "Rejected"
   - rejection_reason: null
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Rejection reason is required",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Rejection reason required

---

### Test 3.2.6: Update Already Completed KOT
**Scenario:** Attempt to modify item in completed KOT
**Prerequisites:**
- KOT status is Completed

**Test Steps:**
```
1. Call update_kot_item_state() with completed KOT
2. Verify modification rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot modify completed KOT 'KOT-2026-00001'",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ Completed KOT protected from modification

---

### Test 3.2.7: Print KOT with Invalid Printer
**Scenario:** Attempt to print to non-existent printer
**Test Steps:**
```
1. Call print_kot() with:
   - printer_device: "NONEXISTENT-PRINTER"
   
2. Verify printer validation
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Printer 'NONEXISTENT-PRINTER' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Printer existence validated

---

### Test 3.2.8: Print KOT with Offline Printer
**Scenario:** Attempt to print when printer offline
**Prerequisites:**
- Printer marked as offline/inactive

**Test Steps:**
```
1. Call print_kot() with offline printer
2. Verify offline status detected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Printer 'KITCHEN-PRINTER-01' is offline",
  "error_code": "DEVICE_OFFLINE"
}
```

**Pass Criteria:** ✓ Offline printer detected

---

### Test 3.2.9: Create KOT from Void Order
**Scenario:** Attempt to create KOT from voided order
**Prerequisites:**
- Order status is Void

**Test Steps:**
```
1. Call create_kot_ticket() with voided order
2. Verify rejection
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Cannot create KOT from voided order 'uuid-xxx'",
  "error_code": "INVALID_STATE"
}
```

**Pass Criteria:** ✓ KOT creation from void prevented

---

### Test 3.2.10: Update KOT Item - Branch Access Violation
**Scenario:** Kitchen staff updates KOT from different branch
**Prerequisites:**
- Staff only has access to Branch-A
- KOT is from Branch-B

**Test Steps:**
```
1. Call update_kot_item_state() with:
   - kot_id: "KOT-BRANCH-B-001"
   
2. Verify authorization check fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "You don't have permission to access KOT from this branch",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Cross-branch access prevented

---

### Test 3.2.11: Get KOT Tickets - Invalid Kitchen Station
**Scenario:** Query KOT with non-existent kitchen station
**Test Steps:**
```
1. Call get_kot_tickets() with:
   - kitchen_station: "NONEXISTENT-STATION"
   
2. Verify empty result or error
```

**Expected Output:**
```json
{
  "success": true,
  "kots": [],
  "total": 0
}
```

**Pass Criteria:** ✓ Empty result for non-existent station

---

### Test 3.2.12: Update KOT Status - Invalid Status Value
**Scenario:** Attempt to set invalid KOT status
**Test Steps:**
```
1. Call update_kot_ticket_status() with:
   - status: "INVALID-STATUS"
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Invalid status 'INVALID-STATUS'",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Invalid status values rejected

---

### Test 3.2.13: Create KOT - Order Not Found
**Scenario:** Attempt to create KOT from non-existent order
**Test Steps:**
```
1. Call create_kot_ticket() with:
   - order_id: "invalid-uuid"
   
2. Verify order not found error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Order 'invalid-uuid' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Order existence validated

---

# Module 4: Authorization & Access Control

**File:** `imogi_pos/utils/permission_manager.py`  
**Key Functions:**
- `check_branch_access()`
- `check_doctype_permission()`
- `require_permission()`
- `require_role()`

## 4.1 Positive Flow Tests

### Test 4.1.1: User with Branch Access
**Scenario:** User with valid branch access can perform operations
**Prerequisites:**
- User assigned to Branch-A
- User has Cashier role

**Test Steps:**
```
1. Call check_branch_access() with:
   - branch: "Branch-A"
   - operation: "create_order"
   
2. Verify access granted
```

**Expected Output:**
```json
{
  "success": true,
  "access_granted": true,
  "branch": "Branch-A"
}
```

**Pass Criteria:** ✓ Authorized user granted access

---

### Test 4.1.2: User with Required Role
**Scenario:** User with required role can execute function
**Prerequisites:**
- User has Kitchen Staff role

**Test Steps:**
```
1. Call require_role("Kitchen Staff")
2. Verify user has role
3. Execute function
```

**Expected Output:**
```json
{
  "success": true,
  "role_verified": true,
  "user": "kitchen@imogi.com"
}
```

**Pass Criteria:** ✓ Role requirement satisfied

---

### Test 4.1.3: User with DocType Permission
**Scenario:** User with DocType permission can modify document
**Prerequisites:**
- User has write permission on Sales Invoice

**Test Steps:**
```
1. Call check_doctype_permission() with:
   - doctype: "Sales Invoice"
   - permission_type: "write"
   
2. Verify permission granted
```

**Expected Output:**
```json
{
  "success": true,
  "permission_granted": true,
  "doctype": "Sales Invoice",
  "permission": "write"
}
```

**Pass Criteria:** ✓ DocType permission verified

---

### Test 4.1.4: System Manager Override
**Scenario:** System Manager can access all resources
**Prerequisites:**
- User has System Manager role

**Test Steps:**
```
1. Attempt to access restricted resource
2. System Manager should be allowed
3. Verify override works
```

**Expected Output:**
```json
{
  "success": true,
  "access_granted": true,
  "reason": "System Manager"
}
```

**Pass Criteria:** ✓ System Manager can override restrictions

---

## 4.2 Negative Flow Tests

### Test 4.2.1: User Without Branch Access
**Scenario:** User attempts operation for branch they don't access
**Prerequisites:**
- User assigned to Branch-A only
- Attempt operation on Branch-B

**Test Steps:**
```
1. Call check_branch_access() with:
   - branch: "Branch-B"
   
2. Verify access denied
```

**Expected Output:**
```json
{
  "success": false,
  "access_granted": false,
  "error": "You don't have permission to access Branch-B",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Cross-branch access blocked

---

### Test 4.2.2: User Without Required Role
**Scenario:** User without required role cannot execute function
**Prerequisites:**
- User is Cashier
- Function requires Kitchen Staff role

**Test Steps:**
```
1. Cashier attempts kitchen operation
2. Verify role check fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "You require 'Kitchen Staff' role to access this function",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Missing role prevented execution

---

### Test 4.2.3: User Without DocType Permission
**Scenario:** User without required DocType permission
**Prerequisites:**
- User doesn't have write permission on specific DocType

**Test Steps:**
```
1. Call check_doctype_permission() with:
   - doctype: "POS Profile"
   - permission_type: "write"
   - user lacks write permission
   
2. Verify permission denied
```

**Expected Output:**
```json
{
  "success": false,
  "permission_granted": false,
  "error": "You don't have write permission on POS Profile",
  "error_code": "PERMISSION_DENIED"
}
```

**Pass Criteria:** ✓ Missing DocType permission blocked

---

### Test 4.2.4: Guest User Access
**Scenario:** Unauthenticated user attempts operation
**Prerequisites:**
- User not logged in

**Test Steps:**
```
1. Attempt to execute protected function as guest
2. Verify authentication required
```

**Expected Output:**
```json
{
  "success": false,
  "error": "You must be logged in to access this resource",
  "error_code": "AUTHENTICATION_REQUIRED"
}
```

**Pass Criteria:** ✓ Unauthenticated access blocked

---

### Test 4.2.5: Disabled User Account
**Scenario:** Disabled user attempts operation
**Prerequisites:**
- User account disabled

**Test Steps:**
```
1. Disabled user attempts operation
2. Verify disabled status prevents access
```

**Expected Output:**
```json
{
  "success": false,
  "error": "User account is disabled",
  "error_code": "ACCOUNT_DISABLED"
}
```

**Pass Criteria:** ✓ Disabled users blocked from access

---

### Test 4.2.6: Invalid User
**Scenario:** Operation with invalid/deleted user
**Test Steps:**
```
1. Call check_branch_access() with invalid user
2. Verify user validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "User not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Invalid user rejected

---

# Module 5: Pricing Module

**File:** `imogi_pos/api/pricing.py`  
**Key Functions:**
- `get_price_list_rate_maps()`
- `apply_pricing_rules_to_items()`
- `calculate_item_price()`
- `apply_item_discount()`

## 5.1 Positive Flow Tests

### Test 5.1.1: Get Price List Rates
**Scenario:** Retrieve pricing for items from price list
**Prerequisites:**
- Price List exists with item rates

**Test Steps:**
```
1. Call get_price_list_rate_maps() with:
   - price_list: "PL-STANDARD"
   - items: ["ITEM001", "ITEM002", "ITEM003"]
   
2. Verify rates returned for each item
```

**Expected Output:**
```json
{
  "success": true,
  "price_list": "PL-STANDARD",
  "rates": {
    "ITEM001": 100000,
    "ITEM002": 150000,
    "ITEM003": 75000
  }
}
```

**Pass Criteria:** ✓ Correct rates retrieved for items

---

### Test 5.1.2: Apply Tiered Pricing
**Scenario:** Apply quantity-based tiered pricing
**Prerequisites:**
- Tiered pricing configured for item

**Test Steps:**
```
1. Order Qty 1-5: Rate 100000
2. Order Qty 6-10: Rate 95000
3. Order Qty 11+: Rate 90000

4. Call calculate_item_price() with:
   - item_code: "ITEM001"
   - qty: 8
   
5. Verify correct tier applied
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "ITEM001",
  "qty": 8,
  "rate": 95000,
  "tier": "6-10",
  "total": 760000
}
```

**Pass Criteria:** ✓ Correct tier pricing applied

---

### Test 5.1.3: Apply Customer-specific Pricing
**Scenario:** Apply customer group discounts
**Prerequisites:**
- Customer in "Wholesale" group with 10% discount

**Test Steps:**
```
1. Call apply_pricing_rules_to_items() with:
   - customer: "WHOLESALE-CUST001"
   - items: ["ITEM001"]
   
2. Verify customer group discount applied
```

**Expected Output:**
```json
{
  "success": true,
  "items": [
    {
      "item_code": "ITEM001",
      "rate": 100000,
      "discount_percentage": 10,
      "final_rate": 90000
    }
  ]
}
```

**Pass Criteria:** ✓ Customer group pricing applied

---

### Test 5.1.4: Apply Item-specific Discount
**Scenario:** Apply discount specific to item
**Prerequisites:**
- Item has 15% promotional discount

**Test Steps:**
```
1. Call apply_item_discount() with:
   - item_code: "ITEM001"
   - base_rate: 100000
   
2. Verify item discount applied
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "ITEM001",
  "base_rate": 100000,
  "discount_percentage": 15,
  "discounted_rate": 85000
}
```

**Pass Criteria:** ✓ Item discount calculated

---

### Test 5.1.5: Apply Multiple Pricing Rules
**Scenario:** Combine multiple applicable pricing rules
**Prerequisites:**
- Item discount 10%
- Customer group discount 5%
- Quantity tier discount 3%

**Test Steps:**
```
1. Apply all rules
2. Verify stacking logic (if applicable)
3. Verify final rate correct
```

**Expected Output:**
```json
{
  "success": true,
  "rules_applied": [
    {"type": "item_discount", "percentage": 10},
    {"type": "customer_group_discount", "percentage": 5}
  ],
  "total_discount": 15,
  "final_rate": 85000
}
```

**Pass Criteria:** ✓ All applicable rules applied

---

### Test 5.1.6: Get Price with Tax
**Scenario:** Calculate price including tax
**Prerequisites:**
- Tax configured for item

**Test Steps:**
```
1. Call calculate_item_price() with:
   - item_code: "ITEM001"
   - qty: 1
   - include_tax: true
   
2. Verify tax calculated and added
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "ITEM001",
  "base_rate": 100000,
  "tax_rate": 10,
  "tax_amount": 10000,
  "total_with_tax": 110000
}
```

**Pass Criteria:** ✓ Tax correctly calculated

---

## 5.2 Negative Flow Tests

### Test 5.2.1: Get Rates for Invalid Item
**Scenario:** Request pricing for non-existent item
**Test Steps:**
```
1. Call get_price_list_rate_maps() with:
   - items: ["INVALID-ITEM"]
   
2. Verify error or empty rate
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'INVALID-ITEM' not found",
  "error_code": "ITEM_NOT_FOUND"
}
```

**Pass Criteria:** ✓ Invalid item validation

---

### Test 5.2.2: Get Rates from Invalid Price List
**Scenario:** Request rates from non-existent price list
**Test Steps:**
```
1. Call get_price_list_rate_maps() with:
   - price_list: "INVALID-PL"
   
2. Verify error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Price List 'INVALID-PL' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Price list validation

---

### Test 5.2.3: Calculate Price with Zero Quantity
**Scenario:** Calculate price with qty=0
**Test Steps:**
```
1. Call calculate_item_price() with:
   - qty: 0
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Quantity must be greater than 0",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Zero quantity rejected

---

### Test 5.2.4: Calculate Price with Negative Quantity
**Scenario:** Calculate price with negative qty
**Test Steps:**
```
1. Call calculate_item_price() with:
   - qty: -10
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Quantity must be greater than 0",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Negative quantity rejected

---

### Test 5.2.5: Apply Discount with Invalid Customer
**Scenario:** Apply customer pricing for non-existent customer
**Test Steps:**
```
1. Call apply_pricing_rules_to_items() with:
   - customer: "INVALID-CUST"
   
2. Verify error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer 'INVALID-CUST' not found",
  "error_code": "CUSTOMER_NOT_FOUND"
}
```

**Pass Criteria:** ✓ Customer validation

---

### Test 5.2.6: Get Disabled Item Price
**Scenario:** Get pricing for disabled item
**Prerequisites:**
- Item marked as disabled

**Test Steps:**
```
1. Call get_price_list_rate_maps() with disabled item
2. Verify disabled status handled
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'ITEM001' is disabled",
  "error_code": "ITEM_DISABLED"
}
```

**Pass Criteria:** ✓ Disabled items rejected

---

# Module 6: Customers & Items Module

**File:** `imogi_pos/api/customers.py` & `imogi_pos/api/items.py`  
**Key Functions:**
- `get_customers()`
- `create_customer()`
- `get_items()`
- `get_item_variants()`
- `get_item_options()`

## 6.1 Positive Flow Tests

### Test 6.1.1: Get Customers List
**Scenario:** Retrieve list of active customers
**Test Steps:**
```
1. Call get_customers() with:
   - status: "Active"
   - limit: 50
   
2. Verify customers returned
```

**Expected Output:**
```json
{
  "success": true,
  "customers": [
    {
      "name": "CUST001",
      "customer_name": "John Doe",
      "email": "john@example.com",
      "phone": "0812345678"
    }
  ],
  "total": 1
}
```

**Pass Criteria:** ✓ Customers list retrieved

---

### Test 6.1.2: Get Items with Filter
**Scenario:** Retrieve items filtered by category and status
**Test Steps:**
```
1. Call get_items() with:
   - category: "Beverages"
   - is_active: true
   
2. Verify filtered items returned
```

**Expected Output:**
```json
{
  "success": true,
  "items": [
    {
      "item_code": "ITEM001",
      "item_name": "Coffee",
      "category": "Beverages",
      "rate": 50000
    }
  ],
  "total": 1
}
```

**Pass Criteria:** ✓ Filtered items retrieved

---

### Test 6.1.3: Get Item Variants
**Scenario:** Retrieve variants for item
**Prerequisites:**
- Item has variants configured

**Test Steps:**
```
1. Call get_item_variants() with:
   - item_code: "ITEM001"
   
2. Verify all variants returned
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "ITEM001",
  "variants": [
    {
      "variant_code": "ITEM001-S",
      "size": "Small",
      "price": 50000
    },
    {
      "variant_code": "ITEM001-M",
      "size": "Medium",
      "price": 65000
    },
    {
      "variant_code": "ITEM001-L",
      "size": "Large",
      "price": 80000
    }
  ]
}
```

**Pass Criteria:** ✓ Variants retrieved correctly

---

### Test 6.1.4: Get Item Options
**Scenario:** Retrieve configurable options for item
**Prerequisites:**
- Item has options configured

**Test Steps:**
```
1. Call get_item_options() with:
   - item_code: "ITEM002"
   
2. Verify options with choices returned
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "ITEM002",
  "options": [
    {
      "option_name": "extra_toppings",
      "label": "Extra Toppings",
      "choices": ["cheese", "pepperoni", "mushroom"],
      "max_selections": 3
    },
    {
      "option_name": "spice_level",
      "label": "Spice Level",
      "choices": ["mild", "medium", "hot", "extra_hot"],
      "max_selections": 1
    }
  ]
}
```

**Pass Criteria:** ✓ Options and choices retrieved

---

### Test 6.1.5: Create New Customer
**Scenario:** Create new customer record
**Test Steps:**
```
1. Call create_customer() with:
   - customer_name: "Jane Smith"
   - email: "jane@example.com"
   - phone: "0898765432"
   
2. Verify customer created
```

**Expected Output:**
```json
{
  "success": true,
  "customer": {
    "name": "CUST002",
    "customer_name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "0898765432"
  }
}
```

**Pass Criteria:** ✓ Customer created successfully

---

## 6.2 Negative Flow Tests

### Test 6.2.1: Get Items from Invalid Category
**Scenario:** Filter items with non-existent category
**Test Steps:**
```
1. Call get_items() with:
   - category: "INVALID-CATEGORY"
   
2. Verify empty result
```

**Expected Output:**
```json
{
  "success": true,
  "items": [],
  "total": 0
}
```

**Pass Criteria:** ✓ Empty result for invalid category

---

### Test 6.2.2: Get Variants for Non-variant Item
**Scenario:** Request variants for item without variants
**Prerequisites:**
- Item has no variants configured

**Test Steps:**
```
1. Call get_item_variants() with:
   - item_code: "SIMPLE-ITEM"
   
2. Verify empty variants
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "SIMPLE-ITEM",
  "variants": []
}
```

**Pass Criteria:** ✓ Empty variants handled

---

### Test 6.2.3: Get Options for Item Without Options
**Scenario:** Request options for item without configured options
**Prerequisites:**
- Item has no options

**Test Steps:**
```
1. Call get_item_options() with:
   - item_code: "SIMPLE-ITEM"
   
2. Verify empty options
```

**Expected Output:**
```json
{
  "success": true,
  "item_code": "SIMPLE-ITEM",
  "options": []
}
```

**Pass Criteria:** ✓ Empty options handled

---

### Test 6.2.4: Get Variants for Invalid Item
**Scenario:** Request variants for non-existent item
**Test Steps:**
```
1. Call get_item_variants() with:
   - item_code: "INVALID-ITEM"
   
2. Verify error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Item 'INVALID-ITEM' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Item validation

---

### Test 6.2.5: Create Customer Without Name
**Scenario:** Attempt to create customer without required name
**Test Steps:**
```
1. Call create_customer() with:
   - customer_name: null
   
2. Verify validation fails
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer name is required",
  "error_code": "VALIDATION_ERROR"
}
```

**Pass Criteria:** ✓ Required field validation

---

### Test 6.2.6: Create Duplicate Customer
**Scenario:** Attempt to create customer with existing email
**Prerequisites:**
- Customer with email "duplicate@example.com" exists

**Test Steps:**
```
1. Call create_customer() with:
   - email: "duplicate@example.com"
   
2. Verify duplicate check
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Customer with email 'duplicate@example.com' already exists",
  "error_code": "DUPLICATE_ENTRY"
}
```

**Pass Criteria:** ✓ Duplicate detection

---

# Module 7: Layout & Table Display Module

**File:** `imogi_pos/api/layout.py` & `imogi_pos/api/table_display_editor.py`  
**Key Functions:**
- `get_floor_layout()`
- `get_table_status()`
- `update_table_status()`
- `reserve_table()`
- `release_table()`

## 7.1 Positive Flow Tests

### Test 7.1.1: Get Floor Layout
**Scenario:** Retrieve restaurant floor layout
**Prerequisites:**
- Floor layout configured

**Test Steps:**
```
1. Call get_floor_layout() with:
   - pos_profile: "RESTAURANT-01"
   
2. Verify layout structure returned
```

**Expected Output:**
```json
{
  "success": true,
  "layout": {
    "floor_name": "Main Hall",
    "tables": [
      {
        "table_code": "TABLE-01",
        "table_name": "Table 1",
        "capacity": 4,
        "x": 100,
        "y": 100,
        "status": "Available"
      }
    ],
    "total_tables": 20
  }
}
```

**Pass Criteria:** ✓ Layout retrieved with all tables

---

### Test 7.1.2: Get Table Status
**Scenario:** Check current status of table
**Prerequisites:**
- Table exists

**Test Steps:**
```
1. Call get_table_status() with:
   - table_code: "TABLE-01"
   
2. Verify status returned
```

**Expected Output:**
```json
{
  "success": true,
  "table": {
    "table_code": "TABLE-01",
    "table_name": "Table 1",
    "status": "Available",
    "current_order": null,
    "occupancy": 0
  }
}
```

**Pass Criteria:** ✓ Table status retrieved

---

### Test 7.1.3: Reserve Table
**Scenario:** Reserve table for customer
**Prerequisites:**
- Table available
- Customer details provided

**Test Steps:**
```
1. Call reserve_table() with:
   - table_code: "TABLE-01"
   - customer: "CUST001"
   - num_guests: 4
   
2. Verify table reserved
```

**Expected Output:**
```json
{
  "success": true,
  "table": {
    "table_code": "TABLE-01",
    "status": "Reserved",
    "reserved_by": "CUST001",
    "guests": 4,
    "reserved_at": "2026-01-28T10:00:00Z"
  }
}
```

**Pass Criteria:** ✓ Table reserved successfully

---

### Test 7.1.4: Occupy Table (Create Order)
**Scenario:** Update table status to occupied when order created
**Prerequisites:**
- Order created for table

**Test Steps:**
```
1. Create order with:
   - table_code: "TABLE-01"
   
2. Verify table status updated to Occupied
3. Verify order linked to table
```

**Expected Output:**
```json
{
  "success": true,
  "table": {
    "table_code": "TABLE-01",
    "status": "Occupied",
    "current_order": "uuid-xxx"
  }
}
```

**Pass Criteria:** ✓ Table marked as occupied

---

### Test 7.1.5: Release Table
**Scenario:** Release table after customer leaves
**Prerequisites:**
- Order completed/billed
- Table currently occupied

**Test Steps:**
```
1. Call release_table() with:
   - table_code: "TABLE-01"
   
2. Verify table status reset to Available
3. Verify order delinked
```

**Expected Output:**
```json
{
  "success": true,
  "table": {
    "table_code": "TABLE-01",
    "status": "Available",
    "current_order": null,
    "released_at": "2026-01-28T11:00:00Z"
  }
}
```

**Pass Criteria:** ✓ Table released and cleaned

---

### Test 7.1.6: Update Table Status
**Scenario:** Manually update table status (e.g., Mark as dirty)
**Prerequisites:**
- Table in any status

**Test Steps:**
```
1. Call update_table_status() with:
   - table_code: "TABLE-01"
   - status: "Dirty"
   
2. Verify status updated
```

**Expected Output:**
```json
{
  "success": true,
  "table": {
    "table_code": "TABLE-01",
    "status": "Dirty",
    "updated_at": "2026-01-28T11:10:00Z"
  }
}
```

**Pass Criteria:** ✓ Table status updated

---

## 7.2 Negative Flow Tests

### Test 7.2.1: Reserve Already Occupied Table
**Scenario:** Attempt to reserve occupied table
**Prerequisites:**
- Table status is Occupied

**Test Steps:**
```
1. Call reserve_table() with occupied table
2. Verify reservation rejected
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Table 'TABLE-01' is currently occupied",
  "error_code": "TABLE_NOT_AVAILABLE"
}
```

**Pass Criteria:** ✓ Occupied table protected

---

### Test 7.2.2: Release Table Without Order
**Scenario:** Release table that has no active order
**Prerequisites:**
- Table in Available status

**Test Steps:**
```
1. Call release_table() with:
   - table_code: "TABLE-01"  // Available, no order
   
2. Verify operation handled
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Table 'TABLE-01' has no active order to release",
  "error_code": "NO_ORDER"
}
```

**Pass Criteria:** ✓ Empty table release handled

---

### Test 7.2.3: Get Status for Non-existent Table
**Scenario:** Request status of table that doesn't exist
**Test Steps:**
```
1. Call get_table_status() with:
   - table_code: "INVALID-TABLE"
   
2. Verify error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Table 'INVALID-TABLE' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ Table validation

---

### Test 7.2.4: Reserve Table with Invalid Capacity
**Scenario:** Reserve table for number of guests exceeding capacity
**Prerequisites:**
- Table capacity: 4
- Attempt to reserve for 6 guests

**Test Steps:**
```
1. Call reserve_table() with:
   - table_code: "TABLE-01"  // capacity 4
   - num_guests: 6
   
2. Verify capacity check
```

**Expected Output:**
```json
{
  "success": false,
  "error": "Number of guests (6) exceeds table capacity (4)",
  "error_code": "CAPACITY_EXCEEDED"
}
```

**Pass Criteria:** ✓ Capacity validation

---

### Test 7.2.5: Get Floor Layout - Invalid POS Profile
**Scenario:** Request layout for non-existent POS Profile
**Test Steps:**
```
1. Call get_floor_layout() with:
   - pos_profile: "INVALID-PROFILE"
   
2. Verify error
```

**Expected Output:**
```json
{
  "success": false,
  "error": "POS Profile 'INVALID-PROFILE' not found",
  "error_code": "NOT_FOUND"
}
```

**Pass Criteria:** ✓ POS Profile validation

---

# Cross-Module Integration Tests

## Test 8.1: Complete Order to Payment Workflow
**Scenario:** End-to-end workflow: Order → KOT → Billing → Payment

**Test Steps:**
```
1. Create Order
   - Verify order created (Orders module)
   
2. Create KOT Ticket
   - Verify KOT routed to kitchen (KOT module)
   
3. Update KOT Status
   - Mark items as "Ready" (KOT module)
   
4. Create Sales Invoice
   - Convert order to invoice (Billing module)
   
5. Apply Payment
   - Apply full payment (Billing module)
   
6. Release Table
   - Mark table as available (Layout module)
```

**Expected Output:**
```json
{
  "success": true,
  "workflow": {
    "order": {"status": "Submitted"},
    "kot": {"status": "Ready"},
    "invoice": {"status": "Paid"},
    "table": {"status": "Available"}
  }
}
```

**Pass Criteria:** ✓ Complete workflow executed successfully

---

## Test 8.2: Multi-table Service Workflow
**Scenario:** Manage multiple tables simultaneously

**Test Steps:**
```
1. Reserve 3 tables
2. Create orders for each
3. Create KOT tickets for each
4. Complete orders in mixed order
5. Collect payments
6. Release tables
7. Verify all transitions valid
```

**Expected Output:**
```json
{
  "success": true,
  "tables_managed": 3,
  "orders_completed": 3,
  "tables_released": 3
}
```

**Pass Criteria:** ✓ Multi-table management works

---

## Test 8.3: Authorization Across Modules
**Scenario:** Verify authorization enforced across all modules

**Test Steps:**
```
1. User A (Branch A access):
   - Can create order for Branch A ✓
   - Cannot create order for Branch B ✗
   
2. Kitchen Staff:
   - Can update KOT items ✓
   - Cannot access billing ✗
   
3. Cashier:
   - Can create invoices ✓
   - Cannot create KOT ✗
   
4. Manager:
   - Can access all modules ✓
```

**Expected Output:**
```json
{
  "success": true,
  "authorization_tests": 8,
  "passed": 8,
  "failed": 0
}
```

**Pass Criteria:** ✓ All authorization checks pass

---

## Test 8.4: Pricing Cascade Across Modules
**Scenario:** Pricing rules applied consistently

**Test Steps:**
```
1. Create order with items
   - Pricing rules applied (Pricing module)
   
2. Create invoice
   - Same discount applied (Billing module)
   
3. Verify totals match
   - Order total = Invoice total
```

**Expected Output:**
```json
{
  "success": true,
  "order_total": 855000,
  "invoice_total": 855000,
  "pricing_consistent": true
}
```

**Pass Criteria:** ✓ Pricing consistent across modules

---

## Test 8.5: Stock Updates on Invoice Submission
**Scenario:** Stock decremented when invoice submitted

**Test Steps:**
```
1. Check stock before
   - ITEM001: 100 units
   
2. Create and submit invoice
   - Qty ordered: 5 units
   
3. Check stock after
   - ITEM001: 95 units
   
4. Verify KDS notified
   - Stock update published
```

**Expected Output:**
```json
{
  "success": true,
  "stock_before": 100,
  "qty_ordered": 5,
  "stock_after": 95,
  "notification_sent": true
}
```

**Pass Criteria:** ✓ Stock correctly updated

---

## Test 8.6: Concurrent Order Updates
**Scenario:** Handle concurrent updates from multiple cashiers

**Test Steps:**
```
1. Two cashiers open same order
2. Cashier 1 adds item A (timestamp T1)
3. Cashier 2 adds item B (timestamp T1)
4. Cashier 1 submits with T1
5. Cashier 2 attempts submit with T1
6. Verify conflict detection
```

**Expected Output:**
```json
{
  "success": true,
  "cashier_1": {"status": "Submitted"},
  "cashier_2": {
    "status": "Failed",
    "error": "Order has been modified by another user"
  }
}
```

**Pass Criteria:** ✓ Timestamp-based conflict detection works

---

## Test 8.7: Refund and Reversal Workflow
**Scenario:** Complete refund process with stock reversal

**Test Steps:**
```
1. Paid invoice with items
   - Stock decremented by 5
   
2. Process refund
   - Full amount refunded
   
3. Verify stock reversed
   - Stock increased by 5
   
4. Verify accounts reversed
   - Invoice marked as refunded
```

**Expected Output:**
```json
{
  "success": true,
  "refund_amount": 200000,
  "stock_reversed": 5,
  "accounts_reversed": true
}
```

**Pass Criteria:** ✓ Refund and reversal complete

---

## Testing Execution Summary Template

```
TESTING EXECUTION SUMMARY
========================

Date: ___________
Tested By: ___________
Duration: ___________

MODULES TESTED:
[ ] Module 1: Orders
[ ] Module 2: Billing
[ ] Module 3: KOT
[ ] Module 4: Authorization
[ ] Module 5: Pricing
[ ] Module 6: Customers & Items
[ ] Module 7: Layout & Tables
[ ] Cross-Module Integration

RESULTS:
- Total Test Cases: ___
- Passed: ___
- Failed: ___
- Blocked: ___
- Skipped: ___

CRITICAL ISSUES: ___ (list)
HIGH PRIORITY ISSUES: ___ (list)
LOW PRIORITY ISSUES: ___ (list)

RECOMMENDATIONS:
- ___________
- ___________
- ___________

SIGN-OFF:
Tester: ________________  Date: ________
QA Lead: ________________  Date: ________
```

---

**End of Comprehensive Testing Schema**
