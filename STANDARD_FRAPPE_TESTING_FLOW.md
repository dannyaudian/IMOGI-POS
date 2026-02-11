# IMOGI POS - Standard Testing Flow di Frappe UI

**Date:** January 28, 2026  
**Purpose:** Step-by-step testing flow menggunakan Frappe UI (tidak API)  
**Environment:** http://tigaperkasateknik.frappe.cloud/app/imogi-pos

---

## Table of Contents
1. [Standard Testing Flow](#standard-testing-flow)
2. [Detailed Step-by-Step Flow](#detailed-step-by-step-flow)
3. [Positive Flow Scenarios](#positive-flow-scenarios)
4. [Negative Flow Scenarios](#negative-flow-scenarios)
5. [Verification Checklist](#verification-checklist)

---

# Standard Testing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   IMOGI POS TESTING FLOW                    │
└─────────────────────────────────────────────────────────────┘

PREPARATION PHASE
    ↓
[1] Create Master Data
    - Company
    - Warehouse
    - Customer
    - Items
    - Price List
    - POS Profile
    - Kitchen Station (if Restaurant)
    ↓
TESTING PHASE (Main Flow)
    ↓
[2] Create POS Order
    - Navigate to POS Orders
    - Create new order
    - Add items
    - Save
    ↓
[3] Create KOT (if Restaurant)
    - Create Kitchen Order Ticket
    - Add items to KOT
    - Verify routing
    ↓
[4] Create Sales Invoice
    - Create from POS Order
    - Verify items transferred
    - Save
    ↓
[5] Submit Invoice
    - Submit invoice
    - Verify status changes
    - Check stock impact
    ↓
[6] Apply Payment
    - Apply payment to invoice
    - Mark as paid
    - Verify accounts updated
    ↓
[7] Verify Complete Flow
    - Check order status
    - Check invoice status
    - Check stock levels
    - Check GL accounts
    ↓
END ✓
```

---

# Detailed Step-by-Step Flow

## STEP 0: PREPARATION - Create Master Data

### Step 0.1: Create Company
```
Goto: Menu → Setup → Company
Click: + New

Fill:
  Company Name: Test Company
  Abbr: TC
  Country: Indonesia
  Default Currency: IDR
  
Save & Close
```

### Step 0.2: Create Warehouse
```
Goto: Menu → Stock → Warehouse
Click: + New

Fill:
  Warehouse Name: Test Warehouse
  Warehouse Type: Finished Goods
  Company: Test Company
  
Save & Close
```

### Step 0.3: Create Customer
```
Goto: Menu → Selling → Customer
Click: + New

Fill:
  Customer Name: John Doe
  Customer Group: Individual
  Territory: (Select your region)
  
Save & Close
```

### Step 0.4: Create Items

#### Item 1:
```
Goto: Menu → Inventory → Item
Click: + New

Fill:
  Item Code: COFFEE-001
  Item Name: Americano Coffee
  Item Group: Beverages
  Unit of Measure: Nos
  Is Stock Item: ✓ (checked)
  
Click: ACCOUNTING section:
  Standard Selling Rate: 50000
  
Click: STOCK section:
  Warehouse: Test Warehouse
  Opening Stock: 100
  
Save & Close
```

#### Item 2:
```
Repeat above with:
  Item Code: TEA-001
  Item Name: Green Tea
  Standard Selling Rate: 40000
  Opening Stock: 50
```

### Step 0.5: Create Price List
```
Goto: Menu → Selling → Price List
Click: + New

Fill:
  Price List Name: PL-STANDARD
  Currency: IDR
  
In Price List Details table:
  
  Row 1:
    Item Code: COFFEE-001
    Price List Rate: 50000
    
  Row 2:
    Item Code: TEA-001
    Price List Rate: 40000
    
Save & Close
```

### Step 0.6: Create POS Profile
```
Goto: Menu → Retail → POS Profile
Click: + New

Fill:
  POS Profile Name: RESTAURANT-01
  Company: Test Company
  Warehouse: Test Warehouse
  Price List: PL-STANDARD
  Default Customer: John Doe
  
Scroll to IMOGI Custom Fields section:
  imogi_branch: (create or select)
  imogi_pos_domain: Restaurant
  imogi_mode: Table
  imogi_require_pos_session: checked ✓
  
Save & Close
```

### Step 0.7: Create POS Opening Entry (if required)
```
Goto: Menu → Retail → POS Opening Entry
Click: + New

Fill:
  POS Profile: RESTAURANT-01
  User: Administrator (or your user)
  Opening Time: (auto - today)
  
Click: Save

Status should change to: Open
```

---

## STEP 1: CREATE POS ORDER

### Navigation
```
URL: http://tigaperkasateknik.frappe.cloud/app/pos-order
OR
Menu → IMOGI POS → Orders → POS Orders → + New
```

### Create Order - Step by Step

**Screen 1: POS Order Form**

```
┌──────────────────────────────────────────┐
│ ▶ New POS Order                          │
├──────────────────────────────────────────┤
│                                          │
│ POS Profile:        [RESTAURANT-01] ▼    │
│ Customer:           [John Doe] ▼         │
│ Posting Date:       [2026-01-28]         │
│ Posting Time:       [10:00:00]           │
│                                          │
│ ┌─ Item Details ───────────────────────┐ │
│ │ Item Code │ Qty │ Rate │ Amount      │ │
│ ├───────────┼─────┼──────┼─────────────┤ │
│ │           │     │      │             │ │
│ └─────────────────────────────────────┘ │
│                                          │
│                               [Save]     │
└──────────────────────────────────────────┘
```

**Fill Details:**

1. **POS Profile:**
   - Click: [RESTAURANT-01] dropdown
   - Select: RESTAURANT-01
   - Other fields auto-fill (Customer, Price List)

2. **Customer:**
   - Click: [John Doe] dropdown
   - Select: John Doe
   - (auto-filled based on POS Profile)

3. **Add Item 1:**
   - Click: + Add Row (in Item Details table)
   - Item Code: Click → Search "COFFEE-001"
   - Qty: 2
   - Rate: 50000 (auto-fills)
   - Amount: (auto-calculates to 100000)

4. **Add Item 2:**
   - Click: + Add Row
   - Item Code: Search "TEA-001"
   - Qty: 1
   - Rate: 40000 (auto-fills)
   - Amount: (auto-calculates to 40000)

**Form should now show:**
```
Item Details:
┌──────────────┬─────┬────────┬──────────┐
│ Item Code    │ Qty │ Rate   │ Amount   │
├──────────────┼─────┼────────┼──────────┤
│ COFFEE-001   │  2  │ 50000  │ 100000   │
│ TEA-001      │  1  │ 40000  │ 40000    │
└──────────────┴─────┴────────┴──────────┘

Total Qty: 3
Net Total: 140000
```

5. **Save Order:**
   - Click: [Save] button (Ctrl+S)
   - Wait for response
   - Order ID should appear: POS-2026-00001

**Expected Result:**
```
✓ Order created successfully
✓ Order ID: POS-2026-00001
✓ Status: Draft
✓ Net Total: 140000
```

---

## STEP 2: CREATE KOT (Kitchen Order Ticket)

### Why Create KOT?
- Kitchen staff needs to see what to cook
- Track item preparation status
- Print kitchen tickets

### Prerequisites Check
```
✓ Order created (POS-2026-00001)
✓ Order status: Draft
✓ Items added: COFFEE-001, TEA-001
```

### Step 2.1: Navigate to KOT Creation

**Option A: From POS Order**
```
1. Open order: POS-2026-00001
2. Scroll down to "Actions" dropdown
3. Click: "Create KOT Ticket"
```

**Option B: Manual Creation**
```
Menu → IMOGI POS → Orders → KOT Tickets → + New
```

### Step 2.2: Create KOT Form

**Fill Details:**
```
POS Order:          [POS-2026-00001]
Kitchen Station:    [MAIN-KITCHEN]
Status:             Draft (auto)

Add items from order:
┌──────────────┬─────┬────────┐
│ Item Code    │ Qty │ Status │
├──────────────┼─────┼────────┤
│ COFFEE-001   │  2  │Pending │
│ TEA-001      │  1  │Pending │
└──────────────┴─────┴────────┘
```

**Save:**
- Click [Save]
- KOT ID: KOT-2026-00001

**Expected:**
```
✓ KOT created
✓ KOT ID: KOT-2026-00001
✓ Items status: Pending
✓ Kitchen Station: MAIN-KITCHEN
```

---

## STEP 3: UPDATE KOT STATUS (Simulate Cooking)

### Step 3.1: Update Item to "In Progress"

**In KOT Form (KOT-2026-00001):**

1. **For COFFEE-001:**
   - Click: Status field for COFFEE-001
   - Change: "Pending" → "In Progress"
   - Save

2. **For COFFEE-001 (Complete):**
   - Click: Status field for COFFEE-001
   - Change: "In Progress" → "Ready"
   - Save

3. **For TEA-001:**
   - Click: Status field
   - Change: "Pending" → "In Progress"
   - Save

4. **For TEA-001 (Complete):**
   - Click: Status field
   - Change: "In Progress" → "Ready"
   - Save

**KOT Form Should Show:**
```
Items Status:
┌──────────────┬─────┬────────┐
│ Item Code    │ Qty │ Status │
├──────────────┼─────┼────────┤
│ COFFEE-001   │  2  │ Ready  │
│ TEA-001      │  1  │ Ready  │
└──────────────┴─────┴────────┘

KOT Status: Ready ✓
```

---

## STEP 4: CREATE SALES INVOICE

### Prerequisites
```
✓ Order submitted: POS-2026-00001
✓ KOT ready: KOT-2026-00001
```

### Step 4.1: From POS Order

**Open POS Order (POS-2026-00001):**
```
1. Menu → IMOGI POS → Orders → POS Orders
2. Click: POS-2026-00001
3. Status: Draft
4. Click: [Submit] button
   (This finalizes the order)
   
Order Status changes to: Submitted
```

### Step 4.2: Create Invoice from Order

**Method A: Auto Create from Order**
```
1. Open submitted order: POS-2026-00001
2. Click: Menu → Actions
3. Select: "Create Sales Invoice"
4. Form auto-fills with:
   - Customer: John Doe
   - Items: COFFEE-001 (qty 2), TEA-001 (qty 1)
   - Amounts: correct
5. Click: [Save]

Invoice created: ACC-2026-00001
Status: Draft
```

**Method B: Manual Create**
```
Menu → Accounting → Sales Invoice → + New

Fill manually:
  Customer: John Doe
  Posting Date: 2026-01-28
  Due Date: 2026-01-30
  
Add items:
  Row 1: COFFEE-001, Qty 2, Rate 50000
  Row 2: TEA-001, Qty 1, Rate 40000
  
Check "Is POS": ✓ (checked)
POS Profile: RESTAURANT-01

Save: ACC-2026-00001
```

**Expected:**
```
✓ Invoice created: ACC-2026-00001
✓ Customer: John Doe
✓ Status: Draft
✓ Items transferred correctly
✓ Net Total: 140000
✓ Outstanding Amount: 140000 (unpaid)
```

---

## STEP 5: SUBMIT INVOICE

### Step 5.1: Submit the Invoice

**Open Invoice (ACC-2026-00001):**
```
1. Menu → Accounting → Sales Invoice
2. Click: ACC-2026-00001
3. Current Status: Draft
4. Click: [Submit] button

Frappe will validate:
  ✓ Customer valid
  ✓ Items valid
  ✓ Accounts configured
  ✓ Stock sufficient
```

**If errors appear:**
```
Error examples:
- "Debtors account not set for Customer"
  → Go to Customer → Set Debtors Account
  
- "Income account not set for Item"
  → Go to Item → Set Income Account
  
- "Insufficient stock"
  → Warehouse doesn't have enough stock
  → Adjust opening stock in Step 0.4
```

### Step 5.2: Verify Submission

**After Successful Submit:**
```
Invoice Status: Submitted ✓
Docstatus: 1 (submitted)

Check: Stock Ledger
  Item: COFFEE-001
  Before: 100 units
  After: 98 units (100 - 2 ordered)
  
Check: Accounts Receivable
  Debit (AR Account): 140000
  Credit (Sales Account): 140000
```

**Form should look:**
```
┌─────────────────────────────────────┐
│ ACC-2026-00001      [SUBMITTED] ✓   │
├─────────────────────────────────────┤
│ Customer: John Doe                  │
│ Posted Date: 2026-01-28             │
│                                     │
│ Items:                              │
│  COFFEE-001   × 2   Rp 100,000      │
│  TEA-001      × 1   Rp 40,000       │
│                                     │
│ Net Total:              Rp 140,000  │
│ Outstanding Amount:     Rp 140,000  │
│                                     │
│ Status: Submitted ✓                 │
└─────────────────────────────────────┘
```

---

## STEP 6: APPLY PAYMENT

### Prerequisites
```
✓ Invoice submitted: ACC-2026-00001
✓ Outstanding amount: 140000
```

### Step 6.1: Create Payment Entry

**Method A: From Invoice**
```
1. Open Invoice: ACC-2026-00001
2. Click: [Make] dropdown → Payment
3. Auto-fills:
   - Payee: John Doe
   - Amount: 140000
   - Payment Type: Receive
4. Click: [Save]

Payment entry created: ACC-PMT-2026-00001
```

**Method B: Manual Payment Entry**
```
Menu → Accounting → Payment Entry → + New

Fill:
  Payment Type: Receive
  Party Type: Customer
  Party: John Doe
  Paid Amount: 140000
  Payment Date: 2026-01-28
  
In Allocations table:
  Invoice: ACC-2026-00001
  Allocated Amount: 140000
  
Save & Submit
```

### Step 6.2: Verify Payment Applied

**After Payment Submitted:**

**Check Invoice (ACC-2026-00001):**
```
Outstanding Amount: 0 ✓ (fully paid)
Paid Amount: 140000 ✓
Status: Paid ✓
```

**Check GL Accounts:**
```
Cash/Bank Account: +140000
Accounts Receivable: -140000
```

---

## STEP 7: FINAL VERIFICATION

### Verify Complete Flow

**Checklist - Order:**
```
POS-2026-00001:
  ✓ Status: Submitted
  ✓ Customer: John Doe
  ✓ Items: 2 items
  ✓ Net Total: 140000
```

**Checklist - KOT:**
```
KOT-2026-00001:
  ✓ Status: Ready
  ✓ Items status: All Ready
  ✓ COFFEE-001: Qty 2, Ready
  ✓ TEA-001: Qty 1, Ready
```

**Checklist - Invoice:**
```
ACC-2026-00001:
  ✓ Status: Submitted
  ✓ Outstanding: 0 (Paid)
  ✓ Items transferred correctly
  ✓ GL accounts updated
```

**Checklist - Stock:**
```
Warehouse: Test Warehouse

COFFEE-001:
  Opening: 100
  Ordered: 2
  Current: 98 ✓

TEA-001:
  Opening: 50
  Ordered: 1
  Current: 49 ✓
```

**Checklist - Accounts:**
```
Accounts Receivable:
  Debit: 140000 (from invoice)
  Credit: 140000 (from payment)
  Balance: 0 ✓

Sales Account:
  Credit: 140000 ✓

Cash/Bank:
  Debit: 140000 ✓
```

---

# Positive Flow Scenarios

## Scenario 1: Basic Order → Invoice → Payment

**Duration:** ~10 minutes  
**Difficulty:** Beginner

```
1. Create Order with 2 items
2. Submit Order
3. Create Invoice
4. Submit Invoice
5. Create Payment Entry
6. Verify paid
```

**What to Look For:**
- Order status changes: Draft → Submitted
- Invoice outstanding decreases
- Stock levels decrease
- Accounts balance

**Success Criteria:**
- ✓ Order submitted
- ✓ Invoice submitted
- ✓ Invoice marked paid
- ✓ Stock updated
- ✓ GL accounts balanced

---

## Scenario 2: Kitchen Order Tracking

**Duration:** ~5 minutes  
**Difficulty:** Beginner

```
1. Create Order with items
2. Create KOT
3. Update KOT items: Pending → In Progress → Ready
4. Mark KOT as Completed
5. Verify status
```

**What to Look For:**
- KOT items status transitions
- Timestamps recorded
- Can progress items only (not regress)

**Success Criteria:**
- ✓ KOT created
- ✓ Items status: Pending → Ready
- ✓ Cannot change status of completed KOT

---

## Scenario 3: Multiple Items & Multiple Payments

**Duration:** ~15 minutes  
**Difficulty:** Intermediate

```
1. Create Order with 5 items (mix of quantities)
2. Create Invoice
3. Submit Invoice
4. Apply partial payment: 50000
5. Apply second payment: 90000
6. Verify invoice marked paid
```

**What to Look For:**
- Multiple items handled
- Partial payments work
- Outstanding decreases with each payment

**Success Criteria:**
- ✓ Order created with 5 items
- ✓ Invoice shows correct total
- ✓ Two payments combine to equal total
- ✓ Outstanding = 0

---

# Negative Flow Scenarios

## Negative Scenario 1: Create Order Without Customer

**Steps:**
```
1. Try to create POS Order
2. Leave Customer field empty
3. Try to Save
```

**Expected Error:**
```
✗ "Customer is mandatory"
OR
✗ Order not saved
```

**Verification:**
- [ ] Error message appears
- [ ] Order not created
- [ ] Customer field highlighted in red

---

## Negative Scenario 2: Submit Invoice Without Stock

**Steps:**
```
1. Create Order with COFFEE-001, Qty: 200
   (warehouse only has 100)
2. Create Invoice
3. Try to Submit
```

**Expected Error:**
```
✗ "Insufficient stock for item COFFEE-001"
OR
✗ "Negative stock error"
```

**Verification:**
- [ ] Error message
- [ ] Invoice not submitted
- [ ] Status remains Draft

---

## Negative Scenario 3: Overpayment

**Steps:**
```
1. Create & submit invoice (Total: 140000)
2. Create payment for 200000
3. Try to submit payment
```

**Expected Behavior:**
```
Option A: System rejects overpayment
  ✗ Error: "Payment exceeds outstanding"
  
Option B: System allows but marks as overpaid
  ✓ Outstanding: -60000 (credit balance)
```

**Verification:**
- [ ] Check configuration setting
- [ ] Verify system behavior

---

## Negative Scenario 4: Submit Order Twice

**Steps:**
```
1. Create & submit order (POS-2026-00001)
2. Try to submit same order again
```

**Expected Error:**
```
✗ "Document already submitted"
OR
✗ Submit button disabled/hidden
```

**Verification:**
- [ ] Error appears
- [ ] Order state unchanged

---

## Negative Scenario 5: Create Invoice for Draft Order

**Steps:**
```
1. Create Order (don't submit)
2. Try to create Invoice
```

**Expected Behavior:**
```
Option A: System requires submitted order
  ✗ Error: "Order must be submitted"
  
Option B: System allows (depends on config)
  ✓ Invoice created from draft
```

**Verification:**
- [ ] Check system behavior
- [ ] Document expectations

---

## Negative Scenario 6: Item with Disabled Status

**Steps:**
```
1. Create item: DISABLED-ITEM
2. Mark as disabled
3. Create order with DISABLED-ITEM
4. Try to Save
```

**Expected Error:**
```
✗ "Item DISABLED-ITEM is disabled"
```

**Verification:**
- [ ] Error message
- [ ] Order not saved

---

# Verification Checklist

## Pre-Test Verification

- [ ] Frappe environment accessible
- [ ] Logged in as Administrator
- [ ] IMOGI POS app installed
- [ ] Test data created (master data)
- [ ] POS Opening Entry active
- [ ] GL accounts configured:
  - [ ] Debtors account set for Customer
  - [ ] Sales account set for Items
  - [ ] Cost account set for Items
  - [ ] Receivable account configured

## During Test - Order Creation

- [ ] POS Profile selected
- [ ] Customer selected
- [ ] Items added with quantities
- [ ] Rates auto-fill correctly
- [ ] Amounts calculated correctly
- [ ] Total shows correct sum

## During Test - KOT Creation

- [ ] KOT created with order reference
- [ ] Items appear in KOT
- [ ] Kitchen station assigned
- [ ] Item status: Pending initially
- [ ] Can update status

## During Test - Invoice Creation

- [ ] Invoice created from order
- [ ] Customer transferred correctly
- [ ] Items transferred with same quantities/rates
- [ ] Net total matches order
- [ ] Outstanding = Net total
- [ ] Is POS checkbox marked

## During Test - Invoice Submission

- [ ] Invoice submits successfully
- [ ] Status changes: Draft → Submitted
- [ ] Stock ledger updated:
  - [ ] Stock decreases by ordered qty
  - [ ] Warehouse correct
- [ ] GL accounts updated:
  - [ ] Sales account credited
  - [ ] AR account debited
  - [ ] Cost of goods sold impact (if configured)

## During Test - Payment Application

- [ ] Payment entry created
- [ ] Party (Customer) correct
- [ ] Amount correct
- [ ] Payment date set
- [ ] Invoice allocation correct
- [ ] Payment submits successfully

## After Test - Final Verification

**Check Order:**
```
Order → POS-2026-00001
  Status: Submitted ✓
  Can view but cannot edit ✓
```

**Check KOT:**
```
KOT → KOT-2026-00001
  Status: Ready ✓
  Items status: All Ready ✓
```

**Check Invoice:**
```
Invoice → ACC-2026-00001
  Status: Submitted ✓
  Outstanding: 0 ✓
  Paid: 140000 ✓
```

**Check Stock:**
```
Stock → Warehouse
  COFFEE-001: 98 units ✓
  TEA-001: 49 units ✓
```

**Check Accounts:**
```
Trial Balance:
  AR Account: 0 balance ✓
  Sales Account: 140000 ✓
  Cash Account: 140000 ✓
```

---

## Test Result Record

```
TEST EXECUTION RECORD
=====================

Date: 2026-01-28
Tester: _________________
Duration: _________________

TESTS EXECUTED:
[ ] Scenario 1: Basic Order → Invoice → Payment
[ ] Scenario 2: Kitchen Order Tracking
[ ] Scenario 3: Multiple Items & Payments

NEGATIVE TESTS:
[ ] Negative 1: Order without customer
[ ] Negative 2: Invoice without stock
[ ] Negative 3: Overpayment
[ ] Negative 4: Double submit
[ ] Negative 5: Draft order invoice
[ ] Negative 6: Disabled item

RESULTS:
✓ Passed: ___ / ___
✗ Failed: ___ / ___
⚠ Blocked: ___ / ___

ISSUES FOUND:
1. _________________________________
2. _________________________________
3. _________________________________

SIGN-OFF:
Tester: _______________  Date: _______
```

---

**End of Standard Testing Flow Guide**
