# Customer Display Editor - Create Profile Flow

## 📋 Overview

Customer Display Editor sekarang sudah memiliki flow lengkap untuk create new profile dengan UI yang modern dan user-friendly.

## 🔄 Flow Create New Profile

### 1. **User Action: Click "Create New Profile"**
   - Bisa dari empty state atau tombol "+ New" di sidebar
   - Trigger: `handleCreateNew()` function

### 2. **Template Selection Screen**
   - User melihat grid template yang tersedia:
     - Modern Dark
     - Light Minimal
     - Colorful
     - Restaurant
   - User bisa pilih template atau "Start from Scratch"

### 3. **Profile Information Form**
   - Setelah pilih template, muncul form:
     - **Profile Name** (required): Nama untuk display profile
     - **Branch** (required): Branch dimana display akan digunakan
   - Button actions:
     - Back: Kembali ke template selection
     - Create Profile: Submit form

### 4. **API Call: Create Profile**
   ```javascript
   POST: imogi_pos.api.customer_display_editor.create_profile
   Params:
   - profile_name: string
   - branch: string
   - template_id: string (optional)
   - config: object (optional, dari template)
   ```

### 5. **Backend Processing**
   - Validate user permissions
   - Check profile name tidak duplicate
   - Create new `Customer Display Profile` document
   - Apply template config jika ada
   - Save to database

### 6. **Success Response**
   - Show success message
   - Refresh profiles list
   - Auto-select profile yang baru dibuat
   - Redirect ke editor untuk profile tersebut

## 🎯 DocType: Customer Display Profile

```json
{
  "name": "Customer Display Profile",
  "fields": [
    "profile_name",      // Unique, required
    "branch",            // Link to Branch, required
    "description",       // Optional
    "is_active",         // Check, default 1
    "layout_type",       // Select: Grid/Flex/Full
    "grid_columns",      // Int, default 3
    "grid_rows",         // Int, default 2
    "override_brand",    // Check
    "brand_logo",        // Attach Image
    "brand_logo_dark",   // Attach Image
    "brand_name",        // Data
    "brand_color_primary",   // Color
    "brand_color_accent",    // Color
    "brand_header_bg",       // Color
    "blocks"             // Table: Display Block
  ]
}
```

## 🛠️ API Endpoints

### 1. Create Profile
```python
@frappe.whitelist()
def create_profile(profile_name, branch, template_id=None, config=None)
```

### 2. Get Available Devices
```python
@frappe.whitelist()
def get_available_devices()
# Returns list of all active Customer Display Profiles
```

### 3. Get Display Templates
```python
@frappe.whitelist()
def get_display_templates()
# Returns predefined templates dengan config
```

### 4. Save Device Config
```python
@frappe.whitelist()
def save_device_config(device, config)
```

### 5. Duplicate Profile
```python
@frappe.whitelist()
def duplicate_profile(source_profile, new_name, new_branch=None)
```

## 🎨 UI Components

### TemplateSelector Component
- Props:
  - `templates`: Array of template objects
  - `onTemplateSelect`: Callback function
  - `onCancel`: Callback function

- State:
  - `selectedTemplate`: Currently selected template
  - `showForm`: Toggle between template grid and form
  - `formData`: { profile_name, branch }

### DeviceSelector Component (Sidebar)
- Shows list of existing profiles
- "+ New" button to create profile
- Active state indicator

### App Component
- Manages overall state
- Handles API calls
- Orchestrates flow

## ✅ Validation & Error Handling

### Client-Side
- Required fields validation
- Form submission handling
- Loading states

### Server-Side
- Permission check
- Duplicate name check
- Branch validation
- Error logging
- Transaction safety

## 🎯 User Experience Flow

```
Empty State
    ↓
Click "Create New Profile"
    ↓
Template Selection Grid
    ↓
Click Template (or Start from Scratch)
    ↓
Form: Enter Profile Name & Branch
    ↓
Submit
    ↓
API: Create Profile
    ↓
Success Alert
    ↓
Auto-Select New Profile
    ↓
Ready to Configure
```

## 📝 Example Usage

```javascript
// 1. User clicks template "Modern Dark"
// 2. Form shows:
//    Template: Modern Dark (Dark theme with modern layout)
//    Profile Name: [Display Counter 1]
//    Branch: [Main Branch]
// 3. Submit
// 4. API creates profile with Modern Dark config
// 5. User can now customize further
```

## 🔐 Permissions Required

- Role: `System Manager` or `Branch Manager`
- DocType Permission: `Customer Display Profile` (Create, Read, Write)

## 🚀 Next Steps

User dapat:
1. ✅ Create profile baru
2. ✅ Configure layout & branding
3. ✅ Save changes
4. ✅ Test display
5. ✅ Duplicate profile
6. ✅ Reset to defaults

## 🎨 Modern UI Features

- ✅ Beautiful gradient colors
- ✅ Smooth animations
- ✅ Form validation
- ✅ Loading states
- ✅ Error messages
- ✅ Responsive design
- ✅ Professional templates grid
- ✅ Auto-focus on inputs
- ✅ Clear user feedback

---

**Status**: ✅ COMPLETE & TESTED
**Build**: Successfully compiled
**Ready**: Production ready
