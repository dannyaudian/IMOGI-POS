# POS Order Discount Fields Migration Guide

**Purpose:** Guide untuk menambahkan discount fields ke POS Order DocType (opsional)

---

## Background

Saat ini, code di `billing.py` sudah prepared untuk handle discount fields:
- `discount_percent`
- `discount_amount`
- `promo_code`

Namun fields ini **belum ada** di POS Order DocType, sehingga query akan error jika mencoba fetch fields tersebut dari database.

**Current Status (2026-01-26):**
- ✅ Code menggunakan `getattr(order_doc, "discount_percent", None)` - aman, tidak error
- ❌ Query `frappe.get_all(..., fields=["discount_percent"])` - akan error 500

**Fix Applied:**
- Fields dihapus dari `frappe.get_all()` query di `list_orders_for_cashier()`
- Tetap bisa diakses via `getattr()` jika di masa depan fields ditambahkan

---

## Migration Steps (If Needed)

### Step 1: Add Fields to POS Order DocType

#### Via Frappe Desk:
1. Login ke Frappe Desk
2. Go to: **Customize Form** > DocType: **POS Order**
3. Add fields di section **Totals** (setelah `pb1_amount`, sebelum `totals`):

**Field 1: Discount Percent**
```
Field Name: discount_percent
Label: Discount %
Field Type: Percent
Precision: 2
Default: 0
```

**Field 2: Discount Amount**
```
Field Name: discount_amount
Label: Discount Amount
Field Type: Currency
Precision: 2
Default: 0
Read Only: 1
Depends On: eval:doc.discount_percent > 0
```

**Field 3: Promo Code**
```
Field Name: promo_code
Label: Promo Code
Field Type: Data
Length: 100
```

#### Update field_order:
```json
"field_order": [
  "branch",
  "table",
  // ... existing fields ...
  "section_break_13",
  "subtotal",
  "pb1_amount",
  "discount_percent",     // NEW
  "discount_amount",      // NEW
  "promo_code",          // NEW
  "totals",
  // ... rest ...
]
```

4. **Save** the customization

---

### Step 2: Export DocType JSON (Recommended)

After customizing, export untuk version control:

```bash
bench --site [sitename] export-doc "DocType" "POS Order" --force
```

File akan tersimpan di:
```
imogi_pos/imogi_pos/doctype/pos_order/pos_order.json
```

Commit ke git:
```bash
git add imogi_pos/imogi_pos/doctype/pos_order/pos_order.json
git commit -m "feat: add discount fields to POS Order"
```

---

### Step 3: Run Migration

```bash
# Migrate database schema
bench --site [sitename] migrate

# Clear cache
bench --site [sitename] clear-cache
bench --site [sitename] clear-website-cache

# Restart bench
bench restart
```

Verify migration success:
```bash
bench --site [sitename] console
```
```python
# Check if fields exist
doc = frappe.get_doc("POS Order", {"workflow_state": "Draft"}, limit=1)
print(hasattr(doc, 'discount_percent'))  # Should be True
print(hasattr(doc, 'discount_amount'))   # Should be True
print(hasattr(doc, 'promo_code'))        # Should be True
```

---

### Step 4: Update billing.py (Restore Fields in Query)

**File:** `imogi_pos/api/billing.py`

**Function:** `list_orders_for_cashier()`

**Restore fields:**
```python
# Line ~1155
orders = frappe.get_all(
    "POS Order",
    filters=filters,
    fields=[
        "name",
        "customer",
        "order_type",
        "table",
        "queue_number",
        "workflow_state",
        "discount_percent",      # ✅ NOW SAFE
        "discount_amount",       # ✅ NOW SAFE
        "promo_code",           # ✅ NOW SAFE
        "totals",
        "creation",
    ],
    order_by="creation desc",
)
```

---

### Step 5: Test End-to-End

#### Backend Test:
```bash
bench --site [sitename] console
```
```python
import frappe

# Test 1: Create POS Order with discount
order = frappe.get_doc({
    "doctype": "POS Order",
    "branch": "Main Branch",
    "order_type": "Dine-in",
    "pos_profile": "Main POS",
    "discount_percent": 10,
    "promo_code": "WELCOME10",
    "items": [{
        "item": "Test Item",
        "qty": 1,
        "rate": 100
    }]
})
order.insert()
print(f"Created: {order.name}")
print(f"Discount %: {order.discount_percent}")
print(f"Promo: {order.promo_code}")

# Test 2: Query orders with discount fields
from imogi_pos.api.billing import list_orders_for_cashier
orders = list_orders_for_cashier(branch="Main Branch")
print(f"Found {len(orders)} orders")
if orders:
    print(f"First order discount: {orders[0].get('discount_percent')}%")
```

#### Frontend Test:
```javascript
// Browser console
fetch('/api/method/imogi_pos.api.billing.list_orders_for_cashier', {
  method: 'POST',
  credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({branch: 'Main Branch'})
})
  .then(r => r.json())
  .then(d => {
    console.log('Orders:', d.message)
    if (d.message.length > 0) {
      console.log('Sample order:', d.message[0])
      console.log('Has discount_percent?', 'discount_percent' in d.message[0])
    }
  })
```

Expected:
- ✅ No 500 error
- ✅ Orders returned with `discount_percent`, `discount_amount`, `promo_code` fields
- ✅ Values are correct (0 or actual discount)

---

## Calculation Logic (Reference)

Jika implementasi discount di UI, logic yang biasa dipakai:

### Server-side (Python):
```python
def calculate_discount(order_doc):
    """Calculate discount for POS Order"""
    subtotal = order_doc.subtotal or 0
    
    # Discount percent has priority
    if order_doc.discount_percent:
        discount_amount = (subtotal * order_doc.discount_percent) / 100
        order_doc.discount_amount = discount_amount
    # Manual discount amount
    elif order_doc.discount_amount:
        pass  # Already set
    else:
        order_doc.discount_amount = 0
    
    # Apply to totals
    order_doc.totals = subtotal - order_doc.discount_amount + (order_doc.pb1_amount or 0)
    
    return order_doc
```

Hook in POS Order doctype:
```python
# imogi_pos/imogi_pos/doctype/pos_order/pos_order.py

def validate(self):
    """Called before save"""
    self.calculate_totals()

def calculate_totals(self):
    """Calculate order totals with discount"""
    # Calculate subtotal from items
    self.subtotal = sum(item.amount for item in self.items)
    
    # Calculate discount
    if self.discount_percent:
        self.discount_amount = (self.subtotal * self.discount_percent) / 100
    
    # Calculate PB1 (tax)
    self.pb1_amount = self.subtotal * 0.10  # Example: 10% tax
    
    # Final total
    self.totals = self.subtotal - (self.discount_amount or 0) + self.pb1_amount
```

### Client-side (JavaScript):
```javascript
function calculateOrderTotal(order) {
  const subtotal = order.items.reduce((sum, item) => sum + item.amount, 0)
  
  let discountAmount = 0
  if (order.discount_percent) {
    discountAmount = (subtotal * order.discount_percent) / 100
  } else if (order.discount_amount) {
    discountAmount = order.discount_amount
  }
  
  const pb1Amount = subtotal * 0.10  // 10% tax
  const total = subtotal - discountAmount + pb1Amount
  
  return {
    subtotal,
    discountAmount,
    pb1Amount,
    total
  }
}
```

---

## Promo Code Integration (Optional)

Jika mau validasi promo code:

### Create Promo Code DocType:
```json
{
  "doctype": "DocType",
  "name": "Promo Code",
  "fields": [
    {"fieldname": "code", "fieldtype": "Data", "label": "Code", "unique": 1},
    {"fieldname": "discount_percent", "fieldtype": "Percent", "label": "Discount %"},
    {"fieldname": "valid_from", "fieldtype": "Date", "label": "Valid From"},
    {"fieldname": "valid_to", "fieldtype": "Date", "label": "Valid To"},
    {"fieldname": "max_uses", "fieldtype": "Int", "label": "Max Uses"},
    {"fieldname": "used_count", "fieldtype": "Int", "label": "Used Count", "read_only": 1}
  ]
}
```

### Validation Function:
```python
@frappe.whitelist()
def validate_promo_code(code, order_total=0):
    """Validate and apply promo code"""
    promo = frappe.get_doc("Promo Code", code)
    
    # Check validity
    from frappe.utils import today, getdate
    if promo.valid_from and getdate(promo.valid_from) > getdate(today()):
        frappe.throw("Promo code not yet valid")
    if promo.valid_to and getdate(promo.valid_to) < getdate(today()):
        frappe.throw("Promo code expired")
    if promo.max_uses and promo.used_count >= promo.max_uses:
        frappe.throw("Promo code usage limit reached")
    
    # Calculate discount
    discount_amount = (order_total * promo.discount_percent) / 100
    
    return {
        "valid": True,
        "discount_percent": promo.discount_percent,
        "discount_amount": discount_amount
    }
```

---

## Rollback Plan

Jika setelah migration ada masalah:

### 1. Quick Rollback (Remove from Query Only):
```python
# In billing.py, remove fields from query again
fields=[
    "name",
    "customer",
    # ... 
    # "discount_percent",   # Comment out
    # "discount_amount",
    # "promo_code",
    "totals",
]
```

### 2. Full Rollback (Remove Fields from DocType):
```bash
# Via Frappe Desk:
# Customize Form > POS Order > Remove fields > Save

# Via bench console:
bench --site [sitename] console
```
```python
doc = frappe.get_doc("DocType", "POS Order")
doc.fields = [f for f in doc.fields if f.fieldname not in ['discount_percent', 'discount_amount', 'promo_code']]
doc.save()

# Then migrate
import frappe
frappe.db.commit()
```

```bash
bench --site [sitename] migrate
bench restart
```

---

## Checklist

Before migration:
- [ ] Backup database: `bench --site [sitename] backup`
- [ ] Confirm no active orders being processed
- [ ] Test in staging/dev environment first

During migration:
- [ ] Add fields to DocType
- [ ] Export DocType JSON
- [ ] Run migrate command
- [ ] Verify fields exist in DB
- [ ] Update billing.py query

After migration:
- [ ] Test API endpoint (no 500 errors)
- [ ] Test frontend order list (fields appear)
- [ ] Test creating order with discount
- [ ] Test invoice generation with discount
- [ ] Monitor error logs for 24h

---

## Questions?

- **Q: Apa impact jika tidak migrate?**  
  A: Code tetap jalan, tapi discount fields akan selalu `None`. Order tanpa discount tetap OK.

- **Q: Apa harus migrate sekarang?**  
  A: Tidak urgent. Migrate hanya jika mau implement fitur discount/promo.

- **Q: Apa impact ke existing orders?**  
  A: Existing orders akan punya `discount_percent=0`, `discount_amount=0`, `promo_code=null`. Tidak ada data loss.

- **Q: Apa bisa partial implementation (discount_percent saja)?**  
  A: Bisa, tapi disarankan add semua 3 fields sekaligus agar konsisten dengan code.

---

**Last Updated:** 2026-01-26  
**See Also:** 
- AUTHORIZATION_FIX_SUMMARY.md
- imogi_pos/imogi_pos/doctype/pos_order/pos_order.json
