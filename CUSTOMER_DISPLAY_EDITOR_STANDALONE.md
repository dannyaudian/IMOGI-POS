# Customer Display Editor - Standalone Application

## Overview

The Customer Display Editor is a standalone configuration tool for managing customer-facing display devices in IMOGI POS. It provides an intuitive interface for configuring display settings, themes, and testing device connectivity.

**Status**: ✅ Standalone Application
**Location**: `/src/apps/customer-display-editor/`
**Access**: `/customer-display-editor`

## Architecture

### Standalone Design
- **No Dependencies on Module Select** - Operates independently
- **Direct Device Access** - Manages Customer Display Device records directly
- **Own State Management** - Handles all configuration locally
- **Dedicated Backend API** - Uses `imogi_pos.api.customer_display_editor` module

### Tech Stack
- **Frontend**: React 18 + Vite
- **Backend**: Python/Frappe
- **State Management**: React hooks (useState, useEffect)
- **API Communication**: frappe.call() for backend

## File Structure

```
src/apps/customer-display-editor/
├── App.jsx                 # Main application component (450+ lines)
├── main.jsx                # Entry point
├── styles.css              # Complete styling (800+ lines)
├── index.html              # HTML template
└── components/             # Reserved for future component splitting

imogi_pos/
├── api/
│   └── customer_display_editor.py    # Backend API (250+ lines)
└── www/
    └── devices/
        └── customer-display-editor/
            └── index.py             # Page context
```

## Core Features

### 1. Device Selection
- **Sidebar Device List**: Shows all available customer display devices
- **Device Information**: Name, location, status, type
- **Active Selection**: Visual highlight for selected device
- **Status Indicators**: Color-coded device status (Active, Inactive, Offline)

### 2. Configuration Management

#### Preview Tab
- Live preview of display rendering
- Sample order data with items and prices
- Real-time styling reflection
- Responsive preview panel

#### Layout Tab
Configuration options for display content:
- Show/hide item images
- Show/hide item descriptions
- Show/hide brand logo
- Show/hide subtotal
- Show/hide taxes
- Auto-scroll items
  - Scroll speed control (1-10 seconds)
- Font size selection (Small, Medium, Large, Extra Large)

#### Theme Tab
Visual customization:
- Background color picker
- Text color picker
- Accent color picker
- Price color picker
- Theme presets (Dark, Light, High Contrast, Colorful)

#### Advanced Tab
Technical settings:
- Display timeout (5-300 seconds)
- Refresh interval (1-60 seconds)
- Debug mode toggle
- Optional API key for remote management

### 3. Action Buttons
- **Save Configuration**: Persist changes to device
- **Reset to Defaults**: Restore default configuration
- **Test Display**: Send test message to device

## Component Structure

### Main App Component (App.jsx)

**State Management**:
```javascript
const [selectedDevice, setSelectedDevice] = useState(null)
const [devices, setDevices] = useState([])
const [config, setConfig] = useState({})
const [loading, setLoading] = useState(true)
const [saving, setSaving] = useState(false)
const [saved, setSaved] = useState(false)
const [activeTab, setActiveTab] = useState('preview')
```

**Key Methods**:
- `loadDeviceConfig()` - Fetch configuration for selected device
- `handleSaveConfig()` - Save configuration changes
- `handleResetConfig()` - Reset to default configuration
- `handleTestDisplay()` - Send test message to device
- `handleConfigChange()` - Update config state

**Rendering Structure**:
1. Header - Title, action buttons
2. Main container with sidebar + content
3. Sidebar - Device list
4. Content area - Tabs and configuration panels
5. Tab content - Context-specific controls

### Tab Components

#### PreviewTab
- Renders live preview of customer display
- Shows sample items, prices, totals
- Reflects current configuration
- Responsive styling

#### LayoutTab
- Checkboxes for layout options
- Conditional rendering of scroll speed control
- Font size selector

#### ThemeTab
- Color pickers for all color settings
- Theme preset selector
- Real-time preview reflection

#### AdvancedTab
- Numeric inputs for timeouts and intervals
- Debug mode toggle
- Optional API key field

## Backend API

### Endpoints

#### `get_available_devices()`
**Purpose**: List all customer display devices
**Returns**: 
```python
{
    'devices': [
        {'name': 'DEV-001', 'device_name': 'Entry Display', 'location': 'Entrance', ...}
    ],
    'total': 1
}
```
**Permissions**: read on Customer Display Device

#### `get_device_config(device)`
**Purpose**: Load configuration for specific device
**Args**: `device` - device name/ID
**Returns**: 
```python
{
    'device': {
        'name': 'DEV-001',
        'device_name': 'Entry Display',
        'location': 'Entrance',
        'status': 'Active',
        'ip_address': '192.168.1.100'
    },
    'config': {
        'showImages': True,
        'showDescription': False,
        'backgroundColor': '#1f2937',
        ...
    }
}
```
**Notes**: Automatically applies defaults for missing fields

#### `save_device_config(device, config)`
**Purpose**: Save device configuration
**Args**: 
- `device` - device name/ID
- `config` - configuration dict or JSON string
**Returns**: 
```python
{
    'success': True,
    'message': 'Configuration saved successfully'
}
```
**Permissions**: write on Customer Display Device

#### `reset_device_config(device)`
**Purpose**: Reset configuration to defaults
**Args**: `device` - device name/ID
**Returns**: 
```python
{
    'success': True,
    'message': 'Configuration reset to defaults',
    'config': {...defaults...}
}
```

#### `test_device_display(device)`
**Purpose**: Send test message to device
**Args**: `device` - device name/ID
**Returns**: 
```python
{
    'success': True,
    'message': 'Test message sent to display'
}
```
**Note**: Currently logs test payload; extend for actual device communication

#### `batch_update_devices(updates)`
**Purpose**: Update multiple devices at once
**Args**: `updates` - list of {device, config} objects
**Returns**: 
```python
{
    'success': bool,
    'results': [
        {'device': 'DEV-001', 'status': 'success|error', 'error': '...'}
    ],
    'errors': ['...']
}
```

### Default Configuration

```python
{
    'showImages': True,
    'showDescription': False,
    'showLogo': True,
    'showSubtotal': True,
    'showTaxes': False,
    'autoScroll': True,
    'scrollSpeed': 3,
    'fontSize': '1rem',
    'backgroundColor': '#1f2937',
    'textColor': '#ffffff',
    'accentColor': '#10b981',
    'priceColor': '#fbbf24',
    'themePreset': 'dark',
    'displayTimeout': 30,
    'refreshInterval': 5,
    'debugMode': False
}
```

## Styling System

### CSS Variables
```css
--cde-primary: #3b82f6         /* Primary blue */
--cde-primary-dark: #1e40af    /* Darker blue */
--cde-secondary: #6b7280       /* Gray */
--cde-success: #10b981         /* Green */
--cde-warning: #f59e0b         /* Amber */
--cde-error: #ef4444           /* Red */
--cde-bg: #ffffff              /* White background */
--cde-bg-alt: #f9fafb          /* Light gray background */
--cde-border: #e5e7eb          /* Light border */
--cde-text: #1f2937            /* Dark text */
--cde-text-secondary: #6b7280  /* Gray text */
```

### Layout Classes
- `.cde-app` - Main container
- `.cde-header` - Top header
- `.cde-main` - Main flex container
- `.cde-sidebar` - Left sidebar
- `.cde-content` - Main content area
- `.cde-tabs` - Tab navigation
- `.cde-tab-content` - Tab content panel

### Component Classes
- `.cde-btn` - Button base
- `.cde-btn-primary` - Primary action button
- `.cde-btn-secondary` - Secondary button
- `.cde-form-group` - Form section container
- `.cde-form-field` - Individual form field
- `.cde-preview-display` - Preview container

### Responsive Breakpoints
- Desktop: Full layout with sidebar
- Tablet (≤1200px): Adjusted spacing
- Mobile (≤768px): Column layout, horizontal device scroll
- Small (≤480px): Single column, full-width buttons

## Usage Flow

### 1. Accessing the Editor
```
URL: /customer-display-editor
Authorization: Must have read permission on Customer Display Device
```

### 2. Selecting a Device
1. View device list in left sidebar
2. Click device to load its configuration
3. Device status shows current state

### 3. Configuring Display
1. Click relevant tab (Preview, Layout, Theme, Advanced)
2. Modify settings as needed
3. See live preview reflect changes
4. Click "Save Configuration" to persist

### 4. Testing
1. Adjust settings
2. Click "Test Display" to send test message
3. Monitor device connectivity

### 5. Batch Updates
Use API endpoint for multiple devices:
```javascript
frappe.call({
  method: 'imogi_pos.api.customer_display_editor.batch_update_devices',
  args: {
    updates: [
      {device: 'DEV-001', config: {...}},
      {device: 'DEV-002', config: {...}}
    ]
  }
})
```

## Integration Points

### With Customer Display Device Doctype
- Reads: `name`, `device_name`, `location`, `status`, `display_type`, `ip_address`
- Writes: `imogi_display_config` (JSON field)

### With Module Select (Optional)
The editor is **completely standalone** but can be linked:
- Add module card in module-select with icon → `/customer-display-editor`
- Or provide direct link from settings menu
- No shared state with module-select

### Device Communication
- **Current**: Test messages logged via `frappe.log_error()`
- **Future**: Implement actual device API calls based on device type/IP
- **Placeholder**: See `test_device_display()` function

## Permissions

### Required Frappe Permissions
- **Read**: Customer Display Device (to view devices)
- **Write**: Customer Display Device (to save configuration)

### Role Recommendations
- **POS Manager** - Full access
- **Display Administrator** - Custom role with both permissions
- **Support Staff** - Read-only (can view but not modify)

## Error Handling

### UI Feedback
- Loading spinners during async operations
- Success alerts (green) for successful operations
- Error alerts (red) with error messages
- 3-second auto-dismiss for notifications

### Backend Validation
- Permission checks on all endpoints
- Device existence validation
- JSON parsing error handling
- Comprehensive error logging

## Future Enhancements

1. **Advanced Theme Builder**
   - CSS variable customization
   - Font family selection
   - Custom animation speeds

2. **Batch Operations**
   - Multi-device selection
   - Bulk configuration application
   - Configuration templates

3. **Device Analytics**
   - Display uptime monitoring
   - Error logging dashboard
   - Performance metrics

4. **Remote Management**
   - WebSocket real-time updates
   - Remote screenshot capability
   - Device status monitoring

5. **Configuration Versioning**
   - Save configuration history
   - Rollback to previous versions
   - Version comparison

## Troubleshooting

### Device Not Appearing
1. Check if Customer Display Device records exist in ERPNext
2. Verify user has read permission on Customer Display Device
3. Reload page and check browser console for errors

### Configuration Not Saving
1. Verify user has write permission on Customer Display Device
2. Check if device exists and is not deleted
3. Look at browser console and Frappe logs for errors

### Preview Not Updating
1. Check if React is properly rendering (open DevTools)
2. Verify CSS is loaded (check Network tab)
3. Clear browser cache and reload

### Test Display Not Working
1. Verify device IP address is configured
2. Check if device is online and reachable
3. Review Frappe error logs for communication issues
4. Implement actual device communication in `test_device_display()`

## Development Notes

### Building
```bash
npm run build:customer-display-editor
```

### Local Development
```bash
npm run dev
# Access via http://localhost:5173/customer-display-editor
```

### Adding New Settings
1. Add input field to appropriate Tab component
2. Update default config in backend
3. Add CSS styling if needed
4. Test with preview

### Extending to New Device Types
1. Update Customer Display Device doctype with type-specific fields
2. Extend configuration structure
3. Add type-specific sections in tabs
4. Implement device-specific API in backend

## Related Documentation
- [Module Select Complete](./MODULE_SELECT_COMPLETE.md) - Post-login module selection
- [Service Select Fix](./SERVICE_SELECT_CASHIER_FIX.md) - Service selection integration
- [React Architecture](./REACT_ARCHITECTURE.md) - Overall React app structure
- [API Documentation](./docs/AUTHORIZATION_IMPROVEMENTS.md) - Backend API patterns
