# POS Profile UX Implementation - Consistency Audit

## Audit Matrix: Field -> Visibility Rule -> Server Clearing -> depends_on -> JS Toggle

| Field | Visibility Rule | Server Clearing (`pos_profile.py`) | depends_on (`custom_field.json`) | JS setFieldHidden (`pos_profile_form.js`) | Status |
|-------|-----------------|-----------------------------------|-------------------------------------|-----------------------------------------------|--------|
| **TABLE MODE FIELDS** |
| `imogi_use_table_display` | `Restaurant && Table` | `mode != "Table"` ✓ | `Restaurant && Table` ✓ | `!(domain === 'Restaurant' && mode === 'Table')` ✓ | ✅ MATCH |
| `imogi_default_floor` | `Restaurant && Table` | `mode != "Table"` ✓ | `Restaurant && Table` ✓ | `!(domain === 'Restaurant' && mode === 'Table')` ✓ | ✅ MATCH |
| `imogi_default_layout_profile` | `Restaurant && Table` | `mode != "Table"` ✓ | `Restaurant && Table` ✓ | `!(domain === 'Restaurant' && mode === 'Table')` ✓ | ✅ MATCH |
| `imogi_hide_notes_on_table_bill` | `Restaurant && Table` | `mode != "Table"` ✓ | `Restaurant && Table` ✓ | `!(domain === 'Restaurant' && mode === 'Table')` ✓ | ✅ MATCH |
| **COUNTER MODE FIELDS** |
| `imogi_order_customer_flow` | `Counter only` | `mode != "Counter"` ✓ | `mode == "Counter"` ✓ | `mode !== 'Counter'` ✓ | ✅ MATCH |
| **KIOSK MODE FIELDS** |
| `imogi_kiosk_receipt_format` | `Kiosk only` | `mode != "Kiosk"` ✓ | `mode == "Kiosk"` ✓ | `mode !== 'Kiosk'` ✓ | ✅ MATCH |
| `imogi_print_notes_on_kiosk_receipt` | `Kiosk only` | `mode != "Kiosk"` ✓ | `mode == "Kiosk"` ✓ | `mode !== 'Kiosk'` ✓ | ✅ MATCH |
| `imogi_kiosk_cashless_only` | `Kiosk && payment_gateway` | `mode != "Kiosk"` + `!payment_gateway` ⚠️ | `Kiosk && payment_gateway` ✓ | `!(mode === 'Kiosk' && frm.doc.imogi_enable_payment_gateway)` ✓ | ⚠️ PARTIAL |
| **QUEUE FORMAT FIELD** |
| `imogi_queue_format` | `Kiosk OR Counter` | `mode not in ("Kiosk", "Counter")` ✓ | `Kiosk OR Counter` ✓ | `!(mode === 'Kiosk' OR mode === 'Counter')` ✓ | ✅ MATCH |
| **BILL FIELDS** |
| `imogi_customer_bill_format` | `Restaurant && (Table OR Counter)` | Cleared via domain only ⚠️ | `Restaurant && (Table OR Counter)` ✓ | `!(domain === 'Restaurant' && (mode === 'Table' OR mode === 'Counter'))` ✓ | ⚠️ PARTIAL |
| `imogi_customer_bill_copies` | `Restaurant && (Table OR Counter)` | Cleared via domain only ⚠️ | `Restaurant && (Table OR Counter)` ✓ | `!(domain === 'Restaurant' && (mode === 'Table' OR mode === 'Counter'))` ✓ | ⚠️ PARTIAL |
| **RESTAURANT ONLY FIELDS** |
| `imogi_enable_kot` | `Restaurant only` | `domain != "Restaurant"` ✓ | `domain == "Restaurant"` ✓ | `domain !== 'Restaurant'` ✓ | ✅ MATCH |
| `imogi_enable_waiter` | `Restaurant only` | Not cleared 🔴 | No depends_on ✓ | `domain !== 'Restaurant'` ✓ | ❌ MISMATCH |
| `imogi_enable_self_order` | `Restaurant only` | `domain != "Restaurant"` ✓ | `domain == "Restaurant"` ✓ | `domain !== 'Restaurant'` ✓ | ✅ MATCH |
| **PRINTING SECTION** |
| `imogi_printer_kitchen_interface` | `Restaurant && KOT` | Cleared in `_clear_printer_interface_fields()` ✓ | `Restaurant && KOT` ✓ | `!showKot` (where showKot = `domain === 'Restaurant' && kotEnabled`) ✓ | ✅ MATCH |
| `imogi_kot_format` | `Restaurant && KOT` | Not explicitly cleared 🔴 | `Restaurant && KOT` ✓ | `!showKot` ✓ | ⚠️ PARTIAL |
| `imogi_kot_copies` | `Restaurant && KOT` | Not explicitly cleared 🔴 | `Restaurant && KOT` ✓ | `!showKot` ✓ | ⚠️ PARTIAL |
| **BRANDING & SECTIONS** |
| `imogi_branding_section` | `domain !== undefined` | Not cleared 🔴 | `domain !== undefined` ✓ | Not handled in setFieldHidden 🔴 | ❌ MISMATCH |
| `brand_profile` | `domain !== undefined` | Not cleared 🔴 | `domain !== undefined` ✓ | Not handled 🔴 | ❌ MISMATCH |
| `imogi_printer_configuration_section` | `domain !== undefined` | Not cleared 🔴 | `domain !== undefined` ✓ | Not handled 🔴 | ❌ MISMATCH |
| **SELF-ORDER FIELDS** |
| `imogi_self_order_qr_sheet_format` | `enable_self_order only` | Cleared in `_clear_self_order_fields()` ✓ | `enable_self_order` ✓ | `!selfOrderEnabled` ✓ | ✅ MATCH |
| `imogi_self_order_section` | `Restaurant && enable_self_order` | Not explicitly cleared 🔴 | No depends_on ✓ | `!(domain === 'Restaurant' && selfOrderEnabled)` ✓ | ⚠️ PARTIAL |
| `imogi_self_order_settings_section` | `Restaurant && enable_self_order` | Not explicitly cleared 🔴 | No depends_on ✓ | `!(domain === 'Restaurant' && selfOrderEnabled)` ✓ | ⚠️ PARTIAL |
| **SESSION FIELDS** |
| `imogi_pos_session_scope` | `require_pos_session` | Cleared in `_clear_session_fields()` ✓ | `require_pos_session` ✓ | `!showSession` ✓ | ✅ MATCH |
| `imogi_enforce_session_on_cashier` | `require_pos_session` | Cleared in `_clear_session_fields()` ✓ | `require_pos_session` ✓ | `!showSession` ✓ | ✅ MATCH |
| `imogi_enforce_session_on_kiosk` | `require_pos_session` | Cleared in `_clear_session_fields()` ✓ | `require_pos_session` ✓ | `!showSession` ✓ | ✅ MATCH |
| `imogi_enforce_session_on_counter` | `require_pos_session` | Cleared in `_clear_session_fields()` ✓ | `require_pos_session` ✓ | `!showSession` ✓ | ✅ MATCH |

## Issues Found

### 🔴 CRITICAL ISSUES

**1. `imogi_enable_waiter` - Not cleared when domain changes**
- Server clearing: ❌ NOT cleared in `_clear_domain_dependent_fields()`
- Custom field: ❌ NO depends_on condition
- JS logic: ✓ `domain !== 'Restaurant'`
- **FIX**: Add to `_clear_domain_dependent_fields()` and custom_field.json

### ⚠️ MEDIUM ISSUES

**2. Bill format fields - Only cleared on domain change, not mode change**
- Fields: `imogi_customer_bill_format`, `imogi_customer_bill_copies`
- Issue: Cleared only when `domain != "Restaurant"` but NOT when mode changes to/from Table/Counter
- Server: Missing mode-based clearing (currently only domain-based)
- depends_on: ✓ `Restaurant && (Table OR Counter)` (correct)
- JS: ✓ Handles correctly
- **FIX**: Add mode-based clearing logic in `_clear_mode_dependent_fields()`

**3. KOT format fields - Not explicitly cleared**
- Fields: `imogi_kot_format`, `imogi_kot_copies`
- Issue: Not listed in any `_clear_*` method
- depends_on: ✓ `Restaurant && KOT`
- JS: ✓ `!showKot`
- **FIX**: Add to `_clear_mode_dependent_fields()` or `_clear_domain_dependent_fields()`

**4. `imogi_kiosk_cashless_only` - Dual clearing (mode AND payment_gateway)**
- Server: ✓ Cleared when `mode != "Kiosk"` in `_clear_mode_dependent_fields()`
- Server: ✓ Cleared when `!enable_payment_gateway` in `_clear_payment_gateway_fields()`
- depends_on: ✓ `Kiosk && payment_gateway`
- JS: ✓ `!(mode === 'Kiosk' && frm.doc.imogi_enable_payment_gateway)`
- **STATUS**: ✅ Actually correct (dual dependency = safer)

**5. `imogi_customer_bill_format` & `imogi_customer_bill_copies` - Mode-based clearing missing**
- Server: Only cleared when `domain != "Restaurant"` ❌
- depends_on: ✓ `Restaurant && (Table || Counter)` 
- JS: ✓ Correct
- **FIX**: Add clearing when mode changes away from Table/Counter

**6. Section visibility - Not handled in server clearing**
- Sections: `imogi_branding_section`, `imogi_printer_configuration_section`
- Issue: Section breaks don't get "cleared" (not real fields)
- Server: Not handled (OK, sections don't store data)
- JS: ✓ Would need `updateSectionVisibility()` calls
- **STATUS**: ⚠️ Minor (sections don't store data, but JS not handling them)

### ✅ WORKING CORRECTLY

- Table mode fields (4 fields): All three layers match
- Counter mode field: All three layers match
- Kiosk mode fields: All three layers match (including dual depends_on for cashless_only)
- Queue format: All three layers match
- Session fields (4 fields): All three layers match
- Self-order QR format: All three layers match
- Enable KOT: All three layers match
- Enable self-order: All three layers match
- Kitchen printer interface: All three layers match

## Recommendations

### Priority 1 (MUST FIX)
1. Add `imogi_enable_waiter` clearing to `_clear_domain_dependent_fields()` when domain != "Restaurant"
2. Add `imogi_enable_waiter` depends_on in custom_field.json: `eval:doc.imogi_pos_domain=="Restaurant"`
3. Add mode-based clearing for `imogi_customer_bill_format` and `imogi_customer_bill_copies` in `_clear_mode_dependent_fields()`

### Priority 2 (SHOULD FIX)
4. Add `imogi_kot_format` and `imogi_kot_copies` to explicit clearing (currently only depends_on, no server clearing)
5. Update form script to handle section visibility more robustly

### Priority 3 (NICE TO HAVE)
6. Add missing event handler: `imogi_enable_payment_gateway()` to update `imogi_kiosk_cashless_only` visibility
7. Add missing event handler: `imogi_enable_kot()` to update bill format visibility (since KOT affects printing)

## Testing Strategy

1. **Mode round-trip test**: Table → Counter → Kiosk → Table
   - Verify table fields cleared when leaving Table mode
   - Verify counter fields cleared when leaving Counter mode
   - Verify kiosk fields cleared when leaving Kiosk mode

2. **Domain round-trip test**: Restaurant → Retail → Restaurant
   - Verify all Restaurant-only fields cleared when domain changes
   - Verify fields re-appear when switching back

3. **Nested dependency test**: Toggle payment_gateway while in Kiosk mode
   - Verify `imogi_kiosk_cashless_only` hides when payment_gateway disabled
   - Verify shows when payment_gateway re-enabled

4. **Bill format test**: Switch mode while in Restaurant domain
   - Table mode: Bill format visible
   - Counter mode: Bill format visible
   - Kiosk mode: Bill format hidden
   - Verify DB cleared after switch
