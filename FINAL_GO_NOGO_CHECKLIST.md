# Final Go/No-Go Checklist - Pre-Production

**Date:** January 28, 2026  
**Status:** ✅ All hardening patches applied  
**Bundle:** `main.DPeI_wSU.js` (287.66 kB)  
**Duration:** 10 minutes

---

## ✅ Hardening Patches Applied

### 1. **Route Normalization** 🛡️
- ✅ deskNavigate now strips `/app/` prefix correctly
- ✅ Handles edge case: `/app/imogi-cashier` → `['app', 'imogi-cashier']`
- ✅ Prevents double-prefix issues with frappe.set_route

### 2. **CSRF Error Handling** 🔧
- ✅ Now checks `r.exc` in callback (Frappe's exception pattern)
- ✅ Separate logging for server vs network errors
- ✅ No silent failures

### 3. **Script Guard Complete** 📊
- ✅ Added `dataset.imogiApp` to ALL page loaders:
  - `module-select` ✅
  - `cashier-console` ✅
  - `kitchen` ✅
  - `waiter` ✅
  - `table-display` ✅
  - `customer-display` ✅
- ✅ byApp counting now 100% accurate

### 4. **Test File Cleanup** 🧹
- ✅ Updated 8 test files with new route `/app/imogi-module-select`
- ✅ No more references to legacy `/shared/module-select`
- ✅ CI/QA tests won't be misleading

---

## 🎯 10-Minute Go/No-Go Test

### **Setup:**
```bash
# 1. Deploy to test environment OR test locally
# 2. Hard refresh browser: Cmd+Shift+R
# 3. Open DevTools Console (F12)
```

---

### **Test 1: Initial Load** (1 min)

**Action:** Navigate to `/app/imogi-module-select`

**Expected:**
```javascript
[Desk] on_page_load called: 1
[Desk] Module Select page shown: 1
[Desk] Injecting new script tag: 1
[module-select] Bundle loaded, mount version: phase2-scan-fix-20260128
[module-select] Creating new React root for element
```

**✅ PASS if:**
- Page loads without errors
- White header (not gradient)
- Module cards visible

**❌ FAIL if:**
- React error (Invariant #299, TDZ, etc.)
- Bundle not found (404)
- Blank screen

---

### **Test 2: SPA Navigation** (2 min)

**Action:** Click "Cashier Console" card

**Expected:**
```javascript
🚀 [ROUTE TRANSITION] Module-select → Cashier Console {
  from_route: "/app/imogi-module-select",
  to_route: "/app/imogi-cashier",
  scripts_by_app: { "module-select": 1 },
  scripts_total: 1
}

[module-select → cashier] Navigating to: {
  path: "/app/imogi-cashier",
  method: "frappe.set_route"  // ← CRITICAL: Must be frappe.set_route, NOT window.location
}

📍 [ROUTE LOADED] Cashier Console mounted {
  scripts_by_app: {
    "module-select": 1,
    "cashier-console": 1
  },
  scripts_total: 2
}
```

**✅ PASS if:**
- **NO full page reload** (network waterfall shows no document reload)
- URL changes to `/app/imogi-cashier`
- Log shows `method: "frappe.set_route"`
- `scripts_by_app` shows both apps

**❌ FAIL if:**
- Full page reload (entire page flashes)
- Log shows `method: "window.location"`
- Network tab shows document reload

---

### **Test 3: CSRF Token** (2 min)

**Action:** Click Cashier Console card (continues from Test 2)

**Expected:**
```javascript
[module-select] Calling setOperationalContext API: {pos_profile: 'Dirnosaurus', ...}
[module-select] setOperationalContext raw response: {message: {...}}
[module-select] Context set successfully: {pos_profile: 'Dirnosaurus', ...}
```

**✅ PASS if:**
- No `CSRFTokenError`
- No `400 Bad Request`
- Context set successfully
- Cashier loads without blocking

**❌ FAIL if:**
```javascript
❌ [module-select] setOperationalContext exception: {exc_type: 'CSRFTokenError'}
❌ Failed to set POS context: There was an error.
❌ POST /api/method/...set_operational_context 400
```

**Emergency Fix if FAIL:**
```javascript
// Test CSRF manually in console:
frappe.call({
  method: 'imogi_pos.utils.operational_context.set_operational_context',
  args: { pos_profile: 'Dirnosaurus', branch: 'Main' },
  callback: (r) => {
    if (r.exc) console.error('Server exception:', r.exc);
    else console.log('✅ Success:', r.message);
  },
  error: (err) => console.error('❌ Network error:', err)
})
```

---

### **Test 4: Back Navigation** (2 min)

**Action:** Click browser back button

**Expected:**
```javascript
[Desk] Module Select page shown: 2  // ← Counter incremented!
[Desk] Module Select UI restored (display reset)
```

**✅ PASS if:**
- Returns to module-select **instantly** (no reload)
- Counter incremented (e.g., `shown: 2`)
- Module cards still visible
- **State preserved** (if you had selected a POS profile, it's still there)

**❌ FAIL if:**
- Full page reload on back
- Counter reset to 1 (means page reloaded)
- State lost (POS profile selection cleared)

---

### **Test 5: Rapid Navigation** (2 min)

**Action:** Navigate 5 times quickly:
1. Module-select → Cashier → Back
2. Module-select → Kitchen → Back
3. Module-select → Waiter → Back
4. Module-select → Cashier → Back
5. Module-select → Kitchen → Back

**Expected:**
```javascript
// After 5 cycles:
const scripts = [...document.querySelectorAll('script[data-imogi-app]')]
const byApp = scripts.reduce((a,s)=>((a[s.dataset.imogiApp]=(a[s.dataset.imogiApp]||0)+1),a),{})
console.log(byApp)

// ✅ CORRECT (with proper guards):
{
  "module-select": 1,      // ← MUST be 1 (guard prevents re-injection)
  "cashier-console": 1,    // ← MUST be 1 (revisits re-mount, not re-inject)
  "kitchen": 1,            // ← MUST be 1
  "waiter": 1              // ← MUST be 1
}

// ❌ WRONG (guard broken):
{
  "module-select": 1,
  "cashier-console": 2,    // ← BAD: Re-injected on revisit!
  "kitchen": 2             // ← BAD: Guard not working!
}

// Note: Counts should remain 1 per app across revisits within a session.
// Revisits should re-mount/re-render, NOT re-inject script tags.
```

**✅ PASS if:**
- ALL app counts = 1 (guards prevent re-injection on revisits)
- No React errors (no TDZ, no Invariant #299)
- Navigation remains fast (< 1 second per transition)
- No console errors

**❌ FAIL if:**
- ANY app count > 1 (guard broken - script re-injected on revisit)
- React error: "Cannot access 'ue' before initialization"
- React error: "createRoot called twice"
- Navigation slows down progressively

---

### **Test 6: Manual Script Verification** (1 min)

**Action:** Run in console after Test 5:

```javascript
// 1. Check all scripts have data-imogi-app
const allScripts = [...document.querySelectorAll('script[src*="/react/"]')]
const withoutDataset = allScripts.filter(s => !s.dataset.imogiApp)
console.log('Scripts without dataset:', withoutDataset.length)
// Expected: 0

// 2. Check wrapper reference
frappe.pages['imogi-module-select']?.wrapper?.__imogiModuleSelectRoot
// Expected: <div#imogi-module-select-root>

// 3. Check active flag
window.__imogiModuleSelectActive
// Expected: true (if on module-select page)

// 4. Check bundle hash
document.querySelectorAll('script[data-imogi-app="module-select"]')[0].src
// Expected: .../main.DPeI_wSU.js (final production hash)
// Verification: ls -lt imogi_pos/public/react/module-select/static/js/main.*.js | head -1
```

**✅ PASS if:**
- All checks return expected values
- No undefined or null

**❌ FAIL if:**
- Scripts without dataset > 0
- Wrapper reference undefined
- Old bundle hash (not main.DPeI_wSU.js)

---

## 📊 Final Decision Matrix

| Test | Weight | Result | Notes |
|------|--------|--------|-------|
| 1. Initial Load | Medium | ⬜ | Must load without errors |
| 2. SPA Navigation | **CRITICAL** | ⬜ | **Must use frappe.set_route** |
| 3. CSRF Token | **CRITICAL** | ⬜ | **Must succeed, no 400** |
| 4. Back Navigation | High | ⬜ | State preservation |
| 5. Rapid Navigation | High | ⬜ | No double injection |
| 6. Script Verification | Medium | ⬜ | Data integrity |

**Go/No-Go Decision:**
- ✅ **GO if:** All CRITICAL + at least 3 other tests PASS
- ⚠️ **INVESTIGATE if:** 1 CRITICAL FAILS (fix before deploy)
- 🔴 **NO-GO if:** 2+ CRITICAL FAILS (rollback architecture)

---

## 🚨 Rollback Triggers

Immediately rollback if:
1. **CSRFTokenError persists** after hard refresh
2. **Double injection** confirmed (`module-select` count > 1)
3. **SPA broken** (full reload on every navigation)
4. **React crashes** (TDZ or Invariant #299 reappears)

**Rollback Command:**
```bash
cd ~/frappe-bench/apps/imogi_pos
git revert HEAD
cd ~/frappe-bench
bench build --app imogi_pos
bench restart
```

---

## ✅ Success Criteria

**READY FOR PRODUCTION if:**
- All 6 tests PASS
- Bundle hash = `main.DPeI_wSU.js`
- No console errors during 5-cycle rapid nav
- CSRF calls succeed consistently
- User feedback positive (optional: 2-3 beta testers)

---

## 📝 Post-Deployment Monitoring (24h)

**Watch for:**
1. CSRF error rate (should be 0%)
2. React error rate (should be 0%)
3. Navigation speed (< 1s per transition)
4. User complaints about:
   - "Page keeps reloading"
   - "Can't access Cashier"
   - "POS context error"

**Alert Thresholds:**
- 🟡 Warning: 1-5 CSRF errors/day
- 🔴 Critical: 10+ CSRF errors/day OR any React crashes

---

**Checklist Completed:** ⬜  
**Tested By:** _____________  
**Date/Time:** _____________  
**Decision:** ⬜ GO  ⬜ NO-GO  ⬜ INVESTIGATE  

**Notes:**
_______________________________________
_______________________________________
_______________________________________
