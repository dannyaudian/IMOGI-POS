# Customer Display Editor - Quick Reference

## Quick Access
- **URL**: `/customer-display-editor`
- **Route**: `/devices/customer-display-editor`
- **Required Permission**: read/write on Customer Display Device

## Application Structure

### Header
- Title and description
- Reset, Test, and Save buttons
- Button states: loading, disabled, success feedback

### Sidebar (Left)
```
Device List
├── Device Name
├── Location
└── Status Badge (Active/Inactive/Offline)
```

### Main Content (Tabs)

#### Tab 1: Preview
- Live display preview showing sample order
- Responsive preview that reflects all configuration changes
- Shows: Items, quantities, prices, totals

#### Tab 2: Layout
- ☐ Show Item Images
- ☐ Show Item Description
- ☐ Show Brand Logo
- ☐ Show Subtotal
- ☐ Show Taxes
- ☐ Auto-scroll Items
  - Speed: 1-10 seconds (shows only if enabled)
- Font Size: Small | Medium | Large | Extra Large

#### Tab 3: Theme
- Background Color (color picker)
- Text Color (color picker)
- Accent Color (color picker)
- Price Color (color picker)
- Theme Preset: Dark | Light | High Contrast | Colorful

#### Tab 4: Advanced
- Display Timeout: 5-300 seconds (time before clearing inactive display)
- Refresh Interval: 1-60 seconds (update frequency)
- ☐ Enable Debug Mode
- API Key: (optional, for remote management)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `get_available_devices()` | GET | List all devices |
| `get_device_config(device)` | GET | Load device config |
| `save_device_config(device, config)` | POST | Save configuration |
| `reset_device_config(device)` | POST | Reset to defaults |
| `test_device_display(device)` | POST | Send test message |
| `batch_update_devices(updates)` | POST | Update multiple |

## Default Configuration

```javascript
{
  // Layout
  showImages: true,
  showDescription: false,
  showLogo: true,
  showSubtotal: true,
  showTaxes: false,
  autoScroll: true,
  scrollSpeed: 3,
  fontSize: '1rem',
  
  // Theme
  backgroundColor: '#1f2937',
  textColor: '#ffffff',
  accentColor: '#10b981',
  priceColor: '#fbbf24',
  themePreset: 'dark',
  
  // Advanced
  displayTimeout: 30,
  refreshInterval: 5,
  debugMode: false
}
```

## Configuration Storage

**Storage Location**: Customer Display Device → `imogi_display_config` (JSON field)

**Storage Format**: JSON string, parsed/serialized automatically

**Default Behavior**: Missing fields filled with defaults on load

## State Management

### Component State
```javascript
selectedDevice    // Current device being configured
devices          // List of all devices
config           // Current device configuration
loading          // Loading state for config fetch
saving           // Saving state
saved            // Success feedback flag (auto-reset)
activeTab        // Current tab (preview|layout|theme|advanced)
```

### Lifecycle Hooks
1. Component mount: Fetch devices list
2. Device change: Load new device config
3. Config change: Update live preview
4. Save action: Persist to backend

## Common Tasks

### Load Device Configuration
```javascript
loadDeviceConfig() → GET to backend → setState(config)
```

### Save Changes
```javascript
handleSaveConfig() → POST config → reload device → show success
```

### Reset to Defaults
```javascript
handleResetConfig() → confirm → POST reset → reload config → show success
```

### Change Tab
```javascript
setActiveTab('preview'|'layout'|'theme'|'advanced')
```

### Update Single Config Option
```javascript
handleConfigChange('showImages', true) → setState(config)
```

## User Feedback

### Success Alert
- Green indicator
- 3-second auto-dismiss
- Message: "Configuration saved successfully"

### Error Alert
- Red indicator
- Manual dismiss
- Shows error message

### Loading Indicator
- Spinner animation
- Blocks interactions
- Shows "Loading configuration..."

### Save Button States
- Default: "Save Configuration"
- Saving: "Saving..." (disabled)
- Success: "✓ Saved" (temporary, resets to default)

## Keyboard Shortcuts
None currently implemented (future enhancement)

## Responsive Behavior

| Screen Size | Layout | Notes |
|------------|--------|-------|
| Desktop (>768px) | Sidebar + Content | Full-width layout |
| Tablet (≤1200px) | Sidebar + Content | Adjusted spacing |
| Mobile (≤768px) | Sidebar (horizontal scroll) + Content | Column stacking |
| Small (≤480px) | Sidebar (vertical) + Content | Full-width buttons |

## Color Scheme

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #3b82f6 | Active buttons, highlights |
| Success | #10b981 | Success indicators |
| Warning | #f59e0b | Warning indicators |
| Error | #ef4444 | Error indicators |
| Background | #ffffff | Card backgrounds |
| Border | #e5e7eb | Dividers, form fields |

## File Locations

```
src/apps/customer-display-editor/
  ├── App.jsx          (450+ lines)
  ├── main.jsx
  ├── styles.css       (800+ lines)
  └── index.html

imogi_pos/api/
  └── customer_display_editor.py (250+ lines)

imogi_pos/www/devices/customer-display-editor/
  └── index.py
```

## Testing Checklist

- [ ] Device list loads and displays
- [ ] Can select different devices
- [ ] Configuration loads correctly
- [ ] Preview updates in real-time
- [ ] All tab controls function
- [ ] Save button works and shows feedback
- [ ] Reset button confirms and resets
- [ ] Test button sends message
- [ ] Changes persist on reload
- [ ] Form validation works
- [ ] Error handling displays correctly
- [ ] Mobile responsiveness works
- [ ] Color pickers function properly

## Integration Notes

### Standalone Features
- ✅ No dependencies on Module Select
- ✅ Direct device management
- ✅ Own state and styling
- ✅ Dedicated backend API

### Optional Links
- Can be added to Module Select as admin module
- Can be linked from settings/configuration menu
- Can be accessed directly via URL

### No Dependencies On
- ImogiPOSProvider
- useAuth hook
- Module Select state
- Device Select flow
- Any operational modules

## Performance Notes

### Load Time
- Device list: Single DB query
- Device config: Single DB query (with defaults merged)
- Preview: Client-side rendering (instant)

### Optimization Opportunities
1. Cache device list in localStorage
2. Lazy load configuration only when tab changes
3. Debounce preview updates
4. Batch save operations

## Debugging

### Browser Console
Check for:
- Network errors in Network tab
- React errors in Console
- Missing permissions in red alerts

### Frappe Logs
Check:
- `frappe.log_error()` in backend for test messages
- Permission errors for DB operations
- JSON parsing errors in config save

### Common Issues
| Problem | Solution |
|---------|----------|
| No devices appear | Verify Customer Display Device records exist |
| Can't save | Check write permission |
| Preview blank | Verify CSS loaded in Network tab |
| Test doesn't work | Implement actual device API communication |

## Future Roadmap

1. **v1.1**: Configuration versioning and rollback
2. **v1.2**: Batch device operations
3. **v1.3**: Device health monitoring
4. **v1.4**: Advanced theme builder
5. **v2.0**: WebSocket real-time sync
