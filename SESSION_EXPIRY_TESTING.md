# Session Expiry Fix - Testing Guide

## Quick Test Instructions

### Test 1: Simulate Session Expiry (Browser Console Method)

1. **Login** to IMOGI POS
2. Navigate to Module Select (`/app/imogi-module-select`)
3. Open browser DevTools (F12)
4. Run this in console to delete session cookie:
   ```javascript
   document.cookie.split(";").forEach(function(c) { 
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
   });
   ```
5. Try to click on any module card
6. **Expected:** Immediate redirect to `/imogi-login`
7. **Expected:** After login, redirect back to module-select

### Test 2: Simulate 503 Session Stopped (Backend Method)

1. **Login** to IMOGI POS
2. On the server, find and kill the Frappe bench processes:
   ```bash
   # Find frappe processes
   ps aux | grep frappe
   
   # Kill them (will auto-restart if supervisor is running)
   sudo systemctl restart frappe-bench-web
   ```
3. Try to interact with the app
4. **Expected:** 503 errors caught, redirect to login

### Test 3: Open POS Opening Modal

1. **Login** to IMOGI POS
2. Navigate to Module Select
3. Try to open Cashier module (if it requires POS Opening)
4. Delete session cookie (see Test 1)
5. The POSOpeningModal tries to load payment methods
6. **Expected:** Immediate redirect to login (not stuck on loading)

### Test 4: Multiple Simultaneous Requests

1. **Login** to IMOGI POS
2. Open browser DevTools → Network tab
3. Delete session cookie
4. Rapidly click on multiple module cards
5. **Expected:** Only ONE redirect to `/imogi-login`
6. Check console logs - should see "Redirect already in progress"

### Test 5: Natural Session Timeout

1. **Login** to IMOGI POS
2. Wait for Frappe session timeout (default: 24 hours, but can be shorter)
3. Try to interact with the app
4. **Expected:** Redirect to login with current URL saved

## What to Look For

### ✅ Success Indicators

- Clean redirect to `/imogi-login` (no error modals/toasts)
- Console shows: `[session-manager] Session expired (source: X), redirecting to login`
- After re-login, user returns to the page they were on
- No multiple redirects (check Network tab for duplicate login page loads)
- No infinite retry loops (check Network tab for repeated failed API calls)

### ❌ Failure Indicators

- User sees 503 error modal/toast
- User gets stuck on loading state
- Multiple redirects to login page
- After login, user doesn't return to original page
- Continued API retries after session expiry detected

## Console Logs to Check

### Good Logs
```
[session-manager] Session expired (source: module-select-api), redirecting to login
[api-manager] Session expired (503), redirecting to login
[POSOpeningModal] Session expired, redirecting to login
```

### Bad Logs (Should Not See)
```
[module-select] API call failed: Error: HTTP 503: Service Unavailable
Uncaught (in promise): Session Stopped
Multiple login page loads detected
```

## Browser Compatibility

Test in:
- ✅ Chrome/Edge (Chromium) - Primary
- ✅ Firefox - Secondary
- ✅ Safari - macOS/iOS only

## Mobile Testing

Test on:
- Mobile browsers (Chrome Mobile, Safari iOS)
- Tablets
- Different screen sizes/orientations

## Server Scenarios

Test with:
1. **Normal operation** - Should work as before
2. **Server restart** - Should handle gracefully
3. **Network interruption** - Should retry network errors, not session errors
4. **Maintenance mode** - Should handle 503 appropriately
5. **Load balancer failover** - Should maintain session or redirect properly

## Rollback Plan

If issues occur:

1. **Revert commits:**
   ```bash
   git log --oneline -5  # Find commit hash
   git revert <commit-hash>
   ```

2. **Quick disable:** Comment out import in affected files:
   ```javascript
   // import { isSessionExpired, handleSessionExpiry } from '../../shared/utils/session-manager'
   ```

3. **Rebuild:**
   ```bash
   npm run build
   ```

## Performance Impact

The fix should have **minimal performance impact**:
- Session checks only happen on API errors (not on success)
- No additional API calls unless explicitly using `checkSessionValidity()`
- Optional session monitoring (default disabled)
- Efficient duplicate redirect prevention

## Monitoring in Production

**Logs to monitor:**
- Count of `[session-manager] Session expired` messages
- Sources of session expiry (which component/API)
- Time between session expiry events
- User impact (how many users affected)

**Metrics to track:**
- Login page redirects per hour
- Average session duration before expiry
- Percentage of users experiencing session expiry
- Time to recovery (login to resumed activity)

## Known Limitations

1. **No session refresh** - Users must login again (not auto-refreshed)
2. **State loss** - Component state is lost on redirect (by design)
3. **In-progress requests** - May show briefly before redirect
4. **WebSocket/Realtime** - Separate disconnect handling may be needed

## Future Improvements

See [SESSION_EXPIRY_FIX.md](SESSION_EXPIRY_FIX.md) for planned enhancements.

---

**Last Updated:** January 28, 2026  
**Fix Version:** 2.0.0  
**Tested By:** _[To be filled after testing]_
