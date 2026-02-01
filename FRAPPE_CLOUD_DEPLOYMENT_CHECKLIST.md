# Frappe Cloud Deployment Checklist - IMOGI POS

**Tanggal:** 2026-02-01  
**Platform:** Frappe Cloud  
**App:** IMOGI POS v2.0.0 (React Multi-App Architecture)

---

## 🚀 Pre-Deployment Checklist

### 1. Local Build Verification

```bash
# Build semua React apps
npm run build

# Verify output (harus ada 11 apps)
ls -la imogi_pos/public/react/*/static/

# Expected apps:
# ✓ cashier-console
# ✓ kitchen
# ✓ waiter
# ✓ kiosk
# ✓ self-order
# ✓ customer-display
# ✓ table-display
# ✓ customer-display-editor
# ✓ table-display-editor
# ✓ table-layout-editor
# ✓ module-select
```

**Status:** ✅ Build successful (verified)

---

### 2. Git Commit & Push

```bash
# Stage all changes
git add .

# Commit with meaningful message
git commit -m "feat: Build React apps for Frappe Cloud deployment"

# Push to production branch
git push origin main  # atau production/staging sesuai setup
```

⚠️ **PENTING:** Frappe Cloud deploy dari Git repository, bukan dari local files!

---

## 🌐 Frappe Cloud Dashboard Steps

### Step 1: Trigger Deploy

1. Login ke **Frappe Cloud Dashboard**
2. Pilih site kamu (e.g., `yoursite.frappe.cloud`)
3. Tab **"Deploy"** atau **"Update"**
4. Pastikan branch yang dipilih benar (e.g., `main`)
5. **✅ CENTANG: "Build Assets"** (CRITICAL!)
6. Click **"Deploy"**

### Step 2: Monitor Deploy Logs

Tunggu sampai selesai (5-15 menit), cek logs untuk:

```bash
# Should see:
✓ Pulling latest code from git
✓ Installing Python dependencies (pip install)
✓ Running bench migrate
✓ Building assets (npm install && npm run build)
✓ Clearing cache
✓ Restarting workers
```

**Red flags:**
- ❌ npm install failed → check package.json
- ❌ Build failed → check vite.config.js
- ❌ Migrate failed → check database issues

### Step 3: Clear Cache (POST-DEPLOY)

Setelah deploy selesai 100%:

```bash
# Di Frappe Cloud Dashboard:
Site → "Clear Cache" button

# ATAU via SSH/Console:
bench --site yoursite.frappe.cloud clear-cache
```

---

## 🔍 Post-Deployment Verification

### 1. Check Asset URLs

Buka langsung di browser (replace `yoursite`):

```
https://yoursite.frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/css/main.k98Q2XAH.css

https://yoursite.frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/js/main.CUXMPVI4.js
```

**Expected:** CSS/JS file content  
**Problem:** HTML login page atau 404

**Fix jika 404:**
1. Deploy belum selesai → tunggu
2. Build tidak jalan → re-deploy dengan "Build Assets" checked
3. Cache issue → clear cache + hard reload browser

---

### 2. Test Desk Pages (Login Required)

Login sebagai user dengan role **Cashier** / **System Manager**:

```
https://yoursite.frappe.cloud/app/imogi-cashier
https://yoursite.frappe.cloud/app/imogi-module-select
https://yoursite.frappe.cloud/app/imogi-kitchen
https://yoursite.frappe.cloud/app/imogi-waiter
```

**Expected:** React app loads (logo, "Loading..." text)  
**Problem:** Blank page atau infinite loading

---

### 3. Check Browser Console

Open DevTools → Console tab:

**Good signs:**
```
[imogi][auth] Fetching POS profile...
[imogi][catalog] Loaded 15 items
```

**Bad signs:**
```
❌ Refused to apply style... MIME type 'text/html'
❌ Failed to load module script: "text/html" is not valid
❌ 404 Not Found: /assets/imogi_pos/public/react/...
❌ CORS error
```

**Fix:**
- Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
- Clear site cache di Frappe Cloud
- Re-deploy dengan "Build Assets"

---

### 4. Test API Endpoints

```bash
# Get POS Profile (harus return data)
curl -X POST https://yoursite.frappe.cloud/api/method/imogi_pos.api.cashier.get_pos_profile \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET"

# Get Items (harus return array)
curl -X POST https://yoursite.frappe.cloud/api/method/imogi_pos.api.variants.get_template_items \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET" \
  -d '{"pos_profile":"POS Profile Name","menu_channel":"Cashier"}'
```

**Expected:** JSON response dengan data  
**Problem:** 403/404/500

---

## 🐛 Common Issues & Fixes

### Issue 1: CSS MIME Type Error

**Symptom:**
```
Refused to apply style from 'https://yoursite.frappe.cloud/assets/frappe/dist/css/desk.bundle.UXADAAVE.css' 
because its MIME type ('text/html') is not a supported stylesheet MIME type
```

**Root Cause:**
- Asset hash berubah (UXADAAVE → WYULBMQH) tapi build tidak jalan
- CDN/cache serving old version
- File tidak ada di server

**Fix:**
1. Re-deploy dengan **"Build Assets" checked**
2. Clear site cache di dashboard
3. Hard reload browser (Ctrl+Shift+R)
4. Check URL langsung → kalau HTML berarti build failed

---

### Issue 2: Catalog Returns Zero Items

**Symptom:**
```javascript
[imogi][catalog] Loaded 0 items for group "all"
```

**Debugging:**
```sql
-- Check di Frappe Console:
frappe.db.sql("""
    SELECT name, item_name, disabled, is_sales_item, has_variants, variant_of, imogi_menu_channel
    FROM `tabItem`
    WHERE disabled = 0 AND is_sales_item = 1
    LIMIT 10
""", as_dict=1)
```

**Possible causes:**
1. **No items in database** → Create test items
2. **All items disabled** → Enable via Item master
3. **Menu channel mismatch** → Check `imogi_menu_channel` field
4. **Domain not Restaurant** → Check POS Profile `imogi_pos_domain`
5. **Custom field missing** → Run `bench migrate`

**Quick Fix:**
```python
# Create test item (Frappe Console)
item = frappe.get_doc({
    "doctype": "Item",
    "item_code": "TEST-COFFEE-001",
    "item_name": "Test Coffee",
    "item_group": "Products",
    "stock_uom": "Unit",
    "is_sales_item": 1,
    "standard_rate": 25000,
    "imogi_menu_channel": "All"  # or "Cashier"
})
item.insert(ignore_permissions=True)
frappe.db.commit()
```

---

### Issue 3: POS Opening Entry Required

**Symptom:**
```
No active POS Opening Entry found
```

**Fix:**
1. Login sebagai Cashier
2. Go to: **POS Opening Entry** → **New**
3. Fill:
   - POS Profile: Select your profile
   - Opening Amount: 0 (or starting cash)
4. Submit
5. Refresh cashier page

**Auto-create via API:**
```python
# Frappe Console
from imogi_pos.api.cashier import resolve_active_pos_opening

opening = resolve_active_pos_opening(
    pos_profile="Your POS Profile",
    user="cashier@example.com"
)
print(opening.name)
```

---

### Issue 4: Role Permission Denied

**Symptom:**
```
403 Forbidden: You don't have permission to access this resource
```

**Fix:**
```python
# Check user roles (Frappe Console)
frappe.get_roles("cashier@example.com")
# Should include: ['Cashier', 'Sales User']

# Add role if missing
user = frappe.get_doc("User", "cashier@example.com")
user.add_roles("Cashier", "Sales User")
```

---

### Issue 5: Desk Page Shows 404

**Symptom:**
Accessing `/app/imogi-cashier` returns 404

**Fix:**
1. Check if Workspace created:
   ```python
   # Frappe Console
   frappe.db.exists("Workspace", "IMOGI Cashier")
   # Should return workspace name
   ```

2. If missing, run fixtures import:
   ```bash
   bench --site yoursite.frappe.cloud migrate
   bench --site yoursite.frappe.cloud clear-cache
   ```

3. Check `imogi_pos/fixtures/workspace.json` exists in git

---

## 📋 Configuration Checklist

### Restaurant Settings

```python
# Create/Update via Frappe Console
settings = frappe.get_doc("Restaurant Settings", "Restaurant Settings")
settings.use_native_variants = 1
settings.enable_menu_channels = 1  # For Restaurant domain
settings.max_items_per_query = 500
settings.save()
frappe.db.commit()
```

### POS Profile Setup

Required fields:
- ✅ `name`: e.g., "Main Counter"
- ✅ `company`: Your company
- ✅ `warehouse`: Default warehouse
- ✅ `imogi_pos_domain`: "Restaurant" / "Retail" / "Service"
- ✅ `applicable_for_users`: Add cashier users

Optional:
- `imogi_branch`: If multi-branch
- `imogi_menu_profile`: For menu filtering

---

## 🔄 Re-Deployment Flow

Jika sudah deploy dan mau update code:

```bash
# 1. Local: Pull latest, make changes
git pull
# ... edit code ...
npm run build

# 2. Commit & push
git add .
git commit -m "fix: Update catalog filtering logic"
git push origin main

# 3. Frappe Cloud: Deploy
# Dashboard → Deploy → Build Assets ✓ → Deploy

# 4. Clear cache
# Dashboard → Clear Cache

# 5. Browser: Hard reload
# Ctrl+Shift+R / Cmd+Shift+R
```

---

## ✅ Final Verification Steps

Setelah deploy selesai, test **happy path**:

### 1. Login
```
URL: https://yoursite.frappe.cloud/login
User: cashier@example.com
```

### 2. Module Select
```
URL: https://yoursite.frappe.cloud/app/imogi-module-select
Expected: Shows available modules (Cashier, Kitchen, etc.)
```

### 3. Cashier Console
```
URL: https://yoursite.frappe.cloud/app/imogi-cashier
Expected:
- Loads POS profile
- Shows item catalog
- Can select items
- Can create order
```

### 4. Create Test Order
```
1. Select item from catalog
2. Adjust quantity
3. Click "Create Order"
4. Verify order created in POS Order list
```

### 5. Check Kitchen Display
```
URL: https://yoursite.frappe.cloud/app/imogi-kitchen
Expected: Shows submitted orders (KOT tickets)
```

---

## 🆘 Emergency Rollback

Jika deploy breaking production:

```bash
# 1. Frappe Cloud Dashboard
# Deploy → Select previous commit/tag → Deploy

# 2. Clear cache
# Dashboard → Clear Cache

# 3. Check logs
# Logs → Recent errors
```

**Or via bench (SSH access):**
```bash
cd ~/frappe-bench/apps/imogi_pos
git log --oneline  # Find last working commit
git checkout <commit-hash>
bench --site yoursite.frappe.cloud migrate
bench --site yoursite.frappe.cloud clear-cache
bench restart
```

---

## 📞 Support Checklist

Jika masih error setelah semua step di atas:

**Collect these info:**

1. **Site URL:** yoursite.frappe.cloud
2. **Frappe/ERPNext version:** 
   ```bash
   bench version
   ```
3. **Deploy logs:** Screenshot dari Frappe Cloud dashboard
4. **Browser console:** Full error messages
5. **Network tab:** Failed request details (status code, response)
6. **API test result:**
   ```bash
   curl -X POST https://yoursite.frappe.cloud/api/method/imogi_pos.api.variants.get_template_items \
     -H "Authorization: token KEY:SECRET" \
     -d '{"pos_profile":"Main Counter","menu_channel":"Cashier"}' -v
   ```

---

## 🎯 Success Criteria

Deploy dianggap **SUKSES** jika:

- ✅ All React apps load (no blank page)
- ✅ CSS/JS assets return correct MIME type
- ✅ Catalog returns items (>0)
- ✅ Can create POS order
- ✅ No console errors
- ✅ API endpoints respond with 200
- ✅ Browser hard reload works without clearing cache

---

## 📝 Notes

- **Build time:** ~2-5 menit (npm install + build 11 apps)
- **Total deploy time:** ~10-15 menit (including migrate)
- **Cache clear time:** ~30 detik
- **Browser cache:** Clear dengan Ctrl+Shift+R (hard reload)

**Test environments:**
- Chrome/Edge: Best compatibility
- Firefox: Works, but check CORS
- Safari: May need explicit cache clear

**Performance:**
- First load: 2-3 detik (cold cache)
- Subsequent: <500ms (warm cache)
- API calls: <200ms (local DB)

---

**Last Updated:** 2026-02-01  
**Tested On:** Frappe Cloud (ERPNext v15)  
**Build Output:** 11 React apps, ~3MB total (gzipped ~900KB)
