# Phase 4 & 5 Implementation - Manual Testing Checklist

## 📋 Testing Scenarios

### 🟢 Scenario 1: Normal Flow (Happy Path)
**Steps:**
1. Open browser to `/app/imogi-module-select`
2. Click "Cashier Console" module card
3. Verify navigation to `/app/imogi-cashier`
4. Navigate back using browser back button or Frappe breadcrumb
5. Verify module-select UI is visible

**Expected Console Logs:**
```javascript
// On module-select click:
🚀 [ROUTE TRANSITION] Module-select → Cashier Console {
  from_route: "/app/imogi-module-select",
  to_route: "/app/imogi-cashier",
  module_type: "cashier",
  module_name: "Cashier Console",
  script_tags_total: 1,
  module_select_scripts: 1,
  timestamp: "2026-01-28T..."
}

// On cashier load:
[Desk] Cashier page on_page_load: 1
📍 [ROUTE LOADED] Cashier Console mounted {
  current_route: "/app/imogi-cashier",
  script_tags_total: 2,  // module-select + cashier-console
  cashier_console_scripts: 1,
  initial_state: true,
  timestamp: "2026-01-28T..."
}

// On navigate back:
[Desk] Module Select page shown: 1
[Desk] Module Select UI restored (display reset)
```

**Verification:**
- ✅ Module-select → cashier transition logged with emoji 🚀
- ✅ Cashier mount logged with emoji 📍
- ✅ Script tag count = 2 (both bundles loaded)
- ✅ Module-select UI restored when navigating back

---

### 🔄 Scenario 2: Multi-Tab Navigation
**Steps:**
1. Open `/app/imogi-module-select` in Tab 1
2. Open `/app/imogi-cashier` in Tab 2 (new tab)
3. Switch between tabs
4. Close Tab 2
5. Verify Tab 1 still functional

**Expected Behavior:**
- Each tab has independent script injection
- No DOM overlay/clash between tabs
- Console logs show separate counters per tab

**Verification:**
- ✅ Tab 1 module-select UI remains functional
- ✅ Tab 2 cashier loads independently
- ✅ No console errors about duplicate roots

---

### 🔙 Scenario 3: Hard Reload
**Steps:**
1. Navigate to `/app/imogi-module-select`
2. Click any module (e.g., Cashier)
3. On target page, press `Cmd+R` (macOS) or `Ctrl+R` (Windows)
4. Verify page reloads cleanly

**Expected Console Logs:**
```javascript
// After hard reload:
[Desk] Cashier page on_page_load: 1  // Counter resets
📍 [ROUTE LOADED] Cashier Console mounted {
  script_tags_total: 1,  // Only cashier script (module-select gone)
  cashier_console_scripts: 1
}
```

**Verification:**
- ✅ Script tag count = 1 (old bundle removed on reload)
- ✅ No stale module-select script tags
- ✅ Page functions normally after reload

---

### 🎯 Scenario 4: Rapid Navigation (Stress Test)
**Steps:**
1. Open `/app/imogi-module-select`
2. Click Cashier → immediately click back button
3. Repeat 5 times rapidly
4. Click Kitchen → back → Waiter → back
5. Verify no errors, no double-mounts

**Expected Behavior:**
- Page hide/show logs increment counters
- Display toggles between '' and 'none'
- No React errors about multiple roots

**Expected Console Pattern:**
```javascript
[Desk] Module Select page hidden: 1
[Desk] Module Select UI hidden (display:none)
// ... navigation ...
[Desk] Module Select page shown: 2
[Desk] Module Select UI restored (display reset)
[Desk] Module Select page hidden: 2
// ... etc
```

**Verification:**
- ✅ Counters increment correctly
- ✅ Display toggles prevent UI overlay
- ✅ No "createRoot called twice" errors

---

### 🧪 Scenario 5: Debug Verification Commands

**Run in browser console at `/app/imogi-module-select`:**
```javascript
// 1. Check version stamp
window.__imogiModuleSelectMountVersion
// Expected: "phase2-scan-fix-20260128"

// 2. Count script tags
document.querySelectorAll('script[data-imogi-app]').length
// Expected: 1 (only module-select on this page)

// 3. Check display state
document.getElementById('imogi-module-select-root').style.display
// Expected: "" (empty string = visible)

// 4. Navigate to cashier, then check:
document.querySelectorAll('script[data-imogi-app]').length
// Expected: 2 (module-select + cashier-console)

// 5. Go back, check display restored
document.getElementById('imogi-module-select-root').style.display
// Expected: "" (restored from 'none')
```

---

## ✅ Success Criteria

### Phase 4 (DOM Lifecycle Safety):
- [ ] Module-select UI hidden (`display:none`) when navigating away
- [ ] Module-select UI restored (`display:''`) when navigating back
- [ ] No DOM overlay/clash between module-select and other pages
- [ ] State preserved (no unmount) on page hide

### Phase 5 (Route Transition Instrumentation):
- [ ] 🚀 emoji log on module-select click (from/to routes)
- [ ] 📍 emoji log on target page mount (script tag counts)
- [ ] Timestamp present in all route logs
- [ ] Script tag counts accurate (1 on single page, 2+ on history stack)
- [ ] Console logs easy to filter by emoji

---

## 🐛 Common Issues to Watch For

### Issue: Module-select UI still visible after navigation
**Symptom:** Two UIs overlapping on screen  
**Debug:**
```javascript
document.getElementById('imogi-module-select-root').style.display
// Should be 'none' when on cashier page
```
**Fix:** Check Phase 4 implementation in `on_page_hide`

### Issue: UI doesn't restore on back navigation
**Symptom:** Module-select page blank after going back  
**Debug:**
```javascript
document.getElementById('imogi-module-select-root').style.display
// Should be '' (empty) on module-select page
```
**Fix:** Check Phase 4 implementation in `on_page_show`

### Issue: Script tag count wrong
**Symptom:** Counter shows unexpected numbers  
**Debug:**
```javascript
[...document.querySelectorAll('script[data-imogi-app]')].map(s => s.dataset.imogiApp)
// Should show array like: ['module-select', 'cashier-console']
```
**Fix:** Check manifest.json build output, verify data attributes

---

## 📝 Test Report Template

```
Date: ___________
Tester: ___________

Scenario 1 (Normal Flow): ☐ PASS ☐ FAIL
Notes: _______________________________________

Scenario 2 (Multi-Tab): ☐ PASS ☐ FAIL
Notes: _______________________________________

Scenario 3 (Hard Reload): ☐ PASS ☐ FAIL
Notes: _______________________________________

Scenario 4 (Rapid Nav): ☐ PASS ☐ FAIL
Notes: _______________________________________

Scenario 5 (Debug Commands): ☐ PASS ☐ FAIL
Notes: _______________________________________

Phase 4 Criteria: ☐ ALL PASS ☐ PARTIAL ☐ FAIL
Phase 5 Criteria: ☐ ALL PASS ☐ PARTIAL ☐ FAIL

Overall Status: ☐ READY FOR PROD ☐ NEEDS FIX
```
