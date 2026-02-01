# Frappe Cloud CSS MIME Type Error - Complete Fix Guide

## 🔴 Problem
Browser error: **"Refused to apply style because its MIME type ('text/html') is not a supported stylesheet MIME type"**

**What's happening:**
- Browser requests: `/assets/frappe/dist/css/desk.bundle.UXADAAVE.css`
- Server responds: HTML page (404/login/error) instead of CSS file
- Result: Styles don't load, UI breaks

---

## 🎯 Root Causes (Frappe Cloud Specific)

### 1. Asset Hash Mismatch
- Build generated new hash (`UXADAAVE`) but old assets still cached
- HTML references new hash, but file doesn't exist on server
- Server returns HTML error page instead of CSS

### 2. Build Not Published
- `npm run build` ran locally but assets not synced to Frappe Cloud
- Deploy step skipped "Build Assets" option
- Assets exist in repo but not in `/sites/assets/` directory

### 3. CDN/Proxy Cache Stale
- Frappe Cloud CDN serving old version
- Nginx proxy cache needs clearing
- Browser cache holding old references

### 4. Deploy Pipeline Incomplete
- App installed but assets not built
- `bench build` not run after code deploy
- Migration ran but asset publish skipped

---

## ✅ Complete Fix (Step-by-Step)

### **Step 1: Rebuild Assets on Frappe Cloud**

**Option A: Via Frappe Cloud Dashboard**
1. Go to your site: `https://frappecloud.com/dashboard/sites/[your-site]`
2. Click **"Deploy"** or **"Update"** button
3. ✅ **Check "Build Assets"** (critical!)
4. Click Deploy
5. Wait for build to complete (5-15 minutes)
6. Check deploy logs for errors

**Option B: Via Bench CLI (if SSH access)**
```bash
# SSH into your Frappe Cloud container
cd /home/frappe/frappe-bench

# Pull latest code
bench update --pull

# Build all assets (Frappe + custom apps)
bench build --app imogi_pos

# Or build everything
bench build

# Clear cache
bench --site [your-site].frappe.cloud clear-cache
bench --site [your-site].frappe.cloud clear-website-cache
```

---

### **Step 2: Verify Assets Were Published**

**Check if files exist on server:**
```bash
# SSH to Frappe Cloud container
ls -lh /home/frappe/frappe-bench/sites/assets/imogi_pos/public/react/cashier-console/

# Should see files like:
# static/css/main.k98Q2XAH.css
# static/js/main.CUXMPVI4.js
# manifest.json
```

**Check manifest.json:**
```bash
cat /home/frappe/frappe-bench/sites/assets/imogi_pos/public/react/cashier-console/.vite/manifest.json

# Should show current hashes:
{
  "main.jsx": {
    "file": "static/js/main.CUXMPVI4.js",
    "css": ["static/css/main.k98Q2XAH.css"]
  }
}
```

---

### **Step 3: Clear All Caches**

**A. Site Cache (Frappe Cloud Dashboard)**
1. Go to site settings
2. Click **"Clear Cache"** button
3. Wait for confirmation

**B. Site Cache (Bench CLI)**
```bash
bench --site [your-site].frappe.cloud clear-cache
bench --site [your-site].frappe.cloud clear-website-cache
bench restart
```

**C. Browser Cache (Client Side)**
- **Chrome/Edge:** `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
- **Firefox:** `Ctrl+F5` / `Cmd+Shift+R`
- **Or:** DevTools → Application → Clear Storage → Clear site data

---

### **Step 4: Verify Asset URLs Work**

Open these URLs **directly in browser** (replace with your actual hashes):

```
https://[your-site].frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/css/main.k98Q2XAH.css

https://[your-site].frappe.cloud/assets/imogi_pos/public/react/cashier-console/static/js/main.CUXMPVI4.js
```

**✅ Expected:** CSS/JS file content displayed  
**❌ Problem:** HTML page (404/login/error)

**If still HTML:**
- Assets not published → repeat Step 1
- Wrong path/hash → check manifest.json
- Nginx config issue → contact Frappe Cloud support

---

## 🔍 Diagnostic Checklist

### 1. Check Build Logs
```bash
# In Frappe Cloud dashboard, view deploy logs
# Look for:
✓ "Building imogi_pos assets..."
✓ "✓ built in XXXms"
✗ "Build failed" or "ENOENT" errors
```

### 2. Check Nginx Configuration
```bash
# SSH to container
cat /etc/nginx/conf.d/frappe-bench-frappe.conf

# Should have:
location /assets/ {
    alias /home/frappe/frappe-bench/sites/assets/;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

### 3. Check Frappe Version Compatibility
```bash
# SSH to container
cd /home/frappe/frappe-bench
bench version

# IMOGI POS requires:
# - Frappe v15.x
# - ERPNext v15.x (optional)
# - Node.js v18+ (for Vite builds)
```

### 4. Check App Installation
```bash
bench --site [your-site].frappe.cloud list-apps

# Should include:
# - frappe
# - imogi_pos
```

---

## 🛡️ Prevention (Future Deploys)

### 1. Always Build Assets on Deploy
**Frappe Cloud Dashboard:**
- ✅ Check "Build Assets" on every deploy
- Don't skip this even for "small" changes

### 2. Watch Build Process
- Monitor deploy logs until completion
- Check for `npm ERR!` or `ENOENT` errors
- Verify "Build succeeded" message

### 3. Use Proper Deploy Workflow
```bash
# Local development:
git add .
git commit -m "Your changes"
git push origin main

# Frappe Cloud will:
1. Pull code
2. Run migrations (if bench migrate enabled)
3. Build assets (if "Build Assets" checked)
4. Restart services
```

### 4. Test After Deploy
- Open incognito window (no cache)
- Check browser DevTools → Network tab
- Verify all assets load with HTTP 200
- Look for `text/html` MIME type errors

---

## 🔗 Related Issues

### JavaScript MIME Type Errors
```
Failed to load module script: "text/html" is not a valid JavaScript MIME type
```
**Same fix** - it's asset publish/cache issue.

### Mixed Content Warnings
```
Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource
```
**Different issue** - check `frappe.conf` for `force_https` setting.

### Module Not Found Errors
```
Cannot find module '@/components/...'
```
**Different issue** - check Vite alias configuration in [vite.config.js](vite.config.js).

---

## 📝 IMOGI POS Specific Notes

### Local Development (Works Fine)
```bash
npm run dev
# Assets served by Vite dev server
# No hash mismatch possible
# Hot reload enabled
```

### Local Build (Testing)
```bash
npm run build
# Assets written to: imogi_pos/public/react/*/
# Output:
# ✓ cashier-console/static/css/main.k98Q2XAH.css   54.60 kB
# ✓ cashier-console/static/js/main.CUXMPVI4.js    352.23 kB
```

### Frappe Cloud Deploy (Production)
```bash
# Requires full build pipeline:
1. npm run build (all apps: cashier, kitchen, waiter, etc.)
2. Copy to /sites/assets/imogi_pos/public/react/
3. bench build (if additional Frappe assets)
4. Clear cache
5. Restart workers
```

**Critical:** Frappe Cloud **MUST** run Step 1 during deploy, or assets won't update!

---

## 🆘 Still Not Working?

### Check These:
1. **Deploy logs show build errors?** → Fix package.json dependencies
2. **Assets exist but still 404?** → Nginx config or permissions issue
3. **Works in incognito, fails in normal browser?** → Clear browser data completely
4. **Works for some users, not others?** → CDN geo-caching issue (contact support)

### Get Help:
```bash
# Collect diagnostic info:
bench version
bench --site [your-site].frappe.cloud list-apps
ls -lR /home/frappe/frappe-bench/sites/assets/imogi_pos/

# Share this output with:
- Frappe Cloud support: support@frappe.io
- IMOGI team: [your-support-channel]
```

---

## ✅ Success Checklist

- [ ] Deploy completed with "Build succeeded" message
- [ ] Site cache cleared (Frappe Cloud dashboard)
- [ ] Browser cache cleared (hard refresh)
- [ ] Asset URLs return CSS/JS content (not HTML)
- [ ] Browser DevTools shows no MIME type errors
- [ ] Cashier console loads without styling issues
- [ ] All React apps functional (kitchen, waiter, kiosk, etc.)

---

**Last Updated:** 2026-02-01  
**Tested On:** Frappe Cloud v15, IMOGI POS v2.0  
**Maintainer:** IMOGI Development Team
