# PRODUCTION-READY PATCHES - Implementation Guide
**Date**: February 2, 2026
**Status**: Ready for implementation
**Priority**: High → Medium → Low (grouped below)

---

## 🚨 HIGH PRIORITY PATCHES (Must Implement)

### PATCH 1: Add Search Debounce to Waiter MenuCatalog
**File**: `src/apps/waiter/components/MenuCatalog.jsx`
**Issue**: No debounce causes excessive re-renders
**Impact**: Performance degradation, poor UX

**BEFORE** (line 14-15):
```jsx
const [searchQuery, setSearchQuery] = useState('')
```

**AFTER**:
```jsx
import { useMemo, useCallback } from 'react'

const [searchQuery, setSearchQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')

// Debounce search input (300ms delay)
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(searchQuery)
  }, 300)
  
  return () => clearTimeout(timer)
}, [searchQuery])

// Update filteredItems to use debouncedQuery instead of searchQuery
const filteredItems = useMemo(() => {
  return itemList.filter(item => {
    // Filter by category
    if (selectedCategory && item.item_group !== selectedCategory) {
      return false
    }

    // Filter by search query (debounced)
    if (debouncedQuery) {
      const query = debouncedQuery.toLowerCase()
      return (
        item.item_name.toLowerCase().includes(query) ||
        item.item_code.toLowerCase().includes(query)
      )
    }

    return true
  })
}, [itemList, selectedCategory, debouncedQuery])
```

**Lines to change**: 14-36
**Test**: Type quickly in search → should not re-filter until 300ms pause

---

### PATCH 2: Add Search Debounce to Cashier CatalogView
**File**: `src/apps/cashier-console/components/CatalogView.jsx`
**Issue**: Same as Waiter - no search field visible in current code but likely exists
**Action**: Check if CatalogView has search input, apply same debounce pattern

**Investigation needed**: Search current file for "search" or "query"
```bash
grep -n "search\|query" src/apps/cashier-console/components/CatalogView.jsx
```

If search exists, apply same debounce pattern as PATCH 1.

---

### PATCH 3: Integrate NetworkStatus into Cashier Console
**File**: `src/apps/cashier-console/App.jsx`
**Issue**: NetworkStatus exists but not integrated
**Impact**: Users unaware of connectivity issues

**Location**: After imports (line 25), add:
```jsx
import { NetworkStatus } from '@/shared/components/NetworkStatus'
```

**Location**: In return JSX (after `<SessionExpiredProvider>`), add:
```jsx
<SessionExpiredProvider>
  <NetworkStatus />  {/* ADD THIS LINE */}
  <ImogiPOSProvider /* ... */ >
```

**Lines**: Import at ~25, Component at ~280 (after SessionExpiredProvider opening tag)
**Test**: Disconnect wifi → should see "Offline" badge

---

### PATCH 4: Integrate NetworkStatus into Waiter Console
**File**: `src/apps/waiter/App.jsx`
**Issue**: Same as Cashier
**Impact**: Same as Cashier

**Location**: After imports (line 9), add:
```jsx
import { NetworkStatus } from '@/shared/components/NetworkStatus'
```

**Location**: In return JSX (inside main container), add:
```jsx
<ImogiPOSProvider /* ... */ >
  <NetworkStatus />  {/* ADD THIS LINE */}
  <AppHeader /* ... */ />
```

**Lines**: Import at ~9, Component at ~110 (after ImogiPOSProvider opening tag)
**Test**: Same as PATCH 3

---

### PATCH 5: Replace alert() with Toast/Banner in Cashier
**File**: `src/apps/cashier-console/App.jsx`
**Issue**: Using `alert()` blocks UI, poor UX
**Impact**: Better error handling, retry mechanism

**Search for**: `alert(` (should be ~3 occurrences)

**BEFORE** (line ~415):
```jsx
alert('POS Profile & Branch wajib dipilih. Silakan pilih dari module select.')
```

**AFTER** (create reusable error handler):
```jsx
// Add this helper function at top of component (after state declarations)
const showError = useCallback((message, onRetry = null) => {
  if (window.frappe && frappe.show_alert) {
    frappe.show_alert({
      message: `⚠️ ${message}`,
      indicator: 'red'
    }, 10)
  }
  
  // Also update local error state for persistent banner
  setError({ message, onRetry })
}, [])

// In JSX (after CashierHeader), add error banner:
{error && (
  <div className="error-banner-persistent">
    <div className="error-content">
      <i className="fa fa-exclamation-triangle"></i>
      <span>{error.message}</span>
    </div>
    <div className="error-actions">
      {error.onRetry && (
        <button onClick={error.onRetry} className="btn-retry">
          Retry
        </button>
      )}
      <button onClick={() => setError(null)} className="btn-dismiss">
        Dismiss
      </button>
    </div>
  </div>
)}

// Replace alert() calls:
// Line ~415:
showError('POS Profile & Branch required. Please select from module select.')

// Line ~439 (inside catch block):
showError(`Failed to create order: ${err.message}`, createCounterOrder)

// Line ~451 (context error):
showError('Context Error: ' + err.message.split(': ')[1])
```

**CSS needed** (add to `CashierLayout.css`):
```css
.error-banner-persistent {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 600px;
  width: 90%;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 12px 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 1050;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.error-banner-persistent .error-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.error-banner-persistent .error-actions {
  display: flex;
  gap: 8px;
}

.btn-retry, .btn-dismiss {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 3px;
  border: none;
  cursor: pointer;
}

.btn-retry {
  background: #007bff;
  color: white;
}

.btn-dismiss {
  background: #6c757d;
  color: white;
}
```

**Lines**: 
- Helper function: ~180 (after state declarations)
- Banner JSX: ~280 (after CashierHeader)
- Replace alert() at: ~415, ~439, ~451
- CSS: Add to CashierLayout.css

---

## ⚠️ MEDIUM PRIORITY PATCHES (Should Implement)

### PATCH 6: Implement Keyboard Shortcuts for Cashier
**File**: `src/apps/cashier-console/App.jsx`
**Issue**: No keyboard shortcuts slows down cashier workflow
**Impact**: Faster operations, reduced fatigue

**Implementation**:
```jsx
// Add useEffect for keyboard shortcuts (after other useEffects, ~line 150)
useEffect(() => {
  const handleKeyDown = (e) => {
    // Ignore if typing in input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return
    }
    
    // "/" - Focus search + open catalog
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (viewMode !== 'catalog') {
        setViewMode('catalog')
      }
      // Focus search input after a tick
      setTimeout(() => {
        const searchInput = document.querySelector('.catalog-search-input')
        if (searchInput) searchInput.focus()
      }, 100)
    }
    
    // F2 - Open payment (if order selected)
    if (e.key === 'F2') {
      e.preventDefault()
      if (selectedOrder && !showPayment) {
        setShowPayment(true)
      }
    }
    
    // F3 - Toggle catalog view
    if (e.key === 'F3') {
      e.preventDefault()
      setViewMode(viewMode === 'catalog' ? 'orders' : 'catalog')
    }
    
    // ESC - Close modals/views
    if (e.key === 'Escape') {
      if (showPayment) {
        setShowPayment(false)
      } else if (showSplit) {
        setShowSplit(false)
      } else if (showShiftSummary) {
        setShowShiftSummary(false)
      } else if (viewMode === 'catalog') {
        setViewMode('orders')
      }
    }
    
    // Ctrl+N / Cmd+N - New order
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault()
      if (mode === 'Counter') {
        createCounterOrder()
      } else {
        setShowTableSelector(true)
      }
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [viewMode, selectedOrder, showPayment, showSplit, showShiftSummary, mode])

// Add keyboard shortcut hints to CashierHeader or ActionBar
// Create new component ShortcutHints.jsx:
```

**New file**: `src/apps/cashier-console/components/ShortcutHints.jsx`
```jsx
import { useState } from 'react'

export function ShortcutHints() {
  const [showHints, setShowHints] = useState(false)
  
  const shortcuts = [
    { key: '/', description: 'Open catalog & search' },
    { key: 'F2', description: 'Process payment' },
    { key: 'F3', description: 'Toggle catalog' },
    { key: 'ESC', description: 'Close modal/view' },
    { key: 'Ctrl+N', description: 'New order' }
  ]
  
  return (
    <>
      <button 
        className="btn-shortcut-help"
        onClick={() => setShowHints(!showHints)}
        title="Keyboard shortcuts"
      >
        <i className="fa fa-keyboard"></i>
      </button>
      
      {showHints && (
        <div className="shortcut-hints-modal">
          <div className="shortcut-hints-content">
            <h4>Keyboard Shortcuts</h4>
            <ul className="shortcut-list">
              {shortcuts.map(sc => (
                <li key={sc.key}>
                  <kbd>{sc.key}</kbd>
                  <span>{sc.description}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowHints(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
```

**CSS** (add to CashierLayout.css):
```css
.btn-shortcut-help {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #dee2e6;
  border-radius: 3px;
  cursor: pointer;
}

.shortcut-hints-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.shortcut-hints-content {
  background: white;
  padding: 24px;
  border-radius: 8px;
  max-width: 400px;
  width: 90%;
}

.shortcut-list {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.shortcut-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

kbd {
  background: #f1f3f5;
  border: 1px solid #dee2e6;
  border-radius: 3px;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 13px;
  min-width: 60px;
  text-align: center;
}
```

**Integration**: Add `<ShortcutHints />` to CashierHeader component

**Lines**:
- useEffect keyboard handler: ~150
- New component file: ShortcutHints.jsx
- Integration in CashierHeader: Import and add to header bar

---

### PATCH 7: Waiter Touch Ergonomics (44px tap targets)
**File**: `src/apps/waiter/waiter.css`
**Issue**: Small tap targets for touch devices
**Impact**: Better mobile UX

**Add to waiter.css**:
```css
/* Minimum 44px tap targets for touch devices */
.table-card {
  min-height: 44px;
  min-width: 44px;
  padding: 12px;
  cursor: pointer;
  touch-action: manipulation; /* Prevent double-tap zoom */
}

.cart-item-stepper button {
  min-height: 44px;
  min-width: 44px;
  padding: 8px;
  touch-action: manipulation;
}

.menu-item-card {
  min-height: 44px;
  padding: 12px;
  touch-action: manipulation;
}

.category-tab {
  min-height: 44px;
  padding: 8px 16px;
  touch-action: manipulation;
}

/* Prevent accidental clicks during loading */
button:disabled {
  pointer-events: none;
  opacity: 0.5;
}

/* Primary action buttons should be prominent */
.btn-send-kitchen,
.btn-request-bill {
  min-height: 48px;
  font-size: 16px;
  font-weight: 600;
  touch-action: manipulation;
}
```

**Lines**: Add to end of waiter.css file

---

### PATCH 8: Waiter Fixed Bottom Action Bar
**File**: `src/apps/waiter/components/OrderCart.jsx` (inferred - needs verification)
**Issue**: Action buttons not easily accessible
**Impact**: Better UX, faster operations

**Implementation** (assuming OrderCart component exists):
```jsx
// Add fixed action bar at bottom of OrderCart
<div className="cart-actions-fixed">
  <button 
    className="btn-send-kitchen"
    disabled={cartItems.length === 0 || loading}
    onClick={handleSendToKitchen}
  >
    <i className="fa fa-paper-plane"></i>
    Send to Kitchen ({cartItems.length})
  </button>
  
  {currentOrder && (
    <button 
      className="btn-request-bill"
      disabled={loading}
      onClick={handleRequestBill}
    >
      <i className="fa fa-receipt"></i>
      Request Bill
    </button>
  )}
</div>
```

**CSS** (add to waiter.css):
```css
.cart-actions-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid #dee2e6;
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
  z-index: 100;
}

.cart-actions-fixed button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-send-kitchen {
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;
}

.btn-request-bill {
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;
}

/* Adjust main content bottom padding to account for fixed bar */
.waiter-content {
  padding-bottom: 80px; /* Height of fixed bar + spacing */
}
```

**Action**: Verify OrderCart component path, then apply patch

---

### PATCH 9: Loading Skeleton Screens
**File**: Create `src/shared/components/Skeleton.jsx`
**Issue**: Only spinners, no skeleton loaders
**Impact**: Better perceived performance

**New component**:
```jsx
export function Skeleton({ width, height, className = '' }) {
  return (
    <div 
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton height="60px" />
      <Skeleton height="20px" width="70%" />
      <Skeleton height="20px" width="50%" />
    </div>
  )
}

export function SkeletonList({ count = 3 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
```

**CSS** (create `src/shared/components/Skeleton.css`):
```css
@keyframes skeleton-loading {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

.skeleton {
  display: inline-block;
  background: linear-gradient(
    90deg,
    #f0f0f0 0px,
    #f8f8f8 40px,
    #f0f0f0 80px
  );
  background-size: 200px 100%;
  animation: skeleton-loading 1.4s ease-in-out infinite;
  border-radius: 4px;
}

.skeleton-card {
  padding: 16px;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  margin-bottom: 12px;
}

.skeleton-card .skeleton {
  display: block;
  margin-bottom: 8px;
}

.skeleton-list {
  padding: 0;
  margin: 0;
}
```

**Usage** (in CatalogView.jsx):
```jsx
import { SkeletonList } from '@/shared/components/Skeleton'

// Replace loading spinner with:
{loading && (
  <SkeletonList count={6} />
)}
```

**Files**:
- New: `src/shared/components/Skeleton.jsx`
- New: `src/shared/components/Skeleton.css`
- Update: CatalogView.jsx, MenuCatalog.jsx (replace spinners)

---

## 📝 LOW PRIORITY PATCHES (Nice to Have)

### PATCH 10: Add Help Text to enable_menu_channels
**File**: `imogi_pos/imogi_pos/doctype/restaurant_settings/restaurant_settings.json`
**Issue**: No help text explaining behavior
**Impact**: Prevents misconfiguration

**Find field** (search for `"fieldname": "enable_menu_channels"`):
```json
{
  "fieldname": "enable_menu_channels",
  "fieldtype": "Check",
  "label": "Enable Menu Channels",
  "description": "Filter items by channel (Counter/Waiter). When disabled, all items are visible in all channels. Items with empty channel are universal."
}
```

**Lines**: Find JSON field definition, add `description` key

---

### PATCH 11: Catalog Virtualization (Optional)
**File**: `src/apps/cashier-console/components/CatalogView.jsx`
**Issue**: Large catalogs (>100 items) lag
**Impact**: Better performance for large inventories

**Prerequisites**:
```bash
npm install react-window
```

**Implementation**:
```jsx
import { FixedSizeGrid } from 'react-window'

// Replace catalog items render with:
{!loading && filteredItems.length > 100 && (
  <FixedSizeGrid
    columnCount={3}
    columnWidth={220}
    height={600}
    rowCount={Math.ceil(filteredItems.length / 3)}
    rowHeight={280}
    width={680}
    itemData={filteredItems}
  >
    {CatalogItemCell}
  </FixedSizeGrid>
)}

{!loading && filteredItems.length <= 100 && (
  <div className="catalog-items-grid">
    {filteredItems.map(item => (
      <CatalogItem key={item.name} item={item} onSelect={onSelectItem} />
    ))}
  </div>
)}

// Define cell renderer:
const CatalogItemCell = ({ columnIndex, rowIndex, style, data }) => {
  const index = rowIndex * 3 + columnIndex
  const item = data[index]
  
  if (!item) return null
  
  return (
    <div style={style}>
      <CatalogItem item={item} onSelect={onSelectItem} />
    </div>
  )
}
```

**Condition**: Only implement if catalog regularly exceeds 100 items

---

## 🧪 TESTING CHECKLIST

After applying patches, verify:

### Backend Testing
- [ ] No new Error Log entries after patches
- [ ] `request_bill()` still works correctly
- [ ] `send_to_kitchen()` still creates KOTs
- [ ] `process_payment()` still submits invoices

### Frontend Testing - Cashier
- [ ] Search debounce works (300ms delay)
- [ ] NetworkStatus shows on disconnect
- [ ] Error banner shows instead of alert()
- [ ] Retry button works
- [ ] Keyboard shortcuts work:
  - [ ] `/` opens catalog + focuses search
  - [ ] `F2` opens payment
  - [ ] `F3` toggles catalog
  - [ ] `ESC` closes modals
  - [ ] `Ctrl+N` creates new order
- [ ] Skeleton loaders show during loading

### Frontend Testing - Waiter
- [ ] Search debounce works
- [ ] NetworkStatus shows on disconnect
- [ ] Touch targets are 44px minimum
- [ ] Fixed action bar visible at bottom
- [ ] Buttons disabled during loading (no double-tap)

### Performance Testing
- [ ] Catalog search feels responsive
- [ ] No lag when typing
- [ ] Virtualization works (if >100 items)

---

## 📦 DEPLOYMENT STEPS

1. **Backup**:
   ```bash
   git stash
   git checkout -b feature/production-ready-patches
   ```

2. **Apply patches** (in order):
   - HIGH priority first
   - Test each patch individually
   - MEDIUM priority next
   - LOW priority last (optional)

3. **Build frontend**:
   ```bash
   cd /path/to/imogi-pos
   npm run build
   ```

4. **Clear cache**:
   ```bash
   bench --site <site-name> clear-cache
   bench --site <site-name> clear-website-cache
   ```

5. **Test on staging**:
   - Full manual testing checklist
   - Monitor Error Log

6. **Deploy to production**:
   ```bash
   git add .
   git commit -m "feat: production-ready patches (HIGH+MEDIUM priority)"
   git push origin feature/production-ready-patches
   ```

7. **Monitor**:
   - Check Error Log hourly for first 24h
   - User feedback collection

---

## 🔄 ROLLBACK PLAN

If issues occur:
```bash
git revert <commit-hash>
bench --site <site-name> clear-cache
npm run build
```

Or restore from backup:
```bash
git checkout main
git branch -D feature/production-ready-patches
git stash pop  # Restore pre-patch state
```

---

**Status**: ✅ Ready for implementation
**Estimated time**: 
- HIGH priority: 2-3 hours
- MEDIUM priority: 3-4 hours
- LOW priority: 1-2 hours
**Total**: 6-9 hours for full implementation
