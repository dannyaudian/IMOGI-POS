# Multi-Session Opening Entry Consistency Audit

**Date**: January 31, 2026  
**Scope**: IMOGI-POS Cashier Console opening_entry flow validation and consistency  
**Status**: 🔴 INCONSISTENCIES FOUND - Requires fixes

---

## Executive Summary

The multi-session opening_entry support exists but has **3 critical inconsistencies**:

1. **Multiple sources of truth** for opening: URL param, posOpening state, header, claim_order param
2. **No guard preventing opening switch** during session: UI can use different opening than initial load
3. **Session validation missing** in some endpoints: Create invoice uses active opening, but payment doesn't validate match
4. **Header displays opening** but some endpoints bypass validation - potential mismatch

---

## Part 1: Findings

### Finding 1️⃣: Multiple Sources of Effective Opening

| Source | File | Usage | Issue |
|--------|------|-------|-------|
| URL param | App.jsx | Initial validation | ❌ No validation during session; can become stale |
| posOpening state | App.jsx (line 38) | Prop drilling to all components | ❌ Updated from cache, not re-validated per operation |
| Header display | CashierHeader.jsx:16 | Shows opening name | ❌ May not match opening used by endpoints |
| claim_order param | App.jsx:294 | Passed to claim_order() | ⚠️ Assumes it's current opening, no validation |
| get_active_opening() | PaymentView.jsx:77 | Called at payment time | ✅ Fresh validation, but inconsistent with header |

**Problem**: If user URL opens with `opening_entry=POS-OPN-001`, but admin closes that opening mid-session, subsequent API calls may fail or use wrong opening, while header still shows POS-OPN-001.

---

### Finding 2️⃣: No Re-Validation Guard During Session

**Current Flow**:
```
Load App.jsx
  ├─ Get posOpening (once, cached in state)
  ├─ Pass to Header (displays opening name)
  ├─ Pass to PaymentView, CloseShiftView (displays but doesn't validate)
  └─ When click "Payment" button
    └─ PaymentView calls get_active_opening() (FRESH validation ✅)
    └─ But Header still shows original posOpening.pos_opening_entry
    └─ If they differ → MISMATCH
```

**Problem**: Header shows "POS-OPN-001" but payment endpoint uses "POS-OPN-002" if active opening changed.

---

### Finding 3️⃣: Incomplete Session Match Validation

**Endpoints checked**:

1. **create_invoice_from_order()**
   - ✅ Uses `ensure_active_opening()` - validates active opening exists
   - ✅ Sets `invoice.imogi_pos_session = active_opening.name`
   - ⚠️ Does NOT check if provided order belongs to a specific opening
   - ✅ Result: Safe, forces current user's active opening

2. **process_payment(invoice_name, ...)**
   - ✅ Uses `ensure_active_opening()` - validates active opening exists
   - ✅ Validates `invoice.imogi_pos_session == active_opening` (line ~860)
   - ✅ Result: Safe, session match enforced

3. **complete_order(order_name, invoice_name)**
   - ✅ Uses `ensure_active_opening()` - validates active opening exists
   - ✅ Validates `invoice.imogi_pos_session == active_opening` (line ~1135)
   - ✅ Result: Safe, session match enforced

4. **claim_order(order_name, opening_entry)**
   - ❌ Does NOT validate `opening_entry == user's active opening`
   - ❌ Accepts any valid opening_entry from client
   - ⚠️ Problem: Client can claim order in different opening than their current session
   - ✅ Called from App.jsx line 294: `opening_entry: posOpening?.pos_opening_entry`
   - ⚠️ But `posOpening` is cached from initial load - may be stale

**Risk**: If user's active opening is updated between page load and claim_order call, claim will use outdated opening.

---

### Finding 4️⃣: Header Prop Inconsistency

**Places posOpening is displayed/used**:

| Component | Usage | Issue |
|-----------|-------|-------|
| CashierHeader:16 | `posOpening?.pos_opening_entry` | Shows opening name ✅ |
| ActionButtons:28 | `posOpening?.pos_opening_entry` | Shows in info popup ✅ |
| ShiftSummaryView:107 | `summary?.opening \|\| posOpening?.name` | Falls back to cache ⚠️ |
| CloseShiftView:81 | `summary?.opening \|\| posOpening?.name` | Falls back to cache ⚠️ |
| App.jsx:281 | Used in claim_order | Passed to backend ⚠️ |

**Problem**: ShiftSummaryView and CloseShiftView fall back to `posOpening?.name` which is from initial load, not current active opening. If shift was switched, they show wrong opening.

---

### Finding 5️⃣: No Lock Against Opening Switch

**Current Behavior**:
- User loads Cashier Console with `?opening_entry=POS-OPN-001`
- `usePOSProfileGuard` validates and caches in state
- **User can reload page with different opening_entry param** → loads new opening without re-validation of old one
- ❌ No warning: "You had unsaved orders in POS-OPN-001, please close before switching"

**Expected**: After cache hit, opening should be locked until page reload.

---

## Part 2: Design: Single Source of Truth Hook

### Proposed Hook: `useEffectiveOpening()`

```javascript
/**
 * Single source of truth for opening validation in multi-session mode.
 * 
 * Returns consistent {opening, effectiveOpeningName, status} for entire session.
 * Validates opening_entry from URL against user's active opening.
 * 
 * Returns:
 *   - opening: The validated effective opening object
 *   - effectiveOpeningName: Opening name to use for all operations
 *   - status: 'loading' | 'valid' | 'error' | 'mismatch'
 *   - error: Error message if status === 'error' or 'mismatch'
 *   - isUrlOpening: Boolean - true if loaded from opening_entry URL param
 *   - validate(): Function to re-validate opening (checks it still exists/open)
 */
export function useEffectiveOpening({
  requiresOpening = true,
  allowUrlParam = true,
  autoRefreshMs = null  // Optional: auto-refresh every N ms
}) {
  const [effectiveOpening, setEffectiveOpening] = useState(null)
  const [validationStatus, setValidationStatus] = useState('loading')
  const [validationError, setValidationError] = useState(null)
  const [isUrlOpening, setIsUrlOpening] = useState(false)
  const [lastValidatedAt, setLastValidatedAt] = useState(null)
  
  // Step 1: Extract opening_entry from URL (if allowed)
  useEffect(() => {
    if (!allowUrlParam) return
    
    const params = new URLSearchParams(window.location.search)
    const urlOpening = params.get('opening_entry')
    
    if (urlOpening) {
      setIsUrlOpening(true)
      // Will validate in Step 2
    }
  }, [allowUrlParam])
  
  // Step 2: Validate opening_entry from URL
  useEffect(() => {
    if (!isUrlOpening) return // Skip if no URL opening
    
    const validateUrlOpening = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const urlOpening = params.get('opening_entry')
        
        // Get current pos_profile from operational context or guard
        const posProfile = window.__IMOGI_CASHIER_CONTEXT?.pos_profile
        if (!posProfile) {
          setValidationStatus('error')
          setValidationError('POS Profile not set')
          return
        }
        
        // Call backend validation
        const response = await apiCall(
          'imogi_pos.api.module_select.validate_opening_session',
          { opening_entry: urlOpening, pos_profile: posProfile }
        )
        
        if (!response?.valid) {
          setValidationStatus('error')
          setValidationError(response?.error || 'Invalid opening entry')
          return
        }
        
        setEffectiveOpening(response.opening)
        setValidationStatus('valid')
        setValidationError(null)
        setLastValidatedAt(new Date())
      } catch (error) {
        setValidationStatus('error')
        setValidationError(error.message || 'Validation failed')
      }
    }
    
    validateUrlOpening()
  }, [isUrlOpening])
  
  // Step 3: If no URL opening, use active opening
  useEffect(() => {
    if (isUrlOpening || validationStatus !== 'loading') return
    
    const loadActiveOpening = async () => {
      try {
        const response = await apiCall('imogi_pos.api.cashier.get_active_opening')
        
        if (!response?.has_opening) {
          setValidationStatus('error')
          setValidationError('No active POS Opening')
          return
        }
        
        setEffectiveOpening(response.opening || { name: response.opening_entry })
        setValidationStatus('valid')
        setValidationError(null)
        setLastValidatedAt(new Date())
      } catch (error) {
        setValidationStatus('error')
        setValidationError(error.message || 'Failed to load active opening')
      }
    }
    
    loadActiveOpening()
  }, [isUrlOpening, validationStatus])
  
  // Auto-refresh opening validation (optional)
  useEffect(() => {
    if (!autoRefreshMs || validationStatus !== 'valid') return
    
    const interval = setInterval(() => {
      // Re-validate opening is still active
      validateCurrentOpening()
    }, autoRefreshMs)
    
    return () => clearInterval(interval)
  }, [autoRefreshMs, validationStatus])
  
  // Manual validation function
  const validateCurrentOpening = useCallback(async () => {
    if (!effectiveOpening?.name) return
    
    try {
      setValidationStatus('loading')
      const response = await apiCall(
        'imogi_pos.api.cashier.get_active_opening'
      )
      
      if (!response?.has_opening) {
        setValidationStatus('mismatch')
        setValidationError(`Opening ${effectiveOpening.name} is no longer active`)
        return
      }
      
      if (response.opening_entry !== effectiveOpening.name && !isUrlOpening) {
        // Active opening changed, but no URL param - auto-update
        setEffectiveOpening(response.opening || { name: response.opening_entry })
      } else if (isUrlOpening && response.opening_entry !== effectiveOpening.name) {
        // URL opening differs from current active - mismatch
        setValidationStatus('mismatch')
        setValidationError(
          `Your URL opening (${effectiveOpening.name}) differs from active opening (${response.opening_entry})`
        )
        return
      }
      
      setValidationStatus('valid')
      setValidationError(null)
      setLastValidatedAt(new Date())
    } catch (error) {
      setValidationStatus('error')
      setValidationError(error.message)
    }
  }, [effectiveOpening, isUrlOpening])
  
  return {
    // Data
    opening: effectiveOpening,
    effectiveOpeningName: effectiveOpening?.name || null,
    
    // Status
    status: validationStatus,
    error: validationError,
    isValid: validationStatus === 'valid',
    isMismatch: validationStatus === 'mismatch',
    isLoading: validationStatus === 'loading',
    
    // Context
    isUrlOpening,
    lastValidatedAt,
    
    // Actions
    validate: validateCurrentOpening,
    
    // For use in API calls
    getHeaderForApis: () => ({
      opening_entry: effectiveOpening?.name,
      X_Effective_Opening: effectiveOpening?.name  // Custom header for logging
    })
  }
}
```

---

## Part 3: Refactoring Plan

### Step 1: Create Hook (No Breaking Changes)
- Create file: `src/shared/hooks/useEffectiveOpening.js`
- Hook validates opening, returns single source of truth
- Not integrated yet - just available

### Step 2: Integrate Into App.jsx  
- Replace `usePOSProfileGuard` + `urlOpeningEntry` logic with `useEffectiveOpening`
- Pass `effectiveOpeningName` to all child components
- Pass `validate()` function to PaymentView, CloseShiftView for re-validation

### Step 3: Update Components
- **CashierHeader**: Use `effectiveOpeningName` instead of `posOpening.pos_opening_entry`
- **PaymentView**: Call `validate()` before making payment API call
- **CloseShiftView**: Call `validate()` before calling close_pos_opening
- **ActionButtons**: Show warning if `status === 'mismatch'`

### Step 4: Update Endpoints
- **claim_order()** backend: Add validation that `opening_entry == user.active_opening`
- **create_invoice_from_order()**: Already safe
- **process_payment()**: Already safe - add optional `X-Effective-Opening` header check
- **complete_order()**: Already safe
- **get_opening_summary()** / **close_pos_opening()**: Already safe

### Step 5: Documentation
- Update flow diagram Step 1-8
- Add "Multi-Session Consistency Rules" section
- Add "No Opening Switch Without Reload" rule

---

## Part 4: Code Changes Detailed

### Change 1: Create useEffectiveOpening Hook

**File**: `src/shared/hooks/useEffectiveOpening.js` (NEW)

```javascript
import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '@/shared/utils/api'

export function useEffectiveOpening({
  requiresOpening = true,
  allowUrlParam = true,
  autoRefreshMs = 30000  // Refresh every 30 seconds
} = {}) {
  const [effectiveOpening, setEffectiveOpening] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [isUrlOpening, setIsUrlOpening] = useState(false)
  const [lastValidatedAt, setLastValidatedAt] = useState(null)

  // Extract and validate URL opening_entry on mount
  useEffect(() => {
    const validateUrlOpening = async () => {
      if (!allowUrlParam) {
        // No URL param, load active opening
        await loadActiveOpening()
        return
      }

      const params = new URLSearchParams(window.location.search)
      const urlOpening = params.get('opening_entry')

      if (!urlOpening) {
        // No URL param, load active opening
        await loadActiveOpening()
        return
      }

      // Validate URL opening
      try {
        const posProfile = window.__IMOGI_CASHIER_CONTEXT?.pos_profile
        if (!posProfile) {
          throw new Error('POS Profile not available')
        }

        const response = await apiCall(
          'imogi_pos.api.module_select.validate_opening_session',
          { opening_entry: urlOpening, pos_profile: posProfile }
        )

        if (!response?.valid) {
          setStatus('error')
          setError(response?.error || 'Invalid opening')
          return
        }

        setEffectiveOpening(response.opening)
        setIsUrlOpening(true)
        setStatus('valid')
        setError(null)
        setLastValidatedAt(new Date())
      } catch (err) {
        setStatus('error')
        setError(err.message || 'Failed to validate opening')
      }
    }

    validateUrlOpening()
  }, [allowUrlParam])

  const loadActiveOpening = async () => {
    try {
      const response = await apiCall('imogi_pos.api.cashier.get_active_opening')
      
      if (!response?.has_opening) {
        if (requiresOpening) {
          setStatus('missing')
          setError('No active POS Opening')
        }
        return
      }

      setEffectiveOpening(response.opening || { name: response.opening_entry })
      setStatus('valid')
      setError(null)
      setLastValidatedAt(new Date())
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  // Re-validate opening is still active
  const revalidate = useCallback(async () => {
    if (!effectiveOpening?.name) return

    try {
      setStatus('loading')
      const response = await apiCall('imogi_pos.api.cashier.get_active_opening')
      
      if (!response?.has_opening) {
        setStatus('mismatch')
        setError(`Opening ${effectiveOpening.name} is no longer active`)
        return
      }

      // Check if URL opening differs from current active
      if (isUrlOpening && response.opening_entry !== effectiveOpening.name) {
        setStatus('mismatch')
        setError(
          `Your opening (${effectiveOpening.name}) differs from active (${response.opening_entry}). ` +
          `Please reload to switch.`
        )
        return
      }

      setStatus('valid')
      setError(null)
      setLastValidatedAt(new Date())
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }, [effectiveOpening, isUrlOpening])

  // Auto-revalidate periodically
  useEffect(() => {
    if (status !== 'valid' || !autoRefreshMs) return

    const interval = setInterval(() => {
      revalidate()
    }, autoRefreshMs)

    return () => clearInterval(interval)
  }, [status, autoRefreshMs, revalidate])

  return {
    opening: effectiveOpening,
    effectiveOpeningName: effectiveOpening?.name || null,
    status,
    error,
    isValid: status === 'valid',
    isMissing: status === 'missing',
    isLoading: status === 'loading',
    isMismatch: status === 'mismatch',
    isError: status === 'error',
    isUrlOpening,
    lastValidatedAt,
    revalidate
  }
}
```

### Change 2: Update App.jsx to Use Hook

**Key changes**:
- Replace `usePOSProfileGuard` opening resolution with `useEffectiveOpening`
- Pass `effectiveOpeningName` and `revalidate` to children
- Remove old URL param logic

**File**: `src/apps/cashier-console/App.jsx`

```javascript
// ADD: Import hook
import { useEffectiveOpening } from '@/shared/hooks/useEffectiveOpening'

function CounterPOSContent({ initialState }) {
  // REPLACE: Old usePOSProfileGuard with new hook
  const {
    opening: effectiveOpening,
    effectiveOpeningName,
    status: openingStatus,
    error: openingError,
    isValid: hasValidOpening,
    isMismatch: openingMismatch,
    revalidate: revalidateOpening
  } = useEffectiveOpening({
    requiresOpening: true,
    allowUrlParam: true,
    autoRefreshMs: 30000
  })

  // ... rest of component ...

  // PASS to children:
  return (
    <>
      <CashierHeader
        posOpening={effectiveOpening}
        effectiveOpeningName={effectiveOpeningName}
        // ...
      />
      
      <PaymentView
        effectiveOpeningName={effectiveOpeningName}
        revalidateOpening={revalidateOpening}
        // ...
      />
      
      <CloseShiftView
        effectiveOpeningName={effectiveOpeningName}
        revalidateOpening={revalidateOpening}
        // ...
      />
    </>
  )
}
```

### Change 3: Update PaymentView.jsx

```javascript
// Before API call for payment:
export function PaymentView({ effectiveOpeningName, revalidateOpening, ... }) {
  const handleRequestPayment = async (order) => {
    // RE-VALIDATE opening before payment
    console.log('[Payment] Re-validating opening...')
    await revalidateOpening()
    
    const openingStatus = // ... from hook ...
    if (openingStatus !== 'valid') {
      frappe.msgprint({
        title: 'Error',
        indicator: 'red',
        message: 'Opening validation failed. Please reload and try again.'
      })
      return
    }

    // Now safe to call payment API with consistent opening
    const result = await apiCall('imogi_pos.api.cashier.create_invoice_from_order', {
      order_name: order.name
    })
    // ...
  }
}
```

### Change 4: Backend claim_order Validation

**File**: `imogi_pos/api/order_concurrency.py`

```python
@frappe.whitelist()
def claim_order(order_name, opening_entry):
    """
    Atomic claim operation: Lock order to specific cashier session.
    
    HARDENED: Validates opening_entry matches user's active opening
    """
    try:
        # Validate inputs
        if not order_name or not opening_entry:
            return {'success': False, 'error': 'Missing parameters'}
        
        # CHECK: opening_entry must match user's active opening
        from imogi_pos.api.cashier import ensure_active_opening
        from imogi_pos.utils.operational_context import require_operational_context
        
        ctx = require_operational_context()
        pos_profile = ctx.get('pos_profile')
        
        try:
            active_dict = ensure_active_opening(pos_profile=pos_profile, user=frappe.session.user)
            active_opening = active_dict.get('name')
            
            if active_opening != opening_entry:
                logger.error(
                    f'claim_order: User {frappe.session.user} tried to claim with opening {opening_entry}, '
                    f'but active opening is {active_opening}'
                )
                return {
                    'success': False,
                    'error': _('Opening mismatch. Your active opening is {0}, but you tried to claim with {1}').format(
                        active_opening, opening_entry
                    )
                }
        except frappe.ValidationError as e:
            logger.error(f'claim_order: Opening validation failed: {str(e)}')
            return {'success': False, 'error': str(e)}
        
        # Rest of existing claim_order logic...
        # ...
```

---

## Part 5: Documentation Updates

### Update: COUNTER_MODE_IMPLEMENTATION.md - New Section

Add before "Step 3: Session Tracking":

```markdown
### Step 1b: Multi-Session Consistency Rules (NEW)

**For installations with multi-session support** (opening_entry URL parameter):

1. **Single Effective Opening Per Session**:
   - Opening is validated on page load from URL param or user's active opening
   - Opening is LOCKED for entire session (until page reload)
   - Cannot switch opening mid-session without full page reload

2. **Re-Validation On Critical Operations**:
   - Before Payment: `useEffectiveOpening.revalidate()` checks opening still exists/open
   - Before Close Shift: Same re-validation
   - Before Complete Order: Same re-validation
   - If re-validation fails: Show error, require reload

3. **Backend Consistency Enforcement**:
   - `ensure_active_opening()` validates against user's current active opening
   - `claim_order()` validates opening_entry == user.active_opening
   - `process_payment()` validates invoice.imogi_pos_session == active_opening
   - `complete_order()` validates invoice.imogi_pos_session == active_opening
   - `close_pos_opening()` validates opening_name == user.active_opening

4. **No Silent Opening Switch**:
   - ❌ Cannot change `?opening_entry=` in URL and expect UI to follow
   - ✅ Must reload page if you want to switch opening
   - ✅ Page will show warning if opening becomes inactive mid-session

**Example Error**:
```
Opening mismatch error:
"Opening POS-OPN-001 is no longer active. 
Active opening is now POS-OPN-002. 
Please reload page to switch."
```

**Why This Matters**:
- Prevents accidental transaction in wrong shift
- Prevents two cashiers processing same order in parallel
- Maintains audit trail consistency
- Ensures closing entry reconciles correctly
```

---

## Summary Table: Changes Required

| Component | File | Change | Impact |
|-----------|------|--------|--------|
| New Hook | `src/shared/hooks/useEffectiveOpening.js` | CREATE | Provides single source of truth |
| App.jsx | `src/apps/cashier-console/App.jsx` | REFACTOR | Use hook instead of url logic |
| PaymentView | `src/apps/cashier-console/components/PaymentView.jsx` | UPDATE | Call revalidate() before payment |
| CloseShiftView | `src/apps/cashier-console/components/CloseShiftView.jsx` | UPDATE | Call revalidate() before close |
| claim_order() | `imogi_pos/api/order_concurrency.py` | HARDEN | Add opening match validation |
| Docs | `COUNTER_MODE_IMPLEMENTATION.md` | UPDATE | Add multi-session consistency rules |

---

## Risk Assessment

### 🟢 Low Risk Changes:
- useEffectiveOpening hook (new, non-breaking)
- PaymentView revalidation (adds validation, no breaking change)

### 🟡 Medium Risk Changes:
- App.jsx refactor (touching opening resolution logic)
- claim_order() backend validation (may reject old clients)

### 🔴 High Risk:
- None identified if rolled out with backward compatibility

---

## Testing Checklist

- [ ] Load with `?opening_entry=POS-OPN-001` → validates correctly
- [ ] Load without param → uses active opening
- [ ] Close opening mid-session → payment fails with mismatch error
- [ ] Reload with different opening → switches correctly
- [ ] Try to claim order in inactive opening → claim_order() rejects
- [ ] Payment re-validates opening → calls revalidate()
- [ ] Close shift re-validates opening → calls revalidate()

---

**Status**: Ready for implementation  
**Priority**: High (ensures consistency in multi-session mode)

