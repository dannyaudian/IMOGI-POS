# Quick Reference - POS Profile Field Visibility Rules

## Field Visibility Logic (Single Source of Truth)

### Restaurant Domain Only Fields

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_enable_waiter` | `domain == "Restaurant"` | `domain != "Restaurant"` | `_clear_domain_dependent_fields()` |
| `imogi_enable_kot` | `domain == "Restaurant"` | `domain != "Restaurant"` | `_clear_domain_dependent_fields()` |
| `imogi_enable_self_order` | `domain == "Restaurant"` | `domain != "Restaurant"` | `_clear_domain_dependent_fields()` |
| `imogi_printer_kitchen_interface` | `domain == "Restaurant" && enable_kot` | `domain != "Restaurant" OR !enable_kot` | `_clear_printer_interface_fields()` |
| `imogi_kot_format` | `domain == "Restaurant" && enable_kot` | `domain != "Restaurant"` | `_clear_mode_dependent_fields()` |
| `imogi_kot_copies` | `domain == "Restaurant" && enable_kot` | `domain != "Restaurant"` | `_clear_mode_dependent_fields()` |

### Mode-Specific Fields

| Field | Mode | Clear When | Server Method |
|-------|------|-----------|---|
| `imogi_use_table_display` | Table | `mode != "Table"` | `_clear_mode_dependent_fields()` |
| `imogi_default_floor` | Table | `mode != "Table"` | `_clear_mode_dependent_fields()` |
| `imogi_default_layout_profile` | Table | `mode != "Table"` | `_clear_mode_dependent_fields()` |
| `imogi_hide_notes_on_table_bill` | Table | `mode != "Table"` | `_clear_mode_dependent_fields()` |
| `imogi_order_customer_flow` | Counter | `mode != "Counter"` | `_clear_mode_dependent_fields()` |
| `imogi_kiosk_receipt_format` | Kiosk | `mode != "Kiosk"` | `_clear_mode_dependent_fields()` |
| `imogi_print_notes_on_kiosk_receipt` | Kiosk | `mode != "Kiosk"` | `_clear_mode_dependent_fields()` |

### Bill Format Fields (Restaurant + Table OR Counter)

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_customer_bill_format` | `domain == "Restaurant" && (mode == "Table" OR mode == "Counter")` | `domain != "Restaurant" OR mode NOT IN (Table, Counter)` | `_clear_mode_dependent_fields()` |
| `imogi_customer_bill_copies` | `domain == "Restaurant" && (mode == "Table" OR mode == "Counter")` | `domain != "Restaurant" OR mode NOT IN (Table, Counter)` | `_clear_mode_dependent_fields()` |

### Nested Dependency Fields

| Field | Show When | Clear When | Server Methods |
|-------|-----------|-----------|---|
| `imogi_kiosk_cashless_only` | `mode == "Kiosk" && enable_payment_gateway` | `mode != "Kiosk" OR !enable_payment_gateway` | `_clear_mode_dependent_fields()` + `_clear_payment_gateway_fields()` |

### Queue Format Field (Kiosk OR Counter)

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_queue_format` | `mode IN ("Kiosk", "Counter")` | `mode NOT IN ("Kiosk", "Counter")` | `_clear_mode_dependent_fields()` |

### Self-Order Fields (Restaurant Only)

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_enable_self_order` | `domain == "Restaurant"` | `domain != "Restaurant"` | `_clear_domain_dependent_fields()` |
| `imogi_self_order_qr_sheet_format` | `enable_self_order` | `!enable_self_order` | `_clear_self_order_fields()` |
| `imogi_self_order_section` | `domain == "Restaurant" && enable_self_order` | Domain/enable change | Form JS |
| `imogi_self_order_settings_section` | `domain == "Restaurant" && enable_self_order` | Domain/enable change | Form JS |

### Session Fields (Cashier + Require Session)

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_pos_session_scope` | `enable_cashier && require_pos_session` | `!require_pos_session` | `_clear_session_fields()` |
| `imogi_enforce_session_on_cashier` | `enable_cashier && require_pos_session` | `!require_pos_session` | `_clear_session_fields()` |
| `imogi_enforce_session_on_kiosk` | `enable_cashier && require_pos_session` | `!require_pos_session` | `_clear_session_fields()` |
| `imogi_enforce_session_on_counter` | `enable_cashier && require_pos_session` | `!require_pos_session` | `_clear_session_fields()` |

### Payment Gateway Fields

| Field | Show When | Clear When | Server Method |
|-------|-----------|-----------|---|
| `imogi_payment_gateway_account` | `enable_payment_gateway` | `!enable_payment_gateway` | `_clear_payment_gateway_fields()` |
| `imogi_checkout_payment_mode` | `enable_payment_gateway` | `!enable_payment_gateway` | `_clear_payment_gateway_fields()` |
| `imogi_show_payment_qr_on_customer_display` | `enable_payment_gateway` | `!enable_payment_gateway` | `_clear_payment_gateway_fields()` |
| `imogi_payment_timeout_seconds` | `enable_payment_gateway` | `!enable_payment_gateway` | `_clear_payment_gateway_fields()` |

### Domain-Dependent Sections

| Section | Show When | Clear When |
|---------|-----------|-----------|
| `imogi_branding_section` | `domain !== undefined` | `!domain` |
| `imogi_printer_configuration_section` | `domain !== undefined` | `!domain` |

---

## Event Handlers (Frappe Form Events)

```javascript
// Initializes field visibility on form load
onload(frm) → updateAllFieldVisibility()

// Re-initializes on form refresh
refresh(frm) → updateAllFieldVisibility()

// Domain changes → all visibility updates
imogi_pos_domain(frm) → updateAllFieldVisibility()

// Mode changes → all visibility updates  
imogi_mode(frm) → updateAllFieldVisibility()

// KOT toggle → section + full visibility update
imogi_enable_kot(frm) → updateAllFieldVisibility()

// Self-order toggle → section + full visibility update
imogi_enable_self_order(frm) → updateAllFieldVisibility()

// Cashier toggle → session section
imogi_enable_cashier(frm) → updateSectionVisibility('imogi_pos_session_section')

// Waiter toggle → (currently passive, no dependent fields)
imogi_enable_waiter(frm) → (no-op)

// Session requirement → session enforcement fields
imogi_require_pos_session(frm) → updateFieldVisibility(session_fields)

// Payment gateway toggle → payment fields + kiosk_cashless_only
imogi_enable_payment_gateway(frm) → updateFieldVisibility(payment_fields + kiosk_cashless_only)
```

---

## Testing Quick Checklist

### Mode Round-Trip Test
```
Start: Restaurant + Table mode
1. Switch to Counter → verify table fields hidden
2. Switch to Kiosk → verify counter fields hidden  
3. Switch back to Table → verify kiosk fields hidden
Expected: Each mode shows only its specific fields
```

### Domain Round-Trip Test
```
Start: Restaurant domain
1. Set all Restaurant features (KOT, Waiter, Self-Order, etc.)
2. Switch to Retail → verify all Restaurant fields cleared
3. Switch back to Restaurant → verify can re-enable features
Expected: Clean state, no orphaned data
```

### Nested Dependency Test
```
Start: Kiosk mode + Payment Gateway enabled
1. Toggle Payment Gateway OFF → kiosk_cashless_only hidden
2. Toggle Payment Gateway ON → kiosk_cashless_only visible
3. Switch to Counter mode → kiosk_cashless_only hidden (regardless of payment_gateway)
Expected: Both conditions must be true for visibility
```

### Bill Format Test
```
Start: Restaurant domain
1. Table mode: bill_format visible ✓
2. Counter mode: bill_format visible ✓
3. Kiosk mode: bill_format hidden ✓
4. Switch Counter→Kiosk: bill_format cleared in DB ✓
Expected: Bill format only in Table/Counter
```

---

## Deployment Summary

**Files Changed**: 4
- `imogi_pos/overrides/pos_profile.py` (30 lines)
- `imogi_pos/fixtures/custom_field.json` (1 field)
- `imogi_pos/public/js/pos_profile_form.js` (50+ lines)
- `tests/test_pos_profile_cascading.py` (5 new tests)

**Test Coverage**: 5 new tests
- Mode round-trips
- Bill format clearing
- KOT format clearing
- Waiter clearing
- Nested dependencies

**Downtime Required**: < 1 minute
- `bench migrate` (~30s)
- `bench build` (~30s)
- Total: ~1 minute

**Rollback**: Simple git revert + migrate

---

## Troubleshooting

### Fields not hiding/showing?
1. Check browser console for JS errors
2. Run `bench clear-cache && bench build`
3. Refresh form (F5 or Ctrl+Shift+R)
4. Check custom_field.json `depends_on` is valid

### Data not cleared on mode change?
1. Save and reload form
2. Check server logs for validation errors
3. Verify `_clear_mode_dependent_fields()` is called
4. Run test: `pytest tests/test_pos_profile_cascading.py -v`

### Section not hiding?
1. Verify section fieldname matches in JS
2. Sections use `setFieldHidden()` which uses `frm.set_df_property()`
3. Check if section is inside collapsed panel (might hide contents but not section header)

### Payment gateway toggle not working?
1. Verify `imogi_enable_payment_gateway` event handler exists
2. Check that `imogi_kiosk_cashless_only` is updated in handler
3. Run test: `pytest tests/test_pos_profile_cascading.py::TestPOSProfileCascadingValidation::test_nested_kiosk_cashless_only_dependency -v`
