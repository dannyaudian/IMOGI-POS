# Linting & Code Quality Setup for IMOGI-POS

This guide explains how to set up and use automated linting to maintain authorization standards.

## 📋 Overview

This project uses **pre-commit hooks** to automatically validate:

1. ✅ No direct cache access in www/ files
2. ✅ No inline role checks (use decorators instead)
3. ✅ All required imports present
4. ✅ Code formatting (black)
5. ✅ Import sorting (isort)
6. ✅ Python linting (flake8)

---

## 🚀 Quick Start

### 1. Install pre-commit (one-time)

```bash
pip install pre-commit
```

### 2. Setup hooks (one-time)

```bash
cd IMOGI-POS
pre-commit install
```

### 3. Commit as normal

```bash
git add .
git commit -m "your message"

# Hooks run automatically!
# If they fail, fix the issues and commit again
```

---

## 🔧 Configuration Files

### `.pre-commit-config.yaml`

Defines which hooks run on every commit:

- **no-frappe-cache-hget** - Prevents `frappe.cache().hget()` in www/
- **no-inline-frappe-get-roles** - Prevents inline `frappe.get_roles()` in www/
- **require-auth-imports** - Ensures proper imports for auth usage
- **flake8** - Python linting
- **black** - Code formatting
- **isort** - Import sorting

### `.flake8`

Python linting configuration:
- Line length: 120 characters
- Excludes: virtualenvs, migrations, node_modules, etc.

### `scripts/validate_auth_imports.py`

Custom Python script that:
- Checks if decorators have matching imports
- Validates `get_active_branch()` calls have imports
- Detects anti-patterns early

---

## ✅ What Gets Validated

### Rule 1: No Direct Cache Access

❌ **This will be rejected**:
```python
# www/some_page/index.py
branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)
```

✅ **This will pass**:
```python
# www/some_page/index.py
from imogi_pos.utils.auth_helpers import get_active_branch
branch = get_active_branch()
```

---

### Rule 2: No Inline Role Checks

❌ **This will be rejected**:
```python
# www/some_page/index.py
def get_context(context):
    if "Cashier" not in frappe.get_roles():
        raise frappe.Redirect("/login")
```

✅ **This will pass**:
```python
# www/some_page/index.py
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Cashier")
def get_context(context):
    # Decorator handles role validation
```

---

### Rule 3: Required Imports

❌ **This will be rejected**:
```python
# Missing import!
@require_roles("Branch Manager")
def get_context(context):
    pass
```

✅ **This will pass**:
```python
from imogi_pos.utils.auth_decorators import require_roles

@require_roles("Branch Manager")
def get_context(context):
    pass
```

---

## 🛠️ Common Commands

### Run linting manually

```bash
# On all files
pre-commit run --all-files

# On specific file
pre-commit run --files imogi_pos/www/counter/pos/index.py

# Verbose output
pre-commit run --all-files --verbose
```

### Fix issues automatically

```bash
# Fix imports (isort)
isort imogi_pos/www/

# Fix formatting (black)
black imogi_pos/www/

# Check what flake8 found (cannot auto-fix)
flake8 imogi_pos/www/
```

### Skip hooks (emergency only)

```bash
git commit --no-verify

# ⚠️ Use only in emergencies!
# Your PR may be rejected during review
```

### Update hooks

```bash
# Update to latest versions
pre-commit autoupdate
```

---

## 🐛 Troubleshooting

### "Hook failed" on commit

**Step 1: Check what failed**
```bash
pre-commit run --all-files --verbose
```

**Step 2: Read the error message**

Common errors:
- `No direct frappe.cache().hget()` - Use `get_active_branch()`
- `No inline frappe.get_roles()` - Use `@require_roles` decorator
- `Missing import` - Add the required import statement

**Step 3: Fix the issue**

See [AUTHORIZATION_DEVELOPMENT_GUIDE.md](AUTHORIZATION_DEVELOPMENT_GUIDE.md) for examples.

**Step 4: Commit again**
```bash
git add .
git commit -m "your message"
```

---

### "pre-commit not installed"

```bash
# Install pre-commit framework
pip install pre-commit

# Install hooks
pre-commit install

# Try commit again
git commit -m "message"
```

---

### "black/isort reformatted my code"

Some hooks automatically fix issues:

```bash
# These auto-fix:
# - isort (import sorting)
# - black (code formatting)

# After auto-fix, these changes are STAGED but not COMMITTED
# Just commit them:
git add .
git commit -m "your message"
```

---

### Hook runs but still fails

1. Check the error message carefully
2. Fix the actual issue (not just the symptom)
3. Verify with: `pre-commit run --files <your-file>`
4. Commit again

---

## 📚 Documentation

For detailed information on authorization patterns, see:

- **[AUTHORIZATION_DEVELOPMENT_GUIDE.md](AUTHORIZATION_DEVELOPMENT_GUIDE.md)** - Complete authorization guide
- **[DOCTYPE_WWW_REFACTORING_IMPLEMENTATION.md](DOCTYPE_WWW_REFACTORING_IMPLEMENTATION.md)** - Refactoring details
- **[AUTHORIZATION_REFACTOR_REPORT.md](AUTHORIZATION_REFACTOR_REPORT.md)** - Consolidation report

---

## 🔗 Setup with IDE

### VS Code

Add to `.vscode/settings.json`:

```json
{
  "[python]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  }
}
```

### PyCharm

1. **Settings** → **Tools** → **Python Integrated Tools**
2. Set **Default test runner** to pytest
3. **Reformat Code** uses black

### Vim/Neovim

Use ALE plugin with flake8 and black:

```vim
let g:ale_linters = {'python': ['flake8']}
let g:ale_fixers = {'python': ['black', 'isort']}
```

---

## 🎯 Summary

| Action | Command |
|--------|---------|
| Install pre-commit | `pip install pre-commit` |
| Setup hooks | `pre-commit install` |
| Run manually | `pre-commit run --all-files` |
| Fix automatically | `isort + black` |
| Skip (emergency) | `git commit --no-verify` |
| Update hooks | `pre-commit autoupdate` |

---

**Status**: ✅ **ACTIVE**  
**Last Updated**: January 25, 2026  
**Maintained By**: IMOGI Development Team
