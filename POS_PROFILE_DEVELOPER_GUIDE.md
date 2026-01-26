# POS Profile Migration - Developer Quick Reference

## For Backend Developers (Python/Frappe)

### ✅ DO: Use pos_profile as Primary Parameter

```python
@frappe.whitelist()
def my_api_function(pos_profile=None, branch=None, ...):
    """
    Args:
        pos_profile (str, optional): POS Profile name (PREFERRED)
        branch (str, optional): Branch name (DEPRECATED)
    """
    # Add deprecation warning
    if branch and not pos_profile:
        frappe.log("DEPRECATION WARNING: Use pos_profile parameter")
    
    # Derive effective values
    effective_branch = None
    effective_pos_profile = pos_profile
    
    if pos_profile:
        effective_branch = frappe.db.get_value('POS Profile', pos_profile, 'imogi_branch')
    elif branch:
        effective_branch = branch
        # Optionally find POS Profile for branch
        profiles = frappe.get_all("POS Profile", 
            filters={"imogi_branch": branch, "disabled": 0}, limit=1)
        if profiles:
            effective_pos_profile = profiles[0].name
    
    # Use effective variables
    validate_branch_access(effective_branch)
    # ... rest of logic
```

### ❌ DON'T: Use branch as Primary Parameter

```python
# Old pattern (deprecated)
def my_api_function(branch):
    validate_branch_access(branch)
    # ...
```

### Getting POS Profile Context

```python
# From current user
from imogi_pos.api.public import get_user_pos_profile_info
info = get_user_pos_profile_info()
current_pos_profile = info['current_pos_profile']
available_profiles = info['available_pos_profiles']

# From existing order
pos_profile = frappe.get_value("POS Order", order_name, "pos_profile")
branch = frappe.get_value("POS Profile", pos_profile, "imogi_branch")

# From session (fallback)
pos_profile = frappe.session.get('pos_profile')  # Set by POSProfileManager
```

---

## For Frontend Developers (React)

### ✅ DO: Use usePOSProfile Hook

```javascript
import { usePOSProfile } from '@/shared/hooks/usePOSProfile';

function MyComponent() {
  const {
    currentProfile,      // Current POS Profile name
    profileData,         // Full POS Profile data
    availableProfiles,   // List of all available profiles
    branches,           // List of unique branches
    setProfile,         // Function to switch profile
    branch,             // Current branch (derived)
    domain,             // Current domain (e.g., "Restaurant")
    mode               // Current mode (e.g., "Counter", "Waiter")
  } = usePOSProfile();
  
  // Use in API calls
  const fetchOrders = async () => {
    const result = await call('imogi_pos.api.cashier.get_pending_orders', {
      pos_profile: currentProfile  // ✅ PREFERRED
    });
  };
  
  return <div>Current Profile: {currentProfile}</div>;
}
```

### ✅ DO: Use useImogiPOS Context (Provider Pattern)

```javascript
import { useImogiPOS } from '@/shared/providers/ImogiPOSProvider';

function MyApp() {
  const {
    posProfile,        // Current POS Profile
    branch,            // Current branch
    mode,              // Current mode
    domain,            // Current domain
    availableProfiles, // Available profiles
    setProfile        // Switch profile
  } = useImogiPOS();
  
  // Use in API calls
  const createOrder = async () => {
    await call('imogi_pos.api.orders.create_order', {
      order_type: 'Dine-in',
      pos_profile: posProfile,  // ✅ Pass pos_profile
      // branch is optional now
    });
  };
}
```

### ✅ DO: Add POS Profile Switcher to Headers

```javascript
import { POSProfileSwitcher } from '@/shared/components/POSProfileSwitcher';

function MyAppHeader() {
  return (
    <header>
      <h1>My App</h1>
      <POSProfileSwitcher 
        showBranch={true}      // Show branch label
        syncOnChange={true}    // Sync to server on change
        compact={false}        // Full dropdown style
        variant="dropdown"     // or "badge" or "display-only"
      />
    </header>
  );
}
```

### ❌ DON'T: Hardcode Branch Parameter

```javascript
// Old pattern (deprecated)
const fetchOrders = async () => {
  const result = await call('imogi_pos.api.cashier.get_pending_orders', {
    branch: 'Branch A'  // ❌ DEPRECATED
  });
};
```

### ❌ DON'T: Use localStorage Directly

```javascript
// ❌ DEPRECATED - Use hooks instead
const branch = localStorage.getItem('imogi_branch');
const posProfile = localStorage.getItem('imogi_pos_profile');
```

---

## API Parameter Migration Cheat Sheet

| API Function | Old Signature | New Signature |
|--------------|---------------|---------------|
| `get_active_pos_opening` | `(branch)` | `(pos_profile=None, branch=None)` |
| `get_available_modules` | `(branch)` | `(pos_profile=None, branch=None)` |
| `get_pending_orders` | `(branch, ...)` | `(pos_profile=None, branch=None, ...)` |
| `get_active_kots` | `(kitchen, station, branch)` | `(pos_profile=None, kitchen=None, station=None, branch=None)` |
| `get_tables` | `(branch)` | `(pos_profile=None, branch=None)` |
| `create_order` | `(order_type, branch, pos_profile, ...)` | `(order_type, pos_profile=None, branch=None, ...)` |
| `check_active_cashiers` | `(branch)` | `(pos_profile=None, branch=None)` |
| `get_next_available_table` | `(branch)` | `(pos_profile=None, branch=None)` |
| `create_table_order` | `(branch, ...)` | `(pos_profile=None, branch=None, ...)` |

---

## Common Patterns

### Pattern 1: API Call with POS Profile

```javascript
// React component
const { currentProfile } = usePOSProfile();

const result = await call('imogi_pos.api.MODULE.function_name', {
  pos_profile: currentProfile,  // Always pass this first
  // other params...
});
```

### Pattern 2: Conditional Branch/POS Profile Handling

```python
# Python API
def api_function(pos_profile=None, branch=None):
    if branch and not pos_profile:
        frappe.log("DEPRECATION WARNING: ...")
    
    effective_branch = (
        frappe.db.get_value('POS Profile', pos_profile, 'imogi_branch')
        if pos_profile else branch
    )
```

### Pattern 3: Multi-Tab Sync

```javascript
// Automatic with usePOSProfile hook
const { setProfile } = usePOSProfile();

// This automatically syncs to all tabs via BroadcastChannel
setProfile('Main Counter - Branch A', { syncToServer: true });

// All tabs receive update via storage event and BroadcastChannel
```

### Pattern 4: Server-Side POS Profile Detection

```python
# Get user's default POS Profile
def get_current_pos_profile():
    """Get current user's active POS Profile"""
    # 1. Check session
    if frappe.session.get('pos_profile'):
        return frappe.session.get('pos_profile')
    
    # 2. Check User field
    if frappe.db.has_column('User', 'imogi_default_pos_profile'):
        pos_profile = frappe.db.get_value('User', frappe.session.user, 
                                         'imogi_default_pos_profile')
        if pos_profile:
            return pos_profile
    
    # 3. Fallback to user's default branch
    branch = frappe.db.get_value('User', frappe.session.user, 
                                 'imogi_default_branch')
    if branch:
        profiles = frappe.get_all('POS Profile', 
            filters={'imogi_branch': branch, 'disabled': 0}, 
            limit=1)
        if profiles:
            return profiles[0].name
    
    return None
```

---

## Debugging Tips

### Check Current POS Profile (Browser Console)

```javascript
// Get from localStorage
console.log('POS Profile:', localStorage.getItem('imogi_pos_profile'));
console.log('Branch:', localStorage.getItem('imogi_branch'));

// Get from POSProfileManager
console.log('Manager State:', window.POSProfileManager?.get());

// Test cross-tab sync
window.POSProfileManager?.set('Test Profile - Branch A');
```

### Check POS Profile (Frappe Console)

```python
# Get user's default
frappe.get_value('User', '[email]', 'imogi_default_pos_profile')

# Get all profiles for branch
frappe.get_all('POS Profile', 
    filters={'imogi_branch': 'Branch A', 'disabled': 0},
    fields=['name', 'imogi_mode', 'imogi_pos_domain'])

# Test API with pos_profile
from imogi_pos.api.MODULE import FUNCTION
result = FUNCTION(pos_profile='Main Counter - Branch A')
```

### Check Deprecation Warnings

```bash
# Server logs
grep "DEPRECATION WARNING" ~/frappe-bench/sites/[site]/logs/error.log

# Should show old API calls using branch parameter
```

---

## Migration Checklist for New Features

When adding new API endpoints:

- [ ] Accept `pos_profile` as first optional parameter
- [ ] Accept `branch` as second optional parameter (for backward compat)
- [ ] Add deprecation warning if `branch` used without `pos_profile`
- [ ] Derive `effective_branch` from `pos_profile` when available
- [ ] Validate branch access with `validate_branch_access(effective_branch)`
- [ ] Document parameters in docstring

When adding new React components:

- [ ] Import and use `usePOSProfile()` or `useImogiPOS()` hook
- [ ] Pass `currentProfile` or `posProfile` to API calls
- [ ] Add `<POSProfileSwitcher />` to header if standalone app
- [ ] Test cross-tab synchronization
- [ ] Test localStorage persistence

---

## Quick Links

- **Phase 1 Summary:** [PHASE_1_IMPLEMENTATION_SUMMARY.md](PHASE_1_IMPLEMENTATION_SUMMARY.md)
- **Phase 2 Summary:** [PHASE_2_COMPLETE.md](PHASE_2_COMPLETE.md)
- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **React Architecture:** [REACT_ARCHITECTURE.md](REACT_ARCHITECTURE.md)

---

## Questions?

**Why POS Profile instead of Branch?**
- POS Profile provides richer context (mode, domain, settings)
- Supports multiple POS setups per branch (e.g., Main Counter vs Express Counter)
- Better aligns with ERPNext POS architecture

**Can I still use branch parameter?**
- Yes, for backward compatibility
- Will trigger deprecation warnings
- Recommended to migrate to pos_profile

**How do I find a POS Profile for a branch?**
```python
profiles = frappe.get_all('POS Profile', 
    filters={'imogi_branch': branch, 'disabled': 0})
```

**How do I get branch from POS Profile?**
```python
branch = frappe.get_value('POS Profile', pos_profile, 'imogi_branch')
```
