# IMOGI POS - Centralized React Architecture

## 🎯 Struktur Project yang Sudah Dibuat

```
IMOGI-POS/
├── package.json              # Multi-app build scripts
├── vite.config.js           # Dynamic config untuk semua apps
├── src/
│   ├── shared/              # ⭐ Shared resources untuk semua apps
│   │   ├── api/
│   │   │   └── imogi-api.js          # Centralized API calls
│   │   ├── components/
│   │   │   └── UI.jsx                # Shared UI components
│   │   ├── hooks/
│   │   │   └── useAuth.js            # Authentication hooks
│   │   ├── providers/
│   │   │   └── ImogiPOSProvider.jsx  # Root Frappe provider
│   │   └── styles/
│   │       └── global.css            # Global IMOGI POS styling
│   │
│   └── apps/                # Individual apps
│       ├── counter-pos/     # Cashier Console
│       │   ├── main.jsx
│       │   └── App.jsx
│       ├── kitchen/         # Kitchen Display System
│       │   ├── main.jsx
│       │   └── App.jsx
│       └── waiter/          # Waiter Order System
│           ├── main.jsx
│           └── App.jsx
│
└── imogi_pos/public/react/  # Build outputs (git-ignored)
    ├── counter-pos/
    ├── kitchen/
    └── waiter/
```

## 🚀 Build Commands

### Build semua apps sekaligus:
```bash
npm run build          # atau npm run build:all
```

### Build individual app:
```bash
npm run build:counter  # Counter POS
npm run build:kitchen  # Kitchen Display
npm run build:waiter   # Waiter Order
```

### Development mode:
```bash
npm run dev           # Default: counter-pos
npm run dev:counter   # Counter POS
npm run dev:kitchen   # Kitchen Display
npm run dev:waiter    # Waiter Order
```

## 📦 Shared Resources

### 1. **API Hooks** (`src/shared/api/imogi-api.js`)

Semua apps menggunakan API hooks yang sama:

```javascript
// Billing & Orders
useOrderHistory(branch, posProfile)
useCreateOrder()
useUpdateOrder()
useSubmitOrder()

// Kitchen
useKOTList(branch, status)
useUpdateKOTStatus()

// Items & Variants
useItems(branch, posProfile)
useItemVariants(itemCode)

// Customers
useCustomers(searchTerm)

// Tables (Restaurant)
useTables(branch)
useUpdateTableStatus()

// Manual API call
callImogiAPI('method.name', { args })
```

### 2. **Authentication** (`src/shared/hooks/useAuth.js`)

```javascript
// Di setiap app component
const { user, loading, hasAccess, error } = useAuth(['Cashier', 'Branch Manager'])
```

Otomatis:
- Check authentication status
- Redirect ke `/login` (Frappe built-in) jika Guest - ONLY for standalone WWW apps
- Desk Pages rely on Frappe's built-in authentication - NO custom redirects
- Verify role-based access
- Get initial state dari server

### 3. **UI Components** (`src/shared/components/UI.jsx`)

```javascript
<LoadingSpinner message="Loading..." />
<ErrorMessage error={error} onRetry={retry} />
<AppHeader title="..." user={user} onLogout={logout} />
<Card title="...">Content</Card>
```

### 4. **Provider** (`src/shared/providers/ImogiPOSProvider.jsx`)

Wraps semua apps dengan FrappeProvider untuk:
- Cookie-based authentication
- Same-domain session sharing
- SWR data fetching

## 🎨 Styling

Global CSS di `src/shared/styles/global.css` menyediakan:

- **CSS Variables**: `--primary-color`, `--success-color`, dll
- **Layout utilities**: `.imogi-app`, `.imogi-header`, `.imogi-main`
- **Component styles**: `.imogi-card`, `.imogi-loading`, `.imogi-error`
- **Grid/Flex utilities**: `.grid-2`, `.grid-3`, `.flex-between`, dll
- **Button styles**: `.btn-primary`, `.btn-success`, dll

## 🔧 Cara Menambah App Baru

1. Buat folder baru di `src/apps/your-app/`
2. Buat `main.jsx` dan `App.jsx`
3. Import shared resources:
   ```javascript
   import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
   import { useAuth } from '@/shared/hooks/useAuth'
   import { useItems } from '@/shared/api/imogi-api'
   import '@/shared/styles/global.css'
   ```
4. Tambah build script di `package.json`:
   ```json
   "build:your-app": "VITE_APP=your-app vite build"
   ```

## 💡 Keuntungan Arsitektur Ini

✅ **DRY (Don't Repeat Yourself)**: API calls, auth, styling hanya ditulis sekali
✅ **Consistency**: Semua apps punya look & feel yang sama
✅ **Maintainability**: Update di shared/ otomatis apply ke semua apps
✅ **Type Safety**: Shared hooks dengan consistent interface
✅ **Performance**: Shared code di-bundle terpisah (code splitting)
✅ **Scalability**: Mudah tambah app baru tanpa duplikasi

## 🔄 Integration dengan Frappe

Setelah build, buat www/ pages untuk load React apps:

```python
# imogi_pos/www/counter/pos-react/index.py
import frappe

def get_context(context):
    context.title = "Cashier Console"
    context.initial_state = {
        "user": frappe.session.user,
        "branch": "Default",
        "pos_profile": "Counter"
    }
```

```html
<!-- imogi_pos/www/counter/pos-react/index.html -->
{% extends "templates/web.html" %}
{% block page_content %}
  <div id="root"></div>
  <script>window.__INITIAL_STATE__ = {{ initial_state | tojson }};</script>
  <script src="/assets/imogi_pos/react/counter-pos/static/js/main.[hash].js"></script>
{% endblock %}
```

## 📝 Next Steps

1. ✅ Test build: `npm run build:counter`
2. ⏳ Buat Frappe www/ integration pages
3. ⏳ Add more shared components (Modal, Toast, Form inputs)
4. ⏳ Implement complete order flow
5. ⏳ Add self-order app
6. ⏳ Setup CI/CD for automated builds
