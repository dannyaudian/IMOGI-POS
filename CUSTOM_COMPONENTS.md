# 🔧 IMOGI-POS Custom Components

**Updated:** January 20, 2026  
**Overview:** Daftar lengkap custom components (DocTypes, Pages, Web Pages) yang ada di IMOGI-POS

---

## 📁 Struktur Custom Components

### 1. **Custom Fields di Native ERPNext DocTypes**
**Location:** `imogi_pos/fixtures/custom_field.json`

Custom fields yang ditambahkan ke DocType bawaan ERPNext:

#### Customer (Native ERPNext)
- ✅ `lead_name` - Link ke Lead (CRM integration) **[NEW]**
- `customer_identification` - Berkeluarga/Tidak Berkeluarga
- `customer_age` - Age Range

#### POS Profile (Native ERPNext)
- `imogi_pos_domain` - Restaurant/Retail/Service
- `imogi_mode` - Table/Counter/Kiosk/Self-Order
- `imogi_branch` - Link to Branch
- `imogi_use_table_display` - Enable table display
- `imogi_enable_kot` - Enable KOT
- `imogi_default_floor` - Default Restaurant Floor
- `imogi_default_layout_profile` - Default Table Layout
- **+ 20+ more branding & config fields**

#### Sales Invoice (Native ERPNext)
- `customer_full_name` - Full name for reporting
- `customer_gender` - Male/Female/Other
- `customer_phone` - Phone number
- `customer_age` - Age range
- `customer_identification` - Family status

#### Item (Native ERPNext)
- `pos_menu_profile` - Link to POS Menu Profile
- `is_native_variant` - Flag for native variants

#### Price List (Native ERPNext)
- `imogi_price_adjustment` - Flat markup/discount

#### Sales Invoice Item (Native ERPNext)
- `pos_customizations` - JSON for item customizations
- `pos_customizations_delta` - Customization price delta
- `pos_display_details` - Display format

---

## 🗃️ Custom DocTypes

**Location:** `imogi_pos/imogi_pos/doctype/`

### POS Core

#### POS Order
**File:** `doctype/pos_order/pos_order.json`  
**Purpose:** Main order document (custom, tidak pakai POS bawaan ERPNext)

**Key Fields:**
- `branch` - Branch (Link)
- `table` - Restaurant Table (Link)
- `floor` - Restaurant Floor
- `order_type` - Dine-in/Takeaway/Kiosk/POS
- `pos_profile` - POS Profile (Link)
- `customer` - Customer (Link)
- `customer_full_name`, `customer_gender`, `customer_phone`, `customer_age`
- `workflow_state` - Order status
- `sales_invoice` - Link to Sales Invoice
- `queue_number` - Queue number
- `items` - Child table (POS Order Item)
- `subtotal`, `totals`
- `notes`

#### POS Order Item
**File:** `doctype/pos_order_item/pos_order_item.json`  
**Purpose:** Order line items (child table)

**Key Fields:**
- `item` - Item (Link)
- `qty` - Quantity (Float)
- `rate` - Rate (Currency)
- ✅ `pricing_rule` - Pricing Rule Applied (Link) **[NEW]**
- ✅ `discount_percentage` - Discount % (Percent) **[NEW]**
- ✅ `discount_amount` - Discount Amount (Currency) **[NEW]**
- `amount` - Total amount (Currency, read-only)
- `notes` - Special instructions
- `item_options` - JSON for options/modifiers
- `options_display` - Display format
- `kitchen` - Kitchen (Link)
- `kitchen_station` - Kitchen Station (Link)
- `counters` - JSON for state timestamps
- `last_edited_by` - User tracking

### Restaurant Management

#### Restaurant Table
**File:** `doctype/restaurant_table/`  
**Purpose:** Table management

**Features:**
- Table status (Available/Occupied/Reserved)
- Floor association
- QR code generation
- Capacity tracking

#### Restaurant Floor
**File:** `doctype/restaurant_floor/`  
**Purpose:** Floor/area management

**Features:**
- Multiple floors per branch
- Table grouping
- Layout profiles

#### Table Layout Profile
**File:** `doctype/table_layout_profile/`  
**Purpose:** Visual floor plan

**Features:**
- Drag & drop table positioning
- Custom layouts per floor
- JSON-based layout storage

#### Table Layout Node
**File:** `doctype/table_layout_node/`  
**Purpose:** Individual table position in layout

### Kitchen Operations

#### KOT Ticket (Kitchen Order Ticket)
**File:** `doctype/kot_ticket/`  
**Purpose:** Kitchen order tracking

**Features:**
- Order item routing to kitchen
- Status tracking (New/Preparing/Ready/Served)
- Priority management
- Kitchen station assignment

#### KOT Item
**File:** `doctype/kot_item/`  
**Purpose:** Individual items in KOT

#### Kitchen
**File:** `doctype/kitchen/`  
**Purpose:** Kitchen configuration

#### Kitchen Station
**File:** `doctype/kitchen_station/`  
**Purpose:** Specific stations within kitchen (Grill, Fry, etc.)

#### KOT Reprint Log
**File:** `doctype/kot_reprint_log/`  
**Purpose:** Audit trail for KOT reprints

### Device Management

#### Kiosk Device
**File:** `doctype/kiosk_device/`  
**Purpose:** Self-service kiosk configuration

#### Kiosk Profile
**File:** `doctype/kiosk_profile/`  
**Purpose:** Kiosk behavior settings

#### Cashier Device Session
**File:** `doctype/cashier_device_session/`  
**Purpose:** Cashier session tracking

**Features:**
- Opening balance
- Closing balance
- Transaction history
- Cash reconciliation

#### Customer Display Device
**File:** `doctype/customer_display_device/`  
**Purpose:** Secondary customer-facing display

#### Customer Display Profile
**File:** `doctype/customer_display_profile/`  
**Purpose:** Customer display configuration

#### Self Order Session
**File:** `doctype/self_order_session/`  
**Purpose:** QR-based self ordering session

### Menu & Customization

#### POS Menu Profile
**File:** `doctype/pos_menu_profile/`  
**Purpose:** Menu grouping and organization

#### POS Menu Group
**File:** `doctype/pos_menu_group/`  
**Purpose:** Menu categories

#### POS Menu Option
**File:** `doctype/pos_menu_option/`  
**Purpose:** Item modifiers (Size, Add-ons, etc.)

#### POS Profile Group
**File:** `doctype/pos_profile_group/`  
**Purpose:** Group multiple POS Profiles

### Configuration

#### Restaurant Settings
**File:** `doctype/restaurant_settings/`  
**Purpose:** Global restaurant POS settings

#### Brand Profile
**File:** `doctype/brand_profile/`  
**Purpose:** Multi-brand branding configuration

#### Restaurant Menu Category Route
**File:** `doctype/restaurant_menu_category_route/`  
**Purpose:** Menu navigation routing

---

## 📄 Custom Pages (Frappe Desk Pages)

**Location:** `imogi_pos/imogi_pos/page/`

Desk pages yang accessible via `/app/page-name`:

| Page | File | Purpose |
|------|------|---------|
| **Waiter Order** | `page/waiter_order/` | Waiter ordering interface (desk page) |
| **Table Display** | `page/table_display/` | Restaurant table overview dashboard |
| **Kitchen Display** | `page/kitchen_display/` | Kitchen display system (KDS) |
| **Table Layout Editor** | `page/table_layout_editor/` | Visual editor for floor plans |
| **Customer Display** | `page/customer_display/` | Customer-facing display page |
| **Customer Display Editor** | `page/customer_display_editor/` | Configure customer display |

---

## 🌐 Custom Web Pages (Public/Portal Pages)

**Location:** `imogi_pos/www/`

Web pages yang accessible via `/page-name`:

| Page | Directory | Purpose | URL |
|------|-----------|---------|-----|
| **Kiosk** | `www/kiosk/` | Self-service kiosk interface | `/kiosk` |
| **Self Order** | `www/so/` | QR code self-ordering | `/so` |
| **Create Order** | `www/create-order/` | Waiter tablet ordering | `/create-order` |
| **Cashier Console** | `www/cashier-console/` | Cashier POS terminal | `/cashier-console` |
| **Waiter Order** | `www/waiter_order/` | Waiter ordering app | `/waiter_order` |
| **Customer Display** | `www/customer-display/` | Customer-facing screen | `/customer-display` |
| **Kitchen Display** | `www/kitchen_display/` | Kitchen display (web version) | `/kitchen_display` |
| **Table Display** | `www/table_display/` | Table status dashboard | `/table_display` |
| **Opening Balance** | `www/opening-balance/` | Cashier session opening | `/opening-balance` |
| **Device Select** | `www/device-select/` | Device registration | `/device-select` |
| **Service Select** | `www/service-select/` | Service type selection | `/service-select` |
| **IMOGI Login** | `www/imogi-login/` | Custom login page | `/imogi-login` |
| **Table Layout Editor** | `www/table_layout_editor/` | Floor plan editor (web) | `/table_layout_editor` |
| **Customer Display Editor** | `www/customer_display_editor/` | Display config editor | `/customer_display_editor` |

### Web Page Structure:
Each web page contains:
- `index.html` - Template
- `index.js` - JavaScript logic (Custom, bukan framework)
- `index.py` - Server-side controller

---

## 🔌 Integration dengan Native ERPNext

### Native DocTypes yang Digunakan:

| Native DocType | Usage in IMOGI-POS |
|----------------|---------------------|
| **Customer** | Customer management + custom fields |
| **Lead** | CRM integration (created before Customer) |
| **Sales Invoice** | Final billing + custom fields |
| **Item** | Product catalog + custom fields |
| **Item Price** | Pricing + real-time updates |
| **Price List** | Price list management |
| **Pricing Rule** | Native discount & promo engine ✅ |
| **Coupon Code** | Voucher validation |
| **POS Profile** | Device config + custom fields |
| **Branch** | Multi-outlet support |
| **Payment Entry** | Payment reconciliation |

### Custom API yang Memanggil Native:

```python
# CRM Integration
imogi_pos.api.customers.quick_create_customer_with_contact()
  → Creates Lead (native)
  → Creates Customer (native) with lead_name link
  → Creates Contact (native)

# Pricing Integration
imogi_pos.api.native_pricing.get_applicable_pricing_rules()
  → Calls erpnext.accounts.doctype.pricing_rule.*
  
imogi_pos.api.native_pricing.apply_pricing_rules_to_items()
  → Applies native pricing rules to cart

# Billing Integration
imogi_pos.billing.invoice_builder.build_sales_invoice_from_pos_order()
  → Creates Sales Invoice (native) from POS Order (custom)
  → Sets ignore_pricing_rule = 0 (enable native rules)
```

---

## 📊 Summary

### Custom Components Count:

- **Custom Fields (Native DocTypes):** ~40+ fields across 8 DocTypes
- **Custom DocTypes:** 28 DocTypes
- **Custom Pages (Desk):** 6 pages
- **Custom Web Pages:** 14 pages
- **Custom APIs:** 40+ API endpoints (`imogi_pos/api/*.py`)

### Architecture:
```
Custom Frontend (14 web pages + 6 desk pages)
        ↓
Custom Backend API (imogi_pos/api/*)
        ↓
Custom Business Logic (28 custom DocTypes)
        ↓
Native ERPNext Integration (Pricing, CRM, Billing)
```

---

## ✅ Yang Sudah Lengkap:

✅ **Custom Fields** - Untuk native ERPNext DocTypes  
✅ **Custom DocTypes** - 28 DocTypes untuk POS, Restaurant, Kitchen  
✅ **Custom Pages** - 6 desk pages untuk admin/staff  
✅ **Custom Web Pages** - 14 web interfaces untuk berbagai use cases  
✅ **Native Integration** - Pricing Rules, CRM, Sales Invoice  
✅ **Field untuk Native Integration:**
- `Customer.lead_name` - Link to Lead (CRM) ✅ **ADDED**
- `POS Order Item.pricing_rule` - Pricing Rule tracking ✅ **ADDED**
- `POS Order Item.discount_percentage` - Discount % ✅ **ADDED**
- `POS Order Item.discount_amount` - Discount amount ✅ **ADDED**

---

**Status:** 🟢 **All Components Available**  
**Next Step:** Install via `bench install-app imogi_pos` untuk apply fixtures & DocTypes
