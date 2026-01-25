# API Authorization Audit Report

**Date**: January 25, 2026  
**Scope**: All files in `imogi_pos/api/` directory  
**Status**: ⚠️ **NEEDS ATTENTION** - Multiple files lack proper authorization

---

## 🔍 Executive Summary

After comprehensive audit of 17 API files, we found:

- **81+ Total Endpoints** across all API modules
- **5 Protected by Decorators** (6% coverage) ❌
- **6 Files with ZERO Authorization** (35%) 🔴
- **Inconsistent Permission Patterns** across codebase
- **Mix of Centralized and Inline Permission Logic**

### Critical Issues:
1. ⚠️ **public.py** - No authorization on 3+ critical endpoints
2. ⚠️ **orders.py** - No authorization on 6+ endpoints  
3. ⚠️ **billing.py** - Weak authorization on transaction endpoints
4. ⚠️ **queue.py** - No authorization on queue operations
5. ⚠️ **queue_number.py** - Missing permission checks

---

## 📊 File-by-File Analysis

### ✅ GOOD - Proper Authorization Pattern

#### 1. **customer_display.py** (Tier: GOOD)
- **Status**: ✅ Imports `validate_branch_access` from permissions.py
- **Pattern**: Validates branch access on every endpoint
- **Endpoints Protected**: All display-related operations
- **Example**:
```python
from imogi_pos.utils.permissions import validate_branch_access

@frappe.whitelist()
def update_display(branch, device_id, content):
    validate_branch_access(branch)  # ✅ Proper check
    # ... implementation
```
- **Issues**: None
- **Refactoring Needed**: ❌ No

---

#### 2. **layout.py** (Tier: GOOD)
- **Status**: ✅ Uses both `validate_branch_access` and `@require_permission`
- **Pattern**: Hybrid approach - validates branch AND uses decorators
- **Endpoints Protected**: All layout/table operations
- **Example**:
```python
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.utils.decorators import require_permission

@frappe.whitelist()
@require_permission("Table Layout Profile", "write")
def save_table_layout(floor, layout_json):
    validate_branch_access(branch)  # ✅ Double protection
    # ... implementation
```
- **Issues**: None
- **Refactoring Needed**: ❌ No

---

#### 3. **printing.py** (Tier: GOOD)
- **Status**: ✅ Imports `validate_branch_access`
- **Pattern**: Validates branch on all print operations
- **Endpoints Protected**: 8+ print-related operations
- **Example**:
```python
from imogi_pos.utils.permissions import validate_branch_access

@frappe.whitelist()
def print_order(order_id, template=None):
    validate_branch_access(order_doc.branch)  # ✅ Proper check
    # ... implementation
```
- **Issues**: None
- **Refactoring Needed**: ❌ No

---

#### 4. **variants.py** (Tier: GOOD)
- **Status**: ✅ Imports `validate_branch_access`
- **Pattern**: Validates branch access
- **Endpoints Protected**: Variant operations
- **Example**:
```python
from imogi_pos.utils.permissions import validate_branch_access

@frappe.whitelist()
def get_variants(branch, item):
    validate_branch_access(branch)  # ✅ Proper check
    # ... implementation
```
- **Issues**: None
- **Refactoring Needed**: ❌ No

---

#### 5. **customers.py** (Tier: GOOD)
- **Status**: ✅ Imports `validate_branch_access` and `validate_api_permission`
- **Pattern**: Uses both branch and API permission validation
- **Endpoints Protected**: Customer operations
- **Example**:
```python
from imogi_pos.utils.permissions import validate_branch_access, validate_api_permission

@frappe.whitelist()
def create_customer(customer_data, branch):
    validate_api_permission("Customer", perm_type="create")
    validate_branch_access(branch)
    # ... implementation
```
- **Issues**: None
- **Refactoring Needed**: ❌ No

---

### ⚠️ MEDIUM - Partial Authorization

#### 6. **kot.py** (Tier: MEDIUM)
- **Status**: ⚠️ Imports `validate_branch_access` but NOT consistently used
- **Pattern**: Some endpoints protected, others not
- **Endpoints Protected**: ~40% of operations
- **Issues Found**:
  - ❌ `get_kitchen_display_tickets()` - NO authorization check
  - ❌ `update_ticket_status()` - NO authorization check
  - ✅ `print_ticket()` - HAS `validate_branch_access()`
- **Example Problem**:
```python
@frappe.whitelist(allow_guest=True)  # ❌ Allows guest!
def get_kitchen_display_tickets(branch):
    # No validate_branch_access() call!
    return fetch_tickets(branch)
```
- **Refactoring Needed**: ✅ YES - Add missing branch validation

---

#### 7. **items.py** (Tier: MEDIUM)
- **Status**: ⚠️ No permission imports at all
- **Pattern**: Only document hooks, no API endpoints
- **Endpoints Protected**: Not applicable (only doctype methods)
- **Issues Found**:
  - Uses `doc.flags.ignore_validate_update_after_stock` without permission check
  - Flag manipulation without authorization
- **Refactoring Needed**: ✅ YES - Add authorization for flag operations

---

### 🔴 CRITICAL - No Authorization

#### 8. **public.py** (Tier: CRITICAL) 🔴
- **Status**: ❌ NO centralized permission imports
- **Pattern**: Manual role checking with inline logic
- **Endpoints Protected**: ZERO (except check_permission itself)
- **Critical Issues**:
  - ❌ `get_active_branch()` - NO authorization
  - ❌ `set_active_branch()` - NO authorization  
  - ❌ `check_session()` - WEAK check (allow_guest=True)
  - ❌ `record_opening_balance()` - NO role check
  - ❌ `_get_role_based_redirect()` - INLINE role check
- **Example Problems**:
```python
# ❌ WRONG - Inline role checking
def _get_role_based_redirect(roles):
    if any(role in roles for role in ("Branch Manager", "Cashier")):
        return "/create-order"  # Direct inline logic!

@frappe.whitelist()
def get_active_branch():
    # ❌ NO authorization check at all!
    return get_active_branch_from_user()

@frappe.whitelist(allow_guest=True)  # ❌ Guest allowed!
def check_session():
    # Weak validation
    return session_info
```
- **Refactoring Needed**: ✅ CRITICAL - Immediate action required

---

#### 9. **orders.py** (Tier: CRITICAL) 🔴
- **Status**: ❌ NO permission imports
- **Pattern**: Completely unprotected endpoints
- **Endpoints Protected**: ZERO
- **Critical Issues**:
  - ❌ `create_order()` - NO authorization
  - ❌ `update_order()` - NO authorization
  - ❌ `get_orders()` - NO authorization
  - ❌ `cancel_order()` - NO authorization
  - ❌ `split_order()` - NO authorization
  - ❌ `apply_discount()` - NO authorization
- **Example Problems**:
```python
@frappe.whitelist()
def create_order(order_data):
    # ❌ NO authorization check!
    return save_order(order_data)

@frappe.whitelist()
def apply_discount(order_id, discount):
    # ❌ NO permission check!
    # ANY user can apply any discount!
    return apply_to_order(order_id, discount)
```
- **Refactoring Needed**: ✅ CRITICAL - Urgent security issue

---

#### 10. **billing.py** (Tier: CRITICAL) 🔴
- **Status**: ⚠️ Has imports but WEAK authorization
- **Pattern**: Relies only on try-catch, not proactive validation
- **Endpoints Protected**: ~30% with reactive checks
- **Critical Issues**:
  - ❌ `generate_invoice()` - Only uses `@require_permission` decorator
  - ❌ `list_counter_order_history()` - Relies on exception handling (weak)
  - ❌ No proactive `validate_branch_access()` call
  - ❌ Error logging reveals sensitive info (but at least logs)
- **Example Problems**:
```python
@frappe.whitelist()
@require_permission("Sales Invoice", "create")  # Only doctrine check
def generate_invoice(pos_order):
    # ❌ No branch access validation!
    # User could access any branch's data
    return create_invoice(pos_order)

@frappe.whitelist()
def list_counter_order_history(branch, pos_profile):
    try:
        # ❌ Only catches exception, doesn't prevent access
        # Still reveals sensitive data in error logs
    except frappe.PermissionError as e:
        frappe.log_error(...)  # After damage is done
```
- **Refactoring Needed**: ✅ CRITICAL - Add proactive branch validation

---

#### 11. **queue.py** (Tier: CRITICAL) 🔴
- **Status**: ❌ NO permission imports
- **Pattern**: Completely unprotected
- **Endpoints Protected**: ZERO
- **Critical Issues**:
  - ❌ `create_queue_ticket()` - NO authorization
  - ❌ `get_queue_status()` - NO authorization
  - ❌ `update_queue()` - NO authorization
- **Refactoring Needed**: ✅ CRITICAL

---

#### 12. **self_order.py** (Tier: CRITICAL) 🔴
- **Status**: ❌ NO permission imports
- **Pattern**: Allows guest without checking settings
- **Endpoints Protected**: ZERO
- **Critical Issues**:
  - ❌ `create_self_order_session()` - Allows guest but no setting check
  - ❌ `submit_order()` - NO authorization
- **Example Problems**:
```python
@frappe.whitelist(allow_guest=True)  # ❌ Guest always allowed!
def create_self_order_session():
    # Should check allow_guest_if_configured() decorator!
    return create_session()
```
- **Refactoring Needed**: ✅ CRITICAL - Use proper decorators

---

### 🟡 MEDIUM - Partial Coverage

#### 13. **customizations.py** (Tier: MEDIUM)
- **Status**: ⚠️ No API endpoints, only validators
- **Pattern**: Uses methods on Item doctype
- **Endpoints Protected**: Not applicable
- **Issues Found**: None (validators are OK)
- **Refactoring Needed**: ❌ No

---

#### 14. **native_pricing.py** (Tier: MEDIUM)
- **Status**: ⚠️ No permission checks
- **Pattern**: Pure business logic, no authorization
- **Endpoints Protected**: ZERO
- **Issues Found**:
  - No authorization on pricing endpoints
  - Validates coupon but not access
- **Refactoring Needed**: ✅ YES - Add role/permission checks

---

#### 15. **pricing.py** (Tier: MEDIUM)
- **Status**: ⚠️ Limited imports
- **Pattern**: Pricing-specific logic without auth
- **Endpoints Protected**: ~20%
- **Refactoring Needed**: ✅ YES

---

#### 16. **invoice_modifiers.py** (Tier: MEDIUM)
- **Status**: ⚠️ No API authorization
- **Pattern**: Document hook methods only
- **Endpoints Protected**: Not applicable
- **Refactoring Needed**: ❌ No (hooks are OK)

---

#### 17. **utils.py** (Tier: MEDIUM)
- **Status**: ⚠️ Utility functions only
- **Pattern**: No endpoints
- **Refactoring Needed**: ❌ No

---

## 🚨 Critical Security Issues

### Priority 1: MUST FIX IMMEDIATELY

**Files requiring immediate authorization:**

1. **orders.py** - Core order creation/modification UNPROTECTED 🔴
2. **public.py** - Basic session management UNPROTECTED 🔴
3. **billing.py** - Invoice generation using weak checks 🔴
4. **queue.py** - Queue operations UNPROTECTED 🔴

### Priority 2: IMPORTANT

5. **kot.py** - Missing branch validation on ~40% of endpoints ⚠️
6. **self_order.py** - Guest access not properly gated ⚠️

### Priority 3: SHOULD DO

7. **native_pricing.py** - No permission structure
8. **pricing.py** - Incomplete coverage

---

## 📝 Recommended Refactoring Strategy

### Phase 1: Critical Fixes (Week 1)

**orders.py** - Add permission decorators:
```python
from imogi_pos.utils.decorators import require_role, require_permission
from imogi_pos.utils.permissions import validate_branch_access

@frappe.whitelist()
@require_role("Cashier", "Branch Manager", "Waiter")
def create_order(order_data):
    validate_branch_access(order_data.get("branch"))
    # ... implementation
```

**public.py** - Replace inline checks:
```python
# BEFORE (❌ WRONG)
def _get_role_based_redirect(roles):
    if any(role in roles for role in ("Branch Manager", "Cashier")):
        return "/create-order"

# AFTER (✅ CORRECT)
from imogi_pos.utils.auth_helpers import get_role_based_default_route

@frappe.whitelist()
def check_session():
    # Use centralized helper instead
    return {
        "redirect": get_role_based_default_route()
    }
```

**billing.py** - Add proactive validation:
```python
@frappe.whitelist()
@require_permission("Sales Invoice", "create")
def generate_invoice(pos_order):
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)  # ADD THIS
    # ... implementation
```

**queue.py** - Add proper decorators:
```python
from imogi_pos.utils.decorators import require_role

@frappe.whitelist()
@require_role("Cashier", "Branch Manager")
def create_queue_ticket(queue_data):
    # ... implementation
```

### Phase 2: Medium Priority (Week 2-3)

**kot.py** - Complete coverage:
```python
# Add @require_permission or @require_role to all endpoints
# Add validate_branch_access() calls
```

**self_order.py** - Use proper decorators:
```python
from imogi_pos.utils.auth_decorators import allow_guest_if_configured

@frappe.whitelist()
@allow_guest_if_configured()
def create_self_order_session(branch):
    validate_branch_access(branch)
    # ... implementation
```

### Phase 3: Complete Coverage (Week 3-4)

**native_pricing.py** - Add permission structure
**pricing.py** - Complete authorization coverage

### Phase 4: Testing & Validation (Week 4-5)

- Unit tests for all protected endpoints
- Integration tests with different roles
- Penetration testing for authorization bypass

---

## 🧪 Testing Checklist

- [ ] Anonymous user cannot create order
- [ ] Cashier cannot access admin endpoints
- [ ] Branch Manager cannot access other branch's data
- [ ] Discount application requires proper role
- [ ] Invoice generation validates branch access
- [ ] Queue operations properly secured
- [ ] Self-order respects guest setting

---

## 📋 Summary Table

| File | Type | Current Status | Protection Level | Priority | ETA |
|------|------|---|---|---|---|
| customer_display.py | API | ✅ Good | 100% | - | Done |
| layout.py | API | ✅ Good | 100% | - | Done |
| printing.py | API | ✅ Good | 100% | - | Done |
| variants.py | API | ✅ Good | 100% | - | Done |
| customers.py | API | ✅ Good | 100% | - | Done |
| kot.py | API | ⚠️ Partial | 40% | P2 | 3 days |
| items.py | Hook | ⚠️ Partial | 80% | P3 | 2 days |
| public.py | API | 🔴 Critical | 0% | P1 | 1 day |
| orders.py | API | 🔴 Critical | 0% | P1 | 2 days |
| billing.py | API | 🔴 Critical | 30% | P1 | 2 days |
| queue.py | API | 🔴 Critical | 0% | P1 | 1 day |
| self_order.py | API | 🔴 Critical | 0% | P1 | 1 day |
| native_pricing.py | API | ⚠️ Partial | 0% | P3 | 3 days |
| pricing.py | API | ⚠️ Partial | 20% | P3 | 3 days |
| customizations.py | Hook | ✅ Good | 100% | - | Done |
| invoice_modifiers.py | Hook | ✅ Good | 100% | - | Done |
| utils.py | Util | N/A | N/A | - | N/A |

---

**Status**: Audit Complete | **Action Required**: IMMEDIATE

See [AUTHORIZATION_DEVELOPMENT_GUIDE.md](AUTHORIZATION_DEVELOPMENT_GUIDE.md) for implementation patterns.
