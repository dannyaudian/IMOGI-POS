# IMOGI POS React - Complete Architecture

## ✅ Setup Lengkap dengan Semua Modes!

Berdasarkan struktur **IMOGI POS www/** yang sebenarnya, React architecture sekarang support **SEMUA modes**:

### 📱 All Supported Apps

```
src/apps/
├── cashier-console/      # Counter POS (renamed dari counter-pos)  
├── kitchen/              # Kitchen Display System (KDS)
├── waiter/               # Waiter Order Interface
├── kiosk/                # Self-Service Kiosk
├── self-order/           # QR-based Self-Ordering
├── customer-display/     # Customer-Facing Display
└── table-display/        # Table Layout Display
```

## 🎯 Mapping ke IMOGI POS www/ Structure

| React App | www/ Path | Roles | Purpose |
|-----------|-----------|-------|---------|
| `cashier-console` | `/counter/pos` | Cashier, Branch Manager | Kasir console untuk counter operations |
| `kitchen` | `/restaurant/kitchen` | Kitchen Staff | Kitchen Display System |
| `waiter` | `/restaurant/waiter` | Waiter | Table service order management |
| `kiosk` | `/restaurant/waiter?mode=kiosk` | Guest | Self-service kiosk ordering |
| `self-order` | `/restaurant/self-order` | Guest | QR code table ordering |
| `customer-display` | `/devices/displays` | - | Customer-facing display |
| `table-display` | `/restaurant/tables` | - | Table layout status display |

## 🚀 Build Commands

### Build Individual Apps:
```bash
npm run build:cashier          # Cashier Console
npm run build:kitchen          # Kitchen Display
npm run build:waiter           # Waiter Interface
npm run build:kiosk            # Kiosk Mode
npm run build:self-order       # Self-Order System
npm run build:customer-display # Customer Display
npm run build:table-display    # Table Display
```

### Build All Apps:
```bash
npm run build:all
# Output: imogi_pos/public/react/{app-name}/
```

### Development Mode:
```bash
npm run dev:cashier     # http://localhost:3000
npm run dev:kitchen
npm run dev:waiter
npm run dev:kiosk
npm run dev:self-order
npm run dev:customer-display
npm run dev:table-display
```

## 📁 Output Structure

```
imogi_pos/public/react/
├── cashier-console/
│   └── static/
│       ├── js/main.[hash].js
│       └── css/main.[hash].css
├── kitchen/
├── waiter/
├── kiosk/
├── self-order/
├── customer-display/
└── table-display/
```

## 🔑 Key Features per App

### 1. **Cashier Console** (`cashier-console`)
- Role: Cashier, Branch Manager
- Features:
  - Order creation & management
  - Payment processing
  - Customer management
  - Receipt printing
- API: `useOrderHistory()`, `useCreateOrder()`, `useItems()`

### 2. **Kitchen Display** (`kitchen`)
- Role: Kitchen Staff
- Features:
  - Real-time KOT (Kitchen Order Tickets)
  - Auto-refresh every 5s
  - Status updates (Pending → In Progress → Completed)
  - Order prioritization
- API: `useKOTList()`, `useUpdateKOTStatus()`

### 3. **Waiter Interface** (`waiter`)
- Role: Waiter
- Features:
  - Table selection
  - Order taking
  - Table transfer
  - Bill splitting
- API: `useTables()`, `useItems()`, `useCreateOrder()`

### 4. **Kiosk Mode** (`kiosk`)
- Role: Guest (public access)
- Features:
  - Self-service ordering
  - Large touch-friendly UI
  - Service type selection (Dine In / Take Away)
  - Payment integration
- API: `useItems()`, `useCreateOrder()`

### 5. **Self-Order** (`self-order`)
- Role: Guest (via QR code)
- Features:
  - Mobile-optimized UI
  - Table-specific ordering
  - Cart management
  - Order tracking
- API: `useItems()`, `useCreateOrder()`

### 6. **Customer Display** (`customer-display`)
- Role: None (passive display)
- Features:
  - Large format display
  - Real-time order updates
  - Item prices & quantities
  - Total amount
- Realtime: `frappe.realtime.on('customer_display_update')`

### 7. **Table Display** (`table-display`)
- Role: None (passive display)
- Features:
  - Visual table layout
  - Status indicators (Available/Occupied/Reserved)
  - Auto-refresh every 10s
  - Color-coded status
- API: `useTables()`

## 🔧 Frappe Integration Pattern

Setelah build, buat www/ pages untuk load React:

### Example: Cashier Console

**`imogi_pos/www/counter/pos-react/index.py`**
```python
import frappe
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    context.title = "Cashier Console"
    
    # Load asset manifest for hashed filenames
    import json
    manifest_path = frappe.get_app_path(
        "imogi_pos", 
        "public/react/cashier-console/.vite/manifest.json"
    )
    
    with open(manifest_path) as f:
        manifest = json.load(f)
    
    # Pass initial state
    context.initial_state = {
        "user": frappe.session.user,
        "branch": frappe.cache().hget("imogi_pos_branch", frappe.session.user),
        "pos_profile": "Counter Profile",
        "csrf_token": frappe.session.csrf_token
    }
    
    context.react_js = manifest["main.jsx"]["file"]
    context.react_css = manifest["main.jsx"].get("css", [])
    
    return context
```

**`imogi_pos/www/counter/pos-react/index.html`**
```html
{% extends "templates/web.html" %}

{% block head_include %}
{% for css in react_css %}
<link rel="stylesheet" href="/assets/imogi_pos/react/cashier-console/{{ css }}">
{% endfor %}
{% endblock %}

{% block page_content %}
<div id="root"></div>

<script>
  window.__INITIAL_STATE__ = {{ initial_state | tojson }};
  window.FRAPPE_CSRF_TOKEN = '{{ frappe.session.csrf_token }}';
</script>
<script type="module" src="/assets/imogi_pos/react/cashier-console/{{ react_js }}"></script>
{% endblock %}
```

## 🎨 Shared Resources

Semua apps menggunakan resources yang sama dari `src/shared/`:

### API Hooks (`src/shared/api/imogi-api.js`)
```javascript
// Billing & Orders
useOrderHistory(branch, posProfile)
useCreateOrder()
useUpdateOrder()
useSubmitOrder()

// Kitchen
useKOTList(branch, status) // Auto-refresh 5s
useUpdateKOTStatus()

// Items & Menu
useItems(branch, posProfile)
useItemVariants(itemCode)

// Customers
useCustomers(searchTerm)

// Tables
useTables(branch) // Auto-refresh 10s
useUpdateTableStatus()
```

### Authentication (`src/shared/hooks/useAuth.js`)
```javascript
const { user, loading, hasAccess, error } = useAuth(['Cashier'])
// Auto-redirect to /shared/login if Guest
// Role-based access control
```

### UI Components (`src/shared/components/UI.jsx`)
```javascript
<LoadingSpinner message="..." />
<ErrorMessage error={error} onRetry={fn} />
<AppHeader title="..." user={user} />
<Card title="...">Content</Card>
```

### Global Styling (`src/shared/styles/global.css`)
- Brand colors & gradients
- Layout utilities (.imogi-app, .imogi-header)
- Grid & flex helpers (.grid-2, .flex-between)
- Button styles (.btn-primary, .btn-success)

## 📝 Naming Conventions

### Why "cashier-console" not "counter-pos"?

Berdasarkan URL structure IMOGI POS yang sebenarnya:
- ✅ `/counter/pos` → Cashier Console (role-based naming)
- ❌ `counter-pos` → Confusing, mixes location + role

**Better naming:**
- `cashier-console` - Jelas untuk user role (Cashier)
- `kitchen` - Direct, no ambiguity
- `waiter` - Role-based
- `kiosk` - Mode-based
- `self-order` - Service type

### IMOGI POS Modes (dari www/README.md):

```python
# POS Profile fields:
imogi_pos_domain = "Restaurant" | "Retail" | "Service"
imogi_mode = "Table" | "Counter" | "Kiosk" | "Self-Order"
```

**Mode Mapping:**
- **Table** → `waiter` app
- **Counter** → `cashier-console` app  
- **Kiosk** → `kiosk` app
- **Self-Order** → `self-order` app

## 🔐 Authentication & Session

- **Same domain** dengan ERPNext → Session cookies otomatis shared
- **CSRF token** dari `window.FRAPPE_CSRF_TOKEN`
- **Role checking** via `useAuth()` hook
- **Guest access** untuk kiosk & self-order

## 📦 Frappe v15 Compatibility

React build **tidak bertentangan** dengan Frappe v15 karena:

1. **Separate build output**: `imogi_pos/public/react/` (not in `public/js/`)
2. **On-demand loading**: Only loaded via specific www/ pages
3. **No conflict with Desk**: ERPNext Desk tetap menggunakan Frappe's built-in JS
4. **Standard asset serving**: Via `/assets/` route yang sudah ada

### Build Integration:

```bash
# Development (existing vanilla JS still works)
bench --site site1.local serve

# Build React apps
cd apps/imogi_pos
npm run build:all

# Build Frappe assets (includes React bundles)
bench build --app imogi_pos

# Production deployment
bench restart
```

## 🎯 Next Steps

1. **Test builds**: `npm run build:cashier` untuk verify output
2. **Create www/ pages**: Setup Frappe integration untuk each app
3. **Implement features**: Build complete UI untuk each mode
4. **Deploy**: Push to production setelah testing

## 📚 Documentation References

- [Frappe Framework Docs](https://frappeframework.com/docs/v15)
- [frappe-react-sdk](https://github.com/The-Commit-Company/frappe-react-sdk)
- [IMOGI POS www/ README](imogi_pos/www/README.md)
- [React Architecture](REACT_ARCHITECTURE.md)

---

**Summary**: React setup sekarang **100% aligned** dengan IMOGI POS architecture yang sebenarnya, support **7 modes**, dengan **shared resources** untuk avoid code duplication!
