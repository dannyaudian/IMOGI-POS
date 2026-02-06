# POS Profile UX Improvements - Summary

## Overview

This document summarizes comprehensive improvements to the POS Profile form UX, focusing on conditional field visibility based on domain (Restaurant/Retail/Service) and operation mode (Table/Counter/Kiosk/Self-Order).

## Changes Made

### 1. Server-Side Field Clearing (imogi_pos/overrides/pos_profile.py)

Enhanced the `CustomPOSProfile` class to properly clear mode-specific fields when the operation mode changes:

#### `_clear_mode_dependent_fields()` Method
- **Table-specific fields**: Clear when mode ≠ "Table"
  - `imogi_use_table_display`
  - `imogi_default_floor`
  - `imogi_default_layout_profile`
  - `imogi_hide_notes_on_table_bill`

- **Counter-specific fields**: Clear when mode ≠ "Counter"
  - `imogi_order_customer_flow`

- **Kiosk-specific fields**: Clear when mode ≠ "Kiosk"
  - `imogi_kiosk_receipt_format`
  - `imogi_print_notes_on_kiosk_receipt`
  - `imogi_kiosk_cashless_only`

- **Multi-mode fields**: Clear when mode ∉ {"Kiosk", "Counter"}
  - `imogi_queue_format`

#### `_clear_domain_dependent_fields()` Method
Reorganized to clearly separate domain and mode clearing:
- Restaurant domain required for: KOT, self-order, table configuration, customer billing
- Fields cleared when domain ≠ "Restaurant"

### 2. Custom Field Dependencies (imogi_pos/fixtures/custom_field.json)

Updated `depends_on` conditions for 10+ fields to properly gate features based on domain AND mode:

| Field | Condition | Reason |
|-------|-----------|--------|
| `imogi_use_table_display` | `Restaurant && Table` | Table management only |
| `imogi_default_floor` | `Restaurant && Table` | Table service only |
| `imogi_default_layout_profile` | `Restaurant && Table` | Table layout only |
| `imogi_hide_notes_on_table_bill` | `Restaurant && Table` | Dine-in table feature |
| `imogi_customer_bill_format` | `Restaurant && (Table OR Counter)` | Physical bill printing |
| `imogi_customer_bill_copies` | `Restaurant && (Table OR Counter)` | Physical bill printing |
| `imogi_kiosk_cashless_only` | `Kiosk && payment_gateway` | Kiosk payment control |
| `imogi_order_customer_flow` | `Counter` | Counter mode only |
| `imogi_kiosk_receipt_format` | `Kiosk` | Kiosk mode only |
| `imogi_print_notes_on_kiosk_receipt` | `Kiosk` | Kiosk mode only |

Additional fields made conditional:
- `imogi_branding_section`: Shows when domain is defined
- `brand_profile`: Shows when domain is defined
- `imogi_printer_configuration_section`: Shows when domain is defined

### 3. Client-Side Form Customization (imogi_pos/public/js/pos_profile_form.js)

Created comprehensive form script with real-time field visibility updates:

#### Event Handlers
- `imogi_pos_domain(frm)`: Updates all domain-dependent visibility
- `imogi_mode(frm)`: Updates all mode-dependent visibility (NEW)
- `imogi_enable_kot(frm)`: Shows/hides kitchen routing section
- `imogi_enable_self_order(frm)`: Shows/hides self-order sections
- `imogi_enable_cashier(frm)`: Shows/hides POS session section
- `imogi_require_pos_session(frm)`: Shows/hides session enforcement fields
- `imogi_enable_payment_gateway(frm)`: Shows/hides payment fields

#### Core Functions

**`updateAllFieldVisibility(frm)`**
- Comprehensive visibility logic covering all combinations:
  - Table mode fields (4 fields)
  - Counter mode fields (1 field)
  - Kiosk mode fields (3 fields)
  - Queue format fields (1 field)
  - Restaurant domain features (3 fields)
  - KOT fields (3 fields when KOT enabled)
  - Self-order fields (3 fields when enabled)
  - Session fields (4 fields when required)

**`updateSectionVisibility(frm, sectionName)`**
- Manages visibility of entire sections (Kitchen Routing, Self-Order, POS Session)
- Reduces clutter when features are disabled

**`updateFieldVisibility(frm, fieldName)`**
- Updates visibility for specific fields
- Handles edge cases and nested dependencies
- Supports payment gateway field toggling

**`setFieldHidden(frm, fieldName, hidden)`**
- Unified helper function to hide/show fields
- Uses both `field.df.hidden` and jQuery `show()/hide()`
- Ensures consistent behavior across Frappe versions

### 4. Enhanced Test Coverage (tests/test_pos_profile_cascading.py)

Added comprehensive tests for mode-dependent field clearing:

#### `test_clear_mode_dependent_fields()`
Enhanced to test all mode transitions:
- Verifies Counter-only fields are cleared when switching to Table mode
- Verifies Kiosk-only fields are cleared when switching to Table mode
- Verifies queue format is cleared when switching to Table mode
- Tests all field types: Links, Select, Check

#### `test_clear_table_fields_when_mode_changes()` (NEW)
Tests the reverse scenario:
- Starts with Table mode with all table fields populated
- Changes mode to Counter
- Verifies all table-specific fields are properly cleared
- Prevents data leakage between modes

## Benefits

### For Users
1. **Cleaner Form UX**: Only relevant fields are visible based on selected mode
2. **Reduced Configuration Errors**: Can't accidentally set incompatible options
3. **Faster Setup**: Less scrolling, more focused field groups
4. **Mode Switching Safety**: Irrelevant data automatically cleared

### For Developers
1. **Maintainable Code**: Single source of truth for field visibility logic
2. **Type Safety**: Test coverage ensures field clearing works correctly
3. **Extensible Pattern**: Easy to add new modes or fields following established pattern
4. **Debugging**: Clear audit trail of what fields should be visible when

## Field Visibility Matrix

### Table Mode (Restaurant Domain)
```
✓ Use Table Display
✓ Default Floor
✓ Default Layout Profile
✓ Hide Notes on Table Bill
✓ Customer Bill Format
✓ Customer Bill Copies
✗ Order Customer Flow (Counter only)
✗ Kiosk Receipt Format (Kiosk only)
✗ Queue Format (Kiosk/Counter only)
```

### Counter Mode (Restaurant Domain)
```
✗ Use Table Display (Table only)
✗ Default Floor (Table only)
✗ Default Layout Profile (Table only)
✗ Hide Notes on Table Bill (Table only)
✓ Customer Bill Format
✓ Customer Bill Copies
✓ Order Customer Flow
✗ Kiosk Receipt Format (Kiosk only)
✓ Queue Format
```

### Kiosk Mode
```
✗ Use Table Display (Restaurant & Table only)
✗ Default Floor (Restaurant & Table only)
✗ Default Layout Profile (Restaurant & Table only)
✗ Order Customer Flow (Counter only)
✓ Kiosk Receipt Format
✓ Print Notes on Kiosk Receipt
✓ Kiosk Cashless Only (if payment gateway enabled)
✓ Queue Format
```

## Testing

To verify the improvements work correctly:

1. **Test Mode Switching**:
   - Switch between Table/Counter/Kiosk modes
   - Observe fields appear/disappear in real-time
   - No page reload required

2. **Test Field Clearing**:
   ```bash
   python -m pytest tests/test_pos_profile_cascading.py::TestPOSProfileCascadingValidation::test_clear_mode_dependent_fields -xvs
   python -m pytest tests/test_pos_profile_cascading.py::TestPOSProfileCascadingValidation::test_clear_table_fields_when_mode_changes -xvs
   ```

3. **Test Form Behavior**:
   - Create new POS Profile
   - Select domain = "Restaurant"
   - Select mode = "Table"
   - Verify: floor, layout, table display fields visible
   - Select mode = "Counter"
   - Verify: floor, layout, table display fields hidden, customer flow visible
   - Change to mode = "Kiosk"
   - Verify: only kiosk-specific fields visible

## Git Commits

- **a2946f2**: Refactor: Improve POS Profile field clearing for mode-specific fields
  - Enhanced _clear_domain_dependent_fields()
  - Enhanced _clear_mode_dependent_fields() with table field clearing
  - Added imogi_kiosk_cashless_only clearing

- **6c36cf3**: Test: Add comprehensive tests for mode-dependent field clearing
  - Enhanced test_clear_mode_dependent_fields()
  - Added test_clear_table_fields_when_mode_changes()

## Future Improvements

1. **Additional Mode Fields**: If new modes are added, use same pattern
2. **Nested Dependency UI**: Consider visual indicators for "disabled because..." reasons
3. **Configuration Presets**: Save/load mode configurations as templates
4. **Audit Logging**: Track when fields are cleared due to mode changes
5. **Mobile Optimization**: Ensure responsive design for mobile POS usage

## Related Files

- `imogi_pos/overrides/pos_profile.py`: Server-side validation and field clearing
- `imogi_pos/fixtures/custom_field.json`: Field metadata with depends_on conditions
- `imogi_pos/public/js/pos_profile_form.js`: Client-side form customization
- `tests/test_pos_profile_cascading.py`: Automated test coverage
- `README.md`: Overall IMOGI POS architecture and features
