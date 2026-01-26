# Authorization Issue Fix Summary

**Tanggal:** 26 Januari 2026  
**Status:** ✅ COMPLETED

---

## Problem Analysis

### Root Cause #1: Database Schema Mismatch (500 Error)
**Symptom:** Error `(1054) Unknown column 'discount_percent' in 'SELECT'`  
**Location:** `imogi_pos.api.billing.list_orders_for_cashier`  
**Impact:** 500 server error yang di-misinterpret frontend sebagai permission issue

**Evidence:**
- DocType `POS Order` tidak memiliki field: `discount_percent`, `discount_amount`, `promo_code`
- Code di `billing.py` mencoba query field tersebut dari database
- Frontend `useAuth` menganggap semua error (termasuk 500) sebagai "Unauthorized"

### Root Cause #2: Session/Cookie Issues
**Symptom:** Session Stopped events, user dianggap Guest, redirect loop  
**Location:** Multiple API calls, `get_user_role_context`  
**Impact:** User session tidak stabil, causing authorization failures

**Evidence:**
- Error log menunjukkan frequent "Session Stopped" events
- Missing `credentials: 'include'` pada beberapa fetch calls
- `useAuth` tidak membedakan 401/403 vs 500 errors

---

## Fixes Applied

### ✅ Fix #1: Remove Non-Existent Fields from Query
**File:** [imogi_pos/api/billing.py](imogi_pos/api/billing.py#L1155-L1177)

**Before:**
```python
orders = frappe.get_all(
    "POS Order",
    filters=filters,
    fields=[
        "name",
        "customer",
        "order_type",
        "table",
        "queue_number",
        "workflow_state",
        "discount_percent",      # ❌ Field tidak ada
        "discount_amount",       # ❌ Field tidak ada
        "promo_code",           # ❌ Field tidak ada
        "totals",
        "creation",
    ],
    order_by="creation desc",
)
```

**After:**
```python
orders = frappe.get_all(
    "POS Order",
    filters=filters,
    fields=[
        "name",
        "customer",
        "order_type",
        "table",
        "queue_number",
        "workflow_state",
        "totals",               # ✅ Hanya field yang ada
        "creation",
    ],
    order_by="creation desc",
)
```

**Note:** Field `discount_percent`, `discount_amount`, dan `promo_code` masih diakses di bagian lain code menggunakan `getattr()` dengan None default, yang aman.

---

### ✅ Fix #2: Proper Error Classification di useAuth
**File:** [src/shared/hooks/useAuth.js](src/shared/hooks/useAuth.js)

**Changes:**
1. **Distinguish between auth errors (401/403) vs server errors (500+)**
2. **Only redirect to login for actual auth issues**
3. **Show server error message instead of "permission denied"**

**Before:**
```javascript
useEffect(() => {
  if (currentUser === 'Guest' || !currentUser) {
    // ❌ Always redirect, even on 500 errors
    window.location.href = `/shared/login?redirect=...`
    return
  }
  
  // ❌ All errors treated as permission issues
  if (requiredRoles.length > 0 && userData) {
    const hasRole = requiredRoles.some(role => userRoles.includes(role))
    if (!hasRole) {
      setError('Insufficient permissions...')
      setHasAccess(false)
    } else {
      setHasAccess(true)
    }
  } else {
    setHasAccess(true)
  }
}, [currentUser, userData, requiredRoles])
```

**After:**
```javascript
useEffect(() => {
  // ✅ Check if auth error before redirecting
  if (currentUser === 'Guest' || !currentUser) {
    if (!userError || userError.httpStatus === 401 || userError.httpStatus === 403) {
      // Only redirect for real auth issues
      window.location.href = `/shared/login?redirect=...`
      return
    }
  }

  // ✅ Show server errors separately
  if (userError && userError.httpStatus >= 500) {
    setError(`Server error (${userError.httpStatus}): ${userError.message}. Contact administrator.`)
    setHasAccess(false)
    return
  }

  // ✅ Proper permission check with clear state
  if (requiredRoles.length > 0 && userData) {
    const hasRole = requiredRoles.some(role => userRoles.includes(role))
    if (!hasRole) {
      setError('Insufficient permissions. Required roles: ' + requiredRoles.join(', '))
      setHasAccess(false)
    } else {
      setHasAccess(true)
      setError(null)  // ✅ Clear error on success
    }
  } else if (userData) {
    setHasAccess(true)
    setError(null)
  }
}, [currentUser, userData, userError, requiredRoles])
```

---

### ✅ Fix #3: Ensure credentials: 'include' on All Fetch Calls
**File:** [src/apps/login/App.jsx](src/apps/login/App.jsx#L18)

**Before:**
```javascript
const response = await fetch('/api/method/imogi_pos.api.public.get_branding')
```

**After:**
```javascript
const response = await fetch('/api/method/imogi_pos.api.public.get_branding', {
  credentials: 'include'  // ✅ Ensure cookies sent
})
```

**Already OK:**
- ✅ [src/shared/api/imogi-api.js](src/shared/api/imogi-api.js#L27) - `callImogiAPI` already includes credentials
- ✅ [src/shared/providers/ImogiPOSProvider.jsx](src/shared/providers/ImogiPOSProvider.jsx) - FrappeProvider uses cookie-based auth

---

## Verification Steps

### Automated Test Suite (RECOMMENDED)

**Gunakan comprehensive test harness untuk verify semua endpoints sekaligus:**

1. **Login** ke aplikasi sebagai user yang mau di-test (Cashier/Kitchen/Waiter/Manager)

2. **Open Browser Console** (F12)

3. **Load test script:**
   ```javascript
   // Copy-paste isi file: tests/browser_console_auth_test.js
   // Atau jika sudah serve: 
   // (edit CONFIG di file sesuai environment)
   ```

4. **Edit CONFIG** di script sesuai environment:
   ```javascript
   const CONFIG = {
     branch: "Main",              // Your branch name
     pos_profile: "Counter POS",  // Your POS profile
     kitchen: "Main Kitchen",     // Optional
     station: "Grill Station",    // Optional
     floor: "Ground Floor",       // Optional
     table: "T-001",              // Optional
   };
   ```

5. **Run tests:**
   ```javascript
   await runAllTests()
   ```

6. **Review results:**
   - Console akan print tabel PASS/FAIL per endpoint
   - Results tersimpan di `window.testResults`
   - Inspect detail: `console.table(window.testResults.results.cashier)`

**Expected Output:**
```
📊 TEST SUMMARY
==========================================================
Total Tests:   15
✅ Passed:      14 (93.3%)
❌ Failed:      1 (6.7%)
🚫 Blockers:    0
```

**Role-Specific Quick Tests:**
```javascript
// Test hanya Cashier endpoints
await testCashierAccess()

// Test hanya Kitchen endpoints
await testKitchenAccess()

// Test hanya Waiter endpoints
await testWaiterAccess()
```

---

### Manual Verification (Alternative)

### 1. Test API Endpoint (Backend Fix)
```bash
# Login ke Frappe console atau Postman
curl -X POST 'https://your-site.com/api/method/imogi_pos.api.billing.list_orders_for_cashier' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sid=...' \
  -d '{"branch": "Your Branch", "pos_profile": "Your POS Profile"}'

# Expected: 200 OK dengan data orders (tidak ada 500 error lagi)
```

### 2. Test Session Persistence (Cookie Fix)
```javascript
// Di browser console (saat logged in):
fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)

// Expected: { "message": "user@example.com", "roles": [...] }
// NOT Guest
```

### 3. Test Role Context
```javascript
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', { 
  credentials: 'include' 
})
  .then(r => r.json())
  .then(console.log)

// Expected: Full role context dengan is_cashier, is_waiter, etc.
```

### 4. Test Error Handling (Frontend Fix)
**Scenario A: Real Server Error (500)**
- Cause a temporary backend error
- Frontend should show: "Server error (500): .... Contact administrator."
- Should NOT redirect to login
- Should NOT show "Insufficient permissions"

**Scenario B: Auth Error (401)**
- Logout user
- Try to access protected page
- Frontend should redirect to login page

**Scenario C: Permission Error (403)**
- Login as user without required role
- Frontend should show: "Insufficient permissions. Required roles: Cashier, Branch Manager"
- Should NOT redirect to login (user is authenticated, just lacking role)

---

## Role vs Access Matrix (Reference)

| User                                | Roles                                              | Counter POS | Kitchen | Waiter | Expected Access                 |
| ----------------------------------- | -------------------------------------------------- | ----------- | ------- | ------ | ------------------------------- |
| danny.a.pratama@cao-group.co.id     | Cashier, Kitchen Staff, Waiter, Branch Manager     | ✅           | ✅       | ✅      | Full access                     |
| cashier-only@example.com            | Cashier                                            | ✅           | ❌       | ❌      | Counter only                    |
| waiter-only@example.com             | Waiter                                             | ❌           | ❌       | ✅      | Waiter only                     |
| Guest (not logged in)               | -                                                  | ❌           | ❌       | ❌      | Redirect to login               |
| user-without-any-pos-role@example.com | Employee, Stock User (no POS roles)              | ❌           | ❌       | ❌      | "Insufficient permissions" msg  |

---

## Security Notes

### ⚠️ Found: Permission Bypass Pattern
**Location:** Multiple API methods use `ignore_permissions=True`

**Example from traceback:**
```python
frappe.get_all("POS Order", filters={...}, ignore_permissions=True)
```

**Risk:** Bypasses Frappe's built-in permission system

**Mitigation (current):**
- Decorator `@require_permission("POS Order", "read")` validates BEFORE query
- `validate_branch_access(branch)` checks user's branch access
- BUT: Still risky if decorator is bypassed or removed

**Recommendation (future):**
1. Remove `ignore_permissions=True` where possible
2. Use Frappe's permission query: `frappe.get_all(..., ignore_permissions=False)`
3. Let Frappe filter results based on user permissions
4. Keep branch validation as additional layer

---

## Migration Checklist (If Adding Discount Fields)

If you want to support order-level discounts in the future:

### 1. Add Fields to POS Order DocType
```json
{
  "fieldname": "discount_percent",
  "fieldtype": "Percent",
  "label": "Discount %",
  "precision": "2"
},
{
  "fieldname": "discount_amount",
  "fieldtype": "Currency",
  "label": "Discount Amount",
  "precision": "2"
},
{
  "fieldname": "promo_code",
  "fieldtype": "Data",
  "label": "Promo Code"
}
```

### 2. Update billing.py
Restore the fields in query after migration:
```python
fields=[
    "name",
    "customer",
    # ... other fields
    "discount_percent",   # Now safe to query
    "discount_amount",
    "promo_code",
    # ...
]
```

### 3. Run Migration
```bash
bench --site <sitename> migrate
bench --site <sitename> clear-cache
bench restart
```

---

## Known Issues (Still To Monitor)

### 1. Session Stopped Events (Medium Priority)
**Current Status:** Mitigated by credentials: 'include' fix  
**Monitor:** Check error logs for "Session Stopped" frequency  
**If persists:**
- Check reverse proxy configuration (X-Forwarded-Proto, X-Forwarded-Host)
- Verify `cookie_samesite` and `cookie_secure` in site_config.json
- Check for CORS issues if React is on different subdomain

**Recommended site_config.json:**
```json
{
  "cookie_samesite": "Lax",
  "cookie_secure": true,
  "allow_cors": "*"
}
```

### 2. Real-time get_user_info Calls (Low Priority)
**Observation:** Frequent calls to `frappe.realtime.get_user_info`  
**Impact:** Potential performance issue if too frequent  
**Action:** Monitor, optimize if becomes bottleneck

---

## Testing Checklist

- [x] Fix #1: Billing API no longer throws 500 on list_orders_for_cashier
- [x] Fix #2: useAuth distinguishes 401/403 from 500
- [x] Fix #3: All fetch calls include credentials
- [ ] Verify: No "Session Stopped" errors in production logs (24h monitoring)
- [ ] Verify: User danny.a.pratama can access all modules without permission errors
- [ ] Verify: Server errors show friendly message, not "permission denied"
- [ ] Verify: Unauthorized users get proper error message, not server error

---

## Commit Message (Suggested)

```
fix: resolve authorization issues caused by schema mismatch and error classification

- Remove non-existent fields (discount_percent, discount_amount, promo_code) from POS Order query
- Fix useAuth to distinguish auth errors (401/403) from server errors (500+)
- Add credentials: 'include' to all fetch calls for stable session
- Prevent redirect loop on server errors
- Show appropriate error messages based on error type

Root causes:
1. Database schema out of sync - fields queried but don't exist
2. Frontend treating 500 errors as permission denials
3. Missing credentials on some fetch calls

Fixes:
- imogi_pos/api/billing.py: Remove non-existent fields from query
- src/shared/hooks/useAuth.js: Proper HTTP status code handling
- src/apps/login/App.jsx: Add credentials to branding fetch

Ref: AUTHORIZATION_FIX_SUMMARY.md
```

---

## Contact

Jika ada pertanyaan atau issue masih muncul setelah fix ini:
1. Check error logs untuk HTTP status code yang actual
2. Pastikan user memiliki role yang benar di User doctype
3. Verify session cookie ter-set dengan benar di browser DevTools > Application > Cookies
4. Test dengan `fetch('/api/method/frappe.auth.get_logged_user', {credentials:'include'})` di console

---

**END OF DOCUMENT**
