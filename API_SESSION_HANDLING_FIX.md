# API Call & Session Handling - Permanent Fix

## Problem Fixed

Previously, API calls to `/api/method/imogi_pos.api.billing.list_orders_for_cashier` were returning **417 Expectation Failed** errors, causing:
- Blank screens in React apps
- Instant redirects to login without UI feedback
- Loss of user context and session state
- Poor user experience

## Root Causes

1. **Missing/Invalid CSRF tokens** in fetch calls
2. **No session expiry detection** before API calls
3. **No retry logic** for network errors
4. **Inconsistent error handling** across apps
5. **Direct redirects** without showing UI to users

## Solution

Created a centralized API utility (`src/shared/utils/api.js`) and SessionExpired component that:

✅ Uses `frappe.call()` if available (includes CSRF automatically)  
✅ Falls back to `fetch()` with proper CSRF token handling  
✅ Detects session expiry (401/403/417 + Guest user)  
✅ Shows full-screen "Session Expired" UI before redirect  
✅ Includes retry logic for network errors (not auth errors)  
✅ Comprehensive error logging with `[imogi-api]` tag  
✅ Normalizes all responses to `r.message` format  

---

## Usage Guide

### 1. Basic API Call

```javascript
import { apiCall } from '@/shared/utils/api'

// Simple read
const orders = await apiCall('imogi_pos.api.billing.list_orders_for_cashier', {
  order_type: 'Counter'
})

// Write operation
await apiCall('imogi_pos.api.orders.submit_order', {
  order_name: 'POS-001'
})
```

### 2. With Options

```javascript
import { apiCall } from '@/shared/utils/api'

// Show loading overlay, enable retry
const result = await apiCall(
  'imogi_pos.api.billing.create_invoice',
  { order_name: 'POS-001' },
  {
    freeze: true,          // Show loading overlay
    silent: false,         // Show errors to user  
    retry: 3,             // Retry network errors 3 times
    timeout: 30000,       // 30 second timeout
    onSessionExpired: () => {
      // Custom session expiry handler (optional)
      console.log('Custom expiry logic')
    }
  }
)
```

### 3. Replace Direct Fetch Calls

**BEFORE (problematic):**
```javascript
const response = await fetch('/api/method/imogi_pos.api.orders.submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Frappe-CSRF-Token': csrfToken  // May be missing/invalid
  },
  body: JSON.stringify(args)
})
const data = await response.json()
```

**AFTER (fixed):**
```javascript
import { apiCall } from '@/shared/utils/api'

const data = await apiCall('imogi_pos.api.orders.submit', args)
```

### 4. Replace frappe.call() for Consistency

**BEFORE:**
```javascript
await window.frappe.call({
  method: 'imogi_pos.api.orders.add_item_to_order',
  args: {
    order_name: selectedOrder.name,
    item_code: itemName,
    qty: 1
  }
})
```

**AFTER:**
```javascript
import { apiCall } from '@/shared/utils/api'

await apiCall('imogi_pos.api.orders.add_item_to_order', {
  order_name: selectedOrder.name,
  item_code: itemName,
  qty: 1
})
```

### 5. Wrap Apps with SessionExpiredProvider

**Required in main App.jsx:**

```javascript
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'

function App({ initialState }) {
  return (
    <SessionExpiredProvider>
      <ImogiPOSProvider initialState={initialState}>
        <YourAppContent />
      </ImogiPOSProvider>
    </SessionExpiredProvider>
  )
}
```

### 6. Manual Session Expiry Trigger

```javascript
import { useSessionExpired } from '@/shared/components/SessionExpired'

function MyComponent() {
  const { triggerSessionExpired } = useSessionExpired()
  
  const handleError = (error) => {
    if (error.httpStatus === 401) {
      triggerSessionExpired('Your session has expired')
    }
  }
}
```

---

## API Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `freeze` | boolean | `false` | Show loading overlay during call |
| `silent` | boolean | `false` | Don't show error toasts to user |
| `retry` | number | `2` | Number of retries for network errors |
| `timeout` | number | `30000` | Request timeout in milliseconds |
| `onSessionExpired` | function | `null` | Custom session expiry handler |

---

## Error Handling

### Session Expiry Detection

The API utility detects session expiry in multiple ways:

1. **HTTP Status Codes:** 401, 403, 417
2. **Guest User:** `frappe.session.user === 'Guest'`
3. **Login Page HTML:** Response contains login form

When detected, the SessionExpired component shows:
- Full-screen modal with clear messaging
- "Reload & Login" button
- "Back to Login" button
- 30-second auto-reload countdown
- Help text for recurring issues

### Network Errors

Network errors are automatically retried:
- Timeout errors
- Connection failures
- "Failed to fetch" errors

**Auth errors are NOT retried** to prevent account lockouts.

### Response Normalization

All responses are normalized to `r.message` format:

```javascript
// Frappe response: { message: data, exc: null }
// Returns: data

// Error response: { message: null, exc: "Error text" }
// Throws: Error("Error text")
```

---

## Implementation Checklist

### ✅ Completed

- [x] Created `src/shared/utils/api.js` with `apiCall()` function
- [x] Created `src/shared/components/SessionExpired.jsx` and CSS
- [x] Updated `src/shared/api/imogi-api.js` to use `apiCall()`
- [x] Wrapped cashier-console with `SessionExpiredProvider`

### 🔧 Recommended Updates

Apply these changes to remaining apps:

#### **Waiter App** (`src/apps/waiter/App.jsx`)
```javascript
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'

function App({ initialState }) {
  return (
    <SessionExpiredProvider>
      <ImogiPOSProvider initialState={initialState}>
        <WaiterContent initialState={initialState} />
      </ImogiPOSProvider>
    </SessionExpiredProvider>
  )
}
```

#### **Kitchen App** (`src/apps/kitchen/App.jsx`)
```javascript
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'

function App({ initialState }) {
  return (
    <SessionExpiredProvider>
      <KitchenContent initialState={initialState} />
    </SessionExpiredProvider>
  )
}
```

#### **Module Select** (`src/apps/module-select/App.jsx`)
```javascript
import { SessionExpiredProvider } from '@/shared/components/SessionExpired'

function App({ initialState }) {
  return (
    <SessionExpiredProvider>
      <FrappeProvider>
        <ModuleSelectContent initialState={initialState} />
      </FrappeProvider>
    </SessionExpiredProvider>
  )
}
```

---

## Testing

### Test Session Expiry

1. **Open cashier console** in Frappe Desk
2. **Open browser console**
3. **Simulate session expiry:**
   ```javascript
   // Trigger session expired event
   window.dispatchEvent(new CustomEvent('imogi-session-expired', {
     detail: { message: 'Test session expiry' }
   }))
   ```
4. **Verify:** Session Expired modal appears with countdown

### Test API Call Error Handling

```javascript
// In browser console
import { apiCall } from '@/shared/utils/api'

// This should show proper error handling
await apiCall('imogi_pos.api.invalid_method', {})
```

### Debug Script Injection

```javascript
// Check which IMOGI scripts are loaded
window.__imogiDebugScripts()

// Output: { 'cashier-console': 1, 'module-select': 1 }
```

---

## Troubleshooting

### Issue: Still seeing 417 errors

**Check:**
1. Is `SessionExpiredProvider` wrapping your app?
2. Are you using `apiCall()` or old fetch calls?
3. Check browser console for `[imogi-api]` logs

**Solution:**
```bash
# Search for direct fetch calls
grep -r "fetch('/api/method/" src/apps/

# Replace with apiCall
```

### Issue: Session expiry not detected

**Check:**
1. Is the event listener registered?
2. Check browser console for errors in SessionExpired.jsx

**Debug:**
```javascript
// Manual trigger
window.dispatchEvent(new CustomEvent('imogi-session-expired'))
```

### Issue: Infinite retries on auth errors

**This should NOT happen** - auth errors (401/403/417) are never retried.

**If it does:**
1. Check `shouldRetry()` function in `api.js`
2. Verify `isAuthError()` is detecting status codes correctly

---

## Logging

All API calls log to console with `[imogi-api]` prefix:

```
[imogi-api] Calling imogi_pos.api.billing.list_orders_for_cashier {order_type: "Counter"}
[imogi-api] Success imogi_pos.api.billing.list_orders_for_cashier [array data]
```

Errors log full context:
```
[imogi-api] Error calling imogi_pos.api.orders.submit:
{
  method: "imogi_pos.api.orders.submit",
  args: {order_name: "POS-001"},
  error: "Session expired",
  httpStatus: 417
}
```

---

## Future Enhancements

1. **Exponential backoff** for retries (currently fixed 1s delay)
2. **Request queuing** during network issues
3. **Optimistic updates** with rollback on error
4. **Offline mode** with sync when connection restored
5. **Request cancellation** for unmounted components

---

## Related Files

| File | Purpose |
|------|---------|
| `src/shared/utils/api.js` | Main API utility |
| `src/shared/components/SessionExpired.jsx` | Session expiry UI component |
| `src/shared/components/SessionExpired.css` | Session expiry styles |
| `src/shared/api/imogi-api.js` | API hooks (now uses apiCall) |
| `imogi_pos/public/js/imogi_loader.js` | Desk page React bundle loader |

---

## Support

For issues or questions:
1. Check browser console for `[imogi-api]` logs
2. Use `window.__imogiDebugScripts()` to verify script loading
3. Check network tab for actual HTTP requests/responses
4. Review this documentation for common patterns

---

**Last Updated:** January 28, 2026  
**Version:** 1.0.0 - Permanent Fix for 417 Errors
