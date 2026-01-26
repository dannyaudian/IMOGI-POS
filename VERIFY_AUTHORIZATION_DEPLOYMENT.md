# ✅ Verification Testing - Authorization Deployment

## 📅 Deployment Info
- **Date**: January 26, 2026
- **Changes**: Authorization & Permission fixes deployed
- **Status**: Ready for verification testing

## 🔗 MCP Endpoint
```
https://tigaperkasateknik.j.frappe.cloud/api/method/frappe_assistant_core.api.fac_endpoint.handle_mcp
```

---

## 🎯 QUICK VERIFICATION PROMPT

Copy prompt ini ke Claude/ChatGPT untuk comprehensive verification testing:

```
IMOGI POS authorization fixes telah di-deploy ke:
https://tigaperkasateknik.j.frappe.cloud

Lakukan systematic verification testing dengan steps berikut:

## Phase 1: Authentication Flow Test

### Step 1.1: Check User Roles
List semua users dan roles di system:
```sql
SELECT 
  u.name as user_email,
  u.full_name,
  GROUP_CONCAT(r.role) as roles
FROM `tabUser` u
LEFT JOIN `tabHas Role` r ON r.parent = u.name
WHERE u.enabled = 1 AND u.name NOT IN ('Administrator', 'Guest')
GROUP BY u.name
ORDER BY u.creation DESC
LIMIT 20
```

### Step 1.2: Test Login untuk Each Role Type

**Test Users Needed**:
1. User dengan role "Cashier"
2. User dengan role "Kitchen Staff"  
3. User dengan role "Waiter"
4. User dengan role "Branch Manager"

Untuk setiap user, verify:
```javascript
// Run di browser console setelah login
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(data => {
    console.log('=== USER CONTEXT ===')
    console.log('User:', data.message.user)
    console.log('Full Name:', data.message.full_name)
    console.log('Roles:', data.message.roles)
    console.log('Is Cashier:', data.message.is_cashier)
    console.log('Is Kitchen Staff:', data.message.is_kitchen_staff)
    console.log('Is Waiter:', data.message.is_waiter)
    console.log('Is Manager:', data.message.is_manager)
  })
```

Expected output untuk Cashier:
```json
{
  "user": "cashier@example.com",
  "full_name": "John Cashier",
  "roles": ["Cashier", "Sales User"],
  "is_cashier": true,
  "is_kitchen_staff": false,
  "is_waiter": false,
  "is_manager": false,
  "is_guest": false
}
```

---

## Phase 2: Frontend Access Control Test

### Step 2.1: Counter POS App
URL: https://tigaperkasateknik.j.frappe.cloud/counter

**Test dengan Cashier user** (Expected: ✅ Success):
1. Access /counter
2. Check items loading
3. Try add item to cart
4. Check payment flow accessible

**Test dengan Kitchen Staff user** (Expected: ❌ Denied):
1. Access /counter
2. Should show error: "Insufficient permissions"
3. Should NOT crash or show blank page
4. Error should be user-friendly

Browser console check:
```javascript
// Should see proper error handling
console.log('Counter POS - Kitchen Staff access test')
// Error message should appear
```

### Step 2.2: Kitchen Display App
URL: https://tigaperkasateknik.j.frappe.cloud/kitchen

**Test dengan Kitchen Staff** (Expected: ✅ Success):
1. Access /kitchen
2. Check KOT list loading
3. Try update KOT status
4. Verify real-time updates

**Test dengan Cashier user** (Expected: ❌ Denied):
1. Access /kitchen  
2. Should show permission error
3. Should NOT have access to KOT updates

### Step 2.3: Waiter App
URL: https://tigaperkasateknik.j.frappe.cloud/waiter

**Test dengan Waiter user** (Expected: ✅ Success):
1. Access /waiter
2. Check table list loading
3. Try create order
4. Verify table status updates

**Test dengan Kitchen Staff** (Expected: ❌ Denied):
1. Access /waiter
2. Should show permission error

### Step 2.4: Branch Manager Access
**Test dengan Branch Manager** (Expected: ✅ ALL Access):
1. Access /counter → Should work
2. Access /kitchen → Should work
3. Access /waiter → Should work
4. Access all admin functions → Should work

---

## Phase 3: API Endpoint Permission Test

### Step 3.1: Counter POS APIs

Login as **Cashier**, test:

```javascript
// TEST 1: Get Items (Should ✅ PASS)
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
})
.then(r => r.json())
.then(data => {
  if (data.message) {
    console.log('✅ PASS: Get items successful')
    console.log('Items returned:', data.message.length)
  } else {
    console.log('❌ FAIL:', data)
  }
})
.catch(err => console.log('❌ ERROR:', err))

// TEST 2: Create Sales Invoice (Should ✅ PASS)
fetch('/api/method/imogi_pos.api.billing.create_pos_invoice', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    customer: 'Walk-In Customer',
    items: [{
      item_code: 'ITEM-001',
      qty: 1,
      rate: 100
    }],
    payments: [{
      mode_of_payment: 'Cash',
      amount: 100
    }]
  })
})
.then(r => r.json())
.then(data => {
  if (data.message && data.message.name) {
    console.log('✅ PASS: Invoice created:', data.message.name)
  } else {
    console.log('❌ FAIL:', data)
  }
})
.catch(err => console.log('❌ ERROR:', err))
```

Login as **Kitchen Staff**, test same APIs:

```javascript
// Should ❌ FAIL with permission error
fetch('/api/method/imogi_pos.api.cashier.get_items', {...})
  .then(r => r.json())
  .then(data => {
    if (data.exc) {
      console.log('✅ CORRECT: Permission denied for Kitchen Staff')
    } else {
      console.log('❌ SECURITY ISSUE: Kitchen Staff shouldn\'t access this!')
    }
  })
```

### Step 3.2: Kitchen APIs

Login as **Kitchen Staff**, test:

```javascript
// TEST 1: Get Active KOTs (Should ✅ PASS)
fetch('/api/method/imogi_pos.api.kot.get_active_kots', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    branch: 'Main Branch',
    station: 'Main Kitchen'
  })
})
.then(r => r.json())
.then(data => {
  if (data.message) {
    console.log('✅ PASS: KOTs loaded:', data.message.length)
  } else {
    console.log('❌ FAIL:', data)
  }
})

// TEST 2: Update KOT Status (Should ✅ PASS)
fetch('/api/method/imogi_pos.api.kot.update_kot_status', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    kot_name: 'KOT-001',
    status: 'In Progress'
  })
})
.then(r => r.json())
.then(data => {
  if (data.message) {
    console.log('✅ PASS: KOT status updated')
  } else {
    console.log('❌ FAIL:', data)
  }
})
```

Login as **Cashier**, test same APIs (Should ❌ FAIL)

### Step 3.3: Table Management APIs

Login as **Waiter**, test:

```javascript
// TEST 1: Get Tables (Should ✅ PASS)
fetch('/api/method/imogi_pos.api.table.get_tables', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    branch: 'Main Branch'
  })
})
.then(r => r.json())
.then(data => {
  if (data.message) {
    console.log('✅ PASS: Tables loaded:', data.message.length)
  } else {
    console.log('❌ FAIL:', data)
  }
})

// TEST 2: Update Table Status (Should ✅ PASS)
fetch('/api/method/imogi_pos.api.table.update_table_status', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': frappe.csrf_token
  },
  body: JSON.stringify({
    table_name: 'Table 1',
    status: 'Occupied'
  })
})
.then(r => r.json())
.then(data => {
  if (data.message) {
    console.log('✅ PASS: Table status updated')
  } else {
    console.log('❌ FAIL:', data)
  }
})
```

---

## Phase 4: Permission Matrix Verification

### Step 4.1: Check ERPNext Permission Manager

Verify permissions untuk key DocTypes:

```sql
-- Sales Invoice permissions
SELECT role, `read`, `write`, `create`, submit, cancel, `delete`
FROM `tabCustom DocPerm` 
WHERE parent = 'Sales Invoice'
ORDER BY role;
```

Expected results:
| Role | Read | Write | Create | Submit | Cancel |
|------|------|-------|--------|--------|--------|
| Cashier | 1 | 1 | 1 | 1 | 0 |
| Kitchen Staff | 1 | 0 | 0 | 0 | 0 |
| Waiter | 1 | 1 | 1 | 0 | 0 |
| Branch Manager | 1 | 1 | 1 | 1 | 1 |

```sql
-- Kitchen Order Ticket permissions
SELECT role, `read`, `write`, `create`
FROM `tabCustom DocPerm` 
WHERE parent = 'Kitchen Order Ticket'
ORDER BY role;
```

Expected:
| Role | Read | Write | Create |
|------|------|-------|--------|
| Kitchen Staff | 1 | 1 | 0 |
| Cashier | 1 | 0 | 1 |
| Waiter | 1 | 0 | 1 |
| Branch Manager | 1 | 1 | 1 |

### Step 4.2: Check Custom Profiles

```sql
-- Customer Display Profile permissions
SELECT role, `read`, `write`, `create`
FROM `tabCustom DocPerm` 
WHERE parent = 'Customer Display Profile'
ORDER BY role;
```

```sql
-- Table Display Profile permissions  
SELECT role, `read`, `write`, `create`
FROM `tabCustom DocPerm` 
WHERE parent = 'Table Display Profile'
ORDER BY role;
```

---

## Phase 5: Session & Security Test

### Step 5.1: Session Persistence Test

```javascript
// 1. Check current session
fetch('/api/method/frappe.auth.get_logged_user')
  .then(r => r.json())
  .then(data => console.log('Logged User:', data.message))

// 2. Check session data
console.log('Session User:', frappe.session.user)
console.log('CSRF Token:', frappe.csrf_token || window.FRAPPE_CSRF_TOKEN)

// 3. Check cookies
console.log('Session Cookie:', document.cookie.split(';').find(c => c.includes('sid')))
```

### Step 5.2: CSRF Protection Test

```javascript
// Test API call WITHOUT CSRF token (should fail)
fetch('/api/method/imogi_pos.api.cashier.get_items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
    // NO CSRF TOKEN
  },
  body: JSON.stringify({})
})
.then(r => r.json())
.then(data => {
  if (data.exc) {
    console.log('✅ PASS: CSRF protection working')
  } else {
    console.log('❌ SECURITY ISSUE: CSRF not enforced!')
  }
})
```

### Step 5.3: SQL Injection Test

Check all API endpoints untuk SQL injection protection:

```bash
# Search for unsafe SQL queries
grep -rn "frappe.db.sql.*f\"" imogi_pos/api/
grep -rn "frappe.db.sql.*\.format" imogi_pos/api/
grep -rn "frappe.db.sql.*%" imogi_pos/api/ | grep -v "%s"
```

Should return: NO RESULTS (all queries should use parameterized queries)

---

## Phase 6: Error Handling Test

### Step 6.1: Test Graceful Permission Denial

**Scenario**: Kitchen Staff tries to access Counter POS

Expected behavior:
1. ❌ NOT blank white screen
2. ✅ User-friendly error message
3. ✅ Option to go back or login as different user
4. ✅ No console errors that crash app

Verify in browser:
```javascript
// Should see structured error, not crash
console.log('Check for error boundary handling')
```

### Step 6.2: Test API Error Handling

**Scenario**: API returns 403 Forbidden

```javascript
// Force 403 by calling restricted API
fetch('/api/method/imogi_pos.api.cashier.create_pos_invoice', {...})
  .then(r => r.json())
  .then(data => {
    // App should handle this gracefully
    if (data.exc) {
      console.log('✅ Error handled:', data._server_messages || data.exception)
    }
  })
```

Expected:
- ✅ Toast/alert message shown to user
- ✅ Error logged to console
- ❌ NOT silent failure

### Step 6.3: Test Session Expiry

**Scenario**: Session expires while using app

1. Login to app
2. Manually delete session cookie:
   ```javascript
   document.cookie = "sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
   ```
3. Try to perform action (e.g., create invoice)

Expected:
- ✅ Detect expired session
- ✅ Redirect to login with return URL
- ✅ After login, return to original page

---

## Phase 7: Performance Test

### Step 7.1: Measure API Response Times

```javascript
// Test item loading performance
console.time('Load Items')
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
})
.then(r => r.json())
.then(data => {
  console.timeEnd('Load Items')
  console.log('Items count:', data.message?.length)
})
```

Target benchmarks:
- Get Items: < 500ms
- Create Invoice: < 1000ms
- Get KOTs: < 300ms
- Update Status: < 200ms

### Step 7.2: Frontend Load Time

```javascript
// Measure page load time
window.addEventListener('load', () => {
  const perfData = window.performance.timing
  const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart
  console.log('Page Load Time:', pageLoadTime + 'ms')
  
  // Target: < 3000ms
  if (pageLoadTime < 3000) {
    console.log('✅ PASS: Good performance')
  } else {
    console.log('⚠️ WARNING: Slow page load')
  }
})
```

---

## Phase 8: Generate Test Report

After completing all tests, generate comprehensive report:

### Summary Format:

```markdown
# Authorization Verification Report
Site: https://tigaperkasateknik.j.frappe.cloud
Date: [date]
Tester: [AI Assistant]

## Executive Summary
- Total Tests Executed: X
- Passed: Y (Z%)
- Failed: W
- Warnings: V

## Test Results by Phase

### Phase 1: Authentication ✅/❌
- User role loading: ✅
- Session persistence: ✅
- Role context API: ✅

### Phase 2: Frontend Access Control ✅/❌
- Counter POS access control: ✅
- Kitchen Display access control: ✅
- Waiter App access control: ✅
- Error handling: ✅

### Phase 3: API Permissions ✅/❌
- Cashier APIs: ✅
- Kitchen APIs: ✅
- Table APIs: ✅
- Cross-role restrictions: ✅

### Phase 4: Permission Matrix ✅/❌
- Sales Invoice permissions: ✅
- KOT permissions: ✅
- Profile permissions: ✅

### Phase 5: Security ✅/❌
- Session management: ✅
- CSRF protection: ✅
- SQL injection protection: ✅

### Phase 6: Error Handling ✅/❌
- Permission denial: ✅
- API errors: ✅
- Session expiry: ✅

### Phase 7: Performance ✅/❌
- API response times: ✅
- Page load times: ✅

## Issues Found

### Critical Issues
[None / List with severity]

### Medium Priority
[None / List]

### Low Priority / Improvements
[None / List]

## Performance Metrics
- Average API response: Xms
- Page load time: Xms
- Concurrent users tested: X

## Security Assessment
- Overall Security Score: X/10
- Vulnerabilities Found: X
- Recommendations: [list]

## Final Verdict
✅ READY FOR PRODUCTION / ⚠️ NEEDS MINOR FIXES / ❌ CRITICAL ISSUES

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]
```

---

## OUTPUT YANG DIHARAPKAN

Provide:
1. ✅ Complete test execution log
2. 📊 Test results matrix (PASS/FAIL per test)
3. 🐛 Issues found dengan severity level
4. 💡 Recommendations untuk improvement
5. 🔒 Security assessment
6. ⚡ Performance benchmarks
7. 📝 Final production readiness verdict

Include code snippets untuk any fixes needed.
```

---

## 🎯 Quick Start Guide

### Option 1: Full Verification (Recommended)
Copy entire prompt above ke Claude/ChatGPT

### Option 2: Quick Smoke Test
Copy hanya Phase 1-3 untuk basic functionality check

### Option 3: Security Audit Only
Copy Phase 4-5 untuk security-focused testing

### Option 4: Performance Test Only
Copy Phase 7 untuk performance benchmarking

---

## 📞 Contact & Support

Jika menemukan issues:
1. Note down error message lengkap
2. Browser console logs
3. Network tab (failed requests)
4. User role yang digunakan saat testing

Share hasil verification report untuk review!

---

## Phase 9: Workspace to POS Flow Test

### Step 9.1: Test Complete User Journey

**Flow**: ERPNext Desk → Open POS → Login → Module Select → POS App

#### Test Scenario 1: Cashier User Journey

```
1. Login ke ERPNext Desk as Cashier
2. Navigate ke Workspace atau click "Open POS" link
3. Redirected to /imogi-login atau /module-select
4. Select module (Counter POS / Cashier Payment)
5. Access POS app
```

Verify di setiap step:

```javascript
// STEP 1: Check ERPNext Desk Access
// Di ERPNext Desk browser console:
fetch('/api/method/frappe.auth.get_logged_user')
  .then(r => r.json())
  .then(data => {
    console.log('=== DESK ACCESS ===')
    console.log('User:', data.message)
    console.log('Expected: cashier@example.com')
  })

// STEP 2: Check POS Link/Button Permission
// Verify POS menu item visible untuk Cashier role

// STEP 3: Access Module Select Page
// URL: /module-select atau /shared/module-select
fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('=== AVAILABLE MODULES ===')
    console.log('Modules:', data.message.modules)
    // Expected for Cashier:
    // - Counter POS (Cashier Console)
    // - Cashier Payment (Table Service)
  })

// STEP 4: Check Branch Access
fetch('/api/method/imogi_pos.api.module_select.get_user_branch_info')
  .then(r => r.json())
  .then(data => {
    console.log('=== BRANCH INFO ===')
    console.log('Current Branch:', data.message.current_branch)
    console.log('Available Branches:', data.message.available_branches)
  })

// STEP 5: Access Counter POS
// Click module → Redirect to /counter-pos
// Verify app loads successfully
```

Expected Results:
| Step | Expected | Pass/Fail |
|------|----------|-----------|
| 1. Desk Login | ✅ Success | |
| 2. POS Menu Visible | ✅ Yes | |
| 3. Module Select Access | ✅ Success | |
| 4. Modules Listed | ✅ Counter POS, Cashier Payment | |
| 5. Branch Info Loaded | ✅ Current branch shown | |
| 6. POS App Access | ✅ Success | |

#### Test Scenario 2: Kitchen Staff Journey

```
1. Login as Kitchen Staff
2. Try to access /module-select
3. Should see only Kitchen Display module
4. Access Kitchen app
```

```javascript
// Check available modules for Kitchen Staff
fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('Kitchen Staff Modules:', data.message.modules)
    // Expected: Only Kitchen Display
    // NOT Counter POS, NOT Waiter
  })
```

#### Test Scenario 3: Waiter Journey

```
1. Login as Waiter
2. Access /module-select
3. Should see Waiter module
4. Access Waiter app
```

#### Test Scenario 4: Branch Manager Journey

```
1. Login as Branch Manager
2. Access /module-select
3. Should see ALL modules
4. Can access any POS app
5. Can access admin functions
```

```javascript
// Branch Manager should see all modules
fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('Manager Modules:', data.message.modules)
    // Expected: ALL modules
    // - Counter POS
    // - Cashier Payment
    // - Kitchen Display
    // - Waiter
    // - Customer Display Editor
    // - Table Layout Editor
  })
```

#### Test Scenario 5: Administrator Journey ⭐ NEW

```
1. Login as Administrator
2. Access /module-select
3. Should have FULL ACCESS to all modules
4. Can access any app without restrictions
```

```javascript
// Administrator should bypass all restrictions
fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('=== ADMINISTRATOR ACCESS ===')
    console.log('Modules:', data.message.modules)
    // Expected: ALL modules + admin tools
  })

// Check Administrator role context
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(data => {
    console.log('Administrator Context:', data.message)
    console.log('Is Admin:', data.message.is_admin)
    console.log('Roles:', data.message.roles)
    // Expected: is_admin = true
  })
```

### Step 9.2: Module Select Page Permission Audit

Check file: `/Users/dannyaudian/github/IMOGI-POS/imogi_pos/www/shared/module-select/index.py`

Verify:

```python
# Current implementation check
def get_context(context):
    # Should have:
    # 1. Login check
    if not user or user == 'Guest':
        # Redirect to login ✅
    
    # 2. Get available modules based on user role
    modules_data = frappe.call('imogi_pos.api.module_select.get_available_modules')
    
    # 3. No explicit @require_roles decorator
    # Should allow ANY logged-in user to see module select
    # BUT modules shown should be filtered by role
```

**API Endpoint Check**: `imogi_pos.api.module_select.get_available_modules`

```python
@frappe.whitelist()
def get_available_modules():
    """Get modules available to current user based on roles."""
    
    # Should check:
    user = frappe.session.user
    if user == 'Guest':
        frappe.throw(_("Not authorized"))
    
    roles = frappe.get_roles(user)
    
    # Administrator should get ALL modules
    if 'Administrator' in roles or 'System Manager' in roles:
        return all_modules
    
    # Filter modules by role
    available = []
    
    if 'Cashier' in roles:
        available.extend(['counter-pos', 'cashier-payment'])
    
    if 'Kitchen Staff' in roles:
        available.append('kitchen')
    
    if 'Waiter' in roles:
        available.append('waiter')
    
    if 'Branch Manager' in roles:
        available.extend(all_modules)
    
    return {'modules': available}
```

### Step 9.3: Fix Administrator Access

**Issue**: Administrator might not have explicit access to POS modules

**Fix Required**:

```python
# File: imogi_pos/api/module_select.py

@frappe.whitelist()
def get_available_modules():
    """Get modules available to current user."""
    user = frappe.session.user
    
    if user == 'Guest':
        frappe.throw(_("Please login to continue"))
    
    roles = frappe.get_roles(user)
    
    # ⭐ FIX: Administrator gets FULL ACCESS
    if 'Administrator' in roles:
        return {
            'modules': [
                {
                    'name': 'counter-pos',
                    'title': 'Counter POS',
                    'description': 'Quick service counter',
                    'icon': 'cash-register',
                    'path': '/counter-pos',
                    'roles': ['Cashier', 'Branch Manager', 'Administrator']
                },
                {
                    'name': 'cashier-payment',
                    'title': 'Cashier Payment',
                    'description': 'Table service payment',
                    'icon': 'credit-card',
                    'path': '/cashier-payment',
                    'roles': ['Cashier', 'Branch Manager', 'Administrator']
                },
                {
                    'name': 'kitchen',
                    'title': 'Kitchen Display',
                    'description': 'Kitchen order management',
                    'icon': 'utensils',
                    'path': '/kitchen',
                    'roles': ['Kitchen Staff', 'Branch Manager', 'Administrator']
                },
                {
                    'name': 'waiter',
                    'title': 'Waiter',
                    'description': 'Table ordering',
                    'icon': 'user-tie',
                    'path': '/waiter',
                    'roles': ['Waiter', 'Branch Manager', 'Administrator']
                },
                {
                    'name': 'customer-display-editor',
                    'title': 'Customer Display Editor',
                    'description': 'Configure customer displays',
                    'icon': 'tv',
                    'path': '/customer-display-editor',
                    'roles': ['Branch Manager', 'System Manager', 'Administrator']
                },
                {
                    'name': 'table-layout-editor',
                    'title': 'Table Layout Editor',
                    'description': 'Configure table layouts',
                    'icon': 'th',
                    'path': '/table-layout-editor',
                    'roles': ['Branch Manager', 'System Manager', 'Administrator']
                }
            ]
        }
    
    # ... rest of role-based filtering
```

### Step 9.4: Update All Page Decorators

**Add Administrator to all @require_roles decorators:**

```python
# File: imogi_pos/www/counter/pos/index.py
@require_roles("Cashier", "Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...

# File: imogi_pos/www/restaurant/kitchen/index.py
@require_roles("Kitchen Staff", "Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...

# File: imogi_pos/www/restaurant/waiter/index.py
@require_roles("Waiter", "Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...

# File: imogi_pos/www/opening-balance/index.py
@require_roles("Cashier", "Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...

# File: imogi_pos/www/customer_display_editor/index.py
@require_roles("Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...

# File: imogi_pos/www/table_layout_editor/index.py
@require_roles("Branch Manager", "System Manager", "Administrator")
def get_context(context):
    # ...
```

### Step 9.5: Permission Rules Audit

Check ERPNext Permission Manager untuk Administrator:

```sql
-- Check if Administrator role has permissions
SELECT 
    parent as doctype,
    role,
    `read`, `write`, `create`, submit, cancel, `delete`
FROM `tabDocPerm` 
WHERE role = 'Administrator'
AND parent IN ('Sales Invoice', 'Kitchen Order Ticket', 'Customer Display Profile', 'Table Display Profile')
ORDER BY parent;
```

Expected:
| DocType | Role | Read | Write | Create | Submit | Delete |
|---------|------|------|-------|--------|--------|--------|
| Sales Invoice | Administrator | 1 | 1 | 1 | 1 | 1 |
| Kitchen Order Ticket | Administrator | 1 | 1 | 1 | 1 | 1 |

**Note**: Administrator role should have permissions by default in Frappe.

### Step 9.6: Test Login Flow

#### Direct Access Test
```javascript
// Test 1: Direct access to /counter-pos without login
// Expected: Redirect to /imogi-login

// Test 2: Direct access to /module-select without login
// Expected: Redirect to /imogi-login

// Test 3: Login → Redirect back to intended page
// Login at /imogi-login?next=/counter-pos
// After login → Should redirect to /counter-pos

// Test 4: Login → Module Select
// Login at /imogi-login
// After login → Redirect to /module-select
```

#### Login Redirect Chain Test
```
Scenario: User tries to access /counter-pos directly

1. User (not logged in) → /counter-pos
   Expected: Redirect to /imogi-login?redirect=/counter-pos

2. User logs in successfully
   Expected: Redirect back to /counter-pos

3. If user doesn't have Cashier role
   Expected: Show permission error, offer to go to /module-select

4. If user has role
   Expected: Load Counter POS app successfully
```

### Step 9.7: Role-Based Module Filtering Test

Create test matrix:

| User Role | Counter POS | Cashier Payment | Kitchen | Waiter | Display Editor | Table Editor |
|-----------|-------------|-----------------|---------|--------|----------------|--------------|
| Cashier | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Kitchen Staff | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Waiter | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Branch Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| System Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Administrator** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Test script:
```javascript
// Run for each user role
async function testModuleAccess(role) {
  console.log(`\n=== Testing ${role} ===`)
  
  // Get available modules
  const modules = await fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
    .then(r => r.json())
  
  console.log('Available modules:', modules.message.modules.map(m => m.name))
  
  // Test access to each module
  const testUrls = [
    '/counter-pos',
    '/cashier-payment',
    '/kitchen',
    '/waiter',
    '/customer-display-editor',
    '/table-layout-editor'
  ]
  
  for (const url of testUrls) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        console.log(`✅ ${url}: Access granted`)
      } else {
        console.log(`❌ ${url}: Access denied (${response.status})`)
      }
    } catch (err) {
      console.log(`❌ ${url}: Error - ${err.message}`)
    }
  }
}
```

---

## Phase 10: Comprehensive Permission Rules Audit

### Step 10.1: Check All Permission Rules

```sql
-- Get ALL permission rules for IMOGI POS related DocTypes
SELECT 
    p.parent as doctype,
    p.role,
    p.permlevel,
    p.`read`,
    p.`write`,
    p.`create`,
    p.submit,
    p.cancel,
    p.`delete`,
    p.amend,
    p.report,
    p.export,
    p.import,
    p.share,
    p.print
FROM `tabDocPerm` p
WHERE p.parent IN (
    'Sales Invoice',
    'Kitchen Order Ticket',
    'Customer Display Profile',
    'Table Display Profile',
    'IMOGI POS Profile',
    'Table',
    'POS Opening Entry',
    'POS Closing Entry'
)
ORDER BY p.parent, p.role;
```

### Step 10.2: Check Custom Permissions

```sql
-- Check custom permissions added by IMOGI POS
SELECT 
    cp.parent as doctype,
    cp.role,
    cp.`read`,
    cp.`write`,
    cp.`create`,
    cp.submit,
    cp.cancel,
    cp.`delete`
FROM `tabCustom DocPerm` cp
WHERE cp.parent LIKE '%Display%'
   OR cp.parent LIKE '%Kitchen%'
   OR cp.parent LIKE '%POS%'
ORDER BY cp.parent, cp.role;
```

### Step 10.3: Verify Administrator Bypass

```python
# Test Administrator permission bypass
# File: tests/test_administrator_permissions.py

def test_administrator_access():
    """Test that Administrator can access all endpoints."""
    
    frappe.set_user('Administrator')
    
    # Should be able to access all APIs
    endpoints = [
        'imogi_pos.api.cashier.get_items',
        'imogi_pos.api.billing.create_pos_invoice',
        'imogi_pos.api.kot.get_active_kots',
        'imogi_pos.api.table.get_tables',
        'imogi_pos.api.customer_display_editor.get_available_devices',
    ]
    
    for endpoint in endpoints:
        try:
            result = frappe.call(endpoint, async_execution=False)
            print(f'✅ {endpoint}: Success')
        except frappe.PermissionError:
            print(f'❌ {endpoint}: Permission denied (SHOULD NOT HAPPEN)')
        except Exception as e:
            print(f'⚠️ {endpoint}: {str(e)}')
```

### Step 10.4: Check Auth Decorators Include Administrator

Audit all files dengan @require_roles:

```bash
# Search for all @require_roles usage
grep -rn "@require_roles" imogi_pos/www/ --include="*.py"
```

For each file found, verify "Administrator" is included:

```python
# BEFORE (Missing Administrator):
@require_roles("Cashier", "Branch Manager")

# AFTER (Fixed):
@require_roles("Cashier", "Branch Manager", "Administrator")
```

Files to update:
1. `/imogi_pos/www/counter/pos/index.py`
2. `/imogi_pos/www/restaurant/kitchen/index.py`
3. `/imogi_pos/www/restaurant/waiter/index.py`
4. `/imogi_pos/www/opening-balance/index.py`
5. `/imogi_pos/www/customer_display_editor/index.py`
6. `/imogi_pos/www/table_layout_editor/index.py`

### Step 10.5: Update Frontend Role Checks

Update React useAuth hook calls to include Administrator:

```javascript
// BEFORE:
const { user, hasAccess } = useAuth(['Cashier', 'Branch Manager'])

// AFTER:
const { user, hasAccess } = useAuth(['Cashier', 'Branch Manager', 'System Manager', 'Administrator'])
```

Files to check:
- `src/apps/counter-pos/App.jsx`
- `src/apps/kitchen/App.jsx`
- `src/apps/waiter/App.jsx`

---

## ✅ Sign-off Checklist

Setelah verification selesai:

- [ ] All critical workflows tested
- [ ] All user roles verified
- [ ] **Administrator access tested and working** ⭐ NEW
- [ ] **Workspace → Login → Module Select flow working** ⭐ NEW
- [ ] **Module filtering by role correct** ⭐ NEW
- [ ] Permission matrix correct
- [ ] Security audit passed
- [ ] Performance acceptable
- [ ] Error handling graceful
- [ ] Documentation updated
- [ ] **READY FOR PRODUCTION** ✅
