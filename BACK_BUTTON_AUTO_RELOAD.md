# Auto-Reload Ketika Navigasi Back - IMOGI POS

## 📋 Ringkasan

Implementasi fitur auto-reload untuk desk pages React ketika user menekan tombol back browser atau tombol back di NavBar. Ini memastikan data selalu fresh dan up-to-date setiap kali user kembali ke halaman.

## 🎯 Perubahan Yang Dilakukan

### 1. **NavBar Component** ([src/shared/components/UI.jsx](src/shared/components/UI.jsx))
- ✅ Mengubah `handleBack` untuk menggunakan `window.history.back()` 
- ✅ Memicu `popstate` event untuk deteksi navigasi back
- ✅ Fallback ke direct navigation jika tidak ada history

```javascript
const handleBack = () => {
  if (window.history.length > 1) {
    window.history.back()  // Triggers popstate event
  } else {
    window.location.href = '/app/imogi-pos'
  }
}
```

### 2. **Desk Pages - Popstate Listener**
Menambahkan event listener di semua desk pages:
- ✅ [imogi_cashier.js](imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js)
- ✅ [imogi_kitchen.js](imogi_pos/imogi_pos/page/imogi_kitchen/imogi_kitchen.js)
- ✅ [imogi_waiter.js](imogi_pos/imogi_pos/page/imogi_waiter/imogi_waiter.js)
- ✅ [imogi_displays.js](imogi_pos/imogi_pos/page/imogi_displays/imogi_displays.js)
- ✅ [imogi_tables.js](imogi_pos/imogi_pos/page/imogi_tables/imogi_tables.js)

**Setup Popstate Handler:**
```javascript
if (!wrapper.__imogiPopstateHandler) {
  wrapper.__imogiPopstateHandler = function(event) {
    console.log('🔄 [POPSTATE] Back navigation detected, reloading');
    
    if (frappe.get_route_str().includes('imogi-cashier')) {
      if (wrapper.__imogiCashierRoot) {
        loadReactWidget(wrapper.__imogiCashierRoot, wrapper.__imogiCashierPage, true);
      }
    }
  };
  window.addEventListener('popstate', wrapper.__imogiPopstateHandler);
}
```

### 3. **Force Reload Mechanism**
Menambahkan parameter `forceReload` ke fungsi `loadReactWidget`:

```javascript
function loadReactWidget(container, page, forceReload = false) {
  // If force reload, unmount existing React first
  if (forceReload && container && window.imogiCashierUnmount) {
    console.log('🔄 [FORCE RELOAD] Unmounting existing React instance');
    try {
      window.imogiCashierUnmount(container);
    } catch (err) {
      console.warn('[Cashier] Unmount error (non-critical):', err);
    }
  }
  
  // Load React bundle...
}
```

## 🔄 Flow Diagram

```
User clicks Back Button
         ↓
window.history.back()
         ↓
popstate event fired
         ↓
Check current route
         ↓
Unmount existing React (if forceReload=true)
         ↓
Remount React with fresh data
         ↓
React fetches latest data from API
         ↓
UI updated with fresh data
```

## ✨ Fitur

1. **Auto-reload on Back Navigation**
   - Deteksi ketika user navigasi back (browser button atau NavBar button)
   - Otomatis unmount dan remount React component
   - Data fresh dari API setiap kali kembali

2. **Graceful Error Handling**
   - Non-critical unmount errors di-catch dan di-warn
   - Tidak break aplikasi jika unmount gagal
   - Logging lengkap untuk debugging

3. **Performance Logging**
   - Track `isBackNavigation` di console logs
   - Timestamp untuk setiap navigation event
   - Route tracking untuk debugging

## 🧪 Testing

### Manual Testing:
1. Buka Cashier Console → tambah item ke cart
2. Klik tombol **Back** di NavBar
3. Klik Cashier lagi
4. ✅ Verify: Cart sudah clear (data fresh)

5. Buka Kitchen Display → lihat orders
6. Tekan browser **back button**
7. Navigate kembali ke Kitchen
8. ✅ Verify: Orders list di-reload dari server

### Browser Console Check:
```
🟢 [DESK PAGE SHOW] Cashier { 
  route: 'app/imogi-cashier', 
  isBackNavigation: true 
}
🔄 [POPSTATE] Back navigation detected, reloading Cashier
🔄 [FORCE RELOAD] Unmounting existing Cashier React instance
```

## 🔧 Technical Details

### Popstate Event
- **Triggered by**: `window.history.back()`, `window.history.forward()`, browser back/forward buttons
- **NOT triggered by**: `window.location.href`, `frappe.set_route()` (direct navigations)
- **Benefit**: Deteksi specific back navigation tanpa affect forward navigation

### Force Remount Strategy
- Unmount existing React root sebelum remount baru
- Prevents memory leaks dan state corruption
- Fresh data fetch via React hooks (`useOperationalContext`, API calls)

### Compatibility
- ✅ Works dengan Frappe SPA routing
- ✅ Works dengan browser back button
- ✅ Works dengan NavBar back button
- ✅ No conflicts dengan existing navigation logic

## 📝 Notes

- Setiap desk page memiliki popstate handler sendiri (isolated)
- Handler disimpan di `wrapper.__imogiPopstateHandler` (tidak duplikat)
- Force reload hanya trigger pada route yang sesuai
- Tidak affect page pertama kali load (hanya back navigation)

## 🚀 Future Enhancements

Possible improvements:
- [ ] Add loading indicator selama reload
- [ ] Cache data dengan smart invalidation
- [ ] Debounce rapid back/forward navigation
- [ ] Analytics tracking untuk navigation patterns

---

**Implemented**: 2026-01-29  
**Status**: ✅ Production Ready  
**Tested**: Manual testing on all desk pages
