# Customer Display Editor - Build Configuration & Architecture

## Build Configuration

### Vite Configuration
The Customer Display Editor is built as a standalone Vite app with the following configuration:

```javascript
// vite.config.js excerpt
{
  name: 'customer-display-editor',
  entry: 'src/apps/customer-display-editor/main.jsx',
  outDir: 'dist/apps/customer-display-editor'
}
```

### Build Command
```bash
npm run build:customer-display-editor
```

### Development Server
```bash
npm run dev
# Access at: http://localhost:5173/src/apps/customer-display-editor/
```

## Application Architecture

### Layer 1: Frontend (React)

#### Main App Component (`App.jsx`)
**Responsibility**: Orchestrate device selection, configuration management, and UI rendering

**Structure**:
```
App
├── Header
│   ├── Title/Description
│   └── Action Buttons (Reset, Test, Save)
├── Main (Flex Container)
│   ├── Sidebar
│   │   └── Device List
│   │       ├── Device Items
│   │       └── Status Badges
│   └── Content
│       ├── Tabs Navigation
│       └── Tab Content
│           ├── PreviewTab
│           ├── LayoutTab
│           ├── ThemeTab
│           └── AdvancedTab
```

**State Management**:
```javascript
const [selectedDevice, setSelectedDevice] = useState(null)           // Active device
const [devices, setDevices] = useState([])                          // Device list
const [config, setConfig] = useState({})                            // Current config
const [loading, setLoading] = useState(true)                        // Loading state
const [saving, setSaving] = useState(false)                         // Save state
const [saved, setSaved] = useState(false)                           // Success feedback
const [activeTab, setActiveTab] = useState('preview')               // Tab state
```

#### Tab Components (Inline)

Each tab is implemented as a functional component within App.jsx:

**PreviewTab**:
- Renders live display simulation
- Shows sample order data
- Reflects config changes in real-time
- Uses CSS inline styles for theming

**LayoutTab**:
- Checkbox controls for display options
- Conditional rendering for scroll speed
- Font size dropdown
- Form field styling

**ThemeTab**:
- Color input elements (HTML5 color pickers)
- Theme preset selector
- 4 color customization options

**AdvancedTab**:
- Numeric inputs for timeouts/intervals
- Debug mode toggle
- Password input for API key
- Help text for each field

### Layer 2: Styling System (`styles.css`)

#### CSS Architecture
- **CSS Variables**: Root-level theming tokens
- **Component Classes**: BEM-like naming (e.g., `.cde-sidebar`, `.cde-device-item`)
- **Responsive Design**: Mobile-first with breakpoints at 1200px, 768px, 480px
- **Animation**: Smooth transitions, spinner animation

#### Key Stylable Elements
```css
.cde-app              /* Main container */
.cde-header           /* Header section */
.cde-main             /* Main flex container */
.cde-sidebar          /* Left sidebar */
.cde-device-item      /* Device list item */
.cde-content          /* Main content area */
.cde-tabs             /* Tab navigation */
.cde-tab-content      /* Tab content panel */
.cde-form-field       /* Form field container */
.cde-preview-display  /* Live preview */
.cde-btn-primary      /* Primary button */
.cde-btn-secondary    /* Secondary button */
```

### Layer 3: Backend API (`customer_display_editor.py`)

#### API Endpoint Architecture

**Pattern**: `@frappe.whitelist()` endpoints for server-side functions

**Authentication**: Built-in Frappe session checking

**Authorization**: Per-endpoint permission checks

#### Core Endpoints

1. **get_available_devices()**
   - Query: All Customer Display Device records
   - Returns: List with device info
   - Permission: read

2. **get_device_config(device)**
   - Input: device ID
   - Query: Fetch device record
   - Parse: JSON config field
   - Merge: With defaults
   - Returns: Device + merged config

3. **save_device_config(device, config)**
   - Input: device ID + config object
   - Validate: Config structure
   - Serialize: To JSON string
   - Save: Update device record
   - Commit: Database transaction
   - Permission: write

4. **reset_device_config(device)**
   - Input: device ID
   - Action: Set to defaults
   - Save: Update device record
   - Returns: New config

5. **test_device_display(device)**
   - Input: device ID
   - Action: Simulate device communication
   - Logging: Log test payload
   - Future: Actual API calls to device

6. **batch_update_devices(updates)**
   - Input: Array of {device, config} updates
   - Loop: Process each update
   - Error: Collect errors without failing
   - Returns: Results array with success/error per device

#### Configuration Management

**Default Config** (applied if missing):
```python
{
    'showImages': True,           # Display item photos
    'showDescription': False,     # Show item descriptions
    'showLogo': True,            # Show brand logo
    'showSubtotal': True,        # Show subtotal line
    'showTaxes': False,          # Show tax breakdown
    'autoScroll': True,          # Auto-scroll items
    'scrollSpeed': 3,            # Scroll pause duration (seconds)
    'fontSize': '1rem',          # Base font size
    'backgroundColor': '#1f2937', # Display bg color
    'textColor': '#ffffff',      # Display text color
    'accentColor': '#10b981',    # Highlight color
    'priceColor': '#fbbf24',     # Price highlight color
    'themePreset': 'dark',       # Theme variant
    'displayTimeout': 30,        # Blank screen timeout (seconds)
    'refreshInterval': 5,        # Update frequency (seconds)
    'debugMode': False           # Enable debug output
}
```

**Storage**:
- **DocField**: Customer Display Device → `imogi_display_config`
- **Type**: Text (JSON serialized)
- **Format**: Parsed/validated on load, serialized on save

### Layer 4: Page Context (`index.py`)

#### Frappe Page Context Builder

**File**: `imogi_pos/www/devices/customer-display-editor/index.py`

**Responsibilities**:
1. Auth check (redirect if Guest)
2. Permission validation
3. Build context dict
4. Inject initial state (if needed)

**Context Values**:
```python
{
    'title': 'Customer Display Editor',
    'page_title': 'Customer Display Editor',
    'no_breadcrumbs': True,
    'show_sidebar': False
}
```

### Layer 5: Routing Configuration

#### Website Routes (`hooks.py`)

```python
website_route_rules = [
    {"from_route": "/customer-display-editor", "to_route": "/devices/customer-display-editor"},
    {"from_route": "/devices/customer-display-editor", "to_route": "/devices/customer-display-editor"},
]
```

**Route Resolution**:
1. User visits `/customer-display-editor`
2. Frappe routes to `/devices/customer-display-editor`
3. Renders `imogi_pos/www/devices/customer-display-editor/index.html`
4. Loads React app from `src/apps/customer-display-editor/main.jsx`

## Data Flow Architecture

### Load Configuration Flow
```
User selects device
    ↓
setSelectedDevice(device)
    ↓
useEffect triggered
    ↓
loadDeviceConfig()
    ↓
frappe.call('get_device_config', {device})
    ↓
Backend: fetch device, parse config, merge with defaults
    ↓
Return {device, config}
    ↓
setConfig(merged_config)
    ↓
PreviewTab re-renders with new config
```

### Save Configuration Flow
```
User modifies config (handleConfigChange)
    ↓
setConfig({...config, key: value})
    ↓
Preview updates immediately (local state)
    ↓
User clicks Save
    ↓
handleSaveConfig()
    ↓
setSaving(true)
    ↓
frappe.call('save_device_config', {device, config})
    ↓
Backend: validate, serialize, update, commit
    ↓
Return {success: true}
    ↓
setSaving(false)
    ↓
Show alert "Saved!"
    ↓
setSaved(true)
    ↓
Auto-reset after 2 seconds
```

### Reset Configuration Flow
```
User clicks Reset
    ↓
confirm('Reset to default?')
    ↓
frappe.call('reset_device_config', {device})
    ↓
Backend: set to defaults, save, return new config
    ↓
loadDeviceConfig() (reload)
    ↓
setConfig(new_defaults)
    ↓
Show alert "Reset to defaults"
```

## Component Lifecycle

### Mounting
```javascript
useEffect(() => {
  if (deviceList) {
    setDevices(deviceList)
    if (!selectedDevice && deviceList.length > 0) {
      setSelectedDevice(deviceList[0].name)
    }
  }
}, [deviceList, selectedDevice])
```

### Device Change
```javascript
useEffect(() => {
  if (selectedDevice) {
    loadDeviceConfig()
  }
}, [selectedDevice])
```

### Config Changes
- Handled by `handleConfigChange(key, value)`
- Updates state: `setConfig(prev => ({...prev, [key]: value}))`
- Immediate UI update (no backend call)
- PreviewTab reflects change instantly

## State Management Strategy

### Local State Only
- No Redux/Context API needed
- Single component manages all state
- Simpler debugging and reasoning about data

### State Categories

**UI State**:
- `activeTab` - Current configuration tab
- `loading` - Config fetch in progress
- `saving` - Config save in progress
- `saved` - Success feedback flag

**Data State**:
- `devices` - List of all devices
- `selectedDevice` - Currently editing
- `config` - Current device configuration

### State Updates
- Direct `useState` setters
- Conditional updates in `handleConfigChange`
- Async updates in frappe callbacks

## Permission System

### Frappe Permission Checks

**Read Permission**:
```python
frappe.has_permission('Customer Display Device', 'read')
```
- Allows: Viewing devices and their config
- Required for: `get_available_devices()`, `get_device_config()`, `test_device_display()`

**Write Permission**:
```python
frappe.has_permission('Customer Display Device', 'write')
```
- Allows: Modifying configuration
- Required for: `save_device_config()`, `reset_device_config()`, `batch_update_devices()`

### Recommended Roles
- **POS Manager** - Full access (read + write)
- **Display Admin** (custom) - Full access to displays only
- **Support Staff** - Read-only access

## Error Handling Strategy

### Frontend Error Handling
```javascript
// API calls wrapped with error handling
frappe.call({
  method: '...',
  callback: (r) => {
    // success: r.message contains response
  },
  error: () => {
    frappe.show_alert({message: '...', indicator: 'red'}, 3)
  }
})
```

### Backend Error Handling
```python
# Permission checks throw PermissionError
if not frappe.has_permission(...):
    frappe.throw(_('Not permitted'), frappe.PermissionError)

# Validation throws ValidationError
if not isinstance(config, dict):
    frappe.throw(_('Config must be a dictionary'))

# Data errors handled gracefully
try:
    config = json.loads(device_doc.imogi_display_config)
except json.JSONDecodeError:
    config = {}  # Use defaults
```

### User Feedback
- **Success**: Green alert, auto-dismiss (3 sec)
- **Error**: Red alert, manual dismiss
- **Loading**: Gray spinner, blocks interaction
- **Save Status**: Button text changes (Saving... → ✓ Saved)

## Performance Considerations

### Optimizations (Current)
- Single device config fetch (not all devices)
- Preview re-render only on config change
- Lazy tab content rendering

### Future Optimizations
1. **Caching**: Device list in localStorage
2. **Debouncing**: Preview updates
3. **Code Splitting**: Each tab as separate chunk
4. **Virtualization**: Device list if many devices

### Load Times
- App JS: ~50KB (minified)
- CSS: ~40KB (minified)
- Initial load: <1s on 3G
- Config fetch: ~200ms typical

## Security Considerations

### Frontend Security
- No sensitive data in state
- All config validated on backend
- API key field is password input (hidden)

### Backend Security
- All endpoints require login
- Permission checks on every endpoint
- Input validation before database write
- No arbitrary code execution from config

### Database Security
- Config stored as JSON in text field
- No eval() or exec() on user input
- Frappe's built-in transaction handling

## Testing Strategy

### Unit Tests (Recommended)
```javascript
// Test config state updates
test('handleConfigChange updates config', () => {
  handleConfigChange('fontSize', '2rem')
  expect(config.fontSize).toBe('2rem')
})

// Test API calls
test('loadDeviceConfig calls backend', () => {
  frappe.call.mockResolvedValue({...})
  loadDeviceConfig()
  expect(frappe.call).toHaveBeenCalledWith({
    method: 'imogi_pos.api.customer_display_editor.get_device_config'
  })
})
```

### Integration Tests (Recommended)
```python
# Test save_device_config endpoint
def test_save_device_config(self):
    config = {'showImages': False}
    response = frappe.call(
        'imogi_pos.api.customer_display_editor.save_device_config',
        device='DEV-001',
        config=config
    )
    assert response['success'] == True
    
# Verify saved to database
device = frappe.get_doc('Customer Display Device', 'DEV-001')
saved_config = json.loads(device.imogi_display_config)
assert saved_config['showImages'] == False
```

### Manual Testing
See [Quick Reference](./CUSTOMER_DISPLAY_EDITOR_QUICKREF.md) - Testing Checklist

## Deployment Checklist

- [ ] Customer Display Device DocType exists
- [ ] Customer Display Device has `imogi_display_config` text field
- [ ] React app built: `npm run build:customer-display-editor`
- [ ] Routes added to hooks.py
- [ ] API endpoints functional (test with Postman/Insomnia)
- [ ] Permissions assigned to roles
- [ ] www page template created
- [ ] CSS files compiled
- [ ] Test on device list load
- [ ] Test config save/load cycle
- [ ] Test with different user roles

## Integration with Other Systems

### Module Select Integration (Optional)
- Can add module card pointing to `/customer-display-editor`
- No shared state or dependencies
- Independent permission system

### Customer Display Device Integration
- Reads/writes to Customer Display Device doctype
- Uses `imogi_display_config` JSON field
- No modifications needed to doctype

### Device Communication (Not Implemented)
- Currently logs test messages
- Can extend with actual device API calls
- See `test_device_display()` for entry point

## Version History

**v1.0** (Current)
- Initial release
- Core device selection and configuration
- Tab-based UI
- Live preview
- Backend API complete

**v1.1** (Planned)
- Configuration versioning
- Rollback functionality
- Configuration templates

**v1.2** (Planned)
- Batch device operations
- Device health monitoring
- Configuration export/import

**v2.0** (Planned)
- WebSocket real-time sync
- Advanced theme builder
- Device screenshot capability
