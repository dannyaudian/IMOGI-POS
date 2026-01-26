# Frappe Assistant Core - Debug Prompt untuk IMOGI POS Customer Display Editor Issue

## 🎯 Objektif
Saya memerlukan bantuan untuk mendiagnosis dan memperbaiki masalah pada **Customer Display Editor** di aplikasi IMOGI POS (ERPNext v15 + React apps). Masalah yang mungkin terjadi:

1. **Akses Issue**: User tidak bisa mengakses Customer Display Editor dari workspace/menu
2. **Loading Issue**: Page terbuka tapi tidak load data profiles/devices
3. **Save Issue**: Perubahan konfigurasi tidak tersimpan
4. **Permission Issue**: Error "access denied" padahal user sudah punya role yang benar
5. **Profile Issue**: Error "Profile not found" atau "Config not loaded"

---

## 📋 Konteks Aplikasi

### Arsitektur Customer Display Editor
- **Framework**: ERPNext v15 + Frappe + React (Vite-based)
- **Frontend**: React app di `src/apps/customer-display-editor/`
- **Backend**: Python API di `imogi_pos/api/customer_display_editor.py`
- **Authentication**: Requires "Branch Manager" atau "System Manager" role
- **Purpose**: Configuration editor untuk customer-facing display screens (layar untuk customer lihat order)

### URL & Routes
- **Public URL**: `/customer_display_editor`
- **Alternative URL**: `/customer-display-editor` atau `/devices/customer-display-editor`
- **API Endpoints**: 
  - `imogi_pos.api.customer_display_editor.get_available_devices` - Get all profiles
  - `imogi_pos.api.customer_display_editor.get_device_config` - Load config
  - `imogi_pos.api.customer_display_editor.save_device_config` - Save config
  - `imogi_pos.api.customer_display_editor.create_profile` - Create new profile
  - `imogi_pos.api.customer_display_editor.get_display_templates` - Get templates

### Struktur Aplikasi
```
imogi_pos/
├── www/
│   └── customer_display_editor/
│       ├── index.py               # Page context (auth decorator @require_roles)
│       ├── index.html             # HTML template
│       └── index.js               # (if exists)
├── api/
│   ├── customer_display_editor.py # Editor API endpoints
│   └── customer_display.py        # Runtime display API (untuk actual display device)
├── imogi_pos/doctype/
│   └── customer_display_profile/  # DocType: Customer Display Profile
│       └── customer_display_profile.py
└── src/                           # React source
    └── apps/
        └── customer-display-editor/
            ├── App.jsx            # Main React component
            ├── main.jsx           # React entry point
            ├── styles.css
            └── components/
                ├── DeviceSelector.jsx
                ├── PreviewPanel.jsx
                ├── TemplateSelector.jsx
                └── ConfigPanel.jsx
```

---

## 🐛 Kemungkinan Masalah yang Dicek

### Problem 1: Cannot Access Customer Display Editor Page

#### Gejala
- User klik link/menu ke Customer Display Editor
- Page tidak load / redirect ke error page
- Atau blank page / stuck loading
- Error: "POS Profile not configured" (incorrect - should not require POS Profile)

#### File Terkait
**File**: `imogi_pos/www/customer_display_editor/index.py`
```python
@require_roles("Branch Manager", "System Manager")
def get_context(context):
    """Context builder for customer display editor page."""
    try:
        pos_profile = get_pos_profile()  # ⚠️ Potential issue - may not be needed
        
        if not pos_profile:
            set_setup_error(context, "pos_profile", page_name=_("Customer Display Editor"))
            context.title = _("Customer Display Editor")
            return context
        
        # Get branding, branch, domain
        branding = get_branding_info(pos_profile)
        branch = get_current_branch(pos_profile)
        
        # Add React bundle URLs and initial state
        add_react_context(context, 'customer-display-editor', {
            'posProfile': pos_profile.name if pos_profile else None,
            'branch': branch,
            'domain': domain,
            'branding': branding
        })
```

**Issue**: Customer Display Editor seharusnya **TIDAK memerlukan POS Profile** untuk akses, karena ini adalah configuration tool yang independent. POS Profile hanya diperlukan untuk **actual display device** saat runtime.

**Cek Points**:
1. Apakah user punya role "Branch Manager" atau "System Manager"?
2. Apakah `get_pos_profile()` function incorrectly required?
3. Apakah React build sudah ter-generate?
4. Apakah ada error di Frappe log?

---

### Problem 2: Page Loads but No Profiles/Devices Listed

#### Gejala
- Customer Display Editor page terbuka
- Sidebar kosong / no devices shown
- Atau loading indicator terus-menerus
- Error: "No profiles available"

#### React Component Logic
**File**: `src/apps/customer-display-editor/App.jsx`
```jsx
function App() {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Branch Manager', 'System Manager'])
  
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [config, setConfig] = useState({})
  
  // API Hooks
  const { data: profilesData, isLoading: loadingProfiles, mutate: refreshProfiles } = useCustomerDisplayProfiles()
  const { data: templates, isLoading: loadingTemplates } = useDisplayTemplates()
  
  // Extract profiles array from API response
  const profiles = Array.isArray(profilesData?.devices) ? profilesData.devices : []
  
  if (authError || !hasAccess) {
    return <div>Access denied - Manager role required</div>
  }
  
  // Render device list in sidebar...
}
```

#### API Call Hook
**File**: `src/shared/api/imogi-api.js`
```javascript
export function useCustomerDisplayProfiles() {
  return useFrappeGetCall(
    'imogi_pos.api.customer_display_editor.get_available_devices',
    null,
    'customer-display-profiles',
    {
      revalidateOnFocus: false,
      refreshInterval: 30000
    }
  )
}
```

**Backend API**: `imogi_pos/api/customer_display_editor.py`
```python
@frappe.whitelist()
def get_available_devices():
    """Get list of all Customer Display Profiles"""
    if not frappe.has_permission('Customer Display Profile', 'read'):
        frappe.throw(_('No permission to read Customer Display Profile'))
    
    profiles = frappe.get_all(
        'Customer Display Profile',
        filters={'is_active': 1},
        fields=['name', 'profile_name', 'branch', 'description', 'layout_type', ...]
    )
    
    # Format for compatibility with frontend
    devices = []
    for profile in profiles:
        profile_doc = frappe.get_doc('Customer Display Profile', profile.name)
        
        # Build config from profile fields
        config = {
            'layout_type': profile.layout_type or 'Grid',
            'grid_columns': profile.grid_columns or 3,
            # ... all config fields
        }
        
        devices.append({
            'name': profile.name,
            'profile_name': profile.profile_name,
            'branch': profile.branch,
            'config': config
        })
    
    return {'devices': devices, 'total': len(devices)}
```

**Cek Points**:
1. Apakah API `get_available_devices` mengembalikan data yang benar?
2. Apakah ada Customer Display Profile records di database?
3. Apakah user punya read permission untuk "Customer Display Profile"?
4. Apakah response format `{ devices: [...], total: N }` sesuai yang expected?

---

### Problem 3: Configuration Cannot Be Saved

#### Gejala
- User pilih device/profile
- User ubah config (colors, layout, etc)
- Klik "Save" tapi error atau tidak tersimpan
- Atau save berhasil tapi config hilang setelah refresh

#### Save Function
**File**: `src/apps/customer-display-editor/App.jsx`
```jsx
const handleSave = async () => {
  if (!selectedDevice) return

  try {
    await saveConfig({
      device: selectedDevice,
      config: config
    })
    
    frappe.show_alert({
      message: 'Configuration saved successfully',
      indicator: 'green'
    })
    
    setHasChanges(false)
    await refreshProfiles()
  } catch (error) {
    frappe.show_alert({
      message: error.message || 'Failed to save configuration',
      indicator: 'red'
    })
  }
}
```

**Backend API**: `imogi_pos/api/customer_display_editor.py`
```python
@frappe.whitelist()
def save_device_config(device, config=None):
    """Save configuration to Customer Display Profile"""
    if not frappe.has_permission('Customer Display Profile', 'write'):
        frappe.throw(_('No permission to write Customer Display Profile'))
    
    # Parse config if string
    if isinstance(config, str):
        config = json.loads(config)
    
    profile_doc = frappe.get_doc('Customer Display Profile', device)
    
    # Update profile fields from config
    if 'layout_type' in config:
        profile_doc.layout_type = config['layout_type']
    if 'grid_columns' in config:
        profile_doc.grid_columns = config['grid_columns']
    # ... update all config fields
    
    profile_doc.save(ignore_permissions=True)
    
    return {
        'success': True,
        'message': _('Configuration saved successfully')
    }
```

**Cek Points**:
1. Apakah user punya write permission untuk "Customer Display Profile"?
2. Apakah `config` object format valid?
3. Apakah semua config fields ter-map ke profile_doc fields dengan benar?
4. Apakah ada validation error di backend?
5. Apakah profile_doc.save() berhasil?

---

### Problem 4: Cannot Create New Profile

#### Gejala
- User klik "Create New" atau "+" button
- Template selector modal tidak muncul
- Atau modal muncul tapi create profile gagal
- Error: "Profile creation failed"

#### Create Profile Function
**File**: `src/apps/customer-display-editor/App.jsx`
```jsx
const handleTemplateSelect = async (data) => {
  if (!data) {
    setShowTemplateSelector(false)
    return
  }

  const { template, profile_name, branch } = data

  try {
    const result = await createProfile({
      profile_name,
      branch,
      template_id: template?.id,
      config: template?.config
    })

    if (result.success) {
      frappe.show_alert({ message: 'Profile created successfully', indicator: 'green' })
      await refreshProfiles()
      setSelectedDevice(result.profile.name)
      setShowTemplateSelector(false)
    }
  } catch (error) {
    frappe.show_alert({ message: error.message || 'Failed to create profile', indicator: 'red' })
  }
}
```

**Backend API**: `imogi_pos/api/customer_display_editor.py`
```python
@frappe.whitelist()
def create_profile(profile_name, branch, template_id=None, config=None):
    """Create new Customer Display Profile"""
    if not frappe.has_permission('Customer Display Profile', 'write'):
        frappe.throw(_('No permission to create Customer Display Profile'))
    
    # Check if profile with same name exists
    if frappe.db.exists('Customer Display Profile', profile_name):
        frappe.throw(_('Profile with name {0} already exists').format(profile_name))
    
    # Create new profile
    profile_doc = frappe.new_doc('Customer Display Profile')
    profile_doc.profile_name = profile_name
    profile_doc.branch = branch
    profile_doc.is_active = 1
    
    # Apply template if provided
    if template_id:
        template = get_template_by_id(template_id)
        if template and template.get('config'):
            # Apply template config to profile
            for key, value in template['config'].items():
                setattr(profile_doc, key, value)
    
    # Apply custom config if provided
    if config:
        for key, value in config.items():
            setattr(profile_doc, key, value)
    
    profile_doc.insert(ignore_permissions=True)
    
    return {
        'success': True,
        'profile': {
            'name': profile_doc.name,
            'profile_name': profile_doc.profile_name,
            'branch': profile_doc.branch
        }
    }
```

**Cek Points**:
1. Apakah user punya write permission?
2. Apakah branch name valid?
3. Apakah template_id valid (jika digunakan)?
4. Apakah config fields valid?
5. Apakah Customer Display Profile doctype ter-configure dengan benar?

---

### Problem 5: Preview Panel Not Updating

#### Gejala
- User ubah config (colors, layout, etc)
- Preview panel tidak update / tetap menampilkan old config
- Atau preview panel kosong / error

#### Preview Component
**File**: `src/apps/customer-display-editor/components/PreviewPanel.jsx`
```jsx
export function PreviewPanel({ config, sampleData }) {
  // Render preview based on config and sample data
  return (
    <div className="preview-container" style={{
      backgroundColor: config.backgroundColor,
      color: config.textColor
    }}>
      {/* Render items, prices, branding based on config */}
    </div>
  )
}
```

**Sample Data Loading**: `src/apps/customer-display-editor/App.jsx`
```jsx
useEffect(() => {
  if (selectedDevice) {
    frappe.call({
      method: 'imogi_pos.api.customer_display_editor.get_preview_data',
      args: { device: selectedDevice, sample_type: 'restaurant' },
      callback: (r) => {
        if (r.message) {
          setSampleData(r.message)
        }
      }
    })
  }
}, [selectedDevice])
```

**Cek Points**:
1. Apakah `config` prop ter-pass dengan benar ke PreviewPanel?
2. Apakah sampleData loaded?
3. Apakah React re-render triggered saat config berubah?
4. Apakah styling applied dengan benar?

---

## 🔍 Debugging Steps yang Diminta

### Step 1: Check User Access & Roles
```python
# Di Frappe Console, jalankan:
frappe.get_roles(frappe.session.user)

# Expected output: 
['Branch Manager', 'System Manager', ...]
```

```sql
-- Check role assignment di database
SELECT * FROM `tabHas Role` 
WHERE parent = 'user@example.com' 
AND role IN ('Branch Manager', 'System Manager');
```

### Step 2: Check Page Access
```
1. Access URL: https://[site]/customer_display_editor
2. Check browser console untuk errors
3. Check Network tab:
   - Request ke /customer_display_editor → status 200?
   - Request ke React bundle assets → status 200?
4. Check Frappe logs untuk errors
```

### Step 3: Check React Build
```bash
# Verify React build exists
ls -la imogi_pos/public/react/customer-display-editor/

# Expected files:
# - .vite/manifest.json
# - static/js/main.[hash].js
# - static/css/main.[hash].css

# If missing, rebuild:
npm run build:customer-display-editor
```

### Step 4: Check Backend API
```python
# Test API di Frappe console
frappe.call('imogi_pos.api.customer_display_editor.get_available_devices')

# Expected response:
{
  'devices': [
    {
      'name': 'PROFILE-001',
      'profile_name': 'Display Counter 1',
      'branch': 'Main Branch',
      'config': { ... }
    }
  ],
  'total': 1
}
```

```python
# Test save config
frappe.call('imogi_pos.api.customer_display_editor.save_device_config', 
  device='PROFILE-001',
  config={'backgroundColor': '#1f2937', 'textColor': '#ffffff'}
)

# Expected response:
{
  'success': True,
  'message': 'Configuration saved successfully'
}
```

### Step 5: Check Database State
```sql
-- Check if Customer Display Profile exists
SELECT name, profile_name, branch, is_active, layout_type 
FROM `tabCustomer Display Profile` 
LIMIT 10;

-- Check profile config fields
SELECT name, profile_name, 
       layout_type, grid_columns, grid_rows,
       override_brand, brand_name, brand_color_primary
FROM `tabCustomer Display Profile`;
```

### Step 6: Check Permissions
```python
# Check permission untuk Customer Display Profile
frappe.has_permission('Customer Display Profile', 'read')
frappe.has_permission('Customer Display Profile', 'write')
frappe.has_permission('Customer Display Profile', 'create')

# Get permission details
frappe.get_doc('DocPerm', {
  'parent': 'Customer Display Profile',
  'role': 'Branch Manager'
})
```

---

## 📝 File-file Penting untuk Review

### Critical Files
1. `imogi_pos/www/customer_display_editor/index.py` - Page context & auth ⚠️ (check POS Profile requirement)
2. `src/apps/customer-display-editor/App.jsx` - Main React component
3. `imogi_pos/api/customer_display_editor.py` - Backend API endpoints
4. `src/shared/api/imogi-api.js` - API hooks (`useCustomerDisplayProfiles`, etc)
5. `src/shared/hooks/useAuth.js` - Authentication hook
6. `src/apps/customer-display-editor/components/` - React sub-components

### Supporting Files
7. `imogi_pos/imogi_pos/doctype/customer_display_profile/customer_display_profile.py` - DocType controller
8. `imogi_pos/utils/auth_decorators.py` - `@require_roles` decorator
9. `imogi_pos/utils/react_helpers.py` - `add_react_context()` helper
10. `CUSTOMER_DISPLAY_EDITOR_QUICKREF.md` - Documentation reference
11. `CUSTOMER_DISPLAY_EDITOR_USAGE.md` - Usage guide

---

## 🎯 Expected Output dari Frappe Assistant

Tolong lakukan investigasi mendalam dan berikan:

1. **Root Cause Analysis**:
   - Identifikasi masalah akses: kenapa user tidak bisa buka Customer Display Editor?
   - Identifikasi masalah POS Profile: apakah requirement incorrect?
   - Identifikasi masalah data loading: kenapa profiles tidak load?
   - Identifikasi masalah save: kenapa config tidak tersimpan?

2. **Step-by-step Debugging**:
   - Command/query untuk verify setiap komponen
   - Console commands untuk test API endpoints
   - SQL queries untuk verify database state
   - Permission checks untuk verify access

3. **Rekomendasi Perbaikan**:
   - Kode yang perlu diubah/ditambah
   - Permission yang perlu di-set
   - Configuration yang perlu di-adjust
   - Fix untuk POS Profile requirement issue
   - Deployment steps untuk apply fix

4. **Testing Checklist**:
   - Cara memverifikasi bahwa masalah sudah teratasi
   - Edge cases yang perlu di-test

---

## 💡 Hint & Konteks Tambahan

### Customer Display Editor vs Customer Display (Runtime)
**IMPORTANT DISTINCTION**:
- **Customer Display Editor** (`/customer_display_editor`) = Configuration tool untuk setup display profiles
  - Should **NOT require POS Profile** to access
  - Only requires "Branch Manager" atau "System Manager" role
  - Used by managers to configure display settings
  
- **Customer Display** (actual device) = Runtime display yang ditampilkan ke customer
  - This DOES require POS Profile at runtime
  - Managed by `imogi_pos/api/customer_display.py` (different file)
  - Uses configuration from Customer Display Profile

**Potential Bug**: `index.py` may incorrectly require POS Profile for Editor access.

### Customer Display Profile Data Model
```
Customer Display Profile (DocType)
├── profile_name (str) - Display name
├── branch (Link: Branch) - Which branch this profile belongs to
├── is_active (Check) - Active status
├── layout_type (Select) - Grid | List | Compact
├── grid_columns (Int) - Number of columns
├── grid_rows (Int) - Number of rows
├── override_brand (Check) - Override global branding
├── brand_logo (Attach Image) - Custom logo
├── brand_name (Data) - Custom brand name
├── brand_color_primary (Color) - Primary color
├── brand_color_accent (Color) - Accent color
└── blocks (Child Table) - Custom content blocks
```

### React Build Process
```bash
# Build command
npm run build:customer-display-editor

# Output location
imogi_pos/public/react/customer-display-editor/

# Vite config location
vite.config.js (at project root)
```

### Common Issues
1. **Incorrect POS Profile Requirement**: Editor should not need POS Profile → remove requirement
2. **Missing React Build**: React bundle tidak ter-generate → rebuild needed
3. **Wrong Role**: User tidak punya "Branch Manager" role → assign role
4. **Missing DocType**: Customer Display Profile doctype tidak ada → install/migrate
5. **Permission Issue**: Role tidak punya permission → set permission
6. **Empty Database**: Tidak ada Customer Display Profile records → create sample profile
7. **Config Format Mismatch**: Config fields tidak sync antara frontend/backend → fix mapping

---

## 🚀 Actionable Items untuk Frappe Assistant

Tolong lakukan investigasi dengan urutan prioritas:

### Priority 1: Diagnose Access Issue
- [ ] Verify user roles dan permissions
- [ ] **Check if POS Profile requirement is incorrect** ⚠️
- [ ] Check if page loads (status 200)
- [ ] Check React bundle exists and loads
- [ ] Verify auth decorator works correctly
- [ ] Identify di mana access ter-block

### Priority 2: Diagnose Data Loading Issue
- [ ] Verify API `get_available_devices` returns data
- [ ] Check if Customer Display Profile records exist
- [ ] Verify response format matches expected structure
- [ ] Check React component state management
- [ ] Identify kenapa profiles tidak muncul di UI

### Priority 3: Diagnose Save Issue
- [ ] Verify save API `save_device_config` works
- [ ] Check write permission untuk Customer Display Profile
- [ ] Verify config format valid
- [ ] Check if all config fields mapped correctly
- [ ] Identify kenapa data tidak persist

### Priority 4: Provide Solutions
- [ ] **Fix POS Profile requirement in index.py** ⚠️
- [ ] Code fixes untuk access/auth
- [ ] Code fixes untuk data loading
- [ ] Code fixes untuk save functionality
- [ ] Permission setup instructions
- [ ] Deployment & testing instructions

---

## ✅ Success Criteria

Fix dianggap berhasil jika:
1. ✅ User dengan role "Branch Manager" bisa akses `/customer_display_editor` **tanpa POS Profile**
2. ✅ Page load dengan benar dan tampil list of profiles/devices
3. ✅ User bisa select device dan lihat preview
4. ✅ User bisa ubah config (colors, layout, etc) dan lihat live preview
5. ✅ Click "Save Configuration" → data tersimpan ke database
6. ✅ Refresh page → config tetap persist (tidak hilang)
7. ✅ User bisa create new profile dari template
8. ✅ Tidak ada error di browser console atau Frappe logs

---

**Terima kasih atas bantuannya! 🙏**

Silakan mulai investigasi dari Priority 1 dan berikan finding + rekomendasi untuk setiap step.
