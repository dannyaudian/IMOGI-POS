# 🏗️ IMOGI-POS Architecture

**System Type:** Custom POS System untuk ERPNext  
**Version:** v15 Compatible  
**Updated:** January 21, 2026  
**Architecture:** Domain-Driven Design (Restaurant/Counter/Devices/Shared)

## 🎯 Overview

**IMOGI-POS adalah CUSTOM POS SYSTEM**, bukan menggunakan POS bawaan ERPNext.

### ❌ Yang TIDAK Digunakan:
- ❌ ERPNext POS (Point of Sale page bawaan)
- ❌ POS Invoice bawaan
- ❌ POS UI bawaan ERPNext

### ✅ Yang Digunakan (Custom):
- ✅ **Custom Frontend** - Kiosk, Self Order, Cashier Console, Waiter App
- ✅ **Custom Backend API** - `imogi_pos.api.*`
- ✅ **Custom DocTypes** - POS Order, Restaurant Table, Kitchen Ticket, dll
- ✅ **Custom Workflows** - Order flow, payment, kitchen routing

### 🤝 Memanfaatkan Native ERPNext (Integration):
- ✅ **Pricing Rules** - Discount & promotional engine
- ✅ **CRM Module** - Lead, Customer, Opportunity tracking
- ✅ **Sales Invoice** - Final billing & accounting integration
- ✅ **Item & Price List** - Product catalog
- ✅ **Customer Groups** - Segmentation
- ✅ **Coupon Code** - Voucher validation

---

## 🏛️ Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CUSTOM FRONTEND LAYER                     │
├─────────────────────────────────────────────────────────────┤
│  Kiosk UI  │ Self Order │ Cashier Console │ Waiter App      │
│  (Custom)  │  (Custom)  │    (Custom)     │   (Custom)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  CUSTOM BACKEND API LAYER                    │
├─────────────────────────────────────────────────────────────┤
│  imogi_pos.api.orders    │ imogi_pos.api.customers          │
│  imogi_pos.api.items     │ imogi_pos.api.billing            │
│  imogi_pos.api.kot       │ imogi_pos.api.layout             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               CUSTOM BUSINESS LOGIC LAYER                    │
├─────────────────────────────────────────────────────────────┤
│  • POS Order Processing    │ • Kitchen Routing              │
│  • Table Management        │ • Queue System                 │
│  • Native Pricing Integration (NEW) ← connects here         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              NATIVE ERPNEXT FEATURES (Integration)           │
├─────────────────────────────────────────────────────────────┤
│  Pricing Rules │ CRM │ Sales Invoice │ Coupon │ Item        │
│   (Native)     │(Nat)│   (Native)    │ (Nat)  │ (Native)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Custom Components

### Directory Structure (New Architecture - January 2026)

```
www/
├── restaurant/          # Restaurant operations
│   ├── waiter/         # Unified POS (waiter + kiosk mode)
│   ├── kitchen/        # Kitchen Display System
│   ├── tables/         # Table layout display
│   └── self-order/     # Self-ordering system
├── counter/            # Counter operations
│   └── pos/            # Cashier console
├── devices/            # Device management
│   └── displays/       # Customer display
├── shared/             # Shared interfaces
│   ├── login/          # Authentication
│   ├── device-select/  # Device selector
│   └── service-select/ # Service selector
├── retail/             # Future: Retail domain (placeholder)
└── service/            # Future: Service domain (placeholder)
```

**Benefits of New Structure:**
- ✅ Clear separation by business domain
- ✅ Scalable for future features (Retail, Service)
- ✅ Backward compatible (old URLs redirect)
- ✅ Role-based access control integrated

### 1. Custom Frontend Interfaces

| Interface | Path | Purpose | Type |
|-----------|------|---------|------|
| **Kiosk** | `www/restaurant/waiter?mode=kiosk` | Self-service ordering terminal | Custom SPA |
| **Waiter App** | `www/restaurant/waiter` | Table service ordering | Custom SPA |
| **Self Order** | `www/restaurant/self-order` | QR code table ordering | Custom SPA |
| **Cashier Console** | `www/counter/pos` | Counter payment & checkout | Custom SPA |
| **Kitchen Display** | `www/restaurant/kitchen` | Kitchen order management | Custom SPA |
| **Table Display** | `www/restaurant/tables` | Table layout & status | Custom SPA |
| **Customer Display** | `www/devices/displays` | Secondary screen for customer | Custom SPA |
| **Login** | `www/shared/login` | Authentication page | Custom SPA |

**Technology Stack:**
- Custom JavaScript (no framework)
- Frappe.js client library
- Custom CSS (organized: core.css + modules)
- Real-time updates via Frappe Realtime
- **Role-based UI** - Dynamic rendering based on user roles
- **Centralized Authentication** - Unified auth decorators and helpers

### 2. Custom Backend APIs

Located in `imogi_pos/api/`:

```python
# Order Management (Custom)
imogi_pos.api.orders.create_order()
imogi_pos.api.orders.add_item_to_order()
imogi_pos.api.orders.update_order_status()
imogi_pos.api.orders.close_order()

# Customer Management (Custom + Native CRM)
imogi_pos.api.customers.quick_create_customer_with_contact()
imogi_pos.api.customers.search_customers()

# Billing (Custom → Native Invoice)
imogi_pos.api.billing.process_payment()
imogi_pos.billing.invoice_builder.build_sales_invoice_from_pos_order()

# Native Pricing Integration (NEW)
imogi_pos.api.native_pricing.get_applicable_pricing_rules()
imogi_pos.api.native_pricing.apply_pricing_rules_to_items()
imogi_pos.api.native_pricing.validate_coupon_code()

# Kitchen Operations (Custom)
imogi_pos.api.kot.create_kot()
imogi_pos.api.kot.update_kot_status()

# Table Management (Custom)
imogi_pos.api.layout.get_restaurant_layout()
imogi_pos.api.layout.update_table_status()

# Authentication & Authorization (NEW - January 2026)
imogi_pos.utils.auth_decorators.require_roles()
imogi_pos.utils.auth_decorators.allow_guest_if_configured()
imogi_pos.utils.auth_helpers.get_user_role_context()
imogi_pos.utils.auth_helpers.get_role_based_default_route()
```

**New Architecture Features:**
- ✅ **Centralized Auth** - Reusable decorators for role-based access
- ✅ **Guest Access** - Configurable guest mode for kiosk and self-order
- ✅ **Role-based Routing** - Automatic redirect based on user roles
- ✅ **POS Profile Validation** - Ensure user has proper POS setup

### 3. Custom DocTypes

**Core POS:**
- `POS Order` - Main order document (custom)
- `POS Order Item` - Order line items
- `POS Modifier` - Item modifications
- `POS Opening Balance` - Cashier session opening
- `POS Closing Balance` - Cashier session closing

**Restaurant:**
- `Restaurant Table` - Table management
- `Restaurant Layout` - Floor plan
- `Kitchen Order Ticket` - KOT tracking
- `Queue Number` - Queue system

**Configuration:**
- `POS Profile` - Device/outlet settings (custom fields added)
- `Branch` - Multi-outlet support

---

## 🔌 Native ERPNext Integration Points

### 1. Pricing Rules (✅ Integrated)

**How it works:**
```
Custom POS Order → Apply Native Pricing Rules → Discounted Items
                  ↓
            imogi_pos.api.native_pricing.apply_pricing_rules_to_items()
                  ↓
         erpnext.accounts.doctype.pricing_rule.pricing_rule.get_pricing_rules()
```

**Integration Points:**
- `billing/invoice_builder.py` → Set `ignore_pricing_rule = 0`
- `api/orders.py` → Apply rules on `create_order()` and `add_item_to_order()`
- `api/native_pricing.py` → Wrapper functions for native ERPNext pricing

**Pricing Rule Types Supported:**
- ✅ Discount Percentage
- ✅ Discount Amount
- ✅ Special Price
- ✅ Buy X Get Y Free
- ✅ Quantity-based discounts
- ✅ Customer Group discounts
- ✅ Time-based promotions (Happy Hour)

### 2. CRM Integration (✅ Integrated)

**How it works:**
```
Customer Creation in POS → Create Lead first → Convert to Customer
                          ↓
                 imogi_pos.api.customers.quick_create_customer_with_contact()
                          ↓
                  frappe.get_doc("Lead").insert()
                          ↓
                  frappe.get_doc("Customer").insert()
```

**Integration Points:**
- `api/customers.py` → Create Lead before Customer
- `api/native_pricing.py` → Functions to link Customer ↔ Lead ↔ Opportunity

**CRM Features Available:**
- ✅ Lead tracking from POS
- ✅ Lead to Customer conversion
- ✅ Opportunity creation from orders
- ✅ Customer journey analytics

### 3. Sales Invoice (✅ Integrated)

**How it works:**
```
POS Order (Custom) → Build Invoice → Sales Invoice (Native ERPNext)
                    ↓
        imogi_pos.billing.invoice_builder.build_sales_invoice_from_pos_order()
                    ↓
                frappe.get_doc("Sales Invoice")
                    ↓
                Native ERPNext Accounting
```

**Integration Points:**
- `billing/invoice_builder.py` → Create Sales Invoice with `is_pos=1`
- Native accounting entries created automatically
- Payment reconciliation via native Payment Entry

### 4. Coupon Code (✅ Integrated)

**How it works:**
```
Apply Coupon in POS → Validate via Native → Discount Applied
                     ↓
         imogi_pos.api.native_pricing.validate_coupon_code()
                     ↓
         erpnext.accounts.doctype.pricing_rule.utils.validate_coupon_code()
```

---

## 🔄 Data Flow Example

### Order Creation Flow:

```
1. USER ACTION (Custom Frontend)
   Kiosk UI: User adds "Coffee Latte" to cart
   
2. API CALL (Custom Backend)
   POST imogi_pos.api.orders.add_item_to_order({
       pos_order: "POS-ORD-2026-00123",
       item_code: "COFFEE-LATTE",
       qty: 2
   })
   
3. NATIVE PRICING (Integration Layer)
   ↓ Check applicable pricing rules
   ↓ "Happy Hour 20% Off" rule found
   ↓ Apply discount: ₹100 → ₹80
   
4. SAVE TO DATABASE (Custom DocType)
   POS Order Item:
   - item_code: COFFEE-LATTE
   - qty: 2
   - rate: 100
   - discount_percentage: 20  ← from native rule
   - amount: 80
   
5. INVOICE CREATION (Custom → Native)
   imogi_pos.billing.invoice_builder()
   ↓ Build Sales Invoice (native DocType)
   ↓ ignore_pricing_rule = 0 (apply rules again)
   ↓ Submit invoice
   
6. ACCOUNTING (Native ERPNext)
   GL Entries created automatically
   Payment Entry linked
   Reports updated
```

---

## 🎯 Why This Architecture?

### Custom POS Benefits:
- ✅ **Flexibility** - UI/UX designed for specific use cases (Kiosk vs Waiter)
- ✅ **Performance** - Optimized for high-volume transactions
- ✅ **Features** - Restaurant-specific (KOT, table management, queue)
- ✅ **Branding** - White-label capable per outlet

### Native Integration Benefits:
- ✅ **Less Code** - Don't reinvent pricing rules & CRM
- ✅ **ERPNext Ecosystem** - Compatible with standard reports & workflows
- ✅ **Upgradability** - Leverage future ERPNext enhancements
- ✅ **Standardization** - Use industry-standard features

### Best of Both Worlds:
**Custom where it matters** (POS UX, Restaurant features)  
**Native where it exists** (Pricing, CRM, Accounting)

---

## 📊 Module Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                         CUSTOM ZONE                          │
│  • POS UIs (Kiosk, Self Order, Cashier, Waiter)            │
│  • POS Order DocType & workflows                            │
│  • Kitchen Order Tickets (KOT)                              │
│  • Restaurant Table Management                              │
│  • Queue System                                             │
│  • Custom order flow & state management                     │
│  • Multi-device session handling                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      INTEGRATION ZONE                        │
│  • Native Pricing Rules wrapper (api/native_pricing.py)    │
│  • CRM Lead integration (api/customers.py)                  │
│  • Invoice builder (billing/invoice_builder.py)            │
│  • Coupon code validation                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                         NATIVE ZONE                          │
│  • Pricing Rules (erpnext.accounts)                         │
│  • CRM Module (erpnext.crm)                                 │
│  • Sales Invoice (erpnext.accounts)                         │
│  • Payment Entry                                            │
│  • Item & Price List                                        │
│  • Customer & Customer Group                                │
│  • GL Entries & Accounting                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Permission Model

**Custom POS:**
- POS Manager - Full access to POS operations
- POS Cashier - Limited to own session
- Kitchen User - KOT access only
- Waiter - Order creation only

**Native ERPNext:**
- Uses standard ERPNext role permissions
- Sales Invoice → Accounts Manager
- Pricing Rules → System Manager
- CRM → Sales Manager

---

## 🚀 Deployment Considerations

### Custom Components:
- Deploy via `bench get-app imogi_pos`
- Custom fixtures installed on setup
- Custom pages organized by business domain:
  - **Restaurant:** `/restaurant/waiter`, `/restaurant/kitchen`, `/restaurant/tables`, `/restaurant/self-order`
  - **Counter:** `/counter/pos`
  - **Devices:** `/devices/displays`
  - **Shared:** `/shared/login`
- Backward-compatible redirects from old URLs

### Workspace Hierarchy:
- **IMOGI POS** (Parent Workspace)
  - Table Service (Child)
  - Kitchen Ops (Child)
  - Cashier Ops (Child)

### Native Features:
- No additional deployment needed
- Configure via ERPNext UI:
  - Setup → Pricing Rule
  - CRM → Lead, Customer
  - Accounts → Sales Invoice

### Database:
- Custom tables: `tabPOS Order`, `tabRestaurant Table`, etc.
- Native tables: `tabSales Invoice`, `tabPricing Rule`, etc.
- No custom fields on core doctypes (minimal customization)

---

## 📚 Related Documentation

- [README.md](./README.md) - Project overview
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Latest architecture changes (January 2026)
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick reference guide for new structure
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing checklist
- [DEPLOYMENT_QUICK_START.md](./DEPLOYMENT_QUICK_START.md) - Deployment guide
- [NATIVE_INTEGRATION.md](./NATIVE_INTEGRATION.md) - Native feature setup guide
- [INTEGRATION_STATUS.md](./INTEGRATION_STATUS.md) - Current integration status
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Full deployment instructions
- [www/README.md](./imogi_pos/www/README.md) - WWW directory structure

---

**Summary:**  
IMOGI-POS = **Custom POS** (UI, API, DocTypes) + **Native ERPNext** (Pricing, CRM, Accounting)

**Architecture Update:** January 2026 - Reorganized by business domain with centralized authentication and role-based UI rendering.
