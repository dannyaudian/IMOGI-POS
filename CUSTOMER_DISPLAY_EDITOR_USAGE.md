# 🎯 Customer Display Editor - Quick Reference

## Flow Edit Profile yang Sudah Ada

### Step-by-Step

#### 1️⃣ **Buka Customer Display Editor**
```
URL: https://[site]/customer_display_editor
```

#### 2️⃣ **Pilih Profile dari Sidebar**
- Sidebar kiri menampilkan semua active profiles
- Klik profile yang ingin di-edit
- **✨ Config otomatis loaded!** (tidak perlu API call lagi)

#### 3️⃣ **Edit Settings**

**Tab Layout:**
- Layout Type: Grid/Flex/Full
- Grid Columns: 1-6
- Grid Rows: 1-6

**Tab Theme:**
- Override Brand: On/Off
- Brand Logo
- Brand Name
- Primary Color
- Accent Color
- Header Background

**Tab Advanced:**
- Display Blocks
- Custom CSS
- Animation settings

#### 4️⃣ **Save Changes**
- Tombol "Save" muncul saat ada perubahan
- Click "Save"
- Success alert muncul
- Changes tersimpan ke database

#### 5️⃣ **Test Display**
- Click "Test" button
- Test message dikirim ke customer display
- Verify tampilan di actual display

---

## API Endpoints Reference

### 1. Get Profiles (dengan Config)
```javascript
GET: imogi_pos.api.customer_display_editor.get_available_devices

Response:
{
  "devices": [
    {
      "name": "Display Counter 1",
      "profile_name": "Display Counter 1",
      "branch": "Main Branch",
      "is_active": true,
      "config": {
        "layout_type": "Grid",
        "grid_columns": 3,
        "grid_rows": 2,
        "override_brand": 1,
        "brand_logo": "/files/logo.png",
        "brand_color_primary": "#6366f1",
        // ... semua config fields
      }
    }
  ],
  "total": 1
}
```

### 2. Create New Profile
```javascript
POST: imogi_pos.api.customer_display_editor.create_profile
Params:
{
  "profile_name": "Display Counter 2",
  "branch": "Main Branch",
  "template_id": "modern-dark",  // optional
  "config": { ... }               // optional
}

Response:
{
  "success": true,
  "profile": {
    "name": "Display Counter 2",
    "profile_name": "Display Counter 2",
    "branch": "Main Branch"
  },
  "message": "Profile created successfully"
}
```

### 3. Save Config
```javascript
POST: imogi_pos.api.customer_display_editor.save_device_config
Params:
{
  "device": "Display Counter 1",
  "config": {
    "layout_type": "Grid",
    "grid_columns": 4,
    // ... updated fields
  }
}

Response:
{
  "success": true,
  "message": "Configuration saved successfully"
}
```

### 4. Duplicate Profile
```javascript
POST: imogi_pos.api.customer_display_editor.duplicate_profile
Params:
{
  "source_profile": "Display Counter 1",
  "new_name": "Display Counter 2",
  "new_branch": "Outlet 1"
}
```

### 5. Reset to Default
```javascript
POST: imogi_pos.api.customer_display_editor.reset_device_config
Params:
{
  "device": "Display Counter 1"
}
```

### 6. Test Display
```javascript
POST: imogi_pos.api.customer_display_editor.test_device_display
Params:
{
  "device": "Display Counter 1"
}
```

---

## 🎨 Available Templates

### 1. Modern Dark
```javascript
{
  "id": "modern-dark",
  "config": {
    "layout_type": "Grid",
    "grid_columns": 2,
    "grid_rows": 3,
    "brand_color_primary": "#3b82f6",
    // Dark theme colors
  }
}
```

### 2. Light Minimal
```javascript
{
  "id": "light-minimal",
  "config": {
    "layout_type": "List",
    "brand_color_primary": "#10b981",
    // Light theme colors
  }
}
```

### 3. Colorful (Retail)
```javascript
{
  "id": "colorful",
  "config": {
    "layout_type": "Grid",
    "grid_columns": 3,
    "brand_color_primary": "#ec4899",
    // Vibrant colors
  }
}
```

### 4. Restaurant
```javascript
{
  "id": "restaurant",
  "config": {
    "layout_type": "List",
    "brand_color_primary": "#f59e0b",
    "autoScroll": true,
    // Restaurant-optimized
  }
}
```

---

## 🔒 Permissions Required

### Create Profile
- Role: `System Manager` OR `Branch Manager`
- Permission: `Customer Display Profile` - Create

### Edit/Save Config
- Role: `System Manager` OR `Branch Manager`
- Permission: `Customer Display Profile` - Write

### View Profiles
- Role: `System Manager` OR `Branch Manager` OR `POS User`
- Permission: `Customer Display Profile` - Read

---

## 🏗️ Centralized Architecture

### Authentication
```javascript
import { useAuth } from '../../shared/hooks/useAuth'

const { user, hasAccess, loading, error } = 
  useAuth(['Branch Manager', 'System Manager'])
```

### Branding (Backend)
```python
from imogi_pos.api.public import get_branding

branding = get_branding(pos_profile="Main Counter")
# Returns: logo, colors, brand_name, etc.
```

### Permissions (Backend)
```python
from imogi_pos.utils.permissions import validate_api_permission
from imogi_pos.utils.decorators import require_role

@require_role(['Branch Manager'])
@frappe.whitelist()
def my_api():
    validate_api_permission('Customer Display Profile', 'write')
```

### API Hooks (Frontend)
```javascript
import { 
  useCustomerDisplayProfiles,
  useSaveDisplayConfig,
  useCreateProfile 
} from '../../shared/api/imogi-api'

const { data, isLoading, mutate } = useCustomerDisplayProfiles()
const { trigger: saveConfig, isMutating } = useSaveDisplayConfig()
```

---

## 🐛 Troubleshooting

### Profile tidak muncul di sidebar
- ✅ Check: `is_active = 1` di DocType
- ✅ Check: User punya permission Read
- ✅ Check: Branch sesuai dengan user access

### Config tidak auto-load saat pilih profile
- ✅ Check: API `get_available_devices` return field `config`
- ✅ Check: useEffect dependencies [selectedDevice, profiles]
- ✅ Check: Browser console untuk errors

### Save tidak berhasil
- ✅ Check: User punya permission Write
- ✅ Check: Config format valid (object, bukan string)
- ✅ Check: Network tab di browser
- ✅ Check: Frappe error log

### Template tidak muncul
- ✅ Check: API `get_display_templates` return templates array
- ✅ Check: templates?.templates di component
- ✅ Check: Loading state

---

## 💡 Tips & Best Practices

### 1. Naming Convention
```
Profile Name: [Location] - [Type] - [Number]
Example: Main Counter - Display 1
         Outlet 1 - Display 2
```

### 2. Branch Organization
```
- Buat profile per branch
- Gunakan duplicate untuk branch baru
- Maintain consistency dalam naming
```

### 3. Color Scheme
```
- Gunakan brand colors yang konsisten
- Test di actual display sebelum save
- Consider readability (contrast)
```

### 4. Layout Settings
```
Grid:
- 2-3 columns untuk counter display
- 3-4 columns untuk wall display

List:
- Untuk restaurant dengan banyak items
- Enable auto-scroll
```

### 5. Performance
```
- Gunakan SWR caching (auto by hooks)
- Revalidate on focus untuk real-time
- Batch updates sebelum save
```

---

## 📱 Testing Checklist

- [ ] Create new profile
- [ ] Select existing profile
- [ ] Config auto-loads
- [ ] Edit layout settings
- [ ] Edit theme settings
- [ ] Save changes
- [ ] Test display
- [ ] Duplicate profile
- [ ] Reset to defaults
- [ ] Delete profile (via Frappe UI)

---

## 🚀 Status

✅ **COMPLETE & PRODUCTION READY**

- ✅ Full CRUD operations
- ✅ Template system
- ✅ Auto-load config
- ✅ Centralized auth
- ✅ Centralized branding
- ✅ Permission system
- ✅ Modern UI/UX
- ✅ Error handling
- ✅ Loading states

---

**Last Updated**: January 26, 2026
**Version**: 2.0.0
