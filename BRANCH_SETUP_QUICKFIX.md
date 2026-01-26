# IMOGI POS - Branch Setup Quick Fix

## � Quick Deploy (January 26, 2026)

**Critical fixes applied:**
1. ✅ Backend: Branch query uses `pluck='name'` (avoid 417 error from non-existent fields)
2. ✅ Frontend: Polyfill uses GET for read-only methods (avoid 400 CSRF errors)
3. ✅ Enhanced CSRF token detection
4. ✅ Auto-fallback if user's branch invalid

**Deploy steps:**
```bash
# 1. Pull latest code
git pull

# 2. Clear cache (jika perlu)
bench clear-cache

# 3. Restart bench (optional)
bench restart

# 4. Hard refresh browser
Ctrl+Shift+R (or Cmd+Shift+R on Mac)
```

**Verify fix:**
```js
// Browser console (after login)
verifyBranchFix()  // Run verification script
```

**Expected:** All tests pass, `/shared/module-select` loads without errors.

---

## �🔍 Root Cause Analysis (FINAL)

### Mengapa `danny.a.pratama@cao-group.co.id` error "No branch configured"?

**Direct check pada user record:**

✅ **Yang sudah benar:**
- `user_type`: System User
- `imogi_default_branch`: **"Main"** ✅ (sudah di-set)
- Roles: System Manager, Branch Manager, Cashier, dll ✅

❌ **Penyebab error (FINAL FIX - January 26, 2026):**

**Root cause sebenarnya:** Backend `get_user_branch_info` query Branch menggunakan field yang **tidak ada di DocType Branch**:

```python
# BEFORE (BROKEN - 417 Error):
branch_list = frappe.get_list(
    'Branch',
    fields=['name', 'disabled', 'company'],  # ❌ disabled/company tidak ada!
    ...
)
# Result: DataError 417 "Field not permitted in query: disabled"
```

**Konsekuensi:**
1. API `get_user_branch_info` crash dengan error 417
2. Frontend dapat empty response atau error
3. UI tampilkan "No branch configured" walau user sudah punya `imogi_default_branch = "Main"`

**✅ Fix Permanen (sudah di-patch - January 26, 2026):**

Query Branch yang robust (tidak assume field apapun selain `name`):

```python
# AFTER (FIXED):
branch_names = frappe.get_all(
    'Branch',
    pluck='name',  # ✅ Hanya ambil name, tidak select field lain
    ignore_permissions=True
)
# Result: ["Main", "Branch2", ...] tanpa error
```

**Bonus fix:**
- `frappe_polyfill.js`: Gunakan **GET request** untuk read-only methods (bypass CSRF)
- Enhanced CSRF token detection dari multiple sources
- Auto-fallback jika branch dari user tidak valid

---

## ⚡ TL;DR - Cara Tercepat

**Setelah patch code, user danny yang sudah punya `imogi_default_branch = "Main"` akan langsung jalan:**

### Cara 1: Via Custom Field imogi_default_branch (recommended untuk IMOGI POS)

### Cara 1: Via Custom Field imogi_default_branch (recommended untuk IMOGI POS)

```
1. User → imogi_default_branch = Main (isi field custom)
2. Save
3. Logout total
4. Login
5. Test API
6. Buka /shared/module-select
```

### Cara 2: Via User Defaults (Frappe standard, fallback)

```
1. User → Defaults → Add: branch = Main
2. Logout
3. Login
4. Test API
5. Buka /shared/module-select
```

**Catatan:**
- Setelah patch, **user danny yang sudah punya `imogi_default_branch = "Main"` seharusnya langsung jalan**
- `imogi_default_branch` (Cara 1) adalah **priority utama** sesuai design IMOGI POS
- User Defaults (Cara 2) jadi **fallback** jika custom field kosong

---

## 🔧 Cara Set Branch via Custom Field (IMOGI POS Standard)

### Via ERPNext UI (Recommended)

1. **Desk → User List** → klik user kamu (contoh: `danny.a.pratama@cao-group.co.id`)

2. **Cari field "Default Branch"** (custom field `imogi_default_branch`)

3. **Pilih branch**: `Main` (atau nama branch kamu)

4. **Save**

5. **⚠️ WAJIB LOGOUT TOTAL** (bukan refresh!)

6. **Login ulang**

### Alternative: Via User Defaults (jika custom field tidak terlihat)

1. **Scroll ke section "Defaults"**

2. **Klik "Add Row"**

3. **Isi**:
   - **Key**: `branch`
   - **Value**: `Main` (atau nama branch kamu)

4. **Save**

5. **⚠️ WAJIB LOGOUT TOTAL** (bukan refresh!)

6. **Login ulang**

### Via Browser Console (Advanced - Set custom field)

```js
// Set imogi_default_branch field directly
frappe.call({
  method: 'frappe.client.set_value',
  args: {
    doctype: 'User',
    name: frappe.session.user,
    fieldname: 'imogi_default_branch',
    value: 'Main'
  },
  callback: (r) => {
    console.log('✅ imogi_default_branch set to Main. Now LOGOUT and LOGIN again.');
  }
});
```

Or set via User Defaults:

```js
// Set user default branch (alternative method)
frappe.call({
  method: 'frappe.client.set_default',
  args: {
    key: 'branch',
    value: 'Main',
    parent: frappe.session.user
  },
  callback: (r) => {
    console.log('Branch default set!');
    console.log('Now LOGOUT and LOGIN again');
  }
});
```

---

## ✅ Test Apakah Sudah Benar

### Test 1: Check User Defaults

```js
// Di browser console setelah login
frappe.call({
  method: 'frappe.defaults.get_user_default',
  args: { key: 'branch' },
  callback: (r) => {
    console.log('User default branch:', r.message);
    // Harusnya return "Main" atau branch kamu
  }
});
```

**Expected**: `"Main"` (atau nama branch kamu)
**Jika null**: Belum di-set, ulangi langkah di atas

### Test 2: Check API

```js
// Test get_user_branch_info (seharusnya 200 setelah fix)
fetch('/api/method/imogi_pos.api.module_select.get_user_branch_info', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('✅ API Response:', data);
  if (data.message && data.message.current_branch) {
    console.log('✅ Branch resolved:', data.message.current_branch);
  } else {
    console.error('❌ No branch in response!');
  }
});
```

**Expected** (setelah fix):
```json
{
  "message": {
    "current_branch": "Main",
    "available_branches": [
      {"name": "Main", "branch": "Main"}
    ]
  }
}
```

**Jika masih error**:
- **417 "Field not permitted"**: Branch query masih select field yang tidak ada (harus pakai `pluck='name'`)
- **403 "Permission denied"**: User tidak punya akses Branch (seharusnya sudah `ignore_permissions=True`)
- **404 "Not found"**: Branch DocType tidak ada
- **"No branch configured"**: User belum punya `imogi_default_branch` atau User Defaults

**NOTE**: Jangan test `frappe.defaults.get_user_default` via REST API - itu **not whitelisted** (403). 
Fungsi itu hanya bisa dipanggil dari server-side Python.

### Test 3: Comprehensive Test (Lengkap)

**NEW (January 26, 2026)**: Gunakan verification script terbaru:

```js
// Copy-paste isi file tests/verify_branch_fix_jan26.js ke console
// Atau jika sudah di-load:
verifyBranchFix()
```

Script ini akan test:
1. ✅ User branch configuration (imogi_default_branch)
2. ✅ Polyfill GET request untuk read-only methods
3. ✅ Direct fetch GET (baseline)
4. ✅ Backend branch API (417 error check)
5. ✅ Module select end-to-end

**Expected output**:
```
✅ ALL TESTS PASSED! Branch fix is working correctly.
```

**OLD verification** (manual):
Copy-paste `tests/browser_branch_setup_test.js` lalu run `verifyBranchSetup()`

---

## ❌ Troubleshooting

### Error: "No branch configured for your account"

**Penyebab**: User Default branch belum di-set

**Fix**:
1. User → Defaults → Add row: `branch = Main`
2. Logout
3. Login
4. Test lagi

---

### Error: "Branch DocType does not exist"

**Penyebab**: DocType "Branch" belum dibuat

**Fix**:
1. Desk → DocType List
2. New DocType: `Branch`
3. Add field: `name` (primary key)
4. Save & Add at least 1 branch record: "Main"

---

### Error: "Error loading branches"

**Penyebab**: User tidak punya Read permission untuk Branch DocType

**Fix**:
1. Desk → Role Permission Manager
2. DocType: `Branch`
3. Add permission:
   - Role: `System Manager` atau role kamu
   - Read: ✅ Check
4. Save
5. Logout & Login

---

### Error: "frappe.ready is not a function"

**Penyebab**: Script lama yang belum di-update

**Fix**: Sudah di-patch di `permission-manager.js`
- Clear cache: `bench clear-cache`
- Restart: `bench restart`
- Hard refresh browser (Ctrl+Shift+R)

---

### Error: "page null" saat klik shortcut

**Penyebab**: Shortcut tidak punya href/data-link-to

**Fix**: Sudah di-patch di `workspace_shortcuts.js`
- Atau set Workspace Shortcut "Link to": `/shared/module-select`

---

## 📋 Checklist Lengkap

Sebelum Module Select bisa jalan, pastikan:

- [ ] **DocType Branch** ada (standard ERPNext master)
- [ ] **Minimal 1 Branch record** sudah dibuat (contoh: "Main")
- [ ] **Branch tidak disabled**
- [ ] **User punya Read permission** untuk Branch DocType
- [ ] **User Default "branch"** sudah di-set
- [ ] **Sudah logout & login ulang**
- [ ] **Test API** berhasil return branch

Jika semua ✅ → Module Select pasti jalan!

---

## 🎯 Expected Behavior Setelah Fix

### ✅ BENAR (After Fix)

1. Set User Default branch
2. Logout & Login
3. Klik "Open POS" → langsung ke `/shared/module-select`
4. Module Select load → tampil pilihan module
5. Klik "Cashier" → masuk Counter POS
6. **NO ERROR**

### ❌ SALAH (Before Fix)

1. Klik "Open POS"
2. Error: "No branch configured"
3. **STUCK**, tidak bisa lanjut

---

## 🔗 Files yang Sudah Di-Fix

| File | What Changed | Date |
|------|-------------|------|
| `imogi_pos/api/module_select.py` | **CRITICAL FIX**: Use `pluck='name'` instead of `fields=['name','disabled','company']` to avoid 417 errors | Jan 26, 2026 |
| `imogi_pos/api/module_select.py` | Fixed priority order: `imogi_default_branch` → User Defaults → global default | Jan 26, 2026 |
| `imogi_pos/api/module_select.py` | Added proper `if not current_branch` checks to avoid overwrite bug | Jan 26, 2026 |
| `imogi_pos/public/js/core/frappe_polyfill.js` | **CRITICAL FIX**: Use GET for read-only methods (no args) to bypass CSRF 400/403 errors | Jan 26, 2026 |
| `imogi_pos/public/js/core/frappe_polyfill.js` | Enhanced CSRF token detection from multiple sources | Jan 26, 2026 |
| `imogi_pos/public/js/core/permission-manager.js` | Fixed frappe.ready error | Jan 25, 2026 |
| `imogi_pos/public/js/workspace_shortcuts.js` | Added URL safety check | Jan 25, 2026 |
| `tests/browser_branch_setup_test.js` | NEW: Verification tool | Jan 25, 2026 |
| `BRANCH_CONFIG_FIX.md` | Full documentation | Jan 25, 2026 |
| `BRANCH_SETUP_QUICKFIX.md` | This quick guide + root cause analysis | Jan 26, 2026 |

---

## 📞 Still Stuck?

Jika masih error setelah ikuti semua langkah:

1. **Run comprehensive test**:
   ```js
   // Copy tests/browser_branch_setup_test.js
   verifyBranchSetup()
   ```

2. **Screenshot error** + **Console output**

3. **Check Error Log**:
   - Desk → Error Log
   - Filter: "IMOGI POS: Branch"
   - Lihat detail debug_info

4. **Kirim info**:
   - User yang dipakai
   - Screenshot User → Defaults
   - Screenshot Branch list
   - Console output dari verifyBranchSetup()

---

**Last Updated**: January 26, 2026 (Critical fixes: 417 error + 400 CSRF error)
**Status**: ✅ Patched and Tested
**Applies to**: IMOGI POS v2.0+

**Key fixes:**
- `module_select.py`: Use `pluck='name'` for Branch query (avoid field permission errors)
- `frappe_polyfill.js`: Use GET for read-only methods (bypass CSRF requirement)
- Enhanced error logging and user-friendly messages

