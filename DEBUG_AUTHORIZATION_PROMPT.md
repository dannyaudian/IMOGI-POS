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

## 📞 Expected Assistant Response Format

```markdown
# Authorization Debug Report - IMOGI POS

## 1. User Context Analysis
- User: [email]
- Roles: [list]
- Guest: [true/false]
- Session valid: [yes/no]

## 2. Permission Issues Found
### Issue 1: [Description]
- Location: [file:line]
- Impact: [High/Medium/Low]
- Root Cause: [explanation]
- Fix: [code snippet]

## 3. API Audit Results
- Total whitelisted methods: X
- Methods with permission check: Y
- Methods WITHOUT permission check: Z (SECURITY ISSUE)

List of unprotected endpoints:
- imogi_pos.api.xxx.method1
- imogi_pos.api.xxx.method2

## 4. Frontend Auth Flow
- useAuth implementation: [OK/Issues found]
- Role requirements: [list per app]
- Error handling: [OK/Needs improvement]

## 5. Immediate Action Items
1. [Action 1 with code]
2. [Action 2 with code]
3. [Action 3 with code]

## 6. Code Fixes
[Provide complete code snippets ready to apply]
```
