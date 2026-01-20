# IMOGI POS Deployment Guide

This guide provides step-by-step instructions for deploying the IMOGI POS app on an ERPNext v15 instance.

## Prerequisites

- ERPNext v15 installation
- Frappe Bench environment
- System user with appropriate permissions

## Installation Steps

### 1. Get the App

```bash
bench get-app https://github.com/imogi/imogi_pos
```

### 2. Install the App

```bash
bench --site your-site.local install-app imogi_pos
```

### 3. Build Assets

```bash
bench build
```

### 4. Migrate and Load Fixtures

Run the migration to create all necessary DocTypes and load fixtures:

```bash
bench --site your-site.local migrate
```

Fixtures will automatically be loaded after migration due to the `after_migrate` hook.

## Configuration

### 5. Set Up POS Profiles

1. Navigate to **POS Profile** in ERPNext
2. Create or modify profiles for different service modes:
   - Table Service
   - Counter/Takeaway
   - Kiosk
   - Self-Order

3. Set `imogi_pos_domain` to "Restaurant" for restaurant operations
4. Enable `allow_non_sales_items` if non-sales items should be skipped during billing

### 6. Configure Printer Interfaces

For each POS Profile or Kitchen Station, configure printer interfaces:

#### LAN Printer
- Set `imogi_printer_cashier_interface` or `imogi_printer_kitchen_interface` to "LAN"
- Enter IP address in `imogi_printer_cashier` or `imogi_printer_kitchen`
- Optionally specify port in `imogi_printer_port` (default: 9100)

#### Bluetooth Printer
- Set interface to "Bluetooth"
- Configure device name in `imogi_bt_cashier_device_name` or `imogi_bt_kitchen_device_name`
- Select vendor profile in `imogi_bt_cashier_vendor_profile` or `imogi_bt_kitchen_vendor_profile`
- For Print Bridge (optional): set `imogi_print_bridge_url` and `imogi_print_bridge_token`

#### OS Spooler Printer
- Set interface to "OS"
- No additional configuration needed (uses OS default printer)

### 7. Set Up Customer Display

1. Navigate to **Customer Display Profile**
2. Create a new profile and configure display blocks
3. Access Customer Display URL and pair with POS using the provided code
4. Test connection using "Send Test Message"

### 8. Generate Self-Order QR Codes

1. Navigate to **Restaurant Table**
2. Select tables for Self-Order capability
3. Use **Print** > **Self-Order QR Sheet** to generate QR codes
4. Place printed QR codes at tables for customer access

### 9. Assign User Roles

Assign appropriate roles to users:
- Restaurant Manager
- Cashier
- Waiter
- Kitchen Staff
- Viewer (for reports)
- Device roles (for kiosks and displays)

### 10. Test Configuration

1. Test Table Display page
2. Test Kitchen Display page
3. Verify KOT printing
4. Verify Customer Display connection
5. Test Self-Order flow with QR scanning
6. Test billing and payment flow

## Troubleshooting

### Printer Issues
- Verify network connectivity for LAN printers
- Check Bluetooth pairing status for BT printers
- Ensure correct printer driver is installed for OS spooler

### Customer Display Not Connecting
- Verify both devices are on the same network
- Check pairing code is entered correctly
- Verify WebSocket connections are not blocked by firewall

### Self-Order QR Not Working
- Verify token expiry settings
- Check that tables are properly configured
- Ensure proper network connectivity

## What Happens When Starting a POS Session?

### Overview

POS Session adalah fitur opsional yang membantu tracking dan accountability untuk shift kasir. Ketika diaktifkan, setiap kasir harus membuka session sebelum melakukan transaksi.

### Two Types of Sessions

IMOGI POS mendukung dua jenis session yang berbeda:

#### 1. **POS Session** (ERPNext Native)
   - DocType standar ERPNext v15
   - **Location**: **IMOGI POS → Session → POS Opening Entry**
   - Dikelola melalui POS Opening Entry & POS Closing Entry
   - Lebih komprehensif untuk reconciliation
   - Mendukung scope: User / Device / POS Profile

#### 2. **Cashier Device Session** (IMOGI Custom)
   - DocType custom IMOGI POS
   - **Location**: **Opening Balance page** (`/opening-balance`)
   - Lebih sederhana, fokus pada opening balance tracking
   - Membuat Journal Entry otomatis untuk cash movement

### POS Session Flow (ERPNext Native)

#### A. Opening Session

Ketika kasir membuka **POS Opening Entry**:

1. **Validation Checks**:
   ```python
   - Check POS Profile: imogi_require_pos_session = 1
   - Check scope (User/Device/POS Profile)
   - Prevent duplicate active session for same scope
   ```

2. **Create Session Record**:
   ```python
   POS Session Document:
   - User: frappe.session.user
   - POS Profile: selected profile
   - Company: selected company
   - Status: "Open"
   - Opening Cash: input amount
   - Creation timestamp
   ```

3. **Session Linking**:
   - Setiap Sales Invoice yang dibuat akan otomatis link ke session ini
   - Field: `pos_session` di Sales Invoice
   - Digunakan untuk reporting dan reconciliation

#### B. During Active Session

1. **Order Creation**:
   ```python
   validate_pos_session(pos_profile):
     - Check if POS Session required
     - Validate active session exists
     - Get session name for linking
     - Throw error if required but not found
   ```

2. **Invoice Builder**:
   ```python
   # Automatic session linking
   if has_active_session:
       invoice.pos_session = get_active_pos_session(pos_profile)
   ```

3. **Access Control**:
   - Cashier Console checks for active session
   - Blocks order creation if session required but not open
   - Shows warning message with link to open session

#### C. Closing Session

Ketika kasir menutup **POS Closing Entry**:

1. **Aggregate Calculations**:
   ```python
   - Total Sales (sum of all invoices in session)
   - Total Payments per method (Cash/Card/Digital)
   - Expected Cash = Opening + Cash Sales - Cash Out
   ```

2. **Cash Reconciliation**:
   ```python
   - Input: Actual Closing Cash (count fisik)
   - Calculate: Difference = Actual - Expected
   - Flag: Shortage/Overage if difference != 0
   ```

3. **Submit & Lock**:
   ```python
   - Status: "Open" → "Closed"
   - Lock all linked invoices to this session
   - Generate session report
   ```

### Cashier Device Session Flow (IMOGI Custom)

Ini adalah alternatif yang lebih sederhana, fokus pada opening balance.

#### A. Record Opening Balance

Ketika kasir mengakses `/opening-balance`:

1. **Check Active Device**:
   ```python
   cache = frappe.cache()
   if cache.hget("active_devices", user):
       throw("Active device already registered")
   ```

2. **Calculate from Denominations**:
   ```python
   if denominations provided:
       total = sum(value × qty for each denomination)
   else:
       total = manual opening_balance
   ```

3. **Create Session Record**:
   ```python
   Cashier Device Session:
   - User: current user
   - Device: POS/Kiosk/etc
   - Opening Balance: calculated total
   - Denominations: JSON array of cash breakdown
   - Timestamp: now()
   ```

#### B. Journal Entry Creation

**Ini adalah bagian penting** - sistem otomatis membuat Journal Entry untuk cash movement:

1. **Get Cash Accounts**:
   ```python
   From Restaurant Settings:
   - big_cash_account: Kas Besar (vault/safe)
   - petty_cash_account: Kas Kecil (cashier drawer)
   ```

2. **Determine Posting Sides**:
   ```python
   # Petty cash normal side (usually Debit for Asset)
   petty_side = get_normal_side(petty_cash_account)
   offset_side = opposite of petty_side
   
   # Respect account rules (balance_must_be)
   validate_side_allowed(petty_cash_account, petty_side)
   validate_side_allowed(big_cash_account, offset_side)
   ```

3. **Create Journal Entry**:
   ```python
   Journal Entry (Cash Entry):
   ┌─────────────────────────────────────────┐
   │ Petty Cash (Debit)      Rp 1,000,000   │ ← Tambah saldo kasir
   │ Big Cash (Credit)       Rp 1,000,000   │ ← Kurangi kas besar
   └─────────────────────────────────────────┘
   
   Reference:
   - Type: Cashier Device Session
   - Name: SHF-20260120-001
   ```

4. **Lock Active Device**:
   ```python
   # Prevent duplicate session
   cache.hset("active_devices", user, device_type)
   ```

#### C. Effect on Accounts

**Before Opening**:
```
Kas Besar (Big Cash):     Rp 10,000,000
Kas Kecil (Petty Cash):   Rp 0
```

**After Opening Rp 1,000,000**:
```
Kas Besar (Big Cash):     Rp 9,000,000  (-1M)
Kas Kecil (Petty Cash):   Rp 1,000,000  (+1M)
```

**After Sales** (contoh: penjualan cash Rp 500,000):
```
Kas Kecil (Petty Cash):   Rp 1,500,000  (+500K)
Piutang/Income:           Rp 500,000
```

**End of Shift** - Closing Balance:
```
Expected: Rp 1,500,000 (Opening 1M + Sales 500K)
Actual Count: Rp 1,498,000 (fisik)
Difference: -Rp 2,000 (shortage)
```

### Configuration Fields

#### POS Profile Settings

```python
imogi_require_pos_session: Check (0/1)
  → Enable/disable session requirement

imogi_enforce_session_on_cashier: Check (0/1)
  → Block access if no active session

imogi_pos_session_scope: Select
  → "User" - one session per user
  → "Device" - one session per device/terminal
  → "POS Profile" - one session per profile (shared)
```

#### Restaurant Settings (for Device Session)

```python
big_cash_account: Link (Account)
  → Main cash vault/safe account
  → Example: "Kas Besar - C"

petty_cash_account: Link (Account)
  → Cashier drawer/working cash account  
  → Example: "Kas Kecil - C"
```

### Session Validation Points

System melakukan validasi di beberapa titik:

1. **Cashier Console Load**:
   ```javascript
   if (require_session && enforce_on_cashier) {
       checkActivePOSSession();
       if (!has_active_session) {
           showError("Please open POS Session first");
           blockOrderCreation();
       }
   }
   ```

2. **Create Order API**:
   ```python
   @frappe.whitelist()
   def create_order(...):
       pos_session = validate_pos_session(pos_profile)
       # Will throw error if required but not found
   ```

3. **Invoice Builder**:
   ```python
   def build_sales_invoice(...):
       active_session = get_active_pos_session(pos_profile)
       if active_session:
           si.pos_session = active_session
   ```

### Error Scenarios

#### 1. Session Required but Not Open
```
Error: "No active POS Session found. Please open a POS Session first."
Action: Redirect to /app/pos-session/new-pos-session
```

#### 2. Duplicate Session Attempt
```
Error: "Active device already registered for user"
Action: Close existing session first
```

#### 3. Cash Accounts Not Configured
```
Error: "Cash accounts are not configured in Restaurant Settings"
Action: Configure big_cash_account and petty_cash_account
```

#### 4. Invalid Account Posting Side
```
Error: "Account X is locked to Debit postings, cannot post Credit"
Action: Check Chart of Accounts configuration
```

### UI/Web Pages Flow

#### Page Yang Muncul Saat Buka POS Session

Ada **DUA cara** untuk membuka session, tergantung tipe session yang digunakan:

---

#### **Cara 1: POS Opening Entry (ERPNext Native)**

**URL**: `/desk#pos-session/new-pos-session-1` atau melalui Desk

**Tampilan**: Form DocType standard ERPNext

**Flow**:
```
1. Login → Desk
2. Navigate: IMOGI POS Workspace → Session → POS Opening Entry
3. Klik "New"
4. Form POS Opening Entry muncul dengan fields:
   ┌────────────────────────────────────────┐
   │ POS Opening Entry                      │
   ├────────────────────────────────────────┤
   │ POS Profile:      [Dropdown]           │
   │ User:             [Auto-filled]        │
   │ Company:          [Dropdown]           │
   │ POS Opening Shift: [Text]              │
   │ Opening Cash:     [Currency Input]     │
   │ Remark:           [Text Area]          │
   │                                        │
   │ [Save] [Submit]                        │
   └────────────────────────────────────────┘

5. Fill in opening cash amount
6. Klik "Submit" → Session aktif
7. Redirect: Cashier Console atau stay di Desk
```

**Screenshot Concept**:
- Standard Frappe form dengan sidebar
- Top: Breadcrumb (IMOGI POS > POS Opening Entry > New)
- Fields dalam card putih
- Save button biru, Submit button hijau

---

#### **Cara 2: Opening Balance Page (IMOGI Custom)**

**URL**: `/opening-balance?device=DEVICE&next=NEXT_PAGE`

**Contoh URLs**:
- Cashier: `/opening-balance?device=cashier&next=/cashier-console`
- Kiosk: `/opening-balance?device=kiosk&next=/service-select`

**Tampilan**: Custom designed page dengan visual menarik

**Flow**:
```
1. Login → Device Select (optional)
   URL: /device-select
   ┌─────────────────────────────────────────┐
   │         Select Your Device              │
   ├─────────────────────────────────────────┤
   │  [Kiosk]           [Cashier]           │
   └─────────────────────────────────────────┘

2. Klik device → Auto redirect ke /opening-balance

3. Opening Balance Page muncul:
   
   ┌───────────────────────────────────────────────────────────┐
   │                    💰 (Header Icon)                       │
   ├──────────────────────────┬────────────────────────────────┤
   │    CASHIER SESSION       │   NEW OPENING BALANCE          │
   ├──────────────────────────┼────────────────────────────────┤
   │                          │                                │
   │ 🕐 Timestamp:            │  Denomination    Qty  Subtotal │
   │    [Auto-filled]         │  ───────────────────────────── │
   │                          │  Rp 100,000     [ 0 ]  Rp 0    │
   │ 👤 User:                 │  Rp 50,000      [ 0 ]  Rp 0    │
   │    [Current User]        │  Rp 20,000      [ 0 ]  Rp 0    │
   │                          │  Rp 10,000      [ 0 ]  Rp 0    │
   │ 💻 Device:               │  Rp 5,000       [ 0 ]  Rp 0    │
   │    [Device Type]         │  Rp 2,000       [ 0 ]  Rp 0    │
   │                          │  ───────────────────────────── │
   │ # Shift ID:              │  Total:              Rp 0      │
   │    [Auto-generated]      │                                │
   │                          │  [▶ Start Session]             │
   │ 💰 Opening Balance:      │                                │
   │    [Will be filled]      │                                │
   │                          │                                │
   └──────────────────────────┴────────────────────────────────┘

4. User input jumlah lembar per denominasi
5. Total otomatis ter-calculate (real-time)
6. Klik "Start Session" button
7. API call: record_opening_balance()
8. Success → Auto redirect ke next page (cashier-console/service-select)
```

**Visual Features**:
- **Background**: Gradient abu-abu dengan overlay orange
- **Card**: White card dengan shadow, 2 kolom split
- **Left Column (Session Details)**:
  - Labels dengan icon (clock, user, desktop, hashtag, wallet)
  - Read-only fields showing previous session info
  - Gradient background #f8f9fa to #ffffff
- **Right Column (Input Form)**:
  - Table untuk input denominasi
  - Real-time calculation
  - Orange gradient button dengan icon
  - Hover effects dan animations
- **Header Icon**: Floating orange circle dengan cash register icon
- **Responsive**: Mobile-friendly dengan breakpoints

**JavaScript Interactivity**:
```javascript
// Real-time calculation
Input change → Calculate subtotal → Update total → Format Rupiah

// Form submission
Submit → Loading state → API call → Success animation → Redirect

// Previous session display
Page load → Fetch last session → Display info (timestamp, shift ID, etc.)
```

---

#### **Cara 3: Cashier Console Warning (Lazy Opening)**

Jika kasir langsung akses Cashier Console tanpa buka session:

**URL**: `/cashier-console`

**Tampilan**: Console dengan warning banner di atas

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  No active POS Session. Please open session to continue. │
│                                    [Open Session] ←Button   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    CASHIER CONSOLE                          │
│                    (Disabled/Grayed out)                    │
│                                                             │
│   Orders Section: [Disabled]                                │
│   Create Order Button: [Disabled]                           │
│   Cart Section: [Disabled]                                  │
└─────────────────────────────────────────────────────────────┘
```

**Flow**:
1. User lands on cashier console
2. System checks: `require_pos_session && enforce_session_on_cashier`
3. If no active session: Show warning banner
4. UI disabled dengan opacity 0.5
5. Click "Open Session" button → Redirect to `/desk#pos-session/new-pos-session-1`
6. After opening session → Refresh → Full access

---

### Page Comparison

| Feature | POS Opening Entry | Opening Balance Page |
|---------|------------------|---------------------|
| **Type** | ERPNext Native | IMOGI Custom |
| **URL** | `/desk#pos-session/...` | `/opening-balance?device=...` |
| **UI** | Standard Form | Custom Design |
| **Denominations** | No | Yes (detailed) |
| **Journal Entry** | No | Yes (automatic) |
| **Cash Transfer** | No | Yes (Big → Petty) |
| **Mobile** | Limited | Optimized |
| **Visual** | Basic | Modern/Animated |
| **Use Case** | Full POS operations | Simple cash tracking |
| **Scope Support** | User/Device/Profile | Device only |

---

### When to Use Which?

**Use POS Opening Entry** when:
- Need comprehensive session tracking
- Want native ERPNext reconciliation
- Managing multiple cashiers/terminals
- Need session scope control (User/Device/Profile)
- Want to use POS Closing Entry for reconciliation

**Use Opening Balance Page** when:
- Focus on quick cash drawer setup
- Need automatic cash transfer (vault → drawer)
- Want detailed denomination tracking
- Prefer modern, visual interface
- Kiosk or simplified cashier operations
- Need mobile-friendly interface

---

## Waiter Order Flow

### Overview

Waiter Order adalah interface khusus untuk **pelayan restaurant** yang mengambil pesanan dari meja tamu. Flow ini fokus pada:
- Order taking dari meja
- Item selection dengan variant support
- Notes untuk setiap item
- Send to Kitchen (KOT)
- Customer attachment
- Order status tracking

### Access Points

Ada **DUA cara** waiter dapat mengakses order:

#### **1. Via Table Display (Recommended)**

**URL**: `/app/table-display` → Click table → Auto redirect

**Flow**:
```
1. Login as Waiter
2. Navigate: IMOGI POS Workspace → Table Display
3. Visual floor layout muncul
   ┌─────────────────────────────────────────┐
   │         Restaurant Floor Layout         │
   ├─────────────────────────────────────────┤
   │  🟢 T1   🔴 T2   🟢 T3   🟡 T4         │
   │  Available Occupied Available Reserved  │
   │                                         │
   │  🟢 T5   🟢 T6   🔴 T7   🟢 T8         │
   └─────────────────────────────────────────┘

4. Click table yang available atau occupied
5. Auto redirect ke: /waiter_order?table=T1&floor=FLOOR1&pos_profile=PROFILE
```

**Table Status Colors**:
- 🟢 **Green (Available)**: Meja kosong, siap untuk order baru
- 🔴 **Red (Occupied)**: Ada order aktif, bisa edit order
- 🟡 **Yellow (Reserved)**: Meja direservasi
- ⚫ **Gray (Dirty)**: Perlu dibersihkan

#### **2. Direct URL (Advanced)**

**URL Format**: 
```
/waiter_order?table=TABLE_NAME&floor=FLOOR_NAME&pos_profile=PROFILE
/waiter_order?pos_order=POS-ORD-00001
```

**Use Cases**:
- Deep linking dari notification
- Bookmarks untuk specific tables
- QR code pada meja (rare use)

---

### Page Layout: Waiter Order Interface

**URL**: `/waiter_order?table=T1&floor=MAIN&pos_profile=Restaurant`

**Visual Layout**:
```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to Tables                            [IMOGI POS Logo]     │
├────────────────────┬─────────────────────────────────────────────┤
│  ORDER SIDEBAR     │        CATALOG (Menu Selection)             │
├────────────────────┼─────────────────────────────────────────────┤
│ Order: POS-ORD-001 │  Search: [________________] 🔍             │
│ Status: Draft      │                                             │
│                    │  Categories:                                │
│ 🍽️ Table: T1       │  [All] [Main] [Drinks] [Desserts]         │
│ 👥 Guests: [2] ✏️  │                                             │
│                    │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│ 👤 Customer:       │  │ Nasi    │ │ Ayam    │ │ Sate    │      │
│    [+] Add         │  │ Goreng  │ │ Bakar   │ │ Ayam    │      │
│                    │  │ Rp25K   │ │ Rp45K   │ │ Rp35K   │      │
│ ─────────────────  │  └─────────┘ └─────────┘ └─────────┘      │
│                    │                                             │
│ ORDER ITEMS:       │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│                    │  │ Es Teh  │ │ Jus     │ │ Coffee  │      │
│ 1. Nasi Goreng     │  │ Manis   │ │ Jeruk   │ │ Rp15K   │      │
│    2x  Rp50,000 ❌ │  │ Rp8K    │ │ Rp12K   │ │         │      │
│    [+Add Notes]    │  └─────────┘ └─────────┘ └─────────┘      │
│    🟡 Preparing    │                                             │
│                    │                                             │
│ 2. Ayam Bakar      │                                             │
│    1x  Rp45,000 ❌ │                                             │
│    📝 "Extra pedas"│                                             │
│    🟢 Ready        │                                             │
│                    │                                             │
│ ─────────────────  │                                             │
│ Subtotal: Rp95K    │                                             │
│ Total:    Rp95K    │                                             │
│                    │                                             │
│ [Send to Kitchen]  │                                             │
│ [Print KOT]        │                                             │
│ [Save Order]       │                                             │
│ [Cancel]           │                                             │
└────────────────────┴─────────────────────────────────────────────┘
```

---

### Detailed Flow Steps

#### **Step 1: Select Table from Table Display**

Waiter clicks table dari floor layout:

```python
# API Call: open_or_create_for_table
GET /waiter_order?table=T1&floor=MAIN&pos_profile=Restaurant

System checks:
1. Is table occupied?
   → Yes: Load existing POS Order
   → No: Create new POS Order

2. Create/Load Order:
   {
     "doctype": "POS Order",
     "table": "T1",
     "floor": "MAIN",
     "order_type": "Dine-in",
     "branch": "Main Branch",
     "workflow_state": "Draft",
     "pos_profile": "Restaurant"
   }

3. Update table status:
   Table.status = "Occupied"
   Table.current_pos_order = "POS-ORD-00001"
```

#### **Step 2: Add Items to Order**

Waiter selects items dari catalog:

**A. Simple Item (No Variants)**:
```
Click item card → Add to order
- Item: "Nasi Goreng"
- Qty: 1
- Rate: Rp 25,000
- Status: Draft (not sent to kitchen)
```

**B. Template Item (Has Variants)**:
```
Click template card → Variant Picker Modal muncul

┌────────────────────────────────┐
│  Select Coffee Variant         │
├────────────────────────────────┤
│  ○ Espresso      Rp 20,000    │
│  ○ Americano     Rp 22,000    │
│  ● Cappuccino    Rp 25,000    │
│                                │
│  Size:  ○ Small  ● Large      │
│  Sugar: ○ None   ● Normal     │
│                                │
│  [Add to Order]  [Cancel]     │
└────────────────────────────────┘

After selection → Variant added to order
- Item: "Cappuccino"
- Template: "Coffee Template"
- Options: {"size": "Large", "sugar": "Normal"}
- Rate: Rp 25,000 + additional price
```

**C. Add Item Notes**:
```
Click [+Add Notes] button

┌────────────────────────────────┐
│  Item Notes                    │
├────────────────────────────────┤
│  Item: Ayam Bakar              │
│                                │
│  Notes:                        │
│  ┌────────────────────────┐   │
│  │ Extra pedas            │   │
│  │ Tanpa sayur            │   │
│  │                        │   │
│  └────────────────────────┘   │
│                                │
│  [Save]  [Cancel]             │
└────────────────────────────────┘
```

#### **Step 3: Update Guests Count**

```
Guests input field: [2] → Change to [4]
Click [Update] button

API Call: update_order_guests
{
  "pos_order": "POS-ORD-00001",
  "guests": 4
}

Result: Order.guests = 4
```

#### **Step 4: Attach Customer (Optional)**

```
Click [+Add Customer] button

┌────────────────────────────────┐
│  Select Customer               │
├────────────────────────────────┤
│  Search: [John Doe________] 🔍 │
│                                │
│  Recent Customers:             │
│  ─────────────────────────     │
│  👤 John Doe                   │
│     0812-3456-7890             │
│     [Select]                   │
│                                │
│  👤 Jane Smith                 │
│     0821-9876-5432             │
│     [Select]                   │
│                                │
│  [+ Create New Customer]       │
└────────────────────────────────┘

After selection:
- Order.customer = "CUST-00001"
- Order.customer_name = "John Doe"
- Order.contact_mobile = "0812-3456-7890"
```

#### **Step 5: Send to Kitchen**

**Critical Action** - Ini yang membedakan dari cashier:

```
Click [Send to Kitchen] button

System validates:
✅ Order has items? (min 1 item)
✅ Items properly configured?
✅ Kitchen routing configured?

If valid:
1. Update order workflow:
   workflow_state: "Draft" → "Submitted" → "To Bill"

2. Create KOT (Kitchen Order Ticket):
   {
     "doctype": "KOT Ticket",
     "pos_order": "POS-ORD-00001",
     "table": "T1",
     "items": [
       {
         "item": "Nasi Goreng",
         "qty": 2,
         "notes": "",
         "kitchen": "Main Kitchen",
         "station": "Hot Station"
       },
       {
         "item": "Ayam Bakar",
         "qty": 1,
         "notes": "Extra pedas",
         "kitchen": "Main Kitchen",
         "station": "Grill Station"
       }
     ]
   }

3. Route to Kitchen Display:
   - Items muncul di Kitchen Display per station
   - Kitchen staff can see order details
   - Timer SLA starts

4. Print KOT (if configured):
   - Thermal printer di kitchen print KOT
   - Shows: Table, Items, Notes, Time

5. Update item status:
   - All items: kitchen_status = "Pending"
   - Timestamp recorded

6. Realtime event fired:
   frappe.publish_realtime('kot_created', {
     order: "POS-ORD-00001",
     table: "T1",
     kitchen: "Main Kitchen"
   })

Success message:
"✅ Order sent to kitchen!"

Button states change:
- [Send to Kitchen] → Disabled
- [Print KOT] → Enabled
- Items show status badges
```

#### **Step 6: Monitor Kitchen Status**

Order items show real-time status:

```
Item Status Badges:
🔵 Pending    - Sent to kitchen, not started
🟡 Preparing  - Chef started cooking
🟢 Ready      - Food ready for serving
⚫ Served     - Delivered to table

Status updates via:
1. Kitchen Display updates
2. Realtime events
3. Auto-refresh every 30s
```

#### **Step 7: Add More Items (After KOT)**

Tamu order tambahan:

```
1. Select new items from catalog
2. Items added dengan status "Draft"
3. Click [Send to Kitchen] again
4. Only NEW items sent to kitchen
5. Previous items tetap dengan status existing

Result: Incremental KOT
- KOT #1: Initial order (2 items)
- KOT #2: Additional order (1 item)
```

#### **Step 8: Save Order (Without Kitchen)**

For non-kitchen items atau draft save:

```
Click [Save Order] button

API: update_order
- Save all changes
- No KOT created
- workflow_state stays "Draft"
- Used for: drinks, saving progress, etc.
```

#### **Step 9: Complete Order → Transfer to Cashier**

Ketika tamu siap bayar:

```
Waiter options:
A. Mark as "Ready to Bill" dari waiter interface
B. Inform cashier verbally
C. Use notification system (if configured)

Cashier then:
1. Access Cashier Console
2. See order in "To Bill" list
3. Click order → Generate invoice
4. Process payment
5. Print receipt
```

#### **Step 10: Cancel Order**

```
Click [Cancel] button

Confirmation modal:
┌────────────────────────────────┐
│  Cancel Order?                 │
├────────────────────────────────┤
│  This will cancel the order    │
│  and free the table.           │
│                                │
│  Reason (optional):            │
│  ┌────────────────────────┐   │
│  │ Customer left         │   │
│  └────────────────────────┘   │
│                                │
│  [Confirm Cancel]  [Back]     │
└────────────────────────────────┘

If confirmed:
1. workflow_state → "Cancelled"
2. Table.status → "Available"
3. Table.current_pos_order → NULL
4. Kitchen notified (if items were sent)
```

---

### Key Features

#### **1. Template-First Catalog**
- Shows item templates (parent items)
- Click template → Variant picker
- Support options/modifiers
- Real-time price calculation

#### **2. Item Options System**
```javascript
// Option structure
{
  "size": {"value": "Large", "price": 5000},
  "sugar": {"value": "Less", "price": 0},
  "topping": {"value": "Extra Cheese", "price": 8000}
}

Total Price = Base Price + Sum(Option Prices)
```

#### **3. Kitchen Status Tracking**
```python
# Counter-based status
counters = {
  "pending": 2,    # Sent to kitchen
  "preparing": 1,  # Being cooked
  "ready": 3,      # Ready to serve
  "served": 2      # Delivered
}

Kitchen Status derived from counters:
- Most recent status shown
- Timestamp tracked
- Visual badges updated
```

#### **4. Item Notes**
- Per-item notes
- Sent to kitchen on KOT
- Shows on Kitchen Display
- Examples: "Extra spicy", "No onions", etc.

#### **5. Guest Count**
- Track number of guests
- Used for analytics
- Can update anytime

#### **6. Customer Attachment**
- Optional but recommended
- Search by name/phone
- Link to loyalty program
- Customer history

---

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `open_or_create_for_table` | POST | Create/open order for table |
| `update_order` | POST | Save order changes |
| `add_item_to_order` | POST | Add item to order |
| `remove_item_from_order` | POST | Remove item from order |
| `update_item_qty` | POST | Update item quantity |
| `add_item_notes` | POST | Add/update item notes |
| `send_to_kitchen` | POST | Create KOT and send to kitchen |
| `print_kot` | POST | Print KOT ticket |
| `update_order_status` | POST | Change workflow state |
| `cancel_order` | POST | Cancel order and free table |

---

### Workflow States

```
Draft → Submitted → To Bill → Billed → Completed
  ↓                    ↓
Cancelled         On Hold
```

**State Transitions**:
- **Draft**: Initial state, waiter building order
- **Submitted**: Order sent to kitchen (via Send to Kitchen)
- **To Bill**: Ready for payment processing
- **Billed**: Invoice generated by cashier
- **Completed**: Payment received, order closed
- **Cancelled**: Order cancelled
- **On Hold**: Temporary hold (rare)

---

### Kitchen Integration

#### **KOT (Kitchen Order Ticket)**

**Fields**:
```python
{
  "table": "T1",
  "floor": "MAIN",
  "pos_order": "POS-ORD-00001",
  "timestamp": "2026-01-20 14:30:00",
  "items": [
    {
      "item_name": "Ayam Bakar",
      "qty": 1,
      "notes": "Extra pedas",
      "kitchen": "Main Kitchen",
      "station": "Grill Station",
      "status": "Pending"
    }
  ]
}
```

**KOT Routing**:
```
Item → Check default_kitchen & default_kitchen_station
     → If not set, check Menu Category Routes
     → Route to appropriate kitchen/station
     → Show on Kitchen Display
     → Print on kitchen printer (if configured)
```

#### **Kitchen Display Updates**

Real-time updates via `frappe.publish_realtime`:
```javascript
// When order sent
Event: 'kot_created'
Data: {order, table, items, kitchen}

// When chef updates status
Event: 'item_status_updated'
Data: {item, status, timestamp}

// Waiter interface listens and updates UI
```

---

### Permissions & Roles

**Waiter Role**:
- ✅ Read: POS Order, Restaurant Table, Items
- ✅ Create: POS Order, KOT Ticket
- ✅ Update: POS Order (own orders only)
- ✅ Access: Table Display, Waiter Order page
- ❌ Cannot: Generate invoice, process payment, access cashier console

**Workflow Permissions**:
```python
Draft → Submitted: Waiter ✅
Submitted → To Bill: Waiter ✅
To Bill → Billed: Cashier only ❌
```

---

### Differences: Waiter vs Cashier

| Feature | Waiter Order | Cashier Console |
|---------|--------------|-----------------|
| **Purpose** | Take order from table | Process payment |
| **Access** | Table Display → Table | Direct console access |
| **Kitchen** | Send to Kitchen (KOT) | View kitchen status only |
| **Payment** | Cannot process | Full payment processing |
| **Invoice** | Cannot generate | Generate Sales Invoice |
| **Table** | Work with specific table | Work with any order |
| **Flow** | Table → Items → Kitchen | Order → Payment → Receipt |
| **Status** | Draft → To Bill | To Bill → Completed |

---

### Best Practices

✅ **DO:**
- Open session at start of every shift
- Count cash accurately for opening balance
- Record denominations for better tracking
- Close session and reconcile at end of shift
- Use consistent POS Profile per terminal
- **Choose ONE session method** and stick with it (don't mix)

❌ **DON'T:**
- Share session between multiple cashiers
- Leave session open overnight
- Skip cash counting
- Override session requirements without authorization
- Mix POS Session and Device Session methods

### Troubleshooting

**Q: Session check fails but I opened a session?**
- Verify session scope matches (User vs Device vs Profile)
- Check session status is "Open" not "Closed"
- Clear browser cache and refresh

**Q: Journal Entry creation fails?**
- Verify Restaurant Settings has cash accounts configured
- Check account types and posting rules
- Ensure company is set in user defaults

**Q: Can't open new session?**
- Check for existing active session
- Verify no locked sessions in cache
- Contact admin to clear `active_devices` cache

## Updating

To update the app to the latest version:

```bash
bench update
bench --site your-site.local migrate
bench build
```