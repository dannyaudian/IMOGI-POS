# Frappe Cloud Deployment Guide - IMOGI POS React Apps

## 🚀 Quick Setup (One-time)

### Step 1: Enable GitHub Actions

Already configured! File exists: `.github/workflows/build-react.yml`

### Step 2: Commit Setup Files

```bash
# Add all new infrastructure files
git add .github/workflows/build-react.yml
git add imogi_pos/install.py
git add imogi_pos/utils/react_helpers.py
git add imogi_pos/templates/includes/react_app.html
git add imogi_pos/www/customer_display_editor/
git add src/apps/customer-display-editor/
git add src/apps/table-layout-editor/
git add package.json
git add .gitignore

# Commit
git commit -m "feat: React apps setup for Frappe Cloud with GitHub Actions"

# Push to trigger first build
git push origin main
```

### Step 3: Verify GitHub Actions

1. Go to your repo on GitHub
2. Click **Actions** tab
3. See "Build React Apps for Frappe Cloud" workflow running
4. Wait for green checkmark ✅
5. Check new commit with message: "chore: build React apps [skip ci]"

### Step 4: Deploy to Frappe Cloud

Frappe Cloud auto-deploys on git push. Nothing extra needed!

1. Push triggers deployment
2. Frappe Cloud pulls latest code
3. Pre-built React bundles included
4. Site updated automatically

### Step 5: Verify Live Site

Visit: `https://your-site.frappe.cloud/customer_display_editor`

Should see React app loading!

---

## 🔄 Daily Workflow

### Developing React Features

```bash
# 1. Create feature branch
git checkout -b feature/improve-customer-display

# 2. Make changes to React code
vim src/apps/customer-display-editor/App.jsx

# 3. Test locally (optional)
npm run build:customer-display-editor
# Open http://localhost:8000/customer_display_editor

# 4. Commit React code ONLY
git add src/apps/customer-display-editor/
git commit -m "feat: add new settings to customer display"

# 5. Push to GitHub
git push origin feature/improve-customer-display

# 6. GitHub Actions auto-builds
# Check Actions tab for progress

# 7. Merge to main (via PR)
# This triggers deployment to Frappe Cloud
```

### What Happens Automatically:

1. **You push** React code changes
2. **GitHub Actions** builds React apps
3. **Bot commits** built bundles back to repo
4. **Frappe Cloud** deploys pre-built bundles
5. **Users see** updated app (with new hash, no cache!)

---

## 📋 Checklist Before First Deploy

- [ ] GitHub Actions workflow file exists (`.github/workflows/build-react.yml`)
- [ ] `.gitignore` allows React bundles (not ignored)
- [ ] `package.json` has `build:all` script
- [ ] `imogi_pos/install.py` detects Frappe Cloud
- [ ] `react_helpers.py` loads manifests correctly
- [ ] Template `react_app.html` created
- [ ] At least one React app built and committed
- [ ] Pushed to GitHub and Actions succeeded
- [ ] Frappe Cloud deployment successful

---

## 🐛 Troubleshooting

### "React bundle not found" on live site

**Cause:** Built files not in git repo

**Fix:**
```bash
# Check if bundles exist locally
ls -la imogi_pos/public/react/customer-display-editor/

# If missing, build manually
npm run build:customer-display-editor

# Commit built files
git add imogi_pos/public/react/
git commit -m "chore: add missing React bundles"
git push origin main
```

### GitHub Actions failing

**Cause:** npm dependencies issue

**Fix:**
```bash
# Update lockfile
rm package-lock.json
npm install

# Commit updated lockfile
git add package-lock.json
git commit -m "chore: update package-lock.json"
git push origin main
```

### Changes not appearing on live site

**Checklist:**
1. ✅ GitHub Actions completed successfully?
2. ✅ Bot committed built files to repo?
3. ✅ Frappe Cloud pulled latest commit?
4. ✅ Hard reload browser (Cmd+Shift+R)?

**Force refresh:**
```bash
# 1. Trigger rebuild
git commit --allow-empty -m "chore: trigger rebuild"
git push origin main

# 2. Wait for GitHub Actions
# 3. Hard reload browser
```

### install.py showing build errors

**This is OK for Frappe Cloud!**

The install.py hook detects Frappe Cloud and skips npm build:

```python
if is_frappe_cloud():
    frappe.logger().info("Frappe Cloud: Using pre-built bundles")
    verify_prebuilt_bundles()  # Just verifies, doesn't build
    return
```

If you see this log, it's working correctly!

---

## 📊 Deployment Flow Diagram

```
┌─────────────────┐
│  Developer      │
│  edits React    │
│  code locally   │
└────────┬────────┘
         │
         │ git push
         ▼
┌─────────────────┐
│  GitHub         │
│  receives push  │
└────────┬────────┘
         │
         │ triggers
         ▼
┌─────────────────┐
│  GitHub Actions │
│  - npm install  │
│  - npm build    │
│  - git commit   │
│  - git push     │
└────────┬────────┘
         │
         │ commits built files
         ▼
┌─────────────────┐
│  GitHub Repo    │
│  (with bundles) │
└────────┬────────┘
         │
         │ webhook
         ▼
┌─────────────────┐
│  Frappe Cloud   │
│  - git pull     │
│  - bench migrate│
│  - bench restart│
└────────┬────────┘
         │
         │ serves
         ▼
┌─────────────────┐
│  Live Site      │
│  ✅ React app   │
│  working!       │
└─────────────────┘
```

---

## 🎯 Key Points

1. **Never build on Frappe Cloud** - npm not available
2. **Always commit bundles** - they're in git repo
3. **GitHub Actions auto-builds** - on every push
4. **Hashed filenames = No cache issues** - browsers auto-update
5. **Install hooks = Safe** - just verify, don't build

---

## 📞 Support

If deployment fails:

1. Check GitHub Actions logs
2. Check Frappe Cloud deployment logs  
3. Verify bundles in repo: `git ls-files imogi_pos/public/react/`
4. Contact Frappe Cloud support if needed

**Everything should be automated!** 🎉
