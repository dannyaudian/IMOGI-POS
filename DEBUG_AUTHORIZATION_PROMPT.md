# 🔐 Debug Authorization & Permission Issues - IMOGI POS

## 🎯 Tujuan
Debug error akses ke React apps terkait authorization dan permission di IMOGI POS

## 🔗 MCP Endpoint
```
https://tigaperkasateknik.j.frappe.cloud/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp
```

---

## 📋 PROMPT UNTUK CLAUDE/CHATGPT

```
Saya mengalami error authorization/permission saat akses React apps di IMOGI POS.
Tolong debug dengan systematic check berikut:

## 1. Frontend Authentication Flow Check

### A. useAuth Hook Implementation
File: src/shared/hooks/useAuth.js

Check:
- ✅ currentUser check (Guest detection)
- ✅ Redirect to login logic
- ✅ frappe.auth.get_logged_user API call
- ✅ Role checking logic (requiredRoles)
- ✅ Error state handling

Kemungkinan Issues:
- User terdeteksi sebagai Guest padahal sudah login?
- API frappe.auth.get_logged_user gagal?
- Role checking terlalu strict?
- Infinite redirect loop?

### B. React Apps Usage
Check di semua apps:

**Counter POS** (src/apps/counter-pos/App.jsx):
```javascript
const { user, loading, hasAccess, error } = useAuth(['Cashier', 'Branch Manager'])
```

**Kitchen Display** (src/apps/kitchen/App.jsx):
```javascript
const { user, loading, hasAccess, error } = useAuth(['Kitchen Staff', 'Branch Manager'])
```

**Waiter App** (src/apps/waiter/App.jsx):
```javascript
const { user, loading, hasAccess, error } = useAuth(['Waiter', 'Branch Manager'])
```

Questions:
- Apakah user punya role yang required?
- Error message apa yang muncul di console?
- Loading state stuck?

## 2. Backend Permission Check

### A. Auth Helpers
File: imogi_pos/utils/auth_helpers.py

Check function:
```python
@frappe.whitelist(allow_guest=True)
def get_user_role_context(user=None)
```

Verify:
- Return data structure complete?
- Roles array populated correctly?
- Guest handling proper?

### B. Auth Decorators
File: imogi_pos/utils/auth_decorators.py

Check decorators yang digunakan di www/ pages:
- @require_login()
- @require_roles(*roles)

List semua www/ pages yang pakai decorators:
```bash
grep -r "@require_login\|@require_roles" imogi_pos/www/
```

Verify:
- Decorator applied correctly?
- Role requirements match frontend?
- Redirect logic working?

### C. API Permission Checks
Check semua @frappe.whitelist() methods di:
- imogi_pos/api/cashier.py
- imogi_pos/api/billing.py
- imogi_pos/api/kitchen.py
- imogi_pos/api/table.py
- imogi_pos/api/public.py

Untuk SETIAP method, verify:
```python
@frappe.whitelist()
def method_name():
    # Should have one of these:
    if not frappe.has_permission('DocType', 'read'):
        frappe.throw(_("No permission"))
    
    # OR
    from imogi_pos.utils.permissions import validate_api_permission
    validate_api_permission('DocType', 'read')
```

List methods yang TIDAK ada permission check (SECURITY ISSUE!)

## 3. Cookie & Session Check

### Frontend (Browser)
Check di Browser Console:
```javascript
// Check cookies
document.cookie

// Check session
fetch('/api/method/frappe.auth.get_logged_user', {
  credentials: 'include'
}).then(r => r.json()).then(console.log)

// Check CSRF token
window.FRAPPE_CSRF_TOKEN
```

### Backend Session
Check di ERPNext:
```python
frappe.session.user  # Current user
frappe.session.data  # Session data
frappe.get_roles()   # User roles
```

Possible Issues:
- CORS blocking cookies?
- SameSite cookie policy?
- Session expired?
- CSRF token missing?

## 4. Specific Error Scenarios

### Scenario 1: "Insufficient permissions" Error
Check:
1. User roles di ERPNext (User doctype)
2. Required roles di useAuth(['Role1', 'Role2'])
3. Permission rules untuk DocTypes
4. Role Profile assignment

Query untuk check user roles:
```sql
SELECT role FROM `tabHas Role` WHERE parent = '[user_email]'
```

### Scenario 2: Redirect Loop (Login → App → Login)
Check:
1. useAuth redirect logic
2. /imogi-login page functionality
3. Cookie domain settings
4. Session persistence

### Scenario 3: 403 Forbidden on API Calls
Check:
1. frappe.has_permission() calls di backend
2. User permissions untuk DocTypes
3. Permission rules di DocType definition
4. Branch-level permissions (if applicable)

### Scenario 4: Role Check Passes but API Fails
Check:
1. Frontend role check vs backend permission check mismatch
2. DocType-level permissions different from role
3. Custom permission query conditions

## 5. Permission Rules Audit

Check ERPNext Permission Manager untuk DocTypes utama:
- Sales Invoice
- Customer Display Profile
- Table Display Profile
- Kitchen Order Ticket
- IMOGI POS Profile

Untuk setiap DocType, verify:
- Roles yang punya Read/Write/Create/Delete
- Permission conditions (if any)
- User permissions applied?

Query:
```sql
SELECT * FROM `tabCustom DocPerm` 
WHERE parent IN ('Sales Invoice', 'Customer Display Profile', 'Kitchen Order Ticket')
```

## 6. Branch-Level Access Control

File: imogi_pos/utils/permissions.py

Check function:
```python
def validate_branch_access(branch, user=None)
```

Questions:
- Apakah branch restriction diterapkan?
- User punya akses ke branch yang diminta?
- Branch filtering di API endpoints working?

## 7. Debug Steps untuk Execute

### Step 1: Check Current User & Roles
Di Browser Console:
```javascript
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(data => console.log('User Context:', data))
```

Expected output:
```json
{
  "user": "user@example.com",
  "roles": ["Cashier", "Sales User", ...],
  "is_cashier": true,
  "is_guest": false
}
```

### Step 2: Test Specific API Endpoint
```javascript
fetch('/api/method/imogi_pos.api.cashier.get_items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    branch: 'BRANCH-001',
    pos_profile: 'Counter POS'
  })
}).then(r => r.json()).then(console.log).catch(console.error)
```

### Step 3: Check Permission for DocType
Di Frappe Desk console:
```javascript
frappe.call({
  method: 'frappe.client.has_permission',
  args: {
    doctype: 'Sales Invoice',
    ptype: 'read'
  },
  callback: (r) => console.log('Has Permission:', r.message)
})
```

## 8. Common Fixes

### Fix 1: Add Missing Permission Check
```python
@frappe.whitelist()
def my_api_method():
    # ADD THIS
    if not frappe.has_permission('Sales Invoice', 'read'):
        frappe.throw(_("No permission to access Sales Invoice"))
    
    # ... rest of code
```

### Fix 2: Relax Role Requirements
Frontend:
```javascript
// BEFORE
const { user, hasAccess } = useAuth(['Specific Role'])

// AFTER - allow multiple roles
const { user, hasAccess } = useAuth(['Role1', 'Role2', 'Role3'])
```

### Fix 3: Fix Cookie/Session Issues
site_config.json:
```json
{
  "cookie_secure": false,
  "cookie_samesite": "Lax"
}
```

### Fix 4: Grant DocType Permissions
ERPNext → Role Permission Manager:
- Select DocType
- Select Role
- Enable Read/Write permissions
- Save

## 9. Output yang Diharapkan

### A. Error Analysis
```
Error Type: [403 Forbidden / Permission Denied / etc]
Location: [Frontend/Backend/Both]
Root Cause: [Specific issue found]
```

### B. Permission Matrix
| Endpoint/Page | Required Role | Has Permission Check? | Issue Found |
|---------------|---------------|----------------------|-------------|
| /counter-pos | Cashier | ✅ | None |
| API: get_items | - | ❌ | Missing check |

### C. Recommendations
1. Add permission check to X API methods
2. Grant Y role to user Z
3. Fix cookie domain settings
4. Update required roles in useAuth

### D. Code Fixes
Provide specific code snippets untuk fix issues yang ditemukan.

---

## Mulai Debug Sekarang

Silakan:
1. Check user context untuk user yang mengalami error
2. Test API endpoints yang failing
3. Audit permission checks di backend
4. Provide detailed error report dengan root cause analysis
```

---

## 🔍 Quick Debug Commands

### Check User Info:
```javascript
// Di Browser Console
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(console.log)
```

### Check Specific Permission:
```python
# Di Frappe Bench Console
bench --site [sitename] console

# Dalam console:
import frappe
frappe.connect()
frappe.set_user('[user_email]')
print(frappe.get_roles())
print(frappe.has_permission('Sales Invoice', 'read'))
```

### List All Whitelisted Methods:
```bash
cd /path/to/frappe-bench/apps/imogi_pos
grep -rn "@frappe.whitelist()" imogi_pos/api/
```

### Check Custom Permissions:
```sql
-- Di MariaDB
SELECT * FROM `tabCustom DocPerm` 
WHERE parent LIKE '%Display Profile%';
```

---

## 🎯 Focus Areas

### Priority 1: Authentication
- [ ] User login successful?
- [ ] Session valid?
- [ ] Cookies set correctly?

### Priority 2: Role Check
- [ ] User has required role?
- [ ] Role check logic correct?
- [ ] Role assigned in User doctype?

### Priority 3: API Permissions
- [ ] All APIs have permission checks?
- [ ] Permission type correct (read/write/create)?
- [ ] DocType permissions granted to role?

### Priority 4: Frontend Error Handling
- [ ] Error messages displayed?
- [ ] Loading states working?
- [ ] Proper fallback UI?

---

## 💡 Tips

1. **Start Simple**: Check user login status first
2. **Browser Console**: Always check console for errors
3. **Network Tab**: Monitor API calls and responses
4. **Backend Logs**: Check frappe logs for permission errors
5. **Test User**: Create test user with all required roles
6. **Permission Manager**: Use ERPNext UI to verify permissions
7. **Incremental Fix**: Fix one issue at a time and test

---

## ✅ POST-DEPLOYMENT VERIFICATION

**Status**: Authorization fixes telah di-deploy ✅

Sekarang perlu **verification testing** untuk memastikan semua working correctly.

### Verification Prompt untuk Claude/ChatGPT:

```
Authorization fixes untuk IMOGI POS sudah di-deploy.
Tolong lakukan comprehensive verification testing:

## 1. User Authentication Verification

Test login flow untuk different user roles:

### Test User 1: Cashier Role
```sql
SELECT name, role FROM `tabHas Role` 
WHERE parent = '[cashier_email]' AND role IN ('Cashier', 'Sales User');
```

Verify:
- ✅ Bisa akses /counter-pos
- ✅ Bisa load items catalog
- ✅ Bisa create sales invoice
- ✅ TIDAK bisa akses /kitchen (should fail gracefully)
- ✅ TIDAK bisa akses admin functions

### Test User 2: Kitchen Staff Role
```sql
SELECT name, role FROM `tabHas Role` 
WHERE parent = '[kitchen_staff_email]' AND role = 'Kitchen Staff';
```

Verify:
- ✅ Bisa akses /kitchen
- ✅ Bisa update KOT status
- ✅ TIDAK bisa create invoices
- ✅ TIDAK bisa akses /counter-pos

### Test User 3: Waiter Role
```sql
SELECT name, role FROM `tabHas Role` 
WHERE parent = '[waiter_email]' AND role = 'Waiter';
```

Verify:
- ✅ Bisa akses /waiter
- ✅ Bisa create orders
- ✅ Bisa update table status
- ✅ TIDAK bisa process payments directly

### Test User 4: Branch Manager Role
```sql
SELECT name, role FROM `tabHas Role` 
WHERE parent = '[manager_email]' AND role IN ('Branch Manager', 'Area Manager');
```

Verify:
- ✅ Bisa akses ALL apps
- ✅ Bisa perform ALL operations
- ✅ Bisa configure profiles
- ✅ Full admin access

## 2. API Endpoint Permission Test

Test SETIAP critical endpoint dengan different roles:

### Counter POS APIs
```javascript
// Test as Cashier (should work)
fetch('/api/method/imogi_pos.api.cashier.get_items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    branch: 'Main Branch',
    pos_profile: 'Counter POS'
  })
}).then(r => r.json()).then(console.log)

// Test as Kitchen Staff (should fail)
// Repeat test logged in as Kitchen Staff user
```

Expected results:
| Endpoint | Cashier | Kitchen | Waiter | Manager |
|----------|---------|---------|--------|---------|
| get_items | ✅ | ❌ | ✅ | ✅ |
| create_invoice | ✅ | ❌ | ❌ | ✅ |
| update_kot_status | ❌ | ✅ | ❌ | ✅ |
| update_table_status | ❌ | ❌ | ✅ | ✅ |

### Kitchen APIs
Test:
- imogi_pos.api.kot.get_active_kots
- imogi_pos.api.kot.update_kot_status
- imogi_pos.api.kot.update_kot_state

### Table Management APIs
Test:
- imogi_pos.api.table.get_tables
- imogi_pos.api.table.update_table_status
- imogi_pos.api.table.assign_waiter

## 3. Frontend Access Control Test

### Test useAuth Hook
Di setiap React app, verify error handling:

**Counter POS** - login as Kitchen Staff:
```javascript
// Should see error:
"Insufficient permissions. Required roles: Cashier, Branch Manager"
// Should NOT crash
// Should show proper error UI
```

**Kitchen Display** - login as Cashier:
```javascript
// Should see error:
"Insufficient permissions. Required roles: Kitchen Staff, Branch Manager"
```

**Waiter App** - login as Cashier:
```javascript
// Should see error:
"Insufficient permissions. Required roles: Waiter, Branch Manager"
```

## 4. Session & Cookie Test

### Browser Console Tests
```javascript
// 1. Check session persistence
fetch('/api/method/frappe.auth.get_logged_user')
  .then(r => r.json())
  .then(data => console.log('Current User:', data))

// 2. Check roles
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(data => console.log('User Roles:', data.message.roles))

// 3. Check CSRF token
console.log('CSRF Token exists:', !!window.FRAPPE_CSRF_TOKEN)

// 4. Check cookies
console.log('Cookies:', document.cookie)
```

Expected:
- ✅ User NOT Guest
- ✅ Roles array populated
- ✅ CSRF token present
- ✅ Cookies include sid (session ID)

## 5. Permission Matrix Verification

Verify di ERPNext Permission Manager:

### Sales Invoice
```sql
SELECT role, `read`, `write`, `create`, submit, cancel 
FROM `tabCustom DocPerm` 
WHERE parent = 'Sales Invoice';
```

Expected:
- Cashier: read=1, write=1, create=1, submit=1
- Kitchen Staff: read=1, others=0
- Waiter: read=1, create=1, write=1, submit=0
- Branch Manager: ALL=1

### Kitchen Order Ticket
```sql
SELECT role, `read`, `write`, `create` 
FROM `tabCustom DocPerm` 
WHERE parent = 'Kitchen Order Ticket';
```

Expected:
- Kitchen Staff: read=1, write=1
- Cashier: read=1, create=1
- Waiter: read=1, create=1
- Branch Manager: ALL=1

## 6. Error Handling Test

### Test Graceful Failures

**Scenario 1**: User without role tries to access
- Expected: Redirect to login or show permission denied
- NOT: White screen / app crash

**Scenario 2**: API call fails with 403
- Expected: Toast error message to user
- NOT: Silent failure or console error only

**Scenario 3**: Session expires during usage
- Expected: Redirect to login with return URL
- NOT: Stuck in loading state

### Network Error Simulation
```javascript
// Block API endpoint di Network tab Chrome DevTools
// Try to perform action
// Verify error message shown to user
```

## 7. Security Audit

### Check for Security Issues:

**A. SQL Injection Protection**
```python
# ALL database queries should use parameterized queries
# BAD:
frappe.db.sql(f"SELECT * FROM tabItem WHERE name = '{item_name}'")

# GOOD:
frappe.db.sql("SELECT * FROM tabItem WHERE name = %s", (item_name,))
```

**B. XSS Protection**
Check all user inputs are sanitized before display

**C. CSRF Protection**
All POST/PUT/DELETE requests include CSRF token

**D. Permission Bypass Check**
No methods with ignore_permissions=True without strong justification

Search for:
```bash
grep -rn "ignore_permissions=True" imogi_pos/
```

## 8. Performance Test

### Load Test Critical Endpoints

**Test 1: Get Items (Heavy load)**
```javascript
// Measure response time
console.time('get_items')
fetch('/api/method/imogi_pos.api.cashier.get_items', {...})
  .then(r => r.json())
  .then(data => {
    console.timeEnd('get_items')
    console.log('Items count:', data.message.length)
  })
```

Expected: < 500ms for typical catalog

**Test 2: Create Invoice**
```javascript
// Measure end-to-end time
console.time('create_invoice')
// ... create invoice
console.timeEnd('create_invoice')
```

Expected: < 1000ms

## 9. Comprehensive Test Report

Generate report dengan format:

### ✅ PASSED Tests
- [Test name]: Description
- [Test name]: Description

### ❌ FAILED Tests
- [Test name]: Error message
- Root cause: [explanation]
- Fix needed: [code/config change]

### ⚠️ WARNINGS
- [Issue]: Potential problem
- Recommendation: [improvement]

### 📊 Performance Metrics
- Average API response time: Xms
- Page load time: Xms
- Bundle size: X KB

### 🔒 Security Score
- Permission checks: X/Y endpoints (Z%)
- SQL injection safe: Yes/No
- XSS protection: Yes/No
- CSRF protection: Yes/No

## 10. Final Checklist

- [ ] All user roles tested
- [ ] All critical APIs tested with different roles
- [ ] Frontend access control working
- [ ] Session persistence verified
- [ ] Permission matrix correct in ERPNext
- [ ] Error handling graceful
- [ ] No security vulnerabilities found
- [ ] Performance acceptable
- [ ] Documentation updated

## Output Format

Provide detailed test results dengan:
1. Test execution log
2. Pass/Fail summary
3. Issues found (if any)
4. Recommendations
5. Code snippets untuk fixes (if needed)
```

---

## 📞 Expected Assistant Response Format

```markdown
# Authorization Verification Report - IMOGI POS

## Executive Summary
- Total Tests: X
- Passed: Y
- Failed: Z
- Warnings: W

## 1. User Authentication Tests
### Cashier Role
- ✅ Login successful
- ✅ Counter POS access: OK
- ✅ Kitchen access: Properly denied
- ⚠️ Warning: [any issues]

### Kitchen Staff Role
- ✅ Login successful
- ✅ Kitchen Display access: OK
- ✅ Invoice creation: Properly denied

### [Other roles...]

## 2. API Permission Tests
### Results Matrix
| Endpoint | Cashier | Kitchen | Waiter | Manager | Status |
|----------|---------|---------|--------|---------|--------|
| get_items | ✅ | ❌ | ✅ | ✅ | PASS |
| create_invoice | ✅ | ❌ | ❌ | ✅ | PASS |

### Issues Found
[List any permission issues]

## 3. Frontend Access Control
- useAuth hook: ✅ Working
- Error messages: ✅ User-friendly
- Redirect logic: ✅ Correct

## 4. Session Management
- Cookie persistence: ✅ OK
- CSRF token: ✅ Present
- Session timeout: ✅ Handled

## 5. Security Audit
- SQL Injection: ✅ Protected
- XSS: ✅ Safe
- CSRF: ✅ Protected
- Unprotected endpoints: [list if any]

## 6. Performance Results
- API avg response: Xms
- Items load: Xms
- Invoice creation: Xms

## 7. Issues Requiring Fixes
### Issue 1: [Title]
**Severity**: High/Medium/Low
**Description**: [details]
**Fix**:
```python
# Code fix here
```

## 8. Recommendations
1. [Recommendation 1]
2. [Recommendation 2]

## 9. Overall Assessment
✅ Authorization system: WORKING / NEEDS FIXES
```
