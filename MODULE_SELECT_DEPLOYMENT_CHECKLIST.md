# Module Select UI - Production Deployment Checklist

## 🎯 Pre-Deployment Verification

### 1. Build & Compile
- [x] `npm run build:module-select` - No errors ✅
- [x] No CSS syntax warnings ✅
- [x] Bundle size acceptable (305KB JS, 31KB CSS) ✅

### 2. Code Quality Checks
- [x] System Manager bypass implemented ✅
- [x] Safe defaults for `has_access` / `is_active` ✅
- [x] Click disabled on inaccessible modules ✅
- [x] Responsive breakpoints (3/2/1 columns) ✅
- [x] Debug logging for role visibility ✅

### 3. Files Changed (Review Before Commit)
```
✅ NEW FILES:
- src/apps/module-select/utils/moduleRules.js
- src/apps/module-select/utils/moduleUtils.js

✅ MODIFIED FILES:
- src/apps/module-select/components/ModuleCard.jsx
- src/apps/module-select/App.jsx
- src/apps/module-select/styles.css

✅ DOCUMENTATION:
- MODULE_SELECT_UI_REFINEMENT.md
```

---

## ⚠️ Critical Pre-Deploy Tasks

### Backend Security (MUST DO)

#### Task 1: Review `get_available_modules` API
**File**: `imogi_pos/api/module_select.py`

```python
# ⚠️ VERIFY: Does API enforce role-based permissions?
@frappe.whitelist()
def get_available_modules():
    # TODO: Add server-side role filtering
    # Current: Returns all modules to frontend
    # Risk: User can see all modules in network tab
    
    # Suggested implementation:
    user_roles = frappe.get_roles(frappe.session.user)
    modules = []
    
    if 'Cashier' in user_roles:
        modules.append(get_cashier_module())
    
    if 'Kitchen Staff' in user_roles:
        modules.append(get_kitchen_module())
    
    # etc...
    return modules
```

**Action Required**: 
- [ ] Review current implementation
- [ ] Add server-side role filtering (if not present)
- [ ] Test with non-privileged user accounts

#### Task 2: Add Route Guards to Each Module

Check these files:
```
imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js
imogi_pos/imogi_pos/page/imogi_kitchen/imogi_kitchen.js
imogi_pos/imogi_pos/page/imogi_waiter/imogi_waiter.js
```

**Verify each has permission check**:
```js
frappe.pages['imogi-cashier'].on_page_load = function(wrapper) {
  // ⚠️ ADD THIS if not present:
  if (!frappe.user.has_role(['Cashier', 'System Manager'])) {
    frappe.msgprint('Access Denied');
    frappe.set_route('imogi-module-select');
    return;
  }
  
  // ... rest of page load
}
```

**Action Required**:
- [ ] Cashier module route guard
- [ ] Kitchen module route guard
- [ ] Waiter module route guard
- [ ] Other modules route guards

#### Task 3: Test Direct URL Access

**Test scenarios**:
```bash
# Test as non-privileged user (e.g., Waiter role only)
1. Login as waiter_user@example.com
2. Try direct URL: /app/imogi-cashier
   Expected: Redirect or access denied
   
3. Try direct URL: /app/imogi-kitchen
   Expected: Redirect or access denied
   
4. Try direct URL: /app/imogi-waiter
   Expected: Success (allowed)
```

**Action Required**:
- [ ] Test direct URL access for each module
- [ ] Verify redirect to module-select works
- [ ] Verify error messages are user-friendly

---

## 🧪 Testing Checklist

### Functional Testing

#### Test Case 1: Role Filtering
```
User: cashier_user@example.com
Roles: ['Cashier']

Expected visible modules:
✅ Cashier Console (Primary)
✅ Customer Display (Tertiary)
❌ Kitchen Display (hidden)
❌ Waiter Order (hidden)
```

**Steps**:
1. Login as cashier
2. Navigate to /app/imogi-module-select
3. Count visible module cards
4. Verify only cashier-relevant modules shown

#### Test Case 2: System Manager Bypass
```
User: administrator@example.com
Roles: ['System Manager']

Expected: All modules visible (bypass all rules)
```

**Steps**:
1. Login as System Manager
2. Navigate to /app/imogi-module-select
3. Verify ALL modules are visible
4. Verify no modules filtered out

#### Test Case 3: Smart Badges
```
Scenario A: Module requires opening + opening active
Expected: Badge "Session Active" (green)

Scenario B: Module requires opening + no active opening
Expected: Badge "Requires Opening" (warning yellow)

Scenario C: Module without constraints
Expected: No badge (clean)
```

**Steps**:
1. Navigate to module-select
2. Verify "Always Available" badge NOT shown
3. Open POS session
4. Verify badge changes to "Session Active"

#### Test Case 4: Disabled Module Click
```
Scenario: Module requires opening + no active opening
Expected: Card is visually disabled + click does nothing
```

**Steps**:
1. Ensure no POS opening active
2. Try clicking "Cashier Console" (requires opening)
3. Verify click is blocked
4. Verify tooltip shows "Please open a POS opening first"

### Visual/UX Testing

#### Test Case 5: Priority Hierarchy
```
Expected visual hierarchy:
1. Primary modules: Subtle blue border + light shadow
2. Secondary modules: Standard grey border
3. Tertiary modules: Lighter grey border
```

**Steps**:
1. Navigate to module-select
2. Visually verify Cashier/Waiter have blue border
3. Verify Kitchen has standard border
4. Verify others have lighter border

#### Test Case 6: Responsive Layout
**Desktop (1920x1080)**:
- [ ] Grid shows 3 columns
- [ ] Cards are properly sized
- [ ] No overflow or truncation

**Tablet (768x1024)**:
- [ ] Grid shows 2 columns
- [ ] Cards adapt to tablet size
- [ ] Touch targets are adequate

**Mobile (375x667)**:
- [ ] Grid shows 1 column
- [ ] Full-width cards
- [ ] Scrolling works smoothly

### Debug Logging Test

#### Test Case 7: Enable Debug Mode
```bash
# In Frappe Desk
1. Go to System Settings
2. Add custom field: imogi_pos_debug_realtime = 1
3. Refresh module-select page
4. Open browser console (F12)
```

**Expected console output**:
```
[Module Select] User roles loaded: {
  user: "c***r@example.com",
  roles: ["Cashier", "Guest"],
  has_system_manager: false,
  has_administrator: false
}

[Module Select] Module filtering: {
  total_modules: 6,
  visible_modules: 2,
  filtered_out: 4,
  user_roles: ["Cashier", "Guest"]
}
```

**Action Required**:
- [ ] Enable debug mode
- [ ] Verify logs show correct roles
- [ ] Verify filtering count is correct
- [ ] Take screenshot for documentation

---

## 🚀 Deployment Steps

### Step 1: Commit Changes
```bash
cd /Users/dannyaudian/github/IMOGI-POS

git add src/apps/module-select/utils/
git add src/apps/module-select/components/ModuleCard.jsx
git add src/apps/module-select/App.jsx
git add src/apps/module-select/styles.css
git add MODULE_SELECT_UI_REFINEMENT.md

git commit -m "feat: Module Select UI refinement - hierarchy, smart badges, role-based filtering

- Add priority system (primary/secondary/tertiary) with subtle visual styling
- Implement smart badges (only show when constraints exist)
- Add role-based module filtering with System Manager bypass
- Improve responsive design (3/2/1 column grid)
- Add debug logging for role visibility diagnostics
- Safe defaults for has_access/is_active checks
- Ensure disabled modules are not clickable

Ref: MODULE_SELECT_UI_REFINEMENT.md"
```

### Step 2: Build for Production
```bash
npm run build
# Verify all apps build successfully
```

### Step 3: Deploy to Server
```bash
# Push to your git remote
git push origin main

# Or deploy via Frappe Cloud / your deployment method
bench --site your-site migrate
bench --site your-site clear-cache
bench --site your-site build
```

### Step 4: Post-Deployment Verification
- [ ] Login to production site
- [ ] Navigate to /app/imogi-module-select
- [ ] Verify UI loads correctly
- [ ] Test with different user roles
- [ ] Check browser console for errors
- [ ] Verify responsive layout on tablet

---

## 📊 Rollback Plan

If issues occur:

### Quick Rollback (Frontend Only)
```bash
git revert HEAD
npm run build
bench --site your-site build
```

### Full Rollback (With Git)
```bash
git log --oneline  # Find commit hash before changes
git reset --hard <commit-hash>
git push origin main --force  # If already pushed
npm run build
```

### Emergency Disable
If build fails, temporarily disable module-select:
```python
# In imogi_pos/hooks.py
# Comment out module-select page registration
```

---

## 📝 Post-Deployment Notes

### Success Metrics
After 24-48 hours, verify:
- [ ] No user complaints about "missing modules"
- [ ] No console errors reported
- [ ] Performance metrics stable
- [ ] User feedback on improved UI

### Known Limitations
1. **Frontend filtering only** - Backend must enforce security
2. **Role names must match exactly** - Case-sensitive
3. **Debug logs visible in production** - Disable after testing

### Future Enhancements
- Section grouping (Primary / Other Modules)
- Backend API role filtering
- Module icons per priority
- User preferences for module order

---

## ✅ Sign-Off

**Deployed by**: _________________  
**Date**: _________________  
**Tested by**: _________________  
**Backend security verified**: [ ] Yes [ ] No  
**Ready for production**: [ ] Yes [ ] No

**Notes**:
_________________________________________________________________
_________________________________________________________________
