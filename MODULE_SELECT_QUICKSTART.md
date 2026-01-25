# Module Select - Quick Start Guide

## What's New?

**Old Flow**: Login → Device Select → Opening Balance → Service Select → App

**New Flow**: Login → **Module Select** → App (directly)

## Module Select Features

### 1. Show All Available Modules
User hanya melihat modules yang sesuai dengan role mereka:
- Cashier → Cashier Console, Waiter, Kitchen
- Waiter → Waiter, Kitchen, Table Display
- Kitchen → Kitchen, Table Display
- System Manager → Semua modules

### 2. Branch Selector (di Sidebar)
```
[Dropdown: Select Branch]
Current: Jakarta Branch
```
- Change branch → Automatic reload
- Stored di User.imogi_default_branch

### 3. Active POS Info (di Sidebar)
```
┌─────────────────────┐
│  🟢 Active         │
│  Profile: Counter  │
│  Opening Balance:  │
│  Rp 500.000       │
│  Opened at: 08:30 │
│  [View Details →] │
└─────────────────────┘
```
- Auto-fetch POS Opening Entry terbaru
- Click "View Details" → Go to POS Opening Entry form

### 4. User Profile Card (di Sidebar)
```
┌──────────────────┐
│      [A]         │ ← Avatar (inisial)
│  Adem Pratama    │ ← Nama
│  adem@imogi.com  │ ← Email
└──────────────────┘
```

### 5. Module Cards (di Main Content)
```
┌─────────────────────────────┐
│  🏪 Cashier Console         │ ← Icon + Name
│  Manage orders and payments │ ← Description
│  🔒 Requires POS Session    │ ← Badge
│                           → │ ← Click to open
└─────────────────────────────┘
```

## File Structure

```
src/apps/module-select/
├── App.jsx                          # Main logic
├── main.jsx                         # Entry
├── styles.css                       # All styling (1000+ lines)
└── components/
    ├── BranchSelector.jsx           # Branch dropdown
    ├── POSInfoCard.jsx              # Show POS status
    ├── ModuleCard.jsx               # Module card
    └── index.js

imogi_pos/
├── api/module_select.py             # 4 endpoints
├── www/shared/module-select/
│   └── index.py                     # Page context
└── hooks.py                         # +1 route
```

## Available Modules

| Module | Roles | Description |
|--------|-------|-------------|
| **Cashier** | Cashier, Manager, Admin | Process payments |
| **Waiter** | Waiter, Manager, Admin | Create orders |
| **Kitchen** | Kitchen, Manager, Admin | View KOT tickets |
| **Kiosk** | Kiosk, Manager, Admin | Self-service |
| **Self-Order** | All | QR ordering |
| **Table Display** | Waiter, Manager, Admin | Table status |
| **Customer Display** | All | Payment display |

> **Note**: Table Layout Editor is a separate standalone app accessed via `/table_layout_editor`

## Backend APIs

### Endpoint 1: Get Available Modules
```
GET /api/method/imogi_pos.api.module_select.get_available_modules
```
Returns: List of available modules + user roles

### Endpoint 2: Get Branch Info
```
GET /api/method/imogi_pos.api.module_select.get_user_branch_info
```
Returns: Current branch + available branches

### Endpoint 3: Get Active POS Opening
```
GET /api/method/imogi_pos.api.module_select.get_active_pos_opening?branch=Jakarta
```
Returns: Active POS opening entry info

### Endpoint 4: Set User Branch
```
POST /api/method/imogi_pos.api.module_select.set_user_branch
Args: branch=Jakarta Branch
```
Returns: Success message

## How to Build

```bash
# Build React app
npm run build:module-select

# Or watch mode
npm run watch:module-select
```

Output: `imogi_pos/public/react/module-select/`

## Styling System

### Layout
- Header (fixed, 60px)
- Main (flex, 2-column)
  - Sidebar (300px)
  - Content (flex: 1)
- Footer (40px)

### Colors
```css
Primary: #fe9c2b (Orange)
Success: #27ae60 (Green)
Info: #3498db (Blue)
Warning: #e67e22 (Orange)
Error: #e74c3c (Red)
```

### Responsive
```
Desktop   (1400px): 2-column
Tablet    (768px):  1-column
Mobile    (480px):  Optimized
```

## localStorage Usage

```javascript
// After selecting branch
localStorage.setItem('imogi_selected_branch', 'Jakarta Branch')

// After clicking module
localStorage.setItem('imogi_selected_module', 'cashier')
```

## Testing Checklist

- [ ] Login as Cashier → See only Cashier-allowed modules
- [ ] Login as Waiter → See only Waiter-allowed modules
- [ ] Login as Admin → See all modules
- [ ] Change branch → Page reloads with new branch
- [ ] Click module → Navigate to correct URL
- [ ] POS info shows if opening exists
- [ ] POS info says "No Active POS" if none
- [ ] User profile shows correct name/email
- [ ] Responsive on mobile (sidebar → row)
- [ ] Logout button works

## Common Issues & Solutions

### Issue 1: Modules not showing
**Solution**: Check user roles in User form. User must have at least one of the required roles.

### Issue 2: Branch dropdown empty
**Solution**: Create Company records. Branch list comes from Company doctype.

### Issue 3: POS info not showing
**Solution**: Ensure POS Opening Entry exists and is submitted (docstatus=1)

### Issue 4: Styling looks weird on mobile
**Solution**: Build is using old CSS. Run: `npm run build:module-select`

## Next Steps

After Module Select is done:
1. User can select branch from module-select
2. Service Select is still available for Kiosk (but handled internally)
3. Cashier Console gets branch context from localStorage
4. All modules receive branch info automatically

## Integration with Existing Apps

```javascript
// In other apps, read branch from localStorage
const selectedBranch = localStorage.getItem('imogi_selected_branch')

// Or from Frappe
const branch = frappe.defaults.get_defaults()['company']
```
