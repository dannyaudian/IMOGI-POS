# POS Profile Multi-Module Configuration

## Overview
Sistem IMOGI POS sekarang mendukung konfigurasi multi-module dalam 1 POS Profile. Setiap POS Profile dapat mengaktifkan beberapa module sekaligus dengan aturan yang jelas.

## Arsitektur Baru

### 1. POS Profile Configuration
**Custom Fields di POS Profile:**
- `imogi_enable_cashier` (Check) - **MANDATORY**
- `imogi_enable_waiter` (Check)
- `imogi_enable_kiosk` (Check)
- `imogi_enable_self_order` (Check)
- `imogi_enable_kitchen` (Check)
- `imogi_enable_customer_display` (Check)

**Session Scope Options:**
- `User` - Satu session per user
- `Device` - Satu session per device/browser
- `POS Profile` - Shared session untuk semua user dengan POS Profile yang sama

### 2. Module Requirements

#### Cashier Module (MANDATORY)
- Setiap POS Profile **HARUS** enable Cashier module
- Cashier menangani payment processing dan closing entry
- Tanpa Cashier, POS Profile tidak valid

#### All Modules Support Both Service Types
- Dine-In: Customer makan di tempat, pilih meja
- Takeaway: Customer bawa pulang
- Service type dipilih di **order level**, bukan module level

### 3. Flow Diagram

```
Login
  ↓
Module Select (filter by POS Profile enabled flags + user role)
  ↓
  ├─ Module requires_opening = true?
  │    ↓ YES
  │    Check POS Opening Entry exists?
  │    ↓ NO
  │    Redirect to /app/pos-opening-entry/new
  │    ↓ YES
  │    ↓
  └─ Service Select (Dine-In / Takeaway)
       ↓
       Module App (Cashier/Waiter/Kiosk/etc)
```

### 4. Implementation Details

#### Backend: `imogi_pos/api/module_select.py`

```python
@frappe.whitelist()
def get_available_modules(branch=None):
    """Get modules available to user based on role AND POS Profile enabled flags"""
    
    modules = [
        {
            "type": "cashier",
            "label": "Cashier Counter",
            "icon": "fa-cash-register",
            "description": "POS Cashier untuk transaksi dan pembayaran",
            "required_role": "Cashier",
            "url": "/service-select",
            "pos_profile_field": "imogi_enable_cashier",
            "requires_opening": True
        },
        # ... other modules
    ]
    
    # Get POS Profile for branch
    profile = frappe.get_doc('POS Profile', {'branch': branch})
    
    # Filter by role AND enabled flag
    available_modules = []
    for module in modules:
        has_role = frappe.has_permission(module['required_role'])
        pos_field = module.get('pos_profile_field')
        is_enabled = profile.get(pos_field) if pos_field else True
        
        if has_role and is_enabled:
            available_modules.append(module)
    
    return available_modules
```

#### Backend: `imogi_pos/overrides/pos_profile.py`

```python
def validate_module_compatibility(self):
    """Validate Cashier is mandatory and modules are compatible"""
    
    # Cashier is MANDATORY
    if not self.get('imogi_enable_cashier'):
        frappe.throw(_("Cashier module must be enabled in every POS Profile"))
    
    # All modules are compatible - no conflicts
    enabled = []
    if self.get('imogi_enable_cashier'): enabled.append('Cashier')
    if self.get('imogi_enable_waiter'): enabled.append('Waiter')
    if self.get('imogi_enable_kiosk'): enabled.append('Kiosk')
    # ... etc
    
    frappe.msgprint(_("Enabled modules: {0}").format(', '.join(enabled)))
```

#### Frontend: `src/apps/module-select/App.jsx`

```jsx
const handleModuleClick = (module) => {
  localStorage.setItem('imogi_selected_module', module.type)
  
  // Check if module requires POS opening
  if (module.requires_opening) {
    if (!posData || !posData.pos_opening_entry) {
      frappe.msgprint({
        title: 'POS Opening Required',
        message: 'Please open a POS session before accessing this module.',
        primary_action: {
          label: 'Open POS Session',
          action: function() {
            window.location.href = `/app/pos-opening-entry/new`
          }
        }
      })
      return
    }
  }
  
  // Navigate to module
  window.location.href = module.url
}
```

#### Frontend: `src/apps/service-select/App.jsx`

```jsx
const selectedModule = localStorage.getItem('imogi_selected_module') || 'kiosk'

const moduleUrls = {
  'cashier': '/cashier-console',
  'waiter': '/waiter-console',
  'kiosk': '/kiosk',
  'self_order': '/self-order',
  'kitchen': '/kitchen-display',
  'customer_display': '/customer-display'
}

const handleDineInComplete = (tableNumber, zone) => {
  localStorage.setItem('imogi_service_type', 'dine_in')
  localStorage.setItem('imogi_table_number', tableNumber)
  
  const moduleUrl = moduleUrls[selectedModule] || '/kiosk'
  window.location.href = `${moduleUrl}?service=dine-in`
}
```

## Configuration Example

### Scenario 1: Counter + Waiter + Kitchen
```
POS Profile: "Main Branch Counter"
├─ Branch: Main Branch
├─ Session Scope: Device
├─ Enabled Modules:
│  ├─ ✅ Cashier (mandatory)
│  ├─ ✅ Waiter
│  ├─ ✅ Kitchen
│  └─ ❌ Kiosk (disabled)
└─ Result: 
   - Counter dapat akses Cashier, Waiter, Kitchen
   - Cashier & Waiter bisa Dine-In atau Takeaway
   - Kitchen display hanya menampilkan
```

### Scenario 2: Self-Service Kiosk Only
```
POS Profile: "Kiosk Profile"
├─ Branch: Main Branch
├─ Session Scope: Device
├─ Enabled Modules:
│  ├─ ✅ Cashier (mandatory, untuk payment)
│  ├─ ✅ Kiosk
│  ├─ ✅ Customer Display
│  └─ ❌ Waiter (disabled)
└─ Result:
   - Kiosk dapat akses Kiosk module + Customer Display
   - Customer bisa pilih Dine-In atau Takeaway
   - Payment tetap via Cashier backend
```

### Scenario 3: All Modules Enabled
```
POS Profile: "Full Access"
├─ Branch: Main Branch
├─ Session Scope: User
├─ Enabled Modules:
│  ├─ ✅ Cashier
│  ├─ ✅ Waiter
│  ├─ ✅ Kiosk
│  ├─ ✅ Self Order
│  ├─ ✅ Kitchen
│  └─ ✅ Customer Display
└─ Result:
   - User bisa pilih module apa saja
   - Semua module sharing same POS Opening Entry
   - Setiap module bisa handle Dine-In dan Takeaway
```

## Migration Notes

### Removed Features
1. **Device Select** - Tidak diperlukan lagi, module selection sudah ada
2. **Opening Balance Custom App** - Diganti dengan native ERPNext POS Opening Entry
3. **Device Type Storage** - `imogi_device_type` tidak digunakan lagi

### Updated Features
1. **Service Select** - Hanya handle Dine-In vs Takeaway (tidak lagi device-specific)
2. **Module Select** - Filter by POS Profile enabled flags + check POS Opening Entry
3. **POS Profile** - Validasi Cashier mandatory + module compatibility check

### New Features
1. **Multi-Module Support** - 1 POS Profile bisa enable multiple modules
2. **POS Opening Entry Check** - Otomatis redirect jika belum open session
3. **Centralized Configuration** - Semua config di POS Profile level

## Testing Checklist

- [ ] Create POS Profile dengan Cashier disabled → Should show error
- [ ] Create POS Profile dengan multi-module enabled → Should save successfully
- [ ] Login user dengan role "Cashier" → Should see only Cashier module (if only Cashier enabled in profile)
- [ ] Login user dengan role "Waiter" → Should see only Waiter module (if only Waiter enabled)
- [ ] Click module yang requires_opening tanpa POS Opening → Should show dialog
- [ ] Click module yang requires_opening dengan POS Opening → Should navigate to Service Select
- [ ] Service Select → Pilih Dine-In → Should redirect to correct module URL
- [ ] Service Select → Pilih Takeaway → Should redirect to correct module URL
- [ ] Verify session scope "User" → Each user has separate session
- [ ] Verify session scope "Device" → Each device has separate session
- [ ] Verify session scope "POS Profile" → All users share same session

## Benefits

1. **Simplified Management** - 1 POS Profile untuk multiple modules
2. **Centralized Control** - Enable/disable module di POS Profile level
3. **Better UX** - User hanya lihat module yang enabled dan accessible
4. **Native Integration** - Pakai ERPNext POS Opening Entry (standard)
5. **Flexibility** - Setiap module bisa Dine-In atau Takeaway
6. **Mandatory Cashier** - Ensure payment processing always available

## API Reference

### `get_available_modules(branch)`
Returns list of modules user can access based on:
- User role
- POS Profile enabled flags for the branch

### `get_active_pos_opening(branch)`
Returns current POS Opening Entry for:
- User (if scope = "User")
- Device (if scope = "Device")
- POS Profile (if scope = "POS Profile")

### POS Profile Custom Fields
- `imogi_enable_cashier` - Enable Cashier module (MANDATORY)
- `imogi_enable_waiter` - Enable Waiter module
- `imogi_enable_kiosk` - Enable Kiosk module
- `imogi_enable_self_order` - Enable Self Order module
- `imogi_enable_kitchen` - Enable Kitchen Display
- `imogi_enable_customer_display` - Enable Customer Display

## Support
For issues or questions, check:
- Backend validation: [pos_profile.py](imogi_pos/overrides/pos_profile.py#L45-L60)
- Module filtering: [module_select.py](imogi_pos/api/module_select.py#L15-L80)
- UI logic: [module-select/App.jsx](src/apps/module-select/App.jsx#L45-L72)
