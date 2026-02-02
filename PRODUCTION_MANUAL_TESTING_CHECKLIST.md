# PRODUCTION MANUAL TESTING CHECKLIST
**Version**: 1.0
**Date**: February 2, 2026
**Tester**: _______________
**Environment**: [ ] Staging [ ] Production

---

## ✅ PRE-TESTING SETUP

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

---

## 🏪 CASHIER CONSOLE TESTING

### Test Environment
- **URL**: `/app/imogi-cashier`
- **User**: _______________
- **POS Profile**: _______________
- **Branch**: _______________
- **Opening Entry**: _______________

---

### TC-C1: Counter Mode - New Order Flow

#### Steps:
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

#### Expected Results:
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

#### Issues Found:
```
(Note any issues here)
```

---

### TC-C2: Network Status Indicator (NEW PATCH)

#### Steps:
1. Open Cashier Console
2. Verify no network indicator visible (while online)
3. Disconnect internet (turn off WiFi)
4. Verify "Offline" badge appears
5. Verify toast notification shows
6. Reconnect internet
7. Verify "Reconnected" badge appears briefly
8. Verify badge disappears after 5 seconds

#### Expected Results:
- [ ] No indicator when online
- [ ] "Offline" badge appears on disconnect
- [ ] Toast shows "No internet connection"
- [ ] "Reconnected" badge shows on reconnect
- [ ] Badge auto-hides after 5 seconds

#### Issues Found:
```
(Note any issues here)
```

---

### TC-C3: Error Handling with Retry (NEW PATCH)

#### Steps:
1. Disconnect internet
2. Try to create new order
3. Verify error banner appears (not alert())
4. Verify "Retry" button visible
5. Reconnect internet
6. Click "Retry" button
7. Verify operation succeeds
8. Click "Dismiss" to close banner

#### Expected Results:
- [ ] Error banner shows (NOT alert())
- [ ] Error message is clear and actionable
- [ ] "Retry" button present
- [ ] Retry button triggers operation again
- [ ] "Dismiss" button closes banner
- [ ] Banner has warning styling (yellow/orange)

#### Issues Found:
```
(Note any issues here)
```

---

### TC-C4: Keyboard Shortcuts (NEW PATCH)

#### Prerequisite: No input fields focused

#### Steps:
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

#### Expected Results:
- [ ] All shortcuts work as documented
- [ ] Shortcuts don't trigger when typing in input fields
- [ ] ESC key closes modals properly
- [ ] Keyboard hint button visible in header (NEW)
- [ ] Clicking hint shows shortcut list

#### Issues Found:
```
(Note any issues here)
```

---

### TC-C5: Skeleton Loaders (NEW PATCH)

#### Steps:
1. Open Cashier Console (slow 3G or throttled network)
2. Observe order list loading
3. Open catalog view
4. Observe catalog loading

#### Expected Results:
- [ ] Skeleton cards show during order list load
- [ ] Skeleton grid shows during catalog load
- [ ] Skeletons have animated shimmer effect
- [ ] Skeletons replaced by real data on load
- [ ] No blank white areas during loading

#### Issues Found:
```
(Note any issues here)
```

---

### TC-C6: Table Mode - Claim and Settle

#### Steps:
1. Switch to Table mode (if POS Profile supports)
2. View orders with "Bill Requested" flag
3. Select an order
4. Click "Claim" button
5. Verify claim success
6. Click "Pay" button
7. Process payment
8. Verify table released

#### Expected Results:
- [ ] Requested bills visible in list
- [ ] Claim button clickable
- [ ] Claim succeeds (order locked to current user)
- [ ] Payment processes successfully
- [ ] Table status updated to "Available"
- [ ] Order disappears from active list

#### Issues Found:
```
(Note any issues here)
```

---

## 🍽️ WAITER CONSOLE TESTING

### Test Environment
- **URL**: `/app/imogi-waiter`
- **User**: _______________
- **POS Profile**: _______________
- **Branch**: _______________

---

### TC-W1: Table Selection and Order Creation

#### Steps:
1. Navigate to `/app/imogi-waiter`
2. Verify table layout loads
3. Select an available table (green/white)
4. Verify menu catalog loads
5. Search for item
6. Add 3 items to cart
7. Update quantity of one item
8. Add notes to one item
9. Verify cart summary correct
10. Click "Send to Kitchen"
11. Verify success message
12. Verify table status changes to "Occupied"

#### Expected Results:
- [ ] Tables load with correct statuses
- [ ] Available tables clickable
- [ ] Menu catalog loads all items
- [ ] Search works with debounce (NEW - 300ms delay)
- [ ] Items add to cart instantly
- [ ] Quantity stepper works
- [ ] Notes field saves
- [ ] Cart total calculates correctly
- [ ] "Send to Kitchen" button enabled when cart has items
- [ ] Success toast/message shows
- [ ] Table shows as "Occupied" after order

#### Issues Found:
```
(Note any issues here)
```

---

### TC-W2: Send to Kitchen (KOT Creation)

#### Steps:
1. Create order with items (from TC-W1)
2. Click "Send to Kitchen"
3. Wait for success confirmation
4. Check Kitchen Console (if available)
5. Verify KOT ticket appears
6. In backend, verify:
   - [ ] POS Order created
   - [ ] KOT Ticket(s) created
   - [ ] workflow_state = "Sent to Kitchen"

#### Expected Results:
- [ ] "Send to Kitchen" button clickable
- [ ] Button disabled during loading (no double-tap)
- [ ] Success message shows
- [ ] KOT appears in Kitchen Console
- [ ] Items grouped by station correctly
- [ ] No errors in Error Log

#### Issues Found:
```
(Note any issues here)
```

---

### TC-W3: Request Bill

#### Steps:
1. Select a table with sent order
2. View order details
3. Click "Request Bill" button
4. Verify success message
5. Check Cashier Console
6. Verify order appears in "Requested Bills"

#### Expected Results:
- [ ] "Request Bill" button visible for sent orders
- [ ] Button clickable
- [ ] Success toast shows
- [ ] Order marked with `request_payment=1`
- [ ] Order visible in Cashier Console "Requested Bills"
- [ ] No errors in Error Log

#### Issues Found:
```
(Note any issues here)
```

---

### TC-W4: Touch Ergonomics (NEW PATCH)

#### Prerequisite: Use mobile device or Chrome DevTools mobile emulation

#### Steps:
1. Open Waiter Console on mobile
2. Test table card tap targets
3. Test menu item card tap targets
4. Test cart stepper buttons (+/-)
5. Test category tabs
6. Test "Send to Kitchen" button

#### Expected Results:
- [ ] All tap targets minimum 44×44px
- [ ] No accidental double-taps
- [ ] touch-action: manipulation prevents zoom
- [ ] Buttons feel responsive
- [ ] No layout shifts on tap

#### Issues Found:
```
(Note any issues here)
```

---

### TC-W5: Fixed Bottom Action Bar (NEW PATCH)

#### Steps:
1. Add items to cart (more than fits on screen)
2. Scroll down the page
3. Verify action bar stays fixed at bottom
4. Verify "Send to Kitchen" button always visible
5. Tap button without scrolling up

#### Expected Results:
- [ ] Action bar fixed to bottom viewport
- [ ] Bar doesn't scroll with page
- [ ] Button always accessible
- [ ] Main content has bottom padding (not hidden by bar)
- [ ] Button shows item count badge

#### Issues Found:
```
(Note any issues here)
```

---

### TC-W6: Network Status Indicator (NEW PATCH)

Same test as TC-C2, but in Waiter context.

#### Expected Results:
- [ ] Same behavior as Cashier Console
- [ ] Offline badge appears on disconnect
- [ ] Reconnect badge shows on reconnect

#### Issues Found:
```
(Note any issues here)
```

---

## 🔄 END-TO-END INTEGRATION TESTING

### TC-E1: Full Restaurant Flow (Waiter → Cashier)

#### Steps:
1. **Waiter**: Select table, add items, send to kitchen
2. **Kitchen**: Verify KOT received, mark as "Preparing"
3. **Waiter**: Request bill for the table
4. **Cashier**: View requested bills, claim order
5. **Cashier**: Process payment (cash)
6. Verify table released
7. Verify invoice submitted

#### Expected Results:
- [ ] Order flows from Waiter → Kitchen → Cashier seamlessly
- [ ] No permission errors at any step
- [ ] Claimed order locked to cashier
- [ ] Payment processes successfully
- [ ] Table status updated to "Available"
- [ ] Invoice docstatus = 1 (Submitted)
- [ ] No errors in Error Log

#### Issues Found:
```
(Note any issues here)
```

---

### TC-E2: Concurrent Claim Protection

#### Prerequisite: 2 users with Cashier role

#### Steps:
1. **Waiter**: Create order and request bill
2. **Cashier 1**: Claim the order (should succeed)
3. **Cashier 2**: Try to claim same order (should fail)
4. Verify error message shown to Cashier 2
5. **Cashier 1**: Complete payment
6. Verify order no longer visible to Cashier 2

#### Expected Results:
- [ ] Cashier 1 claims successfully
- [ ] Cashier 2 sees "Order claimed by {user}" error
- [ ] No double claim possible
- [ ] Clear error message shown
- [ ] Order disappears after payment

#### Issues Found:
```
(Note any issues here)
```

---

## 🚨 ERROR LOG VERIFICATION

### SQL Query to Run:
```sql
SELECT 
    creation,
    error,
    method,
    LEFT(error, 200) as error_preview
FROM 
    `tabError Log`
WHERE 
    creation >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    AND (
        error LIKE '%POS Order%'
        OR error LIKE '%Waiter Order Error%'
        OR error LIKE '%send_to_kitchen%'
        OR error LIKE '%process_payment%'
        OR error LIKE '%request_bill%'
    )
ORDER BY 
    creation DESC
LIMIT 50;
```

### Verification:
- [ ] No critical errors in last 24 hours
- [ ] All logged errors have proper context
- [ ] No "silent failures" (operations that fail without logging)
- [ ] Error messages are actionable

### Errors Found:
```
(List any errors found)
```

---

## 🏁 PERFORMANCE VERIFICATION

### Catalog Load Time
- [ ] Catalog loads in < 2 seconds (first load)
- [ ] Catalog loads in < 1 second (cached)
- [ ] Search results appear within 300ms (debounced)
- [ ] No lag when typing in search

### Order Operations
- [ ] Create order: < 1 second
- [ ] Add item: < 500ms
- [ ] Update quantity: Instant (< 100ms)
- [ ] Process payment: < 2 seconds
- [ ] Send to kitchen: < 2 seconds

### Pass/Fail:
- [ ] All operations meet performance targets
- [ ] No noticeable lag or freezing

### Issues Found:
```
(Note any performance issues)
```

---

## 🎨 UX/UI VERIFICATION

### Visual Consistency
- [ ] Colors match design system
- [ ] Typography consistent
- [ ] Spacing consistent
- [ ] Icons aligned properly
- [ ] No layout shifts during loading

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Color contrast sufficient (WCAG AA)
- [ ] Touch targets 44×44px minimum (mobile)
- [ ] Error messages readable

### Mobile Responsiveness
- [ ] Layout adapts to mobile screen
- [ ] Touch targets appropriately sized
- [ ] No horizontal scrolling
- [ ] Fixed action bar works correctly
- [ ] Network indicator visible

### Pass/Fail:
- [ ] All UX/UI checks passed

### Issues Found:
```
(Note any UX/UI issues)
```

---

## 📊 TESTING SUMMARY

### Statistics
- **Test Cases Run**: _____ / 15
- **Test Cases Passed**: _____
- **Test Cases Failed**: _____
- **Critical Issues**: _____
- **Minor Issues**: _____

### Critical Issues (Blockers):
```
1. 
2. 
3. 
```

### Minor Issues (Non-blockers):
```
1. 
2. 
3. 
```

### Overall Assessment:
- [ ] ✅ READY FOR PRODUCTION - All critical tests passed
- [ ] ⚠️  READY WITH MINOR ISSUES - Document and monitor
- [ ] ❌ NOT READY - Critical issues must be fixed

### Tester Sign-off:
**Name**: _______________
**Date**: _______________
**Signature**: _______________

### Reviewer Sign-off:
**Name**: _______________
**Date**: _______________
**Signature**: _______________

---

## 📝 NOTES & OBSERVATIONS

```
(Add any additional observations, suggestions, or context here)
```

---

**End of Checklist**
