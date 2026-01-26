# IMOGI POS - Branch Configuration Fix

## 🎯 Issue Summary

**Problem**: System Manager users getting "No branch configured for your account" error when accessing Module Select, even though they have all permissions.

**Root Cause**: Backend `get_user_branch_info()` was **only checking custom field** `imogi_default_branch` on User doctype, but **NOT checking User Defaults** (the standard ERPNext way of setting defaults via User → Defaults tab).

## ✅ What Was Fixed

### 1. Backend API Patch (`imogi_pos/api/module_select.py`)

Added **3-tier fallback logic** for branch resolution:

```python
# Priority 1: Custom field imogi_default_branch
if frappe.db.has_column('User', 'imogi_default_branch'):
    current_branch = frappe.db.get_value('User', user, 'imogi_default_branch')

# Priority 2: User Defaults (set via User → Defaults tab) ← NEW!
if not current_branch:
    current_branch = frappe.defaults.get_user_default("branch")

# Priority 3: Global default branch ← NEW!
if not current_branch:
    current_branch = frappe.defaults.get_global_default("branch")
```

**Before**: Only checked custom field → failed if not set
**After**: Checks 3 sources → works with standard ERPNext User Defaults

### 2. Enhanced Error Messages

Added detailed debug info when branch resolution fails:

```python
debug_info = {
    'user': user,
    'has_imogi_field': frappe.db.has_column('User', 'imogi_default_branch'),
    'imogi_value': frappe.db.get_value('User', user, 'imogi_default_branch'),
    'user_default': frappe.defaults.get_user_default("branch"),
    'global_default': frappe.defaults.get_global_default("branch"),
    'available_count': len(available_branches)
}
```

Error message now shows:
- ✅ What sources were checked
- ✅ Which values were found (or not found)
- ✅ Clear instructions to fix

### 3. Frontend Script Fixes

#### `permission-manager.js`
- Fixed `frappe.ready is not a function` error
- Added proper Desk context initialization
- Works in both Desk and web page contexts

#### `workspace_shortcuts.js`
- Added safety check to prevent "page null" errors
- Only prevents default when valid www page URL is found
- Logs warnings when URL cannot be resolved

### 4. Verification Tool

Created **`tests/browser_branch_setup_test.js`** - comprehensive browser console test that checks:
- ✅ User authentication
- ✅ User roles
- ✅ Branch DocType accessibility
- ✅ Available branches
- ✅ User Default branch configuration
- ✅ API `get_user_branch_info` response
- ✅ Provides step-by-step fix instructions

## 🚀 How to Use

### For Users (Quick Fix)

1. **Set User Default Branch**:
   - Go to: **User** → Your user (e.g., `danny.a.pratama@cao-group.co.id`)
   - Scroll to: **Defaults** section
   - Add row:
     - Key: `branch`
     - Value: `Main` (or your branch name)
   - Save

2. **Logout and Login**:
   - Complete logout (not just refresh)
   - Login again
   - Frappe will reload user defaults

3. **Test**:
   - Navigate to `/shared/module-select`
   - Or click "Open POS" shortcut
   - Should work now!

### For Developers (Verification)

1. **Run verification script**:
   ```js
   // In browser console after login
   // Copy-paste contents of: tests/browser_branch_setup_test.js
   verifyBranchSetup()
   ```

2. **Check API directly**:
   ```js
   fetch('/api/method/imogi_pos.api.module_select.get_user_branch_info', {
     credentials: 'include'
   }).then(r => r.json()).then(console.log)
   ```

   Expected response:
   ```json
   {
     "message": {
       "current_branch": "Main",
       "available_branches": [
         {"name": "Main", "branch": "Main"}
       ]
     }
   }
   ```

## 📋 Requirements Checklist

Before Module Select will work, system must have:

- [ ] **Branch DocType exists** (standard ERPNext master)
- [ ] **At least 1 active Branch** created (e.g., "Main")
- [ ] **User has Read permission** for Branch DocType
- [ ] **User has branch set** via one of:
  - User → Defaults → branch = Main, OR
  - Custom field `imogi_default_branch` = Main, OR
  - Global Default branch = Main
- [ ] **User logged out and logged in** after setting defaults

## 🔧 Technical Details

### Branch Resolution Flow

```
1. Check User.imogi_default_branch custom field
   ↓ (if empty)
2. Check frappe.defaults.get_user_default("branch")
   ↓ (if empty)
3. Check frappe.defaults.get_global_default("branch")
   ↓ (if still empty)
4. Use first available branch from Branch list
   ↓ (if no branches exist)
5. THROW ERROR with detailed debug info
```

### Files Changed

1. **`imogi_pos/api/module_select.py`**
   - Line ~161-177: Added fallback logic
   - Line ~242-262: Enhanced error messages

2. **`imogi_pos/public/js/core/permission-manager.js`**
   - Line ~327-345: Fixed frappe.ready compatibility

3. **`imogi_pos/public/js/workspace_shortcuts.js`**
   - Line ~100-127: Added URL resolution safety checks

4. **`tests/browser_branch_setup_test.js`** (NEW)
   - Comprehensive verification tool

## 🎯 Why This Happens

**System Manager ≠ Automatic Branch Context**

IMOGI POS (like ERPNext POS) requires **operational context**, not just permissions:

| Aspect              | What Users Think       | Reality                              |
| ------------------- | ---------------------- | ------------------------------------ |
| System Manager role | "Can do everything"    | ✅ Has permissions                    |
| Branch requirement  | "Should be automatic"  | ❌ Needs explicit configuration       |
| Default branch      | "Will auto-detect"     | ❌ Must be set manually               |
| Global defaults     | "Don't apply to admin" | ❌ Apply to everyone, including admin |

**POS is operational software** - it needs to know:
- Which branch you're operating at
- Which warehouse to use
- Which POS Profile to load
- Which company context

Without this = Cannot open POS, even for System Manager.

## 📝 Common Mistakes

### ❌ Setting branch in wrong place
```
User → Custom Fields → some_other_field ✗
```

### ✅ Correct way
```
User → Defaults section → Add row:
  Key: branch
  Value: Main
```

### ❌ Not logging out
```
Set defaults → Refresh browser ✗
```

### ✅ Correct way
```
Set defaults → Logout → Login → Test
```

### ❌ Expecting auto-detection
```
"I'm System Manager, it should just work" ✗
```

### ✅ Understanding operational context
```
"POS needs to know my branch context" ✓
```

## 🧪 Testing Checklist

After applying this fix:

- [ ] Clear cache: `bench clear-cache`
- [ ] Restart: `bench restart`
- [ ] Set User Default branch for test user
- [ ] Logout/Login
- [ ] Run verification script
- [ ] Test Module Select directly
- [ ] Test "Open POS" shortcut
- [ ] Verify error logs are helpful (if setup incomplete)

## 📊 Success Criteria

✅ **Fix is successful when**:
1. System Manager with User Default branch set → can access Module Select
2. Users without branch → get clear error message with instructions
3. No "frappe.ready is not a function" errors in console
4. No "page null" routing errors
5. Verification script shows all green checkmarks

## 🔗 Related Files

- Backend: [imogi_pos/api/module_select.py](imogi_pos/api/module_select.py)
- Frontend: [imogi_pos/public/js/core/permission-manager.js](imogi_pos/public/js/core/permission-manager.js)
- Frontend: [imogi_pos/public/js/workspace_shortcuts.js](imogi_pos/public/js/workspace_shortcuts.js)
- Test: [tests/browser_branch_setup_test.js](tests/browser_branch_setup_test.js)
- Diagnostic: [tests/browser_workspace_routing_diagnostic.js](tests/browser_workspace_routing_diagnostic.js)

---

**Date**: January 26, 2026
**Status**: ✅ Fixed and Tested
**Impact**: All users (especially System Manager) can now access Module Select with proper branch configuration
