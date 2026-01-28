# Production Deployment Guide - CSRF Fix + UI Updates

**Date:** January 28, 2026  
**Issue:** 400 Bad Request - CSRFTokenError  
**Status:** ✅ Fixed Locally, Pending Production Deploy

---

## 🎯 What's Being Deployed

### 1. **CSRF Token Fix** ⭐ CRITICAL
- Replaced `useFrappePostCall` → `frappe.call()`
- Ensures CSRF token included in POST requests
- Fixes "Failed to set POS context" error

### 2. **Frappe Desk UI Alignment**
- Removed gradient header → flat white header
- Updated colors to use Frappe CSS variables
- Form controls match Frappe Desk style

### 3. **Bundle Updates**
```
module-select: main.BRPsyW_q.js (287.44 kB)
module-select CSS: main.CNIKOchO.css (27.77 kB)
```

---

## 📦 Deployment Steps

### **Option 1: SSH to Production Server**

```bash
# 1. SSH ke server
ssh user@tigaperkasateknik.j.frappe.cloud

# 2. Navigate ke bench directory
cd ~/frappe-bench

# 3. Pull latest code dari git
cd apps/imogi_pos
git pull origin main

# 4. Return to bench root
cd ~/frappe-bench

# 5. Clear cache
bench --site tigaperkasateknik.j.frappe.cloud clear-cache

# 6. Build React bundles
bench build --app imogi_pos

# 7. Restart server
bench restart

# 8. Verify
bench --site tigaperkasateknik.j.frappe.cloud migrate
```

### **Option 2: Using Frappe Cloud Dashboard**

1. **Go to:** https://frappecloud.com/dashboard
2. **Select site:** tigaperkasateknik.j.frappe.cloud
3. **Navigate to:** Apps → IMOGI POS
4. **Click:** Update App (pulls latest git)
5. **Wait for build** (~2-5 minutes)
6. **Restart site** (optional, auto-restarts after build)

---

## ✅ Post-Deployment Verification

### 1. **Check Bundle Hash**

Open browser DevTools (F12), go to Network tab, then:

```javascript
// In Console - verify actual loaded bundle
document.querySelectorAll('script[data-imogi-app="module-select"]')[0].src
// Expected: .../main.DPeI_wSU.js (final production hash)
// NOT: main.CbkCunl2.js (old) or main.g2ReKeh2.js (legacy)
```

**Server-side verification:**
```bash
# SSH to server, check actual built file
ls -lt ~/frappe-bench/sites/assets/imogi_pos/react/module-select/static/js/main.*.js | head -1
# Should show: main.DPeI_wSU.js (or newer if rebuilt)
```

### 2. **Test CSRF Fix**

Click any module (e.g., Cashier Console), check console:

```javascript
// Should see:
[module-select] Calling setOperationalContext API: {pos_profile: 'Dirnosaurus', branch: 'Main'}
[module-select] setOperationalContext raw response: {message: {...}}
[module-select] Context set successfully: {pos_profile: 'Dirnosaurus', ...}

// Should NOT see:
❌ setOperationalContext exception: {exc_type: 'CSRFTokenError'}
❌ Failed to set POS context: There was an error.
```

### 3. **Verify UI Changes**

- ✅ Header should be **white** (not orange gradient)
- ✅ Text should be **dark** (#2c3e50, not white)
- ✅ POS Profile selector: white with gray border
- ✅ Logout button: white with gray border
- ✅ Focus states: blue ring (not white glow)

### 4. **Manual CSRF Test**

In DevTools Console:

```javascript
frappe.call({
  method: 'imogi_pos.utils.operational_context.set_operational_context',
  args: { 
    pos_profile: 'Dirnosaurus',
    branch: 'Main'
  },
  callback: (r) => {
    console.log('✅ CSRF Test Passed:', r.message)
  },
  error: (err) => {
    console.error('❌ CSRF Test Failed:', err)
  }
})

// Expected output:
// ✅ CSRF Test Passed: {success: true, context: {...}, message: "..."}
```

---

## 🔍 Troubleshooting

### Issue 1: Bundle Hash Tidak Berubah

**Symptom:** Browser masih load `main.CbkCunl2.js` (bundle lama)

**Solution:**
```bash
# Di server
cd ~/frappe-bench
bench --site tigaperkasateknik.j.frappe.cloud clear-cache
bench clear-cache
bench build --app imogi_pos --force

# Di browser
Cmd+Shift+R (hard refresh)
# Atau buka DevTools → Network → Disable cache → Reload
```

### Issue 2: CSRF Error Masih Muncul

**Symptom:** Still getting `CSRFTokenError` after deploy

**Possible Causes:**
1. **Session expired** - User perlu re-login
2. **Bundle belum ter-load** - Hard refresh required
3. **Build failed** - Check bench logs

**Solution:**
```bash
# Check build logs
tail -50 ~/frappe-bench/logs/web.error.log

# Verify bundle exists
ls -lh ~/frappe-bench/sites/assets/imogi_pos/public/react/module-select/static/js/main.BRPsyW_q.js

# Re-login di browser
# Logout → Login → Hard refresh
```

### Issue 3: CSS Tidak Update

**Symptom:** Header masih gradient (bukan flat white)

**Solution:**
```bash
# Force rebuild CSS
cd ~/frappe-bench
bench build --app imogi_pos --hard-link

# Clear browser cache
# Chrome: Settings → Privacy → Clear browsing data → Cached images
```

---

## 📊 Expected Results

### Before Deployment:
```
❌ Bundle: main.CbkCunl2.js (old)
❌ Header: Orange gradient with white text
❌ CSRF: POST requests fail with 400
❌ Error: "Failed to set POS context"
```

### After Deployment:
```
✅ Bundle: main.BRPsyW_q.js (new)
✅ Header: White flat with dark text
✅ CSRF: POST requests succeed with 200
✅ Success: Context set, modules accessible
```

---

## 🚨 Rollback Plan (If Needed)

If deployment causes issues:

```bash
# 1. Revert git commit
cd ~/frappe-bench/apps/imogi_pos
git log --oneline -5
git revert <commit-hash>

# 2. Rebuild old bundle
cd ~/frappe-bench
bench build --app imogi_pos

# 3. Restart
bench restart

# 4. Notify users
# Send notification: "System reverted, please refresh browser"
```

---

## 📝 Deployment Checklist

- [ ] Backup current production database
- [ ] Pull latest code from git
- [ ] Clear cache on server
- [ ] Build React bundles (`bench build --app imogi_pos`)
- [ ] Restart server (`bench restart`)
- [ ] Hard refresh browser (Cmd+Shift+R)
- [ ] Verify bundle hash (main.BRPsyW_q.js)
- [ ] Test CSRF (click Cashier Console, check logs)
- [ ] Verify UI (white header, dark text)
- [ ] Test full flow (Module Select → Cashier → Transaction)
- [ ] Monitor error logs for 10 minutes
- [ ] Notify users if all OK

---

## 📞 Support Commands

```bash
# Check if server is running
bench status

# View real-time logs
bench watch

# Check error logs
tail -f ~/frappe-bench/logs/web.error.log

# Check nginx logs (if applicable)
tail -f /var/log/nginx/error.log

# Restart specific services
bench restart
# or
supervisorctl restart frappe-bench-web:
supervisorctl restart frappe-bench-workers:
```

---

**Deployment Priority:** 🔴 HIGH (CSRF fix is critical for module navigation)  
**Estimated Downtime:** 0 minutes (rolling deploy)  
**Rollback Time:** < 5 minutes if needed  

**Ready to Deploy:** ✅  
**Tested Locally:** ✅  
**Documentation:** ✅
