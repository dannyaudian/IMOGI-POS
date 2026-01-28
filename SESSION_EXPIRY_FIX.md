# Session Expiry Handling Fix - Summary

## Problem

Users were experiencing 503 "Service Unavailable" errors with the exception message "Session Stopped" when their Frappe session expired. The affected API endpoints were:

- `imogi_pos.api.cashier.get_pos_payment_methods`
- `imogi_pos.api.module_select.get_available_modules`

### Root Cause

When a Frappe session expires or is stopped (e.g., due to server restart, session timeout, or maintenance), the backend returns:
- HTTP Status: **503 (Service Unavailable)**
- Exception Type: `frappe.exceptions.SessionStopped`
- Exception Message: "Session Stopped"

The React frontend was not properly handling this scenario and would:
1. Show cryptic error messages
2. Continue retrying the failed requests
3. Not redirect users to login
4. Leave users in a broken state with no way to recover

## Solution

Implemented comprehensive session expiry detection and handling across the application.

### 1. Created Centralized Session Manager

**File:** [`src/shared/utils/session-manager.js`](src/shared/utils/session-manager.js)

A reusable utility that provides:

- **`isSessionExpired(error)`** - Detects session expiry from various error formats
  - 503 status codes with "Session Stopped" message
  - 401/403 authentication errors
  - 417 expectation failed errors
  - Error messages containing session-related keywords

- **`handleSessionExpiry(source)`** - Handles redirect to login
  - Prevents multiple simultaneous redirects
  - Saves current URL for post-login redirect
  - Logs the source of session expiry for debugging

- **`checkSessionValidity()`** - Proactive session check
  - Calls `/api/method/imogi_pos.api.public.check_session`
  - Returns boolean indicating session validity

- **`useSessionMonitor(intervalMs)`** - React hook for periodic session monitoring
  - Checks session every 5 minutes by default
  - Auto-redirects if session becomes invalid

- **`setupGlobalSessionErrorHandler()`** - Global error catcher
  - Handles unhandled promise rejections
  - Listens for custom `sessionexpired` events

### 2. Updated API Manager

**File:** [`src/shared/utils/api-manager.js`](src/shared/utils/api-manager.js)

Enhanced the centralized API manager to:

- **Detect 503 Session Stopped errors** in response handling
- **Parse error response** to check for `SessionStopped` exception type
- **Trigger immediate redirect** to login when session expired
- **Prevent retry attempts** on session expiry (marked as non-retryable)
- **Stop execution** after redirect to prevent cascading errors

### 3. Updated Module Select

**File:** [`src/apps/module-select/App.jsx`](src/apps/module-select/App.jsx)

Changes:
- Imported centralized `isSessionExpired` and `handleSessionExpiry`
- Replaced inline session error detection with centralized function
- Updated error handler to use centralized redirect logic
- Simplified code by removing duplicate logic

### 4. Updated POS Opening Modal

**File:** [`src/shared/components/POSOpeningModal.jsx`](src/shared/components/POSOpeningModal.jsx)

Changes:
- Imported centralized session manager utilities
- Replaced inline session error detection with `isSessionExpired()`
- Replaced inline redirect logic with `handleSessionExpiry()`
- Removed duplicate session handling code

## Benefits

### 1. **User Experience**
- Users are immediately redirected to login when session expires
- No more confusing 503 errors
- Smooth recovery flow with auto-redirect back to original page after login
- Clear indication of what happened (session expiry)

### 2. **Developer Experience**
- Single source of truth for session error detection
- Consistent handling across all components
- Easy to maintain and extend
- Clear logging for debugging

### 3. **Reliability**
- Prevents multiple simultaneous login redirects
- Stops retry attempts on expired sessions (saves network/server resources)
- Global error handler catches unhandled session errors
- Optional proactive session monitoring

### 4. **Maintainability**
- Centralized session logic in one file
- Easy to update session detection rules
- Reusable across all React apps in the project
- Clear separation of concerns

## How It Works

### Detection Flow

```
API Call → Error (503) → Check Response
                            ↓
                    Is SessionStopped?
                            ↓ YES
                    Mark as Session Error
                            ↓
                    Call handleSessionExpiry()
                            ↓
                    Save current URL
                            ↓
                    Redirect to /imogi-login
```

### Recovery Flow

```
User logs in → Login handler checks localStorage
                            ↓
                Has 'login_redirect'?
                            ↓ YES
                Redirect to saved URL
                            ↓
                User continues from where they left off
```

## Files Modified

1. **Created:** `src/shared/utils/session-manager.js` - Centralized session management
2. **Updated:** `src/shared/utils/api-manager.js` - Added 503 session detection
3. **Updated:** `src/apps/module-select/App.jsx` - Use centralized session manager
4. **Updated:** `src/shared/components/POSOpeningModal.jsx` - Use centralized session manager

## Testing Recommendations

### Manual Testing

1. **Session Timeout Test**
   - Login to the app
   - Wait for session to expire (or manually delete session cookie)
   - Try to interact with module-select or open POS Opening modal
   - Verify redirect to login happens immediately
   - Verify redirect back to original page after re-login

2. **Server Restart Test**
   - Login to the app
   - Restart the Frappe backend server
   - Try to interact with the app
   - Verify graceful redirect to login

3. **Multiple Request Test**
   - Trigger multiple API calls simultaneously with expired session
   - Verify only ONE redirect happens (not multiple)

### Browser Testing

Test in different browsers:
- Chrome/Edge (Chromium)
- Firefox
- Safari

### Error Scenarios

1. Network errors (should retry, not redirect)
2. 500 server errors (should show error, not redirect)
3. 503 non-session errors (should show error, not redirect)
4. 503 session stopped (should redirect immediately)
5. 401/403 auth errors (should redirect immediately)

## Future Enhancements

### Potential Improvements

1. **Session Refresh** - Auto-refresh session before expiry
2. **Notification** - Show toast notification "Session expired, redirecting..."
3. **Session Storage** - Store non-sensitive state to restore after login
4. **Heartbeat** - Periodic keepalive requests to prevent session timeout
5. **Countdown Warning** - Show warning 5 minutes before session expires
6. **Background Tab Handling** - Pause session checks when tab is not active

### Integration Points

The session manager can be integrated with:
- All React apps (cashier, kitchen, displays, etc.)
- Legacy WWW pages using Frappe Desk
- Mobile apps using the same backend
- Third-party integrations using IMOGI POS APIs

## Monitoring & Logging

All session expiry events are logged with:
- **Source** - Which component detected the expiry
- **Timestamp** - When it occurred
- **Current URL** - Where the user was
- **Error Details** - Status code, message, exception type

Example log:
```
[session-manager] Session expired (source: module-select-api), redirecting to login
```

This makes it easy to:
- Track session expiry patterns
- Identify problematic components
- Debug session-related issues
- Monitor user experience issues

## Backward Compatibility

All changes are **backward compatible**:
- Existing error handling continues to work
- No breaking changes to API contracts
- Old code paths still function
- Gradual migration possible

Components not yet updated will continue to work with their existing error handling, while new components automatically benefit from centralized session management.

## Conclusion

This fix provides a robust, maintainable solution for handling Frappe session expiry across the IMOGI POS application. Users will no longer experience confusing 503 errors, and developers have a clean, centralized API for session management.

The solution is:
- ✅ **User-friendly** - Clear error handling and smooth recovery
- ✅ **Developer-friendly** - Centralized, reusable, well-documented
- ✅ **Production-ready** - Handles edge cases, prevents duplicate redirects
- ✅ **Maintainable** - Single source of truth, easy to extend
- ✅ **Backward compatible** - Works with existing code

---

**Date:** January 28, 2026  
**Author:** GitHub Copilot  
**Issue:** Session Stopped 503 errors causing poor UX
