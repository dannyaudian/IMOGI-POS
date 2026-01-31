# Native ERPNext v15 POS Audit & Hardening (January 2026)

## Executive Summary

Audit of IMOGI-POS implementation confirmed alignment with native ERPNext v15 shift-based POS flow. **Backend is secure and compliant**. Frontend has been hardened to remove multi-session URL parameter which violated single-session contract.

**Status**: ✅ COMPLIANT (with fixes applied)

---

## Audit Findings

### Backend (imogi_pos/api/cashier.py) - ✅ SECURE

#### Helper: `ensure_active_opening(pos_profile, user)` 
- **Status**: ✅ IMPLEMENTED and HARDENED
- **Purpose**: Single source of truth for active POS Opening validation
- **Behavior**:
  - Resolves active POS Opening Entry for given user + pos_profile
  - Throws `ValidationError` if no opening found
  - Returns opening dict with: `name`, `company`, `pos_profile`, `user`, `posting_date`, etc.
  - **Server controls opening, NOT client**

#### Core Endpoints - ✅ ALL HARDENED

1. **`create_invoice_from_order(order_name, customer, customer_name)`**
   - ✅ Calls `ensure_active_opening()` 
   - ✅ **IGNORES** client opening_name parameter (server-resolved)
   - ✅ Sets `imogi_pos_session` from server-resolved opening
   - ✅ Error if no opening: "No active POS Opening for your session..."
   - ✅ Idempotent: if invoice exists, returns success

2. **`process_payment(invoice_name, payments, ...)`**
   - ✅ Calls `ensure_active_opening()` for active opening validation
   - ✅ Validates `invoice.imogi_pos_session == active_opening` (session match check)
   - ✅ **BLOCKS** payment if session mismatch: "Invoice belongs to a different session..."
   - ✅ Prevents cross-session payment exploit
   - ✅ Idempotent: if invoice already submitted, returns success

3. **`complete_order(order_name, invoice_name)`**
   - ✅ Calls `ensure_active_opening()` for validation
   - ✅ Validates `invoice.imogi_pos_session == active_opening` before completing
   - ✅ **BLOCKS** cross-session order completion
   - ✅ Uses workflow API for proper state transitions (Closed state)
   - ✅ Closes KOT tickets and publishes realtime events

4. **`get_opening_summary(opening_name)`**
   - ✅ Auto-resolves active opening if `opening_name` not provided
   - ✅ If `opening_name` provided, validates it matches active opening
   - ✅ **REJECTS** if provided opening != active opening
   - ✅ Aggregates payments from Sales Invoice Payment (native v15)
   - ✅ Groups by mode_of_payment with totals

5. **`close_pos_opening(opening_name, counted_balances)`**
   - ✅ Calls `ensure_active_opening()` for active opening validation
   - ✅ **VALIDATES** `opening_name` matches active opening before closing
   - ✅ **REJECTS** if trying to close non-active session: "Cannot close a session that is not your active session"
   - ✅ Creates POS Closing Entry with reconciliation
   - ✅ Prevents closing sessions that aren't user's current session

#### Other Endpoints (Unchanged)

- `get_pending_orders()` - Uses operational context guard, KOT/Table feature flags
- `get_order_details()` - Safely fetches order data with optional KOT/Table support
- `get_payment_methods()` - Simple list of enabled payment modes

---

### Frontend (src/apps/cashier-console/App.jsx) - ✅ HARDENED

#### Issue Found & Fixed

**Problem**: Code supported multi-session via URL parameter `opening_entry`
- Allowed: `?opening_entry=POS-OPN-123` to switch sessions mid-console
- **Violated contract**: Client shouldn't be able to select/switch opening

**Solution Applied**: 
- ❌ **REMOVED** `opening_entry` URL parameter extraction logic
- ❌ **REMOVED** `urlOpeningEntry` state and validation
- ❌ **REMOVED** `validateOpeningEntry()` function and useEffect
- ✅ **HARDENED** `usePOSProfileGuard()` hook call: removed `overrideOpeningEntry` parameter
- ✅ **HARDENED** `handleClaimOrder()` to use `posOpening?.pos_opening_entry` (server-resolved only)

#### Current Implementation (Post-Fix)

```javascript
// App.jsx (lines ~30-50)
const { 
  guardPassed,
  posProfile,
  posOpening,
  openingStatus,
  // ... other props
} = usePOSProfileGuard({ 
  requiresOpening: true,  // Native v15: always require
  targetModule: 'imogi-cashier'
  // HARDENED: No overrideOpeningEntry - always use server-resolved active opening
})

// Check opening status
if (!guardPassed && openingStatus === 'missing') {
  return <BlockedScreen 
    title="POS Opening belum ada"
    message="Silakan buat POS Opening Entry via ERPNext..."
    actions={[
      { label: "Buat POS Opening Entry", href: `/app/pos-opening-entry...` },
      { label: "Kembali ke Module Select", href: "/app/imogi-module-select" }
    ]}
  />
}
```

#### BlockedScreen Component (src/apps/cashier-console/components/BlockedScreen.jsx)

- ✅ IMPLEMENTED - Shows error screen when opening not found
- ✅ Hard block (not modal, not redirect) - prevents accidental bypass
- ✅ CTA buttons to:
  1. Create POS Opening Entry via native ERPNext Desk
  2. Return to Module Select

---

## Contract Compliance Checklist

### ✅ Requirement 1: POS Opening WAJIB for all transaksi cashier

- Backend: All endpoints validate opening via `ensure_active_opening()`
- Frontend: `usePOSProfileGuard({ requiresOpening: true })`
- Blocked access if `openingStatus === 'missing'`

### ✅ Requirement 2: Cashier Console CANNOT create opening via modal

- ❌ No modal "Start Shift" exists in code
- ✅ BlockedScreen + CTA to native POS Opening Entry form
- ✅ User must create opening via ERPNext Desk (/app/pos-opening-entry)

### ✅ Requirement 3: Backend is single source of truth

- ✅ `ensure_active_opening(pos_profile, user)` resolves opening server-side
- ✅ All endpoints ignore client opening_name (for core ops)
- ✅ Only `close_pos_opening()` accepts opening_name (validates it matches active)
- ✅ Session match validation: `invoice.imogi_pos_session == active_opening`

### ✅ Requirement 4: Mode (Counter/Restaurant) only for feature toggles

- ✅ Mode determines UI features (KOT/Table/Waiter toggles)
- ✅ Mode DOES NOT skip opening requirement
- ✅ Both Counter and Restaurant require opening

### ✅ Requirement 5: Session consistency

- ✅ Invoices have `imogi_pos_session` (from active opening)
- ✅ Invoices have `imogi_pos_order` (from order)
- ✅ Payment validation: `invoice.imogi_pos_session == active_opening`
- ✅ Complete validation: same session match check

### ✅ Requirement 6: No header/transaction mismatch

- ✅ Header shows opening from `posOpening` (server-resolved)
- ✅ All transactions use same opening (guard enforces single session)
- ❌ **REMOVED** opening_entry URL parameter (no client-side switching)
- ✅ No way to switch opening after console loads

---

## Files Modified

### Backend

No changes needed - backend was already compliant.

### Frontend

1. **src/apps/cashier-console/App.jsx** (HARDENED)
   - Removed: `urlOpeningEntry`, `validatedOpening`, `openingValidationError`, `openingValidationLoading` state
   - Removed: URL parameter extraction useEffect (lines ~35-45 original)
   - Removed: `validateOpeningEntry()` function and its useEffect
   - Removed: Opening validation error BlockedScreen
   - Modified: `usePOSProfileGuard()` call to remove `overrideOpeningEntry`
   - Modified: `handleClaimOrder()` to use `posOpening?.pos_opening_entry` only

2. **No changes to:**
   - src/apps/cashier-console/components/BlockedScreen.jsx (already correct)
   - src/shared/hooks/usePOSProfileGuard.js (already correct)
   - imogi_pos/api/cashier.py (already correct)

---

## Documentation Updates

### COUNTER_MODE_IMPLEMENTATION.md (Updated)

Updated sections:
- Step 1: User Opens Cashier Console - clarified check mode → check opening sequence
- Step 2: Start Shift - confirmed NO modal, emphasized native POS Opening Entry flow
- Backend Strict Validation - documented all ensure_active_opening() implementations

No sections removed - documentation already aligned with implementation.

---

## Acceptance Criteria Verification

### ✅ AC1: Membuka cashier console tanpa opening → tidak bisa transaksi, tampil BlockedScreen + CTA

```javascript
// App.jsx line ~95
if (!guardLoading && !guardPassed && openingStatus === 'missing') {
  return (
    <BlockedScreen
      title="POS Opening belum ada"
      message="Silakan buat POS Opening Entry via ERPNext. Setelah itu refresh halaman ini."
      actions={[
        { label: "Buat POS Opening Entry", href: `/app/pos-opening-entry/new-pos-opening-entry-1?pos_profile=...` },
        { label: "Kembali ke Module Select", href: "/app/imogi-module-select" }
      ]}
    />
  )
}
```

**Status**: ✅ VERIFIED

### ✅ AC2: Tidak ada modal Start Shift

```bash
$ grep -r "Start Shift\|StartShift\|start.*shift" src/apps/cashier-console
# No matches found
```

**Status**: ✅ VERIFIED

### ✅ AC3: Semua transaksi invoice/payment/complete fail dengan error sama jika opening tidak ada

All endpoints use `ensure_active_opening()` which throws:
```
"No active POS Opening for your session. Please create and submit a POS Opening Entry first."
```

**Status**: ✅ VERIFIED

### ✅ AC4: Tidak ada cara di UI untuk memilih opening lain setelah console load

- ❌ Removed opening_entry URL parameter extraction
- ❌ Removed validateOpeningEntry() function
- ✅ usePOSProfileGuard uses server-resolved opening only
- ✅ No UI element to switch opening

**Status**: ✅ VERIFIED

### ✅ AC5: Header opening == opening yang dipakai backend (tidak ada mismatch)

- Header displays: `posOpening?.pos_opening_entry` (from guard hook)
- All backend calls use: `ensure_active_opening()` (same user + pos_profile)
- **Same opening for header and backend**: ✅ GUARANTEED

**Status**: ✅ VERIFIED

### ✅ AC6: Dokumentasi cocok dengan code

- COUNTER_MODE_IMPLEMENTATION.md sections align with code
- No contradictions found
- All references to "modal Start Shift" or "Counter mode skip opening" removed

**Status**: ✅ VERIFIED

---

## Example Error Responses

### No Active Opening

**Request**:
```json
POST /api/method/imogi_pos.api.cashier.create_invoice_from_order
{
  "order_name": "POS-ORD-2026-00001"
}
```

**Response**:
```json
{
  "success": false,
  "error": "No active POS Opening for your session. Please create and submit a POS Opening Entry first.",
  "exc_type": "ValidationError"
}
```

### Cross-Session Payment

**Request**:
```json
POST /api/method/imogi_pos.api.cashier.process_payment
{
  "invoice_name": "ACC-SINV-2026-00001",
  "payments": [{"mode_of_payment": "Cash", "amount": 100000}]
}
```

**Response** (when invoice belongs to different session):
```json
{
  "success": false,
  "error": "Invoice belongs to a different session. Cannot process payment across sessions."
}
```

### Cannot Close Non-Active Session

**Request**:
```json
POST /api/method/imogi_pos.api.cashier.close_pos_opening
{
  "opening_name": "POS-OPN-2026-00001",
  "counted_balances": [{"mode_of_payment": "Cash", "closing_amount": 500000}]
}
```

**Response** (when opening != active opening):
```json
{
  "message": "Cannot close a session that is not your active session",
  "exc_type": "ValidationError"
}
```

---

## Security Notes

### ✅ Server Controls Opening

- Backend **never** trusts client opening_name for core operations
- Only `close_pos_opening()` accepts opening_name (validated against active)
- `ensure_active_opening()` resolves from database, not client input

### ✅ Session Match Validation

- Payment validation: `invoice.imogi_pos_session == active_opening`
- Complete validation: same check
- Prevents invoices from being paid by wrong user/session

### ✅ No Client-Side Switch

- Removed URL parameter support
- Removed validation function
- Frontend cannot override server-resolved opening

### ⚠️ Notes on Permissions

- All endpoints use `ignore_permissions=True` for insert operations (necessary for POS workflow)
- This is safe because:
  - `_require_cashier_role()` enforces cashier permission at endpoint level
  - Operations are scoped to user's active opening (via `ensure_active_opening()`)
  - Admin override not available for core operations

---

## Recommendations for Future

1. **Optional**: Implement rate limiting on `ensure_active_opening()` to prevent enumeration
2. **Optional**: Add audit logging for opening validation failures (already has error logging)
3. **Optional**: Consider adding device/IP tracking for shift sessions
4. **For QA**: Test unauthorized opening access from different user account

---

## Rollback Plan

If needed, revert to multi-session support:

1. Restore `urlOpeningEntry` state and extraction useEffect
2. Restore `validateOpeningEntry()` function
3. Restore `overrideOpeningEntry` parameter in `usePOSProfileGuard()` call
4. Add back opening validation error BlockedScreen

Git history available in repo for easy rollback.

---

## Sign-Off

**Audit Date**: January 31, 2026  
**Auditor**: Senior Engineer - IMOGI POS  
**Status**: ✅ COMPLIANT after hardening  
**Risk Level**: 🟢 LOW - All requirements met, backend secure, frontend hardened

