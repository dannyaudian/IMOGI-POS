# 🔐 Fix Administrator & Module Select Access

## 🎯 Issue
Administrator dan flow Workspace → Login → Module Select perlu permission fixes

## 📋 PROMPT UNTUK FRAPPE ASSISTANT

```
IMOGI POS memiliki flow: ERPNext Workspace → Open POS → Login → Module Select → POS Apps

Tolong lakukan systematic check dan fix untuk:

## 1. Administrator Role Access

### Issue:
Administrator role mungkin tidak punya akses ke POS modules karena:
- @require_roles decorators tidak include "Administrator"
- Module Select API tidak return modules untuk Administrator
- Frontend useAuth tidak allow Administrator

### Check & Fix:

#### A. Module Select API
File: `imogi_pos/api/module_select.py`

Method: `get_available_modules()`

**Current implementation check**:
```python
@frappe.whitelist()
def get_available_modules():
    user = frappe.session.user
    roles = frappe.get_roles(user)
    
    # CHECK: Does it handle Administrator?
    if 'Administrator' in roles:
        # Should return ALL modules
        return all_modules
```

**Expected fix**:
```python
@frappe.whitelist()
def get_available_modules():
    """Get modules available to current user based on roles."""
    user = frappe.session.user
    
    if user == 'Guest':
        frappe.throw(_("Please login to continue"))
    
    roles = frappe.get_roles(user)
    
    # ⭐ CRITICAL: Administrator gets FULL ACCESS
    if 'Administrator' in roles or 'System Manager' in roles:
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
    
    # Branch Manager gets all operational modules
    if 'Branch Manager' in roles or 'Area Manager' in roles:
        return {
            'modules': [
                # All modules except maybe some admin-only tools
            ]
        }
    
    # Role-specific modules
    modules = []
    
    if 'Cashier' in roles:
        modules.extend([
            {'name': 'counter-pos', 'title': 'Counter POS', ...},
            {'name': 'cashier-payment', 'title': 'Cashier Payment', ...}
        ])
    
    if 'Kitchen Staff' in roles:
        modules.append({'name': 'kitchen', 'title': 'Kitchen Display', ...})
    
    if 'Waiter' in roles:
        modules.append({'name': 'waiter', 'title': 'Waiter', ...})
    
    return {'modules': modules}
```

Verify fix dengan:
```javascript
// Login as Administrator
fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('Administrator modules:', data.message.modules)
    // Expected: ALL modules listed
  })
```

#### B. Page Decorators - Add Administrator

Check ALL files di `imogi_pos/www/` dengan @require_roles:

**Files to update**:

1. **Counter POS**: `imogi_pos/www/counter/pos/index.py`
```python
# BEFORE:
@require_roles("Cashier", "Branch Manager", "System Manager")

# AFTER:
@require_roles("Cashier", "Branch Manager", "System Manager", "Administrator")
```

2. **Kitchen Display**: `imogi_pos/www/restaurant/kitchen/index.py`
```python
# BEFORE:
@require_roles("Kitchen Staff", "Branch Manager", "System Manager")

# AFTER:
@require_roles("Kitchen Staff", "Branch Manager", "System Manager", "Administrator")
```

3. **Waiter App**: `imogi_pos/www/restaurant/waiter/index.py`
```python
# BEFORE:
@require_roles("Waiter", "Branch Manager", "System Manager")

# AFTER:
@require_roles("Waiter", "Branch Manager", "System Manager", "Administrator")
```

4. **Opening Balance**: `imogi_pos/www/opening-balance/index.py`
```python
# BEFORE:
@require_roles("Cashier", "Branch Manager", "System Manager")

# AFTER:
@require_roles("Cashier", "Branch Manager", "System Manager", "Administrator")
```

5. **Customer Display Editor**: `imogi_pos/www/customer_display_editor/index.py`
```python
# BEFORE:
@require_roles("Branch Manager", "System Manager")

# AFTER:
@require_roles("Branch Manager", "System Manager", "Administrator")
```

6. **Table Layout Editor**: `imogi_pos/www/table_layout_editor/index.py`
```python
# BEFORE:
@require_roles("Branch Manager", "System Manager")

# AFTER:
@require_roles("Branch Manager", "System Manager", "Administrator")
```

Search command untuk find all:
```bash
grep -rn "@require_roles" imogi_pos/www/ --include="*.py"
```

Show me ALL files found dan update semuanya.

#### C. Frontend useAuth - Add Administrator

Check React apps yang menggunakan useAuth hook:

**Files to check**:
1. `src/apps/counter-pos/App.jsx`
2. `src/apps/kitchen/App.jsx`
3. `src/apps/waiter/App.jsx`
4. `src/apps/customer-display-editor/App.jsx` (if exists)

**Current pattern**:
```javascript
const { user, loading, hasAccess } = useAuth(['Cashier', 'Branch Manager'])
```

**Update to**:
```javascript
const { user, loading, hasAccess } = useAuth(['Cashier', 'Branch Manager', 'System Manager', 'Administrator'])
```

Search for all useAuth usage:
```bash
grep -rn "useAuth(\[" src/apps/ --include="*.jsx"
```

Show me results dan update all occurrences.

#### D. Auth Helpers - Administrator Context

File: `imogi_pos/utils/auth_helpers.py`

Method: `get_user_role_context()`

Verify includes Administrator flag:
```python
def get_user_role_context(user=None):
    # ...
    roles = frappe.get_roles(user)
    
    # Should include:
    is_admin = "Administrator" in roles or "System Manager" in roles
    
    return {
        "user": user,
        "roles": roles,
        "is_admin": is_admin,  # ⭐ Make sure this exists
        "is_area_manager": "Area Manager" in roles,
        "is_branch_manager": "Branch Manager" in roles,
        # ... etc
    }
```

---

## 2. Workspace to Module Select Flow

### Check Complete User Journey:

**Flow**: ERPNext Desk → Click "Open POS" → Login (if needed) → Module Select → Choose Module → POS App

#### Step 2.1: Check POS Entry Point

Where does user click to open POS?
- Workspace shortcut?
- Desk menu item?
- Custom page?

Find the link/button:
```bash
grep -rn "module-select\|/counter\|/kitchen\|/waiter" imogi_pos/fixtures/ imogi_pos/config/
```

Verify link points to correct URL and requires login.

#### Step 2.2: Module Select Page Access

File: `imogi_pos/www/shared/module-select/index.py`

**Current implementation**:
```python
def get_context(context):
    user = frappe.session.user
    
    # Redirect if not logged in
    if not user or user == 'Guest':
        frappe.local.response['type'] = 'redirect'
        frappe.local.response['location'] = '/imogi-login?next=/module-select'
        return
    
    # Load modules for user
    modules_data = frappe.call('imogi_pos.api.module_select.get_available_modules')
    branch_data = frappe.call('imogi_pos.api.module_select.get_user_branch_info')
    
    # ... pass to React
```

**Check**:
- ✅ Guest redirect works?
- ✅ Logged-in user can access?
- ✅ Modules loaded based on role?
- ✅ Administrator sees all modules?

#### Step 2.3: Login Page Flow

File: `imogi_pos/www/shared/login/index.py`

**Check redirect parameter**:
```python
def get_context(context):
    # After successful login, should redirect to:
    # - ?next= parameter if provided
    # - /module-select by default
```

Test flow:
```
1. User (not logged in) → /counter-pos
2. Redirected to → /imogi-login?next=/counter-pos
3. User logs in
4. Redirected back to → /counter-pos
5. If no permission → Show error, offer link to /module-select
```

#### Step 2.4: Branch Selection

File: `imogi_pos/api/module_select.py`

Method: `get_user_branch_info()`

**Check**:
```python
@frappe.whitelist()
def get_user_branch_info():
    """Get current branch and available branches for user."""
    
    user = frappe.session.user
    
    # Get user's default branch
    current_branch = frappe.db.get_value('User', user, 'imogi_default_branch')
    
    # Get all branches user has access to
    # Based on User Permission or Branch Manager assignment
    
    # Administrator should see ALL branches
    if 'Administrator' in frappe.get_roles(user):
        branches = frappe.get_all('Branch', fields=['name', 'branch_name'])
    else:
        # Filter by user permission
        branches = get_user_accessible_branches(user)
    
    return {
        'current_branch': current_branch,
        'available_branches': branches
    }
```

---

## 3. Permission Rules Audit

### Check ERPNext Permission Manager:

```sql
-- Check Administrator permissions on key DocTypes
SELECT 
    p.parent as doctype,
    p.role,
    p.`read`,
    p.`write`,
    p.`create`,
    p.submit,
    p.cancel,
    p.`delete`
FROM `tabDocPerm` p
WHERE p.role = 'Administrator'
AND p.parent IN (
    'Sales Invoice',
    'Kitchen Order Ticket',
    'Customer Display Profile',
    'Table Display Profile',
    'IMOGI POS Profile',
    'Table'
)
ORDER BY p.parent;
```

Expected: Administrator should have full permissions (all = 1)

If not, check Custom DocPerm:
```sql
SELECT * FROM `tabCustom DocPerm` 
WHERE role = 'Administrator'
AND parent LIKE '%POS%' OR parent LIKE '%Kitchen%' OR parent LIKE '%Display%';
```

### Verify No Permission Bypass Issues:

Search for ignore_permissions usage:
```bash
grep -rn "ignore_permissions" imogi_pos/ --include="*.py"
```

Make sure any ignore_permissions=True has proper justification dan security check.

---

## 4. Test Matrix

Create comprehensive test untuk each user role:

| Test Case | Guest | Cashier | Kitchen | Waiter | Manager | Admin |
|-----------|-------|---------|---------|--------|---------|-------|
| Access /module-select | ❌ Redirect | ✅ | ✅ | ✅ | ✅ | ✅ |
| See Counter POS module | N/A | ✅ | ❌ | ❌ | ✅ | ✅ |
| See Kitchen module | N/A | ❌ | ✅ | ❌ | ✅ | ✅ |
| See Waiter module | N/A | ❌ | ❌ | ✅ | ✅ | ✅ |
| See Display Editor | N/A | ❌ | ❌ | ❌ | ✅ | ✅ |
| Access /counter-pos | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Access /kitchen | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Access /waiter | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create Invoice | N/A | ✅ | ❌ | ❌ | ✅ | ✅ |
| Update KOT | N/A | ❌ | ✅ | ❌ | ✅ | ✅ |

Test each cell dalam matrix dan report hasil.

---

## 5. Code Fixes Required

Provide complete code fixes untuk:

### Fix 1: Module Select API
File: `imogi_pos/api/module_select.py`
```python
# Complete updated code
```

### Fix 2: Page Decorators
For each file:
- imogi_pos/www/counter/pos/index.py
- imogi_pos/www/restaurant/kitchen/index.py
- etc.

Show complete updated code.

### Fix 3: Frontend Auth Checks
For each React app:
- src/apps/counter-pos/App.jsx
- src/apps/kitchen/App.jsx
- etc.

Show updated useAuth calls.

### Fix 4: Auth Helpers
File: imogi_pos/utils/auth_helpers.py

Show updated get_user_role_context with is_admin flag.

---

## 6. Verification Tests

After applying fixes, run these tests:

### Test 1: Administrator Full Access
```javascript
// Login as Administrator
fetch('/api/method/imogi_pos.utils.auth_helpers.get_user_role_context')
  .then(r => r.json())
  .then(data => {
    console.log('Is Admin:', data.message.is_admin)
    console.log('Roles:', data.message.roles)
  })

fetch('/api/method/imogi_pos.api.module_select.get_available_modules')
  .then(r => r.json())
  .then(data => {
    console.log('Available modules:', data.message.modules.length)
    // Should show ALL modules
  })
```

### Test 2: Module Select Flow
```
1. Logout
2. Access /counter-pos
3. Should redirect to /imogi-login?next=/counter-pos
4. Login as Cashier
5. Should redirect back to /counter-pos
6. App should load successfully
```

### Test 3: Branch Access
```javascript
fetch('/api/method/imogi_pos.api.module_select.get_user_branch_info')
  .then(r => r.json())
  .then(data => {
    console.log('Current branch:', data.message.current_branch)
    console.log('Available branches:', data.message.available_branches)
  })
```

---

## Output Required

1. **List of all files that need updates** dengan exact line numbers
2. **Complete code fixes** untuk each file
3. **SQL scripts** untuk permission fixes (if needed)
4. **Test results** untuk verification
5. **Migration guide** jika ada breaking changes

Format output as actionable checklist:
- [ ] Update module_select.py
- [ ] Update counter/pos/index.py
- [ ] Update kitchen/index.py
- [ ] etc.
```

---

## 🎯 Expected Assistant Response

Assistant should provide:

1. **Complete file audit** showing current state
2. **All required code changes** dengan full code snippets
3. **SQL queries** untuk verify permissions
4. **Test scripts** untuk verify fixes
5. **Step-by-step deployment guide**

Example response format:
```markdown
# Administrator & Module Select Fix Report

## Files Requiring Updates: 8

### 1. imogi_pos/api/module_select.py
**Line 15-45**: Update get_available_modules()

Current:
```python
def get_available_modules():
    # missing Administrator handling
```

Fixed:
```python
@frappe.whitelist()
def get_available_modules():
    user = frappe.session.user
    roles = frappe.get_roles(user)
    
    # Administrator gets all modules
    if 'Administrator' in roles:
        return {'modules': [...all modules...]}
```

### 2. imogi_pos/www/counter/pos/index.py
**Line 9**: Update @require_roles decorator

Current:
```python
@require_roles("Cashier", "Branch Manager", "System Manager")
```

Fixed:
```python
@require_roles("Cashier", "Branch Manager", "System Manager", "Administrator")
```

[... continue for all files ...]

## Deployment Steps
1. Update files as shown above
2. Run: bench restart
3. Clear cache: bench clear-cache
4. Test with Administrator login
5. Verify module select shows all modules

## Verification Checklist
- [ ] Administrator can access /module-select
- [ ] All modules shown for Administrator
- [ ] Can access each POS app
- [ ] No permission errors
```
