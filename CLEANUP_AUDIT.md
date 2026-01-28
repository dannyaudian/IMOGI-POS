# IMOGI POS - Cleanup & Consolidation Audit

**Date**: January 28, 2026  
**Auditor**: Senior Maintainer  
**Scope**: Permanent cleanup (bukan patch sementara)  
**Goal**: Eliminate dead code, consolidate logic, enforce unified patterns

---

## 📊 EXECUTIVE SUMMARY

### Current State
- **7 Desk Pages** mounting React bundles via Vite
- **15 React bundles** built (some unused in production)
- **30+ documentation files** with overlapping/outdated content
- **Legacy JS files** (3000+ LOC each) superseded by React
- **Scattered utils** across multiple files
- **Shared loader** (`imogi_loader.js`) already implemented ✅

### Findings
1. ✅ **Loader pattern unified** - All 6 active pages use `imogi_loader.js`
2. ⚠️ **4 large legacy JS files** (12,000+ LOC total) can be deleted
3. ⚠️ **9 unused React bundles** never used in production
4. ⚠️ **20+ doc files** need consolidation
5. ✅ **Operational context** already centralized in `operational_context.py`
6. ⚠️ **Request wrappers** need consolidation (apiCall vs frappe.call)

---

## 🗺️ ENTRY POINTS MAPPING

### A. Active Desk Pages (7 total)

| Page Route | Desk JS File | React Bundle | Mount Function | Status |
|------------|--------------|--------------|----------------|--------|
| `/app/imogi-module-select` | `imogi_module_select.js` | `module-select` | `imogiModuleSelectMount` | ✅ Active |
| `/app/imogi-cashier` | `imogi_cashier.js` | `cashier-console` | `imogiCashierMount` | ✅ Active |
| `/app/imogi-waiter` | `imogi_waiter.js` | `waiter` | `imogiWaiterMount` | ✅ Active |
| `/app/imogi-kitchen` | `imogi_kitchen.js` | `kitchen` | `imogiKitchenMount` | ✅ Active |
| `/app/imogi-displays` | `imogi_displays.js` | `customer-display` | `imogiDisplaysMount` | ✅ Active |
| `/app/imogi-tables` | `imogi_tables.js` | `table-display` | `imogiTablesMount` | ✅ Active |
| `/app/imogi-pos-launch` | `imogi_pos_launch.js` | _N/A (redirect)_ | - | ✅ Active |

**All 6 React-mounting pages use `window.loadImogiReactApp()` from `imogi_loader.js`** ✅

### B. React Bundles (15 manifests found)

#### ✅ Used in Production (6)
1. `module-select` → Module selection hub
2. `cashier-console` → POS cashier interface
3. `waiter` → Waiter order management
4. `kitchen` → Kitchen display system
5. `customer-display` → Customer-facing display
6. `table-display` → Restaurant floor view

#### ⚠️ Potentially Unused (9)
7. `cashier` - **Duplicate of cashier-console?**
8. `cashier-payment` - Payment-only mode?
9. `customer-display-editor` - Admin config tool?
10. `device-select` - Device management?
11. `kiosk` - Self-service kiosk?
12. `self-order` - Customer ordering?
13. `service-select` - Service type picker?
14. `table-display-editor` - Floor layout editor?
15. `table-layout-editor` - Another layout tool?

**Action Required**: Verify if bundles #7-15 have active routes or are obsolete.

### C. Legacy JS Files (4 large files)

| File | Size (LOC) | Purpose | Status |
|------|-----------|---------|--------|
| `cashier_console.js` | 3,091 | Legacy cashier logic | ⚠️ **REPLACED by React bundle** |
| `kitchen_display.js` | 2,952 | Legacy kitchen KDS | ⚠️ **REPLACED by React bundle** |
| `table_display.js` | 1,614 | Legacy table view | ⚠️ **REPLACED by React bundle** |
| `customer_display.js` | 1,057 | Legacy customer display | ⚠️ **REPLACED by React bundle** |
| **TOTAL** | **8,714 LOC** | | |

**These files define `frappe.provide()` namespaces but are NO LONGER LOADED by Desk pages.**

All Desk pages now use:
```javascript
window.loadImogiReactApp({
  appKey: 'cashier-console', // etc
  scriptUrl: '/assets/imogi_pos/react/cashier-console/static/js/main.*.js',
  // ... mounts React, NOT legacy JS
})
```

### D. Utility Files Analysis

#### JavaScript Utils
| File | Purpose | Status |
|------|---------|--------|
| `imogi_loader.js` | ✅ **Centralized loader** | **Keep - Core utility** |
| `frappe-minimal.js` | Minimal frappe API for standalone | Keep - WWW routes need it |
| `escpos_printing.js` | ESC/POS printer support | Keep - Active |
| `restaurant_table_qr.js` | QR code generation | Keep - Active |
| `modules/pos.js` | POS helpers | ⚠️ Check usage |
| `modules/displays.js` | Display helpers | ⚠️ Check usage |
| `utils/options.js` | Options utilities | ⚠️ Check usage |
| `print/*.js` | Print adapters (5 files) | Keep - Active |
| `doctype/*.js` | Doctype customizations | Keep - Active |

#### Python Utils
| File | Purpose | Status |
|------|---------|--------|
| `operational_context.py` | ✅ **Centralized context** | **Keep - Single source of truth** |
| `pos_profile_resolver.py` | POS Profile resolution | Keep - Active |
| `auth_helpers.py` | Auth utilities | Keep - Active |
| `auth_decorators.py` | Auth decorators | ⚠️ Check vs auth_helpers |
| `permissions.py` | Permission checks | Keep - Active |
| `role_permissions.py` | Role checks | ⚠️ Check vs permissions.py |
| `permission_manager.py` | Permission manager | ⚠️ Check vs permissions.py |

**Potential consolidation**: `auth_helpers.py` + `auth_decorators.py` → 1 file?  
**Potential consolidation**: `permissions.py` + `role_permissions.py` + `permission_manager.py` → 1 file?

---

## 🔍 DUPLIKASI LOGIC ANALYSIS

### 1. Loader Pattern ✅ ALREADY CONSOLIDATED

**Current State**: All 6 Desk pages use identical pattern:
```javascript
window.loadImogiReactApp({
  appKey: 'module-select',
  scriptUrl: '/assets/imogi_pos/react/module-select/static/js/main.*.js',
  cssUrl: '/assets/imogi_pos/react/module-select/static/css/main.*.css',
  mountFnName: 'imogiModuleSelectMount',
  unmountFnName: 'imogiModuleSelectUnmount',
  containerId: 'imogi-module-select-root',
  makeContainer: () => container,
  onReadyMount: (mountFn, containerEl) => { /* mount logic */ },
  page: page,
  logPrefix: '[Module Select]'
})
```

**Guards in place**:
- ✅ `data-imogi-app` attribute prevents double injection
- ✅ Script URL matching prevents duplicate loads
- ✅ Idempotent mounting (checks `__imogi{App}Mounted` flag)
- ✅ Cleanup on unmount

**No action required** - Pattern is already unified via `imogi_loader.js`.

### 2. Operational Context ✅ ALREADY CONSOLIDATED

**Single source**: `imogi_pos/utils/operational_context.py`

Key functions:
- `get_operational_context()` - Read from session
- `set_operational_context(pos_profile, branch)` - Write to session
- `require_operational_context()` - Decorator/guard
- `resolve_operational_context(user, requested_profile)` - Resolution logic

**All API endpoints import from this file**:
```python
from imogi_pos.utils.operational_context import require_operational_context, set_operational_context
```

**No action required** - Already centralized.

### 3. Request Wrapper ⚠️ NEEDS CONSOLIDATION

**Current State**: 2 patterns in use:

#### Pattern A: React apiCall() - `src/shared/utils/api.js`
```javascript
import { apiCall } from '@/shared/utils/api'

const response = await apiCall(
  'imogi_pos.api.billing.list_orders_for_cashier',
  { status: 'Ready' }
)
```

**Features**:
- Session expiry detection (401/403/417 + Guest + login HTML)
- Retry logic for network errors only
- Throws `SessionExpiredError` → triggers modal
- Uses `frappe.call()` first, falls back to `fetch()`

#### Pattern B: Direct frappe.call()
```javascript
frappe.call({
  method: 'imogi_pos.api.billing.list_orders_for_cashier',
  args: { status: 'Ready' },
  callback: (r) => {
    if (r.message) { /* ... */ }
  }
})
```

**No error handling, no session detection.**

**Action Required**:
1. ✅ `apiCall()` already exists in `src/shared/utils/api.js`
2. ⚠️ Not all React components use it yet
3. Recommendation: **Enforce apiCall() usage** in all React components

### 4. Error Handler ⚠️ NEEDS STANDARDIZATION

**Current State**: Fragmented

- `SessionExpired.jsx` - React component for auth failures ✅
- Manual `frappe.msgprint()` calls scattered everywhere
- Some use `console.error()` only
- No centralized error logging

**Action Required**:
1. Create `src/shared/utils/errorHandler.js` with:
   - `handleAPIError(error, context)` - Unified error display
   - `logError(error, context)` - Centralized logging (Sentry?)
   - `showUserError(title, message)` - User-friendly error UI
2. Update all React components to use it

---

## 📋 A) FILES TO DELETE

### Dead Code - Legacy JS (Replaced by React)

#### 1. Legacy Module JS Files (8,714 LOC)
```bash
# REASON: Replaced by React bundles, no longer loaded by Desk pages
imogi_pos/public/js/cashier_console.js        # 3,091 LOC → cashier-console React
imogi_pos/public/js/kitchen_display.js        # 2,952 LOC → kitchen React
imogi_pos/public/js/table_display.js          # 1,614 LOC → table-display React
imogi_pos/public/js/customer_display.js       # 1,057 LOC → customer-display React
```

**Verification**: 
- ✅ No Desk page loads these files
- ✅ No `<script src="...">` tags reference them
- ✅ React bundles fully replace functionality

#### 2. Customer Display Editor JS (if unused)
```bash
# REASON: Check if customer_display_editor.js is used by any Desk page
imogi_pos/public/js/customer_display_editor.js  # 1,000+ LOC?
```

**Verification needed**: Search for Desk page loading this file.

### Unused React Bundles (Verify First)

#### 3. Duplicate/Unused Bundles
```bash
# REASON: Verify if these have active routes or are build artifacts
imogi_pos/public/react/cashier/              # Duplicate of cashier-console?
imogi_pos/public/react/cashier-payment/      # Unused standalone payment?
imogi_pos/public/react/device-select/        # No Desk page?
imogi_pos/public/react/kiosk/                # Future feature never deployed?
imogi_pos/public/react/self-order/           # No active route?
imogi_pos/public/react/service-select/       # No Desk page?
imogi_pos/public/react/table-layout-editor/  # Admin tool never used?
imogi_pos/public/react/customer-display-editor/  # Admin tool never used?
imogi_pos/public/react/table-display-editor/ # Duplicate?
```

**Verification Command**:
```bash
# Search for routes using these bundles
grep -r "cashier-payment\|device-select\|kiosk\|self-order" imogi_pos/imogi_pos/page/
grep -r "service-select\|table-layout-editor\|table-display-editor" imogi_pos/imogi_pos/page/
```

### Obsolete Documentation

#### 4. Outdated/Duplicate Docs
```bash
# REASON: Superseded by newer docs, refer to old implementations
PHASE_1_5_COMPLETE_SUMMARY.md           # Superseded by TRUE_HYBRID_MIGRATION_COMPLETE.md
PHASE2_DOUBLE_MOUNT_FIX.md               # Incorporated into REACT_LOADER_REFACTOR.md
PHASE_4_5_TESTING_CHECKLIST.md          # Superseded by TESTING_GUIDE.md
CENTRALIZATION_REFACTOR_COMPLETE.md     # Duplicates CENTRALIZED_MODULES_ARCHITECTURE.md
REFACTORING_UPDATE_SUMMARY.md           # Interim summary, superseded
CRITICAL_PATCHES_APPLIED.md             # Superseded by specific fix docs
PRE_PRODUCTION_HARDENING_SUMMARY.md     # Superseded by SECURITY_SUMMARY.md
PERMISSION_FIXES_SUMMARY.md             # Incorporated into SECURITY_SUMMARY.md
DOCUMENTATION_CONSISTENCY_FIX.md        # Meta-doc, no longer needed
SESSION_EXPIRY_TESTING.md               # Test scenarios in TESTING_GUIDE.md
FINAL_GO_NOGO_CHECKLIST.md              # Deploy checklist superseded by PRODUCTION_DEPLOY_GUIDE.md
```

**Keep These Essential Docs**:
- `README.md` - Main project README
- `PRODUCTION_DEPLOY_GUIDE.md` - Deployment steps
- `TESTING_GUIDE.md` - Testing procedures
- `SECURITY_SUMMARY.md` - Security measures
- `REACT_ARCHITECTURE.md` - React structure
- `REACT_LOADER_REFACTOR.md` - Loader implementation
- `API_SESSION_HANDLING_FIX.md` - API patterns
- `ROUTE_TRANSITION_FIX.md` - Navigation patterns
- `IMOGI_POS_ARCHITECTURE.md` - System architecture
- `POS_PROFILE_CENTRALIZATION.md` - Context handling
- `CENTRALIZED_MODULES_ARCHITECTURE.md` - Module system

---

## 📋 B) FILES TO MODIFY

### 1. Desk Page Loaders - Minor Cleanup

All 6 Desk pages already use `imogi_loader.js` ✅, but need minor standardization:

#### `imogi_module_select.js` - Add navigation lock check ✅ ALREADY DONE
```javascript
// Line 36: Already has window.__imogiNavigationLock check
if (window.__imogiNavigationLock) {
  console.log('⛔ [DESK] Module Select skipping mount - navigation in progress');
  return;
}
```

#### `imogi_cashier.js`, `imogi_waiter.js`, etc. - Consistent logging
**Change**: Standardize log format across all pages
```javascript
// Before:
console.log('[Desk] Cashier page shown, route:', frappe.get_route_str());

// After:
console.log('🟢 [DESK PAGE SHOW] Cashier', {
  route: frappe.get_route_str(),
  timestamp: new Date().toISOString()
});
```

### 2. React Components - Enforce apiCall() Usage

**Files needing update** (estimate 20-30 components):
- Any component using direct `frappe.call()` without error handling
- Any component using `fetch()` without session detection

**Pattern to enforce**:
```javascript
import { apiCall } from '@/shared/utils/api'

try {
  const data = await apiCall('method.name', { args })
  // handle success
} catch (error) {
  if (error.name === 'SessionExpiredError') {
    // Handled by SessionExpiredProvider
    return
  }
  // Handle other errors
  console.error('API call failed:', error)
}
```

### 3. Create Unified Error Handler

**New file**: `src/shared/utils/errorHandler.js`
```javascript
/**
 * Centralized error handling for IMOGI POS
 */

export class APIError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'APIError'
    this.code = code
    this.details = details
  }
}

export function handleAPIError(error, context = {}) {
  console.error('[Error Handler]', { error, context })
  
  // Session expired - handled by SessionExpiredProvider
  if (error.name === 'SessionExpiredError') {
    return
  }
  
  // Network error
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    frappe.msgprint({
      title: 'Network Error',
      message: 'Unable to connect to server. Please check your connection.',
      indicator: 'red'
    })
    return
  }
  
  // API error
  if (error instanceof APIError) {
    frappe.msgprint({
      title: 'Error',
      message: error.message || 'An error occurred. Please try again.',
      indicator: 'red'
    })
    return
  }
  
  // Generic error
  frappe.msgprint({
    title: 'Unexpected Error',
    message: error.message || 'Something went wrong. Please contact support.',
    indicator: 'red'
  })
}

export function showUserError(title, message, indicator = 'orange') {
  frappe.msgprint({ title, message, indicator })
}

export function logError(error, context = {}) {
  // TODO: Send to Sentry/logging service
  console.error('[Error Log]', { error, context, timestamp: new Date().toISOString() })
}
```

### 4. Documentation - Create Master Docs

#### New: `DEVELOPER_GUIDE.md` - Consolidated dev documentation
```markdown
# IMOGI POS - Developer Guide

## Quick Start
- [Installation](#installation)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)

## Core Concepts
- [Desk Page Pattern](#desk-page-pattern)
- [React Bundle Loading](#react-bundle-loading)
- [API Call Pattern](#api-call-pattern)
- [Error Handling](#error-handling)
- [Operational Context](#operational-context)

## Deployment
- See [PRODUCTION_DEPLOY_GUIDE.md](PRODUCTION_DEPLOY_GUIDE.md)

## Testing
- See [TESTING_GUIDE.md](TESTING_GUIDE.md)

## Security
- See [SECURITY_SUMMARY.md](SECURITY_SUMMARY.md)
```

#### New: `TROUBLESHOOTING.md` - Consolidated troubleshooting
```markdown
# IMOGI POS - Troubleshooting Guide

## Common Issues

### Navigation Issues
- Double-click required → See [ROUTE_TRANSITION_FIX.md](ROUTE_TRANSITION_FIX.md)
- Route bounce-back → Check navigation lock
- Script counts > 1 → Run `window.__imogiDebugScripts()`

### API Issues
- 417 Expectation Failed → See [API_SESSION_HANDLING_FIX.md](API_SESSION_HANDLING_FIX.md)
- Session expired → Check SessionExpiredProvider
- CSRF token missing → Verify apiCall() usage

### React Mounting Issues
- Double mount → See [REACT_LOADER_REFACTOR.md](REACT_LOADER_REFACTOR.md)
- Blank screen → Check console for errors
- Script not loading → Verify manifest.json
```

---

## 📋 C) IMPLEMENTASI FINAL

### Step 1: Verify Unused Bundles
```bash
# Run this command to check if bundles are referenced
for bundle in cashier cashier-payment device-select kiosk self-order service-select table-layout-editor customer-display-editor table-display-editor; do
  echo "Checking $bundle..."
  grep -r "$bundle" imogi_pos/imogi_pos/page/ imogi_pos/www/ src/
done
```

### Step 2: Safe Deletion Procedure

#### Phase 1: Backup
```bash
# Create backup branch
git checkout -b cleanup/backup-before-delete
git add -A
git commit -m "Backup before cleanup"
git push origin cleanup/backup-before-delete

# Create cleanup branch
git checkout -b cleanup/permanent-refactor
```

#### Phase 2: Delete Legacy JS
```bash
# Delete legacy module JS files (8,714 LOC)
git rm imogi_pos/public/js/cashier_console.js
git rm imogi_pos/public/js/kitchen_display.js
git rm imogi_pos/public/js/table_display.js
git rm imogi_pos/public/js/customer_display.js

git commit -m "Remove legacy JS modules (replaced by React bundles)"
```

#### Phase 3: Delete Obsolete Docs
```bash
# Delete superseded documentation
git rm PHASE_1_5_COMPLETE_SUMMARY.md
git rm PHASE2_DOUBLE_MOUNT_FIX.md
git rm PHASE_4_5_TESTING_CHECKLIST.md
git rm CENTRALIZATION_REFACTOR_COMPLETE.md
git rm REFACTORING_UPDATE_SUMMARY.md
git rm CRITICAL_PATCHES_APPLIED.md
git rm PRE_PRODUCTION_HARDENING_SUMMARY.md
git rm PERMISSION_FIXES_SUMMARY.md
git rm DOCUMENTATION_CONSISTENCY_FIX.md
git rm SESSION_EXPIRY_TESTING.md
git rm FINAL_GO_NOGO_CHECKLIST.md

git commit -m "Remove obsolete documentation (superseded by current docs)"
```

#### Phase 4: Delete Unused React Bundles (after verification)
```bash
# Only delete if verification confirms they're unused
git rm -r imogi_pos/public/react/cashier/  # If duplicate
git rm -r imogi_pos/public/react/device-select/  # If no route
# ... etc

git commit -m "Remove unused React bundles (no active routes)"
```

### Step 3: Standardize Desk Page Logging

**File**: `imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js`
```javascript
frappe.pages['imogi-cashier'].on_page_show = function(wrapper) {
	console.log('🟢 [DESK PAGE SHOW] Cashier', {
		route: frappe.get_route_str(),
		timestamp: new Date().toISOString()
	});
	// ... rest of code
};
```

Repeat for: `imogi_waiter.js`, `imogi_kitchen.js`, `imogi_displays.js`, `imogi_tables.js`

### Step 4: Create Error Handler

**File**: `src/shared/utils/errorHandler.js` (full implementation above)

### Step 5: Update React Components to Use apiCall()

**Example PR**: Update 5-10 components at a time to use apiCall() pattern.

### Step 6: Create New Documentation

- `DEVELOPER_GUIDE.md` - Consolidated dev guide
- `TROUBLESHOOTING.md` - Consolidated troubleshooting

### Step 7: Update Main README

Update `README.md` to reference new docs:
```markdown
## Documentation

- **[Developer Guide](DEVELOPER_GUIDE.md)** - Complete development documentation
- **[Production Deploy Guide](PRODUCTION_DEPLOY_GUIDE.md)** - Deployment procedures
- **[Testing Guide](TESTING_GUIDE.md)** - Testing procedures
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions
- **[Security Summary](SECURITY_SUMMARY.md)** - Security measures
- **[Architecture](IMOGI_POS_ARCHITECTURE.md)** - System architecture
```

---

## 📋 D) CHECKLIST UJI MANUAL

### Pre-Deployment Testing

#### 1. Script Injection Verification
```javascript
// Open browser console on each page
window.__imogiDebugScripts()

// Expected output for each page:
// module-select: 1 script with data-imogi-app="module-select"
// cashier: 1 script with data-imogi-app="cashier-console"
// waiter: 1 script with data-imogi-app="waiter"
// kitchen: 1 script with data-imogi-app="kitchen"
// displays: 1 script with data-imogi-app="customer-display"
// tables: 1 script with data-imogi-app="table-display"
```

**Acceptance Criteria**: Each page should have **exactly 1 script** per app, no duplicates.

#### 2. Rapid Navigation Test (10x)
```
1. Open /app/imogi-module-select
2. Click Cashier → Wait for load → Check script count
3. Back to module-select → Check script count
4. Click Waiter → Wait for load → Check script count
5. Back to module-select → Check script count
6. Click Kitchen → Wait for load → Check script count
7. Back to module-select → Check script count
8. Click Customer Display → Wait for load → Check script count
9. Back to module-select → Check script count
10. Click Table Display → Wait for load → Check script count

Expected:
- No double-click required
- No route bounce-back
- Script counts remain 1 per app
- No console errors
- Navigation lock logs visible (🔒, 🔓)
```

#### 3. Hard Refresh Test
```
1. Navigate to /app/imogi-cashier
2. Perform hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. Verify page loads correctly
4. Check script count = 1
5. Test API calls work

Repeat for all 6 pages.
```

#### 4. Multi-Tab Test
```
1. Open Tab 1: /app/imogi-module-select
2. Open Tab 2: /app/imogi-cashier
3. Open Tab 3: /app/imogi-waiter
4. Switch between tabs rapidly
5. Verify each tab maintains state
6. Check script counts in each tab
7. Close Tab 2, verify Tab 1 and 3 unaffected
```

#### 5. Back/Forward Navigation
```
1. Navigate: module-select → cashier → waiter → kitchen
2. Click Back 3 times (kitchen → waiter → cashier → module-select)
3. Click Forward 2 times (module-select → cashier → waiter)
4. Verify:
   - Each navigation works correctly
   - Script counts remain 1
   - State preserved where appropriate
   - No navigation lock deadlocks
```

#### 6. Session Expiry Test
```
1. Login to system
2. Navigate to /app/imogi-cashier
3. In another tab, logout or expire session (clear cookies)
4. In cashier tab, trigger API call (e.g., load orders)
5. Verify:
   - SessionExpired modal appears
   - 30-second countdown visible
   - "Reload" button works
   - "Login" button works
   - No instant redirect
```

#### 7. Network Error Test
```
1. Open /app/imogi-cashier
2. Open DevTools → Network tab → Set throttling to "Offline"
3. Trigger API call (e.g., load orders)
4. Verify:
   - Error message displayed
   - User-friendly text
   - Retry option available
5. Set throttling back to "Online"
6. Retry API call → Should work
```

#### 8. Double Mount Prevention
```
1. Open /app/imogi-module-select
2. Open browser console
3. Click Cashier button
4. Monitor logs for:
   - Only ONE "CONTEXT SET START"
   - Only ONE "ROUTE TRANSITION START"
   - Only ONE React mount
5. Verify no "already mounted, skipping" messages
```

#### 9. Operational Context Consistency
```
1. Login as user with multiple POS Profiles
2. Navigate to /app/imogi-module-select
3. Select POS Profile "Profile A"
4. Navigate to Cashier → Verify context shows "Profile A"
5. API call to get_operational_context() → Should return "Profile A"
6. Back to module-select
7. Select POS Profile "Profile B"
8. Navigate to Waiter → Verify context shows "Profile B"
9. API call to get_operational_context() → Should return "Profile B"
```

#### 10. Permission Test
```
1. Login as user with limited roles (e.g., only Kitchen role)
2. Navigate to /app/imogi-module-select
3. Verify:
   - Only Kitchen module visible
   - Other modules disabled/hidden
4. Try to access /app/imogi-cashier directly → Should redirect or show error
5. Navigate to /app/imogi-kitchen → Should work
```

---

## 📋 E) FINAL VERIFICATION CHECKLIST

### Code Quality

- [ ] No duplicate script injections (`window.__imogiDebugScripts()` shows 1 per app)
- [ ] All Desk pages use `window.loadImogiReactApp()`
- [ ] All API calls use `apiCall()` from `@/shared/utils/api`
- [ ] All errors handled via `errorHandler.js`
- [ ] No direct `frappe.call()` without error handling
- [ ] No `fetch()` without session detection
- [ ] Navigation lock prevents duplicate clicks
- [ ] Premature remounts prevented

### Documentation

- [ ] Legacy docs deleted (11 files)
- [ ] New `DEVELOPER_GUIDE.md` created
- [ ] New `TROUBLESHOOTING.md` created
- [ ] Main `README.md` updated with doc links
- [ ] All links in docs verified (no 404s)

### Dead Code Removal

- [ ] Legacy JS files deleted (4 files, 8,714 LOC)
- [ ] Unused React bundles deleted (after verification)
- [ ] No broken imports after deletion
- [ ] Build succeeds: `npm run build:all`

### Testing

- [ ] All 10 manual tests passed
- [ ] Script counts verified on all pages
- [ ] No console errors on any page
- [ ] Session expiry flow works
- [ ] Network error handling works
- [ ] Multi-tab behavior correct
- [ ] Back/forward navigation works

### Deployment Ready

- [ ] Backup branch created
- [ ] All changes committed
- [ ] Build artifacts generated
- [ ] Bench migrate ready
- [ ] Rollback plan documented

---

## 🎯 SUCCESS CRITERIA

1. **Zero duplicate script injections** - Each page has exactly 1 script per app
2. **Zero dead code** - All unused JS/docs deleted
3. **Single source of truth** - Loader, context, API patterns unified
4. **Clear documentation** - 1-2 master docs for dev/deploy/troubleshooting
5. **Backward compatible** - No breaking API changes
6. **Production ready** - All manual tests pass

---

## 📌 NEXT STEPS

1. **Verify unused bundles** - Run grep commands to confirm bundles #7-15 are unused
2. **Create backup branch** - `git checkout -b cleanup/backup-before-delete`
3. **Delete dead code** - Phase 2 deletion procedure
4. **Standardize logging** - Update all Desk pages
5. **Create error handler** - New `errorHandler.js`
6. **Update components** - Enforce `apiCall()` usage
7. **Create new docs** - `DEVELOPER_GUIDE.md`, `TROUBLESHOOTING.md`
8. **Run manual tests** - All 10 tests
9. **Deploy to staging** - Verify before production
10. **Document rollback** - In case of issues

---

**End of Audit Document**
