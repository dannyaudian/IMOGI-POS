# IMOGI POS - Quick Reference Guide

**New Architecture** | January 2026

---

## 🗺️ URL Structure

### New URLs (Primary)

| Feature | New URL | Role Required |
|---------|---------|---------------|
| Login | `/shared/login` | Anyone |
| Waiter POS | `/restaurant/waiter` | Waiter, Manager |
| Kiosk Mode | `/restaurant/waiter?mode=kiosk` | Guest (if enabled) |
| Kitchen Display | `/restaurant/kitchen` | Kitchen Staff, Manager |
| Table Display | `/restaurant/tables` | Waiter, Manager |
| Counter POS | `/counter/pos` | Cashier, Manager |
| Customer Display | `/devices/displays` | Anyone |
| Self-Order | `/restaurant/self-order` | Guest (with token) |

### Old URLs (Redirects)

All old URLs redirect automatically:
- `/create-order` → `/restaurant/waiter`
- `/kiosk` → `/restaurant/waiter?mode=kiosk`
- `/cashier-console` → `/counter/pos`
- `/kitchen_display` → `/restaurant/kitchen`
- `/table_display` → `/restaurant/tables`
- `/customer-display` → `/devices/displays`
- `/imogi-login` → `/shared/login`
- `/so` → `/restaurant/self-order`

---

## 👥 Role Permissions

| Role | Can Access |
|------|-----------|
| **System Manager** | Everything |
| **Restaurant Manager** | All restaurant features + admin panels |
| **Cashier** | Counter POS only |
| **Waiter** | Waiter POS, Table Display |
| **Kitchen Staff** | Kitchen Display only |
| **Guest** | Self-Order (with token), Kiosk (if enabled) |

---

## 🔑 Key Features

### Authentication System

```python
# In index.py files:

# Require specific roles
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier", "Restaurant Manager", "System Manager")
def get_context(context):
    # Your code here
    pass

# Allow guest access
from imogi_pos.utils.auth_decorators import allow_guest_if_configured

@allow_guest_if_configured()
def get_context(context):
    # Your code here
    pass
```

### Role-Based UI

```javascript
// In JavaScript:

// Initialize role-based UI
RoleUI.init();

// Show element only for specific roles
RoleUI.showIfRoles(element, ['Restaurant Manager', 'System Manager']);

// Hide element for guests
RoleUI.hideIfGuest(element);

// Check user roles
if (RoleUI.hasRole('Restaurant Manager')) {
    // Show admin features
}
```

```html
<!-- In HTML: -->

<!-- Show only for specific roles -->
<div data-roles="Restaurant Manager,System Manager">
    Admin Controls
</div>

<!-- Show only for authenticated users -->
<div data-auth="required">
    Logged in content
</div>

<!-- Hide from guests -->
<div class="hide-for-guest">
    User content
</div>
```

### Mode Detection (Waiter POS)

```javascript
// Check current mode
console.log(MODE); // "waiter" or "kiosk"

// Conditional rendering
if (MODE === 'kiosk') {
    // Show simplified kiosk interface
} else {
    // Show full waiter interface
}
```

---

## 🛠️ Common Tasks

### Add Auth to New Page

1. Import decorator in `index.py`:
```python
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Your Role", "Another Role")
def get_context(context):
    # Your code
```

2. Add role-ui.js to `index.html`:
```html
<script src="/assets/imogi_pos/js/core/role-ui.js"></script>
```

3. Add role attributes to admin elements:
```html
<div data-roles="Restaurant Manager,System Manager">
    Admin only
</div>
```

### Get User Info

```python
# In Python:
from imogi_pos.utils.auth_helpers import get_user_role_context

context = get_user_role_context()
# Returns:
# {
#     'user': 'user@example.com',
#     'full_name': 'John Doe',
#     'roles': ['Waiter', 'Restaurant Manager'],
#     'is_system_manager': False,
#     'is_guest': False,
#     'pos_profile': 'POS-PROFILE-001',
#     'branch': 'Branch-001'
# }
```

```javascript
// In JavaScript:
console.log(frappe.user.name);  // Current user
console.log(frappe.user_roles);  // User roles
console.log(frappe.session.user);  // User email
```

### Create Admin Panel

```html
<!-- Add admin toggle button -->
<button class="admin-toggle" data-roles="Restaurant Manager,System Manager">
    ⚙️
</button>

<!-- Add admin panel -->
<div class="admin-panel" data-roles="Restaurant Manager,System Manager">
    <h2>Admin Controls</h2>
    <!-- Your admin features -->
</div>
```

```javascript
// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    RoleUI.init();  // Automatically processes data-roles attributes
    
    // Or create programmatically
    const toggle = RoleUI.createAdminToggle();
    document.body.appendChild(toggle);
});
```

---

## 🐛 Troubleshooting

### User Can't Access Page

**Check:**
1. User has correct role in User master
2. User has POS Profile assigned (for POS pages)
3. User has branch permissions (if branch isolation enabled)
4. Browser cache cleared

**Fix:**
```bash
# Clear server cache
bench --site [site-name] clear-cache

# Clear browser cache
Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
```

### Admin Features Not Showing

**Check:**
1. User has Restaurant Manager or System Manager role
2. role-ui.js is loaded (check Network tab in DevTools)
3. No JavaScript errors in console
4. Element has correct `data-roles` attribute

**Fix:**
```bash
# Rebuild assets
bench build --app imogi_pos

# Hard refresh browser
Ctrl+Shift+R (or Cmd+Shift+R on Mac)
```

### Old URLs Not Redirecting

**Check:**
1. Migration ran successfully
2. hooks.py has website_route_rules

**Fix:**
```bash
# Clear routes cache
bench --site [site-name] clear-cache
bench restart
```

### Mode Not Working in Waiter POS

**Check:**
1. URL includes `?mode=kiosk` parameter
2. MODE constant is defined in HTML
3. JavaScript checks MODE variable

**Fix:**
```javascript
// In browser console:
console.log(MODE);  // Should show "waiter" or "kiosk"

// If undefined, check HTML:
// <script>const MODE = '{{ mode }}';</script>
```

---

## 📞 Support Contacts

- **Documentation:** See IMPLEMENTATION_SUMMARY.md, TESTING_GUIDE.md
- **Deployment:** See DEPLOYMENT_QUICK_START.md
- **Architecture:** See ARCHITECTURE.md, www/README.md
- **API Reference:** Check `utils/auth_decorators.py`, `utils/auth_helpers.py`

---

## 🔗 Useful Links

| Resource | Location |
|----------|----------|
| Implementation Summary | `IMPLEMENTATION_SUMMARY.md` |
| Testing Guide | `TESTING_GUIDE.md` |
| Deployment Guide | `DEPLOYMENT_QUICK_START.md` |
| Architecture Docs | `ARCHITECTURE.md` |
| WWW Structure | `imogi_pos/www/README.md` |
| Auth Decorators | `imogi_pos/utils/auth_decorators.py` |
| Auth Helpers | `imogi_pos/utils/auth_helpers.py` |
| Role UI JS | `imogi_pos/public/js/core/role-ui.js` |

---

**Last Updated:** January 21, 2026  
**Version:** 1.0  
**Status:** Production Ready ✅
