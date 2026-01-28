# Utils Consolidation Audit - IMOGI POS

**Date**: January 28, 2026  
**Scope**: Consolidate duplicate utility functions across JS and PY modules

---

## 🎯 Objectives

1. **Eliminate duplicate utility functions** in JS and PY
2. **Create clear, centralized utils structure**
3. **Standardize logging format**: `[imogi][module] message`
4. **Consistent error handling**:
   - `r.exc` = error
   - 401/403 = session expired (toast + redirect once, no loop)
   - 417 = log detail, don't trigger login unless genuinely auth issue
5. **Update all modules** to use centralized utils
6. **Delete deprecated utils** after migration

---

## 📊 AUDIT RESULTS

### 1. Request Wrapper / API Call Patterns

#### ✅ EXISTING CENTRALIZED (Keep & Enhance)

**Location**: `src/shared/utils/api.js` (320 lines)

**Functions**:
- `apiCall(method, args, options)` - Main API wrapper
- `callViaFrappe()` - Prefer frappe.call
- `callViaFetch()` - Fallback with CSRF
- `normalizeResponse()` - Normalize to r.message format
- `isSessionExpired()` - Detect expired session
- `handleSessionExpired()` - Show modal, redirect once
- `isAuthError()` - Detect 401/403/417
- `showError()` - User-friendly error display

**Features**:
- ✅ Session expiry detection
- ✅ CSRF token handling
- ✅ Retry logic (network only)
- ✅ Comprehensive logging
- ⚠️ Logging format: `[imogi-api]` (needs update to `[imogi][api]`)

#### ❌ DUPLICATE PATTERNS (Found in 20+ files)

**Direct frappe.call usage** (no centralized handler):
```javascript
// Found in 23 files across src/apps/
frappe.call({
  method: '...',
  args: {...},
  callback: (r) => { /* manual handling */ },
  error: (r) => { /* manual handling */ }
})
```

**Files using direct frappe.call**:
1. `src/apps/table-layout-editor/App.jsx` - 1 usage
2. `src/apps/table-display-editor/App.jsx` - 4 usages
3. `src/apps/cashier-payment/hooks/useQRISPayment.js` - 1 usage
4. `src/apps/cashier-payment/components/CustomerInfo.jsx` - 2 usages
5. `src/apps/module-select/App.jsx` - 2 usages
6. `src/apps/module-select/components/BranchSelector.jsx` - 1 usage
7. `src/apps/cashier-console/App.jsx` - 2 usages
8. `src/apps/cashier-console/components/CatalogView.jsx` - 2 usages
9. `src/apps/cashier-console/components/VariantPickerModal.jsx` - 1 usage
10. `src/apps/customer-display-editor/App.jsx` - 1 usage

**Total**: 23 direct `frappe.call` usages that should use `apiCall()` instead.

---

### 2. Operational Context Get/Set

#### ✅ EXISTING CENTRALIZED (Keep)

**Python**: `imogi_pos/utils/operational_context.py` (597 lines)

**Functions**:
- `get_user_role_class()` - Classify user role
- `require_operational_context()` - Decorator to enforce context
- `get_operational_context()` - Get active context
- `set_operational_context()` - Set context
- `clear_operational_context()` - Clear context
- `get_context_branch()` - Get branch from context
- `resolve_pos_profile()` - Resolve POS Profile

**Features**:
- ✅ Centralized role classification
- ✅ Session-based context storage
- ✅ Integration with pos_profile_resolver
- ⚠️ Logging format: Generic (needs `[imogi][context]` prefix)

**JavaScript**: `src/shared/hooks/useOperationalContext.js` (160 lines)

**Functions**:
- `useOperationalContext()` - React hook for context
- `fetchOperationalContext()` - Fetch from backend
- `updateOperationalContext()` - Update context

**Features**:
- ✅ sessionStorage caching
- ✅ React hook integration
- ⚠️ Uses `frappe.call` directly (should use `apiCall`)

#### ❌ NO DUPLICATES FOUND

Operational context is already centralized. No cleanup needed.

---

### 3. Auth / Session Handling

#### ✅ EXISTING CENTRALIZED (Keep & Enhance)

**Python**: `imogi_pos/utils/auth_decorators.py` (220 lines)

**Functions**:
- `require_pos_role()` - Decorator for POS role check
- `require_branch_access()` - Decorator for branch access
- Integrated with `operational_context.py`

**Features**:
- ✅ Uses `frappe.throw()` with `frappe.PermissionError`
- ✅ Consistent error messages
- ⚠️ No standard logging prefix

**Python**: `imogi_pos/utils/auth_helpers.py` (exists but not audited yet)

**JavaScript**: `src/shared/components/SessionExpired.jsx` (120 lines)

**Features**:
- ✅ Full-screen modal with 30s countdown
- ✅ Reload/Login buttons
- ✅ No instant redirect
- ✅ Integrated with api.js

#### ⚠️ INCONSISTENT 417 HANDLING

**Problem**: 417 (Expectation Failed) is currently treated as auth error in `api.js`:

```javascript
function isAuthError(error) {
  const status = error.httpStatus || (error._frappe_error && error._frappe_error.httpStatus)
  return status === 401 || status === 403 || status === 417  // 417 = session expired?
}
```

**Reality**: 417 can be:
- Session expired (genuine auth issue)
- Validation error (NOT auth issue)
- Business logic error (NOT auth issue)

**Fix Needed**: Check `r.exc` content to determine if 417 is truly auth-related.

---

### 4. Route Helper / set_route Wrapper

#### ✅ EXISTING CENTRALIZED (Keep)

**Location**: `src/shared/utils/deskNavigate.js` (170 lines)

**Functions**:
- `deskNavigate(path, options)` - Main navigation wrapper
- `navigateToModuleSelect(reason, params)` - Helper for module-select
- Global navigation lock (prevents double navigation)

**Features**:
- ✅ Prefers `frappe.set_route()`
- ✅ Fallback to `window.location`
- ✅ Query param handling
- ✅ Global lock to prevent bounce-back
- ⚠️ Logging format: Custom emoji + `[DESK-NAV]` (needs standardization)

#### ❌ DIRECT USAGE FOUND (2 files)

1. `src/apps/waiter/App.jsx` - Line 63-64:
   ```javascript
   if (typeof frappe !== 'undefined' && frappe.set_route) {
     frappe.set_route('imogi-module-select', { ... })
   }
   ```

2. `src/apps/module-select/App.jsx` - Line 272:
   ```javascript
   deskNavigate(url.pathname + url.search, { ... })
   ```
   (This one is correct, using centralized helper)

**Fix**: Replace direct `frappe.set_route` in waiter app with `deskNavigate()`.

---

### 5. Cache / localStorage Cleanup

#### ⚠️ SCATTERED USAGE (Needs Consolidation)

**sessionStorage usage** (3 locations):
1. `src/shared/hooks/useOperationalContext.js`:
   - Key: `imogi_operational_context`
   - Purpose: Cache operational context

**localStorage usage** (4 locations):
1. `src/shared/components/POSOpeningModal.jsx`:
   - Key: `imogi_pos_opening_entry`
   - Purpose: Cache opening entry

2. `src/apps/module-select/components/BranchSelector.jsx`:
   - Key: `imogi_selected_branch`
   - Purpose: Store selected branch

3. `src/apps/module-select/App.jsx` (2 usages):
   - Key: `imogi_debug_logs`
   - Purpose: Debug logging

**Problems**:
- ❌ No centralized storage utility
- ❌ No consistent key naming
- ❌ No TTL/expiry mechanism
- ❌ No clear() helper for logout

#### 🆕 NEEDS CREATION: `storage.js`

Consolidate all storage operations:
- `getItem(key)` - Get with optional TTL check
- `setItem(key, value, ttl)` - Set with optional TTL
- `removeItem(key)` - Remove single item
- `clear()` - Clear all imogi_* keys
- `clearOnLogout()` - Clear on session end

---

## 📋 PROPOSED STRUCTURE

### JavaScript Utils

```
imogi_pos/public/js/utils/
├── request.js         # Centralized API call wrapper
├── route.js           # Navigation helpers
├── loader.js          # React bundle loader (already exists)
└── storage.js         # localStorage/sessionStorage wrapper (NEW)
```

**OR** (if keeping React utils in `src/shared/`):

```
src/shared/utils/
├── api.js             # ✅ Already exists (enhance)
├── deskNavigate.js    # ✅ Already exists (standardize logging)
├── errorHandler.js    # ✅ Already exists (minor updates)
├── storage.js         # 🆕 NEW - Consolidate cache operations
└── logger.js          # 🆕 NEW - Standard logging format
```

### Python Utils

```
imogi_pos/utils/
├── operational_context.py  # ✅ Already exists (add logging)
├── auth_decorators.py      # ✅ Already exists (add logging)
├── auth_helpers.py         # ✅ Already exists (audit needed)
└── response.py             # 🆕 NEW - Standard response formatting
```

---

## 🔍 DUPLICATIONS FOUND

### High Priority (Must Fix)

1. **23 direct `frappe.call` usages** → Migrate to `apiCall()`
   - Risk: Inconsistent error handling, no session detection
   - Impact: 10 files across React apps
   - Effort: 2-3 hours (systematic replacement)

2. **No centralized storage utility** → Create `storage.js`
   - Risk: No TTL, no logout cleanup, scattered keys
   - Impact: 4 files with localStorage/sessionStorage
   - Effort: 1 hour (new file + migration)

3. **Inconsistent 417 handling** → Fix auth detection in `api.js`
   - Risk: False positive redirects to login
   - Impact: All API calls
   - Effort: 30 minutes (logic update + testing)

### Medium Priority (Should Fix)

4. **Inconsistent logging format** → Create `logger.js`, standardize all logs
   - Current: `[imogi-api]`, `[DESK-NAV]`, generic
   - Target: `[imogi][api]`, `[imogi][nav]`, `[imogi][context]`
   - Impact: All utility files
   - Effort: 1-2 hours (create logger + update 6 files)

5. **Direct `frappe.set_route` in waiter** → Use `deskNavigate()`
   - Risk: Missing navigation lock, inconsistent behavior
   - Impact: 1 file
   - Effort: 10 minutes

### Low Priority (Nice to Have)

6. **No centralized response formatter (Python)** → Create `response.py`
   - Risk: Minor - inconsistent response structures
   - Impact: API endpoints
   - Effort: 1 hour

---

## 📝 FILES TO CREATE

### 1. `src/shared/utils/storage.js` (NEW)

**Purpose**: Centralize localStorage/sessionStorage operations

**Functions**:
```javascript
// Get item (with optional TTL check)
export function getItem(key, useSession = false)

// Set item (with optional TTL in seconds)
export function setItem(key, value, ttl = null, useSession = false)

// Remove item
export function removeItem(key, useSession = false)

// Clear all imogi_* keys
export function clearAll()

// Clear on logout (keep only persistent keys)
export function clearOnLogout()

// Check if item is expired (TTL check)
function isExpired(storedData)

// Standard logging
console.log('[imogi][storage] Set:', key, ttl ? `(TTL: ${ttl}s)` : '')
```

**Keys to migrate**:
- `imogi_operational_context` (sessionStorage)
- `imogi_pos_opening_entry` (localStorage)
- `imogi_selected_branch` (localStorage)
- `imogi_debug_logs` (localStorage)

### 2. `src/shared/utils/logger.js` (NEW)

**Purpose**: Standard logging format across all utils

**Functions**:
```javascript
// Standard log
export function log(module, message, data = null)
// Output: [imogi][module] message {data}

// Debug log (only if __IMOGI_DEBUG__ enabled)
export function debug(module, message, data = null)

// Error log
export function error(module, message, error = null)
// Output: [imogi][module] ❌ message {error.message, stack}

// Warning log
export function warn(module, message, data = null)
// Output: [imogi][module] ⚠️ message {data}
```

**Modules**:
- `api` - API calls
- `nav` - Navigation
- `loader` - React bundle loading
- `storage` - Cache operations
- `context` - Operational context
- `auth` - Authentication

### 3. `imogi_pos/utils/response.py` (NEW - Optional)

**Purpose**: Standard response formatting for API endpoints

**Functions**:
```python
def success_response(data, message=None):
    """Standard success response"""
    return {
        "message": data,
        "exc": None,
        "success": True,
        "_server_messages": [message] if message else []
    }

def error_response(message, exc_type="ValidationError", http_status=400):
    """Standard error response"""
    frappe.local.response['http_status_code'] = http_status
    return {
        "message": None,
        "exc": exc_type,
        "exc_type": exc_type,
        "_server_messages": [message]
    }

def permission_error(message="Insufficient permissions"):
    """Standard permission error (401/403)"""
    return error_response(message, "PermissionError", 403)
```

---

## 🔧 FILES TO MODIFY

### JavaScript Files (11 files)

#### 1. `src/shared/utils/api.js`
**Changes**:
- Import `logger.js`
- Replace all `console.log('[imogi-api]'` with `logger.log('api', ...)`
- Fix 417 handling: check `r.exc` content before treating as auth error
- Add `[imogi][api]` prefix to all logs

**Lines**: ~10 logging statements to update

#### 2. `src/shared/utils/deskNavigate.js`
**Changes**:
- Import `logger.js`
- Replace custom logging with `logger.log('nav', ...)`
- Standardize emoji usage (optional)

**Lines**: ~8 logging statements

#### 3. `src/shared/utils/errorHandler.js`
**Changes**:
- Import `logger.js`
- Standardize logging format

**Lines**: ~5 logging statements

#### 4. `src/shared/hooks/useOperationalContext.js`
**Changes**:
- Import `apiCall` from `api.js` (replace direct frappe.call)
- Import `storage.js` functions (replace direct sessionStorage)
- Use `logger.log('context', ...)`

**Lines**: 3 `frappe.call` → `apiCall`, 3 sessionStorage → storage functions

#### 5-14. **React Apps** (10 files with direct `frappe.call`)
**Files**:
- `src/apps/table-layout-editor/App.jsx`
- `src/apps/table-display-editor/App.jsx`
- `src/apps/cashier-payment/hooks/useQRISPayment.js`
- `src/apps/cashier-payment/components/CustomerInfo.jsx`
- `src/apps/module-select/App.jsx`
- `src/apps/module-select/components/BranchSelector.jsx`
- `src/apps/cashier-console/App.jsx`
- `src/apps/cashier-console/components/CatalogView.jsx`
- `src/apps/cashier-console/components/VariantPickerModal.jsx`
- `src/apps/customer-display-editor/App.jsx`

**Changes** (per file):
```javascript
// OLD
frappe.call({
  method: 'imogi_pos.api.method',
  args: { ... },
  callback: (r) => {
    if (r.message) { ... }
  },
  error: (r) => {
    frappe.msgprint(r.message)
  }
})

// NEW
import { apiCall } from '@/shared/utils/api'

try {
  const result = await apiCall('imogi_pos.api.method', { ... })
  // Use result directly (already normalized to r.message)
} catch (error) {
  // Error already shown to user by apiCall
  console.error('[imogi][app] Error:', error)
}
```

**Total**: 23 replacements across 10 files

#### 15. `src/apps/waiter/App.jsx`
**Changes**:
- Replace direct `frappe.set_route` with `deskNavigate()`

**Lines**: 2 lines (Lines 63-64)

#### 16. `src/apps/module-select/components/BranchSelector.jsx`
**Changes**:
- Replace `localStorage.setItem` with `storage.setItem`

**Lines**: 1 line (Line 8)

#### 17. `src/shared/components/POSOpeningModal.jsx`
**Changes**:
- Replace `localStorage.setItem` with `storage.setItem`

**Lines**: 1 line (Line 98)

### Python Files (3 files)

#### 1. `imogi_pos/utils/operational_context.py`
**Changes**:
- Add standard logging with `[imogi][context]` prefix
- Use `logger.info()` instead of generic `logger`

**Lines**: ~5 logging statements to add

#### 2. `imogi_pos/utils/auth_decorators.py`
**Changes**:
- Add `[imogi][auth]` prefix to all logs
- Ensure consistent `frappe.PermissionError` usage

**Lines**: ~3 logging statements to add

#### 3. `imogi_pos/utils/auth_helpers.py`
**Changes**:
- Audit file (not done yet)
- Add standard logging

**Lines**: TBD (file not audited)

---

## 🗑️ FILES TO DELETE

### After Migration Complete

**None identified yet**. All existing utils are centralized and should be kept.

**Exception**: If any duplicate util files are discovered during deeper audit, they will be listed here.

---

## 📊 MIGRATION IMPACT

### Files Affected Summary

| Category | Count | Effort |
|----------|-------|--------|
| **New files** | 3 | 3 hours |
| **JS files to modify** | 17 | 4-5 hours |
| **PY files to modify** | 3 | 1 hour |
| **Files to delete** | 0 | 0 |
| **Testing** | All apps | 2 hours |
| **TOTAL** | 23 files | **10-11 hours** |

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking API calls** | High | Thorough testing, gradual rollout |
| **Session handling regression** | Medium | Test 417 scenarios, keep backup |
| **Storage key conflicts** | Low | Use consistent `imogi_*` prefix |
| **Logging noise** | Low | Use debug mode for verbose logs |

---

## ✅ SUCCESS CRITERIA

1. ✅ **Zero direct `frappe.call` calls** in React apps (all use `apiCall`)
2. ✅ **All logging uses standard format** `[imogi][module] message`
3. ✅ **417 errors handled correctly** (not always treated as auth)
4. ✅ **All storage operations use `storage.js`** (no direct localStorage/sessionStorage)
5. ✅ **All navigation uses `deskNavigate()`** (no direct frappe.set_route)
6. ✅ **Session expiry shows modal once** (no redirect loops)
7. ✅ **All React apps build successfully**
8. ✅ **Manual testing passes** (10 tests from MANUAL_TESTING_CHECKLIST.md)

---

## 🚀 IMPLEMENTATION PLAN

### Phase 1: Create Foundation (3 hours)
1. Create `src/shared/utils/logger.js` (30 min)
2. Create `src/shared/utils/storage.js` (1 hour)
3. Create `imogi_pos/utils/response.py` (optional, 30 min)
4. Test new utilities in isolation (1 hour)

### Phase 2: Update Core Utils (2 hours)
5. Update `api.js` - logging + 417 fix (1 hour)
6. Update `deskNavigate.js` - logging (30 min)
7. Update `errorHandler.js` - logging (30 min)

### Phase 3: Migrate React Apps (4 hours)
8. Update `useOperationalContext.js` (30 min)
9. Migrate 10 React apps: replace `frappe.call` → `apiCall` (3 hours)
10. Update waiter app: `frappe.set_route` → `deskNavigate` (10 min)
11. Update storage calls in 2 components (20 min)

### Phase 4: Update Python Utils (1 hour)
12. Add logging to `operational_context.py` (20 min)
13. Add logging to `auth_decorators.py` (20 min)
14. Audit `auth_helpers.py` (20 min)

### Phase 5: Testing & Validation (2 hours)
15. Build all React apps (10 min)
16. Manual testing: 10 tests from checklist (44 min)
17. Integration testing: API errors, session expiry, navigation (1 hour)
18. Git commit + push (6 min)

---

**Total Estimated Time**: 10-12 hours

**Recommended Approach**: Implement in phases with git commits after each phase for easy rollback.

---

Generated: January 28, 2026
