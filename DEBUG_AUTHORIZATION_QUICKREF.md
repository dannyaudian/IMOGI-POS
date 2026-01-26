# Authorization Debug Quick Reference

**Quick diagnostic guide untuk troubleshoot "permission denied" atau redirect loop issues**

> 🧪 **NEW:** Comprehensive automated test suite available!  
> See [Browser Console Test Suite](#-automated-test-suite) below for one-command verification.

---

## 🧪 Automated Test Suite

**Fastest way to verify all endpoints dan role permissions:**

1. **Copy script** dari `tests/browser_console_auth_test.js`
2. **Login** sebagai user yang mau di-test
3. **Paste** script ke Browser Console
4. **Edit CONFIG** (branch, pos_profile, dll)
5. **Run:** `await runAllTests()`

**Results:**
- ✅ PASS/FAIL status per endpoint
- ⏱️ Performance metrics (response time)
- 🎭 Role vs access matrix
- 🚫 Critical blocker detection (500 errors)

**Example output:**
```
📦 Cashier/Counter APIs
────────────────────────────────────────────────────────
✅ Get Pending Orders              | PASS           |   125ms
✅ Get Items (Counter)             | PASS           |    89ms
🚫 List Orders for Cashier         | BLOCKER (500)  |   234ms
   ⚠️  Server Error: Unknown column 'discount_percent'...

📊 TEST SUMMARY
Total: 15 | ✅ Passed: 13 (86.7%) | ❌ Failed: 2 | 🚫 Blockers: 1
```

**See:** [AUTHORIZATION_FIX_SUMMARY.md](AUTHORIZATION_FIX_SUMMARY.md#verification-steps) for detailed usage

---

## 🔍 Step 1: Identify Error Type

Buka Browser DevTools > Network, lihat request yang gagal:

| HTTP Status | Error Type           | Likely Cause                                  | Action                          |
| ----------- | -------------------- | --------------------------------------------- | ------------------------------- |
| **401**     | Unauthorized         | User belum login / session expired            | → Go to Step 2 (Session)        |
| **403**     | Forbidden            | User login tapi tidak punya permission        | → Go to Step 3 (Permissions)    |
| **500**     | Internal Server Error | Backend error (DB, code bug, dll)            | → Go to Step 4 (Server)         |
| **0**       | Network Error        | CORS, network issue, server down              | → Go to Step 5 (Network)        |

---

## 📋 Step 2: Session Debugging (401 errors)

### Browser Console Test:
```javascript
// Test 1: Check if session valid
fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log('User:', d.message))

// Expected: email user (bukan "Guest")
// If Guest → session lost
```

### Check Cookies:
1. DevTools > Application > Cookies
2. Cari cookie `sid` atau `full_name`
3. Verify:
   - ✅ Cookie exists
   - ✅ Domain correct (e.g., `.your-site.com`)
   - ✅ Not expired
   - ✅ HttpOnly, Secure flags set

### Common Fixes:
- **Missing credentials:** Add `credentials: 'include'` to fetch
- **Cookie domain mismatch:** Check `site_config.json` cookie settings
- **Session expired:** Re-login
- **SameSite issue:** Set `cookie_samesite: "Lax"` in site_config

---

## 🔐 Step 3: Permission Debugging (403 errors)

### Check User Roles:
```javascript
// Test: Get user role context
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', { 
  credentials: 'include' 
})
  .then(r => r.json())
  .then(d => {
    console.log('Roles:', d.message.roles)
    console.log('Is Cashier:', d.message.is_cashier)
    console.log('Is Waiter:', d.message.is_waiter)
    console.log('Is Kitchen Staff:', d.message.is_kitchen_staff)
  })
```

### Permission Matrix:

| Page/Module     | Required Roles                                   | Check                  |
| --------------- | ------------------------------------------------ | ---------------------- |
| Counter POS     | `Cashier` OR `Branch Manager` OR `System Manager` | is_cashier or is_manager |
| Kitchen         | `Kitchen Staff` OR `Branch Manager` OR `System Manager` | is_kitchen_staff or is_manager |
| Waiter          | `Waiter` OR `Branch Manager` OR `System Manager`  | is_waiter or is_manager |
| Module Select   | Any authenticated user                           | !is_guest            |

### Fix User Roles:
```bash
# Via Frappe Desk:
# User > [username] > Roles > Add role > Save

# Via bench console:
bench --site [sitename] console
```
```python
frappe.get_doc("User", "user@example.com").add_roles("Cashier", "Waiter")
```

---

## 🐛 Step 4: Server Error Debugging (500 errors)

### Check Error Logs:
```bash
# Realtime tail
bench --site [sitename] logs

# OR check Error Log doctype
# Frappe Desk > Error Log
```

### Common 500 Causes:

#### A. **Database Schema Mismatch**
**Error:** `Unknown column 'field_name' in 'field list'`

**Fix:**
```bash
bench --site [sitename] migrate
bench --site [sitename] clear-cache
bench restart
```

#### B. **Missing Field in DocType**
**Error:** Query mencoba akses field yang tidak ada

**Fix:** 
- Check DocType definition
- Remove field from query, atau
- Add field to DocType via Customize Form

#### C. **Permission Query Issue**
**Error:** `PermissionError: You don't have permission to access...`

**Fix:** Check decorator di API method:
```python
@frappe.whitelist()
@require_permission("DocType Name", "read")
def api_method():
    # ...
```

### Frontend Error Handling:
Pastikan useAuth tidak menganggap 500 sebagai permission:

```javascript
// ✅ GOOD: Check status code
if (userError && userError.httpStatus >= 500) {
  setError('Server error. Contact admin.')
  // Don't redirect to login
}

// ❌ BAD: Treat all errors as unauthorized
if (userError) {
  window.location.href = '/login'  // Wrong!
}
```

---

## 🌐 Step 5: Network/CORS Debugging (0 status)

### Browser Console:
Look for CORS errors:
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

### site_config.json Fix:
```json
{
  "allow_cors": "*",
  "cookie_samesite": "Lax",
  "cookie_secure": true
}
```

### Restart after config change:
```bash
bench restart
```

---

## 🛠️ Common Scenarios & Fixes

### Scenario 1: "Insufficient permissions" tapi user punya role
**Cause:** Frontend role check terlalu strict, atau role name typo

**Debug:**
```javascript
// Compare role name exact (case-sensitive!)
const requiredRoles = ['Cashier', 'Branch Manager']  // ✅
const requiredRoles = ['cashier', 'branch manager']  // ❌ typo
```

**Fix:** Check role name di:
- Frontend: `useAuth(['Cashier'])`
- Backend: User > Roles table

---

### Scenario 2: Redirect loop (login → page → login → ...)
**Cause:** 
- Session cookie tidak persist
- Frontend check session saat load page, gagal, redirect login
- Login sukses, redirect ke page, check gagal lagi

**Debug:**
```javascript
// Check if cookie set after login
document.cookie  // Should contain 'sid=...'
```

**Fix:**
1. Ensure `credentials: 'include'` di semua fetch
2. Check FrappeProvider config:
```jsx
<FrappeProvider
  url={window.location.origin}
  tokenParams={{
    useToken: false,  // ✅ Use cookie, not token
    type: 'Bearer'
  }}
>
```

---

### Scenario 3: User A can access, User B can't (same role)
**Cause:** Branch access restriction

**Debug:**
```javascript
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', { 
  credentials: 'include' 
})
  .then(r => r.json())
  .then(d => console.log('Defaults:', d.message.defaults))
// Check default branch
```

**Fix:** Assign branch to user:
- User > Defaults > Branch = [Branch Name]

---

### Scenario 4: Works in Desk, fails in React app
**Cause:** 
- Desk uses iframe (same domain, auto credentials)
- React app might be on subdomain or not sending cookies

**Debug:**
```javascript
// Check origin
console.log('App origin:', window.location.origin)
console.log('API origin:', /* from error */ )
// Should be same
```

**Fix:**
- Serve React from same domain as Frappe
- OR configure CORS + cookie domain properly

---

## 🔧 Prevention Checklist

When adding new protected page/API:

- [ ] **API Method:**
  - [ ] Add `@frappe.whitelist()` decorator
  - [ ] Add `@require_permission()` or `@require_role()` if needed
  - [ ] Add `validate_branch_access()` if branch-specific
  - [ ] Test with user yang TIDAK punya permission (should 403)

- [ ] **Frontend Component:**
  - [ ] Use `useAuth(['Required', 'Roles'])` hook
  - [ ] Check `hasAccess` before rendering
  - [ ] Show error message if `!hasAccess`
  - [ ] Add loading state while `loading === true`

- [ ] **Fetch/API Call:**
  - [ ] Include `credentials: 'include'`
  - [ ] Handle 401, 403, 500 differently
  - [ ] Don't redirect on 500 (show error instead)

---

## 📞 Escalation Path

1. **Browser Console** → Check HTTP status & error message
2. **Network Tab** → Check request/response details
3. **Frappe Error Log** → Check server-side traceback
4. **bench logs** → Check real-time server logs
5. **This Document** → Match scenario & apply fix
6. **AUTHORIZATION_FIX_SUMMARY.md** → Detailed fix history

---

## 🧪 Quick Test Suite

Run these tests after ANY auth-related changes:

```javascript
// Test Suite - Paste in browser console when logged in

const tests = [
  {
    name: 'Session Check',
    fn: () => fetch('/api/method/frappe.auth.get_logged_user', {credentials:'include'})
  },
  {
    name: 'Role Context',
    fn: () => fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context', {credentials:'include'})
  },
  {
    name: 'Billing API',
    fn: () => fetch('/api/method/imogi_pos.api.billing.list_orders_for_cashier', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({branch: 'Your Branch'})
    })
  }
]

tests.forEach(async (test) => {
  try {
    const r = await test.fn()
    const data = await r.json()
    console.log(`✅ ${test.name}:`, r.status, data.message || data)
  } catch (e) {
    console.error(`❌ ${test.name}:`, e)
  }
})
```

**Expected Results:**
- ✅ All tests return 200 status
- ✅ Session check returns user email (not Guest)
- ✅ Role context returns user's roles
- ✅ Billing API returns orders or empty array (not 500 error)

---

**Last Updated:** 2026-01-26  
**See Also:** AUTHORIZATION_FIX_SUMMARY.md
