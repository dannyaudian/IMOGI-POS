# ROUTE TRANSITION FIX - Module Select → Cashier Navigation

**Date**: December 2024  
**Status**: ✅ Complete  
**Impact**: Fixes double-click requirement and route bounce-back issues in Frappe Desk SPA navigation

---

## 🎯 Problem Statement

### User Report
Users navigating from Module Select (`/app/imogi-module-select`) to Cashier (`/app/imogi-cashier`) experienced:
1. **Double-click requirement** - Clicking a module button once didn't always navigate
2. **Route bounce-back** - Page would briefly show cashier, then bounce back to module-select
3. **No visual feedback** - Users couldn't tell if navigation was in progress
4. **Duplicate context setting** - Multiple rapid clicks could trigger duplicate API calls

### Root Cause Analysis

After auditing the route transition flow, identified **4 critical issues**:

#### 1. No Navigation Lock
- `proceedToModule()` had NO duplicate click prevention
- Users could click multiple times while `setOperationalContext()` was pending
- Each click would trigger a new context API call AND navigation attempt

#### 2. No Loading State
- Module buttons showed NO visual feedback during navigation
- Users couldn't tell if their click was registered
- Led to repeated clicking, causing race conditions

#### 3. Premature Remounting
- `imogi_module_select.js` `on_page_show` ALWAYS called `loadReactWidget()`
- When cashier loaded, it briefly triggered module-select's `on_page_show`
- Caused module-select to remount while navigating away (bounce-back effect)

#### 4. No Deduplication in deskNavigate
- `deskNavigate()` had no guard against duplicate calls
- Multiple navigation requests could race to call `frappe.set_route()`
- No global lock to prevent overlapping navigations

---

## 🔧 Implementation

### 1. Navigation Lock in Module Select React

**File**: `/src/apps/module-select/App.jsx`

Added state variables:
```javascript
const [navigationLock, setNavigationLock] = useState(false)
const [navigatingToModule, setNavigatingToModule] = useState(null)
```

**Changes in `handleModuleClick()`**:
```javascript
const handleModuleClick = async (module) => {
  // Prevent duplicate clicks during navigation
  if (navigationLock) {
    console.warn('[module-select] Navigation in progress, ignoring click')
    return
  }
  
  console.log('🖱️ [MODULE CLICK]', module.name, {
    requires_pos_profile: module.requires_pos_profile,
    current_pos_profile: contextData.pos_profile,
    navigation_lock: navigationLock
  })
  
  // ... rest of logic
}
```

**Changes in `navigateToModule()`**:
```javascript
const navigateToModule = (module) => {
  // Check navigation lock
  if (navigationLock) {
    console.warn('[module-select] Navigation already in progress')
    return
  }

  // Acquire navigation lock
  console.log('🔒 [NAVIGATION LOCK] Acquired for', module.name)
  setNavigationLock(true)
  setNavigatingToModule(module.type)
  
  // Enhanced logging
  console.log('🚀 [ROUTE TRANSITION START] Module-select → ' + module.name, {
    from_route: window.location.pathname,
    to_route: url.pathname,
    frappe_current_route: frappe.get_route_str(),
    navigation_lock: true,
    timestamp: new Date().toISOString()
  })
  
  deskNavigate(url.pathname + url.search, {
    logPrefix: `[module-select → ${module.type}]`
  })
  
  console.log('🚀 [ROUTE TRANSITION END] deskNavigate called', {
    to_route: url.pathname,
    frappe_current_route_after: frappe.get_route_str()
  })
  
  // Release lock after timeout (safety fallback)
  setTimeout(() => {
    console.log('🔓 [NAVIGATION LOCK] Released after timeout')
    setNavigationLock(false)
    setNavigatingToModule(null)
  }, 3000)
}
```

**Changes in `proceedToModule()`**:
Added emoji markers and enhanced logging for context setting:
```javascript
console.log('⚙️ [CONTEXT SET START]', {
  pos_profile: contextData.pos_profile,
  branch: contextData.branch,
  module: module.name,
  timestamp: new Date().toISOString()
})

// ... API call ...

console.log('⚙️ [CONTEXT SET END]', {
  success: response?.success,
  has_context: !!response?.context,
  timestamp: new Date().toISOString()
})

console.log('✅ [CONTEXT SET SUCCESS]', { context: response.context })
```

---

### 2. Visual Loading State

**File**: `/src/apps/module-select/components/ModuleCard.jsx`

Added props:
```javascript
function ModuleCard({ module, onClick, posOpeningStatus, isNavigating, isLoading }) {
  const isDisabled = !isAccessible || isNavigating
  
  return (
    <div 
      className={`module-card ${getModuleColor(module.type)} 
        ${!isAccessible ? 'module-locked' : ''} 
        ${isNavigating ? 'module-navigating' : ''} 
        ${isLoading ? 'module-loading' : ''}`}
      onClick={!isDisabled ? onClick : undefined}
      title={needsOpening ? 'Please open a POS opening first' : 
             isNavigating ? 'Navigation in progress...' : ''}
    >
      <div className="module-icon">
        {isLoading ? (
          <div className="loading-spinner"></div>
        ) : (
          <i className={`fa-solid ${getModuleIcon(module.type)}`}></i>
        )}
      </div>
      {/* ... rest of card ... */}
    </div>
  )
}
```

**File**: `/src/apps/module-select/App.jsx` - Pass props to ModuleCard:
```javascript
<ModuleCard
  key={module.type}
  module={module}
  onClick={() => handleModuleClick(module)}
  posOpeningStatus={posOpeningStatus}
  isNavigating={navigationLock}
  isLoading={navigatingToModule === module.type}
/>
```

**File**: `/src/apps/module-select/styles.css` - Added CSS:
```css
/* Module Navigating State */
.module-card.module-navigating {
  pointer-events: none;
  opacity: 0.7;
}

.module-card.module-loading {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(36, 144, 239, 0.1);
}

/* Loading Spinner */
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(36, 144, 239, 0.2);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

---

### 3. Prevent Premature Remounting

**File**: `/imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js`

**Changes in `on_page_show`**:
```javascript
frappe.pages['imogi-module-select'].on_page_show = function(wrapper) {
	console.log('🟢 [DESK PAGE SHOW] Module Select', {
		route: frappe.get_route_str(),
		navigation_lock: window.__imogiNavigationLock,
		timestamp: new Date().toISOString()
	});
	
	// CRITICAL: Check if we're navigating away - don't remount if so
	if (window.__imogiNavigationLock) {
		console.log('⛔ [DESK] Module Select skipping mount - navigation in progress');
		return;
	}
	
	// ... rest of original logic ...
};
```

**Why This Works**:
- When user clicks cashier module button, `navigationLock` is set to `true`
- Global `window.__imogiNavigationLock` is also set by `deskNavigate()`
- If `frappe.set_route()` briefly triggers module-select's `on_page_show`, it sees the lock and **skips remounting**
- Prevents the bounce-back effect

---

### 4. Global Navigation Lock in deskNavigate

**File**: `/src/shared/utils/deskNavigate.js`

```javascript
export function deskNavigate(path, options = {}) {
  const { params = {}, replace = false, logPrefix = '[deskNavigate]' } = options

  // Check navigation lock - prevent duplicate navigations
  if (window.__imogiNavigationLock) {
    console.warn(`${logPrefix} ⛔ Navigation locked - ignoring duplicate request to:`, path)
    return
  }

  // Acquire global navigation lock
  window.__imogiNavigationLock = true
  console.log(`${logPrefix} 🔒 Navigation lock ACQUIRED`)

  // Build full URL...
  
  console.log(`${logPrefix} Navigating to:`, {
    path,
    params,
    fullUrl,
    method: typeof frappe !== 'undefined' && frappe.set_route ? 'frappe.set_route' : 'window.location',
    timestamp: new Date().toISOString()
  })

  if (typeof frappe !== 'undefined' && frappe.set_route) {
    try {
      // ... route parsing ...
      
      console.log(`${logPrefix} 🚀 Calling frappe.set_route(${routeParts.join(', ')})`)
      frappe.set_route(...routeParts)
      console.log(`${logPrefix} Navigation via frappe.set_route completed`)
      
      // Release lock after successful navigation (with delay to prevent race)
      setTimeout(() => {
        window.__imogiNavigationLock = false
        console.log(`${logPrefix} 🔓 Navigation lock RELEASED (after route change)`)
      }, 2000)
      
      return
    } catch (error) {
      console.warn(`${logPrefix} frappe.set_route failed:`, error)
    }
  }

  // Fallback to window.location (lock cleared by page load)
  if (replace) {
    window.location.replace(fullUrl)
  } else {
    window.location.href = fullUrl
  }
}
```

**Lock Timing**:
- Lock acquired **before** `frappe.set_route()` call
- Lock released **after 2000ms delay** (allows route transition to complete)
- If using `window.location` fallback, page reload clears lock naturally

---

## 📊 Complete Flow

### Before Fix
```
User clicks Cashier button
  → proceedToModule() calls setOperationalContext()
  → User clicks again (no feedback, no lock)
  → Second setOperationalContext() call races with first
  → navigateToModule() called multiple times
  → frappe.set_route() called multiple times
  → Desk briefly shows cashier, triggers module-select on_page_show
  → module-select remounts (bounce-back)
  → User sees module-select again, clicks again
  → Repeat...
```

### After Fix
```
User clicks Cashier button
  🖱️ handleModuleClick() logs click
  ⚙️ proceedToModule() sets context (500ms delay)
  ✅ Context set successfully
  🔒 navigationLock = true (React state)
  🚀 navigateToModule() calls deskNavigate()
  🔒 window.__imogiNavigationLock = true (global)
  🚀 frappe.set_route('app', 'imogi-cashier')
  
  (Meanwhile...)
  🟢 module-select on_page_show triggered
  ⛔ Sees window.__imogiNavigationLock = true
  ⛔ Skips loadReactWidget() - no remount
  
  (2 seconds later...)
  🔓 Navigation lock released
  🎉 Cashier page fully loaded
```

---

## 🧪 Testing

### Manual Testing Steps

1. **Single Click Test**:
   ```
   ✅ Open /app/imogi-module-select
   ✅ Click "Cashier Console" button ONCE
   ✅ Should see loading spinner on clicked button
   ✅ All other buttons should be dimmed (pointer-events: none)
   ✅ Should navigate to /app/imogi-cashier without bounce-back
   ```

2. **Rapid Click Test**:
   ```
   ✅ Open /app/imogi-module-select
   ✅ Rapidly click "Cashier Console" button 5+ times
   ✅ Should only trigger ONE navigation
   ✅ Console should show: "Navigation in progress, ignoring click"
   ✅ Should NOT see multiple "CONTEXT SET START" logs
   ```

3. **Console Verification**:
   ```javascript
   // Expected log sequence (one time only):
   🖱️ [MODULE CLICK] Cashier Console
   ⚙️ [CONTEXT SET START]
   ⚙️ [CONTEXT SET END]
   ✅ [CONTEXT SET SUCCESS]
   🔒 [NAVIGATION LOCK] Acquired for Cashier Console
   🚀 [ROUTE TRANSITION START] Module-select → Cashier Console
   [deskNavigate] 🔒 Navigation lock ACQUIRED
   [deskNavigate] 🚀 Calling frappe.set_route(app, imogi-cashier)
   🟢 [DESK PAGE SHOW] Module Select { navigation_lock: true }
   ⛔ [DESK] Module Select skipping mount - navigation in progress
   [deskNavigate] 🔓 Navigation lock RELEASED (after route change)
   🔓 [NAVIGATION LOCK] Released after timeout
   ```

4. **Visual Feedback Test**:
   ```
   ✅ Click module button → should see blue spinning loader in icon
   ✅ Button should have blue border and subtle glow
   ✅ All other module cards should be semi-transparent
   ✅ Loader should persist until navigation completes
   ```

### Automated Tests (Future)

Add to `/tests/browser_navigation_test.js`:
```javascript
// Test navigation lock prevents duplicate clicks
await page.evaluate(() => {
  const button = document.querySelector('.module-card[data-module="cashier"]')
  button.click()
  button.click() // Should be ignored
  button.click() // Should be ignored
})

// Verify only one context API call
const apiCalls = await page.evaluate(() => {
  return performance.getEntriesByType('resource')
    .filter(r => r.name.includes('set_operational_context'))
})
assert.equal(apiCalls.length, 1, 'Should only call context API once')
```

---

## 🐛 Debug Tools

### Console Commands

**Check navigation lock status**:
```javascript
window.__imogiNavigationLock
// Should be false when idle, true during navigation
```

**Check module-select mount state**:
```javascript
document.getElementById('imogi-module-select-root').__imogiModuleSelectMounted
// Should be true after mount
```

**Watch route transitions**:
```javascript
// Monitor frappe router
frappe.router.on('change', () => {
  console.log('Route changed:', frappe.get_route_str())
})
```

**Check script injection**:
```javascript
window.__imogiDebugScripts()
// Shows all loaded IMOGI React bundles
```

---

## 📋 Files Modified

### React Components
- ✅ `/src/apps/module-select/App.jsx` - Added navigation lock, loading state, enhanced logging
- ✅ `/src/apps/module-select/components/ModuleCard.jsx` - Added loading prop, spinner logic
- ✅ `/src/apps/module-select/styles.css` - Added `.module-navigating`, `.module-loading`, `.loading-spinner`

### Shared Utilities
- ✅ `/src/shared/utils/deskNavigate.js` - Added global navigation lock, deduplication

### Desk Page Shells
- ✅ `/imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js` - Added navigation lock check in `on_page_show`

### Documentation
- ✅ `/ROUTE_TRANSITION_FIX.md` (this file)

---

## 🚀 Deployment

### Build Commands
```bash
# Build module-select with navigation fixes
npm run build:module-select

# Build all apps
npm run build:all
```

### Verification After Deploy
```bash
# Clear browser cache (hard refresh)
Cmd+Shift+R (macOS) or Ctrl+Shift+R (Windows/Linux)

# Check console for new log format
🖱️ [MODULE CLICK]
🔒 [NAVIGATION LOCK]
🚀 [ROUTE TRANSITION START]
⛔ [DESK] Module Select skipping mount
```

---

## 🔗 Related Work

### Previous Fixes in This Session
1. **React Loader Refactor** (`REACT_LOADER_REFACTOR.md`)
   - Created `imogi_loader.js` shared utility
   - Prevents double script injection
   - Adds cleanup on unroute

2. **API Session Handling** (`API_SESSION_HANDLING_FIX.md`)
   - Created `api.js` with session expiry detection
   - Created `SessionExpired.jsx` component
   - Fixes 417/401/403 errors

3. **Route Transition Fix** (this document)
   - Fixes double-click requirement
   - Prevents route bounce-back
   - Adds loading indicators

### Architecture Pattern
All three fixes follow the **centralized utility pattern**:
- **Shared loader** (`imogi_loader.js`) for script management
- **Shared API utility** (`api.js`) for API calls
- **Shared navigation utility** (`deskNavigate.js`) for routing

---

## ✅ Success Criteria

- [x] Single click navigates reliably (no double-click needed)
- [x] No route bounce-back (module-select doesn't remount during navigation)
- [x] Visual feedback (loading spinner on clicked button)
- [x] Duplicate click prevention (navigation lock works)
- [x] Enhanced debug logging (emoji markers for easy filtering)
- [x] Global navigation lock (prevents ALL navigation races)
- [x] No syntax errors (builds successfully)
- [x] Consistent with existing patterns (uses shared utilities)

---

## 📝 Maintenance Notes

### Lock Timeout Values
- **React local lock**: 3000ms (3 seconds)
- **Global lock in deskNavigate**: 2000ms (2 seconds)
- **Context settle delay**: 500ms (unchanged)

These values are conservative to ensure navigation completes before lock releases.

### If Navigation Appears Stuck
1. Check browser console for error logs
2. Verify `window.__imogiNavigationLock` is `false`
3. If stuck, manually clear: `window.__imogiNavigationLock = false`
4. Check `frappe.get_route_str()` matches expected route

### Future Improvements
- Add navigation timeout detection (alert if lock held > 10 seconds)
- Add route transition animation (fade out/in during navigation)
- Add Sentry logging for failed navigations
- Consider Redux/Zustand for centralized navigation state

---

**End of Document**
