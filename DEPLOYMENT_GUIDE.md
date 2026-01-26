# IMOGI POS: Branch to POS Profile Migration - Deployment Guide

## Pre-Deployment Checklist

### 1. Backup
```bash
# Backup database
bench --site [site-name] backup

# Backup files
bench --site [site-name] backup --with-files

# Verify backups exist
ls -lh ~/frappe-bench/sites/[site-name]/private/backups/
```

### 2. Code Review
- ✅ All Phase 1 files committed
- ✅ All Phase 2 files committed
- ✅ No uncommitted changes in workspace
- ✅ Tests pass locally (if applicable)

### 3. Staging Environment Test (Recommended)
Test on staging before production:
```bash
# On staging server
cd ~/frappe-bench
bench --site staging.example.com migrate
npm run build
bench --site staging.example.com clear-cache
bench restart
```

---

## Production Deployment

### Step 1: Update Code
```bash
cd ~/frappe-bench/apps/imogi_pos
git pull origin main

# Or if using specific branch
git checkout feature/pos-profile-migration
git pull origin feature/pos-profile-migration
```

### Step 2: Apply Database Migration
This adds the `imogi_default_pos_profile` field to User doctype.

```bash
# Run migration
bench --site [site-name] migrate

# Expected output:
# Migrating imogi_pos
# Updating Custom Field...
```

**⚠️ Important:** If migration fails, check:
```bash
# Check migration status
bench --site [site-name] console

>>> frappe.get_all("Custom Field", filters={"dt": "User", "fieldname": "imogi_default_pos_profile"})
# Should return 1 record if successful
```

### Step 3: Rebuild React Applications
```bash
cd ~/frappe-bench/apps/imogi_pos

# Install dependencies (if package.json changed)
npm install

# Build all React apps
npm run build

# Expected output:
# Building module-select...
# Building waiter...
# Building kitchen...
# Building cashier-console...
# Building cashier-payment...
# ✓ Built successfully
```

### Step 4: Clear Caches
```bash
# Clear server cache
bench --site [site-name] clear-cache

# Clear website cache (if using portal)
bench --site [site-name] clear-website-cache

# Reload doctype cache
bench --site [site-name] reload-doctype "User"
bench --site [site-name] reload-doctype "POS Profile"
```

### Step 5: Restart Services
```bash
# Restart all bench services
bench restart

# Or restart specific services
sudo supervisorctl restart all
```

---

## Post-Deployment Verification

### 1. Backend API Tests

Test in **Frappe Console** (`bench --site [site-name] console`):

```python
import frappe

# Test 1: Check custom field exists
field = frappe.get_value("Custom Field", 
    {"dt": "User", "fieldname": "imogi_default_pos_profile"})
print(f"Custom field exists: {bool(field)}")

# Test 2: Get user POS Profile info
from imogi_pos.api.public import get_user_pos_profile_info
info = get_user_pos_profile_info()
print(f"Current POS Profile: {info.get('current_pos_profile')}")
print(f"Available Profiles: {len(info.get('available_pos_profiles', []))}")

# Test 3: Test POS Profile-based filtering
from imogi_pos.api.module_select import get_active_pos_opening
result = get_active_pos_opening(pos_profile="Main Counter - Branch A")
print(f"Active POS Opening: {result}")

# Test 4: Test deprecated branch parameter (should log warning)
result = get_active_pos_opening(branch="Branch A")
print(f"With branch param: {result}")
```

### 2. Frontend Tests

**Test in Browser:**

1. **Navigate to Module Select:**
   ```
   https://[site-name]/imogi-pos
   ```

2. **Verify POS Profile Switcher:**
   - [ ] Dropdown appears in header (top-right)
   - [ ] Shows current selected profile with checkmark
   - [ ] Lists all available profiles grouped by branch
   - [ ] Clicking profile switches context immediately

3. **Test Each Module:**

   **Waiter App:**
   ```
   https://[site-name]/imogi-pos/waiter
   ```
   - [ ] Tables load for selected POS Profile's branch
   - [ ] Can create new orders
   - [ ] Profile switcher works
   - [ ] Cross-tab sync works (open in 2 tabs, switch in one)

   **Kitchen App:**
   ```
   https://[site-name]/imogi-pos/kitchen
   ```
   - [ ] KOTs filter by selected POS Profile
   - [ ] Station filter works
   - [ ] Profile switcher updates KOT list

   **Cashier Console:**
   ```
   https://[site-name]/imogi-pos/cashier-console
   ```
   - [ ] Pending orders load for POS Profile
   - [ ] Can process payments
   - [ ] Queue numbers work for counter mode

   **Cashier Payment:**
   ```
   https://[site-name]/imogi-pos/cashier-payment
   ```
   - [ ] Order details load correctly
   - [ ] Payment processing works

### 3. Cross-Tab Synchronization Test

1. Open Module Select in Tab 1
2. Open Waiter app in Tab 2
3. Switch POS Profile in Tab 1
4. **Expected:** Tab 2 updates automatically (BroadcastChannel)

### 4. localStorage Persistence Test

1. Select a POS Profile in any app
2. Close browser completely
3. Reopen and navigate to IMOGI POS
4. **Expected:** Same profile is still selected

### 5. Server Sync Test

1. Open browser console (F12)
2. Select a POS Profile in Module Select
3. Check console for: `"Syncing POS Profile to server..."`
4. Verify in User record:
   ```python
   # In Frappe Console
   frappe.get_value("User", "[user-email]", "imogi_default_pos_profile")
   ```

---

## Rollback Procedure

If deployment fails, rollback:

### 1. Restore Database
```bash
# List backups
bench --site [site-name] restore --list

# Restore specific backup
bench --site [site-name] restore [backup-file]
```

### 2. Revert Code
```bash
cd ~/frappe-bench/apps/imogi_pos
git checkout main  # or previous stable branch
git pull origin main

npm run build
bench --site [site-name] clear-cache
bench restart
```

---

## Troubleshooting

### Issue: Custom Field Not Created

**Symptoms:** Migration completes but field doesn't appear

**Solution:**
```bash
# Manually sync custom fields
bench --site [site-name] console

>>> from frappe.core.doctype.custom_field.custom_field import create_custom_fields
>>> import json
>>> with open('apps/imogi_pos/imogi_pos/fixtures/custom_field.json') as f:
...     custom_fields = json.load(f)
>>> create_custom_fields({"User": custom_fields})
>>> frappe.db.commit()
```

### Issue: React Apps Not Building

**Symptoms:** `npm run build` fails

**Solution:**
```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build

# If specific app fails, build individually
npx vite build --config src/apps/module-select/vite.config.js
```

### Issue: POS Profile Switcher Not Showing

**Symptoms:** No dropdown in header

**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check console for errors (F12)
4. Verify React bundle loaded:
   ```
   View Page Source → Search for "module-select/assets/index-"
   ```

### Issue: API Errors After Migration

**Symptoms:** "pos_profile parameter not recognized"

**Solution:**
```bash
# Rebuild Python bytecode
find . -name "*.pyc" -delete
find . -name "__pycache__" -type d -exec rm -rf {} +

# Restart services
bench restart
```

### Issue: Deprecation Warnings in Logs

**Symptoms:** Logs show "DEPRECATION WARNING: use pos_profile parameter"

**Analysis:** This is expected during transition period. Old API calls still work.

**Long-term Fix:** Update calling code to use pos_profile parameter:
```python
# Old (deprecated)
result = get_pending_orders(branch="Branch A")

# New (preferred)
result = get_pending_orders(pos_profile="Main Counter - Branch A")
```

---

## Performance Monitoring

After deployment, monitor:

### 1. Database Queries
```sql
-- Check if POS Profile lookups are fast
SELECT name, imogi_branch, disabled 
FROM `tabPOS Profile` 
WHERE disabled = 0 AND imogi_branch = 'Branch A';

-- Check User default POS Profile queries
SELECT name, imogi_default_pos_profile 
FROM `tabUser` 
WHERE name = '[user-email]';
```

### 2. Error Logs
```bash
# Watch error log
tail -f ~/frappe-bench/sites/[site-name]/logs/error.log

# Search for POS-related errors
grep -i "pos profile" ~/frappe-bench/sites/[site-name]/logs/error.log
grep -i "deprecation warning" ~/frappe-bench/sites/[site-name]/logs/error.log
```

### 3. Response Times
- Module Select load time: < 2 seconds
- POS Profile switch time: < 500ms
- API responses: < 1 second

---

## User Communication

### Notify Users About Changes

**Email Template:**

> **Subject:** IMOGI POS Update - New Profile Selector
>
> Hi Team,
>
> We've updated the IMOGI POS system with a new **POS Profile** selector. Here's what changed:
>
> **What's New:**
> - A dropdown menu in the top-right corner of all POS screens
> - Easily switch between different POS Profiles (e.g., Main Counter, Express Counter)
> - Your selection persists across browser tabs and sessions
>
> **How to Use:**
> 1. Click the dropdown in the top-right corner
> 2. Select your POS Profile
> 3. All data updates automatically
>
> **No Action Required:** The system will work as before if you only have one POS Profile.
>
> Questions? Contact IT Support.

---

## Success Criteria

✅ Deployment is successful if:

1. **Migration completes** without errors
2. **Custom field exists** in User doctype
3. **React apps build** successfully
4. **All modules load** without errors
5. **POS Profile switcher** appears in all app headers
6. **Profile switching** works and updates all tabs
7. **API calls work** with both `pos_profile` and `branch` parameters
8. **No critical errors** in logs

---

## Next Steps After Deployment

1. **Monitor for 24-48 hours** for any issues
2. **Collect user feedback** on POS Profile switcher UX
3. **Review deprecation warnings** in logs - update old API calls
4. **Plan Phase 3** enhancements (if needed):
   - POS Profile management UI
   - Advanced permissions by profile
   - Analytics by profile

---

## Support

For issues during deployment:
1. Check this guide's Troubleshooting section
2. Review error logs
3. Test on staging first
4. Have rollback plan ready

**Emergency Rollback:** See "Rollback Procedure" section above.
