# Table Display Editor - Quick Reference

## Quick Access
- **URL**: `/table-display-editor`
- **Route**: `/devices/table-display-editor`
- **Required Permission**: read/write on Restaurant Table Display

## UI Structure

### Header
- Title: "Table Display Editor"
- Subtitle: "Configure and manage restaurant table status displays"
- Buttons: Reset, Test, Save

### Sidebar
```
Displays (list of all table displays)
├── Display Name
├── Section
└── Status Badge
```

### Main Content (4 Tabs)

| Tab | Purpose | Key Controls |
|-----|---------|--------------|
| Preview | Live table display preview | Shows 4 sample tables with status |
| Layout | Table display configuration | Grid size, element visibility |
| Theme | Color and appearance | Status colors, font size, presets |
| Advanced | Technical settings | Refresh, polling, animations |

## Configuration Options

### Layout Tab
- ☐ Show Table Numbers
- ☐ Show Seat Count
- ☐ Show Status Labels
- ☐ Show Waiter Name
- ☐ Show Order Time
- Grid Layout: 2 | 3 | 4 | 6 columns
- Font Size: Small | Medium | Large | Extra Large
- Update Interval: 1-60 seconds

### Theme Tab
- Background Color (picker)
- Text Color (picker)
- Available Table Color (picker)
- Occupied Table Color (picker)
- Reserved Table Color (picker)
- Dirty Table Color (picker)
- Theme Preset: Dark | Light | Professional | Vibrant

### Advanced Tab
- ☐ Enable Auto-Refresh
- Polling Interval: 1-60 seconds
- Animation Speed: 100-2000 ms
- ☐ Enable Animations
- ☐ Show Section Header
- ☐ Enable Debug Mode
- API Key: (optional)

## Default Configuration

```javascript
{
  // Layout
  showTableNumbers: true,
  showSeats: false,
  showStatusLabels: true,
  showWaiterName: false,
  showOrderTime: false,
  gridLayout: '4',
  fontSize: '1rem',
  updateInterval: 5,
  
  // Theme
  backgroundColor: '#1f2937',
  textColor: '#ffffff',
  availableColor: '#10b981',
  occupiedColor: '#ef4444',
  reservedColor: '#f59e0b',
  dirtyColor: '#8b5cf6',
  themePreset: 'dark',
  
  // Advanced
  enableAutoRefresh: true,
  pollingInterval: 5,
  animationSpeed: 300,
  enableAnimations: true,
  showSectionHeader: true,
  debugMode: false
}
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `get_available_displays()` | GET | List all displays |
| `get_display_config(display)` | GET | Load display config |
| `save_display_config(display, config)` | POST | Save configuration |
| `reset_display_config(display)` | POST | Reset to defaults |
| `test_display(display)` | POST | Send test message |
| `batch_update_displays(updates)` | POST | Update multiple |
| `get_section_displays(section)` | GET | Get section displays |

## Table Status Indicators

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| Available | ✓ | Green | Table ready |
| Occupied | ● | Red | Guests present |
| Reserved | ◆ | Amber | Table reserved |
| Dirty | ✗ | Purple | Needs cleaning |

## State Management

### Component State Variables
```javascript
selectedDisplay    // Currently editing display
displays          // All available displays
config            // Current display config
loading           // Config fetch in progress
saving            // Config save in progress
saved             // Save success flag
activeTab         // Current tab (preview|layout|theme|advanced)
```

### Lifecycle Events
1. Component mount → Fetch displays list
2. Display change → Load new display config
3. Config change → Update preview
4. Save action → Persist to backend

## User Actions

### Load Configuration
```
Select display → Fetch config → Merge defaults → Update preview
```

### Modify Configuration
```
Change setting → Update state → Preview reflects change
```

### Save Configuration
```
Click Save → API call → Persist to DB → Show success
```

### Reset Configuration
```
Click Reset → Confirm → API call → Reload defaults → Show success
```

### Test Display
```
Click Test → API call → Send test payload → Show confirmation
```

## Feedback Indicators

| Indicator | Color | Duration | Message |
|-----------|-------|----------|---------|
| Success | Green | 3 sec | "Configuration saved successfully" |
| Error | Red | Manual | Error message displayed |
| Info | Blue | 3 sec | "Test message sent to display" |
| Loading | Spinner | Until done | Blocks interaction |

## Button States

### Save Button
- Default: "Save Configuration"
- Saving: "Saving..." (disabled)
- Success: "✓ Saved" (temporary)

### Reset Button
- Enabled: Shows confirmation dialog
- Disabled: When loading or not selected

### Test Button
- Enabled: Sends test to selected display
- Disabled: When loading or not selected

## File Locations

```
Frontend:
  src/apps/table-display-editor/
    ├── App.jsx (550+ lines)
    ├── main.jsx
    ├── styles.css (850+ lines)
    └── index.html

Backend:
  imogi_pos/api/table_display_editor.py (300+ lines)
  imogi_pos/www/devices/table-display-editor/index.py
```

## CSS Class Structure

| Class | Purpose |
|-------|---------|
| `.tde-app` | Main container |
| `.tde-header` | Top section |
| `.tde-main` | Content flex container |
| `.tde-sidebar` | Display list |
| `.tde-content` | Configuration area |
| `.tde-tabs` | Tab navigation |
| `.tde-tab-content` | Tab content panel |
| `.tde-preview-display` | Live preview area |
| `.tde-form-group` | Form section |
| `.tde-btn-primary` | Primary action |
| `.tde-btn-secondary` | Secondary action |

## Responsive Breakpoints

| Size | Display | Layout |
|------|---------|--------|
| Desktop | >768px | Sidebar + Content |
| Tablet | ≤1200px | Adjusted spacing |
| Mobile | ≤768px | Column layout |
| Small | ≤480px | Single column |

## Color System

| Color | Usage | Value |
|-------|-------|-------|
| Primary | Active, highlights | #3b82f6 |
| Success | Available tables | #10b981 |
| Danger | Occupied tables | #ef4444 |
| Warning | Reserved tables | #f59e0b |
| Info | Dirty tables | #8b5cf6 |
| Background | Card bg | #ffffff |

## Testing Checklist

- [ ] Display list loads
- [ ] Can select different displays
- [ ] Configuration loads correctly
- [ ] Preview updates in real-time
- [ ] All tabs function properly
- [ ] Save works with feedback
- [ ] Reset confirms and resets
- [ ] Test sends message
- [ ] Changes persist on reload
- [ ] Color pickers work
- [ ] Mobile layout responsive
- [ ] Error handling displays correctly

## Common Tasks

### Configure Display for 2-Column Layout
1. Select display
2. Go to Layout tab
3. Set Grid Layout to "2 Columns"
4. Save

### Apply Professional Theme
1. Go to Theme tab
2. Select "Professional" preset
3. Adjust colors if needed
4. Save

### Test Device Connectivity
1. Go to Advanced tab
2. Enable Debug Mode
3. Click "Test Display" button
4. Check Frappe logs for payload

### Batch Update Multiple Displays
```javascript
frappe.call({
  method: 'imogi_pos.api.table_display_editor.batch_update_displays',
  args: {
    updates: [
      {display: 'DISP-001', config: {...}},
      {display: 'DISP-002', config: {...}}
    ]
  }
})
```

## Performance Tips

1. Load only when needed
2. Cache display list locally
3. Use section-based filtering for many displays
4. Test with actual device communication
5. Monitor polling intervals in production

## Debugging

### Enable Debug Mode
1. Go to Advanced tab
2. Check "Enable Debug Mode"
3. Save configuration
4. Check browser console

### Check Backend Logs
```
Frappe Logs → Search for "Table Display"
```

### Network Debugging
1. Open DevTools
2. Monitor Network tab
3. Check API response times
4. Verify payload structure

## Common Issues

| Problem | Solution |
|---------|----------|
| No displays | Create Restaurant Table Display records |
| Can't save | Check write permission |
| Preview blank | Verify CSS loaded |
| Test fails | Implement device API |
| Slow load | Check polling interval |
