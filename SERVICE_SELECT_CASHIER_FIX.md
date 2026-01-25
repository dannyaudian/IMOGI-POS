# Service Select - Cashier Integration Fix

## Masalah
Service Select page hanya diakses dari Kiosk flow, sedangkan Cashier langsung masuk ke Cashier Console tanpa memilih service type (Dine In / Take Away). Ini menyebabkan:

1. **Konflik fitur**: Modal "Dine In" dengan zone selection tidak terintegrasi dengan sistem kasir
2. **Inconsistent flow**: Kiosk harus pilih service, tapi Cashier tidak
3. **Missing context**: Cashier Console tidak tahu service type apa yang sedang digunakan

## Solusi

### 1. Update Device Select Flow (src/apps/device-select/App.jsx)
**Sebelum:**
```jsx
handleDeviceClick('cashier', '/cashier-console')
```

**Sesudah:**
```jsx
handleDeviceClick('cashier', '/opening-balance?device=cashier&next=/service-select')
```

**Impact**: Cashier sekarang harus melalui:
1. Device Select → 
2. Opening Balance (set device type & denominations) → 
3. **Service Select (NEW)** → 
4. Cashier Console

### 2. Update Service Select App (src/apps/service-select/App.jsx)
**Perubahan:**
- Baca `deviceType` dari localStorage (`imogi_device_type`)
- Redirect ke `/cashier-console` jika device type adalah `cashier`
- Redirect ke `/kiosk?service=take-away` jika device type adalah `kiosk`
- Update DineInModal callback untuk handle redirection based on device type

**New Flow:**
```
Kiosk Device:
  - Take Away → /kiosk?service=take-away
  - Dine In → Modal → /kiosk?service=dine-in

Cashier Device:
  - Take Away → /cashier-console
  - Dine In → Modal → /cashier-console
```

### 3. Data Passed to Next Page
Setelah service selection, data berikut disimpan di localStorage:

```javascript
// Take Away
localStorage.setItem('imogi_service_type', 'take_away')

// Dine In
localStorage.setItem('imogi_service_type', 'dine_in')
localStorage.setItem('imogi_table_number', tableNumber)  // e.g., "5"
localStorage.setItem('imogi_table_zone', zone)           // e.g., "Zone A"
```

## Files Changed
1. `/src/apps/device-select/App.jsx` - Cashier device route
2. `/src/apps/service-select/App.jsx` - Device-aware routing & callbacks

## Permissions
✅ Already set correctly in `imogi_pos/www/shared/service-select/index.py`:
- Cashier
- Branch Manager
- System Manager

## Testing Checklist
- [ ] Kiosk flow: Device Select → Opening Balance → Service Select → Kiosk
- [ ] Cashier flow: Device Select → Opening Balance → **Service Select** → Cashier Console
- [ ] Dine In modal shows correct tables based on zone
- [ ] Take Away redirects to correct destination
- [ ] localStorage contains correct service type after selection
- [ ] Backward compatibility: Old Kiosk session continues to work

## Notes
- `imogi_device_type` localStorage key is set in Device Select flow
- Service Select reads this key to determine redirect destination
- If no device type is found, defaults to 'kiosk' for backward compatibility
