# IMOGI React Loader - Permanent Fix for Double Injection

## Summary

This refactoring introduces a **shared utility** for loading React bundles across all IMOGI POS Desk pages, eliminating double injection issues and ensuring reliable remounting on route changes.

## What Was Changed

### 1. Created Shared Loader Utility
**File**: `imogi_pos/public/js/imogi_loader.js`

A centralized loader that provides:
- ✅ Script/CSS injection guards using `data-imogi-app` attributes
- ✅ Reliable remounting without re-injection
- ✅ Automatic cleanup on page hide/route change
- ✅ Promise-based loading with timeout protection
- ✅ Debug helper: `window.__imogiDebugScripts()`

### 2. Updated All Page Loaders

All Desk pages now use the shared loader:
- `imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js`
- `imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js`
- `imogi_pos/imogi_pos/page/imogi_waiter/imogi_waiter.js`
- `imogi_pos/imogi_pos/page/imogi_kitchen/imogi_kitchen.js`
- `imogi_pos/imogi_pos/page/imogi_displays/imogi_displays.js`

### 3. Registered Loader in Frappe Hooks
**File**: `imogi_pos/hooks.py`

The loader is included globally via `app_include_js` to ensure it loads before any page JS.

## How It Works

### Script Injection Guard
```javascript
// Check if script already exists
const scriptSelector = `script[data-imogi-app="${appKey}"][src="${scriptUrl}"]`;
const existingScript = document.querySelector(scriptSelector);

if (existingScript) {
    // Reuse existing script, just remount
    return waitForMountFunction(mountFnName)
        .then(mountFn => onReadyMount(mountFn, container));
}
```

### Usage Pattern
Each page loader now follows this pattern:

```javascript
frappe.pages['imogi-cashier'].on_page_show = function(wrapper) {
    const container = wrapper.__imogiCashierRoot;
    const page = wrapper.__imogiCashierPage;
    
    loadReactWidget(container, page);
};

function loadReactWidget(container, page) {
    fetch('/assets/imogi_pos/react/cashier-console/.vite/manifest.json')
        .then(res => res.json())
        .then(manifest => {
            const entry = manifest['src/apps/cashier-console/main.jsx'];
            
            window.loadImogiReactApp({
                appKey: 'cashier-console',
                scriptUrl: `/assets/imogi_pos/react/cashier-console/${entry.file}`,
                cssUrl: entry.css ? `/assets/imogi_pos/react/cashier-console/${entry.css[0]}` : null,
                mountFnName: 'imogiCashierMount',
                unmountFnName: 'imogiCashierUnmount',
                containerId: 'imogi-cashier-root',
                makeContainer: () => container,
                onReadyMount: (mountFn, containerEl) => {
                    mountFn(containerEl, { initialState: {...} });
                },
                page: page,
                logPrefix: '[Cashier Console]'
            });
        });
}
```

## Key Features

### 1. Load Count Tracking
Every load attempt is logged with count and route:
```
[IMOGI Loader] [cashier-console] Load attempt #1, route: Form/imogi-cashier
[IMOGI Loader] [cashier-console] Script already injected, reusing...
[IMOGI Loader] [cashier-console] Mount function ready, mounting...
```

### 2. Cleanup Registration
Automatic cleanup on:
- Frappe page hide (`page.on_page_hide`)
- Frappe router change (`frappe.router.on('change')`)
- Window unload (`beforeunload` event)

### 3. Debug Helper
Check injected scripts at any time:
```javascript
// In browser console
window.__imogiDebugScripts()
// Returns: { 'cashier-console': 1, 'module-select': 1, 'waiter': 1 }
```

### 4. Timeout Protection
Mount function polling times out after 10 seconds to prevent infinite loops:
```javascript
waitForMountFunction(mountFnName, appKey, logPrefix, timeout = 10000)
```

## Testing Checklist

### Basic Functionality
- [ ] Navigate to Module Select - React app loads
- [ ] Navigate to Cashier Console - React app loads
- [ ] Navigate to Waiter - React app loads
- [ ] Navigate to Kitchen Display - React app loads
- [ ] Navigate to Customer Display - React app loads

### Script Injection Guard
- [ ] Navigate to Cashier Console
- [ ] Run `window.__imogiDebugScripts()` - should show `{ 'cashier-console': 1 }`
- [ ] Navigate away and back to Cashier Console
- [ ] Run `window.__imogiDebugScripts()` again - should still show count of 1

### Remounting
- [ ] Navigate to Cashier Console (fresh load)
- [ ] Navigate to Module Select
- [ ] Navigate back to Cashier Console
- [ ] Check console logs - should see "Script already injected, reusing..."
- [ ] App should remount without errors

### Error Handling
- [ ] Delete a bundle file temporarily
- [ ] Navigate to that page
- [ ] Should see friendly error message with build instructions
- [ ] Restore bundle and refresh - should work

## Troubleshooting

### Issue: Script loads but mount function never appears
**Solution**: Check that your React app is exporting the mount function to `window`:
```javascript
// In your React app's main.jsx
window.imogiCashierMount = (container, options) => {
    createRoot(container).render(<App {...options} />);
};
```

### Issue: Multiple script tags still appearing
**Solution**: Clear browser cache and check that the loader is loaded first in `hooks.py`:
```python
app_include_js = [
    '/assets/imogi_pos/js/imogi_loader.js',  # Must be first!
    # ... other scripts
]
```

### Issue: Cleanup not working
**Solution**: Ensure your React app exports an unmount function:
```javascript
window.imogiCashierUnmount = (container) => {
    // Cleanup logic here
    ReactDOM.unmountComponentAtNode(container);
};
```

## Migration Notes

### Before (Old Pattern)
Each page had duplicate injection logic:
- Manual script/CSS guards
- `setInterval` polling for mount function
- No cleanup registration
- Inconsistent error handling

### After (New Pattern)
- Single shared loader with consistent behavior
- Automatic cleanup registration
- Standardized logging and error handling
- Debug helper for troubleshooting

## Future Enhancements

Potential improvements:
1. **Lazy Loading**: Load bundles only when needed (currently loads on first page show)
2. **Preloading**: Preload likely-next-page bundles for faster navigation
3. **Cache Invalidation**: Auto-reload on bundle version change
4. **Performance Metrics**: Track load times and mounting performance

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Use `window.__imogiDebugScripts()` to inspect injection state
3. Review this document for common troubleshooting steps
4. Check that `imogi_loader.js` is loaded globally via hooks.py

---

**Last Updated**: January 28, 2026
**Author**: IMOGI Development Team
**Status**: ✅ Production Ready
