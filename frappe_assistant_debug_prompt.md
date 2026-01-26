# Frappe Assistant Core - Debug Prompt untuk IMOGI POS Module Select Issue

## 🎯 Objektif
Saya memerlukan bantuan untuk mendiagnosis dan memperbaiki masalah routing dan POS Profile configuration di aplikasi IMOGI POS (ERPNext v15 + React apps). Ada 2 masalah utama:

1. **Routing Issue**: Ketika user klik "Open POS" dari workspace IMOGI POS, tidak bisa mengakses halaman React module-select (redirect ke null page)
2. **POS Profile Error**: Ketika user akses URL `/shared/module-select` secara langsung, muncul error "POS Profile belum dikonfigurasi" padahal sudah dikonfigurasi

---

## 📋 Konteks Aplikasi

### Arsitektur IMOGI POS
- **Framework**: ERPNext v15 + Frappe Framework
- **Frontend**: React apps (Vite-based) yang di-serve melalui `www/` pages
- **Backend**: Python API endpoints
- **Authentication**: Frappe session-based auth

### Struktur Aplikasi
```
imogi_pos/
├── hooks.py                           # App hooks & includes
├── public/
│   └── js/
│       ├── workspace_shortcuts.js     # Menghandle klik shortcut di workspace
│       └── workspace_shortcuts_init.js
├── www/
│   └── shared/
│       └── module-select/
│           ├── index.py               # Page context & routing
│           └── index.html             # HTML template
├── api/
│   ├── module_select.py               # Module selection APIs
│   └── public.py                      # Public APIs (termasuk POS Profile info)
└── src/                               # React source code
    └── apps/
        └── module-select/
            ├── App.jsx                # Main React component
            └── components/
```

---

## 🐛 Masalah 1: Routing ke Module Select Gagal

### Gejala
- User klik "Open POS" di workspace IMOGI POS
- Browser redirect ke halaman kosong/null
- URL tidak berubah atau berubah ke path yang tidak valid

### File Terkait
**File**: `imogi_pos/public/js/workspace_shortcuts.js` (lines 170-194)
```javascript
// Clean up the href - remove /app prefix if present
let clean_href = href.toString().replace(/^\/app\//, '/').replace(/^\/app$/, '/');

// Double-check cleaned href is valid
if (clean_href && clean_href !== 'null' && clean_href !== 'undefined' && self.is_www_page(clean_href)) {
    console.log('IMOGI POS: Intercepting shortcut click to:', clean_href);
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Navigate to www page (without /app prefix)
    window.location.href = clean_href;
    return false;
}
```

**File**: `imogi_pos/hooks.py` (lines 14-18)
```python
app_include_js = [
    '/assets/imogi_pos/js/core/frappe_polyfill.js',
    '/assets/imogi_pos/js/escpos_printing.js',
    '/assets/imogi_pos/js/workspace_shortcuts.js?v=2.0',
    '/assets/imogi_pos/js/workspace_shortcuts_init.js?v=2.0',
    '/assets/imogi_pos/js/core/permission-manager.js'
]
```

### Workspace Shortcuts Configuration
**File**: `imogi_pos/public/js/workspace_shortcuts.js` (lines 29-34)
```javascript
www_pages: [
    '/shared/module-select'
],

shortcut_routes: {
    'Open POS': '/shared/module-select',
}
```

### Yang Sudah Diperbaiki
- Regex bug di line 181 sudah diperbaiki dari `/^/app/` → `/^\/app\//, '/'`
- Added `no_cache = 1` di `index.py`

### Apa yang Perlu Dicek
1. Apakah event handler `workspace_shortcuts.js` terpanggil saat klik "Open POS"?
2. Apakah ada JavaScript error di browser console?
3. Apakah routing Frappe mengoverride navigation ke `/shared/module-select`?
4. Apakah ada conflict dengan Frappe's native router?
5. Apakah build React app sudah di-regenerate dan ter-deploy?

---

## 🐛 Masalah 2: POS Profile Configuration Error

### Gejala
- User bisa akses `/shared/module-select` (jika routing fixed)
- Tapi muncul error: "POS Profile has not been configured"
- Padahal POS Profile sudah ada dan ter-assign ke user

### Expected Behavior
1. User login → Frappe session aktif
2. Page `/shared/module-select` load → call API untuk get POS Profile
3. Jika user punya POS Profile → tampilkan module cards
4. Jika user belum pilih POS Profile → tampilkan dropdown untuk pilih

### API Endpoints Terkait
**Backend API**: `imogi_pos/api/public.py`
```python
@frappe.whitelist()
def get_user_pos_profile_info():
    """Get user's POS Profile info including available profiles and current selection."""
```

**Module Select API**: `imogi_pos/api/module_select.py`
```python
@frappe.whitelist()
def get_available_modules(pos_profile=None, branch=None):
    """Get list of available modules based on user's roles and permissions."""
```

### React Component Logic
**File**: `src/apps/module-select/App.jsx`
```jsx
const { 
    currentProfile,      // From usePOSProfile hook
    profileData, 
    availableProfiles,   // All POS Profiles user can access
    isLoading: profileLoading,
} = usePOSProfile()

// Fetch available modules based on POS Profile
const { data: moduleData, isLoading: modulesLoading } = useFrappeGetCall(
    'imogi_pos.api.module_select.get_available_modules',
    { pos_profile: currentProfile, branch: selectedBranch }
)
```

### usePOSProfile Hook
**File**: `src/shared/hooks/usePOSProfile.js`
```javascript
export function usePOSProfile() {
  // Get from localStorage first
  const [currentProfile, setCurrentProfile] = useState(() => {
    return localStorage.getItem('imogi_active_pos_profile') || null
  })
  
  // Fetch from server
  const { data: profileInfo, isLoading, error } = useFrappeGetCall(
    'imogi_pos.api.public.get_user_pos_profile_info',
    {},
    undefined,
    { revalidateOnFocus: false }
  )
  
  // Update state when server data arrives
  useEffect(() => {
    if (profileInfo?.message) {
      const { current_profile, available_profiles, profile_data } = profileInfo.message
      
      if (current_profile && !currentProfile) {
        setCurrentProfile(current_profile)
        localStorage.setItem('imogi_active_pos_profile', current_profile)
      }
      
      setAvailableProfiles(available_profiles || [])
      if (profile_data) {
        setProfileData(profile_data)
      }
    }
  }, [profileInfo])
}
```

### Yang Perlu Dicek
1. **Server-side**: Apakah API `get_user_pos_profile_info` mengembalikan data yang benar?
   - Cek response: `current_profile`, `available_profiles`, `profile_data`
   - Apakah user memang punya POS Profile assigned?

2. **localStorage**: Apakah `imogi_active_pos_profile` tersimpan dengan benar?
   - Cek di browser DevTools → Application → Local Storage

3. **React State**: Apakah `usePOSProfile` hook berhasil sync data dari API?
   - Cek apakah `isLoading` = false setelah fetch selesai
   - Cek apakah `currentProfile` dan `availableProfiles` terisi

4. **Error Handling**: Di mana tepatnya error "POS Profile not configured" muncul?
   - Di Python backend saat call API?
   - Di React frontend saat validate?
   - Di guard/middleware?

5. **Session & Auth**: Apakah user session valid dan punya permission?
   - Cek `frappe.session.user`
   - Cek user roles

---

## 🔍 Debugging Steps yang Diminta

### Step 1: Check Browser Console & Network
```
1. Buka browser DevTools (F12)
2. Klik "Open POS" dari workspace
3. Check Console tab untuk:
   - JavaScript errors
   - Log: "IMOGI POS: Intercepting shortcut click to: /shared/module-select"
4. Check Network tab:
   - Apakah request ke /shared/module-select berhasil (200)?
   - Atau ada redirect (301/302)?
   - Atau error (404/500)?
```

### Step 2: Check API Response
```
1. Akses /shared/module-select secara langsung
2. Di DevTools Network tab, cari request ke:
   - /api/method/imogi_pos.api.public.get_user_pos_profile_info
   - /api/method/imogi_pos.api.module_select.get_available_modules
3. Check response body:
   - Apakah ada error message?
   - Apakah data kosong?
   - Apakah struktur response benar?
```

### Step 3: Check localStorage
```javascript
// Di browser console, jalankan:
localStorage.getItem('imogi_active_pos_profile')
localStorage.getItem('imogi_pos_profile_data')
```

### Step 4: Check POS Profile Assignment di Database
```sql
-- Check apakah user punya POS Profile
SELECT name, imogi_default_branch, imogi_pos_profile 
FROM `tabUser` 
WHERE name = 'user@example.com';

-- Check available POS Profiles
SELECT name, imogi_branch, imogi_mode, company
FROM `tabPOS Profile`
WHERE disabled = 0;
```

### Step 5: Check Backend Logs
```python
# Di Frappe console atau logs, cek:
# - Error logs dari module_select.py
# - Error logs dari public.py
# - Frappe session info
```

---

## 📝 File-file Penting untuk Review

### Critical Files
1. `imogi_pos/public/js/workspace_shortcuts.js` - Workspace shortcut handler
2. `imogi_pos/www/shared/module-select/index.py` - Page context & routing
3. `imogi_pos/api/public.py` - POS Profile API (`get_user_pos_profile_info`)
4. `imogi_pos/api/module_select.py` - Module selection API
5. `src/shared/hooks/usePOSProfile.js` - React hook untuk POS Profile state
6. `src/apps/module-select/App.jsx` - Main module select component

### Supporting Files
7. `imogi_pos/hooks.py` - App configuration
8. `src/shared/hooks/usePOSProfileGuard.js` - Guard hook untuk protect routes
9. `src/shared/components/POSProfileSwitcher.jsx` - POS Profile selector UI
10. `FIX_MODULE_SELECT_ACCESS.md` - Previous fix documentation

---

## 🎯 Expected Output dari Frappe Assistant

Tolong lakukan investigasi mendalam dan berikan:

1. **Root Cause Analysis**:
   - Identifikasi masalah routing: kenapa "Open POS" tidak navigate ke module-select?
   - Identifikasi masalah POS Profile: di bagian mana validation/check gagal?

2. **Step-by-step Debugging**:
   - Command/query untuk verify setiap komponen
   - Console commands untuk test API endpoints
   - SQL queries untuk verify database state

3. **Rekomendasi Perbaikan**:
   - Kode yang perlu diubah/ditambah
   - Configuration yang perlu di-adjust
   - Deployment steps untuk apply fix

4. **Testing Checklist**:
   - Cara memverifikasi bahwa masalah sudah teratasi
   - Edge cases yang perlu di-test

---

## 💡 Hint & Konteks Tambahan

### Previous Fix (FIX_MODULE_SELECT_ACCESS.md)
Sebelumnya ada bug regex di `workspace_shortcuts.js`:
```javascript
// BROKEN:
let clean_href = href.toString().replace(/^/app/, '');

// FIXED:
let clean_href = href.toString().replace(/^\/app\//, '/').replace(/^\/app$/, '/');
```
Fix ini sudah di-apply tapi masalah masih terjadi.

### POS Profile Architecture
- IMOGI POS menggunakan **multi-module architecture**
- Setiap POS Profile bisa enable/disable module tertentu via custom fields:
  - `imogi_enable_cashier` 
  - `imogi_enable_waiter`
  - `imogi_enable_kitchen`
- User bisa punya akses ke multiple POS Profiles (multi-branch/multi-mode)
- User harus **pilih satu POS Profile** sebelum bisa akses module apapun

### React Build Process
```bash
# Build command
npm run build:module-select

# Output location
imogi_pos/public/react/module-select/assets/
```
Kemungkinan React build belum ter-update di production.

### Frappe Session & Auth
- Page `/shared/module-select` is a **www page** (not a desk page)
- Www pages use Frappe session auth (check `frappe.session.user`)
- If not logged in → should redirect to login page

---

## 🚀 Actionable Items untuk Frappe Assistant

Tolong lakukan investigasi dengan urutan prioritas:

### Priority 1: Diagnose Routing Issue
- [ ] Verify apakah workspace_shortcuts.js ter-load di browser
- [ ] Check apakah event listener terpasang dengan benar
- [ ] Trace navigation flow dari klik "Open POS" sampai page load
- [ ] Identify di mana navigation ter-block atau ter-redirect

### Priority 2: Diagnose POS Profile Issue  
- [ ] Verify API `get_user_pos_profile_info` response
- [ ] Check apakah user memang punya POS Profile di database
- [ ] Verify localStorage sync dengan backend state
- [ ] Identify di mana error message "POS Profile not configured" muncul

### Priority 3: Provide Solutions
- [ ] Code fixes untuk routing issue
- [ ] Code fixes untuk POS Profile validation
- [ ] Deployment & testing instructions
- [ ] Preventive measures untuk avoid issue di future

---

## ✅ Success Criteria

Fix dianggap berhasil jika:
1. ✅ User klik "Open POS" → browser navigate ke `/shared/module-select`
2. ✅ Page `/shared/module-select` load dengan benar (tampil module cards)
3. ✅ Tidak ada error "POS Profile not configured" jika user punya POS Profile
4. ✅ Jika user belum pilih POS Profile → tampil dropdown untuk pilih
5. ✅ User bisa klik module card → navigate ke module yang dipilih

---

**Terima kasih atas bantuannya! 🙏**

Silakan mulai investigasi dari Priority 1 dan berikan finding + rekomendasi untuk setiap step.
