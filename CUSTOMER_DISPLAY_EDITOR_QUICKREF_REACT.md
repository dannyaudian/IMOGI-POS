# Customer Display Editor - Quick Reference

## 🚀 Quick Start

### Access the Editor
```
Navigate to: /customer-display-editor
```

### Create New Profile
1. Click **"+ New"** in sidebar
2. Choose template or "Start from Scratch"
3. Configure settings in tabs
4. Click **"Save"**

## 📋 API Endpoints

### Get All Profiles
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.get_available_devices'
})
```

### Get Profile Config
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.get_device_config',
  args: { device: 'PROFILE-001' }
})
```

### Save Config
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.save_device_config',
  args: {
    device: 'PROFILE-001',
    config: { backgroundColor: '#1f2937', ... }
  }
})
```

### Get Templates
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.get_display_templates'
})
```

### Duplicate Profile
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.duplicate_profile',
  args: {
    source_profile: 'PROFILE-001',
    new_name: 'PROFILE-002',
    new_branch: 'Branch 2'
  }
})
```

### Get Preview Data
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.get_preview_data',
  args: {
    device: 'PROFILE-001',
    sample_type: 'restaurant'  # or 'default', 'retail'
  }
})
```

### Test Display
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.test_device_display',
  args: { device: 'PROFILE-001' }
})
```

### Reset Config
```python
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.reset_device_config',
  args: { device: 'PROFILE-001' }
})
```

## 🎨 Templates

| Template | Background | Text | Accent | Price | Use Case |
|----------|------------|------|--------|-------|----------|
| **Modern Dark** | #1f2937 | #ffffff | #3b82f6 | #10b981 | General POS |
| **Light Minimal** | #ffffff | #1f2937 | #6366f1 | #059669 | Bright environments |
| **Colorful** | #ec4899 | #ffffff | #fbbf24 | #ffffff | Retail/Fun |
| **Restaurant** | #0f172a | #f1f5f9 | #f59e0b | #fbbf24 | Fine dining |

## 🔧 Configuration Object

```javascript
{
  // Layout
  layout_type: 'List',          // 'List', 'Grid', 'Compact'
  grid_columns: 3,              // 1-6
  grid_rows: 2,                 // 1-10
  showImages: true,
  showDescription: true,
  showLogo: true,
  showSubtotal: true,
  showTaxes: true,
  autoScroll: false,
  scrollSpeed: 3,               // 1-10 seconds
  fontSize: '1rem',             // '0.875rem', '1rem', '1.25rem', '1.5rem'
  
  // Theme
  backgroundColor: '#1f2937',
  textColor: '#ffffff',
  accentColor: '#3b82f6',
  priceColor: '#10b981',
  themePreset: 'dark',          // 'dark', 'light', 'colorful', 'elegant'
  brand_name: 'My Store',
  brand_logo: 'https://...',
  
  // Advanced
  displayTimeout: 30,           // 5-300 seconds
  refreshInterval: 5,           // 1-60 seconds
  debugMode: false,
  customCSS: '/* ... */'
}
```

## 🎯 React Hooks

### Use in Components
```javascript
import {
  useCustomerDisplayProfiles,
  useDisplayTemplates,
  useSaveDisplayConfig,
  useResetDisplayConfig,
  useTestDisplay,
  useDuplicateProfile
} from '../../shared/api/imogi-api'

function MyComponent() {
  const { data: profiles, isLoading, mutate } = useCustomerDisplayProfiles()
  const { trigger: saveConfig, isMutating } = useSaveDisplayConfig()
  
  const handleSave = async () => {
    await saveConfig({ device: 'PROFILE-001', config: {...} })
    mutate()  // Refresh profiles
  }
}
```

## 📱 Component Usage

### DeviceSelector
```jsx
<DeviceSelector
  devices={profiles}
  selectedDevice={selectedDevice}
  onDeviceSelect={setSelectedDevice}
  onCreateNew={handleCreateNew}
/>
```

### PreviewPanel
```jsx
<PreviewPanel
  config={config}
  sampleData={sampleData}
/>
```

### TemplateSelector
```jsx
<TemplateSelector
  templates={templates}
  onTemplateSelect={handleTemplateSelect}
/>
```

### ConfigPanel
```jsx
<ConfigPanel
  activeTab={activeTab}       // 'layout', 'theme', 'advanced'
  config={config}
  onChange={handleConfigChange}
/>
```

## 🔄 Common Workflows

### Workflow 1: Create from Template
```
1. Click "+ New" → TemplateSelector appears
2. Click template card → Config loads
3. Adjust settings in tabs
4. Click "Save" → Profile created
```

### Workflow 2: Edit Existing
```
1. Click profile in sidebar → Config loads
2. Edit in Layout/Theme/Advanced tabs
3. Preview updates live
4. Click "Save" → Changes persist
```

### Workflow 3: Duplicate & Modify
```
1. Select source profile
2. Click "Duplicate" → Enter name/branch
3. New profile created with same config
4. Modify as needed
5. Save
```

## 🐛 Troubleshooting

### Preview Not Updating
✅ Check `config` state is changing
✅ Verify `sampleData` loaded
✅ Check browser console for errors

### Save Fails
✅ Verify user has write permissions
✅ Check network tab for API errors
✅ Ensure `selectedDevice` is set

### Templates Not Loading
✅ Check `get_display_templates` API
✅ Verify backend file exists
✅ Check `templates` state in React

### Profiles Not Appearing
✅ Check Customer Display Profile DocType
✅ Verify `is_active = 1` filter
✅ Check API returns data

## 📊 Sample Data Types

### Restaurant
```javascript
{
  items: [
    { item_name: 'Nasi Goreng', qty: 2, rate: 25000 },
    { item_name: 'Es Teh', qty: 3, rate: 5000 }
  ],
  subtotal: 65000,
  tax: 7150,
  total: 72150
}
```

### Retail
```javascript
{
  items: [
    { item_name: 'T-Shirt Basic', sku: 'TS-001', qty: 1, rate: 99000 },
    { item_name: 'Jeans Slim', sku: 'JS-002', qty: 1, rate: 199000 }
  ],
  subtotal: 298000,
  tax: 32780,
  total: 330780
}
```

## 🎨 CSS Classes

### Main Container
- `.cde-container` - Full layout wrapper
- `.cde-sidebar` - Left sidebar
- `.cde-main` - Main content area

### Components
- `.cde-device-item` - Profile list item
- `.cde-device-item.active` - Selected profile
- `.cde-preview-display` - Preview container
- `.cde-tab` - Configuration tab
- `.cde-tab.active` - Active tab

### Buttons
- `.cde-btn-primary` - Primary action
- `.cde-btn-secondary` - Secondary action
- `.cde-btn-add` - Add new button

### States
- `.cde-loading` - Loading spinner
- `.cde-empty-content` - Empty state
- `.cde-spinner` - Spinner animation

## 🔐 Permissions

### Required Permissions
- **Read**: Customer Display Profile
- **Write**: Customer Display Profile (for save/reset)
- **Create**: Customer Display Profile (for duplicate)

### Role Setup
```python
# In custom.py or permissions.py
frappe.permissions.add_permission({
  'doctype': 'Customer Display Profile',
  'role': 'POS Manager',
  'read': 1,
  'write': 1,
  'create': 1
})
```

## 🚨 Error Handling

### Backend Errors
```python
try:
    # API logic
    return {"success": True, "data": result}
except Exception as e:
    frappe.log_error(e, "Customer Display Editor")
    return {"success": False, "error": str(e)}
```

### Frontend Errors
```javascript
try {
  await saveConfig({...})
  frappe.show_alert({ message: 'Saved', indicator: 'green' })
} catch (error) {
  frappe.show_alert({ message: 'Error: ' + error, indicator: 'red' })
}
```

## 📈 Performance Tips

1. **Debounce Changes**: Don't save on every keystroke
2. **Lazy Load**: Load sample data only when needed
3. **Cache Templates**: Templates rarely change
4. **Optimize Preview**: Use CSS transforms for animations
5. **Batch Updates**: Group multiple config changes

## 🔗 Related Documentation
- [Customer Display Editor Build](./CUSTOMER_DISPLAY_EDITOR_BUILD.md)
- [Customer Display Editor Complete](./CUSTOMER_DISPLAY_EDITOR_COMPLETE.md)
- [React Architecture](./REACT_ARCHITECTURE.md)
- [API Implementation Summary](./API_IMPLEMENTATION_SUMMARY.md)
