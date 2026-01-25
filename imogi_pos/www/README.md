# IMOGI POS - New Architecture Structure

This directory represents the reorganized architecture for IMOGI POS, grouped by business type and operation mode.

## Directory Structure

```
www/
├── restaurant/          # Restaurant-specific components
│   ├── waiter/         # Unified POS (merged create-order + kiosk + waiter_order)
│   ├── kitchen/        # Kitchen Display System (KDS)
│   ├── tables/         # Table layout display
│   └── self-order/     # QR-based self-ordering
│
├── counter/            # Counter operations
│   └── pos/            # Counter POS (cashier console)
│
├── kiosk/              # Self-service kiosk (future: might merge with waiter/)
│
├── devices/            # Device-centric components
│   ├── displays/       # Customer-facing display
│   └── printers/       # Printer configuration
│
├── shared/             # Shared components across all types
│   ├── login/          # Authentication
│   ├── device-select/  # Device selection
│   └── service-select/ # Service type selection
│
├── retail/             # Retail domain (placeholder - Q2 2026)
│   ├── pos/
│   ├── inventory/
│   └── checkout/
│
└── service/            # Service domain (placeholder - Q3 2026)
    ├── booking/
    ├── queue/
    └── billing/
```

## URL Structure

### New URLs
- `/restaurant/waiter` - Unified POS interface (waiter/kiosk modes)
- `/restaurant/kitchen` - Kitchen Display System
- `/restaurant/tables` - Table layout display
- `/restaurant/self-order` - Self-ordering system
- `/counter/pos` - Cashier console
- `/devices/displays` - Customer display
- `/shared/login` - Login page
- `/shared/device-select` - Device selector
- `/shared/service-select` - Service selector

### Legacy URLs (Redirected)
Old paths automatically redirect to new structure:
- `/create-order` → `/restaurant/waiter`
- `/waiter_order` → `/restaurant/waiter`
- `/kiosk` → `/restaurant/waiter?mode=kiosk`
- `/cashier-console` → `/counter/pos`
- `/customer-display` → `/devices/displays`
- `/kitchen_display` → `/restaurant/kitchen`
- `/table_display` → `/restaurant/tables`
- `/imogi-login` → `/shared/login`
- `/so` → `/restaurant/self-order`

## Authentication System

All www/ pages use centralized authentication decorators:

### Decorators (`utils/auth_decorators.py`)
- `@require_login()` - Ensures user is authenticated
- `@require_roles(*roles)` - Validates user has required roles
- `@allow_guest_if_configured()` - Allows guest access if enabled in settings
- `@require_pos_profile()` - Ensures user has POS Profile
- `@require_branch_access()` - Validates branch permissions

### Role-Based Access
Each component specifies required roles in its `index.py`:

```python
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    # Page logic
    pass
```

### Client-Side Role UI
JavaScript utility for conditional rendering:

```javascript
// Include in HTML
<script src="/assets/imogi_pos/js/core/role-ui.js"></script>

// Hide elements for non-managers
RoleUI.showIfRoles('#admin-panel', ['Branch Manager', 'System Manager']);

// Show only for authenticated users
RoleUI.showIfAuthenticated('.logged-in-features');

// Auto-process elements with data attributes
<div data-roles="Branch Manager,System Manager">Admin Only</div>
<div data-auth="required">Logged In Only</div>
```

## Role-Based Routing

Users are automatically routed based on their primary role:

| Role | Default Route |
|------|--------------|
| System Manager / Area Manager / Branch Manager | `/app` (ERPNext Desk) |
| Finance Controller | `/app/query-report/financial-summary` |
| Cashier | `/counter/pos` |
| Waiter | `/restaurant/waiter` |
| Kitchen Staff | `/restaurant/kitchen` |
| Guest (with guest access enabled) | Configured entry point |

## Migration from Old Structure

### For Developers

1. **Update imports**: Change references from old paths to new paths
2. **Use new decorators**: Replace manual auth checks with decorators
3. **Update frontend URLs**: Use new URL structure in JS/HTML
4. **Role-based UI**: Implement conditional rendering using RoleUI

### For Administrators

- **Bookmarks**: Old URLs automatically redirect
- **Device configs**: Update stored URLs in Customer Display Device, Kiosk Device, etc.
- **External integrations**: Update webhook/callback URLs if any

## Domain Configuration

Business type controlled via POS Profile:
- `imogi_pos_domain` - "Restaurant" | "Retail" | "Service"
- `imogi_mode` - "Table" | "Counter" | "Kiosk" | "Self-Order"

## Implementation Status

✅ **Completed**
- Directory structure created
- Authentication system implemented
- Role-based UI utilities created
- Core components copied to new locations
- Placeholder structure for retail/service

🔄 **In Progress**
- Merging duplicate POS interfaces
- Updating all page references
- CSS/JS asset consolidation

⏳ **Pending**
- Full testing of all routes
- Migration scripts for existing deployments
- Documentation updates
- Old directory cleanup

## Notes

This is a **fresh deploy** structure. No backward compatibility required with `imogi_pos/page/` versions - all management interfaces merged into www/ with role-based rendering.

## Support

For questions or issues, refer to:
- `utils/auth_decorators.py` - Authentication patterns
- `utils/auth_helpers.py` - Helper functions
- `public/js/core/role-ui.js` - Client-side role utilities
