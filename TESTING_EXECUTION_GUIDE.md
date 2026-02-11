# IMOGI POS - Testing Execution Guide

**Date:** January 28, 2026  
**Purpose:** Detailed step-by-step guide on HOW to actually execute the test cases

---

## Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Module 1: Orders Module - Detailed Execution](#module-1-orders-module---detailed-execution)
3. [Module 2: Billing Module - Detailed Execution](#module-2-billing-module---detailed-execution)
4. [Module 3: KOT Module - Detailed Execution](#module-3-kot-module---detailed-execution)
5. [Testing Tools & Methods](#testing-tools--methods)
6. [Verification Checklist](#verification-checklist)

---

# Pre-Testing Setup

## Step 1: Prepare Test Environment

### 1.1 Clear Database (Optional but Recommended)
```bash
# SSH into server or use Bench
cd ~/frappe-bench

# Backup current database
bench --site your-site.local backup

# Drop and recreate (ONLY for fresh test environment)
# bench --site your-site.local drop-site  # ⚠️ WARNING: Destructive
```

### 1.2 Create Test Data in ERPNext

**Go to:** `http://your-site.local/app/home`

**Create Master Data:**

#### a) Company
- Navigate: Menu → Setup → Company
- Create: "Test Company"
- Currency: IDR

#### b) Warehouse
- Navigate: Menu → Stock → Warehouse
- Create: "Test Warehouse"
- Company: "Test Company"

#### c) Customer
- Navigate: Menu → Selling → Customer
- Create:
  - Name: CUST001
  - Customer Name: "John Doe"
  - Email: john@test.com
  - Phone: 08123456789

#### d) Item (Product)
- Navigate: Menu → Inventory → Item
- Create ITEM001:
  - Item Code: ITEM001
  - Item Name: Coffee
  - Item Group: Beverages
  - Unit of Measure: Nos
  - Rate: 50000
  - Stock: 100 units

- Create ITEM002:
  - Item Code: ITEM002
  - Item Name: Tea
  - Item Group: Beverages
  - Unit of Measure: Nos
  - Rate: 40000
  - Stock: 50 units

#### e) Price List
- Navigate: Menu → Selling → Price List
- Create: "PL-STANDARD"
- Currency: IDR
- Price List Items:
  - ITEM001: 50000
  - ITEM002: 40000

#### f) POS Profile
- Navigate: Menu → Retail → POS Profile
- Create: "RESTAURANT-01"
  - Name: RESTAURANT-01
  - Company: Test Company
  - Warehouse: Test Warehouse
  - Price List: PL-STANDARD
  - imogi_branch: [create/select branch]
  - imogi_pos_domain: Restaurant
  - imogi_mode: Table

#### g) Branch (if using)
- Navigate: Menu → Setup → Branch
- Create: "BRANCH-A"
- Company: Test Company

#### h) POS Opening Entry (if required)
- Navigate: Menu → Retail → POS Opening Entry
- Create:
  - User: [Your user]
  - POS Profile: RESTAURANT-01
  - Opening Time: [current time]
  - Status: Open

---

## Step 2: Access Testing Interface

### Option A: Use Browser Console (Quick Testing)
```javascript
// Open browser console (F12)
// Navigate to your site: http://your-site.local/app/home

// Get access token
frappe.call({
    method: 'frappe.auth.get_login_token',
    args: {},
    callback: function(r) {
        console.log('Token:', r.message);
    }
});
```

### Option B: Use Python Script (Recommended)
Create file: `test_script.py`

```python
import requests
import json

BASE_URL = "http://your-site.local"
SITE = "your-site.local"

# Login
session = requests.Session()
login_response = session.post(
    f"{BASE_URL}/api/method/login",
    data={
        "usr": "Administrator",
        "pwd": "your_password"
    }
)

print(f"Login status: {login_response.status_code}")

# Export session for later use
with open('session.json', 'w') as f:
    json.dump({
        'base_url': BASE_URL,
        'cookies': dict(session.cookies)
    }, f)

print("Session saved!")
```

Run:
```bash
python test_script.py
```

### Option C: Use Postman (Visual Testing)
1. Download Postman: https://www.postman.com/downloads/
2. Create new collection: "IMOGI POS Tests"
3. Set environment variable:
   - `base_url` = http://your-site.local
   - `site` = your-site.local

---

# Module 1: Orders Module - Detailed Execution

## Test 1.1.1: Create Simple Order (Positive Flow)

### Pre-Requisites Check
```
✓ POS Profile "RESTAURANT-01" exists
✓ Customer "CUST001" exists
✓ Item "ITEM001" exists and is_active=true
✓ Warehouse "Test Warehouse" exists
```

### Step-by-Step Execution

#### Step 1: Prepare Request
**Method:** POST  
**URL:** `http://your-site.local/api/method/imogi_pos.api.orders.create_pos_order`

**Headers:**
```
Content-Type: application/json
X-Frappe-CSRF-Token: [get from frappe.csrf_token in browser console]
```

**Request Body:**
```json
{
  "pos_profile": "RESTAURANT-01",
  "customer": "CUST001",
  "items": [
    {
      "item_code": "ITEM001",
      "qty": 2,
      "rate": 50000
    }
  ]
}
```

#### Step 2: Execute Request

**Using Python:**
```python
import requests
import json

BASE_URL = "http://your-site.local"
SITE = "your-site.local"

# Create session and login first
session = requests.Session()
session.post(
    f"{BASE_URL}/api/method/login",
    data={
        "usr": "Administrator",
        "pwd": "your_password"
    }
)

# Call create_pos_order
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "RESTAURANT-01",
        "customer": "CUST001",
        "items": [
            {
                "item_code": "ITEM001",
                "qty": 2,
                "rate": 50000
            }
        ]
    }
)

result = response.json()
print(json.dumps(result, indent=2))
```

**Using Browser Console:**
```javascript
frappe.call({
    method: 'imogi_pos.api.orders.create_pos_order',
    args: {
        pos_profile: "RESTAURANT-01",
        customer: "CUST001",
        items: [
            {
                item_code: "ITEM001",
                qty: 2,
                rate: 50000
            }
        ]
    },
    callback: function(r) {
        console.log('Response:', r.message);
        // Save order_id for next test
        localStorage.setItem('test_order_id', r.message.id);
    }
});
```

#### Step 3: Verify Response

**Expected Response:**
```json
{
  "message": {
    "success": true,
    "order": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "Draft",
      "pos_profile": "RESTAURANT-01",
      "customer": "CUST001",
      "items": [
        {
          "item_code": "ITEM001",
          "qty": 2,
          "rate": 50000
        }
      ],
      "net_total": 100000,
      "timestamp": "2026-01-28T10:00:00Z"
    }
  }
}
```

**Verification Checklist:**
- [ ] `success`: true
- [ ] `order.id`: UUID format (not empty)
- [ ] `order.status`: "Draft"
- [ ] `order.pos_profile`: "RESTAURANT-01"
- [ ] `order.customer`: "CUST001"
- [ ] `order.items[0].item_code`: "ITEM001"
- [ ] `order.items[0].qty`: 2
- [ ] `order.net_total`: 100000 (qty 2 × rate 50000)
- [ ] `order.timestamp`: Valid ISO timestamp

**If Test PASSES:**
✅ Mark as PASSED
Save order ID for subsequent tests:
```
test_order_id = "550e8400-e29b-41d4-a716-446655440000"
```

**If Test FAILS:**
❌ Capture error details:
```
Error Message: ___________________
Error Code: ___________________
Status Code: ___________________
Response Body: ___________________
```

Check:
- [ ] Customer exists in database
- [ ] Item exists and is active
- [ ] API endpoint URL is correct
- [ ] Authentication token is valid

---

## Test 1.1.2: Create Order with Multiple Items (Positive Flow)

### Pre-Requisites Check
```
✓ ITEM001, ITEM002 exist
✓ ITEM001 has variants configured (SIZE-L, SIZE-M, SIZE-S)
✓ ITEM002 has options configured (extra_cheese, spicy)
```

### Execution

#### Step 1: Create Variant Items
Go to Item ITEM001:
- Item Code: ITEM001-SIZE-L
- Variant of: ITEM001
- Size: Large
- Rate: 60000 (override base rate)

#### Step 2: Send Request
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "RESTAURANT-01",
        "customer": "CUST001",
        "items": [
            {
                "item_code": "ITEM001",
                "qty": 1,
                "variant": "ITEM001-SIZE-L",
                "rate": 60000
            },
            {
                "item_code": "ITEM002",
                "qty": 2,
                "options": ["extra_cheese", "spicy"],
                "rate": 40000
            },
            {
                "item_code": "ITEM001",
                "qty": 1,
                "rate": 50000
            }
        ]
    }
)
```

#### Step 3: Verify
**Expected:**
```json
{
  "items": [
    {"item_code": "ITEM001", "qty": 1, "variant": "ITEM001-SIZE-L", "rate": 60000},
    {"item_code": "ITEM002", "qty": 2, "options": ["extra_cheese", "spicy"], "rate": 40000},
    {"item_code": "ITEM001", "qty": 1, "rate": 50000}
  ],
  "total_qty": 4,
  "net_total": 210000
}
```

**Calculation:**
- Item 1 variant: 1 × 60000 = 60000
- Item 2 with options: 2 × 40000 = 80000
- Item 1 simple: 1 × 50000 = 50000
- **Total: 190000** (not 210000 in example - recalculate)

**Verification:**
- [ ] All 3 item rows present
- [ ] Variants captured
- [ ] Options captured
- [ ] total_qty = 4
- [ ] net_total = correct calculation

---

## Test 1.2.1: Create Order with Invalid POS Profile (Negative Flow)

### Execution

#### Step 1: Send Request with Invalid Profile
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "INVALID-PROFILE",
        "customer": "CUST001",
        "items": [
            {"item_code": "ITEM001", "qty": 1, "rate": 50000}
        ]
    }
)

result = response.json()
print(f"Status Code: {response.status_code}")
print(f"Response: {json.dumps(result, indent=2)}")
```

#### Step 2: Verify Error Response
**Expected Response (HTTP 400):**
```json
{
  "message": "POS Profile 'INVALID-PROFILE' not found",
  "_server_messages": "[\"POS Profile 'INVALID-PROFILE' not found\"]",
  "exc": "frappe.exceptions.ValidationError: POS Profile 'INVALID-PROFILE' not found"
}
```

**Verification:**
- [ ] HTTP Status: 400 or 404
- [ ] Error message contains "INVALID-PROFILE"
- [ ] Error message contains "not found"
- [ ] Response has error field

**If Test PASSES:**
✅ Validation working correctly

**If Test FAILS:**
❌ Check:
- [ ] Error is being raised in create_pos_order()
- [ ] Validation happens before processing
- [ ] Error message is clear

---

## Test 1.2.2: Create Order with Empty Items (Negative Flow)

### Execution

#### Step 1: Send Request with Empty Items
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "RESTAURANT-01",
        "customer": "CUST001",
        "items": []  # Empty!
    }
)

result = response.json()
print(f"Status Code: {response.status_code}")
print(f"Message: {result.get('message')}")
```

#### Step 2: Verify Error
**Expected:**
```json
{
  "message": "Order must contain at least one item"
}
```

**Verification:**
- [ ] HTTP Status: 400
- [ ] Error mentions empty items

---

## Test 1.2.3: Create Order with Invalid Item Code (Negative Flow)

### Execution
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "RESTAURANT-01",
        "customer": "CUST001",
        "items": [
            {"item_code": "NONEXISTENT-ITEM", "qty": 1, "rate": 50000}
        ]
    }
)

result = response.json()
```

**Expected:**
```json
{
  "message": "Item 'NONEXISTENT-ITEM' not found"
}
```

---

## Test 1.1.3: Update Order Items (Positive Flow)

### Pre-Requisites
```
✓ Order created from Test 1.1.1
✓ Order ID saved: test_order_id
✓ Order status: "Draft"
```

### Execution

#### Step 1: Update Items
```python
order_id = localStorage.getItem('test_order_id')  # From previous test

response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.update_pos_order",
    json={
        "order_id": order_id,
        "items": [
            {
                "item_code": "ITEM001",
                "qty": 3,  # Changed from 2 to 3
                "rate": 50000
            },
            {
                "item_code": "ITEM002",  # New item
                "qty": 1,
                "rate": 40000
            }
        ]
    }
)

result = response.json()
print(json.dumps(result, indent=2))
```

#### Step 2: Verify Update
**Expected:**
```json
{
  "message": {
    "success": true,
    "order": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "items": [
        {"item_code": "ITEM001", "qty": 3},
        {"item_code": "ITEM002", "qty": 1}
      ],
      "net_total": 190000
    }
  }
}
```

**Calculation:**
- ITEM001: 3 × 50000 = 150000
- ITEM002: 1 × 40000 = 40000
- **Total: 190000** ✓

**Verification:**
- [ ] Items replaced (old items gone)
- [ ] ITEM001 qty = 3
- [ ] ITEM002 added (new)
- [ ] net_total = 190000

---

# Module 2: Billing Module - Detailed Execution

## Test 2.1.1: Create Sales Invoice from Order (Positive Flow)

### Pre-Requisites
```
✓ Order submitted (from previous test)
✓ Order status: "Submitted"
✓ POS Opening Entry exists (active)
✓ Warehouse has stock: ITEM001 (≥2 units)
```

### Execution

#### Step 1: Submit Order First
If order is still Draft, submit it:

```python
# Get order document
response = session.get(
    f"{BASE_URL}/api/resource/POS%20Order/{order_id}",
    headers={'Accept': 'application/json'}
)

order_doc = response.json()['data']
print(f"Order Status: {order_doc['status']}")

# If Draft, submit it
if order_doc['status'] == 'Draft':
    response = session.post(
        f"{BASE_URL}/api/method/frappe.client.submit",
        json={
            "doc": order_doc
        }
    )
    print(f"Order submitted: {response.status_code}")
```

#### Step 2: Create Invoice from Order
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.create_sales_invoice",
    json={
        "order_id": order_id,
        "pos_profile": "RESTAURANT-01"
    }
)

result = response.json()
print(json.dumps(result, indent=2))

# Save invoice name for next test
invoice_name = result['message']['invoice']['name']
localStorage.setItem('test_invoice_name', invoice_name)
```

#### Step 3: Verify Invoice Created
**Expected:**
```json
{
  "message": {
    "success": true,
    "invoice": {
      "name": "ACC-2026-00001",
      "is_pos": true,
      "status": "Draft",
      "pos_profile": "RESTAURANT-01",
      "customer": "CUST001",
      "net_total": 100000,
      "outstanding_amount": 100000
    }
  }
}
```

**Verification Checklist:**
- [ ] `invoice.name`: Invoice ID (e.g., ACC-2026-00001)
- [ ] `invoice.is_pos`: true
- [ ] `invoice.status`: "Draft"
- [ ] `invoice.net_total`: Matches order net_total
- [ ] `invoice.outstanding_amount`: Equals net_total (unpaid)
- [ ] Items transferred correctly

#### Step 4: Verify in Backend
Go to ERPNext: Menu → Accounting → Sales Invoice
- [ ] Find ACC-2026-00001
- [ ] Verify items match order
- [ ] Verify customer correct
- [ ] Verify rates match

---

## Test 2.1.2: Submit Sales Invoice (Positive Flow)

### Pre-Requisites
```
✓ Invoice created in Draft status (from Test 2.1.1)
✓ Invoice name: test_invoice_name
```

### Execution

#### Step 1: Submit Invoice via API
```python
invoice_name = localStorage.getItem('test_invoice_name')

response = session.post(
    f"{BASE_URL}/api/method/frappe.client.submit",
    json={
        "doc": {
            "doctype": "Sales Invoice",
            "name": invoice_name
        }
    }
)

result = response.json()
print(f"Status: {response.status_code}")
print(json.dumps(result, indent=2))
```

#### Step 2: Verify Submission
**Expected Response:**
```json
{
  "message": {
    "name": "ACC-2026-00001",
    "docstatus": 1,
    "status": "Submitted"
  }
}
```

**Verification:**
- [ ] HTTP Status: 200
- [ ] `docstatus`: 1 (submitted)
- [ ] `status`: "Submitted"

#### Step 3: Verify in Database
Go to ERPNext: Accounting → Sales Invoice

```
Invoice: ACC-2026-00001
Status: Submitted ✓
Docstatus: 1 ✓
AR Account Updated: ✓
Stock Impact: ✓
```

**Check Stock:**
```
Warehouse: Test Warehouse
Item: ITEM001

Before Submission: 100 units
After Submission: 98 units (100 - 2 ordered)
```

---

## Test 2.1.3: Apply Full Payment (Positive Flow)

### Pre-Requisites
```
✓ Invoice submitted (status: Submitted)
✓ Outstanding amount: 100000
✓ Payment method configured: CASH
```

### Execution

#### Step 1: Apply Payment
```python
invoice_name = localStorage.getItem('test_invoice_name')

response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.apply_payment",
    json={
        "invoice_name": invoice_name,
        "amount": 100000,
        "payment_method": "CASH",
        "mode_of_payment": "Cash"
    }
)

result = response.json()
print(json.dumps(result, indent=2))
```

#### Step 2: Verify Payment Applied
**Expected:**
```json
{
  "message": {
    "success": true,
    "payment": {
      "invoice": "ACC-2026-00001",
      "amount_paid": 100000,
      "outstanding": 0,
      "payment_method": "CASH",
      "status": "Paid"
    }
  }
}
```

**Verification:**
- [ ] `outstanding`: 0 (fully paid)
- [ ] `amount_paid`: 100000
- [ ] Invoice status changed to "Paid"

#### Step 3: Verify Payment in ERPNext
Go to: Accounting → Sales Invoice → ACC-2026-00001

```
Outstanding Amount: 0
Paid Amount: 100000
Status: Paid ✓

Payment Entry Created: ACC-PMT-2026-00001
Payment Method: Cash
Posting Date: 2026-01-28
```

---

## Test 2.1.4: Apply Partial Payment (Positive Flow)

### Setup New Invoice
Create another invoice with outstanding: 200000

### Execution

#### Step 1: Apply Partial Payment
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.apply_payment",
    json={
        "invoice_name": "ACC-2026-00002",
        "amount": 100000,  # Only 100k of 200k
        "payment_method": "CASH"
    }
)

result = response.json()
```

#### Step 2: Verify Partial Payment
**Expected:**
```json
{
  "outstanding": 100000,  // Remaining
  "amount_paid": 100000,
  "status": "Partial Payment"
}
```

**Verification:**
- [ ] `outstanding`: 100000 (not 0)
- [ ] `status`: "Partial Payment"
- [ ] Can apply more payment later

#### Step 3: Apply Second Payment
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.apply_payment",
    json={
        "invoice_name": "ACC-2026-00002",
        "amount": 100000,  // Second payment
        "payment_method": "CARD"
    }
)
```

**Expected:**
```json
{
  "outstanding": 0,
  "amount_paid": 200000,  // Total paid
  "payments": [
    {"method": "CASH", "amount": 100000},
    {"method": "CARD", "amount": 100000}
  ],
  "status": "Paid"
}
```

---

## Test 2.2.1: Create Invoice Without POS Session (Negative Flow)

### Pre-Requisites
```
✓ POS Profile has: imogi_require_pos_session = true
✓ NO active POS Opening Entry exists
```

### Execution

#### Step 1: Delete/Close Active Session
Go to: Retail → POS Opening Entry
- Find active entry
- Click Menu → Close

#### Step 2: Attempt Invoice Creation
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.create_sales_invoice",
    json={
        "order_id": order_id,
        "pos_profile": "RESTAURANT-01"
    }
)

result = response.json()
print(f"Status: {response.status_code}")
print(f"Error: {result.get('message')}")
```

#### Step 3: Verify Error
**Expected (HTTP 400):**
```json
{
  "message": "No active POS Opening Entry found. Please open a session before proceeding."
}
```

**Verification:**
- [ ] HTTP Status: 400
- [ ] Error message mentions "POS Opening Entry"
- [ ] Invoice NOT created

---

## Test 2.2.2: Apply Payment Exceeding Amount (Negative Flow)

### Execution

#### Step 1: Try Overpayment
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.billing.apply_payment",
    json={
        "invoice_name": "ACC-2026-00001",
        "amount": 150000,  // Invoice is 100000
        "payment_method": "CASH"
    }
)

result = response.json()
print(f"Status: {response.status_code}")
```

#### Step 2: Verify Overpayment Blocked
**Expected:**
```json
{
  "message": "Payment amount 150000 exceeds outstanding amount 100000"
}
```

**Verification:**
- [ ] HTTP Status: 400
- [ ] Payment NOT applied

---

# Module 3: KOT Module - Detailed Execution

## Test 3.1.1: Create KOT Ticket from Order (Positive Flow)

### Pre-Requisites
```
✓ Order submitted
✓ Kitchen routing configured:
  - ITEM001 → MAIN-KITCHEN
  - ITEM002 → MAIN-KITCHEN
✓ Menu Category has kitchen_station assigned
```

### Setup Kitchen Routing

#### Step 1: Configure Kitchen Routing
Go to: Setup → Customize Form → Menu Category

Add custom field or go to existing:
- Menu → Restaurant → Menu Category → Beverages
- imogi_kitchen_station: MAIN-KITCHEN
- Save

#### Step 2: Verify Routing
```python
# Check routing config
response = session.get(
    f"{BASE_URL}/api/resource/Menu%20Category/Beverages",
    headers={'Accept': 'application/json'}
)

routing = response.json()['data']['imogi_kitchen_station']
print(f"Kitchen Station: {routing}")  # Should be MAIN-KITCHEN
```

### Execution

#### Step 1: Create KOT
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.kot.create_kot_ticket",
    json={
        "order_id": order_id,
        "pos_profile": "RESTAURANT-01"
    }
)

result = response.json()
print(json.dumps(result, indent=2))

# Save KOT ID
kot_id = result['message']['kot']['id']
localStorage.setItem('test_kot_id', kot_id)
```

#### Step 2: Verify KOT Created
**Expected:**
```json
{
  "message": {
    "success": true,
    "kot": {
      "id": "KOT-2026-00001",
      "order_id": "550e8400-e29b-41d4-a716-446655440000",
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
}
```

**Verification:**
- [ ] `id`: KOT format
- [ ] `status`: "New"
- [ ] `kitchen_station`: MAIN-KITCHEN
- [ ] `items[0].status`: "Pending"

#### Step 3: Verify in Backend
Go to: Restaurant → Kitchen Order Ticket → KOT-2026-00001

```
Status: New ✓
Kitchen Station: MAIN-KITCHEN ✓
Order: POS-UUID ✓
Items: ITEM001 (Qty: 2, Status: Pending) ✓
```

---

## Test 3.1.3: Update KOT Item Status (Positive Flow)

### Pre-Requisites
```
✓ KOT created (from Test 3.1.1)
✓ KOT ID: test_kot_id
✓ Item status: "Pending"
```

### Execution - Change to "In Progress"

#### Step 1: Update Item Status
```python
kot_id = localStorage.getItem('test_kot_id')

response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.kot.update_kot_item_state",
    json={
        "kot_id": kot_id,
        "item_code": "ITEM001",
        "status": "In Progress"
    }
)

result = response.json()
print(json.dumps(result, indent=2))
```

#### Step 2: Verify Status Change
**Expected:**
```json
{
  "message": {
    "success": true,
    "item": {
      "item_code": "ITEM001",
      "status": "In Progress",
      "started_at": "2026-01-28T10:35:00Z"
    }
  }
}
```

**Verification:**
- [ ] `status`: "In Progress"
- [ ] `started_at`: Valid timestamp

#### Step 3: Change to "Ready"

```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.kot.update_kot_item_state",
    json={
        "kot_id": kot_id,
        "item_code": "ITEM001",
        "status": "Ready"
    }
)

result = response.json()
```

**Expected:**
```json
{
  "item": {
    "status": "Ready",
    "completed_at": "2026-01-28T10:45:00Z"
  }
}
```

**Verification:**
- [ ] `status`: "Ready"
- [ ] `completed_at`: Timestamp recorded
- [ ] Waiter display should be notified (realtime update)

---

## Test 3.1.4: Reject KOT Item (Positive Flow)

### Execution

#### Step 1: Reject Item
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.kot.update_kot_item_state",
    json={
        "kot_id": kot_id,
        "item_code": "ITEM002",
        "status": "Rejected",
        "rejection_reason": "Out of stock"
    }
)

result = response.json()
```

#### Step 2: Verify Rejection
**Expected:**
```json
{
  "item": {
    "item_code": "ITEM002",
    "status": "Rejected",
    "rejection_reason": "Out of stock",
    "rejected_at": "2026-01-28T10:35:00Z"
  }
}
```

**Verification:**
- [ ] `status`: "Rejected"
- [ ] `rejection_reason`: Captured

---

## Test 3.2.1: Create KOT Without Kitchen Routing (Negative Flow)

### Pre-Requisites
```
✓ Item exists but NO kitchen routing configured
```

### Execution

#### Step 1: Create Item Without Routing
Go to: Inventory → Item
- Item Code: ITEM-UNROUTED
- Item Name: Unrouted Item
- (Don't assign to any menu category with routing)

#### Step 2: Create Order with Unrouted Item
```python
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.orders.create_pos_order",
    json={
        "pos_profile": "RESTAURANT-01",
        "customer": "CUST001",
        "items": [
            {
                "item_code": "ITEM-UNROUTED",
                "qty": 1,
                "rate": 50000
            }
        ]
    }
)

# Submit order
order_id = result['message']['order']['id']
# ... submit it ...

# Try to create KOT
response = session.post(
    f"{BASE_URL}/api/method/imogi_pos.api.kot.create_kot_ticket",
    json={
        "order_id": order_id,
        "pos_profile": "RESTAURANT-01"
    }
)

result = response.json()
```

#### Step 3: Verify Error
**Expected:**
```json
{
  "message": "Kitchen routing not configured for item 'ITEM-UNROUTED'"
}
```

---

# Testing Tools & Methods

## Tool 1: Python Testing Script Template

```python
#!/usr/bin/env python3
"""
IMOGI POS Testing Script
Automated test execution for Orders, Billing, KOT modules
"""

import requests
import json
import sys
from datetime import datetime

class IMOGIPOSTester:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = []
        self.login(username, password)
    
    def login(self, username, password):
        """Authenticate to Frappe"""
        response = self.session.post(
            f"{self.base_url}/api/method/login",
            data={
                "usr": username,
                "pwd": password
            }
        )
        
        if response.status_code == 200:
            print("✓ Login successful")
        else:
            print("✗ Login failed")
            sys.exit(1)
    
    def test_create_order(self):
        """Test: Create Simple Order"""
        test_name = "Test 1.1.1: Create Simple Order"
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/method/imogi_pos.api.orders.create_pos_order",
                json={
                    "pos_profile": "RESTAURANT-01",
                    "customer": "CUST001",
                    "items": [
                        {
                            "item_code": "ITEM001",
                            "qty": 2,
                            "rate": 50000
                        }
                    ]
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Validate response
                checks = {
                    "success": result['message']['success'] == True,
                    "has_id": bool(result['message']['order']['id']),
                    "status_draft": result['message']['order']['status'] == 'Draft',
                    "correct_total": result['message']['order']['net_total'] == 100000,
                }
                
                passed = all(checks.values())
                
                self.test_results.append({
                    "name": test_name,
                    "status": "PASSED" if passed else "FAILED",
                    "checks": checks,
                    "response": result
                })
                
                print(f"{'✓' if passed else '✗'} {test_name}")
                return passed
                
        except Exception as e:
            self.test_results.append({
                "name": test_name,
                "status": "ERROR",
                "error": str(e)
            })
            print(f"✗ {test_name} - ERROR: {e}")
            return False
    
    def test_create_order_invalid_profile(self):
        """Test: Create Order with Invalid Profile"""
        test_name = "Test 1.2.1: Create Order with Invalid POS Profile"
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/method/imogi_pos.api.orders.create_pos_order",
                json={
                    "pos_profile": "INVALID-PROFILE",
                    "customer": "CUST001",
                    "items": [
                        {
                            "item_code": "ITEM001",
                            "qty": 1,
                            "rate": 50000
                        }
                    ]
                }
            )
            
            # Expect error
            if response.status_code >= 400:
                result = response.json()
                
                checks = {
                    "has_error": "message" in result,
                    "mentions_profile": "INVALID-PROFILE" in result.get('message', ''),
                    "mentions_not_found": "not found" in result.get('message', '').lower(),
                }
                
                passed = all(checks.values())
                
                self.test_results.append({
                    "name": test_name,
                    "status": "PASSED" if passed else "FAILED",
                    "checks": checks,
                    "response": result
                })
                
                print(f"{'✓' if passed else '✗'} {test_name}")
                return passed
            else:
                # Should have failed but didn't
                self.test_results.append({
                    "name": test_name,
                    "status": "FAILED",
                    "reason": "Expected error but got success"
                })
                print(f"✗ {test_name} - Expected error but got success")
                return False
                
        except Exception as e:
            self.test_results.append({
                "name": test_name,
                "status": "ERROR",
                "error": str(e)
            })
            print(f"✗ {test_name} - ERROR: {e}")
            return False
    
    def print_summary(self):
        """Print test execution summary"""
        print("\n" + "="*60)
        print("TEST EXECUTION SUMMARY")
        print("="*60)
        
        passed = sum(1 for t in self.test_results if t['status'] == 'PASSED')
        failed = sum(1 for t in self.test_results if t['status'] == 'FAILED')
        errors = sum(1 for t in self.test_results if t['status'] == 'ERROR')
        total = len(self.test_results)
        
        print(f"\nTotal Tests: {total}")
        print(f"Passed: {passed} {'✓' if passed > 0 else ''}")
        print(f"Failed: {failed} {'✗' if failed > 0 else ''}")
        print(f"Errors: {errors}")
        print(f"\nPass Rate: {(passed/total)*100:.1f}%\n")
        
        # Save detailed results
        with open(f"test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", 'w') as f:
            json.dump(self.test_results, f, indent=2)
        
        print("Detailed results saved to test_results_*.json")

def main():
    # Configuration
    BASE_URL = "http://your-site.local"
    USERNAME = "Administrator"
    PASSWORD = "your_password"
    
    # Initialize tester
    tester = IMOGIPOSTester(BASE_URL, USERNAME, PASSWORD)
    
    # Run tests
    print("Starting IMOGI POS Tests...\n")
    
    tester.test_create_order()
    tester.test_create_order_invalid_profile()
    
    # Print summary
    tester.print_summary()

if __name__ == "__main__":
    main()
```

Run:
```bash
python test_imogi_pos.py
```

---

## Tool 2: Browser Console Testing

```javascript
// Save to: test_imogi.js
// Run in browser console while logged in

const IMOGITester = {
    results: [],
    
    async test_create_order() {
        const test_name = "Test 1.1.1: Create Simple Order";
        
        try {
            await new Promise((resolve, reject) => {
                frappe.call({
                    method: 'imogi_pos.api.orders.create_pos_order',
                    args: {
                        pos_profile: "RESTAURANT-01",
                        customer: "CUST001",
                        items: [
                            {
                                item_code: "ITEM001",
                                qty: 2,
                                rate: 50000
                            }
                        ]
                    },
                    callback: (r) => {
                        if (r.message.success) {
                            this.results.push({
                                name: test_name,
                                status: "PASSED",
                                order_id: r.message.order.id
                            });
                            console.log(`✓ ${test_name}`);
                            // Save for next test
                            localStorage.setItem('test_order_id', r.message.order.id);
                        } else {
                            this.results.push({
                                name: test_name,
                                status: "FAILED"
                            });
                            console.log(`✗ ${test_name}`);
                        }
                        resolve();
                    }
                });
            });
        } catch (e) {
            this.results.push({
                name: test_name,
                status: "ERROR",
                error: e.message
            });
            console.log(`✗ ${test_name} - ERROR: ${e.message}`);
        }
    },
    
    async test_create_order_invalid_profile() {
        const test_name = "Test 1.2.1: Create Order with Invalid POS Profile";
        
        try {
            await new Promise((resolve, reject) => {
                frappe.call({
                    method: 'imogi_pos.api.orders.create_pos_order',
                    args: {
                        pos_profile: "INVALID-PROFILE",
                        customer: "CUST001",
                        items: [
                            {
                                item_code: "ITEM001",
                                qty: 1,
                                rate: 50000
                            }
                        ]
                    },
                    callback: (r) => {
                        if (r.exc || r.message.error) {
                            this.results.push({
                                name: test_name,
                                status: "PASSED"
                            });
                            console.log(`✓ ${test_name}`);
                        } else {
                            this.results.push({
                                name: test_name,
                                status: "FAILED"
                            });
                            console.log(`✗ ${test_name}`);
                        }
                        resolve();
                    }
                });
            });
        } catch (e) {
            this.results.push({
                name: test_name,
                status: "ERROR",
                error: e.message
            });
            console.log(`✗ ${test_name} - ERROR: ${e.message}`);
        }
    },
    
    async run_all() {
        console.log("Starting IMOGI POS Tests...\n");
        
        await this.test_create_order();
        await this.test_create_order_invalid_profile();
        
        this.print_summary();
    },
    
    print_summary() {
        const passed = this.results.filter(r => r.status === 'PASSED').length;
        const failed = this.results.filter(r => r.status === 'FAILED').length;
        const errors = this.results.filter(r => r.status === 'ERROR').length;
        const total = this.results.length;
        
        console.log("\n" + "=".repeat(60));
        console.log("TEST EXECUTION SUMMARY");
        console.log("=".repeat(60));
        console.log(`\nTotal: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Errors: ${errors}`);
        console.log(`\nPass Rate: ${((passed/total)*100).toFixed(1)}%`);
        
        // Copy to clipboard
        copy(JSON.stringify(this.results, null, 2));
        console.log("\nResults copied to clipboard!");
    }
};

// Run all tests
IMOGITester.run_all();
```

Copy and paste in browser console (F12).

---

# Verification Checklist

## Before Running Tests

- [ ] Frappe Bench environment running
- [ ] ERPNext v15 installed
- [ ] IMOGI POS app installed
- [ ] Database backup created
- [ ] Test data created (Company, Customer, Items, Price Lists, POS Profile)
- [ ] Testing tool selected (Python script, Browser console, Postman, or Manual)
- [ ] Credentials ready (username, password)

## During Test Execution

- [ ] Record test start time
- [ ] Capture HTTP status codes
- [ ] Document response payloads
- [ ] Note any error messages
- [ ] Take screenshots (if manual testing)
- [ ] Record browser console errors (if using browser)

## After Test Execution

- [ ] Verify invoice created in backend
- [ ] Check stock levels updated
- [ ] Verify payment recorded in accounts
- [ ] Check KOT created in system
- [ ] Validate table status changed
- [ ] Review test result summary
- [ ] Document any failures
- [ ] Update test results document

---

**End of Testing Execution Guide**
