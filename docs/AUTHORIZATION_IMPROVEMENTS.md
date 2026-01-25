# Authorization & Permission Improvements

**Last Updated**: January 25, 2026 (After Authorization Consolidation Refactor)

## 📋 Ringkasan Perubahan

Implementasi sistem autorisasi yang komprehensif untuk IMOGI POS dengan kontrol di berbagai level:
- ✅ API Level Permissions
- ✅ DocType Level Permissions  
- ✅ Field Level Permissions
- ✅ Button/Action Level Permissions
- ✅ Menu Level Permissions
- ✅ List View Filtering
- ✅ Pesan error yang informatif
- ✅ **Centralized Permission Logic (Post-Refactor)**

## 📌 IMPORTANT: Current Implementation Architecture

### Centralized Permission Modules (Actual Implementation)

After January 2026 refactoring, the authorization system is consolidated into 3 main modules:

#### 1. **`/imogi_pos/utils/permissions.py`** (Primary Permission Authority)
```python
# Core permission functions - ALWAYS use these for permission checks
has_privileged_access(user=None)
    → Check if user is Administrator or System Manager
    
validate_api_permission(doctype, doc=None, perm_type="read", throw=True)
    → API-level permission validation using ERPNext native permissions
    
validate_branch_access(branch, throw=True)  
    → Validate user can access a specific branch
```

#### 2. **`/imogi_pos/utils/auth_helpers.py`** (User Context & Profile Utilities)
```python
# User context helpers - use for UI rendering and profile operations
get_user_role_context(user=None)
    → Get role context dict for conditional UI rendering
    
get_user_pos_profile(user=None, allow_fallback=True)
    → Get user's assigned POS Profile
    
validate_pos_profile_access(pos_profile, user=None)
    → Validate user can access POS Profile (uses has_privileged_access internally)
    
get_active_branch(user=None)
    → Get user's active branch setting
    
set_active_branch(branch, user=None)
    → Set active branch (validates via validate_branch_access)
    
get_role_based_default_route(user=None)
    → Get default landing page URL based on role
```

#### 3. **`/imogi_pos/utils/auth_decorators.py`** (Page-Level Authentication)
```python
# Use these decorators for www/ pages only
@require_login(redirect_to=None)
    → Ensure user is authenticated

@require_roles(*roles)
    → Enforce role requirements (uses get_roles internally)

@allow_guest_if_configured(setting_field, setting_doctype)
    → Allow guest based on settings
    
@require_pos_profile(allow_fallback=True)
    → Ensure user has POS Profile (uses get_user_pos_profile)
    
@require_branch_access(branch_param="branch")
    → Validate branch access (uses validate_branch_access)
```

#### 4. **`/imogi_pos/utils/decorators.py`** (API Endpoint Authentication)
```python
# Use these decorators for API endpoints only
@require_permission(doctype, perm_type="read")
    → API-level permission check (uses validate_api_permission)
    
@require_any_permission(*doctypes, perm_type="read")
    → Permission on any of specified doctypes
    
@require_role(*roles)
    → Role-based API access
```

### Key Consolidation Points

✅ **Single Source of Truth for Privilege Checks**
- All `has_privileged_access()` calls use same function in `permissions.py`
- Removed duplicate logic from `auth_helpers.py` and `self_order_session.py`

✅ **Consistent Branch Validation**
- Single `validate_branch_access()` in `permissions.py`
- Used by decorators, auth helpers, and API functions

✅ **Proper Import Hierarchy**
- `auth_helpers.py` → imports from `permissions.py`
- `auth_decorators.py` → imports from `permissions.py` & `auth_helpers.py`
- `decorators.py` → imports from `permissions.py`
- Circular imports prevented

---

## 🔐 Kebijakan Permission

### Akses Bebas (Unrestricted Access)
Hanya **Administrator** dan **System Manager** yang memiliki akses bebas tanpa batasan ke seluruh sistem.

### Akses Terbatas (Restricted Access)
Semua role lainnya mengikuti aturan permission native ERPNext v15+:
- **Area Manager** - Mengelola beberapa branch, akses ke dashboard area dan laporan multi-branch
- **Branch Manager** - Akses penuh ke operasi branch yang ditugaskan, termasuk konfigurasi branch
- **Finance Controller** - Akses ke laporan finansial dan approval proses finansial
- **Cashier** - Terbatas pada operasi POS di branch yang ditugaskan
- **Waiter** - Terbatas pada operasi restaurant/waiter di branch yang ditugaskan
- **Kitchen Staff** - Terbatas pada operasi kitchen di station yang ditugaskan

## 🛠️ File yang Diubah/Dibuat

### 1. Backend Permission Management

#### `/imogi_pos/utils/permissions.py`
**Fungsi untuk API-level permission:**
- `has_privileged_access(user=None)` - Cek apakah user adalah Administrator atau System Manager
- `validate_api_permission(doctype, doc=None, perm_type="read", throw=True)` - Validasi permission API dengan pesan error informatif
- `validate_branch_access(branch, throw=True)` - Validasi akses branch dengan pesan error yang jelas

#### `/imogi_pos/utils/auth_helpers.py` (Refactored)
**Fungsi user context & profile (UPDATED: imports from permissions.py):**
- `get_user_pos_profile(user, allow_fallback)` - Get user's POS Profile
- `get_user_role_context(user)` - Get role context for UI
- `validate_pos_profile_access(pos_profile, user)` - Validate POS Profile access
- `get_active_branch(user)` - Get user's active branch
- `set_active_branch(branch, user)` - Set user's active branch
- `validate_active_session(pos_profile)` - Validate POS session
- `get_role_based_default_route(user)` - Get default landing page

#### `/imogi_pos/utils/decorators.py`
**API endpoint decorators:**# Custom permission query conditions untuk list view filtering
permission_query_conditions = {
    "POS Order": "imogi_pos.utils.role_permissions.get_permission_query_conditions",
    "Sales Invoice": "imogi_pos.utils.role_permissions.get_permission_query_conditions",
    "KOT Ticket": "imogi_pos.utils.role_permissions.get_permission_query_conditions",
}

# Custom has_permission override
has_permission = {
    "POS Order": "imogi_pos.utils.role_permissions.has_doctype_permission",
    "Sales Invoice": "imogi_pos.utils.role_permissions.has_doctype_permission",
}
```

### 5. HTML Permission Attributes

**Automatic UI control via data attributes:**
```html
<!-- DocType permission -->
<button data-doctype-permission="POS Order:write">
    Create Order
</button>

<!-- Button permission -->
<div data-button-permission="POS Order:cancel_order">
    Cancel Order Section
</div>

<!-- Menu permission -->
<nav data-menu-permission="Kitchen Display">
    Kitchen Menu
</nav>

<!-- Role-based -->
<section data-required-roles="Branch Manager,Area Manager,System Manager">
    Admin Controls
</section>
```

## 📚 Complete Usage Examples

### Example 1: Form Script with Full Permission Control

```javascript
frappe.ui.form.on('POS Order', {
    async onload(frm) {
        await PermissionManager.init();
        
        // Apply automatic restrictions
        PermissionManager.applyFormRestrictions(frm);
        
        // Custom field logic
        if (!PermissionManager.hasFieldPermission('POS Order', 'discount_amount', 'write')) {
            frm.set_df_property('discount_section', 'hidden', 1);
        }
        
        // Custom button logic  
        if (PermissionManager.hasButtonPermission('POS Order', 'cancel_order')) {
            frm.add_custom_button(__('Cancel Order'), () => {
                // Cancel logic
            });
        }
    },
    
    refresh(frm) {
        // Remove buttons without permission
        if (!PermissionManager.hasButtonPermission('POS Order', 'refund_order')) {
            frm.remove_custom_button(__('Create Return'));
        }
    }
});
```

### Example 2: List View with Permission Filtering

```javascript
frappe.listview_settings['POS Order'] = {
    onload(listview) {
        PermissionManager.init().then(() => {
            // Hide bulk delete if no permission
            if (!PermissionManager.hasDocTypePermission('POS Order', 'delete')) {
                listview.page.clear_actions_menu();
            }
            
            // Manager-only bulk actions
            if (PermissionManager.hasAnyRole(['Branch Manager', 'Area Manager', 'System Manager'])) {
                listview.page.add_actions_menu_item(__('Bulk Cancel'), () => {
                    // Bulk cancel logic
                }, false);
            }
        });
    }
};
```

### Example 3: Custom Page with Permission Check

```javascript
frappe.pages['kitchen-display'].on_page_load = async function(wrapper) {
    await PermissionManager.init();
    
    // Check menu access
    if (!PermissionManager.hasMenuAccess('Kitchen Display')) {
        PermissionManager.showPermissionDenied('access Kitchen Display');
        frappe.set_route('');
        return;
    }
    
    // Render page
    renderKitchenDisplay(wrapper);
};
```

### Example 4: Backend API with Permission Decorator

```python
from imogi_pos.utils.decorators import require_permission, require_role

@frappe.whitelist()
@require_permission("Sales Invoice", "create")
def generate_invoice(pos_order):
    # Only users with create permission on Sales Invoice can access
    # Administrator and System Manager bypass this check
    pass

@frappe.whitelist()
@require_role("Cashier", "Restaurant Manager")  
def cashier_operation():
    # Only Cashier or Restaurant Manager can access
    # Administrator and System Manager bypass this check
    pass
```

## 🎯 Permission Control Levels

### Level 1: API Endpoints
- ✅ Decorator-based permission checks
- ✅ Branch access validation
- ✅ Informative error messages

### Level 2: DocType Access
- ✅ Create, Read, Write, Delete permissions
- ✅ Role-based access control
- ✅ List view filtering by branch

### Level 3: Field Access
- ✅ Field visibility (read permission)
- ✅ Field editability (write permission)
- ✅ Auto-applied via PermissionManager

### Level 4: Button/Action Access
- ✅ Button visibility control
- ✅ Custom button creation based on permission
- ✅ Standard button removal

### Level 5: Menu Access
- ✅ Menu item visibility
- ✅ Page access control
- ✅ Automatic redirection if no access

### Level 6: List View Filtering
- ✅ Automatic filtering by branch
- ✅ Users see only their assigned branch data
- ✅ No manual filtering needed

## 📋 Permission Matrix

| Role | API Access | DocType CRUD | Field Access | Button Access | Menu Access | Branch Filter |
|------|-----------|--------------|--------------|---------------|-------------|---------------|
| **Administrator** | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ❌ None (sees all) |
| **System Manager** | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ❌ None (sees all) |
| **Area Manager** | ✅ Multi-Branch | ✅ Most | ✅ Most | ✅ Most | ✅ Area Reports | ✅ Assigned area branches |
| **Branch Manager** | ✅ Branch Ops | ✅ Most | ✅ Most | ✅ Most | ✅ Branch | ✅ Assigned branch |
| **Finance Controller** | ✅ Financial | ✅ Financial Only | ✅ Financial | ✅ Approval | ✅ Finance | ✅ Assigned branches |
| **Cashier** | ✅ POS Only | 🔒 Limited | 🔒 Limited | 🔒 Limited | ✅ Counter | ✅ Assigned branch |
| **Waiter** | ✅ Restaurant Only | 🔒 Limited | 🔒 Limited | 🔒 Limited | ✅ Restaurant | ✅ Assigned branch |
| **Kitchen Staff** | ✅ Kitchen Only | 🔒 Read-only | 🔒 Status only | 🔒 Status only | ✅ Kitchen | ✅ Assigned station |

## 📝 Permission Configuration Guide

### Adding New DocType Restrictions

Edit `/imogi_pos/utils/role_permissions.py`:
```python
DOCTYPE_RESTRICTIONS["My DocType"] = {
    "create": PRIVILEGED_ROLES + ["Custom Role"],
    "read": PRIVILEGED_ROLES + ["Custom Role", "Reader Role"],
    "write": PRIVILEGED_ROLES + ["Custom Role"],
    "delete": PRIVILEGED_ROLES,
}
```

### Adding Field Restrictions

```python
FIELD_RESTRICTIONS["My DocType"] = {
    "sensitive_field": {
        "read": PRIVILEGED_ROLES + ["Manager"],
        "write": PRIVILEGED_ROLES,
    }
}
```

### Adding Button Restrictions

```python
BUTTON_RESTRICTIONS["My DocType"] = {
    "dangerous_action": PRIVILEGED_ROLES + ["Manager"],
    "safe_action": PRIVILEGED_ROLES + ["Manager", "User"],
}
```

## 🧪 Testing Guide

### Test 1: API Permission Check
```bash
# Login as Cashier
# Try to access System Manager only endpoint
curl -X POST http://localhost:8000/api/method/restricted_endpoint

# Expected: 403 with informative error message
```

### Test 2: Field Permission
```javascript
// Login as Cashier
// Open POS Order form
// Try to edit discount_percent field

// Expected: Field is read-only if Cashier doesn't have write permission
```

### Test 3: Button Permission
```javascript
// Login as Kitchen Staff  
// Open KOT Ticket form
// Look for Cancel button

// Expected: Cancel button hidden (only Branch Manager and above can cancel)
```

### Test 4: List View Filtering
```bash
# Login as Cashier assigned to Branch A
# Open POS Order list

# Expected: Only see orders from Branch A
# Login as Administrator -> See all orders from all branches
```

### Test 5: Menu Access
```javascript
// Login as Cashier
// Try to access /restaurant/kitchen

// Expected: Redirect with "Access Denied" message
```

## ✅ Keuntungan Complete Implementation

1. ✅ **Multi-Level Security** - Protection at every layer (API, DocType, Field, Button, Menu)
2. ✅ **Consistent Enforcement** - Same rules applied backend and frontend
3. ✅ **Informative Errors** - Users know exactly why access was denied
4. ✅ **Automatic UI Control** - No manual show/hide logic needed
5. ✅ **Branch Isolation** - Users automatically see only their branch data
6. ✅ **Maintainable** - Central configuration file for all permissions
7. ✅ **ERPNext Native** - Follows ERPNext v15+ permission model
8. ✅ **Backward Compatible** - No breaking changes

## 🔄 Migration Path

### For Existing Installations

1. **Deploy new files:**
   ```bash
   bench update --app imogi_pos
   bench build --app imogi_pos
   bench migrate
   ```

2. **Clear cache:**
   ```bash
   bench clear-cache
   bench restart
   ```

3. **Test with different roles:**
   - Login as each role type
   - Verify appropriate restrictions
   - Check error messages are informative

4. **Adjust permissions if needed:**
   - Edit `/imogi_pos/utils/role_permissions.py`
   - Add/modify restrictions as needed
   - Reload

## 📖 Documentation Links

- **Backend Permission API**: [imogi_pos/utils/role_permissions.py](../imogi_pos/utils/role_permissions.py)
- **Frontend Permission Manager**: [imogi_pos/public/js/core/permission-manager.js](../imogi_pos/public/js/core/permission-manager.js)
- **Usage Examples**: [imogi_pos/public/js/examples/permission_examples.js](../imogi_pos/public/js/examples/permission_examples.js)
- **API Decorators**: [imogi_pos/utils/decorators.py](../imogi_pos/utils/decorators.py)
- **Permission Utilities**: [imogi_pos/utils/permissions.py](../imogi_pos/utils/permissions.py)

## 🚀 Next Steps (Optional Enhancements)

1. [ ] Add audit logging for permission denials
2. [ ] Implement rate limiting per role
3. [ ] Create permission report dashboard
4. [ ] Add permission override capability for System Manager
5. [ ] Implement time-based permissions (e.g., weekend restrictions)
6. [ ] Create permission testing suite
7. [ ] Add permission change notifications

---

**Tanggal:** 25 Januari 2026  
**Status:** ✅ Implemented (Complete)  
**Breaking Changes:** ❌ None
**Coverage:** API, DocType, Field, Button, Menu, List View
### 3. API Endpoints yang Diupdate

#### `/imogi_pos/api/billing.py`
- ✅ Import decorator dan permission utilities
- ✅ `generate_invoice()` - Ditambahkan `@require_permission("Sales Invoice", "create")`
- ✅ Menggunakan `validate_branch_access()` yang sudah diperbaiki

#### `/imogi_pos/api/orders.py`
- ✅ Import decorator dan permission utilities
- ✅ `add_item_to_order()` - Ditambahkan `@require_permission("POS Order", "write")`
- ✅ `create_order()` - Ditambahkan `@require_permission("POS Order", "create")`
- ✅ Menggunakan `validate_branch_access()` yang sudah diperbaiki

#### `/imogi_pos/api/layout.py`
- ✅ Import decorator dan permission utilities
- ✅ `save_table_layout()` - Ditambahkan `@require_permission("Table Layout Profile", "write")`
- ✅ Menggunakan `validate_branch_access()` yang sudah diperbaiki

#### `/imogi_pos/api/kot.py`
- ✅ Import decorator dan permission utilities
- ✅ `send_items_to_kitchen()` - Ditambahkan `@require_permission("KOT Ticket", "create")`
- ✅ Menggunakan `validate_branch_access()` yang sudah diperbaiki

#### `/imogi_pos/api/customers.py`
- ✅ Hapus duplikasi `validate_branch_access()`
- ✅ Import dari `utils.permissions`

## 📝 Pesan Error yang Informatif

### Sebelum
```python
# Error tanpa konteks
frappe.throw("Not permitted", frappe.PermissionError)
```

### Sesudah
```python
# Error dengan konteks lengkap
Access Denied: You do not have permission to write POS Order (ORD-00123).
Current user: cashier@company.com
Your roles: Cashier, Sales User
This operation requires appropriate permissions. Please contact your system administrator if you need access.
```

### Branch Access Error
```python
Access Denied: You do not have permission to access Branch: Jakarta Utara
Current user: cashier@company.com
Your roles: Cashier
You are only authorized to access specific branches assigned to you. Please contact your system administrator if you need access to this branch.
```

## ✅ Keuntungan Implementasi Ini

1. **Konsistensi** - Semua endpoint menggunakan permission checking yang sama
2. **Informatif** - User mendapat informasi jelas kenapa akses ditolak
3. **Audit Trail** - Decorator `@log_api_call` bisa digunakan untuk audit
4. **Maintainable** - Decorator lebih mudah dipahami dan dimaintain
5. **Security** - Hanya Administrator dan System Manager yang bypass permission check
6. **Native Compliance** - Mengikuti permission model native ERPNext v15+

## 🔍 Testing

### Test Permission Check
```python
# Login sebagai Cashier
# Coba akses endpoint dengan @require_permission("Sales Invoice", "delete")
# Expected: Error dengan pesan informatif

# Login sebagai System Manager
# Coba akses endpoint yang sama
# Expected: Success (bypass permission check)
```

### Test Branch Access
```python
# Login sebagai Cashier di Branch A
# Coba create order di Branch B
# Expected: Error dengan pesan branch access denied

# Login sebagai Administrator
# Coba create order di Branch B
# Expected: Success (bypass branch check)
```

## 📚 Dokumentasi untuk Developer

### Menambahkan Permission Check ke Endpoint Baru

```python
from imogi_pos.utils.decorators import require_permission, require_role

@frappe.whitelist()
@require_permission("DocType Name", "write")
def my_new_endpoint(param1, param2):
    # User harus punya write permission pada DocType Name
    pass

@frappe.whitelist()
@require_role("Cashier", "Restaurant Manager")
def role_specific_endpoint():
    # User harus punya salah satu role yang disebutkan
    pass
```

### Validasi Branch Access Manual

```python
from imogi_pos.utils.permissions import validate_branch_access

def my_function(branch):
    # Akan throw PermissionError jika user tidak punya akses
    validate_branch_access(branch)
    
    # Atau cek tanpa throw error
    has_access = validate_branch_access(branch, throw=False)
    if not has_access:
        # Handle kasus tidak punya akses
        pass
```

## 🔄 Backward Compatibility

- ✅ Endpoint yang sudah ada tetap berfungsi
- ✅ Administrator dan System Manager tetap punya akses penuh
- ✅ Permission model mengikuti ERPNext native
- ✅ Tidak ada breaking changes untuk frontend

## 🚀 Next Steps (Opsional)

1. [ ] Audit semua endpoint `@frappe.whitelist(allow_guest=True)` untuk memastikan keamanan
2. [ ] Implementasi rate limiting untuk endpoint publik
3. [ ] Tambahkan audit log untuk operasi kritikal (delete, cancel, dll)
4. [ ] Implementasi role-based UI hiding di frontend
5. [ ] Buat unit test untuk semua decorator

---

**Tanggal:** 25 Januari 2026  
**Status:** ✅ Implemented  
**Breaking Changes:** ❌ None
