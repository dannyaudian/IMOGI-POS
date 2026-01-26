# Frappe Assistant Core - Debug Prompt untuk IMOGI POS Table Layout Editor Issue

## 🎯 Objektif
Saya memerlukan bantuan untuk mendiagnosis dan memperbaiki masalah pada **Table Layout Editor** di aplikasi IMOGI POS (ERPNext v15 + React apps). Masalah yang mungkin terjadi:

1. **Akses Issue**: User tidak bisa mengakses Table Layout Editor dari workspace/menu
2. **Loading Issue**: Page terbuka tapi tidak load data tables/layout
3. **Save Issue**: Perubahan layout tidak tersimpan
4. **Permission Issue**: Error "access denied" padahal user sudah punya role yang benar

---

## 📋 Konteks Aplikasi

### Arsitektur Table Layout Editor
- **Framework**: ERPNext v15 + Frappe + React (Vite-based)
- **Frontend**: React app di `src/apps/table-layout-editor/`
- **Backend**: Python API di `imogi_pos/api/layout.py` & `imogi_pos/table/layout_service.py`
- **Authentication**: Requires "Branch Manager" atau "System Manager" role
- **Purpose**: Visual editor untuk mengatur posisi meja restaurant pada layout floor

### URL & Routes
- **Public URL**: `/table_layout_editor`
- **Direct URL**: `/table-layout-editor` (alternative)
- **API Endpoints**: 
  - `imogi_pos.api.layout.get_table_layout` - Load layout
  - `imogi_pos.api.layout.save_table_layout` - Save layout
  - `imogi_pos.api.layout.get_floors` - Get available floors
  - `imogi_pos.table.layout_service.TableLayoutService` - Core service

### Struktur Aplikasi
```
imogi_pos/
├── www/
│   └── table_layout_editor/
│       ├── index.py               # Page context (auth decorator @require_roles)
│       ├── index.html             # HTML template
│       └── index.js               # (if exists)
├── api/
│   └── layout.py                  # Layout API endpoints
├── table/
│   └── layout_service.py          # TableLayoutService class
├── imogi_pos/doctype/
│   └── table_layout_profile/      # DocType: Table Layout Profile
│       └── table_layout_profile.py
└── src/                           # React source
    └── apps/
        └── table-layout-editor/
            ├── App.jsx            # Main React component
            ├── main.jsx           # React entry point
            └── styles.css
```

---

## 🐛 Kemungkinan Masalah yang Dicek

### Problem 1: Cannot Access Table Layout Editor Page

#### Gejala
- User klik link/menu ke Table Layout Editor
- Page tidak load / redirect ke error page
- Atau blank page / stuck loading

#### File Terkait
**File**: `imogi_pos/www/table_layout_editor/index.py`
```python
@require_roles("Branch Manager", "System Manager")
def get_context(context):
    """Context builder for Table Layout Editor page."""
    try:
        # Get branding info
        branding = get_brand_context()
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Table Layout Editor")
        
        # Add React bundle URLs and initial state
        add_react_context(context, 'table-layout-editor', {
            'branding': branding
        })
        
        return context
    except Exception as e:
        frappe.log_error(f"Error in table_layout_editor get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Table Layout Editor"))
```

**Cek Points**:
1. Apakah user punya role "Branch Manager" atau "System Manager"?
2. Apakah React build sudah ter-generate di `imogi_pos/public/react/table-layout-editor/`?
3. Apakah `add_react_context()` function berjalan dengan benar?
4. Apakah ada error di Frappe log?

---

### Problem 2: Page Loads but No Data (Tables/Layout Not Loading)

#### Gejala
- Table Layout Editor page terbuka
- Tapi tidak ada data table yang muncul
- Atau loading indicator terus-menerus

#### React Component Logic
**File**: `src/apps/table-layout-editor/App.jsx`
```jsx
function TableLayoutEditorContent({ initialState }) {
  const { user, loading: authLoading, hasAccess, error: authError } = useAuth(['Branch Manager', 'System Manager'])
  
  const branch = initialState.branch || 'Default'
  const { data: tables, error: tablesError, isLoading: tablesLoading, mutate } = useTables(branch)
  
  if (authLoading) {
    return <LoadingSpinner message="Authenticating..." />
  }

  if (authError || !hasAccess) {
    return <ErrorMessage error={authError || 'Access denied - Manager role required'} />
  }
  
  // Render table layout...
}
```

#### API Call Hook
**File**: `src/shared/api/imogi-api.js`
```javascript
export function useTables(posProfile, branch = null) {
  return useFrappeGetCall(
    'imogi_pos.api.layout.get_tables',
    { pos_profile: posProfile, branch },
    `tables-${posProfile}`,
    {
      refreshInterval: 10000,
      revalidateOnFocus: true
    }
  )
}
```

**Backend API**: `imogi_pos/api/layout.py`
```python
@frappe.whitelist()
def get_tables(pos_profile=None, branch=None):
    """Get simple table list with status (direct query, no layout)"""
    # Validate branch access
    # Query tables from Restaurant Table doctype
```

**Cek Points**:
1. Apakah API `get_tables` mengembalikan data yang benar?
2. Apakah parameter `branch` atau `pos_profile` valid?
3. Apakah ada Restaurant Table records di database?
4. Apakah user punya permission untuk read "Restaurant Table"?

---

### Problem 3: Layout Cannot Be Saved

#### Gejala
- User bisa edit layout (drag tables, etc)
- Tapi saat klik "Save", error atau tidak tersimpan
- Atau save berhasil tapi data hilang setelah refresh

#### Save Function
**File**: `src/apps/table-layout-editor/App.jsx`
```jsx
const handleSaveLayout = async () => {
  try {
    await window.frappe.call({
      method: 'imogi_pos.api.layout.save_table_layout',
      args: { branch, tables }
    })
    window.frappe.show_alert({ message: 'Layout saved!', indicator: 'green' })
    setEditMode(false)
  } catch (error) {
    console.error('Save failed:', error)
  }
}
```

**Backend API**: `imogi_pos/api/layout.py`
```python
@frappe.whitelist()
@require_permission("Table Layout Profile", "write")
def save_table_layout(floor, layout_json, profile_name=None, title=None):
    """
    Saves a table layout for a specific floor.
    If profile_name is provided, updates that profile; otherwise creates a new one.
    """
    # Parse layout JSON
    # Validate layout data
    # Create or update Table Layout Profile
    # Save nodes (table positions)
```

**Table Layout Service**: `imogi_pos/table/layout_service.py`
```python
class TableLayoutService:
    def save_table_layout(self, profile_name: str, layout_data: Dict[str, Any]) -> Dict[str, Any]:
        """Save a table layout (create or update nodes)"""
        # Load profile
        # Track created/updated nodes
        # Process layout data
        # Save to database
```

**Cek Points**:
1. Apakah user punya write permission untuk "Table Layout Profile"?
2. Apakah `layout_json` valid dan complete?
3. Apakah ada validation error di backend?
4. Apakah Table Layout Profile doctype ter-configure dengan benar?
5. Apakah child table "Table Layout Node" bisa disimpan?

---

### Problem 4: Permission/Role Issues

#### Gejala
- Error "Access Denied" atau "No Permission"
- User sudah punya role tapi tetap tidak bisa akses

#### Auth Decorator
**File**: `imogi_pos/www/table_layout_editor/index.py`
```python
@require_roles("Branch Manager", "System Manager")
def get_context(context):
    # ...
```

**React Auth Hook**: `src/shared/hooks/useAuth.js`
```javascript
export function useAuth(requiredRoles = []) {
  const { currentUser } = useFrappeAuth()
  
  // Check if user has required roles
  const hasAccess = currentUser && requiredRoles.some(role => 
    currentUser.roles.includes(role)
  )
  
  return { user: currentUser, hasAccess, ... }
}
```

**Cek Points**:
1. Cek user roles: `frappe.get_roles(frappe.session.user)`
2. Apakah "Branch Manager" atau "System Manager" assigned ke user?
3. Apakah role permissions untuk "Table Layout Profile" sudah di-set?
4. Apakah ada custom permission query yang block access?

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
1. Access URL: https://[site]/table_layout_editor
2. Check browser console untuk errors
3. Check Network tab:
   - Request ke /table_layout_editor → status 200?
   - Request ke React bundle assets → status 200?
4. Check Frappe logs untuk errors
```

### Step 3: Check React Build
```bash
# Verify React build exists
ls -la imogi_pos/public/react/table-layout-editor/

# Expected files:
# - .vite/manifest.json
# - static/js/main.[hash].js
# - static/css/main.[hash].css

# If missing, rebuild:
npm run build:table-layout-editor
```

### Step 4: Check Backend API
```python
# Test API di Frappe console
frappe.call('imogi_pos.api.layout.get_tables', branch='Main Branch')

# Expected response:
{
  'tables': [
    {'name': 'T-001', 'status': 'Available', ...},
    ...
  ]
}
```

### Step 5: Check Database State
```sql
-- Check if Restaurant Table exists
SELECT name, floor, status, no_of_seats 
FROM `tabRestaurant Table` 
LIMIT 10;

-- Check if Table Layout Profile exists
SELECT name, profile_name, default_floor, is_active 
FROM `tabTable Layout Profile`;

-- Check if Table Layout Nodes exist
SELECT * FROM `tabTable Layout Node` 
WHERE parent = '[ProfileName]';
```

### Step 6: Check Permissions
```python
# Check permission untuk Table Layout Profile
frappe.has_permission('Table Layout Profile', 'read')
frappe.has_permission('Table Layout Profile', 'write')

# Check permission untuk Restaurant Table
frappe.has_permission('Restaurant Table', 'read')
```

---

## 📝 File-file Penting untuk Review

### Critical Files
1. `imogi_pos/www/table_layout_editor/index.py` - Page context & auth
2. `src/apps/table-layout-editor/App.jsx` - Main React component
3. `imogi_pos/api/layout.py` - Backend API endpoints
4. `imogi_pos/table/layout_service.py` - Core layout service
5. `src/shared/api/imogi-api.js` - API hooks (`useTables`)
6. `src/shared/hooks/useAuth.js` - Authentication hook

### Supporting Files
7. `imogi_pos/imogi_pos/doctype/table_layout_profile/table_layout_profile.py` - DocType controller
8. `imogi_pos/utils/auth_decorators.py` - `@require_roles` decorator
9. `imogi_pos/utils/react_helpers.py` - `add_react_context()` helper
10. `TABLE_DISPLAY_EDITOR_QUICKREF.md` - Documentation reference

---

## 🎯 Expected Output dari Frappe Assistant

Tolong lakukan investigasi mendalam dan berikan:

1. **Root Cause Analysis**:
   - Identifikasi masalah akses: kenapa user tidak bisa buka Table Layout Editor?
   - Identifikasi masalah data loading: kenapa tables tidak load?
   - Identifikasi masalah save: kenapa layout tidak tersimpan?

2. **Step-by-step Debugging**:
   - Command/query untuk verify setiap komponen
   - Console commands untuk test API endpoints
   - SQL queries untuk verify database state
   - Permission checks untuk verify access

3. **Rekomendasi Perbaikan**:
   - Kode yang perlu diubah/ditambah
   - Permission yang perlu di-set
   - Configuration yang perlu di-adjust
   - Deployment steps untuk apply fix

4. **Testing Checklist**:
   - Cara memverifikasi bahwa masalah sudah teratasi
   - Edge cases yang perlu di-test

---

## 💡 Hint & Konteks Tambahan

### Table Layout Editor Architecture
- **Purpose**: Visual drag-and-drop editor untuk arrange table positions pada restaurant floor
- **Data Model**: 
  - `Restaurant Floor` → has many → `Restaurant Table`
  - `Table Layout Profile` → has many → `Table Layout Node` (child table)
  - Each node stores: table reference, position_x, position_y, width, height, rotation
- **Workflow**:
  1. User selects floor
  2. System loads Table Layout Profile for that floor
  3. System loads all tables on that floor
  4. User drag tables to position on canvas
  5. Click Save → create/update Table Layout Profile + nodes

### React Build Process
```bash
# Build command
npm run build:table-layout-editor

# Output location
imogi_pos/public/react/table-layout-editor/

# Vite config location
vite.config.js (at project root)
```

### Frappe Session & Auth
- Page `/table_layout_editor` is a **www page** (not a desk page)
- Uses `@require_roles()` decorator for auth check
- If not authorized → should redirect to login or show error
- React component also has secondary auth check via `useAuth()` hook

### Common Issues
1. **Missing React Build**: React bundle tidak ter-generate → rebuild needed
2. **Wrong Role**: User tidak punya "Branch Manager" role → assign role
3. **Missing DocType**: Table Layout Profile doctype tidak ada → install/migrate
4. **Permission Issue**: Role tidak punya permission untuk Table Layout Profile → set permission
5. **Empty Database**: Tidak ada Restaurant Table records → create sample data

---

## 🚀 Actionable Items untuk Frappe Assistant

Tolong lakukan investigasi dengan urutan prioritas:

### Priority 1: Diagnose Access Issue
- [ ] Verify user roles dan permissions
- [ ] Check if page loads (status 200)
- [ ] Check React bundle exists and loads
- [ ] Verify auth decorator works correctly
- [ ] Identify di mana access ter-block

### Priority 2: Diagnose Data Loading Issue
- [ ] Verify API `get_tables` returns data
- [ ] Check if Restaurant Table records exist
- [ ] Verify branch/floor parameter valid
- [ ] Check React component state management
- [ ] Identify kenapa tables tidak muncul di UI

### Priority 3: Diagnose Save Issue
- [ ] Verify save API `save_table_layout` works
- [ ] Check write permission untuk Table Layout Profile
- [ ] Verify layout_json format valid
- [ ] Check if nodes saved to database
- [ ] Identify kenapa data tidak persist

### Priority 4: Provide Solutions
- [ ] Code fixes untuk access/auth
- [ ] Code fixes untuk data loading
- [ ] Code fixes untuk save functionality
- [ ] Permission setup instructions
- [ ] Deployment & testing instructions

---

## ✅ Success Criteria

Fix dianggap berhasil jika:
1. ✅ User dengan role "Branch Manager" bisa akses `/table_layout_editor`
2. ✅ Page load dengan benar dan tampil table list
3. ✅ User bisa drag-drop tables pada layout canvas
4. ✅ Click "Save Layout" → data tersimpan ke database
5. ✅ Refresh page → layout tetap persist (tidak hilang)
6. ✅ Tidak ada error di browser console atau Frappe logs

---

**Terima kasih atas bantuannya! 🙏**

Silakan mulai investigasi dari Priority 1 dan berikan finding + rekomendasi untuk setiap step.
