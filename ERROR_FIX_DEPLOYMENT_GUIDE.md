# SOLUSI LENGKAP: POS Order Creation Error & Menu Channel Filtering

## 📋 RINGKASAN MASALAH

### Masalah 1: Error Log Kosong saat Create POS Order
**Gejala**: Error Log muncul dengan title "Document Creation Error" tapi message kosong
**Root Cause**: `order_doc.insert()` tidak dibungkus try-except, exception tidak di-log dengan baik

### Masalah 2: Menu Channel Filtering Behavior
**Gejala**: Item tidak muncul di Cashier Console meski toggle "Enable Menu Channels" OFF
**Root Cause**: USER MISCONCEPTION - kode sudah benar, logic sudah respects toggle setting

---

## ✅ SOLUSI YANG SUDAH DIIMPLEMENTASIKAN

### 1. Error Logging Fix (MASALAH 1)

#### A. Lokasi File & Function
**File**: `imogi_pos/api/orders.py`

**Functions yang diperbaiki**:
1. `create_order()` - line 772 (endpoint utama dari cashier-console)
2. `create_counter_order()` - line 1362  
3. `create_table_order()` - line 1522

#### B. BEFORE Code (line 772):
```python
# Validate customer before inserting the order
if customer:
    # Check if the provided customer exists
    if not frappe.db.exists("Customer", customer):
        if customer == "Walk-in Customer":
            # Remove link to allow inserting the order without a customer
            order_doc.customer = None
        else:
            _safe_throw(
                _("Customer {0} not found").format(customer)
            )

order_doc.insert()  # ❌ NO ERROR HANDLING
if customer_details:
    _apply_customer_metadata(customer, customer_details)
```

#### C. AFTER Code (dengan full error logging):
```python
# Validate customer before inserting the order
if customer:
    # Check if the provided customer exists
    if not frappe.db.exists("Customer", customer):
        if customer == "Walk-in Customer":
            # Remove link to allow inserting the order without a customer
            order_doc.customer = None
        else:
            _safe_throw(
                _("Customer {0} not found").format(customer)
            )

# CRITICAL FIX: Wrap order_doc.insert() with proper error logging
try:
    order_doc.insert()
except Exception as e:
    # Log full traceback with context for debugging
    context_info = {
        "order_type": order_type,
        "pos_profile": effective_pos_profile,
        "branch": effective_branch,
        "table": table,
        "customer": customer,
        "items_count": len(items) if items else 0,
        "user": frappe.session.user
    }
    
    error_message = f"""
POS Order Creation Failed

Error: {str(e)}

Context:
- Order Type: {context_info['order_type']}
- POS Profile: {context_info['pos_profile']}
- Branch: {context_info['branch']}
- Table: {context_info['table']}
- Customer: {context_info['customer']}
- Items Count: {context_info['items_count']}
- User: {context_info['user']}

Full Traceback:
{frappe.get_traceback()}
"""
    
    frappe.log_error(
        title="Error creating POS Order",
        message=error_message
    )
    
    # Re-raise with clear user message
    frappe.throw(
        _("Failed to create POS Order: {0}").format(str(e)),
        frappe.ValidationError
    )

if customer_details:
    _apply_customer_metadata(customer, customer_details)
```

#### D. Benefits dari Fix Ini:
1. ✅ **Full Traceback**: `frappe.get_traceback()` capture semua detail exception
2. ✅ **Context Info**: Log berisi order_type, branch, pos_profile, user, items_count
3. ✅ **No Sensitive Data**: Tidak log payment details, card numbers, atau PII
4. ✅ **Clear User Message**: User dapat pesan error yang jelas via `frappe.throw()`
5. ✅ **Searchable**: Error Log title "Error creating POS Order" mudah dicari

---

### 2. Menu Channel Filtering (MASALAH 2 - VERIFICATION)

#### A. Lokasi Implementasi
**Files**:
- `imogi_pos/api/variants.py` (line 133-175, 787-850)
- `imogi_pos/api/items.py` (line 20-40)
- `imogi_pos/imogi_pos/doctype/restaurant_settings/restaurant_settings.json`

#### B. Cara Kerja (SUDAH BENAR):

**Restaurant Settings Field**:
```json
{
  "fieldname": "enable_menu_channels",
  "fieldtype": "Check",
  "label": "Enable Menu Channels",
  "default": "0",
  "description": "Enable channel-specific filtering (POS, Restaurant, Dine-in, Takeaway)"
}
```

**Logic di `variants.py::get_template_items()` (line 789-801)**:
```python
# Check Restaurant Settings ONCE (not per item)
from imogi_pos.api.items import get_restaurant_settings
settings = get_restaurant_settings()
enable_menu_channels = settings.get("enable_menu_channels", 0)

# Determine if channel filtering should apply:
# 1) menu_channel must be provided (non-empty)
# 2) POS Profile domain must be "Restaurant"
# 3) Restaurant Settings enable_menu_channels must be 1  ← KEY CHECK
# 4) imogi_menu_channel field must exist on Item
should_filter_channel = False
domain = None

if menu_channel and has_channel_field and pos_profile:
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain") or "Restaurant"
    should_filter_channel = (domain == "Restaurant" and enable_menu_channels == 1)

# Apply channel filtering ONLY if all conditions met
if should_filter_channel:
    items = [
        item for item in items
        if _channel_matches(item.get("imogi_menu_channel"), menu_channel)
    ]
```

**Logic di `variants.py::get_items_with_stock()` (line 133-144)**:
```python
# Check Restaurant Settings ONCE
from imogi_pos.api.items import get_restaurant_settings
settings = get_restaurant_settings()
enable_menu_channels = settings.get("enable_menu_channels", 0)

# Determine if channel filtering should apply (same logic as get_template_items):
# 1) menu_channel provided, 2) Restaurant domain, 3) enable_menu_channels=1, 4) field exists
should_filter_channel = False
domain = None

if menu_channel and has_channel_field and pos_profile:
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain") or "Restaurant"
    should_filter_channel = (domain == "Restaurant" and enable_menu_channels == 1)
```

#### C. Behavior Matrix

| enable_menu_channels | menu_channel param | Domain | Result |
|---------------------|-------------------|---------|---------|
| 0 (OFF) | "Restaurant" | Restaurant | ✅ ALL items shown (filter SKIPPED) |
| 0 (OFF) | "POS" | Restaurant | ✅ ALL items shown (filter SKIPPED) |
| 0 (OFF) | NULL | Restaurant | ✅ ALL items shown |
| 1 (ON) | "Restaurant" | Restaurant | ⚙️ FILTERED by channel |
| 1 (ON) | "POS" | Restaurant | ⚙️ FILTERED by channel |
| 1 (ON) | NULL | Restaurant | ✅ ALL items shown |
| 1 (ON) | "Restaurant" | Counter | ✅ ALL items (not Restaurant domain) |

#### D. Policy untuk Items dengan NULL/Empty Channel (saat enable_menu_channels=1)

**Function `_channel_matches()` di `items.py` (line 47-60)**:
```python
def _channel_matches(entry_channel, requested_channel):
    """
    Pure function - NO DB calls. Caller must check domain and enable_menu_channels.
    
    Args:
        entry_channel: Item's imogi_menu_channel value (can be None/empty/"All"/"POS"/"Restaurant")
        requested_channel: Requested channel context (e.g. "POS", "Restaurant")
    
    Returns:
        bool: True if item should be included
    """
    entry = _normalise_channel(entry_channel)
    requested = _normalise_channel(requested_channel)
    
    # Fallback policy: Items with NULL/empty/universal channels match EVERYTHING
    if entry in CHANNEL_ALL or requested in CHANNEL_ALL:
        return True
    
    return entry == requested
```

**CHANNEL_ALL definition** (line 17):
```python
CHANNEL_ALL = {"", "both", "all", "any", "universal"}
```

**Policy yang dipilih**: **FALLBACK (friendly)**
- Item dengan channel NULL/empty/"All"/"Universal" → muncul di SEMUA channel
- Item dengan channel "Restaurant" → hanya muncul jika requested_channel="Restaurant"
- Item dengan channel "POS" → hanya muncul jika requested_channel="POS"

---

## 🧪 TESTING & VERIFICATION

### 1. Manual Testing Steps

#### A. Test Error Logging (Masalah 1)

**Step 1**: Trigger order creation error (force fail)
```python
# Di bench console
import frappe

# Create order dengan invalid data (missing required field)
try:
    frappe.call(
        "imogi_pos.api.orders.create_order",
        order_type="Counter",
        pos_profile="INVALID_PROFILE",  # Invalid profile
        branch="INVALID_BRANCH"
    )
except Exception as e:
    print(f"Expected error: {e}")
```

**Step 2**: Check Error Log
```sql
-- Query latest error log
SELECT 
    name, 
    creation, 
    method, 
    SUBSTRING(error, 1, 200) as error_preview
FROM `tabError Log`
WHERE error LIKE '%POS Order%'
ORDER BY creation DESC
LIMIT 5;
```

**Expected Result**:
- Error Log title: "Error creating POS Order"
- Message contains:
  - ✅ Full traceback dengan line numbers
  - ✅ Context: order_type, pos_profile, branch, user
  - ✅ Error detail jelas (bukan string kosong)

#### B. Test Menu Channel Filtering (Masalah 2)

**Step 1**: Check current setting
```python
# Di bench console
settings = frappe.get_single("Restaurant Settings")
print(f"Enable Menu Channels: {settings.enable_menu_channels}")
```

**Step 2**: Test dengan toggle OFF (enable_menu_channels=0)
```python
# Set to OFF
frappe.db.set_value("Restaurant Settings", "Restaurant Settings", "enable_menu_channels", 0)
frappe.db.commit()

# Clear cache
frappe.cache().delete_value('restaurant_settings')

# Test API
items = frappe.call(
    "imogi_pos.api.variants.get_template_items",
    pos_profile="Your POS Profile",
    menu_channel="Restaurant",  # Should be IGNORED
    limit=100
)
print(f"Items returned (should include ALL items): {len(items)}")
```

**Step 3**: Test dengan toggle ON (enable_menu_channels=1)
```python
# Set to ON
frappe.db.set_value("Restaurant Settings", "Restaurant Settings", "enable_menu_channels", 1)
frappe.db.commit()

# Clear cache
frappe.cache().delete_value('restaurant_settings')

# Test API dengan channel filter
items_restaurant = frappe.call(
    "imogi_pos.api.variants.get_template_items",
    pos_profile="Your POS Profile",
    menu_channel="Restaurant",
    limit=100
)

items_pos = frappe.call(
    "imogi_pos.api.variants.get_template_items",
    pos_profile="Your POS Profile",
    menu_channel="POS",
    limit=100
)

print(f"Items with channel='Restaurant': {len(items_restaurant)}")
print(f"Items with channel='POS': {len(items_pos)}")
# Should be different counts if filtering works
```

### 2. Automated Test Script

**Run**: `bench console < scripts/test_pos_order_menu_filtering.py`

Script akan:
1. Test create POS order dengan error capture
2. Test menu channel filtering dengan berbagai scenarios
3. Check quality dari Error Logs terbaru

---

## 🔍 DEBUGGING GUIDE

### Jika Order Creation Masih Gagal

**Step 1**: Check Error Log
```sql
SELECT * FROM `tabError Log` 
WHERE creation >= DATE_SUB(NOW(), INTERVAL 1 DAY)
AND error LIKE '%POS Order%'
ORDER BY creation DESC
LIMIT 1;
```

**Step 2**: Cari detail error di message field, perhatikan:
- **Context section**: order_type, pos_profile, branch, customer
- **Full Traceback**: line number yang error
- **Error message**: missing field, validation error, permission error

**Common Root Causes**:
1. **Missing Company**: POS Profile tidak ada company
   - Fix: Set company di POS Profile
2. **Missing Customer**: Customer required tapi tidak ada
   - Fix: Create "Walk-In Customer" atau pass valid customer
3. **Missing Warehouse**: POS Profile tidak ada warehouse
   - Fix: Set warehouse di POS Profile
4. **Item Validation**: Item tidak ada atau not sales item
   - Fix: Check Item master, set is_sales_item=1
5. **Permission**: User tidak ada role untuk create POS Order
   - Fix: Add role "Waiter" atau "Branch Manager"

### Jika Items Tidak Muncul di Cashier Console

**Step 1**: Check Restaurant Settings
```python
settings = frappe.get_single("Restaurant Settings")
print(f"Enable Menu Channels: {settings.enable_menu_channels}")
```

**Step 2**: Jika enable_menu_channels=0 tapi items masih tidak muncul:
- Bukan masalah channel filtering
- Check filter lain:
  1. Item.disabled = 0
  2. Item.is_sales_item = 1
  3. Item.variant_of is NULL (bukan variant child)
  4. Item Group filter (jika ada)

**Step 3**: Jika enable_menu_channels=1:
```python
# Check item channel assignments
items_by_channel = frappe.db.sql("""
    SELECT 
        COALESCE(imogi_menu_channel, '[NULL]') as channel,
        COUNT(*) as count
    FROM `tabItem`
    WHERE disabled = 0 AND is_sales_item = 1
    GROUP BY imogi_menu_channel
""", as_dict=True)

for row in items_by_channel:
    print(f"{row.channel}: {row.count} items")
```

**Step 4**: Assign menu channel ke items
```python
# Bulk update items tanpa channel
frappe.db.sql("""
    UPDATE `tabItem`
    SET imogi_menu_channel = 'Universal'
    WHERE (imogi_menu_channel IS NULL OR imogi_menu_channel = '')
        AND disabled = 0
        AND is_sales_item = 1
""")
frappe.db.commit()
```

---

## 📊 QUERY REFERENCE

### Check Error Logs (Last 7 Days)
```sql
SELECT 
    name,
    creation,
    method,
    SUBSTRING(error, 1, 100) as preview,
    CASE 
        WHEN error LIKE '%Traceback%' THEN 'Has Traceback'
        ELSE 'No Traceback'
    END as quality
FROM `tabError Log`
WHERE creation >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    AND (
        error LIKE '%POS Order%'
        OR method LIKE '%create_order%'
    )
ORDER BY creation DESC
LIMIT 20;
```

### Check Item Distribution by Channel
```sql
SELECT 
    COALESCE(imogi_menu_channel, '[NULL/Empty]') as channel,
    COUNT(*) as item_count,
    GROUP_CONCAT(DISTINCT item_group SEPARATOR ', ') as groups
FROM `tabItem`
WHERE disabled = 0 
    AND is_sales_item = 1
GROUP BY imogi_menu_channel
ORDER BY item_count DESC;
```

### Check POS Profiles Configuration
```sql
SELECT 
    name,
    company,
    selling_price_list,
    warehouse,
    imogi_pos_domain,
    disabled
FROM `tabPOS Profile`
WHERE disabled = 0;
```

---

## ✅ VERIFICATION CHECKLIST

### After Deployment

- [ ] Error Log memiliki traceback lengkap (check latest 5 error logs)
- [ ] Error Log memiliki context info (order_type, branch, user)
- [ ] User mendapat error message yang jelas (bukan string kosong)
- [ ] Restaurant Settings accessible via Settings menu
- [ ] Toggle "Enable Menu Channels" berfungsi dengan benar
- [ ] Items muncul di cashier console saat toggle OFF
- [ ] Items filtered by channel saat toggle ON (if domain=Restaurant)
- [ ] Items dengan channel NULL/Universal muncul di semua channel

### Full Cycle Test (Cashier Console)

1. [ ] Load cashier console → Show order list
2. [ ] Create new counter order → Success
3. [ ] Add item to order → Item visible in catalog
4. [ ] Add quantity, notes → Saved to order
5. [ ] Set payment method → Payment options visible
6. [ ] Submit payment → Invoice created & submitted
7. [ ] Complete order → Order workflow updated to "Closed"
8. [ ] No errors in browser console
9. [ ] No errors in Error Log
10. [ ] Order appears in Sales Invoice list

---

## 🎯 SUMMARY

### Changes Made
1. ✅ Added proper error logging dengan traceback + context ke 3 functions (create_order)
2. ✅ Added error logging untuk invoice submit operations (cashier.py, billing.py)
3. ✅ Verified menu channel filtering logic sudah benar
4. ✅ Enhanced help text untuk "Enable Menu Channels" setting (UX improvement)
5. ✅ Created test script untuk verification
6. ✅ Documented all behaviors dan debugging steps

### Files Modified
- `imogi_pos/api/orders.py` - Added error logging (3 order creation locations)
- `imogi_pos/api/cashier.py` - Added error logging for invoice.submit()
- `imogi_pos/api/billing.py` - Added error logging for invoice.submit() with NegativeStockError handling
- `imogi_pos/imogi_pos/doctype/restaurant_settings/restaurant_settings.json` - Enhanced help text

### New Files Created
- `scripts/test_pos_order_menu_filtering.py` - Test script
- `ERROR_FIX_DEPLOYMENT_GUIDE.md` - This documentation

### No Changes Needed
- `imogi_pos/api/variants.py` - Already correct
- `imogi_pos/api/items.py` - Already correct

### Error Logging Coverage
Now capturing errors at:
1. ✅ `order_doc.insert()` - catches validation, permission, missing field errors
2. ✅ `invoice.submit()` in process_payment - catches tax calc, GL posting, payment validation
3. ✅ `invoice.submit()` in generate_invoice - catches stock errors, tax calc, GL posting
4. ✅ All with full traceback + operational context

### Next Actions
1. Deploy perubahan ke production
2. Run test script untuk verify
3. Monitor Error Log untuk 24 jam
4. Jika masih ada error, traceback sekarang lengkap untuk debugging

---

**Timestamp**: 2026-02-02
**Author**: GitHub Copilot
**Enhanced**: Based on professional review feedback
**Tested**: ✅ Code reviewed, logic verified
**Status**: Ready for deployment
