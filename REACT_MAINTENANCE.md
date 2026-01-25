# React Apps Maintenance Guide

## Overview

IMOGI POS sekarang menggunakan **automated manifest loading** untuk React apps. Tidak perlu lagi manual update hash filenames setelah rebuild!

## Arsitektur

```
imogi_pos/
├── public/react/
│   ├── customer-display-editor/
│   │   ├── .vite/manifest.json         ← Auto-generated saat build
│   │   └── static/
│   │       ├── js/main.[hash].js       ← Hash berubah setiap build
│   │       └── css/main.[hash].css
│   └── [other-apps]/
├── utils/
│   └── react_helpers.py                 ← Helper untuk auto-load manifest
├── templates/includes/
│   └── react_app.html                   ← Reusable template untuk semua React apps
└── www/
    └── customer_display_editor/
        ├── index.py                     ← Python context builder
        └── index.html                   ← Simple extends template
```

## Workflow

### 1. Build React App

```bash
# Build single app
VITE_APP=customer-display-editor npx vite build

# Build all apps
npm run build:all
```

### 2. Manifest Auto-Loading

File `react_helpers.py` akan otomatis:
1. Read `.vite/manifest.json`
2. Extract hashed filenames
3. Pass ke template via context

### 3. Template Rendering

Template `react_app.html`:
- Auto-load CSS: `{{ react_bundle_css }}`
- Auto-load JS: `{{ react_bundle_js }}`
- Show error jika bundle tidak ditemukan

## Maintenance Tasks

### ✅ Yang TIDAK Perlu Dilakukan Lagi

❌ Manual update hash filenames di HTML  
❌ Edit index.html setelah setiap rebuild  
❌ Cek manifest.json untuk nama file baru  

### ✅ Yang Perlu Dilakukan

✔️ Rebuild app setelah edit React code  
✔️ Restart bench untuk apply perubahan Python  
✔️ Clear browser cache jika perlu  

## Cara Migrasi App Baru ke React

### Step 1: Buat React App

```bash
# Di folder src/apps/
mkdir -p src/apps/my-new-app
```

Buat `src/apps/my-new-app/main.jsx`:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/shared/styles/global.css'

const initialState = window.__INITIAL_STATE__ || {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialState={initialState} />
  </React.StrictMode>
)
```

Buat `src/apps/my-new-app/App.jsx`:
```jsx
import { ImogiPOSProvider } from '@/shared/providers/ImogiPOSProvider'
import { useAuth } from '@/shared/hooks/useAuth'
import { AppHeader } from '@/shared/components/UI'

function MyNewAppContent({ initialState }) {
  const { user, loading, hasAccess } = useAuth(['Required Role'])
  
  if (loading) return <div>Loading...</div>
  if (!hasAccess) return <div>Access Denied</div>
  
  return (
    <div className="imogi-app">
      <AppHeader title="My New App" user={user} />
      <main className="imogi-main">
        {/* Your app content */}
      </main>
    </div>
  )
}

function App({ initialState }) {
  return (
    <ImogiPOSProvider initialState={initialState}>
      <MyNewAppContent initialState={initialState} />
    </ImogiPOSProvider>
  )
}

export default App
```

### Step 2: Build React App

```bash
VITE_APP=my-new-app npx vite build
```

### Step 3: Buat Frappe Integration

Buat `imogi_pos/www/my_new_app/index.py`:
```python
import frappe
from frappe import _
from imogi_pos.utils.auth_decorators import require_roles
from imogi_pos.utils.react_helpers import add_react_context

@require_roles("Required Role")
def get_context(context):
    """Context builder for my new app."""
    try:
        context.title = _("My New App")
        
        # Add React bundle URLs and initial state
        add_react_context(context, 'my-new-app', {
            'customData': 'any data you need'
        })
        
        return context
    except Exception as e:
        frappe.log_error(f"Error in my_new_app get_context: {str(e)}")
        context.setup_error = True
        context.title = _("My New App")
        return context
```

Buat `imogi_pos/www/my_new_app/index.html`:
```jinja
{% extends "imogi_pos/templates/includes/react_app.html" %}

{# My New App - React #}
```

### Step 4: Add to Workspace (Optional)

Edit `imogi_pos/fixtures/workspaces.json`, tambahkan shortcut:
```json
{
  "label": "My New App",
  "link_to": "/my_new_app",
  "type": "URL"
}
```

### Step 5: Restart & Test

```bash
bench restart
# Akses: http://localhost:8000/my_new_app
```

## Troubleshooting

### Error: "React bundle not found"

**Penyebab:** App belum di-build  
**Solusi:**
```bash
VITE_APP=my-app npx vite build
```

### Error: "Failed to load manifest"

**Penyebab:** Path manifest.json salah  
**Solusi:** Cek path di `react_helpers.py` line 26-40

### Perubahan Python tidak muncul

**Penyebab:** Bench belum restart atau Python cache  
**Solusi:**
```bash
# 1. Restart bench
bench restart

# 2. Clear Python cache (jika perlu)
find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null

# 3. Restart lagi
bench restart
```

### Perubahan React tidak muncul setelah rebuild

**Penyebab:** Browser cache  
**Solusi:**
1. Hard reload: `Cmd+Shift+R` (Mac) atau `Ctrl+Shift+R` (Windows)
2. Clear browser cache
3. Check console untuk error loading bundle
4. Verify manifest hash changed:
   ```bash
   cat imogi_pos/public/react/customer-display-editor/.vite/manifest.json
   ```

### Error di console: "Cannot read property 'name' of undefined"

**Penyebab:** Initial state dari Python tidak sesuai dengan yang diharapkan React  
**Solusi:**
1. Check `index.py` - pastikan pass correct data ke `add_react_context()`
2. Check browser console: `console.log(window.__INITIAL_STATE__)`
3. Check React App - handle missing data dengan optional chaining:
   ```jsx
   const posProfile = initialState?.posProfile
   ```

### CSS tidak load

**Penyebab:** Vite build tidak generate CSS file terpisah  
**Solusi:** CSS sudah inline di JS bundle, aman diabaikan

### Manifest loading error di production

**Penyebab:** Path berbeda antara development dan production  
**Solusi:** Check kedua path di `react_helpers.py`:
```python
# Development path
manifest_path = os.path.join(
    frappe.get_app_path('imogi_pos'),
    'public', 'react', app_name, '.vite', 'manifest.json'
)

# Production path (Frappe Cloud)
manifest_path = os.path.join(
    site_path, 'public', 'files', 'imogi_pos',
    'public', 'react', app_name, '.vite', 'manifest.json'
)
```

### Developer Mode Issues

**Problem:** `developer_mode` menyebabkan slow performance  
**Solution:**
```bash
# Disable untuk testing production build
bench --site [site-name] set-config developer_mode 0
bench restart
```

### Python API changes tidak terdeteksi React

**Penyebab:** React masih gunakan cached response dari frappe-react-sdk  
**Solusi:**
```jsx
// Force refetch di component
const { data, mutate } = useFrappeGetDoc('DocType', 'name')

// After Python API change, call:
mutate()  // This will refetch from server
```

## Development Workflow

### Perubahan Code Python

**File Python yang mempengaruhi React apps:**
- `imogi_pos/www/*/index.py` - Context builders
- `imogi_pos/utils/react_helpers.py` - Manifest loader
- `imogi_pos/api/*.py` - Backend API endpoints
- `imogi_pos/overrides/*.py` - DocType overrides

**Setelah edit Python code:**

```bash
# Option 1: Restart bench (recommended untuk development)
bench restart

# Option 2: Restart hanya web process (lebih cepat)
bench --site [site-name] restart-worker web

# Option 3: Bench start dengan auto-reload (development mode)
bench start
# Tekan Ctrl+C lalu bench start lagi setelah edit Python
```

**Hot-reload Python (advanced):**

Install werkzeug untuk auto-reload:
```bash
# Enable developer mode di site_config.json
bench --site [site-name] set-config developer_mode 1

# Start bench dengan reload
bench start
# Python files akan auto-reload saat disimpan
```

⚠️ **Catatan:** Template Jinja (`.html`) tidak auto-reload, perlu restart bench.

### Perubahan Code React

**File React yang TIDAK butuh restart bench:**
- `src/apps/*/App.jsx` - React components
- `src/apps/*/main.jsx` - Entry points
- `src/shared/**/*.jsx` - Shared components
- `src/shared/**/*.css` - Styles

**Setelah edit React code:**

```bash
# 1. Rebuild app
VITE_APP=customer-display-editor npx vite build

# 2. Hard reload browser (NO bench restart needed!)
# Cmd+Shift+R (Mac) atau Ctrl+Shift+R (Windows)
```

### Development Mode dengan Vite Dev Server (Coming Soon)

Untuk development yang lebih cepat, bisa setup Vite dev server:

```bash
# Terminal 1: Frappe backend
bench start

# Terminal 2: Vite dev server (belum disetup)
npm run dev:customer-display-editor
# Akan serve di http://localhost:5173 dengan HMR
```

**HMR (Hot Module Replacement):** React changes langsung muncul tanpa refresh!

### Mixed Changes (Python + React)

Jika edit keduanya:

```bash
# 1. Rebuild React
VITE_APP=customer-display-editor npx vite build

# 2. Restart bench untuk Python changes
bench restart

# 3. Hard reload browser
```

### Quick Reference

| Perubahan | Rebuild React? | Restart Bench? | Browser Reload? |
|-----------|---------------|----------------|-----------------|
| React component (.jsx) | ✅ Ya | ❌ Tidak | ✅ Hard reload |
| Shared CSS | ✅ Ya | ❌ Tidak | ✅ Hard reload |
| Python API (.py) | ❌ Tidak | ✅ Ya | ⚠️ Soft reload |
| Context builder (.py) | ❌ Tidak | ✅ Ya | ✅ Hard reload |
| Jinja template (.html) | ❌ Tidak | ✅ Ya | ✅ Hard reload |
| Backend DocType | ❌ Tidak | ✅ Ya | ⚠️ Reload page |
| vite.config.js | ✅ Ya | ❌ Tidak | ✅ Hard reload |
| package.json | ⚠️ npm install | ❌ Tidak | - |

**Legend:**
- ✅ Hard reload: Cmd+Shift+R / Ctrl+Shift+R (clear cache)
- ⚠️ Soft reload: F5 / Cmd+R / Ctrl+R
- ❌ Tidak perlu

## Best Practices

### 1. Naming Convention

- React app folder: `kebab-case` (customer-display-editor)
- Frappe www folder: `snake_case` (customer_display_editor)
- Component files: `PascalCase` (App.jsx, AppHeader.jsx)

### 2. State Management

- Global state → `ImogiPOSProvider`
- Server data → `frappe-react-sdk` hooks
- Local state → `useState`
- URL state → `URLSearchParams`

### 3. Performance

- Use `useMemo` untuk expensive calculations
- Use `React.memo` untuk prevent re-renders
- Lazy load routes jika besar
- Keep bundle < 300KB gzipped

### 4. Security

- NEVER expose sensitive data di `initialState`
- Always use `@require_roles` decorator
- Validate input di backend API
- Use CSRF token untuk mutations

## Migration Checklist

Untuk migrasi vanilla JS page ke React:

- [ ] Buat React app structure
- [ ] Build app: `VITE_APP=app-name npx vite build`
- [ ] Update `index.py` dengan `add_react_context()`
- [ ] Simplify `index.html` ke extends template
- [ ] Test authorization & role checking
- [ ] Test data fetching dengan frappe-react-sdk
- [ ] Verify bundle size < 300KB gzipped
- [ ] Clear browser cache & test
- [ ] Update workspace.json jika perlu
- [ ] Document custom features

## Workspace Links

✅ **Sudah ada link** di workspace:
- Customer Display Editor: `/customer_display_editor`

⏳ **Perlu ditambahkan** jika migrasi:
- Table Layout Editor: `/table_layout_editor`
- Cashier Console: `/counter/pos`
- Kitchen Display: `/restaurant/kitchen`
- Table Display: `/restaurant/tables`
- Waiter: `/restaurant/waiter`
- Kiosk: `/restaurant/waiter?mode=kiosk`
- Self Order: `/self_order`
- Customer Display: `/devices/displays`

## Performance Monitoring

Monitor bundle sizes:
```bash
# Check all bundles
du -sh imogi_pos/public/react/*/static/js/*.js

# Should be:
# ~260KB uncompressed
# ~85KB gzipped
```

Jika bundle > 300KB:
1. Check for duplicate dependencies
2. Use code splitting
3. Lazy load heavy components
4. Remove unused imports

## Quick Command Reference

### React Development

```bash
# Build single app
VITE_APP=customer-display-editor npx vite build

# Build all apps
npm run build:all

# Check bundle size
du -sh imogi_pos/public/react/customer-display-editor/

# View manifest
cat imogi_pos/public/react/customer-display-editor/.vite/manifest.json
```

### Python Development

```bash
# Restart bench
bench restart

# Restart only web worker (faster)
bench --site [site-name] restart-worker web

# Enable developer mode (auto-reload Python)
bench --site [site-name] set-config developer_mode 1
bench restart

# Clear Python cache
find . -type d -name "__pycache__" -exec rm -r {} +

# Check Frappe logs
tail -f logs/web.error.log
tail -f logs/web.log
```

### Testing & Debugging

```bash
# Run bench console (test Python code)
bench console

# Test React bundle loading
curl -I http://localhost:8000/assets/imogi_pos/public/react/customer-display-editor/static/js/main.*.js

# Check if page loads
curl http://localhost:8000/customer_display_editor

# Monitor realtime errors
tail -f logs/error.log
```

### Git Workflow

```bash
# Before commit (auto-build via pre-commit hook)
git status
git add src/apps/customer_display_editor/
git commit -m "feat: improve customer display editor"
# Pre-commit hook will auto-build React apps!

# Manual add if needed
git add imogi_pos/www/customer_display_editor/
git add imogi_pos/utils/react_helpers.py
git add imogi_pos/public/react/customer-display-editor/

# Push to branch
git push origin feature/react-migration
```

### Deployment Commands

```bash
# === COMPLETE DEPLOYMENT SEQUENCE ===

# 1. Pull latest code
git pull origin main

# 2. Install Node packages (if package.json changed)
npm install

# 3. Build ALL React apps (REQUIRED!)
npm run build:all

# 4. Bench migrate (if schema changed)
bench --site site1.local migrate

# 5. Bench build (vanilla assets)
bench build --app imogi_pos

# 6. Restart bench
bench restart

# 7. Clear caches
bench --site site1.local clear-cache
bench --site site1.local clear-website-cache
```

### Quick Deployment Checks

```bash
# Verify React bundles exist
ls -lh imogi_pos/public/react/*/static/js/*.js

# Check manifest files
cat imogi_pos/public/react/customer-display-editor/.vite/manifest.json

# Test if page loads
curl -I http://localhost:8000/customer_display_editor

# Check for errors
tail -f logs/error.log
```

```bash
# Complete deployment sequence:

# 1. Build React apps FIRST
npm run build:all
# Atau build specific apps:
# VITE_APP=customer-display-editor npx vite build
# VITE_APP=table-layout-editor npx vite build

# 2. Bench build (for other assets: vanilla JS, CSS, etc)
bench build --app imogi_pos

# 3. Run migrations (if any DocType/Schema changes)
bench --site [site-name] migrate

# 4. Restart bench
bench restart

# 5. Clear cache
bench --site [site-name] clear-cache

# Browser cache clearing automatic dengan hashed filenames! 🎉
```

**Why this order?**
- React builds → `imogi_pos/public/react/` (NOT processed by bench build)
- Bench build → `assets/imogi_pos/` (vanilla JS/CSS from `public/js/`, `public/css/`)
- Migrations → Database schema updates
- Restart → Apply Python changes
- Clear cache → Remove server-side cached responses

## Bench Commands & React Apps

### Understanding Bench Build

**`bench build` TIDAK build React apps!**

Bench build hanya process files di:
- `imogi_pos/public/js/*.js` → Minify, concat
- `imogi_pos/public/css/*.css` → Minify, concat  
- `imogi_pos/public/scss/*.scss` → Compile to CSS

React apps di `src/apps/` dan output di `imogi_pos/public/react/` **di-skip oleh bench build**.

### Deployment Workflows

#### Development Setup (First Time)

```bash
# 1. Get app
bench get-app https://github.com/your-org/imogi-pos.git

# 2. Install app
bench --site site1.local install-app imogi_pos

# 3. Install Node dependencies
cd apps/imogi_pos
npm install

# 4. Build React apps
npm run build:all

# 5. Bench build (vanilla assets)
cd ../..
bench build --app imogi_pos

# 6. Restart
bench restart
```

#### Regular Updates (Git Pull)

```bash
# 1. Pull latest code
cd apps/imogi_pos
git pull origin main

# 2. Install any new Node packages
npm install

# 3. Build React apps
npm run build:all

# 4. Back to bench directory
cd ../..

# 5. Run migrations (if schema changed)
bench --site site1.local migrate

# 6. Bench build (vanilla assets)
bench build --app imogi_pos

# 7. Restart
bench restart

# 8. Clear cache
bench --site site1.local clear-cache
```

#### Production Deployment (Manual)

```bash
# Full sequence for production:

cd apps/imogi_pos

# 1. Pull latest
git pull origin production

# 2. Install dependencies
npm install --production

# 3. Build ALL React apps
npm run build:all

# 4. Verify builds
ls -lh imogi_pos/public/react/*/static/js/

cd ../..

# 5. Migrations
bench --site site1.local migrate

# 6. Build vanilla assets
bench build --app imogi_pos

# 7. Restart all processes
sudo supervisorctl restart all

# 8. Clear all caches
bench --site site1.local clear-cache
bench --site site1.local clear-website-cache
```

#### Frappe Cloud Deployment

**Frappe Cloud auto-runs:**
- `bench build` ✅ (vanilla assets)
- `bench migrate` ✅ (database)
- `bench restart` ✅ (processes)

**But NOT auto-run:**
- `npm install` ❌
- `npm run build:all` ❌

**Solution: Use `install.py` hook**

Create `imogi_pos/install.py`:
```python
import os
import subprocess
import frappe

def after_install():
    """Run after app installation."""
    build_react_apps()

def after_migrate():
    """Run after bench migrate."""
    build_react_apps()

def build_react_apps():
    """Build all React apps."""
    try:
        app_path = frappe.get_app_path('imogi_pos')
        
        # Install npm packages
        frappe.logger().info("Installing npm packages...")
        subprocess.run(
            ['npm', 'install', '--production'],
            cwd=app_path,
            check=True
        )
        
        # Build all React apps
        frappe.logger().info("Building React apps...")
        subprocess.run(
            ['npm', 'run', 'build:all'],
            cwd=app_path,
            check=True
        )
        
        frappe.logger().info("React apps built successfully!")
        
    except Exception as e:
        frappe.log_error(f"Failed to build React apps: {str(e)}")
```

Register in `hooks.py`:
```python
# hooks.py
after_install = "imogi_pos.install.after_install"
after_migrate = "imogi_pos.install.after_migrate"
```

**Alternative: Use GitHub Actions**

Create `.github/workflows/frappe-cloud.yml`:
```yaml
name: Build React Apps for Frappe Cloud

on:
  push:
    branches: [main, production]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Build all React apps
        run: npm run build:all
        
      - name: Commit built files
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add imogi_pos/public/react/
          git commit -m "chore: build React apps [skip ci]" || echo "No changes"
          git push
```

This way, React builds are committed to repo and Frappe Cloud just deploys them.

### CI/CD Integration

#### Pre-commit Hook (Recommended)

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash

# Check if React files changed
REACT_CHANGED=$(git diff --cached --name-only | grep "^src/apps/")

if [ -n "$REACT_CHANGED" ]; then
    echo "React files changed, rebuilding..."
    
    # Get changed apps
    CHANGED_APPS=$(git diff --cached --name-only | grep "^src/apps/" | cut -d/ -f3 | sort -u)
    
    for app in $CHANGED_APPS; do
        echo "Building $app..."
        VITE_APP=$app npx vite build
        git add imogi_pos/public/react/$app/
    done
fi
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

#### Docker Deployment

```dockerfile
FROM frappe/bench:latest

# Copy app
COPY . /home/frappe/frappe-bench/apps/imogi_pos

# Install Node dependencies
WORKDIR /home/frappe/frappe-bench/apps/imogi_pos
RUN npm install --production

# Build React apps
RUN npm run build:all

# Build Frappe assets
WORKDIR /home/frappe/frappe-bench
RUN bench build --app imogi_pos

# Setup site
RUN bench new-site site1.local \
    --admin-password admin \
    --install-app imogi_pos
```

### Migration Workflow

**When to migrate:**
- Added/changed DocType
- Added/changed Custom Fields
- Changed database schema
- Updated fixtures

```bash
# 1. Write migration script (if needed)
# imogi_pos/patches/v1_0/update_customer_display_settings.py

# 2. Register in patches.txt
echo "imogi_pos.patches.v1_0.update_customer_display_settings" >> imogi_pos/patches.txt

# 3. Run migrate
bench --site site1.local migrate

# 4. Verify
bench --site site1.local console
```

Example migration patch:
```python
# imogi_pos/patches/v1_0/update_customer_display_settings.py
import frappe

def execute():
    """Add default customer display settings to all POS Profiles."""
    pos_profiles = frappe.get_all('POS Profile')
    
    default_settings = {
        'showLogo': True,
        'showImages': True,
        'fontSize': 'large',
        'theme': 'gradient'
    }
    
    for profile in pos_profiles:
        doc = frappe.get_doc('POS Profile', profile.name)
        if not doc.imogi_customer_display_settings:
            doc.imogi_customer_display_settings = frappe.as_json(default_settings)
            doc.save()
    
    frappe.db.commit()
```

## Support

Jika ada masalah:
1. Check error di browser console
2. Check error di Frappe error log (`tail -f logs/error.log`)
3. Verify manifest.json exists
4. Verify bundle files exist
5. Check if `npm run build:all` ran successfully
6. Try rebuild dari scratch: `rm -rf imogi_pos/public/react/ && npm run build:all`

---

## Quick Cheatsheet 📋

### Daily Development

**Edit React component:**
```bash
# 1. Edit file: src/apps/customer-display-editor/App.jsx
# 2. Rebuild
VITE_APP=customer-display-editor npx vite build
# 3. Hard reload browser (Cmd+Shift+R)
```

**Edit Python API:**
```bash
# 1. Edit file: imogi_pos/api/customer_display.py
# 2. Restart bench
bench restart
# 3. Reload browser (F5)
```

**Edit Context (index.py):**
```bash
# 1. Edit file: imogi_pos/www/customer_display_editor/index.py
# 2. Restart bench
bench restart
# 3. Hard reload browser (Cmd+Shift+R)
```

### Emergency Fixes

**Bundle tidak load:**
```bash
VITE_APP=customer-display-editor npx vite build && bench restart
```

**Python errors:**
```bash
find . -name "__pycache__" -type d -exec rm -r {} + && bench restart
```

**Cache issues:**
```bash
bench clear-cache && bench restart
```

### Common Paths

```
React App:           src/apps/customer-display-editor/
Python Context:      imogi_pos/www/customer_display_editor/index.py
Template:            imogi_pos/www/customer_display_editor/index.html
Built Bundle:        imogi_pos/public/react/customer-display-editor/
Manifest:            imogi_pos/public/react/customer-display-editor/.vite/manifest.json
Backend API:         imogi_pos/api/customer_display.py
Shared Components:   src/shared/
React Helpers:       imogi_pos/utils/react_helpers.py
Template Base:       imogi_pos/templates/includes/react_app.html
```

### File Changes Decision Tree

```
Changed file type?
│
├─ .jsx or .css → Rebuild React
│   └─ VITE_APP=app-name npx vite build
│   └─ Hard reload browser (Cmd+Shift+R)
│
├─ .py (API/utils) → Restart bench
│   └─ bench restart
│   └─ Reload browser (F5)
│
├─ .py (context/www) → Restart + Hard reload
│   └─ bench restart
│   └─ Hard reload browser (Cmd+Shift+R)
│
├─ .html (template) → Restart only
│   └─ bench restart
│   └─ Hard reload browser (Cmd+Shift+R)
│
├─ .json (fixtures) → Migrate + Restart
│   └─ bench migrate
│   └─ bench restart
│
└─ package.json → Install + Rebuild
    └─ npm install
    └─ VITE_APP=app-name npx vite build
```

### Deployment Scenarios Decision Tree

```
What are you deploying?
│
├─ First time installation
│   ├─ bench get-app
│   ├─ bench install-app imogi_pos
│   ├─ npm install
│   ├─ npm run build:all ⚠️ CRITICAL
│   ├─ bench build --app imogi_pos
│   └─ bench restart
│
├─ Code update (git pull)
│   ├─ git pull origin main
│   ├─ npm install (if package.json changed)
│   ├─ npm run build:all ⚠️ CRITICAL
│   ├─ bench migrate (if schema changed)
│   ├─ bench build --app imogi_pos
│   ├─ bench restart
│   └─ bench clear-cache
│
├─ Only React changes
│   ├─ git pull origin main
│   ├─ npm run build:all ⚠️ REQUIRED
│   ├─ bench restart (optional)
│   └─ Hard reload browser
│
├─ Only Python changes
│   ├─ git pull origin main
│   ├─ bench migrate (if needed)
│   ├─ bench restart ⚠️ REQUIRED
│   └─ Reload browser
│
├─ Frappe Cloud deployment
│   ├─ Option 1: Use install.py hook
│   │   └─ Auto-runs npm install + build
│   └─ Option 2: Pre-commit builds
│       └─ GitHub Actions build + commit
│
└─ Emergency rollback
    ├─ git checkout [previous-commit]
    ├─ npm run build:all
    ├─ bench migrate
    ├─ bench restart
    └─ bench clear-cache
```

**Remember:** 
- ⚠️ `npm run build:all` MUST run before any deployment!
- ⚠️ `bench build` does NOT build React apps!
- ✅ Hashed filenames = No cache issues! 🎉
