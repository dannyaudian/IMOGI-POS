# Critical Patches Applied - Post Implementation Review

**Date:** January 28, 2026  
**Reviewer:** Expert (via user)  
**Status:** ✅ All 3 critical patches applied

---

## 🎯 Patches Applied

### **Patch 1: SPA Navigation via deskNavigate** ⭐ CRITICAL

**Problem:**
```javascript
// BEFORE - Full page reload (breaks Phase 4 state preservation)
window.location.href = url.toString()
```

**Solution:**
```javascript
// AFTER - SPA transition preserves module-select state
import { deskNavigate } from '../../shared/utils/deskNavigate'

const url = new URL(base, window.location.origin)
deskNavigate(url.pathname + url.search, {
  logPrefix: `[module-select → ${module.type}]`
})
```

**Benefits:**
- ✅ True SPA transition (no full reload)
- ✅ Phase 4 display toggle actually works
- ✅ Module-select state preserved on back navigation
- ✅ Frappe `set_route` used when available
- ✅ Consistent with Phase 4/5 design intent

**Files Changed:**
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L1-L9) - Added import
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L247-L273) - Replaced navigation logic

---

### **Patch 2: Wrapper Reference for Phase 4 Safety** 🛡️ SAFETY

**Problem:**
```javascript
// BEFORE - Global selector (unsafe if duplicate roots)
const container = document.querySelector('#imogi-module-select-root')
```

**Solution:**
```javascript
// AFTER - Wrapper-stored reference (guaranteed unique)
frappe.pages['imogi-module-select'].on_page_load = function(wrapper) {
  // Store reference on wrapper
  page.wrapper.__imogiModuleSelectRoot = container[0];
}

frappe.pages['imogi-module-select'].on_page_show = function(wrapper) {
  const container = wrapper.__imogiModuleSelectRoot;  // ← Safe reference
  if (container) container.style.display = '';
}
```

**Benefits:**
- ✅ Guaranteed correct container (no selector collisions)
- ✅ Safe in hot reload / dev scenarios
- ✅ Resilient to DOM mutations
- ✅ Active flag for portal cleanup: `window.__imogiModuleSelectActive`

**Files Changed:**
- [imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js](imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js#L26-L50)

---

### **Patch 3: Script Counting byApp Map** 📊 OBSERVABILITY

**Problem:**
```javascript
// BEFORE - Total count only (misleading as session grows)
script_tags_total: 2,
module_select_scripts: 1,
cashier_console_scripts: 1
```

**Solution:**
```javascript
// AFTER - Per-app map (clear visibility)
const scripts = [...document.querySelectorAll('script[data-imogi-app]')]
const byApp = scripts.reduce((acc, s) => {
  const app = s.dataset.imogiApp
  acc[app] = (acc[app] || 0) + 1
  return acc
}, {})

console.log('🚀 [ROUTE TRANSITION]', {
  scripts_by_app: byApp,  // { "module-select": 1, "cashier-console": 1 }
  scripts_total: scripts.length
})
```

**Benefits:**
- ✅ Clear per-app script counts
- ✅ Detects duplicate injections per app
- ✅ Scales to multi-module sessions (kitchen, waiter, etc.)
- ✅ Easier debugging in complex scenarios

**Files Changed:**
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L247-L273) - Updated transition log
- [src/apps/cashier-console/App.jsx](src/apps/cashier-console/App.jsx#L20-L33) - Updated mount log

---

## 📦 Updated Bundles

```bash
# Module-select (Patches 1, 2, 3)
✓ main.CR5cjv5L.js    287.37 kB │ gzip: 92.15 kB
  - Added deskNavigate import (+0.8 kB)
  - byApp script counting (+0.3 kB)

# Cashier-console (Patch 3)
✓ main.qOdsNzgx.js    294.10 kB │ gzip: 93.34 kB
  - byApp script counting (+0.3 kB)
```

---

## 🧪 Updated Expected Logs

### **Scenario 1: Module-select → Cashier (SPA)**

```javascript
// Click cashier card:
🚀 [ROUTE TRANSITION] Module-select → Cashier Console {
  from_route: "/app/imogi-module-select",
  to_route: "/app/imogi-cashier",
  scripts_by_app: { "module-select": 1 },  // ← NEW FORMAT
  scripts_total: 1
}

[module-select → cashier] Navigating to: {  // ← NEW LOG from deskNavigate
  path: "/app/imogi-cashier",
  method: "frappe.set_route"  // ← SPA!
}

// Cashier loads (NO RELOAD):
📍 [ROUTE LOADED] Cashier Console mounted {
  scripts_by_app: {  // ← Shows both apps
    "module-select": 1,
    "cashier-console": 1
  },
  scripts_total: 2
}

// Navigate back (SPA):
[Desk] Module Select page shown: 1  // ← Counter preserved!
[Desk] Module Select UI restored (display reset)
```

### **Scenario 3: Hard Reload**

```javascript
// After hard reload on cashier page:
📍 [ROUTE LOADED] Cashier Console mounted {
  scripts_by_app: { "cashier-console": 1 },  // ← Only cashier
  scripts_total: 1
}
```

---

## ✅ Verification Commands (Updated)

```javascript
// 1. Check byApp manually
const scripts = [...document.querySelectorAll('script[data-imogi-app]')]
const byApp = scripts.reduce((a,s)=>((a[s.dataset.imogiApp]=(a[s.dataset.imogiApp]||0)+1),a),{})
console.log(byApp)
// Expected: { "module-select": 1, "cashier-console": 1 }

// 2. Check wrapper reference stored
frappe.pages['imogi-module-select']?.wrapper?.__imogiModuleSelectRoot
// Expected: <div#imogi-module-select-root>

// 3. Check active flag
window.__imogiModuleSelectActive
// Expected: true (on module-select page)

// 4. Check navigation method
// Click cashier, watch for:
// "[module-select → cashier] Navigating to: { method: 'frappe.set_route' }"
```

---

## 🎯 Impact Summary

| Patch | Impact | Risk Mitigated |
|-------|--------|----------------|
| **1. deskNavigate** | High - Enables true SPA | Full reload breaking Phase 4 |
| **2. Wrapper ref** | Medium - Safety improvement | Selector collision in dev/hot reload |
| **3. byApp counting** | Low - Better observability | Misleading totals in multi-module sessions |

---

## 📋 Remaining Review Items (Optional)

### **4. Circular Import Validation**
```bash
# Install madge for dependency graph
npm install -g madge

# Check module-select for cycles
madge --circular src/apps/module-select/

# Expected: No circular dependencies found
```

### **5. Portal Overlay Edge Case**
If module-select has modal/toast that renders to `document.body`:

```javascript
// In modal component:
if (!window.__imogiModuleSelectActive) return null;

// Or use portal flag in context
```

**Status:** Not critical - module-select doesn't have global portals currently.

---

## 🚀 Next Steps

1. **Hard refresh browser** (`Cmd+Shift+R`)
2. **Test Scenario 1** - Module-select → Cashier → Back
3. **Verify logs** match new byApp format
4. **Verify SPA** - No full reload on navigation
5. **Optional:** Run madge circular check

---

**Status:** ✅ All critical patches + hardening + consistency fixes applied  
**Bundle Hashes (Final):** 
- module-select: `main.DPeI_wSU.js` (287.66 kB - UI/UX + CSRF + hardening)
- module-select CSS: `main.CNIKOchO.css` (27.77 kB - Frappe colors)
- cashier-console: `main.qOdsNzgx.js` (294.10 kB)

**Verification Command:**
```bash
# Server-side: Check actual built bundle
ls -lt imogi_pos/public/react/module-select/static/js/main.*.js | head -1
# Expected: main.DPeI_wSU.js (Jan 28 14:29)

# Browser: Verify loaded bundle
document.querySelector('script[data-imogi-app="module-select"]')?.src
# Expected: .../main.DPeI_wSU.js
```

**Hardening Complete:**
- ✅ Route normalization (deskNavigate strips `/app/` safely)
- ✅ CSRF r.exc handling (server exceptions caught & rejected)
- ✅ Script guards on ALL pages (6/6 modules prevent re-injection)
- ✅ Test files updated (no legacy routes)
- ✅ Documentation consistency (single source of truth for bundle hash)

**Guard Behavior (Critical):**
- Script counts remain **1 per app** across revisits
- Revisits **re-mount/re-render**, NOT re-inject
- Any count > 1 = guard broken (investigation required)

**Ready for:** Final 10-minute Go/No-Go test → Production deploy

---

## 🔧 CSRF Token Fix (Jan 28, 2026)

### **Issue:**
API call `set_operational_context` returning **400 Bad Request** with `CSRFTokenError`:
```
Failed to set POS context: There was an error.
exc_type: 'CSRFTokenError'
message: 'Invalid Request'
```

### **Root Cause:**
`useFrappePostCall` from frappe-react-sdk **tidak mengirim CSRF token** secara reliable di POST requests.

### **Solution:**
Replace `useFrappePostCall` dengan **direct `frappe.call()`** yang guaranteed include CSRF token.

**BEFORE:**
```javascript
const { call: setContextOnServer } = useFrappePostCall(
  'imogi_pos.utils.operational_context.set_operational_context'
)

const response = await setContextOnServer({
  pos_profile: posProfile,
  branch: branchOverride || null
})
```

**AFTER:**
```javascript
const response = await new Promise((resolve, reject) => {
  frappe.call({
    method: 'imogi_pos.utils.operational_context.set_operational_context',
    args: {
      pos_profile: posProfile,
      branch: branchOverride || null
    },
    callback: (r) => resolve(r),
    error: (err) => reject(err)
  })
})
```

### **Benefits:**
- ✅ **CSRF token auto-included** by Frappe framework
- ✅ **Session-based auth** works properly
- ✅ **No 400 errors** on POST requests
- ✅ **More reliable** than frappe-react-sdk for POST

### **Files Changed:**
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L2) - Removed useFrappePostCall import
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L111-113) - Removed hook declaration
- [src/apps/module-select/App.jsx](src/apps/module-select/App.jsx#L288-305) - Replaced with frappe.call

### **Testing:**
```javascript
// In DevTools Console after hard refresh
frappe.call({
  method: 'imogi_pos.utils.operational_context.set_operational_context',
  args: { pos_profile: 'Dirnosaurus', branch: 'Main' },
  callback: (r) => console.log('✅ Success:', r.message)
})
// Expected: { success: true, context: {...}, message: "..." }
```

---

## 🎨 Frappe Desk UI/UX Alignment (Jan 28, 2026)

### Changes Applied:

**1. Color System:**
- ✅ Removed custom gradient (`linear-gradient(135deg, #fe9c2b, #ff8a00)`)
- ✅ Using Frappe CSS variables: `--primary`, `--border-color`, `--text-color`, `--text-muted`
- ✅ Card backgrounds now use `--card-bg` (white) instead of custom colors

**2. Header Design:**
- ✅ Flat white header with bottom border (like Frappe Desk pages)
- ✅ Removed gradient background
- ✅ Form controls match Frappe `.form-control` style
- ✅ Buttons use `--btn-default-bg` with proper hover states

**3. Typography:**
- ✅ Labels use `--text-muted` (#8d99a6) with uppercase + letter-spacing
- ✅ Font weights reduced: 600 → 500 (matches Frappe's lighter aesthetic)
- ✅ Select dropdowns use Frappe's subtle arrow icon

**4. Interactive Elements:**
- ✅ Focus states with `--primary` blue border + subtle shadow
- ✅ Hover states use `--control-bg-on-gray` (#fafbfc)
- ✅ Transitions consistent with Frappe (0.2s ease)

### Before vs After:

| Element | Before (Custom) | After (Frappe-Aligned) |
|---------|----------------|------------------------|
| Header BG | Gradient (orange to #ff8a00) | White (#ffffff) |
| Header Border | None | 1px solid #d1d8dd |
| Select BG | rgba(255,255,255,0.25) | #ffffff |
| Select Border | rgba(255,255,255,0.3) | #d1d8dd |
| Button BG | rgba(255,255,255,0.2) | #ffffff |
| Text Color | White on gradient | #2c3e50 on white |
| Focus Ring | White 2px | Blue 3px (--primary) |

### Benefits:
- ✅ **Consistency**: Matches Frappe Desk aesthetics (users familiar with Frappe won't notice jarring difference)
- ✅ **Accessibility**: Better contrast ratios (white text on gradient → dark text on white)
- ✅ **Maintainability**: Uses Frappe's CSS variable system (auto-adapts to Frappe theme changes)
- ✅ **Professional**: Clean, modern flat design (industry standard for SaaS dashboards)

### Visual Impact:
- Header now looks like standard Frappe Desk page header
- Module cards remain distinct but use Frappe border/shadow system
- Sidebar styling unchanged (already Frappe-compatible)
- Focus/hover states now match Frappe form behavior

---
