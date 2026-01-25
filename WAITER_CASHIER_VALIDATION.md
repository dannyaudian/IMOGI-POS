# Waiter/Kiosk/Self-Order Active Cashier Validation

## Overview
This document describes the implementation of active cashier validation for modules that create orders but don't handle payment (Waiter, Kiosk, Self-Order).

## Business Logic

### Payment Flow
1. **Waiter/Kiosk/Self-Order**: Create orders and send to kitchen
2. **Kitchen**: Receives orders from all sources
3. **Cashier**: Handles ALL payment processing

### Validation Requirement
Since Waiter, Kiosk, and Self-Order modules create orders but cannot process payment, they must validate that at least one active Cashier session exists before allowing module access.

## Implementation

### 1. Module Configuration (Backend)

**File**: `imogi_pos/api/module_select.py`

Updated module configs with `requires_active_cashier: True`:

```python
'waiter': {
    'requires_opening': False,        # Waiter doesn't need own POS Opening
    'requires_active_cashier': True,  # BUT needs cashier available for payment
    'requires_session': False
},
'kiosk': {
    'requires_opening': False,
    'requires_active_cashier': True,
    'requires_session': False
},
'self-order': {
    'requires_opening': False,
    'requires_active_cashier': True,
    'requires_session': False
}
```

### 2. Active Cashier Check API

**File**: `imogi_pos/api/module_select.py`

**Endpoint**: `check_active_cashiers(branch=None)`

**Logic**:
1. Query POS Opening Entry with:
   - `status = 'Open'`
   - `docstatus = 1` (submitted)
   - `period_start_date >= today`
   - `company = branch`

2. Filter by POS Profile with `imogi_enable_cashier = 1`

3. Return:
```python
{
    'has_active_cashier': bool,
    'active_sessions': [
        {
            'pos_opening_entry': str,
            'pos_profile': str,
            'user': str,
            'opening_balance': float,
            'timestamp': datetime
        }
    ],
    'total_cashiers': int,
    'message': str,
    'branch': str
}
```

### 3. Frontend Validation

**File**: `src/apps/module-select/App.jsx`

**Function**: `handleModuleClick(module)`

**Flow**:
1. Check if `module.requires_active_cashier === true`
2. Call `check_active_cashiers` API
3. If `has_active_cashier === false`:
   - Show dialog: "No active cashier sessions found. Please ask a cashier to open a POS session first."
   - Block navigation to module
4. If `has_active_cashier === true`:
   - Allow navigation to module

## User Experience

### Scenario 1: Active Cashier Exists
1. User clicks "Waiter Station"
2. System checks for active cashier → FOUND
3. User navigates to Waiter module
4. User creates order → sent to Kitchen
5. Customer pays at Cashier counter

### Scenario 2: No Active Cashier
1. User clicks "Waiter Station"
2. System checks for active cashier → NOT FOUND
3. Dialog appears:
   ```
   Title: No Active Cashier
   Message: No active cashier sessions found. 
            Please ask a cashier to open a POS session first.
   ```
4. Navigation blocked until cashier opens session

## Module Requirements Matrix

| Module | requires_opening | requires_session | requires_active_cashier |
|--------|-----------------|------------------|------------------------|
| Cashier | ✅ True | ✅ True | ❌ False |
| Waiter | ❌ False | ❌ False | ✅ True |
| Kiosk | ❌ False | ❌ False | ✅ True |
| Self-Order | ❌ False | ❌ False | ✅ True |
| Kitchen | ❌ False | ❌ False | ❌ False |
| Table Display | ❌ False | ❌ False | ❌ False |
| Customer Display | ❌ False | ❌ False | ❌ False |

## Benefits

1. **Data Integrity**: Ensures all orders have payment path
2. **Operational Safety**: Prevents creating orders without payment capability
3. **User Guidance**: Clear messaging when cashier needed
4. **Centralized Payment**: All payment through Cashier for audit trail
5. **Multi-Device Support**: Multiple waiters/kiosks share cashier resources

## Testing Checklist

- [ ] Test Waiter access with no cashier → blocked
- [ ] Test Waiter access with active cashier → allowed
- [ ] Test Kiosk access with no cashier → blocked
- [ ] Test Kiosk access with active cashier → allowed
- [ ] Test Self-Order access with no cashier → blocked
- [ ] Test Self-Order access with active cashier → allowed
- [ ] Test Cashier opening → enables Waiter/Kiosk/Self-Order
- [ ] Test Cashier closing → blocks Waiter/Kiosk/Self-Order
- [ ] Test multiple branches (isolation)
- [ ] Test error handling (API failure)

## Related Files

**Backend:**
- `imogi_pos/api/module_select.py` - Module config & validation API
- `imogi_pos/fixtures/custom_field.json` - POS Profile module flags

**Frontend:**
- `src/apps/module-select/App.jsx` - Module selection logic
- `src/apps/module-select/components/ModuleCard.jsx` - Visual indicators

**Documentation:**
- `POS_PROFILE_MULTI_MODULE.md` - Multi-module architecture
- `MODULE_SELECT_VISUAL_GUIDE.md` - UI/UX documentation
