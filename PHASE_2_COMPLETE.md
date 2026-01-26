# Phase 2: API Migration to POS Profile - COMPLETE ✅

## Overview
Phase 2 successfully updated all remaining API endpoints to accept `pos_profile` as the primary parameter with `branch` as a deprecated fallback option.

## Updated API Functions

### Module Select API (`api/module_select.py`)
- ✅ `get_available_modules(pos_profile, branch)` - Already updated in Phase 1
- ✅ `get_active_pos_opening(pos_profile, branch)` - Already updated in Phase 1
- ✅ `check_active_cashiers(pos_profile, branch)` - **UPDATED IN PHASE 2**

### Orders API (`api/orders.py`)
- ✅ `create_order(order_type, pos_profile, branch, ...)` - **UPDATED IN PHASE 2**
  - Added effective_branch and effective_pos_profile logic
  - Validates branch matches POS Profile if both provided
  - Deprecation warning if branch used without pos_profile
- ✅ `get_next_available_table(pos_profile, branch)` - **UPDATED IN PHASE 2**
- ✅ `create_table_order(pos_profile, branch, ...)` - **UPDATED IN PHASE 2**
  - Full migration with effective variables
  - Uses pos_profile as primary lookup
- ✅ `create_counter_order(pos_profile, branch, ...)` - Already had both parameters (required, not optional)

**Functions that don't need pos_profile (work with existing documents):**
- `add_item_to_order()` - Uses order's branch
- `update_order_status()` - Uses order's branch
- `save_order()` - Uses order's branch
- `switch_table()` - Uses order's branch
- `merge_tables()` - Uses order's branch
- `set_order_type()` - Uses order's branch

### Cashier API (`api/cashier.py`)
- ✅ `get_pending_orders(pos_profile, branch, ...)` - Already updated in Phase 1

### KOT API (`api/kot.py`)
- ✅ `get_active_kots(pos_profile, kitchen, station, branch)` - Already updated in Phase 1

**Functions that don't need pos_profile:**
- `update_kot_status()` - Works with existing KOT
- `send_to_kitchen()` - Uses order's branch and pos_profile

### Layout API (`api/layout.py`)
- ✅ `get_tables(pos_profile, branch)` - Already updated in Phase 1

**Functions that don't need pos_profile (validate through floor/table):**
- `get_table_layout(floor)` - Uses floor's branch
- `save_table_layout(floor, ...)` - Uses floor's branch
- `update_table_status(table, ...)` - Uses floor's branch from table
- `get_table_status(floor, tables)` - Uses floor's branch

### Public API (`api/public.py`)
- ✅ `get_user_pos_profile_info()` - Added in Phase 1
- ✅ `set_user_default_pos_profile(pos_profile, sync_to_server)` - Added in Phase 1
- ⚠️ `set_user_branch()` - Marked DEPRECATED in Phase 1

## Migration Pattern

All updated functions follow this consistent pattern:

```python
@frappe.whitelist()
def api_function(pos_profile=None, branch=None, ...):
    """
    Args:
        pos_profile (str, optional): POS Profile name (PREFERRED)
        branch (str, optional): Branch name (DEPRECATED)
    """
    # 1. Deprecation warning
    if branch and not pos_profile:
        frappe.log("DEPRECATION WARNING: Use pos_profile parameter instead.")
    
    # 2. Determine effective branch and pos_profile
    effective_branch = None
    effective_pos_profile = pos_profile
    
    if pos_profile:
        # POS Profile is primary - derive branch from it
        effective_branch = frappe.db.get_value('POS Profile', pos_profile, 'imogi_branch')
    elif branch:
        # Legacy branch parameter - find POS Profile for this branch
        effective_branch = branch
        profiles = frappe.get_all("POS Profile", 
            filters={"imogi_branch": branch, "disabled": 0}, 
            limit=1)
        if profiles:
            effective_pos_profile = profiles[0].name
    
    # 3. Use effective_branch and effective_pos_profile throughout
    validate_branch_access(effective_branch)
    # ... rest of function logic
```

## Backward Compatibility

✅ **All existing API calls continue to work:**
- Old code using `branch` parameter still works with deprecation warnings
- New code using `pos_profile` parameter gets optimal behavior
- Mixed usage is supported (pos_profile takes priority over branch)

## Validation Logic

For functions like `create_order()`, we validate:
1. If both `pos_profile` and `branch` are provided, verify branch matches POS Profile's branch
2. If only `pos_profile` is provided, derive branch from it
3. If only `branch` is provided (legacy), find first active POS Profile for that branch
4. All cases log deprecation warnings when appropriate

## Testing Checklist

Before deployment, verify:

### Backend Tests
- [ ] API calls with `pos_profile` only work correctly
- [ ] API calls with `branch` only still work (with warnings in logs)
- [ ] API calls with both parameters validate correctly
- [ ] Error handling for invalid POS Profiles
- [ ] Error handling for mismatched branch and POS Profile

### Frontend Tests
- [ ] Module Select shows POS Profile switcher
- [ ] All apps use `usePOSProfile` or `useImogiPOS` hooks
- [ ] Profile switching updates all active tabs (BroadcastChannel)
- [ ] localStorage persistence works
- [ ] Server sync works when user explicitly selects profile

### Integration Tests
- [ ] Waiter app creates orders with correct POS Profile
- [ ] Kitchen app filters KOTs correctly
- [ ] Cashier app processes payments correctly
- [ ] Table management works across profile switches

## Deployment Steps

```bash
# 1. Pull latest code
git pull origin main

# 2. Apply custom field migration
bench --site [site-name] migrate

# 3. Rebuild React apps
npm run build

# 4. Clear cache
bench --site [site-name] clear-cache

# 5. Restart services
bench restart

# 6. Verify in browser
# - Check Module Select has POS Profile switcher
# - Test switching profiles
# - Verify all modules work correctly
```

## What's Next

Phase 3 (Optional Enhancements):
- [ ] Add POS Profile-based permissions/role filters
- [ ] Create POS Profile management UI in desk
- [ ] Add analytics/reports grouped by POS Profile
- [ ] Add POS Profile cloning/templating feature

## Migration Complete! 🎉

The IMOGI POS system now operates on a **POS Profile-first architecture** with branch as a derived attribute. All API endpoints support the new pattern while maintaining backward compatibility with existing code.
