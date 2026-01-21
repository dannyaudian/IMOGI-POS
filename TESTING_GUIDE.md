# IMOGI POS - Testing Guide for New Architecture

**Date:** January 21, 2026  
**Version:** 1.0  
**Purpose:** Testing guide for the architecture reorganization

---

## Pre-Testing Setup

### 1. Run Migration Script

```bash
# Navigate to bench directory
cd ~/frappe-bench  # or your bench directory

# Run the migration
bench --site [your-site-name] migrate

# Clear cache
bench --site [your-site-name] clear-cache
bench --site [your-site-name] clear-website-cache

# Restart server (if needed)
bench restart
```

### 2. Verify Migration Success

Check the console output for:
- ✓ Updated user default redirects
- ✓ Updated Customer Display Devices
- ✓ Updated Kiosk Devices
- ✓ Updated Workspaces
- ✓ Cache cleared

---

## Testing Checklist

### A. URL Redirects (Backward Compatibility)

Test that old URLs automatically redirect to new URLs:

| Old URL | New URL | Status |
|---------|---------|--------|
| `/create-order` | `/restaurant/waiter` | ⬜ |
| `/waiter_order` | `/restaurant/waiter` | ⬜ |
| `/kiosk` | `/restaurant/waiter?mode=kiosk` | ⬜ |
| `/cashier-console` | `/counter/pos` | ⬜ |
| `/customer-display` | `/devices/displays` | ⬜ |
| `/kitchen_display` | `/restaurant/kitchen` | ⬜ |
| `/table_display` | `/restaurant/tables` | ⬜ |
| `/imogi-login` | `/shared/login` | ⬜ |
| `/so` | `/restaurant/self-order` | ⬜ |

**How to test:**
1. Open browser
2. Go to `http://your-site/create-order` (or other old URL)
3. Verify it redirects to the new URL
4. Check that the page loads correctly

---

### B. Authentication & Authorization

#### B.1 Login System

**Login Page** (`/shared/login`)
- ⬜ Login form displays correctly
- ⬜ Can login with valid credentials
- ⬜ Invalid credentials show error
- ⬜ After login, redirects based on role:
  - System Manager → Default workspace
  - Restaurant Manager → `/restaurant/waiter` or custom
  - Cashier → `/counter/pos`
  - Waiter → `/restaurant/waiter`
  - Kitchen Staff → `/restaurant/kitchen`

#### B.2 Role-Based Access Control

Test each page with different roles:

**Kitchen Display** (`/restaurant/kitchen`)
| Role | Expected Behavior | Status |
|------|-------------------|--------|
| Kitchen Staff | ✓ Access granted | ⬜ |
| Restaurant Manager | ✓ Access granted | ⬜ |
| System Manager | ✓ Access granted | ⬜ |
| Cashier | ✗ Redirect to login | ⬜ |
| Waiter | ✗ Redirect to login | ⬜ |
| Guest | ✗ Redirect to login | ⬜ |

**Table Display** (`/restaurant/tables`)
| Role | Expected Behavior | Status |
|------|-------------------|--------|
| Waiter | ✓ Access granted | ⬜ |
| Restaurant Manager | ✓ Access granted | ⬜ |
| System Manager | ✓ Access granted | ⬜ |
| Kitchen Staff | ✗ Redirect to login | ⬜ |
| Cashier | ✗ Redirect to login | ⬜ |
| Guest | ✗ Redirect to login | ⬜ |

**Counter POS** (`/counter/pos`)
| Role | Expected Behavior | Status |
|------|-------------------|--------|
| Cashier | ✓ Access granted | ⬜ |
| Restaurant Manager | ✓ Access granted | ⬜ |
| System Manager | ✓ Access granted | ⬜ |
| Waiter | ✗ Redirect to login | ⬜ |
| Kitchen Staff | ✗ Redirect to login | ⬜ |
| Guest | ✗ Redirect to login | ⬜ |

**Waiter POS** (`/restaurant/waiter`)
| Role | Expected Behavior | Status |
|------|-------------------|--------|
| Waiter | ✓ Access granted | ⬜ |
| Restaurant Manager | ✓ Access granted | ⬜ |
| System Manager | ✓ Access granted | ⬜ |
| Guest (if enabled) | ✓ Access granted | ⬜ |
| Cashier | Check settings | ⬜ |

**Self-Order** (`/restaurant/self-order`)
| Role | Expected Behavior | Status |
|------|-------------------|--------|
| Guest | ✓ Access granted (with token) | ⬜ |
| Any logged-in user | ✓ Access granted | ⬜ |

---

### C. Mode Detection (Waiter POS)

**Test Waiter Mode:**
1. ⬜ Navigate to `/restaurant/waiter`
2. ⬜ Check browser console: `console.log(MODE)` → should show `"waiter"`
3. ⬜ UI shows waiter-specific features (table selection, etc.)

**Test Kiosk Mode:**
1. ⬜ Navigate to `/restaurant/waiter?mode=kiosk`
2. ⬜ Check browser console: `console.log(MODE)` → should show `"kiosk"`
3. ⬜ UI shows kiosk-specific features (simplified, guest-friendly)

---

### D. Role-Based UI Components

#### D.1 Customer Display Admin Panel

**As Guest:**
1. ⬜ Navigate to `/devices/displays`
2. ⬜ Admin toggle button (⚙️) is hidden
3. ⬜ Admin panel is hidden
4. ⬜ Only customer display is visible

**As Restaurant Manager:**
1. ⬜ Navigate to `/devices/displays`
2. ⬜ Admin toggle button (⚙️) is visible (top-right corner)
3. ⬜ Click admin toggle → admin panel slides in from right
4. ⬜ Admin panel shows:
   - Current device info
   - Device selector dropdown
   - Test controls (Send Test Order, Clear Display)
   - Device actions (Unpair, Refresh)
5. ⬜ Device selector loads available devices
6. ⬜ Click "Switch Device" → changes device and reloads
7. ⬜ Click "Send Test Order" → test order appears on display
8. ⬜ Click "Clear Display" → display clears
9. ⬜ Click "Unpair Device" → confirmation → device unpaired
10. ⬜ Click "Close" → admin panel closes

**As System Manager:**
- Same tests as Restaurant Manager

---

### E. Page-Specific Testing

#### E.1 Kitchen Display (`/restaurant/kitchen`)
- ⬜ Page loads without errors
- ⬜ Branding colors applied correctly
- ⬜ Orders display in real-time
- ⬜ Can mark orders as ready
- ⬜ SLA timer works correctly
- ⬜ Sound alerts work (if enabled)

#### E.2 Table Display (`/restaurant/tables`)
- ⬜ Page loads without errors
- ⬜ Table layout displays correctly
- ⬜ Table status updates in real-time
- ⬜ Can select tables
- ⬜ Table colors indicate status (available/occupied/reserved)

#### E.3 Counter POS (`/counter/pos`)
- ⬜ Page loads without errors
- ⬜ POS Session validation works (if enabled)
- ⬜ Can create new orders
- ⬜ Can process payments
- ⬜ Can print receipts
- ⬜ Branch information displayed correctly

#### E.4 Waiter POS (`/restaurant/waiter`)
- ⬜ Page loads without errors
- ⬜ Can browse menu items
- ⬜ Can add items to cart
- ⬜ Can modify quantities
- ⬜ Can add notes (if enabled)
- ⬜ Can apply discounts (if enabled)
- ⬜ Can select tables
- ⬜ Can submit orders to kitchen
- ⬜ Queue number generation works

#### E.5 Customer Display (`/devices/displays`)
- ⬜ Page loads without errors
- ⬜ Device registration flow works
- ⬜ Branding displays correctly
- ⬜ Order details update in real-time
- ⬜ Total amount displays correctly
- ⬜ Ticker message scrolls (if configured)
- ⬜ Promotional content displays (if configured)

#### E.6 Self-Order (`/restaurant/self-order`)
- ⬜ Page loads with valid token
- ⬜ Shows error with invalid token
- ⬜ Can browse menu
- ⬜ Can add items to cart
- ⬜ Can submit orders
- ⬜ Session expiry handled correctly

---

### F. JavaScript Console Checks

Open browser DevTools Console (F12) and check for:

**No JavaScript Errors:**
- ⬜ Kitchen Display
- ⬜ Table Display
- ⬜ Counter POS
- ⬜ Waiter POS
- ⬜ Customer Display
- ⬜ Self-Order

**RoleUI Available:**
In console, type: `RoleUI`
- ⬜ Should return the RoleUI object (not undefined)

**Check Current User Roles:**
In console, type: `frappe.user_roles`
- ⬜ Should show array of roles for current user

---

### G. Browser Compatibility

Test on multiple browsers:

| Browser | Desktop | Mobile | Status |
|---------|---------|--------|--------|
| Chrome | ⬜ | ⬜ | |
| Firefox | ⬜ | ⬜ | |
| Safari | ⬜ | ⬜ | |
| Edge | ⬜ | ⬜ | |

---

### H. Performance Testing

- ⬜ Page load time < 3 seconds
- ⬜ Real-time updates work smoothly
- ⬜ No memory leaks (check DevTools Memory tab)
- ⬜ No excessive network requests
- ⬜ Images and assets load correctly

---

## Common Issues & Solutions

### Issue: Old URLs not redirecting

**Solution:**
```bash
bench --site [site-name] clear-cache
bench --site [site-name] clear-website-cache
bench restart
```

### Issue: Role-based access not working

**Solution:**
1. Check user has correct roles assigned
2. Check POS Profile is assigned to user
3. Clear browser cache and cookies
4. Check browser console for errors

### Issue: Admin panel not showing

**Solution:**
1. Verify role-ui.js is loaded (check Network tab)
2. Check user has Restaurant Manager or System Manager role
3. Check browser console for JavaScript errors
4. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Issue: Mode detection not working

**Solution:**
1. Check URL includes `?mode=kiosk` parameter
2. Check browser console: `console.log(MODE)`
3. Clear browser cache
4. Check index.py context includes `mode` variable

### Issue: Migration fails

**Solution:**
1. Check patches.txt includes migration patch
2. Check migration script syntax
3. Run: `bench --site [site-name] migrate --skip-failing`
4. Check error logs: `tail -f logs/[site-name]-error.log`

---

## Reporting Issues

When reporting issues, include:

1. **URL** being tested
2. **User role** being used
3. **Browser** and version
4. **Steps to reproduce**
5. **Expected behavior**
6. **Actual behavior**
7. **Screenshots** (if applicable)
8. **Console errors** (F12 → Console tab)
9. **Network errors** (F12 → Network tab)

---

## Success Criteria

✅ All URL redirects working
✅ All role-based access controls working
✅ All pages load without JavaScript errors
✅ Mode detection working in waiter POS
✅ Admin panel working in displays page
✅ No regression in existing functionality
✅ Performance acceptable (< 3s page load)

---

**Last Updated:** January 21, 2026  
**Tested By:** _____________  
**Date Tested:** _____________  
**Result:** ⬜ PASS  ⬜ FAIL (with notes)
