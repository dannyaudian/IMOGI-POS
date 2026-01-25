# Table Display Editor - Standalone Application

## Overview

The Table Display Editor is a standalone configuration tool for managing restaurant table status displays. It provides an intuitive interface for configuring how table information is displayed across multiple display devices.

**Status**: ✅ Standalone Application
**Location**: `/src/apps/table-display-editor/`
**Access**: `/table-display-editor`

## Features

### Device Management
- **Display List Sidebar**: Shows all available table display devices by section
- **Display Information**: Name, section, status, device type
- **Active Selection**: Visual highlight for selected display
- **Status Indicators**: Color-coded device status

### Configuration Tabs

#### Preview Tab
- Live preview of table status display
- Shows 4 sample tables with different statuses (Available, Occupied, Reserved, Dirty)
- Real-time styling reflection
- Grid layout visualization

#### Layout Tab
- Show/hide table numbers
- Show/hide seat count
- Show/hide status labels
- Show/hide waiter name
- Show/hide order time
- Grid layout options (2, 3, 4, or 6 columns)
- Font size selection

#### Theme Tab
- Background color picker
- Text color picker
- Status-specific colors:
  - Available table color
  - Occupied table color
  - Reserved table color
  - Dirty table color
- Theme presets (Dark, Light, Professional, Vibrant)

#### Advanced Tab
- Enable/disable auto-refresh
- Polling interval configuration
- Animation speed control
- Animation toggle
- Section header visibility
- Debug mode toggle
- Optional API key

## File Structure

```
src/apps/table-display-editor/
├── App.jsx                 # Main application (550+ lines)
├── main.jsx                # Entry point
├── styles.css              # Complete styling (850+ lines)
└── index.html              # HTML template

imogi_pos/
├── api/
│   └── table_display_editor.py    # Backend API (300+ lines)
└── www/
    └── devices/
        └── table-display-editor/
            └── index.py           # Page context
```

## Frontend Architecture

### Main App Component (App.jsx)

**State Management**:
```javascript
const [selectedDisplay, setSelectedDisplay] = useState(null)
const [displays, setDisplays] = useState([])
const [config, setConfig] = useState({})
const [loading, setLoading] = useState(true)
const [saving, setSaving] = useState(false)
const [saved, setSaved] = useState(false)
const [activeTab, setActiveTab] = useState('preview')
```

**Core Methods**:
- `loadDisplayConfig()` - Fetch configuration for selected display
- `handleSaveConfig()` - Persist configuration changes
- `handleResetConfig()` - Reset to default configuration
- `handleTestDisplay()` - Send test message to display
- `handleConfigChange()` - Update config state

### Tab Components

All tabs are implemented as functional components within App.jsx:

**PreviewTab**:
- Grid display of 4 sample tables
- Color-coded status indicators
- Responsive grid layout
- Real-time style reflection

**LayoutTab**:
- Layout configuration options
- Grid column selection (2, 3, 4, 6)
- Font size selector
- Display element toggles

**ThemeTab**:
- 6 color pickers for different elements
- Theme preset selector
- Visual customization options

**AdvancedTab**:
- Auto-refresh configuration
- Polling and animation settings
- Debug mode and API key

## Backend API

### Endpoints (7 total)

1. **get_available_displays()**
   - Lists all Restaurant Table Display records
   - Returns: Array of displays with metadata

2. **get_display_config(display)**
   - Loads configuration for specific display
   - Merges with defaults
   - Returns: Display info + merged config

3. **save_display_config(display, config)**
   - Saves configuration changes
   - Validates config structure
   - Updates Restaurant Table Display record

4. **reset_display_config(display)**
   - Resets to default configuration
   - Updates record and returns new config

5. **test_display(display)**
   - Sends test message to display
   - Currently logs payload
   - Extensible for actual device communication

6. **batch_update_displays(updates)**
   - Updates multiple displays at once
   - Returns results array with per-display status

7. **get_section_displays(section)**
   - Gets all displays for a specific section
   - Includes their configurations
   - Useful for section-wide management

### Default Configuration

```python
{
    # Layout settings
    'showTableNumbers': True,
    'showSeats': False,
    'showStatusLabels': True,
    'showWaiterName': False,
    'showOrderTime': False,
    'gridLayout': '4',
    'fontSize': '1rem',
    'updateInterval': 5,
    
    # Theme settings
    'backgroundColor': '#1f2937',
    'textColor': '#ffffff',
    'availableColor': '#10b981',
    'occupiedColor': '#ef4444',
    'reservedColor': '#f59e0b',
    'dirtyColor': '#8b5cf6',
    'themePreset': 'dark',
    
    # Advanced settings
    'enableAutoRefresh': True,
    'pollingInterval': 5,
    'animationSpeed': 300,
    'enableAnimations': True,
    'showSectionHeader': True,
    'debugMode': False
}
```

## Styling System

### CSS Variables
- Primary colors for UI chrome
- Status colors for table states
- Shadow and spacing tokens
- Responsive breakpoints

### Responsive Design
- Desktop: Full sidebar + content layout
- Tablet (≤1200px): Adjusted spacing
- Mobile (≤768px): Column stacking with horizontal scroll sidebar
- Small (≤480px): Single column, full-width buttons

## Integration Points

### With Restaurant Table Display Doctype
- Reads: `name`, `display_name`, `section`, `status`, `display_type`, `ip_address`
- Writes: `imogi_display_config` (JSON field)

### With Module Select (Optional)
- Can be added as an admin module
- Completely standalone - no shared state
- Optional link from settings menu

### Device Communication
- Currently logs test messages
- Extensible for actual device APIs
- Entry point: `test_display()` function

## Permissions

### Required Frappe Permissions
- **Read**: Restaurant Table Display
- **Write**: Restaurant Table Display (for config changes)

### Recommended Roles
- **Restaurant Manager** - Full access
- **Display Administrator** - Custom role
- **Staff** - Read-only (view but not modify)

## Usage Scenarios

### 1. Configuring Display Layout
1. Select display from sidebar
2. Go to Layout tab
3. Choose grid size (2, 3, 4, or 6 columns)
4. Toggle display elements
5. Save configuration

### 2. Customizing Colors
1. Go to Theme tab
2. Adjust status-specific colors
3. Select theme preset
4. Preview changes in real-time
5. Save when satisfied

### 3. Batch Configuration
1. Use API to apply same config to multiple displays
2. Or configure per-section using `get_section_displays()`

### 4. Testing Display
1. Click "Test Display" button
2. Monitor device connectivity
3. Verify correct data format

## Error Handling

### Frontend
- Loading spinners during async operations
- Success alerts (green, auto-dismiss 3 sec)
- Error alerts (red, manual dismiss)
- Loading state prevents duplicate operations

### Backend
- Permission checks on all endpoints
- Device existence validation
- JSON parsing error handling
- Comprehensive error logging
- Transaction support for batch operations

## Data Flow

### Configuration Load
```
Display selected → useEffect triggers → loadDisplayConfig()
→ frappe.call API → Backend merges with defaults
→ Return config → setConfig() → PreviewTab updates
```

### Configuration Save
```
Config modified → handleConfigChange() → state updates
→ User clicks Save → handleSaveConfig() → API call
→ Backend validates & persists → Success response
→ Show alert & reset button state
```

## Testing Strategy

### Manual Testing
- Load displays list
- Select individual display
- Modify each configuration option
- Verify preview updates
- Test save/reset/test buttons
- Check responsive layout on mobile
- Verify permission errors

### Unit Testing (Recommended)
```javascript
test('Config changes update preview', () => {
  handleConfigChange('showSeats', true)
  expect(config.showSeats).toBe(true)
})
```

### Integration Testing (Recommended)
```python
def test_save_display_config():
    config = {'showSeats': True}
    response = frappe.call(
        'imogi_pos.api.table_display_editor.save_display_config',
        display='DISP-001',
        config=config
    )
    assert response['success'] == True
```

## Performance Considerations

### Current Optimizations
- Single display config fetch (not all)
- Preview re-render only on config change
- Lazy tab content rendering

### Potential Optimizations
1. Cache display list in localStorage
2. Debounce preview updates
3. Code splitting per tab
4. Virtual scrolling for large display lists

## Future Enhancements

1. **Display Analytics**
   - Status distribution charts
   - Uptime monitoring
   - Error logging dashboard

2. **Advanced Theme Builder**
   - CSS variable customization
   - Custom font selection
   - Animation library

3. **Batch Operations**
   - Multi-select displays
   - Bulk configuration templates
   - Configuration presets

4. **Real-time Sync**
   - WebSocket updates
   - Live device status
   - Remote screenshots

5. **Configuration Versioning**
   - Save configuration history
   - Rollback functionality
   - Version comparison

## Troubleshooting

### Displays Not Appearing
1. Verify Restaurant Table Display records exist
2. Check user has read permission
3. Reload page and check console for errors

### Configuration Not Saving
1. Verify write permission on Restaurant Table Display
2. Check device exists and isn't deleted
3. Review browser console and Frappe logs

### Preview Not Updating
1. Check React is rendering (DevTools)
2. Verify CSS loaded in Network tab
3. Clear cache and reload

### Test Display Not Working
1. Verify device IP is configured
2. Check device is online
3. Review Frappe error logs
4. Implement actual device communication in backend

## Building & Deployment

### Build
```bash
npm run build:table-display-editor
```

### Local Development
```bash
npm run dev
# Access: http://localhost:5173/table-display-editor
```

### Deployment Checklist
- [ ] Restaurant Table Display doctype exists
- [ ] Doctype has `imogi_display_config` text field
- [ ] React app built successfully
- [ ] Routes in hooks.py configured
- [ ] Backend API working (test with Postman)
- [ ] Permissions assigned to roles
- [ ] CSS properly compiled
- [ ] Test on display list load
- [ ] Test save/load cycle
- [ ] Test with different user roles

## Related Documentation
- [Customer Display Editor](./CUSTOMER_DISPLAY_EDITOR_STANDALONE.md)
- [Module Select](./MODULE_SELECT_COMPLETE.md)
- [React Architecture](./REACT_ARCHITECTURE.md)
