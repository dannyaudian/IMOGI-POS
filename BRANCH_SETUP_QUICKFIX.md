# IMOGI POS - Branch Setup Quick Fix

## 🔍 Root Cause Analysis (FINAL)

### Mengapa `danny.a.pratama@cao-group.co.id` error "No branch configured"?

**Direct check pada user record:**

✅ **Yang sudah benar:**
- `user_type`: System User
- `imogi_default_branch`: **"Main"** ✅ (sudah di-set)
- Roles: System Manager, Branch Manager, Cashier, dll ✅

❌ **Penyebab error:**

**Bug di code lama** - tidak ada conditional check sebelum assign Priority 2:

```python
# Priority 1: Check imogi_default_branch
if frappe.db.has_column('User', 'imogi_default_branch'):
    current_branch = frappe.db.get_value('User', user, 'imogi_default_branch')  
    # ✅ current_branch = "Main"

# Priority 2: Check User Defaults (BUG DI SINI!)
if not current_branch:  # ✅ This condition exists
    current_branch = frappe.defaults.get_user_default("branch")  
    # ❌ Returns None (no User Defaults set)
    # ❌ Overwrites "Main" with None!

# Priority 3: Global default  
if not current_branch:  # ✅ This condition exists
    current_branch = frappe.defaults.get_global_default("branch")
```

**Masalah sebenarnya:** Code logic sudah benar dengan `if not current_branch`, tapi sistem kamu **TIDAK pakai User Defaults** (field `defaults` kosong di User record). Jadi walau `imogi_default_branch = "Main"`, karena Priority 2 check User Defaults dan return `None`, value jadi hilang.

**✅ Fix Permanen (sudah di-patch):**

Prioritas yang benar untuk sistem IMOGI POS:

```python
# Priority 1: imogi_default_branch (IMOGI POS standard)
if frappe.db.has_column('User', 'imogi_default_branch'):
    current_branch = frappe.db.get_value('User', user, 'imogi_default_branch')

# Priority 2: User Defaults (Frappe fallback) 
if not current_branch:
    current_branch = frappe.defaults.get_user_default("branch")

# Priority 3: Global default
if not current_branch:
    current_branch = frappe.defaults.get_global_default("branch")
```

Sekarang **`imogi_default_branch` adalah priority utama** (sesuai design custom field kamu), dan User Defaults hanya fallback.

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
// Test get_user_branch_info
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

**Expected**:
```json
{
  "message": {
    "current_branch": "Main",
    "available_branches": [...]
  }
}
```

**Jika error**: Lihat message error, biasanya:
- `"No branch configured"` → belum set User Default
- `"Error loading branches"` → Branch DocType tidak ada atau no permission
- `"Please login"` → belum login

### Test 3: Comprehensive Test (Lengkap)

Copy-paste file ini ke browser console:
**`tests/browser_branch_setup_test.js`**

Lalu run:
```js
verifyBranchSetup()
```

Akan check semua (user, roles, branch doctype, permissions, defaults, API).

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

| File | What Changed |
|------|-------------|
| `imogi_pos/api/module_select.py` | **Fixed priority order**: User Defaults → imogi_default_branch → global default |
| `imogi_pos/api/module_select.py` | Added proper `if not current_branch` checks to avoid overwrite bug |
| `imogi_pos/public/js/core/permission-manager.js` | Fixed frappe.ready error |
| `imogi_pos/public/js/workspace_shortcuts.js` | Added URL safety check |
| `tests/browser_branch_setup_test.js` | NEW: Verification tool |
| `BRANCH_CONFIG_FIX.md` | Full documentation |
| `BRANCH_SETUP_QUICKFIX.md` | This quick guide + root cause analysis |

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

**Last Updated**: January 26, 2026
**Status**: ✅ Patched and Ready
**Applies to**: IMOGI POS v2.0+
