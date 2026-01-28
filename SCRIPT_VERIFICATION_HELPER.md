# Script Injection Verification Helper

## 🎯 Purpose
Verify that each React app injects exactly **1 script** per page (no duplicates).

## 🔧 How to Use

### Step 1: Start Development Server
```bash
bench start
# Or production: bench restart
```

### Step 2: Open Each Page in Browser

Navigate to each of these pages:

1. **Module Select**: `/app/imogi-module-select`
2. **Cashier**: `/app/imogi-cashier`
3. **Waiter**: `/app/imogi-waiter`
4. **Kitchen**: `/app/imogi-kitchen`
5. **Customer Display**: `/app/imogi-displays`
6. **Table Display**: `/app/imogi-tables`

### Step 3: Run Debug Command in Console

On **each page**, open DevTools (F12 or Cmd+Option+I) and run:

```javascript
window.__imogiDebugScripts()
```

### Expected Output (CORRECT)

```javascript
🔍 [IMOGI DEBUG] Script Analysis
================================
App: module-select
Script Count: 1 ✅

Scripts Found:
1. /assets/imogi_pos/public/react/module-select/static/js/main.xxxxxx.js
   - Has data-imogi-app: ✓
   - App name: module-select
```

### Expected Output Per Page

| Page | App Name | Expected Count | Notes |
|------|----------|----------------|-------|
| `/app/imogi-module-select` | `module-select` | 1 ✅ | Entry point |
| `/app/imogi-cashier` | `cashier-console` | 1 ✅ | Cashier workspace |
| `/app/imogi-waiter` | `waiter` | 1 ✅ | Waiter workspace |
| `/app/imogi-kitchen` | `kitchen` | 1 ✅ | Kitchen display |
| `/app/imogi-displays` | `customer-display` | 1 ✅ | Customer display |
| `/app/imogi-tables` | `table-display` | 1 ✅ | Table display |

### ❌ BAD Output (Multiple Scripts - Should NOT happen)

```javascript
🔍 [IMOGI DEBUG] Script Analysis
================================
App: cashier-console
Script Count: 2 ⚠️  DUPLICATES DETECTED!

Scripts Found:
1. /assets/imogi_pos/public/react/cashier-console/static/js/main.abc123.js
   - Has data-imogi-app: ✓
   - App name: cashier-console
2. /assets/imogi_pos/public/react/cashier-console/static/js/main.def456.js
   - Has data-imogi-app: ✓
   - App name: cashier-console

⚠️  WARNING: Multiple scripts detected for the same app!
```

**If you see this**, it means:
- Script guard (`data-imogi-app`) is not working
- React app is mounting multiple times
- Need to investigate loader logic in `imogi_loader.js`

### Step 4: Document Results

Fill in this table:

| Page | Script Count | Status | Notes |
|------|--------------|--------|-------|
| `/app/imogi-module-select` | ___ | ✅/❌ | |
| `/app/imogi-cashier` | ___ | ✅/❌ | |
| `/app/imogi-waiter` | ___ | ✅/❌ | |
| `/app/imogi-kitchen` | ___ | ✅/❌ | |
| `/app/imogi-displays` | ___ | ✅/❌ | |
| `/app/imogi-tables` | ___ | ✅/❌ | |

### Step 5: Additional Checks

On each page, also verify in console:

```javascript
// 1. Check for double mount logs (should see only ONE of each):
// Expected:
// 🟢 [DESK PAGE SHOW] Cashier { route: '/app/imogi-cashier', timestamp: '...' }
// [React] App mounting: cashier-console

// 2. Check operational context (should be consistent):
window.__imogiOperationalContext
// Expected: { pos_profile: "...", branch: "...", device: "..." }
```

### ✅ Success Criteria

- [ ] All 6 pages show **exactly 1 script** per app
- [ ] No "DUPLICATES DETECTED" warnings
- [ ] All scripts have `data-imogi-app` attribute
- [ ] Console logs show clean mounting (no double mounts)
- [ ] Operational context present on all pages

### 🐛 Troubleshooting

**If you see duplicates**:
1. Check if page calls `loadImogiReactApp()` multiple times
2. Check if Desk page has old script tags hardcoded
3. Check if React component calls `loadImogiReactApp()` on mount
4. Review `imogi_loader.js` guard logic

**If script count is 0**:
1. Check console for errors
2. Check if bundle build exists: `ls -la imogi_pos/public/react/{app-name}/`
3. Check if manifest.json exists
4. Run `npm run build:all`

**If no `data-imogi-app` attribute**:
1. Check `imogi_loader.js` - ensure it sets attribute when creating script
2. This means script was injected outside the loader

---

## 📋 Quick Test Checklist

Run this after any changes to loader or Desk pages:

```bash
# 1. Rebuild all apps
npm run build:all

# 2. Clear Frappe cache
bench --site [site-name] clear-cache

# 3. Restart bench
bench restart

# 4. Open browser, test each page
# 5. Run window.__imogiDebugScripts() on each page
# 6. Document results
```

---

**Time to complete**: ~10 minutes (6 pages × ~90 seconds each)

**Reference**: See [PERMANENT_CLEANUP_IMPLEMENTATION.md](PERMANENT_CLEANUP_IMPLEMENTATION.md) Section D for full testing checklist.
