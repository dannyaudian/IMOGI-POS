# Debug Guide: 400 Error saat Ganti POS Profile

## Masalah
Error 400 muncul tepat saat switch POS Profile di Module Select, pada request:
```
POST /api/method/imogi_pos.utils.operational_context.set_operational_context
```

## Penyebab Umum

### 1. CSRF Token / Cookies Tidak Ikut ⚠️ (Paling Sering)
Frappe akan balas **400 Bad Request** jika:
- `X-Frappe-CSRF-Token` header tidak dikirim
- Session cookies tidak ikut (`credentials` salah)
- CSRF token invalid/expired

### 2. Payload Argumen Tidak Sesuai
Backend expect:
```javascript
{
  pos_profile: "POS-001",  // MUST use underscore
  branch: "Main Branch"     // Optional, bisa null
}
```

Kesalahan umum:
- `posProfile` (camelCase) → salah, harus `pos_profile`
- `branch` kosong/undefined padahal required
- Extra parameters yang tidak expected

### 3. Session Expired/Stopped
Request dianggap tidak valid karena:
- Session cookie hilang/expired
- Tab lama/stale session
- Reverse proxy/caching issue

---

## Fix yang Sudah Diterapkan (v2.0.0)

### 1. Enhanced Error Handling di `api.js`
File: `src/shared/utils/api.js`

**Fitur baru:**
- ✅ Parse response body untuk error 400/500
- ✅ Extract Frappe exception messages
- ✅ Log detailed error info (status, body, data)
- ✅ CSRF token validation dengan logging

**Contoh log output:**
```javascript
[imogi][api] HTTP Error 400 calling set_operational_context
{
  status: 400,
  statusText: "Bad Request",
  errorBody: "{'exc': 'ValidationError: Missing required parameter...'}",
  errorData: { exception: "ValidationError: Missing required parameter pos_profile" },
  method: "imogi_pos.utils.operational_context.set_operational_context",
  args: { pos_profile: "POS-001", branch: null }
}
```

### 2. Enhanced Logging di Module Select
File: `src/apps/module-select/App.jsx`

**Fitur baru:**
- ✅ Log sebelum call API (params, session state)
- ✅ Log response success/failure
- ✅ Log error details (status, response body)

**Contoh log output:**
```javascript
[module-select] setOperationalContext called
{
  posProfile: "POS-001",
  branchOverride: null,
  hasFrappe: true,
  hasCsrfToken: true,
  user: "admin@example.com"
}

[module-select] setOperationalContext error
{
  error: "HTTP 400: Bad Request",
  httpStatus: 400,
  responseText: "{'exc': '...'}",
  responseData: { exception: "..." },
  posProfile: "POS-001",
  branchOverride: null
}
```

### 3. CSRF Token Validation
**Sebelum:**
```javascript
const csrfToken = getCSRFToken()
if (!csrfToken) {
  throw new Error('CSRF token not found')
}
```

**Sesudah:**
```javascript
const csrfToken = getCSRFToken()
if (!csrfToken) {
  logger.error('api', 'CSRF token not found', {
    hasFrappe: !!window.frappe,
    hasCsrfToken: !!(window.frappe && window.frappe.csrf_token),
    hasWindowToken: !!window.FRAPPE_CSRF_TOKEN,
    cookies: document.cookie
  })
  throw new Error('CSRF token not found. Session may have expired.')
}
```

---

## Cara Debug Error 400

### Step 1: Buka Browser DevTools
1. Chrome/Edge: `F12` atau `Cmd+Option+I` (Mac)
2. Tab **Console** untuk melihat log
3. Tab **Network** untuk inspect request

### Step 2: Cek Console Logs
Cari log ini:

```javascript
// Sebelum request
[module-select] setOperationalContext called
{
  posProfile: "POS-001",
  hasFrappe: true,           // ← MUST be true
  hasCsrfToken: true,         // ← MUST be true
  user: "admin@example.com"   // ← Tidak boleh "Guest"
}

// Jika error
[module-select] setOperationalContext error
{
  error: "HTTP 400: ...",
  httpStatus: 400,
  responseText: "...",        // ← Baca ini untuk detail error
  responseData: { ... }       // ← Parsed JSON error
}
```

**Yang perlu dicek:**
- ✅ `hasFrappe: true` → kalau `false`, React app load sebelum Frappe ready
- ✅ `hasCsrfToken: true` → kalau `false`, session issue
- ✅ `user !== "Guest"` → kalau Guest, session expired
- ✅ `responseText` → detail error dari backend

### Step 3: Inspect Network Request
Tab **Network** → cari request:
```
POST /api/method/imogi_pos.utils.operational_context.set_operational_context
```

**Headers → Request Headers:**
```
X-Frappe-CSRF-Token: xxxxx  ← MUST ada
Cookie: sid=xxxxx           ← MUST ada (session ID)
Content-Type: application/json
```

**Payload:**
```json
{
  "pos_profile": "POS-001",
  "branch": null
}
```

**Response:**
Tab **Response** → baca JSON error:
```json
{
  "exc": "ValidationError: Missing required parameter pos_profile",
  "_server_messages": "[...]"
}
```

### Step 4: Common Fixes

#### Fix #1: CSRF Token Missing
**Symptom:**
```javascript
[imogi][api] CSRF token not found
{
  hasFrappe: false,  // ← Problem!
  hasCsrfToken: false
}
```

**Cause:** React app load sebelum Frappe ready

**Solution:**
Tambahkan delay di `module-select/index.html`:
```html
<script>
// Wait for Frappe to be ready
function initApp() {
  if (window.frappe && window.frappe.csrf_token) {
    window.initReactApp?.()
  } else {
    setTimeout(initApp, 100)
  }
}
initApp()
</script>
```

#### Fix #2: Wrong Argument Format
**Symptom:**
```json
{
  "exc": "Missing required parameter pos_profile"
}
```

**Cause:** Kirim `posProfile` bukan `pos_profile`

**Solution:**
Pastikan key persis sesuai Python backend:
```javascript
await apiCall('set_operational_context', {
  pos_profile: posProfile,  // ← underscore
  branch: branch            // ← underscore
})
```

#### Fix #3: Session Expired
**Symptom:**
```javascript
[module-select] setOperationalContext called
{
  user: "Guest"  // ← Problem!
}
```

**Cause:** Session cookies expired

**Solution:**
1. Logout dan login ulang
2. Atau reload page dengan `Cmd+Shift+R` (hard reload)

---

## Testing Checklist

Setelah deploy fix ini, test dengan cara:

### Test 1: Basic Switch
1. Login ke system
2. Buka Module Select
3. Click POS Profile dropdown
4. Pilih profile berbeda
5. Check Console → should see:
   ```
   [module-select] setOperationalContext called
   [module-select] Context set successfully
   ```

### Test 2: Hard Reload
1. Di Module Select page
2. `Cmd+Shift+R` (Mac) atau `Ctrl+Shift+R` (Windows)
3. Switch profile lagi
4. Should still work (CSRF token tetap ada)

### Test 3: Multi-Tab
1. Buka Module Select di 2 tabs
2. Switch profile di tab 1
3. Switch profile di tab 2
4. Both should work (session shared)

### Test 4: Error Recovery
1. Open DevTools Console
2. Ketik: `delete window.frappe.csrf_token`
3. Try switch profile
4. Should see clear error: "CSRF token not found"
5. Reload page → should work again

---

## Monitoring Production

### Log to Check
Setelah deploy, monitor log ini di production console:

```javascript
// Success pattern
[module-select] setOperationalContext called {...}
[module-select] Context set successfully {...}

// Error pattern (butuh investigate)
[module-select] setOperationalContext error
{
  httpStatus: 400,
  responseText: "..."  // ← Copy this
}
```

### Quick Commands for Browser Console
```javascript
// Check CSRF token
console.log('CSRF:', window.frappe?.csrf_token)

// Check session
console.log('User:', window.frappe?.session?.user)

// Manual test API call
await frappe.call({
  method: 'imogi_pos.utils.operational_context.set_operational_context',
  args: {
    pos_profile: 'POS-001',
    branch: null
  }
})
```

---

## Backend Validation

Jika masih error setelah semua fix frontend, check backend:

### File: `imogi_pos/utils/operational_context.py`

Function signature:
```python
@frappe.whitelist()
def set_operational_context(pos_profile=None, branch=None):
    # Validate args
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))
    
    # Check profile exists
    if not frappe.db.exists("POS Profile", pos_profile):
        frappe.throw(_("POS Profile {0} not found").format(pos_profile))
    
    # ... rest of logic
```

**Add logging:**
```python
import logging
logger = logging.getLogger(__name__)

@frappe.whitelist()
def set_operational_context(pos_profile=None, branch=None):
    logger.info(f"set_operational_context called: pos_profile={pos_profile}, branch={branch}, user={frappe.session.user}")
    
    try:
        # ... existing logic
        return {"success": True, "context": context}
    except Exception as e:
        logger.error(f"Error in set_operational_context: {str(e)}", exc_info=True)
        raise
```

---

## Summary

✅ **Fixed Issues:**
1. Enhanced error parsing untuk 400 responses
2. Detailed logging untuk debugging
3. CSRF token validation dengan debug info
4. Clear error messages di console

✅ **How to Debug:**
1. Open Browser DevTools Console
2. Look for `[module-select]` logs
3. Check `hasFrappe`, `hasCsrfToken`, `user`
4. Read `responseText` untuk exact error
5. Inspect Network tab → Request/Response

✅ **Next Steps if Error Persists:**
1. Copy exact error dari Console log
2. Copy Response body dari Network tab
3. Share untuk analysis lebih lanjut

---

## Quick Reference

### Code Changes Made
1. **src/shared/utils/api.js** → Enhanced error handling
2. **src/apps/module-select/App.jsx** → Enhanced logging

### Files to Deploy
```bash
# After npm run build
imogi_pos/public/react/module-select/static/js/main.BFpgp8ZE.js
imogi_pos/public/react/module-select/static/css/main.DewMXjlA.css
```

### Verification Command (Production)
```javascript
// In browser console after load
console.log('Frappe ready:', !!window.frappe)
console.log('CSRF token:', !!window.frappe?.csrf_token)
console.log('User:', window.frappe?.session?.user)
```

Expected output:
```
Frappe ready: true
CSRF token: true
User: admin@example.com (bukan Guest)
```
