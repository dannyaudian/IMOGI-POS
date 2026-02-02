# Manual Testing Checklist - Post Cleanup

**Date**: January 28, 2026  
**Tester**: _____________  
**Environment**: □ Development  □ Staging  □ Production  
**Browser**: _____________  
**Frappe Version**: _____________

---

## 🎯 Testing Objectives

Verify that after cleanup (12,279 LOC removed):
1. No duplicate script injections
2. Navigation flows work correctly
3. Session handling works properly
4. Error handling is user-friendly
5. Logging is consistent

**Total Time**: ~44 minutes

---

## ✅ Test 1: Script Injection Verification (10 min)

**Objective**: Ensure exactly 1 script per app (no duplicates)

**Procedure**:
1. Start development server: `bench start`
2. Open each page in browser
3. Run `window.__imogiDebugScripts()` in console
4. Record script counts

**Results**:

| Page | URL | App Name | Script Count | Status |
|------|-----|----------|--------------|--------|
| Module Select | `/app/imogi-module-select` | `module-select` | ___ | ✅/❌ |
| Cashier | `/app/imogi-cashier` | `cashier-console` | ___ | ✅/❌ |
| Waiter | `/app/imogi-waiter` | `waiter` | ___ | ✅/❌ |
| Kitchen | `/app/imogi-kitchen` | `kitchen` | ___ | ✅/❌ |
| Customer Display | `/app/imogi-displays` | `customer-display` | ___ | ✅/❌ |
| Table Display | `/app/imogi-tables` | `table-display` | ___ | ✅/❌ |

**Expected**: All script counts = 1 ✅

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 2: Rapid Navigation Test (5 min)

**Objective**: Verify no double mounts, navigation is smooth

**Procedure**:
1. Open `/app/imogi-module-select`
2. Click Cashier button → verify cashier loads
3. Click "Back to Module Select" → verify module-select loads
4. **Repeat 10 times** (total 20 navigations)
5. Watch DevTools console for errors

**Expected Behavior**:
- Each navigation is instant (no delays)
- No "Already mounting" warnings
- No duplicate script injections
- Console shows clean mount/unmount logs

**Results**:

| Iteration | Navigation | Load Time | Errors | Status |
|-----------|------------|-----------|--------|--------|
| 1 | module → cashier | ___ ms | Y/N | ✅/❌ |
| 1 | cashier → module | ___ ms | Y/N | ✅/❌ |
| 2 | module → cashier | ___ ms | Y/N | ✅/❌ |
| ... | ... | ... | ... | ... |
| 10 | cashier → module | ___ ms | Y/N | ✅/❌ |

**Observations**:
- Total errors encountered: ___
- Average navigation time: ___ ms
- Any warnings in console? _______________

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 3: Hard Refresh Test (5 min)

**Objective**: Verify clean page loads after hard refresh

**Procedure**:
1. Navigate to each page
2. Open DevTools Console (F12)
3. Press **Cmd+Shift+R** (macOS) or **Ctrl+Shift+R** (Windows/Linux)
4. Observe console logs
5. Run `window.__imogiDebugScripts()`

**Results**:

| Page | Hard Refresh Clean? | Script Count After | Errors | Status |
|------|---------------------|-------------------|--------|--------|
| Module Select | Y/N | ___ | Y/N | ✅/❌ |
| Cashier | Y/N | ___ | Y/N | ✅/❌ |
| Waiter | Y/N | ___ | Y/N | ✅/❌ |
| Kitchen | Y/N | ___ | Y/N | ✅/❌ |
| Customer Display | Y/N | ___ | Y/N | ✅/❌ |
| Table Display | Y/N | ___ | Y/N | ✅/❌ |

**Expected**: All pages load cleanly, script count = 1

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 4: Multi-Tab Test (5 min)

**Objective**: Verify no cross-contamination between tabs

**Procedure**:
1. Open 3 tabs in same browser:
   - Tab 1: `/app/imogi-cashier`
   - Tab 2: `/app/imogi-waiter`
   - Tab 3: `/app/imogi-kitchen`
2. In each tab, check `window.__imogiOperationalContext`
3. Switch between tabs rapidly (10 times)
4. In each tab, make an API call (e.g., load items)
5. Verify contexts remain independent

**Results**:

| Tab | App | Context Correct? | API Calls Work? | Status |
|-----|-----|------------------|-----------------|--------|
| 1 | Cashier | Y/N | Y/N | ✅/❌ |
| 2 | Waiter | Y/N | Y/N | ✅/❌ |
| 3 | Kitchen | Y/N | Y/N | ✅/❌ |

**Expected**: Each tab maintains independent context, no errors

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 5: Back/Forward Navigation (3 min)

**Objective**: Verify browser navigation buttons work correctly

**Procedure**:
1. Start at `/app/imogi-module-select`
2. Navigate: Module → Cashier → Waiter → Kitchen
3. Click browser **Back button** 3 times
4. Observe route changes: Kitchen → Waiter → Cashier
5. Click browser **Forward button** 3 times
6. Observe route changes: Cashier → Waiter → Kitchen
7. Check console for errors

**Results**:

| Action | Expected Route | Actual Route | Errors | Status |
|--------|---------------|--------------|--------|--------|
| Initial | `/app/imogi-module-select` | _________ | Y/N | ✅/❌ |
| Nav → Cashier | `/app/imogi-cashier` | _________ | Y/N | ✅/❌ |
| Nav → Waiter | `/app/imogi-waiter` | _________ | Y/N | ✅/❌ |
| Nav → Kitchen | `/app/imogi-kitchen` | _________ | Y/N | ✅/❌ |
| Back 1x | `/app/imogi-waiter` | _________ | Y/N | ✅/❌ |
| Back 2x | `/app/imogi-cashier` | _________ | Y/N | ✅/❌ |
| Back 3x | `/app/imogi-module-select` | _________ | Y/N | ✅/❌ |
| Forward 1x | `/app/imogi-cashier` | _________ | Y/N | ✅/❌ |
| Forward 2x | `/app/imogi-waiter` | _________ | Y/N | ✅/❌ |
| Forward 3x | `/app/imogi-kitchen` | _________ | Y/N | ✅/❌ |

**Expected**: All routes correct, no errors

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 6: Session Expiry Test (5 min)

**Objective**: Verify session expiry is handled gracefully

**Procedure**:
1. Open `/app/imogi-cashier`
2. Open another tab, logout from Frappe Desk
3. Return to cashier tab
4. Try to make an API call (e.g., search items)
5. Observe SessionExpired modal

**Expected Modal**:
- Title: "Session Expired"
- Message: "Your session has expired. Please log in again."
- Countdown: 30 seconds
- Buttons: "Reload Page" and "Go to Login"

**Results**:

| Aspect | Expected | Observed | Status |
|--------|----------|----------|--------|
| Modal appears? | Yes | Y/N | ✅/❌ |
| Countdown timer? | 30s → 0s | ___ | ✅/❌ |
| "Reload Page" button? | Works | Y/N | ✅/❌ |
| "Go to Login" button? | Redirects to /login | Y/N | ✅/❌ |
| Auto-redirect at 0s? | Yes, to /login | Y/N | ✅/❌ |
| No instant redirect? | Correct (30s delay) | Y/N | ✅/❌ |

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 7: Network Error Test (3 min)

**Objective**: Verify network errors are user-friendly

**Procedure**:
1. Open `/app/imogi-cashier`
2. Open DevTools → Network tab
3. Select "Offline" in throttling dropdown
4. Try to search for items (API call)
5. Observe error message

**Expected Error**:
- User-friendly message: "Network error. Please check your connection."
- No raw error logs visible to user
- Retry logic works after going online

**Results**:

| Aspect | Expected | Observed | Status |
|--------|----------|----------|--------|
| Offline error shown? | Yes | Y/N | ✅/❌ |
| User-friendly message? | Yes | Y/N | ✅/❌ |
| Raw error hidden? | Yes | Y/N | ✅/❌ |
| Retry after online? | Works | Y/N | ✅/❌ |

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 8: API Error Handling (3 min)

**Objective**: Verify API errors are handled gracefully

**Procedure**:
1. Open `/app/imogi-cashier`
2. Trigger an API error (e.g., search for non-existent item, or use invalid POS Profile)
3. Observe error message in UI

**Expected Behavior**:
- Error message appears (Frappe toast or modal)
- Error message is clear and actionable
- No console errors visible to user

**Results**:

| Scenario | Error Message | User-Friendly? | Status |
|----------|---------------|----------------|--------|
| Invalid item | _____________ | Y/N | ✅/❌ |
| Invalid profile | _____________ | Y/N | ✅/❌ |
| Permission denied | _____________ | Y/N | ✅/❌ |

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 9: Logging Format Verification (2 min)

**Objective**: Verify consistent logging across all pages

**Procedure**:
1. Open DevTools Console
2. Navigate to each page
3. Observe console logs for Desk page show events

**Expected Log Format**:
```javascript
🟢 [DESK PAGE SHOW] Cashier { route: '/app/imogi-cashier', timestamp: '2026-01-28T...' }
```

**Results**:

| Page | Log Format | Emoji Present? | Timestamp Present? | Status |
|------|------------|----------------|-------------------|--------|
| Module Select | Correct/Incorrect | Y/N | Y/N | ✅/❌ |
| Cashier | Correct/Incorrect | Y/N | Y/N | ✅/❌ |
| Waiter | Correct/Incorrect | Y/N | Y/N | ✅/❌ |
| Kitchen | Correct/Incorrect | Y/N | Y/N | ✅/❌ |
| Customer Display | Correct/Incorrect | Y/N | Y/N | ✅/❌ |
| Table Display | Correct/Incorrect | Y/N | Y/N | ✅/❌ |

**Expected**: All logs use 🟢 [DESK PAGE SHOW] format with route + timestamp

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## ✅ Test 10: Operational Context Consistency (3 min)

**Objective**: Verify operational context is consistent across pages

**Procedure**:
1. Open `/app/imogi-module-select`
2. Select a POS Profile + Branch + Device
3. Navigate to `/app/imogi-cashier`
4. Check `window.__imogiOperationalContext` in console
5. Navigate to other pages, verify context persists

**Results**:

| Page | Context Present? | POS Profile Correct? | Branch Correct? | Status |
|------|------------------|---------------------|-----------------|--------|
| Module Select (after select) | Y/N | Y/N | Y/N | ✅/❌ |
| Cashier | Y/N | Y/N | Y/N | ✅/❌ |
| Waiter | Y/N | Y/N | Y/N | ✅/❌ |
| Kitchen | Y/N | Y/N | Y/N | ✅/❌ |

**Expected**: Context persists across all pages

**Pass/Fail**: ______

**Notes**: _______________________________________________

---

## 📊 OVERALL TEST SUMMARY

| Test # | Test Name | Duration | Pass/Fail | Notes |
|--------|-----------|----------|-----------|-------|
| 1 | Script Injection | 10 min | _____ | _____ |
| 2 | Rapid Navigation | 5 min | _____ | _____ |
| 3 | Hard Refresh | 5 min | _____ | _____ |
| 4 | Multi-Tab | 5 min | _____ | _____ |
| 5 | Back/Forward Nav | 3 min | _____ | _____ |
| 6 | Session Expiry | 5 min | _____ | _____ |
| 7 | Network Error | 3 min | _____ | _____ |
| 8 | API Error | 3 min | _____ | _____ |
| 9 | Logging Format | 2 min | _____ | _____ |
| 10 | Operational Context | 3 min | _____ | _____ |
| **TOTAL** | | **44 min** | **___/10** | |

---

---

## 🏭 Production Manual Testing Checklist

**Version**: 1.0  
**Date**: February 2, 2026  
**Tester**: _______________  
**Environment**: [ ] Staging [ ] Production

### ✅ Pre-Testing Setup

- [ ] Backend patches applied (if any)
- [ ] Frontend patches applied
- [ ] `npm run build` completed successfully
- [ ] Cache cleared (`bench clear-cache`)
- [ ] Browser cache cleared (Ctrl+Shift+Delete)
- [ ] Test data available:
  - [ ] POS Profile configured
  - [ ] Branch assigned to POS Profile
  - [ ] Test items (minimum 5)
  - [ ] Test tables (minimum 2)
  - [ ] Test users (Cashier + Waiter roles)

### 🏪 Cashier Console Testing

#### Test Environment
- **URL**: `/app/imogi-cashier`
- **User**: _______________
- **POS Profile**: _______________
- **Branch**: _______________
- **Opening Entry**: _______________

#### TC-C1: Counter Mode - New Order Flow

**Steps:**
1. Navigate to `/app/imogi-cashier`
2. Wait for guard to pass (loading screen)
3. Click "New Order" button
4. Verify catalog view opens
5. Search for item using search box
6. Add 2 different items to order
7. Verify order total updates
8. Click "Pay" button
9. Select "Cash" payment mode
10. Enter amount (equal to total)
11. Click "Submit Payment"
12. Verify payment success message
13. Verify order clears and returns to list

**Expected Results:**
- [ ] Guard passes without errors
- [ ] New order button clickable
- [ ] Catalog loads items successfully
- [ ] Search filters items correctly (with 300ms debounce - NEW)
- [ ] Items add to order instantly
- [ ] Total calculation correct
- [ ] Payment modal opens
- [ ] Payment processes successfully
- [ ] Invoice submitted (check backend)
- [ ] Order appears in history as "Paid"

#### TC-C2: Network Status Indicator (NEW PATCH)

**Steps:**
1. Open Cashier Console
2. Verify no network indicator visible (while online)
3. Disconnect internet (turn off WiFi)
4. Verify "Offline" badge appears
5. Verify toast notification shows
6. Reconnect internet
7. Verify "Reconnected" badge appears briefly
8. Verify badge disappears after 5 seconds

**Expected Results:**
- [ ] No indicator when online
- [ ] "Offline" badge appears on disconnect
- [ ] Toast shows "No internet connection"
- [ ] "Reconnected" badge shows on reconnect
- [ ] Badge auto-hides after 5 seconds

#### TC-C3: Error Handling with Retry (NEW PATCH)

**Steps:**
1. Disconnect internet
2. Try to create new order
3. Verify error banner appears (not alert())
4. Verify "Retry" button visible
5. Reconnect internet
6. Click "Retry" button
7. Verify operation succeeds
8. Click "Dismiss" to close banner

**Expected Results:**
- [ ] Error banner shows (NOT alert())
- [ ] Error message is clear and actionable
- [ ] "Retry" button present
- [ ] Retry button triggers operation again
- [ ] "Dismiss" button closes banner
- [ ] Banner has warning styling (yellow/orange)

#### TC-C4: Keyboard Shortcuts (NEW PATCH)

**Prerequisite:** No input fields focused

**Steps:**
1. Press `/` key
   - [ ] Catalog opens
   - [ ] Search input focused
2. Type search query, press ESC
   - [ ] Catalog closes
3. Select an order, press `F2`
   - [ ] Payment modal opens
4. Press ESC
   - [ ] Payment modal closes
5. Press `F3`
   - [ ] Catalog toggles on/off
6. Press `Ctrl+N` (or `Cmd+N` on Mac)
   - [ ] New order dialog/action triggered

**Expected Results:**
- [ ] All shortcuts work as documented
- [ ] Shortcuts don't trigger when typing in input fields
- [ ] ESC key closes modals properly
- [ ] Keyboard hint button visible in header (NEW)
- [ ] Clicking hint shows shortcut list

#### TC-C5: Skeleton Loaders (NEW PATCH)

**Steps:**
1. Open Cashier Console (slow 3G or throttled network)
2. Observe order list loading
3. Open catalog view
4. Observe catalog loading

**Expected Results:**
- [ ] Skeleton cards show during order list load
- [ ] Skeleton grid shows during catalog load
- [ ] Skeletons have animated shimmer effect
- [ ] Skeletons replaced by real data on load
- [ ] No blank white areas during loading

#### TC-C6: Table Mode - Claim and Settle

**Steps:**
1. Switch to Table mode (if POS Profile supports)
2. View orders with "Bill Requested" flag
3. Select an order
4. Click "Claim" button
5. Verify claim success
6. Click "Pay" button
7. Process payment
8. Verify table released

**Expected Results:**
- [ ] Requested bills visible in list
- [ ] Claim button clickable
- [ ] Claim succeeds (order locked to current user)
- [ ] Payment processes successfully
- [ ] Table status updated to "Available"
- [ ] Order disappears from active list

#### TC-C7: Split Bill (Optional)

**Steps:**
1. Select an order with multiple items
2. Click "Split Bill"
3. Move some items to Split 2
4. Process payment for Split 1
5. Process payment for Split 2

**Expected Results:**
- [ ] Items can be assigned to split groups
- [ ] Each split total correct
- [ ] Payments processed separately
- [ ] Order closes after all splits paid

### 🧑‍🍳 Waiter Order Testing

#### Test Environment
- **URL**: `/app/imogi-waiter`
- **User**: _______________
- **POS Profile**: _______________
- **Branch**: _______________

#### TC-W1: Create Table Order

**Steps:**
1. Open `/app/imogi-waiter`
2. Select a table
3. Add items to cart
4. Submit order
5. Verify order created

**Expected Results:**
- [ ] Table loads with correct status
- [ ] Items added to cart
- [ ] Order submitted successfully
- [ ] Table status changes to "Occupied"

#### TC-W2: Request Bill

**Steps:**
1. Open active table with order
2. Click "Request Bill"
3. Confirm request
4. Verify request sent

**Expected Results:**
- [ ] Request bill button visible
- [ ] Confirmation modal appears
- [ ] Request sent successfully
- [ ] Table shows "Bill Requested" state

#### TC-W3: Send to Kitchen

**Steps:**
1. Add items to order
2. Click "Send to Kitchen"
3. Verify KOT created

**Expected Results:**
- [ ] KOT created in backend
- [ ] KDS receives ticket
- [ ] Order workflow state updates

### 🍽️ Kitchen Display Testing

#### Test Environment
- **URL**: `/app/imogi-kitchen`
- **User**: _______________

#### TC-K1: KOT Lifecycle

**Steps:**
1. Open kitchen display
2. Verify new KOT appears
3. Click "Start" → status changes to In Progress
4. Click "Ready" → status changes to Ready
5. Click "Serve" → status changes to Served

**Expected Results:**
- [ ] KOT appears in queue
- [ ] Status updates realtime
- [ ] KOT disappears after Served

---

## ✅ SIGN-OFF

**All Tests Passed**: □ Yes  □ No (__ failures)

**Ready for Production**: □ Yes  □ No

**Tester Signature**: _____________  **Date**: _____________

**Reviewer Signature**: _____________  **Date**: _____________

---

## 🐛 Issues Found

List any issues discovered during testing:

1. _____________________________________________
2. _____________________________________________
3. _____________________________________________

---

## 📋 Next Steps

If all tests passed:
- [ ] Merge cleanup branch to main
- [ ] Deploy to staging environment
- [ ] Perform full staging tests with real data
- [ ] Schedule production deployment

If tests failed:
- [ ] Document failures in GitHub issues
- [ ] Investigate root cause
- [ ] Fix issues
- [ ] Re-run failed tests
- [ ] Update this checklist with results

---

**Reference**: See [FINALIZATION_ARCHIVE.md](FINALIZATION_ARCHIVE.md) for the consolidated implementation guide.
