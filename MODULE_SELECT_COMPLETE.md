# Module Select - Complete Architecture

## Overview

Module Select is a new feature yang mengganti Device Select flow. User setelah login akan langsung melihat semua available modules based on their permissions/roles, dengan tampilan:

1. **Header** - Logo, user info, logout button
2. **Sidebar** - Branch selector, active POS info, user profile
3. **Main Content** - Available modules grid based on user's roles

## New User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         LOGIN                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    MODULE SELECT                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Header: Logo | User | Logout                       │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Sidebar           │  Content                       │   │
│  │ ─────────────────┼───────────────────────────────  │   │
│  │ • Branch         │  Available Modules:            │   │
│  │   [Dropdown]     │  ┌─────────┬─────────┬────────┐ │   │
│  │                  │  │ Cashier │ Waiter  │Kitchen │ │   │
│  │ • POS Opening    │  └─────────┴─────────┴────────┘ │   │
│  │   Status         │  ┌─────────┬─────────┬────────┐ │   │
│  │   Profile: ...   │  │ Kiosk   │ Self-O. │ Tbl Ed │ │   │
│  │   Balance: Rp... │  └─────────┴─────────┴────────┘ │   │
│  │                  │                                  │   │
│  │ • Account        │                                  │   │
│  │   [User Info]    │                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    (User clicks module)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         SELECTED MODULE (Cashier, Waiter, etc.)             │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/apps/module-select/
├── App.jsx                    # Main component
├── main.jsx                   # Entry point
├── styles.css                 # All styling
└── components/
    ├── BranchSelector.jsx     # Branch dropdown
    ├── POSInfoCard.jsx        # Show active POS opening
    ├── ModuleCard.jsx         # Module card component
    └── index.js               # Re-exports

imogi_pos/
├── api/
│   └── module_select.py       # Backend APIs
├── www/
│   └── shared/
│       └── module-select/
│           └── index.py       # Page context builder
└── hooks.py                   # Route configuration
```

## Features

### 1. **Module Selection Based on Roles**
- User hanya melihat modules yang sesuai dengan role/permission mereka
- Definisi modules dan required roles di `imogi_pos/api/module_select.py`

Available modules:
- **Cashier** (Cashier, Branch Manager, System Manager)
  - Process orders and payments
  - Requires: POS Session, Opening Balance

- **Waiter** (Waiter, Branch Manager, System Manager)
  - Create and manage orders
  
- **Kitchen** (Kitchen Staff, Branch Manager, System Manager)
  - View KOT tickets

- **Kiosk** (Guest, Branch Manager, System Manager)
  - Self-service ordering

- **Self-Order** (Guest, Waiter, Branch Manager, System Manager)
  - QR code based ordering

- **Table Display** (Waiter, Branch Manager, System Manager)
  - Show table status

- **Customer Display** (Guest, Waiter, Branch Manager, System Manager)
  - Payment info display

> **Separate Apps** (Not in Module Select):
> - **Table Layout Editor** (`/table_layout_editor`) - Configure table layout
>   - Accessed directly, not through module selection

### 2. **Branch Selector**
- Dropdown untuk memilih branch aktif
- Auto-save ke `imogi_default_branch` field di User doctype
- Page reload setelah branch change

### 3. **POS Opening Entry Status**
Tampilkan informasi:
- Status (Active/Inactive)
- POS Profile yang sedang aktif
- Opening Balance (Rp format)
- Waktu dibuka
- Link ke detail POS Opening Entry

### 4. **User Profile Card**
- Avatar (inisial)
- Username
- Email

## API Endpoints

### `get_available_modules(branch=None)`
**Purpose**: Get list of available modules for current user

**Returns**:
```python
{
  'modules': [
    {
      'type': 'cashier',
      'name': 'Cashier Console',
      'description': 'Manage orders...',
      'url': '/cashier-console',
      'icon': 'fa-cash-register',
      'requires_session': True,
      'requires_opening': True,
      'order': 1
    },
    ...
  ],
  'user': 'user@example.com',
  'roles': ['Cashier', 'System Manager']
}
```

### `get_user_branch_info()`
**Purpose**: Get current user's branch settings

**Returns**:
```python
{
  'current_branch': 'Jakarta Branch',
  'available_branches': [
    {'name': 'Jakarta Branch', 'company_name': 'PT IMOGI Jakarta'},
    {'name': 'Surabaya Branch', 'company_name': 'PT IMOGI Surabaya'}
  ]
}
```

### `get_active_pos_opening(branch=None)`
**Purpose**: Get active POS opening entry for the branch

**Returns**:
```python
{
  'pos_opening_entry': 'POS-2025-001',
  'pos_profile_name': 'Counter-Jakarta',
  'opening_balance': 500000.0,
  'timestamp': '2025-01-25 08:30:00'
}
```

### `set_user_branch(branch)`
**Purpose**: Update user's default branch

**Returns**:
```python
{
  'success': True,
  'message': 'Branch changed to Jakarta Branch'
}
```

## CSS Color Coding

Module cards memiliki color berbeda berdasarkan type:

```css
--color-cashier: #3498db (Blue)
--color-waiter: #e74c3c (Red)
--color-kiosk: #9b59b6 (Purple)
--color-kitchen: #e67e22 (Orange)
--color-selforder: #16a085 (Teal)
--color-display: #34495e (Dark Gray)
--color-table: #1abc9c (Cyan)
--color-editor: #8e44ad (Violet)
```

## Data Flow

```
┌─────────────────────────────────────┐
│  User Login → /imogi-login          │
└─────────────────────────┬───────────┘
                          ↓
┌─────────────────────────────────────┐
│  Redirect to /module-select         │
│  (from login index.js)              │
└─────────────────────────┬───────────┘
                          ↓
┌─────────────────────────────────────┐
│  Load www/shared/module-select      │
│  Context: index.py                  │
└─────────────────────────┬───────────┘
                          ↓
┌─────────────────────────────────────┐
│  Fetch from APIs:                   │
│  - get_available_modules()          │
│  - get_user_branch_info()           │
│  - get_active_pos_opening()         │
└─────────────────────────┬───────────┘
                          ↓
┌─────────────────────────────────────┐
│  React: App.jsx + Components        │
│  - Render modules grid              │
│  - Show branch/POS info             │
│  - Handle module click              │
└─────────────────────────┬───────────┘
                          ↓
┌─────────────────────────────────────┐
│  User clicks module                 │
│  - Store selections (localStorage) │
│  - Navigate to module URL           │
└─────────────────────────────────────┘
```

## localStorage Keys

```javascript
localStorage.setItem('imogi_selected_branch', branch)
localStorage.setItem('imogi_selected_module', module_type)
localStorage.setItem('imogi_device_type', device)  // Still used by old flow
```

## Styling Breakdown

### Responsive Design
- **Desktop**: 2-column layout (sidebar + content)
- **Tablet (≤1024px)**: Sidebar becomes row, full-width modules
- **Mobile (≤768px)**: Single column, full-width everything
- **Small Mobile (≤480px)**: Optimized spacing and font sizes

### Color Scheme
- Primary: #fe9c2b (Orange)
- Secondary: #2c3e50 (Dark Blue)
- Success: #27ae60 (Green)
- Light BG: #f5f6fa

## Integration with Existing Code

### Old Device-Select Flow (Deprecated)
```
Device Select → Opening Balance → Service Select → App
```

### New Module-Select Flow (Current)
```
Login → Module Select → Directly to App
(Service Select still used by Kiosk internally, but hidden from UI)
```

The old `/device-select` route still works but is not used as primary flow.

## Files Modified

1. **New Files Created**:
   - `src/apps/module-select/App.jsx`
   - `src/apps/module-select/main.jsx`
   - `src/apps/module-select/styles.css`
   - `src/apps/module-select/components/BranchSelector.jsx`
   - `src/apps/module-select/components/POSInfoCard.jsx`
   - `src/apps/module-select/components/ModuleCard.jsx`
   - `src/apps/module-select/components/index.js`
   - `imogi_pos/api/module_select.py`
   - `imogi_pos/www/shared/module-select/index.py`

2. **Modified Files**:
   - `imogi_pos/hooks.py` - Added module-select route
   - `imogi_pos/www/shared/login/index.js` - Changed fallback redirect to /module-select

## Security Considerations

- ✅ All APIs require authenticated user
- ✅ Modules filtered by actual Frappe roles
- ✅ Branch selection validated on backend
- ✅ No credentials exposed in localStorage
- ✅ HTTP-only session cookies for auth

## Future Enhancements

1. **Module Shortcuts**
   - Frequently used modules at top
   - Recently accessed modules

2. **Module Search**
   - Search/filter modules by name

3. **Keyboard Navigation**
   - Tab through modules
   - Enter to open

4. **Analytics**
   - Track module access patterns
   - Usage dashboard

5. **Module Customization**
   - User can reorder modules
   - Hide/show modules preference
