# Deployment Guide (Fresh Deploy)

**Last Updated:** 2026-02-02  
**Scope:** Fresh deploy to Frappe Cloud or SSH-managed bench environments.

---

## ✅ Pre-Deploy Checklist

### 1) Build & Verify React Assets

```bash
npm run build

# Verify output (expect 11 apps)
ls -la imogi_pos/public/react/*/static/
```

Expected app bundles:
- cashier-console
- kitchen
- waiter
- kiosk
- self-order
- customer-display
- table-display
- customer-display-editor
- table-display-editor
- table-layout-editor
- module-select

### 2) Commit & Push

```bash
git add .
git commit -m "chore: prepare deploy"
git push origin main
```

> **Important:** Frappe Cloud deploys from Git, not from local files.

---

## 🚀 Deploy Options

### Option A: Frappe Cloud Dashboard

1. Login to **Frappe Cloud Dashboard**
2. Select your site (e.g., `yoursite.frappe.cloud`)
3. Open **Deploy** / **Update**
4. Ensure **Build Assets** is checked ✅
5. Click **Deploy** and wait for completion

### Option B: SSH / Bench

```bash
# SSH into server
ssh user@your-site

# Pull latest code
cd ~/frappe-bench/apps/imogi_pos
git pull origin main

# Back to bench root
cd ~/frappe-bench

# Apply migrations
bench --site yoursite.frappe.cloud migrate

# Build assets
bench build --app imogi_pos

# Clear cache and restart
bench --site yoursite.frappe.cloud clear-cache
bench restart
```

---

## 🔍 Post-Deploy Verification

### 1) Asset URLs

Open these URLs directly in a browser (replace hashes):

```
https://yoursite.frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/css/main.<hash>.css
https://yoursite.frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/js/main.<hash>.js
```

**Expected:** CSS/JS file content (not HTML).

### 2) Desk Pages (Login Required)

```
/app/imogi-module-select
/app/imogi-cashier
/app/imogi-waiter
/app/imogi-kitchen
```

**Expected:** React app loads and shows a loading state before data arrives.

### 3) Module Select CSRF Sanity Check

Run in browser console:

```javascript
frappe.call({
  method: 'imogi_pos.utils.operational_context.set_operational_context',
  args: { pos_profile: 'Your POS Profile', branch: 'Main' },
  callback: (r) => console.log('✅ CSRF Test Passed:', r.message),
  error: (err) => console.error('❌ CSRF Test Failed:', err)
})
```

### 4) API Smoke Tests (Optional)

```bash
curl -X POST https://yoursite.frappe.cloud/api/method/imogi_pos.api.cashier.get_pos_profile \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET"

curl -X POST https://yoursite.frappe.cloud/api/method/imogi_pos.api.variants.get_template_items \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET" \
  -d '{"pos_profile":"POS Profile Name","menu_channel":"Cashier"}'
```

---

## 🛠️ Troubleshooting (Fresh Deploy)

### Issue A: CSS MIME Type Error

**Symptom:**
```
Refused to apply style because its MIME type ('text/html') is not a supported stylesheet MIME type
```

**Fix:**
1. Re-deploy with **Build Assets** enabled
2. Clear cache:
   ```bash
   bench --site yoursite.frappe.cloud clear-cache
   bench --site yoursite.frappe.cloud clear-website-cache
   ```
3. Hard refresh browser (`Ctrl+Shift+R` / `Cmd+Shift+R`)
4. Verify asset URLs return CSS/JS, not HTML

### Issue B: 400 Error When Switching POS Profile

**Common causes:**
- Missing/expired CSRF token
- Session expired (user becomes Guest)
- Wrong payload keys (must use `pos_profile`, not `posProfile`)

**Fix:**
1. Logout → login → hard refresh
2. Confirm `frappe.csrf_token` exists in console
3. Confirm payload shape:
   ```json
   { "pos_profile": "POS-001", "branch": "Main" }
   ```

### Issue C: Catalog Items Missing (Menu Channel Field)

If items disappear after deploy, verify the custom field exists:

```bash
bench --site yoursite.frappe.cloud console
```

```python
from frappe import get_meta
print(get_meta("Item").has_field("imogi_menu_channel"))
```

If missing, run migrate:

```bash
bench --site yoursite.frappe.cloud migrate
```

Optional data fill:

```python
import frappe
frappe.db.sql("""
    UPDATE tabItem
    SET imogi_menu_channel = 'Universal'
    WHERE imogi_menu_channel IS NULL OR imogi_menu_channel = ''
""")
frappe.db.commit()
```

---

## 🧰 Scripts & Patches (Fresh Deploy)

### Diagnostic Scripts (Optional)

Run these from your Frappe bench console when validating a fresh deploy:

- **`scripts/diagnose_production.py`** — comprehensive health checks (POS profile, items, settings).  
  ```bash
  bench --site yoursite.frappe.cloud console
  ```
  ```python
  exec(open('apps/imogi_pos/scripts/diagnose_production.py').read())
  ```

- **`scripts/diagnose_catalog_items.py`** — focuses on menu channel + item availability issues.  
  ```python
  exec(open('apps/imogi_pos/scripts/diagnose_catalog_items.py').read())
  ```

- **`scripts/quick_fix_production.py`** — applies safe defaults (creates settings/test items/opening).  
  ⚠️ **Use only if you want automated fixes and understand the data changes.**
  ```python
  exec(open('apps/imogi_pos/scripts/quick_fix_production.py').read())
  ```

### Patch Execution

IMOGI POS uses Frappe patches recorded in `imogi_pos/patches.txt`. On fresh deploys:

```bash
bench --site yoursite.frappe.cloud migrate
```

This ensures new fields (like restaurant flow fields) and data fixes run once.

---

## ✅ Manual Testing

After deploy, follow the full manual test flow:
- `MANUAL_TESTING_CHECKLIST.md`
