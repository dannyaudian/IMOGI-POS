# Catalog Items Fix - Deployment Guide

## Problem Summary
Catalog tidak menampilkan items karena field `imogi_menu_channel` tidak ada di database schema, menyebabkan MySQL error 1054 atau filtering yang salah.

## Root Cause
Backend code mencoba fetch dan filter berdasarkan field `imogi_menu_channel`, tetapi field tersebut belum ada di Item DocType di production site.

## Solution Applied

### 1. Backend Hardening (imogi_pos/api/variants.py)
✅ Defensive field existence check sebelum query
✅ Conditional fields array - tidak error kalau field belum ada
✅ Graceful degradation - skip filtering kalau field missing
✅ Informative logging untuk diagnose issues

### 2. Frontend Enhancement (CatalogView.jsx)
✅ Response normalization (handle array dan {message:[]} format)
✅ menuChannel prop dengan dependency tracking
✅ Comprehensive error logging dengan troubleshooting steps

### 3. Diagnostic Tools
✅ Script `scripts/diagnose_catalog_items.py` untuk troubleshooting
✅ Field existence check included

---

## Deployment Steps

### Step 1: Deploy Code to Frappe Cloud

```bash
# Commit changes
git add -A
git commit -m "Fix catalog: add menu_channel field + domain-aware filtering"
git push origin main

# Frappe Cloud will auto-deploy
# Or trigger manual deploy from Frappe Cloud dashboard
```

### Step 2: Migrate Database (CRITICAL)

**⚠️ MUST RUN MIGRATE** to install `imogi_menu_channel` custom field:

#### Option A: Via Frappe Cloud Console
1. Open site console from Frappe Cloud dashboard
2. Run:
   ```python
   import frappe
   frappe.commands.migrate()
   ```

#### Option B: Via Bench (if SSH access)
```bash
bench --site tigaperkasateknik.j.frappe.cloud migrate
bench restart
```

#### Option C: Manual Custom Field (if migrate fails)
1. **Customize Form** → **Item**
2. Add field:
   - **Fieldname**: `imogi_menu_channel`
   - **Label**: `Menu Channel`
   - **Fieldtype**: `Select`
   - **Options** (copy-paste):
     ```
     
     Cashier
     Self Order
     Kiosk
     Universal
     ```
   - **Insert After**: `item_group`
   - **In Standard Filter**: ✓ Checked
   - **Description**: `Channel where this item appears in POS (leave blank or use Universal for all channels)`
3. **Save**
4. Clear cache: `frappe.clear_cache()`

### Step 3: Verify Field Exists

```bash
# In console
from frappe import get_meta
print(get_meta("Item").has_field("imogi_menu_channel"))  # Must be True
```

**If False**: Field not installed - repeat Step 2 or use Option C.

### Step 4: Populate Existing Items (OPTIONAL)

Kalau mau set semua item existing ke "Universal" (muncul di semua channel):

```bash
bench --site tigaperkasateknik.j.frappe.cloud console
```

```python
import frappe
frappe.db.sql("""
    UPDATE tabItem 
    SET imogi_menu_channel = 'Universal' 
    WHERE imogi_menu_channel IS NULL OR imogi_menu_channel = ''
""")
frappe.db.commit()
print("✓ All items set to Universal channel")
```

Atau kalau mau set semua ke "Cashier":

```python
frappe.db.sql("""UPDATE tabItem SET imogi_menu_channel = 'Cashier'""")
frappe.db.commit()
```

---

## Verification

### Quick Check - Field Exists

```bash
bench --site tigaperkasateknik.j.frappe.cloud console
```

```python
from frappe import get_meta
print(get_meta("Item").has_field("imogi_menu_channel"))  # Must be True
```

### Full Diagnostic

```python
exec(open('scripts/diagnose_catalog_items.py').read())
```

Cek output:
- Test 0: Field harus exist (✓)
- Channel distribution: harus ada "Cashier" atau "Universal"
- Test dengan menu_channel="Cashier": harus return items > 0

### Browser Verification

1. Open Cashier Console
2. Network tab → filter `get_template_items`
3. Check request payload: `menu_channel: "Cashier"`
4. Check response:
   - Array items length > 0
   - Each item punya key `imogi_menu_channel`

---

## Behavior After Fix

### Kalau Field Belum Ada
- ✅ Endpoint tidak crash (no MySQL error)
- ✅ Return ALL items (no filtering)
- ✅ Log info: "field not found, skipping filter"
- User sees all items (better than seeing nothing)

### Kalau Field Sudah Ada
- ✅ Channel filtering aktif
- ✅ Only items matching channel/universal ditampilkan
- ✅ Log warning kalau zero results (with diagnosis)

---

## Troubleshooting

### Issue: MySQL Error "Unknown column 'imogi_menu_channel'"

**Cause**: Field not created in database schema (migrate not run)

**Fix**:
1. Run `bench migrate` or use Frappe Cloud console
2. Or create Custom Field manually (see Step 2 Option C)
3. Verify with `get_meta("Item").has_field("imogi_menu_channel")`

### Issue: Masih Zero Items Setelah Deploy

1. **Cek field exists**:
   ```python
   get_meta("Item").has_field("imogi_menu_channel")
   ```
   
2. **Cek data items**:
   ```python
   frappe.get_all("Item", fields=["name","imogi_menu_channel"], limit_page_length=10)
   ```

3. **Run diagnostic**:
   ```python
   exec(open('scripts/diagnose_catalog_items.py').read())
   ```

4. **Kirim ke developer**:
   - Output diagnostic script
   - Network tab response dari `get_template_items`

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| MySQL Error 1054 | Field belum ada | Create Custom Field |
| Zero items | Field kosong/mismatch | Populate dengan Universal |
| All items show | Field belum ada | Normal - graceful degradation |

---

## Files Modified

1. `imogi_pos/api/variants.py` (lines 698-750)
   - Defensive field checking
   - Graceful degradation
   - Smart logging

2. `src/apps/cashier-console/components/CatalogView.jsx`
   - Response normalization
   - menuChannel dependency tracking
   - Error handling

3. `scripts/diagnose_catalog_items.py` (NEW)
   - Field existence check
   - Channel distribution analysis
   - Full diagnostic suite

---

## Success Criteria

✅ No MySQL errors in logs
✅ Items appear in catalog
✅ Channel filtering works (when field populated)
✅ Graceful degradation (when field missing)
✅ Informative logging for troubleshooting

---

**Last Updated**: 2026-02-01
**Status**: Ready for Production Deployment
