# IMOGI POS - Quick Start Deployment Guide

**Architecture:** New Reorganized Structure (January 2026)  
**Status:** Ready for Testing  

---

## 📋 Prerequisites

- Frappe Framework installed
- IMOGI POS app installed
- Access to bench commands
- Backup of existing database (recommended)

---

## 🚀 Deployment Steps

### 1. Pull Latest Code

```bash
cd ~/frappe-bench/apps/imogi_pos
git pull origin main  # or your branch name
```

### 2. Run Migration

```bash
cd ~/frappe-bench

# Run database migrations
bench --site [your-site-name] migrate

# Expected output:
# - Migrating imogi_pos
# - Running patch: migrate_to_new_architecture
# - ✓ Updated X user default redirects
# - ✓ Updated X Customer Display Devices
# - ✓ Updated X Kiosk Devices
# - ✓ Updated X Workspaces
```

### 3. Clear Caches

```bash
# Clear all caches
bench --site [your-site-name] clear-cache
bench --site [your-site-name] clear-website-cache

# Build assets (if needed)
bench build --app imogi_pos
```

### 4. Restart Server

```bash
# For development
bench restart

# For production (supervisord)
sudo supervisorctl restart all

# For production (systemd)
sudo systemctl restart frappe-bench-web
sudo systemctl restart frappe-bench-workers
```

### 5. Verify Deployment

Open browser and test:

```bash
# Test new URLs
http://your-site/restaurant/waiter
http://your-site/counter/pos
http://your-site/restaurant/kitchen
http://your-site/devices/displays

# Test old URLs (should redirect)
http://your-site/create-order  → should redirect to /restaurant/waiter
http://your-site/kiosk  → should redirect to /restaurant/waiter?mode=kiosk
http://your-site/cashier-console  → should redirect to /counter/pos
```

### 6. Check for Errors

```bash
# Watch error logs
tail -f ~/frappe-bench/logs/[site-name]-error.log

# Watch web logs
tail -f ~/frappe-bench/logs/[site-name]-web.log
```

---

## ✅ Post-Deployment Checklist

- [ ] Migration completed without errors
- [ ] Old URLs redirect to new URLs
- [ ] Users can login via `/shared/login`
- [ ] Role-based access working correctly
- [ ] No JavaScript console errors
- [ ] Kitchen display works
- [ ] Table display works
- [ ] Counter POS works
- [ ] Waiter POS works (both modes)
- [ ] Customer display works
- [ ] Self-order works

---

## 🔧 Troubleshooting

### Issue: Migration fails

**Solution:**
```bash
# Check patch status
bench --site [site-name] console

# In console:
from frappe.modules.patch_handler import executed
print(executed)  # Check if patch already ran

# Skip failing patches (use with caution)
bench --site [site-name] migrate --skip-failing
```

### Issue: Old URLs not redirecting

**Solution:**
```bash
# Clear routes cache
bench --site [site-name] console

# In console:
import frappe
frappe.clear_cache()
frappe.db.commit()

# Restart
bench restart
```

### Issue: 404 errors on new URLs

**Solution:**
```bash
# Check if files exist
ls -la ~/frappe-bench/apps/imogi_pos/imogi_pos/www/restaurant/
ls -la ~/frappe-bench/apps/imogi_pos/imogi_pos/www/counter/
ls -la ~/frappe-bench/apps/imogi_pos/imogi_pos/www/devices/

# Rebuild assets
bench build --app imogi_pos --force

# Clear cache
bench --site [site-name] clear-cache
bench --site [site-name] clear-website-cache
```

### Issue: Permission denied errors

**Solution:**
```bash
# Check user roles in ERPNext
# Navigate to: User list → Select user → Check roles

# Required roles:
# - Kitchen Staff: For kitchen display
# - Waiter: For waiter POS and table display
# - Cashier: For counter POS
# - Restaurant Manager: For all restaurant features + admin
# - System Manager: For everything
```

### Issue: JavaScript errors in console

**Solution:**
```bash
# Rebuild JavaScript assets
bench build --app imogi_pos

# Check if role-ui.js exists
ls -la ~/frappe-bench/apps/imogi_pos/imogi_pos/public/js/core/role-ui.js

# Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
```

### Issue: Admin panel not showing in displays page

**Solution:**
1. Verify user has "Restaurant Manager" or "System Manager" role
2. Check browser console for JavaScript errors
3. Verify role-ui.js is loaded (Network tab in DevTools)
4. Clear browser cache and hard refresh

---

## 🔄 Rollback Plan (Emergency)

If deployment causes critical issues:

### Option 1: Restore from backup

```bash
# Restore database
bench --site [site-name] --force restore /path/to/backup.sql.gz

# Clear cache
bench --site [site-name] clear-cache
bench restart
```

### Option 2: Revert code only

```bash
cd ~/frappe-bench/apps/imogi_pos
git log  # Find previous commit hash
git reset --hard <previous-commit-hash>

# Rebuild
cd ~/frappe-bench
bench build --app imogi_pos
bench --site [site-name] clear-cache
bench restart
```

**Note:** Option 2 may cause issues if migration has already run. Option 1 is safer.

---

## 📊 Migration Impact

### What Gets Updated:

1. **User Defaults**
   - User redirect URLs updated to new paths
   
2. **Device Configurations**
   - Customer Display Device URLs updated
   - Kiosk Device URLs updated
   
3. **Workspace Links**
   - Workspace shortcuts updated to new URLs
   
4. **URL Routes**
   - Old URLs redirect to new URLs automatically

### What Stays the Same:

- POS Profiles
- Restaurant Settings
- Menu items
- Orders and invoices
- User permissions
- Branch configurations
- All business data

---

## 📝 Testing After Deployment

Follow the comprehensive testing guide:

```bash
# View testing guide
cat ~/frappe-bench/apps/imogi_pos/TESTING_GUIDE.md

# Or open in browser
http://your-site/app/file/TESTING_GUIDE.md
```

**Critical Tests:**
1. Login as different user roles
2. Test each page access
3. Test old URL redirects
4. Test admin features (if manager)
5. Create a test order end-to-end

---

## 🆘 Support

If you encounter issues not covered here:

1. Check error logs: `tail -f ~/frappe-bench/logs/[site-name]-error.log`
2. Check browser console (F12 → Console tab)
3. Review TESTING_GUIDE.md for detailed test cases
4. Check IMPLEMENTATION_SUMMARY.md for architecture details
5. Contact development team with:
   - Error messages
   - Steps to reproduce
   - Browser and version
   - User role being tested
   - Screenshots if applicable

---

## 📚 Documentation

- **IMPLEMENTATION_SUMMARY.md** - Complete implementation details
- **TESTING_GUIDE.md** - Comprehensive testing checklist
- **www/README.md** - Architecture overview
- **ARCHITECTURE.md** - Technical architecture
- **CHANGELOG.md** - Version history

---

**Deployment Checklist:**

```
Pre-Deployment:
[ ] Backup database
[ ] Backup files
[ ] Notify users of maintenance
[ ] Schedule downtime window

Deployment:
[ ] Pull latest code
[ ] Run migration
[ ] Clear caches
[ ] Build assets
[ ] Restart server

Post-Deployment:
[ ] Verify URLs working
[ ] Test with each role
[ ] Check error logs
[ ] Monitor performance
[ ] Document any issues
[ ] Notify users deployment complete
```

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Site:** _____________  
**Result:** ⬜ SUCCESS  ⬜ PARTIAL  ⬜ FAILED (rollback)  
**Notes:** _____________
