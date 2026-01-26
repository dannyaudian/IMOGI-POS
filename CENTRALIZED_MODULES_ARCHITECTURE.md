# IMOGI POS - Centralized Modules & Profile Edit Flow

## 📋 Flow Edit Profile yang Sudah Ada

### 1. **Load Profiles** (Automatic)
```javascript
useCustomerDisplayProfiles()
// GET: imogi_pos.api.customer_display_editor.get_available_devices
// Returns: { devices: [...], total: N }
// Each device sudah include config field!
```

### 2. **Select Profile dari Sidebar**
```javascript
onClick={() => onDeviceSelect(device.name)}
// Trigger: setSelectedDevice(device.name)
```

### 3. **Auto-load Config** (useEffect)
```javascript
useEffect(() => {
  if (selectedDevice && profiles.length > 0) {
    const device = profiles.find(p => p.name === selectedDevice)
    if (device && device.config) {
      setConfig(device.config)  // ✅ Config otomatis loaded
      setHasChanges(false)
    }
  }
}, [selectedDevice, profiles])
```

### 4. **Edit Config**
- User ubah settings di ConfigPanel
- Trigger: `handleConfigChange(key, value)`
- State: `setHasChanges(true)`

### 5. **Save Changes**
```javascript
handleSave() {
  saveConfig({
    device: selectedDevice,  // Profile name
    config: config           // Updated config object
  })
  // POST: imogi_pos.api.customer_display_editor.save_device_config
}
```

### 6. **Backend Update**
```python
def save_device_config(device, config):
    profile_doc = frappe.get_doc('Customer Display Profile', device)
    
    # Update fields dari config
    profile_doc.layout_type = config['layout_type']
    profile_doc.grid_columns = config['grid_columns']
    # ... dst
    
    profile_doc.save(ignore_permissions=True)
```

---

## 🏢 Centralized Modules

### 1. **Authentication (`useAuth`)**

**Location**: `src/shared/hooks/useAuth.js`

**Features**:
- ✅ Cookie-based authentication (same domain)
- ✅ Auto-redirect to login jika guest
- ✅ Role-based access control
- ✅ CSRF token handling

**Usage**:
```javascript
import { useAuth } from '../../shared/hooks/useAuth'

const { user, loading, hasAccess, error } = useAuth(['Branch Manager', 'System Manager'])

if (authLoading) return <Loading />
if (!hasAccess) return <AccessDenied />
```

**Backend Helper**: `imogi_pos/utils/auth_helpers.py`
```python
get_user_role_context()
get_role_based_default_route()
```

---

### 2. **Branding (`get_branding`)**

**Location**: `imogi_pos/api/public.py`

**Centralized Settings**:
```python
@frappe.whitelist()
def get_branding(pos_profile=None):
    # Priority order:
    # 1. POS Profile branding (jika override)
    # 2. Restaurant Settings branding
    # 3. Company logo
    
    return {
        "brand_name": "...",
        "logo": "...",
        "logo_dark": "...",
        "primary_color": "#...",
        "accent_color": "#...",
        "header_bg": "#...",
        "show_header": True,
        "home_url": "...",
        "css_vars": "..."
    }
```

**Override per POS Profile**:
```
POS Profile fields:
- imogi_brand_name
- imogi_brand_logo
- imogi_brand_logo_dark
- imogi_brand_color_primary
- imogi_brand_color_accent
- imogi_brand_header_bg
- imogi_show_header_on_pages
- imogi_brand_home_url
- imogi_brand_css_vars
```

**Utils**: `imogi_pos/utils/branding.py`
```python
PRIMARY_COLOR = "#6366f1"
ACCENT_COLOR = "#8b5cf6"
HEADER_BG_COLOR = "#0f172a"
```

---

### 3. **Permissions (`validate_api_permission`)**

**Location**: `imogi_pos/utils/permissions.py`

**Features**:
- ✅ Branch-level access control
- ✅ Role-based permissions
- ✅ DocType permissions
- ✅ Decorators untuk API

**Functions**:
```python
validate_branch_access(branch, user=None)
validate_api_permission(doctype, perm_type='read')
check_pos_profile_access(pos_profile)
get_user_branches()
```

**Decorators**: `imogi_pos/utils/decorators.py`
```python
@require_permission('Customer Display Profile', 'write')
def my_api_function():
    pass

@require_role(['Branch Manager', 'System Manager'])
def admin_function():
    pass
```

---

### 4. **API Provider (`ImogiPOSProvider`)**

**Location**: `src/shared/providers/ImogiPOSProvider.jsx`

**Features**:
- ✅ FrappeProvider wrapper
- ✅ Cookie-based auth (useToken: false)
- ✅ Same-domain setup
- ✅ Auto CSRF handling

**Usage**:
```jsx
import { ImogiPOSProvider } from './shared/providers/ImogiPOSProvider'

<ImogiPOSProvider>
  <App />
</ImogiPOSProvider>
```

---

### 5. **API Hooks (`imogi-api.js`)**

**Location**: `src/shared/api/imogi-api.js`

**Centralized API Calls**:
```javascript
// Frappe SDK wrappers
useFrappeGetCall()     // GET with SWR caching
useImogiAPI()          // POST with mutations

// Custom hooks
useCustomerDisplayProfiles()
useDisplayTemplates()
useSaveDisplayConfig()
useCreateProfile()
useDuplicateProfile()
usePendingOrders()
useOrderDetails()
// ... 20+ API hooks
```

**Benefits**:
- ✅ Automatic caching (SWR)
- ✅ Auto-revalidation
- ✅ Error handling
- ✅ Loading states
- ✅ Type-safe

---

## 🎯 Customer Display Profile - Complete Flow

### Create Profile Flow
```
1. Click "Create New Profile"
2. Select Template (Modern Dark/Light/etc)
3. Form Input (Profile Name + Branch)
4. API: create_profile()
5. DocType: Customer Display Profile created
6. Auto-select & load config
7. Ready to edit
```

### Edit Profile Flow
```
1. Profiles loaded with config (get_available_devices)
2. Click profile di sidebar
3. Config auto-loaded ke state
4. Edit settings (Layout/Theme/Advanced tabs)
5. Changes tracked (hasChanges = true)
6. Click "Save"
7. API: save_device_config()
8. DocType updated
9. Refresh profiles list
10. Success message
```

### Duplicate Profile Flow
```
1. Select existing profile
2. Click "Duplicate"
3. Enter new name & branch
4. API: duplicate_profile()
5. Copy all settings from source
6. New profile created
7. Auto-select new profile
```

---

## 📦 Shared Components

**Location**: `src/shared/components/`

### UI Components
```
src/shared/components/UI/
├── LoadingSpinner.jsx
├── ErrorMessage.jsx
├── Button.jsx
├── Card.jsx
└── Modal.jsx
```

### Form Components
```
src/shared/components/Forms/
├── Input.jsx
├── Select.jsx
├── Checkbox.jsx
└── ColorPicker.jsx
```

---

## 🔒 Permission Hierarchy

```
System Manager
  └─ Can do everything
  
Branch Manager
  ├─ Manage own branch profiles
  ├─ View all profiles
  └─ Edit own branch settings
  
POS User
  ├─ View profiles (read-only)
  └─ Use assigned profiles
```

---

## 🗂️ DocTypes with Centralized Settings

### Customer Display Profile
- Uses centralized branding
- Branch-level access
- Role-based permissions

### POS Profile
- Brand override fields
- Color customization
- Logo management

### Restaurant Settings
- Global branding fallback
- Default colors
- Company-wide settings

---

## 🎨 CSS Variables (Centralized)

**Location**: Each app's `styles.css`

```css
:root {
  --cde-primary: #6366f1;      /* From branding */
  --cde-accent: #8b5cf6;       /* From branding */
  --cde-bg: #ffffff;
  --cde-text: #0f172a;
  --cde-border: #e2e8f0;
  /* ... */
}
```

**Dynamic Injection**:
```javascript
// Apply branding to CSS vars
const branding = await getBranding(pos_profile)
document.documentElement.style.setProperty('--primary', branding.primary_color)
```

---

## ✅ Checklist - Centralized Features

- ✅ **Authentication**: `useAuth` hook
- ✅ **Branding**: `get_branding()` API
- ✅ **Permissions**: `validate_api_permission()`
- ✅ **API Provider**: `ImogiPOSProvider`
- ✅ **API Hooks**: `imogi-api.js`
- ✅ **Role Management**: `auth_helpers.py`
- ✅ **Branch Access**: `permissions.py`
- ✅ **CSRF Tokens**: Auto-handled
- ✅ **Error Handling**: Centralized
- ✅ **Loading States**: SWR managed
- ✅ **Caching**: SWR automatic
- ✅ **Revalidation**: On focus/interval

---

## 🚀 Next Steps untuk Customer Display Editor

1. ✅ Create profile - DONE
2. ✅ Edit profile - DONE (auto-load config)
3. ✅ Save changes - DONE
4. ✅ Duplicate - DONE
5. ✅ Reset - DONE
6. ✅ Test display - DONE
7. ⏳ Advanced config (blocks, custom CSS)
8. ⏳ Preview dengan real data
9. ⏳ Export/Import templates
10. ⏳ Profile permissions per user

---

**Status**: Customer Display Editor with Full CRUD + Centralized Architecture ✅
