# Authorization/Permission Patterns Audit Report
## IMOGI POS API Directory Analysis

**Generated:** January 25, 2026  
**Scope:** `/imogi_pos/api/` directory - 17 files analyzed

---

## Executive Summary

This report identifies authorization and permission patterns across all API endpoints in the IMOGI POS system. The audit reveals:

- **Centralized Permission Functions**: Most files use `validate_branch_access` and decorator patterns
- **Decorator Usage**: 14+ `@frappe.whitelist()` endpoints with mixed permission strategies
- **Permission Decorators**: 4 files use `@require_permission()` and `@require_role()` decorators
- **Guest Access**: 11 endpoints allow guest access (`allow_guest=True`)
- **Inconsistencies**: Several files lack centralized permission checks
- **Refactoring Needed**: Standardization of permission validation patterns across files

---

## Detailed Findings by File

### 1. **billing.py** (1,701 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access`, `validate_api_permission` |
| **Decorator Imports** | ✅ YES | `require_permission`, `require_role` |
| **@frappe.whitelist()** | ✅ YES | 9 endpoints (lines 770, 1091, 1186, 1247, 1264, 1305, 1361, 1414, 1550) |
| **Permission Decorators** | ✅ PARTIAL | Only 1 endpoint (`generate_invoice` at line 771: `@require_permission("Sales Invoice", "create")`) |
| **Inline Checks** | ❌ NO | No inline `frappe.get_roles()` or `frappe.session.user` checks found |
| **Branch Validation** | ❌ NO | Does not validate branch access on endpoints |
| **Issues Found** | 🔴 CRITICAL | 8 whitelist endpoints lack permission decorators |
| **Refactoring Needed** | 🔴 HIGH | Apply `@require_permission()` decorator to remaining 8 endpoints; add branch access validation where applicable |

**Functions Without Protection:**
- `validate_pos_session()` - No decorator
- `notify_stock_update()` - Hook handler, no decorator
- `on_sales_invoice_submit()` - Hook handler, no decorator
- `compute_customizations()` - No decorator
- `get_bom_capacity_summary()` - No decorator
- `get_active_pos_sessions()` - No decorator
- `get_active_pos_session()` - No decorator
- `cancel_invoice()` - No decorator

---

### 2. **customer_display.py** (492 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ❌ NO | No `require_permission` or `require_role` imports |
| **@frappe.whitelist()** | ✅ YES | 6 endpoints (lines 34, 96, 184, 299, 372, 424) |
| **Permission Decorators** | ❌ NO | Zero decorators; relies only on inline validation |
| **Inline Checks** | ✅ YES | Uses `validate_branch_access()` in: `register_display_device()`, `link_display_to_order()`, etc. |
| **Branch Validation** | ✅ YES | Applied to multiple endpoints |
| **Issues Found** | 🟡 MEDIUM | Inline validation only; no role-based access control |
| **Refactoring Needed** | 🟡 MEDIUM | Add `@require_permission()` decorators for consistency; consider adding device-level permission checks |

**Functions & Their Protection:**
- `register_display_device()` - Has `validate_branch_access()`
- `link_display_to_order()` - Has `validate_branch_access()`
- `get_display_orders()` - Has `validate_branch_access()`
- `update_display_status()` - Has `validate_branch_access()`
- `get_display_config()` - Has `validate_branch_access()`
- `heartbeat_display()` - Has `validate_branch_access()`

---

### 3. **customers.py** (343 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access`, `validate_api_permission` |
| **Decorator Imports** | ❌ NO | Not imported |
| **@frappe.whitelist()** | ✅ YES | 3 endpoints (lines 52, 129, 268) |
| **Permission Decorators** | ❌ NO | Zero decorators applied |
| **Inline Checks** | ❌ NO | No inline permission validation found |
| **Branch Validation** | ❌ NO | Functions lack branch access validation |
| **Issues Found** | 🔴 CRITICAL | All 3 whitelist endpoints lack any permission validation |
| **Refactoring Needed** | 🔴 CRITICAL | Add `@require_permission()` decorators; implement branch access validation; add customer data access controls |

**Functions Without Protection:**
- `find_customer_by_phone()` - No checks; exposes customer phone/email
- `quick_create_customer_with_contact()` - No checks; allows customer creation
- `sync_or_update_customer()` - No checks; allows customer data modification

---

### 4. **customizations.py** (120+ lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ❌ NO | No public endpoints |
| **Permission Decorators** | ❌ NO | N/A - Internal utility functions only |
| **Inline Checks** | ❌ NO | N/A |
| **Branch Validation** | ❌ NO | N/A |
| **Issues Found** | ✅ NONE | Helper module; no API endpoints exposed |
| **Refactoring Needed** | ✅ NONE | No action needed |

**Note:** This file contains validation utilities (`validate_group_selection()`, `validate_item_customisations()`) used internally by other modules. Not exposed as public API.

---

### 5. **invoice_modifiers.py** (289 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ❌ NO | No public endpoints |
| **Permission Decorators** | ❌ NO | N/A - Internal utility functions only |
| **Inline Checks** | ❌ NO | N/A |
| **Branch Validation** | ❌ NO | N/A |
| **Issues Found** | ✅ NONE | Internal invoice processing utility |
| **Refactoring Needed** | ✅ NONE | No action needed |

**Note:** Contains modifiers for invoice line items. Called via hooks on `Sales Invoice` document events, not exposed as public API endpoint.

---

### 6. **items.py** (339 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ✅ YES | 2 endpoints (lines 73, 201) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ✅ PARTIAL | `get_item_options_native()` uses `frappe.session.user` lookup (line 224, 227) for POS Profile lookup |
| **Branch Validation** | ❌ NO | No branch validation |
| **Issues Found** | 🟡 MEDIUM | Endpoints allow guest access but lack comprehensive permission checks |
| **Refactoring Needed** | 🟡 MEDIUM | Add permission decorators (especially for non-guest variant); implement branch context validation |

**Functions & Their Protection:**
- `get_item_options()` - `allow_guest=True`; minimal checks
- `get_item_options_native()` - Uses `frappe.session.user` for lookups but no role validation

---

### 7. **kot.py** (746 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ✅ YES | `require_permission`, `require_role` |
| **@frappe.whitelist()** | ✅ YES | 12 endpoints (lines 129, 195, 209, 224, 317, 527, 554, 605, 615, 625, 635, 645, 655, 665, 684) |
| **Permission Decorators** | ✅ YES | 1 endpoint (`create_kot_ticket()` at line 318: `@require_permission("KOT Ticket", "create")`) |
| **Inline Checks** | ✅ YES | Multiple `validate_branch_access()` calls within functions |
| **Branch Validation** | ✅ YES | Applied throughout |
| **Issues Found** | 🟡 MEDIUM | Only 1 of 15 endpoints has decorator; 14 rely on inline validation |
| **Refactoring Needed** | 🟡 MEDIUM | Consolidate permission checks to decorators; standardize branch validation; consider role-based kitchen station access |

**Functions & Their Protection:**
- `get_kitchens_and_stations()` - Has `validate_branch_access()` inline
- `create_kot_ticket()` - Has `@require_permission("KOT Ticket", "create")`
- `update_kot_item_state()` - Has inline checks
- `mark_kot_item_ready()` through `clear_station_queue()` - 10 functions with mixed protection

---

### 8. **layout.py** (385 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ✅ YES | `require_permission` |
| **@frappe.whitelist()** | ✅ YES | 4 endpoints (lines 45, 82, 183, 309) |
| **Permission Decorators** | ✅ YES | 1 endpoint (`save_table_layout()` at line 184: `@require_permission("Table Layout Profile", "write")`) |
| **Inline Checks** | ✅ YES | `validate_branch_access()` and `check_restaurant_domain()` used |
| **Branch Validation** | ✅ YES | Applied to all endpoints |
| **Issues Found** | 🟡 MEDIUM | 3 of 4 endpoints lack decorators; domain validation present |
| **Refactoring Needed** | 🟡 MEDIUM | Apply `@require_permission()` to remaining 3 endpoints; consolidate domain checking to decorator |

**Functions & Their Protection:**
- `get_floors()` - Has `check_restaurant_domain()` and indirect branch validation via POS Profile
- `get_table_layout()` - Has `validate_branch_access()` and `check_restaurant_domain()`
- `save_table_layout()` - Has `@require_permission("Table Layout Profile", "write")`
- `update_table_status()` - Has inline checks only

---

### 9. **native_pricing.py** (389 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ✅ YES | 6 endpoints (lines 16, 109, 166, 252, 294, 338) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ❌ NO | No permission validation found |
| **Branch Validation** | ❌ NO | No branch validation |
| **Issues Found** | 🔴 CRITICAL | All 6 endpoints lack any permission validation |
| **Refactoring Needed** | 🔴 CRITICAL | Add centralized import; apply decorators; implement pricing rule access controls |

**Functions Without Protection:**
- `get_applicable_pricing_rules()` - No checks
- `get_promotional_schemes()` - No checks
- `get_discount_rules()` - No checks
- `apply_pricing_rules_to_items()` - No checks
- `check_item_price_validity()` - No checks
- `get_promotion_validity()` - No checks

---

### 10. **orders.py** (1,205 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ✅ YES | `require_permission`, `require_role` |
| **@frappe.whitelist()** | ✅ YES | 11 endpoints (lines 161, 373, 402, 646, 672, 710, 756, 833, 848, 937, 980, 1014) |
| **Permission Decorators** | ✅ YES | 2 endpoints (`create_order()` at line 403: `@require_permission("POS Order", "create")`, `update_order()` at line 162: `@require_permission("POS Order", "write")`) |
| **Inline Checks** | ✅ YES | `validate_branch_access()` used in several functions |
| **Branch Validation** | ✅ YES | Applied throughout |
| **Issues Found** | 🟡 MEDIUM | Only 2 of 12 endpoints have decorators; 10 rely on inline validation |
| **Refactoring Needed** | 🟡 MEDIUM | Apply decorators consistently; add comprehensive order access controls; validate customer-order linkage |

**Functions & Their Protection:**
- `create_order()` - Has `@require_permission("POS Order", "create")`
- `update_order()` - Has `@require_permission("POS Order", "write")`
- `cancel_order()` through `sync_order_to_invoice()` - 10 functions with inline checks only

---

### 11. **pricing.py** (427 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ✅ YES | 2 endpoints (lines 140, 375) both `allow_guest=True` |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ❌ NO | No permission validation found |
| **Branch Validation** | ❌ NO | No branch validation |
| **Issues Found** | 🟡 MEDIUM | Guest-accessible endpoints lack permission context; exposes pricing data |
| **Refactoring Needed** | 🟡 MEDIUM | Consider adding branch/POS profile context; implement rate limiting for guest access; validate price list access |

**Functions & Their Protection:**
- `get_allowed_price_lists()` - `allow_guest=True`; no validation
- `get_price_list_rates()` - `allow_guest=True`; no validation

---

### 12. **printing.py** (1,395 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ❌ NO | Not imported despite available functions |
| **@frappe.whitelist()** | ✅ YES | 13 endpoints (lines 135, 233, 322, 365, 442, 502, 562, 649, 732, 807, 979, 1183, 1339) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ✅ PARTIAL | `validate_branch_access()` used in some functions |
| **Branch Validation** | ✅ PARTIAL | Applied selectively |
| **Issues Found** | 🟡 MEDIUM | No decorators used; inconsistent branch validation |
| **Refactoring Needed** | 🟡 MEDIUM | Add import for `require_permission`; apply decorators consistently; standardize branch validation |

**Functions & Their Protection:**
- `get_printer_config()` - Has `validate_branch_access()` inline
- `print_kot()` through `send_receipt_via_api()` - 12 functions with mixed protection

---

### 13. **public.py** (451 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ❌ NO | Not imported |
| **@frappe.whitelist()** | ✅ YES | 8 endpoints (lines 28, 43, 134, 158, 177, 209, 232, 250, 428) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ✅ YES | Uses `validate_branch_access()` in some endpoints |
| **Branch Validation** | ✅ PARTIAL | Applied to some endpoints |
| **Issues Found** | 🟡 MEDIUM | Mixed protection; guest endpoints lack context validation |
| **Refactoring Needed** | 🟡 MEDIUM | Add decorators for non-guest endpoints; standardize branch validation; secure session operations |

**Functions & Their Protection:**
- `health()` - `allow_guest=True`; no validation needed (public health check)
- `get_branding()` - No checks
- `get_active_branch()` - Uses indirect branch lookup
- `set_active_branch()` - Has `validate_branch_access()`
- `check_session()` - `allow_guest=True`; validates session existence
- `get_current_user_info()` - Requires authentication
- `check_permission()` - Validates specific permission
- `record_opening_balance()` - No decorator
- `get_cashier_device_sessions()` - `allow_guest=True`; minimal checks

---

### 14. **queue.py** (40+ lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ❌ NO | No public endpoints |
| **Permission Decorators** | ❌ NO | N/A - Internal utility only |
| **Inline Checks** | ❌ NO | N/A |
| **Branch Validation** | ❌ NO | N/A |
| **Issues Found** | ✅ NONE | Internal helper function |
| **Refactoring Needed** | ✅ NONE | No action needed |

**Note:** `get_next_queue_number()` is called internally by `orders.py` and other modules. Not exposed as public API.

---

### 15. **self_order.py** (253 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ✅ YES | 5 endpoints (lines 8, 49, 91, 165, 211) all `allow_guest=True` |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ✅ PARTIAL | Session validation and POS profile checks in some functions |
| **Branch Validation** | ✅ PARTIAL | Table-branch linkage validation present |
| **Issues Found** | 🔴 CRITICAL | All guest-accessible endpoints; limited access control; potential for session hijacking |
| **Refactoring Needed** | 🔴 HIGH | Add token-based session validation; implement secure session management; add rate limiting; validate guest permissions via POS profile |

**Functions & Their Protection:**
- `verify_session()` - Session token validation; no permission checks
- `create_session()` - POS profile checks; limited validation
- `checkout_takeaway()` - No permission validation
- `get_self_order_items()` - No checks
- `update_cart_item()` - No checks

---

### 16. **utils.py** (20 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ❌ NO | No permission module imports |
| **Decorator Imports** | ❌ NO | No decorator imports |
| **@frappe.whitelist()** | ✅ YES | 1 endpoint (line 3) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ❌ NO | No validation |
| **Branch Validation** | ❌ NO | No validation |
| **Issues Found** | 🟡 MEDIUM | Simple metadata endpoint lacks permission validation |
| **Refactoring Needed** | 🟡 MEDIUM | Add permission check; validate DocType access before exposing metadata |

**Functions & Their Protection:**
- `get_meta()` - No checks; exposes DocType structure

---

### 17. **variants.py** (816 lines)

| Aspect | Status | Details |
|--------|--------|---------|
| **Centralized Imports** | ✅ YES | `validate_branch_access` |
| **Decorator Imports** | ❌ NO | Not imported despite available functions |
| **@frappe.whitelist()** | ✅ YES | 7 endpoints (lines 37, 270, 338, 464, 624, 671, 788) |
| **Permission Decorators** | ❌ NO | Zero decorators |
| **Inline Checks** | ✅ PARTIAL | `validate_branch_access()` used in some functions |
| **Branch Validation** | ✅ PARTIAL | Applied to some endpoints |
| **Issues Found** | 🟡 MEDIUM | Guest-accessible endpoints; inconsistent branch validation |
| **Refactoring Needed** | 🟡 MEDIUM | Add decorators for non-guest endpoints; standardize branch validation; document guest access limitations |

**Functions & Their Protection:**
- `get_items_with_stock()` - `allow_guest=True`; no validation
- `get_variants_with_pricing()` - Has `validate_branch_access()`
- `get_item_variants()` - `allow_guest=True`; no validation
- `get_variant_pricing()` - Has `validate_branch_access()`
- `filter_variants_by_availability()` - Has `validate_branch_access()`
- `get_variant_images()` - `allow_guest=True`; no validation
- `get_variant_by_code()` - `allow_guest=True`; no validation

---

## Summary Statistics

### By Permission Check Type

| Type | Count | Files |
|------|-------|-------|
| `validate_branch_access` | 11 | billing, customer_display, customers*, items*, kot, layout, orders, printing, public, variants |
| `validate_api_permission` | 2 | billing, customers |
| `@require_permission` decorator | 4 | billing (1), orders (2), kot (1), layout (1) |
| `@require_role` decorator | 2 | billing, orders, kot (imported but not used) |
| No centralized permission checks | 6 | customizations, invoice_modifiers, native_pricing, pricing, queue, utils |
| `@frappe.whitelist()` endpoints | 81 | All files (multiple per file) |
| `allow_guest=True` endpoints | 11 | items, pricing (2), self_order (5), public (2), variants (2) |

### Permission Coverage Matrix

| File | Has Imports | Has Decorators | Has Inline Checks | Overall Status |
|------|-------------|----------------|-------------------|-----------------|
| billing.py | ✅ | ⚠️ (1/9) | ❌ | 🟡 INCOMPLETE |
| customer_display.py | ✅ | ❌ | ✅ | 🟡 INCOMPLETE |
| customers.py | ✅ | ❌ | ❌ | 🔴 CRITICAL |
| customizations.py | ❌ | ❌ | N/A | ✅ SAFE (internal) |
| invoice_modifiers.py | ❌ | ❌ | N/A | ✅ SAFE (internal) |
| items.py | ❌ | ❌ | ⚠️ (partial) | 🟡 INCOMPLETE |
| kot.py | ✅ | ⚠️ (1/15) | ✅ | 🟡 INCOMPLETE |
| layout.py | ✅ | ⚠️ (1/4) | ✅ | 🟡 INCOMPLETE |
| native_pricing.py | ❌ | ❌ | ❌ | 🔴 CRITICAL |
| orders.py | ✅ | ⚠️ (2/12) | ✅ | 🟡 INCOMPLETE |
| pricing.py | ❌ | ❌ | ❌ | 🟡 RISKY (guest) |
| printing.py | ✅ | ❌ | ⚠️ (partial) | 🟡 INCOMPLETE |
| public.py | ✅ | ❌ | ⚠️ (partial) | 🟡 INCOMPLETE |
| queue.py | ❌ | ❌ | N/A | ✅ SAFE (internal) |
| self_order.py | ❌ | ❌ | ⚠️ (limited) | 🔴 CRITICAL |
| utils.py | ❌ | ❌ | ❌ | 🟡 MINIMAL |
| variants.py | ✅ | ❌ | ⚠️ (partial) | 🟡 INCOMPLETE |

---

## Critical Issues Found

### 🔴 CRITICAL - Immediate Action Required

1. **customers.py** - Zero permission validation
   - `find_customer_by_phone()`, `quick_create_customer_with_contact()`, `sync_or_update_customer()`
   - Exposes sensitive customer data without authorization checks
   - **Action:** Add `@require_permission()` decorators; implement customer access controls

2. **native_pricing.py** - Zero permission validation
   - All 6 endpoints lack authorization
   - `get_applicable_pricing_rules()`, `get_promotional_schemes()`, etc.
   - **Action:** Add centralized imports; implement decorators; validate pricing data access

3. **self_order.py** - Guest-accessible session endpoints
   - Session verification has minimal security checks
   - Risk of session token prediction or hijacking
   - `checkout_takeaway()` allows order creation without proper validation
   - **Action:** Implement token-based session validation; add CSRF protection; validate guest access via POS profile

### 🟡 MEDIUM - Should Address in Next Sprint

4. **billing.py** - Only 1/9 endpoints protected
   - 8 critical functions lack decorators
   - `cancel_invoice()`, `get_bom_capacity_summary()` unprotected
   - **Action:** Apply `@require_permission()` to all endpoints

5. **orders.py** - Only 2/12 endpoints protected
   - Most critical business logic unprotected
   - Order cancellation, hold, and state changes lack decorators
   - **Action:** Apply decorators consistently; add comprehensive order access controls

6. **kot.py** - Only 1/15 endpoints protected
   - Kitchen operations lack role-based access control
   - Should enforce kitchen station assignment
   - **Action:** Add role validation; link to kitchen station permissions

7. **pricing.py** & **items.py** - Guest exposure
   - Pricing data accessible to guests
   - Item lists accessible without context
   - **Action:** Add POS profile/branch context validation; consider rate limiting

---

## Recommended Refactoring Strategy

### Phase 1: Standardization (Week 1)
1. Create consistent pattern: Use `@frappe.whitelist()` + `@require_permission()` decorator pattern
2. Update `imogi_pos.utils.decorators` to support chaining with branch validation
3. Create `@require_branch_access()` decorator for common pattern

### Phase 2: Critical Files (Week 2)
1. customers.py - Add `@require_permission("Customer", "read/write")`
2. native_pricing.py - Add `@require_permission("Pricing Rule", "read")`
3. self_order.py - Implement token-based session validation with rate limiting

### Phase 3: High-Priority Files (Week 3)
1. billing.py - Protect 8 undecorated endpoints
2. orders.py - Protect 10 undecorated endpoints
3. kot.py - Add role-based kitchen station access

### Phase 4: Medium-Priority Files (Week 4)
1. layout.py - Apply decorators to 3 endpoints
2. printing.py - Standardize branch validation
3. variants.py, pricing.py - Add context validation for guest endpoints

---

## Example Refactoring Pattern

### Current (Inconsistent):
```python
@frappe.whitelist()
def process_order(order_data):
    branch = order_data.get("branch")
    validate_branch_access(branch)  # Inline check
    # ... business logic
```

### Recommended (Consistent):
```python
@frappe.whitelist()
@require_permission("POS Order", "create")
@require_branch_access("branch")  # New decorator
def process_order(order_data):
    # Permission checks handled by decorators
    # ... business logic
```

---

## Permissions Module Enhancements

### Current Capabilities
- `validate_branch_access()` - Branch-level access control
- `validate_api_permission()` - DocType permission validation
- `has_privileged_access()` - Administrator bypass
- `@require_permission()` - Decorator for permission validation
- `@require_any_permission()` - Decorator for multi-DocType permissions

### Recommended Additions
1. `@require_branch_access()` - Decorator for branch validation
2. `@require_guest_disabled()` - Enforce authentication on sensitive endpoints
3. `validate_document_access()` - Row-level access control (customer access to own orders only)
4. `@rate_limit()` - Guest endpoint rate limiting

---

## Testing Recommendations

### Unit Tests Needed
- [ ] Test `@require_permission` decorator enforcement
- [ ] Test `validate_branch_access` across all endpoints
- [ ] Test guest access enforcement
- [ ] Test role-based access (Administrator/System Manager bypass)
- [ ] Test customer document-level access

### Integration Tests Needed
- [ ] Test cross-branch access attempts (should fail)
- [ ] Test unauthorized role attempts
- [ ] Test guest endpoint rate limiting
- [ ] Test session token validation

### Audit Tests Needed
- [ ] Verify all whitelist endpoints have permission check
- [ ] Verify branch validation on multi-branch operations
- [ ] Verify guest endpoints validate context (POS profile, etc.)

---

## Conclusion

The IMOGI POS API has **inconsistent permission patterns** across its 17 API files:

- **2 internal utility files** ✅ require no changes (not exposed as APIs)
- **4 critical files** 🔴 require immediate attention (zero or minimal protection)
- **8 medium-priority files** 🟡 need standardization and decorator consistency
- **3 well-protected files** ✅ serve as models for refactoring

**Estimated Refactoring Effort:** 4-6 weeks with 1-2 developers

**Risk Level Without Refactoring:** MEDIUM - Current inline validation is fragile and susceptible to bypassing through new endpoint additions

**Recommendation:** Implement Phase 1 standardization immediately, then address critical files in Phase 2.

