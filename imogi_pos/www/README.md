# IMOGI POS - WWW React Applications

This directory contains all React-based POS applications that run in the browser via Frappe's www/ routing system.

## Directory Structure

```
www/
├── cashier-console/     # Cashier POS interface (React app: src/apps/cashier-console)
├── customer-display/    # Customer-facing display (React app: src/apps/customer-display)
├── customer-display-editor/  # Customer display editor (React app: src/apps/customer-display-editor)
├── kiosk/              # Self-service kiosk (React app: src/apps/kiosk)
├── kitchen/            # Kitchen Display System (React app: src/apps/kitchen)
├── login/              # Authentication page (React app: src/apps/login)
├── module-select/      # Multi-module selector (React app: src/apps/module-select)
├── self-order/         # QR-based self-ordering (React app: src/apps/self-order)
├── table-display/      # Table layout display (React app: src/apps/table-display)
├── table-display-editor/  # Table display editor (React app: src/apps/table-display-editor)
├── table-layout-editor/  # Table layout editor (React app: src/apps/table-layout-editor)
└── waiter/             # Waiter order interface (React app: src/apps/waiter)
```

## React Application Mapping

Each www/ directory contains:
- `index.html` - Frappe page template (loads React bundle)
- `index.py` - Python backend for page context & authentication
- `react.py` - React-specific context (app name, mount point)
- Optional: `index.js` - Legacy JS (being replaced by React)

Corresponding React source code in `src/apps/`:
```
www/cashier-console/      → src/apps/cashier-console/
www/customer-display/     → src/apps/customer-display/
www/customer-display-editor/ → src/apps/customer-display-editor/
www/kiosk/                → src/apps/kiosk/
www/kitchen/              → src/apps/kitchen/
www/login/                → src/apps/login/
www/module-select/        → src/apps/module-select/
www/self-order/           → src/apps/self-order/
www/table-display/        → src/apps/table-display/
www/table-display-editor/ → src/apps/table-display-editor/
www/table-layout-editor/  → src/apps/table-layout-editor/
www/waiter/               → src/apps/waiter/
```

## URL Structure

All React apps are accessible via their www/ directory name:

### Primary URLs
- `/cashier-console` - Cashier POS interface
- `/customer-display` - Customer-facing display
- `/customer-display-editor` - Customer display configuration editor
- `/kiosk` - Self-service kiosk
- `/kitchen` - Kitchen Display System (KDS)
- `/login` - Authentication page
- `/module-select` - Multi-module selector (entry point after login)
- `/self-order` - QR-based self-ordering
- `/table-display` - Table layout display
- `/table-display-editor` - Table display configuration editor
- `/table-layout-editor` - Table layout editor
- `/waiter` - Waiter order interface

### Legacy URL Redirects
Some URLs redirect for backward compatibility (configured in `hooks.py`):
- `/imogi-login` → `/login`
- `/so` → `/self-order`

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
 after login:

| Role | Default Route |
|------|--------------|
| System Manager / Area Manager | `/app` (ERPNext Desk) |
| Branch Manager | `/module-select` |
| Cashier / Waiter / Kitchen Staff / Kiosk | `/module-select` |
| Guest (with guest access enabled) | Configured entry point |

**Note**: All POS users now go to `/module-select` where they can choose which module to open based on POS Profile configuration.
## React Development

### Building React Apps

```bash
# Build all React apps
bench build --app imogi_pos

# Development mode with hot reload
cd /path/to/imogi_pos
npm run dev
```

### Adding New React App

1. Create React app in `src/apps/new-app/`
2. Create www directory `imogi_pos/www/new-app/`
3. Add files:
   - `index.html` (template with `<div id="root">`)
   - `index.py` (backend context)
   - `react.py` (React context with app name)
4. Update `vite.config.js` with new entry point
5. Run `bench build --app imogi_pos`

### Module Selection Architecture

All POS modules now use a unified entry point:
1. User logs in via `/login`
2. Redirected to `/module-select` based on role
3. Module selector shows available modules based on POS Profile flags:
   - `enable_cashier_console`
   - `enable_waiter_order`
   - `enable_kiosk`
   - `enable_self_order`
   - `enable_kitchen_display`
   - `enable_table_display`
4. User clicks module → validation checks → navigate to module

**Validation checks**:
- Waiter/Kiosk/Self-Order require active cashier (checks `check_active_cashiers` API)
- Cashier Console requires POS Opening Entry

## POS Profile Configuration

Multi-module support controlled via POS Profile custom fields:
- `imogi_pos_session_scope` - "User" | "POS Profile" (determines session isolation)
- Module enable flags (6 checkboxes for enabling modules)
- Each branch can have different module configurations

## Implementation Status

✅ **Completed**
- All 12 React applications migrated and functional
- Multi-module selection interface
- Role-based authentication and routing
- Session scope management (User/POS Profile)
- Active cashier validation
- Workspace simplified to single "Open POS" entry point

🔄 **Ongoing**
- Performance optimization
- UI/UX improvements
- Bug fixes and testing

## Notes

This is a **fresh deploy** structure. No backward compatibility required with `imogi_pos/page/` versions - all management interfaces merged into www/ with role-based rendering.

## Support

For questions or issues, refer to:
- `utils/auth_decorators.py` - Authentication patterns
- `utils/auth_helpers.py` - Helper functions
- `public/js/core/role-ui.js` - Client-side role utilities
