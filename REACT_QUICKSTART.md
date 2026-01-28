# Quick Start - React Migration

## ✅ Migrasi Selesai!

Semua 13 aplikasi IMOGI POS sekarang menggunakan React. Berikut panduan cepat untuk development & deployment.

## 🚀 Quick Commands

### Build All Apps
```bash
npm run build:all
```

### Build Specific App
```bash
npm run build:login
npm run build:service-select
npm run build:device-select
npm run build:opening-balance
```

### Development Mode
```bash
npm run dev:login              # Port 3000
npm run dev:service-select
npm run dev:device-select
npm run dev:opening-balance
```

## 📦 Deployment

### Aktivasi React Apps (Production)
```bash
# One command to activate all 4 new React apps
./scripts/activate-react-apps.sh
```

Script ini akan:
1. Backup file HTML/JS lama ke `.legacy`
2. Rename file React (`react.html` → `index.html`)
3. Restart tidak otomatis (lakukan manual)

### Rollback ke Legacy (Jika Ada Masalah)
```bash
./scripts/rollback-react-apps.sh
```

### Manual Deployment
Jika tidak menggunakan script:

```bash
cd imogi_pos/www

# Login
mv shared/login/index.html shared/login/index.html.legacy
mv shared/login/index.py shared/login/index.py.legacy
mv shared/login/react.html shared/login/index.html
mv shared/login/react.py shared/login/index.py

# Service Select
mv shared/service-select/index.html shared/service-select/index.html.legacy
mv shared/service-select/react.html shared/service-select/index.html
mv shared/service-select/react.py shared/service-select/index.py

# Device Select
mv shared/device-select/index.html shared/device-select/index.html.legacy
mv shared/device-select/index.py shared/device-select/index.py.legacy
mv shared/device-select/react.html shared/device-select/index.html
mv shared/device-select/react.py shared/device-select/index.py

# Opening Balance
mv opening-balance/index.html opening-balance/index.html.legacy
mv opening-balance/react.html opening-balance/index.html
mv opening-balance/react.py opening-balance/index.py

# Restart
bench restart
bench clear-cache
```

## 🧪 Testing URLs

### Development (localhost:3000)
```
http://localhost:3000  # Saat run npm run dev:login
```

### Production
```
http://your-site.com/shared/login  # ONLY for standalone WWW apps (self-order, kiosk)
http://your-site.com/login  # Frappe built-in login for Desk Pages
http://your-site.com/service-select  
http://your-site.com/device-select
http://your-site.com/opening-balance?device=kiosk&next=/service-select
```

## 📁 File Structure

```
src/apps/
├── login/
│   ├── main.jsx       # Entry point
│   ├── App.jsx        # Main component
│   └── styles.css     # Styles
├── service-select/
├── device-select/
└── opening-balance/

imogi_pos/www/
├── shared/login/
│   ├── index.html     # 👈 Aktif setelah migration
│   ├── index.py       # 👈 Aktif setelah migration
│   ├── index.html.legacy  # Backup
│   └── index.py.legacy    # Backup
└── ...
```

## 🔄 Workflow

### 1. Development
```bash
# Edit di src/apps/login/App.jsx
npm run dev:login

# Test perubahan
# Edit lagi...
# Hot reload otomatis
```

### 2. Build
```bash
npm run build:login
# Output: imogi_pos/public/react/login/
```

### 3. Test Build Locally
```bash
# Jalankan Frappe server
bench start

# Akses http://localhost:8000/shared/login  # ONLY for testing standalone WWW apps
# For Desk Pages, use: http://localhost:8000/login (Frappe built-in)
```

### 4. Deploy to Production
```bash
# Commit & push
git add .
git commit -m "Update login page"
git push

# Di server production:
git pull
npm run build:login
./scripts/activate-react-apps.sh  # Jika belum
bench restart
```

## 🐛 Troubleshooting

### Build Error
```bash
# Clean dan rebuild
rm -rf imogi_pos/public/react/login
npm run build:login
```

### React Bundle Not Found
```bash
# Pastikan sudah build
npm run build:all

# Check output
ls -la imogi_pos/public/react/login/
```

### Page Tidak Muncul
```bash
# Clear cache
bench clear-cache

# Restart
bench restart

# Check logs
tail -f logs/web.error.log
```

### Rollback
```bash
./scripts/rollback-react-apps.sh
bench restart
```

## 🎯 Key Features

### Login App
- Authentication via frappe-react-sdk
- Auto-redirect with `?next=` param
- Dynamic branding

### Service Select App
- Dine In/Take Away selection
- Modal untuk zone & table (Dine In)
- Real-time table availability

### Device Select App
- Kiosk/Cashier navigation
- Simple device selection

### Opening Balance App
- Cash denomination calculator
- Previous session info
- Auto-calculate total

## 📚 Documentation

- [REACT_MIGRATION_COMPLETE.md](REACT_MIGRATION_COMPLETE.md) - Detailed migration guide
- [REACT_COMPLETE.md](REACT_COMPLETE.md) - Complete architecture
- [REACT_ARCHITECTURE.md](REACT_ARCHITECTURE.md) - Architecture overview
- [REACT_SETUP.md](REACT_SETUP.md) - Initial setup guide

## 🎉 Status

✅ **13/13 Apps Migrated to React**

- Core POS: 9 apps
- Auth/Shared: 4 apps
- **Total: 13 apps**
- **Legacy HTML: 0 apps**
- **React: 100%**

---

**Happy coding! 🚀**
