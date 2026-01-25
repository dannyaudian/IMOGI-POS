# Authorization & Permission Development Guidelines

**Updated**: January 25, 2026 (After Authorization Consolidation + Linting Setup)

---

## 🚨 LINTING ENFORCEMENT

### Automatic Checks on Commit

This project uses **pre-commit hooks** to automatically validate authorization patterns:

```bash
# Setup pre-commit hooks (one-time)
pip install pre-commit
pre-commit install

# To run manually
pre-commit run --all-files
```

### What Gets Checked Automatically

✅ **Prevent direct cache access**:
```python
# ❌ THIS WILL BE REJECTED by pre-commit hook
branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)

# ✅ USE THIS INSTEAD
from imogi_pos.utils.auth_helpers import get_active_branch
branch = get_active_branch()
```

✅ **Prevent inline role checks**:
```python
# ❌ THIS WILL BE REJECTED by pre-commit hook
if "Cashier" not in frappe.get_roles():
    # ... do something

# ✅ USE THIS INSTEAD
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier")
def get_context(context):
    # ... implementation
```

✅ **Require proper imports**:
- If you use `@require_roles` decorator, import is validated
- If you use `@allow_guest_if_configured`, import is validated
- If you use `get_active_branch()`, import is validated

### Linting Config Files

- **`.pre-commit-config.yaml`** - Git hook configuration
- **`.flake8`** - Python linting rules
- **`scripts/validate_auth_imports.py`** - Custom authorization validation

---

## 📚 Quick Reference

### When You Need to Check Permissions:

#### **Checking if User is Admin/System Manager?**
```python
from imogi_pos.utils.permissions import has_privileged_access

# Check current user
if has_privileged_access():
    # Current user is Admin or System Manager
    
# Check specific user
if has_privileged_access("user@example.com"):
    # That user is Admin or System Manager
```

#### **Checking if User Can Access a Branch?**
```python
from imogi_pos.utils.permissions import validate_branch_access

# Will throw error if user doesn't have access
validate_branch_access("Main Branch", throw=True)

# Or check without throwing
if validate_branch_access("Main Branch", throw=False):
    # User has access
```

#### **Checking API Permission (DocType)?**
```python
from imogi_pos.utils.permissions import validate_api_permission

# Will throw error if user doesn't have permission
validate_api_permission("POS Order", perm_type="write", throw=True)

# With specific document
validate_api_permission("POS Order", doc="POS-2026-001", perm_type="write")
```

#### **Getting User Role Context for UI?**
```python
from imogi_pos.utils.auth_helpers import get_user_role_context

context = get_user_role_context()
if context['is_cashier']:
    # Show cashier-specific UI

if context['is_manager']:  # Branch or Area Manager
    # Show manager controls
```

#### **Getting User's POS Profile?**
```python
from imogi_pos.utils.auth_helpers import get_user_pos_profile

profile = get_user_pos_profile(allow_fallback=True)
if profile:
    # Use profile configuration
```

---

## 🚀 Protecting Pages (www/)

### For Public Pages (Kiosk, Self-Order):
```python
from imogi_pos.utils.auth_decorators import allow_guest_if_configured

@allow_guest_if_configured()
def get_context(context):
    # Guest access allowed if setting is enabled
    return context
```

### For Authenticated User Pages:
```python
from imogi_pos.utils.auth_decorators import require_login

@require_login()
def get_context(context):
    # User must be logged in
    return context
```

### For Role-Restricted Pages:
```python
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    # Only Cashier, Branch Manager, or System Manager can access
    return context
```

### For Pages Requiring POS Profile:
```python
from imogi_pos.utils.auth_decorators import require_pos_profile

@require_pos_profile(allow_fallback=True)
def get_context(context):
    # User must have a POS Profile assigned
    return context
```

### For Pages Requiring Branch Access:
```python
from imogi_pos.utils.auth_decorators import require_branch_access

@require_branch_access(branch_param="branch")
def get_context(context):
    # Validates user has access to branch from query param
    return context
```

---

## 🔌 Protecting API Endpoints

### Simple API with Single Permission:
```python
from frappe import whitelist
from imogi_pos.utils.decorators import require_permission

@whitelist()
@require_permission("POS Order", "write")
def create_order(data):
    # Only users with write permission on POS Order can call
    return process_order(data)
```

### API Requiring One of Multiple Permissions:
```python
from frappe import whitelist
from imogi_pos.utils.decorators import require_any_permission

@whitelist()
@require_any_permission("Sales Invoice", "Delivery Note", perm_type="create")
def bulk_print(doctype, ids):
    # User must have create permission on at least one of: Sales Invoice or Delivery Note
    return do_something(doctype, ids)
```

### API Requiring Specific Role:
```python
from frappe import whitelist
from imogi_pos.utils.decorators import require_role

@whitelist()
@require_role("Branch Manager", "Area Manager", "System Manager")
def get_branch_summary():
    # Only managers can access
    return get_summary()
```

### Manual Permission Check:
```python
from frappe import whitelist, PermissionError
from imogi_pos.utils.permissions import validate_branch_access

@whitelist()
def process_branch_data(branch):
    # Manually validate
    try:
        validate_branch_access(branch, throw=True)
    except PermissionError:
        # Handle permission error
        return {"error": "Access denied"}
    
    return process_data(branch)
```

---

## 📋 Common Patterns

### Pattern 1: Admin-Only Function
```python
from imogi_pos.utils.permissions import has_privileged_access

def dangerous_operation():
    if not has_privileged_access():
        raise frappe.PermissionError("Only administrators can do this")
    
    # Perform operation
    return execute()
```

### Pattern 2: Branch-Scoped Data Access
```python
from imogi_pos.utils.auth_helpers import get_active_branch
from imogi_pos.utils.permissions import validate_branch_access

def get_user_data():
    branch = get_active_branch()
    
    if not branch:
        raise frappe.ValidationError("No active branch set")
    
    validate_branch_access(branch)
    
    # Get data scoped to branch
    return frappe.get_all("POS Order", filters={"branch": branch})
```

### Pattern 3: Role-Based Feature Toggle
```python
from imogi_pos.utils.auth_helpers import get_user_role_context

def get_available_features():
    context = get_user_role_context()
    
    features = {
        "basic": True,  # Everyone has basic features
    }
    
    if context['is_manager']:
        features['reports'] = True
    
    if context['is_admin']:
        features['system_config'] = True
    
    return features
```

### Pattern 4: Permission Check in Validator
```python
from imogi_pos.utils.permissions import validate_api_permission
from imogi_pos.utils.auth_helpers import validate_pos_profile_access

def validate_order(doc):
    # Ensure user has write permission on POS Order
    validate_api_permission("POS Order", doc.name, "write", throw=True)
    
    # Ensure user can access this profile
    validate_pos_profile_access(doc.pos_profile)
    
    # Validate order data
    # ...
```

---

## ⚠️ Common Mistakes to Avoid

### ❌ DON'T: Check roles manually
```python
# WRONG
if "System Manager" in frappe.get_roles():
    # This is inconsistent across codebase
```

### ✅ DO: Use centralized function
```python
# RIGHT
from imogi_pos.utils.permissions import has_privileged_access
if has_privileged_access():
    # Consistent, maintainable
```

---

### ❌ DON'T: Import from wrong module
```python
# WRONG
from imogi_pos.utils.auth_helpers import validate_branch_access
```

### ✅ DO: Import from permissions module
```python
# RIGHT
from imogi_pos.utils.permissions import validate_branch_access
```

---

### ❌ DON'T: Duplicate permission checking
```python
# WRONG - in multiple files
def my_api():
    if frappe.session.user == "Administrator":
        # Duplicated in 5 places
        pass
```

### ✅ DO: Create reusable decorator
```python
# RIGHT - single source of truth
@frappe.whitelist()
@require_role("System Manager")
def my_api():
    pass
```

---

### ❌ DON'T: Ignore permission errors
```python
# WRONG
try:
    validate_branch_access(branch)
except:
    pass  # Silently ignoring
```

### ✅ DO: Handle appropriately
```python
# RIGHT
try:
    validate_branch_access(branch, throw=True)
except frappe.PermissionError as e:
    frappe.msgprint(f"Access denied: {e}")
    return
```

---

## 🧪 Testing Permissions

### Test Admin Access:
```python
def test_admin_bypass():
    """Admins should bypass most checks"""
    # Set user as System Manager
    frappe.session.user = "admin@example.com"
    
    # This should not raise
    validate_branch_access("any_branch")
    
    # Restore
    frappe.session.user = "original_user"
```

### Test Role-Based Access:
```python
def test_cashier_access():
    """Cashiers should access POS functions"""
    # Create test user with Cashier role
    user = frappe.get_doc({
        "doctype": "User",
        "email": "cashier@test.com",
        "first_name": "Test",
        "roles": [{"role": "Cashier"}]
    }).insert()
    
    # Test with that user
    original_user = frappe.session.user
    frappe.session.user = "cashier@test.com"
    
    # Cashier should access POS Order
    validate_api_permission("POS Order", perm_type="write")
    
    frappe.session.user = original_user
```

---

## � Linting Rules for Authorization Patterns

### Rule 1: No Direct Cache Access in www/ Files

**What This Prevents**:
```python
# ❌ FORBIDDEN
branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)
```

**Why It's Forbidden**:
- Hard to test and mock
- Violates separation of concerns
- Authorization logic scattered across codebase

**What To Do Instead**:
```python
# ✅ APPROVED
from imogi_pos.utils.auth_helpers import get_active_branch
branch = get_active_branch()
```

**Checked By**: `.pre-commit-config.yaml` - `no-frappe-cache-hget` hook

---

### Rule 2: No Inline Role Checking in www/ Files

**What This Prevents**:
```python
# ❌ FORBIDDEN
if "Cashier" not in frappe.get_roles():
    set_setup_error(...)
```

**Why It's Forbidden**:
- Role validation duplicated across codebase
- Hard to change role logic (would need updates everywhere)
- Anti-pattern that contradicts decorators

**What To Do Instead**:
```python
# ✅ APPROVED
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier")
def get_context(context):
    # Role validation handled by decorator
```

**Checked By**: `.pre-commit-config.yaml` - `no-inline-frappe-get-roles` hook

---

### Rule 3: Required Imports for Auth Usage

**What This Validates**:

If your page uses authorization, it must import the right utilities:

| Pattern | Import Required |
|---------|-----------------|
| `@require_roles()` | `from imogi_pos.utils.auth_decorators import require_roles` |
| `@allow_guest_if_configured()` | `from imogi_pos.utils.auth_decorators import allow_guest_if_configured` |
| `get_active_branch()` | `from imogi_pos.utils.auth_helpers import get_active_branch` |
| `validate_branch_access()` | `from imogi_pos.utils.permissions import validate_branch_access` |

**Checked By**: `.pre-commit-config.yaml` - `require-auth-imports` hook + `scripts/validate_auth_imports.py`

---

## 📋 Setting Up Linting

### Prerequisites

```bash
# Install pre-commit framework
pip install pre-commit

# Install Python linting tools
pip install flake8 black isort
```

### First-Time Setup

```bash
# Clone the repository
git clone <repo>
cd IMOGI-POS

# Install pre-commit hooks
pre-commit install

# Run hooks on all files (optional - to see current status)
pre-commit run --all-files
```

### Running Linting

```bash
# Run on commit (automatic)
git commit -m "your message"

# Run manually on all files
pre-commit run --all-files

# Run on specific files
pre-commit run --files imogi_pos/www/counter/pos/index.py
```

### Fixing Linting Issues

Most linting issues can be fixed automatically:

```bash
# Fix import sorting (isort)
isort imogi_pos/www/

# Fix code formatting (black)
black imogi_pos/www/

# View flake8 issues (cannot auto-fix)
flake8 imogi_pos/www/
```

---

## 🚀 Best Practices Summary

| DO ✅ | DON'T ❌ |
|------|---------|
| Use `@require_roles` decorator | Check `frappe.get_roles()` inline |
| Use `@allow_guest_if_configured` | Hardcode guest access with `allow_guest=True` |
| Import from `imogi_pos.utils.permissions` | Import from random utility files |
| Use `get_active_branch()` helper | Use `frappe.cache().hget()` directly |
| Use `validate_branch_access()` | Check branch with inline queries |
| Use `get_user_role_context()` | Access session directly |
| Have imports at file top | Mix imports throughout code |
| Handle permission errors gracefully | Silently ignore errors |
| Document why permission is needed | Leave authorization logic unexplained |
| Test with different user roles | Test only with admin user |

---

## 📞 Troubleshooting Linting Issues

### "pre-commit hook failed"

**Check what failed**:
```bash
git commit -m "message"
# Shows which hooks failed

# Or run manually to see details
pre-commit run --all-files --verbose
```

**Common Issues**:

1. **Import not found**:
   ```
   ❌ Uses @require_roles but missing import
   ```
   Solution: Add `from imogi_pos.utils.auth_decorators import require_roles`

2. **Using old pattern**:
   ```
   ❌ Uses inline frappe.get_roles() - use @require_roles decorator instead
   ```
   Solution: Replace inline check with `@require_roles` decorator

3. **Direct cache access**:
   ```
   ❌ Uses direct cache access - use get_active_branch() instead
   ```
   Solution: Replace with `from imogi_pos.utils.auth_helpers import get_active_branch`

### Skipping Hooks (Not Recommended)

If you need to skip a hook temporarily:

```bash
# Skip all hooks
git commit --no-verify

# Only in emergencies - your code may not pass review!
```

---

## 📝 Related Files

- **[AUTHORIZATION_REFACTOR_REPORT.md](AUTHORIZATION_REFACTOR_REPORT.md)** - Consolidation work
- **[DOCTYPE_AND_WWW_REFACTORING_STATUS.md](DOCTYPE_AND_WWW_REFACTORING_STATUS.md)** - Status analysis
- **[DOCTYPE_WWW_REFACTORING_IMPLEMENTATION.md](DOCTYPE_WWW_REFACTORING_IMPLEMENTATION.md)** - Implementation details
- **[.pre-commit-config.yaml](.pre-commit-config.yaml)** - Git hook configuration
- **[.flake8](.flake8)** - Python linting configuration
- **[scripts/validate_auth_imports.py](scripts/validate_auth_imports.py)** - Custom validation script

---

## 📞 Need Help?

See these files for more details:
- **Core permission logic**: [permissions.py](imogi_pos/utils/permissions.py)
- **User context helpers**: [auth_helpers.py](imogi_pos/utils/auth_helpers.py)
- **Page decorators**: [auth_decorators.py](imogi_pos/utils/auth_decorators.py)
- **API decorators**: [decorators.py](imogi_pos/utils/decorators.py)
- **Full refactor report**: [AUTHORIZATION_REFACTOR_REPORT.md](AUTHORIZATION_REFACTOR_REPORT.md)

---

**Version**: 2.0  
**Last Updated**: January 25, 2026  
**Status**: ✅ Complete with Linting Setup
