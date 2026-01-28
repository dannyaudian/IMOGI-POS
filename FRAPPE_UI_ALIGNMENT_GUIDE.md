# Frappe Desk UI/UX Alignment Guide

**Date:** January 28, 2026  
**Module:** Module Select  
**Status:** ✅ Complete

---

## 🎯 Objective

Align IMOGI POS Module Select UI/UX with Frappe Desk design system for:
- **Consistency** across Frappe apps
- **Familiarity** for Frappe users
- **Maintainability** via Frappe CSS variables

---

## 📊 Design Changes

### 1. Header Transformation

**BEFORE (Custom Design):**
```css
.module-select-header {
  background: linear-gradient(135deg, #fe9c2b 0%, #ff8a00 100%);
  color: white;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
```

**AFTER (Frappe Desk Style):**
```css
.module-select-header {
  background: var(--card-bg, #ffffff);
  color: var(--text-color, #2c3e50);
  padding: 1.5rem 2rem;
  border-bottom: 1px solid var(--border-color, #d1d8dd);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.05));
}
```

**Visual Impact:**
- Gradient orange → Flat white
- White text → Dark text (#2c3e50)
- Heavy shadow → Subtle 1px shadow
- Matches standard Frappe page header

---

### 2. Form Controls (Selects & Buttons)

**BEFORE:**
```css
.header-select {
  background-color: rgba(255, 255, 255, 0.25);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

**AFTER:**
```css
.header-select {
  background-color: var(--control-bg, #ffffff);
  color: var(--text-color, #2c3e50);
  border: 1px solid var(--border-color, #d1d8dd);
}

.header-select:focus {
  border-color: var(--primary, #2490ef);
  box-shadow: 0 0 0 3px rgba(36, 144, 239, 0.1);
}
```

**Visual Impact:**
- Transparent on gradient → Solid white background
- White border → Gray border (#d1d8dd)
- Focus: White glow → Blue ring (Frappe primary color)

---

### 3. Typography & Labels

**BEFORE:**
```css
.header-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
}

.user-name {
  font-weight: 600;
  color: white;
}
```

**AFTER:**
```css
.header-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted, #8d99a6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.user-name {
  font-weight: 500;
  color: var(--text-color, #2c3e50);
}
```

**Visual Impact:**
- Bold white labels → Lighter muted labels (#8d99a6)
- Matches Frappe form label style
- Better visual hierarchy

---

## 🎨 Frappe CSS Variables Used

| Variable | Value (Fallback) | Usage |
|----------|-------------------|-------|
| `--primary` | `#2490ef` | Focus borders, primary actions |
| `--text-color` | `#2c3e50` | Main text |
| `--text-muted` | `#8d99a6` | Labels, secondary text |
| `--border-color` | `#d1d8dd` | Input borders, dividers |
| `--dark-border-color` | `#a8a8a8` | Hover borders |
| `--card-bg` | `#ffffff` | Card/header backgrounds |
| `--control-bg` | `#ffffff` | Form control backgrounds |
| `--control-bg-on-gray` | `#fafbfc` | Hover backgrounds |
| `--btn-default-bg` | `#ffffff` | Button backgrounds |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | Subtle shadows |
| `--border-radius` | `4px` | Corner radii |

---

## ✅ Benefits

### 1. **Consistency**
- Users familiar with Frappe Desk won't notice jarring differences
- Buttons, selects, and form controls behave identically to Frappe forms
- Visual language matches Frappe's ERPNext, Frappe HR, etc.

### 2. **Accessibility**
- **Better contrast:** Dark text on white (WCAG AAA compliant) vs white on gradient
- **Focus indicators:** Clear blue ring matches browser standards
- **Color blindness:** Less reliance on color (gradient was only visual cue)

### 3. **Maintainability**
- Frappe theme updates automatically apply (via CSS variables)
- Dark mode support built-in (if Frappe adds it, we get it)
- No hardcoded hex colors to update

### 4. **Professional Appearance**
- Flat design is industry standard for modern dashboards
- Clean, minimalist aesthetic (less "flashy", more "corporate")
- Matches SaaS UI trends (Notion, Linear, Stripe, etc.)

---

## 🖼️ Visual Comparison

### Header Section:

**Before:**
```
┌─────────────────────────────────────────────────────┐
│  IMOGI POS          [POS Profile ▼]    Danny  Logout│  ← Orange gradient
│  Module Selection                                   │  ← White text
└─────────────────────────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────────────────────────┐
│  IMOGI POS          POS PROFILE        Danny  Logout│  ← White flat bg
│  Module Selection   [Dirnosaurus ▼]                 │  ← Dark text
└─────────────────────────────────────────────────────┘
   ↑ 1px gray border
```

### Form Controls:

**Before:**
```
╭──────────────────╮
│ Dirnosaurus    ▼ │  ← Transparent with white border
╰──────────────────╯
```

**After:**
```
╭──────────────────╮
│ Dirnosaurus    ▼ │  ← White with gray border (#d1d8dd)
╰──────────────────╯
   Focus: Blue ring (3px)
```

---

## 📦 Files Changed

1. **src/apps/module-select/styles.css**
   - Lines 9-30: CSS variables updated to use Frappe variables
   - Lines 56-63: Header gradient → flat background
   - Lines 125-133: Header selector transparency → white
   - Lines 138-192: Form controls, buttons, labels

2. **imogi_pos/public/react/module-select/static/css/main.dkrOJle4.css**
   - New CSS bundle with Frappe-aligned styles
   - Size: 27.77 kB (was 27.19 kB) - +0.58 kB for fallback values

3. **imogi_pos/public/react/module-select/static/js/main.HFRu33v2.js**
   - New JS bundle hash (no code changes, just CSS reference update)
   - Size: 287.37 kB (unchanged)

---

## 🧪 Testing Checklist

- [ ] Hard refresh browser (`Cmd+Shift+R`)
- [ ] Verify header is white (not gradient)
- [ ] Verify text is dark (#2c3e50, not white)
- [ ] Test POS Profile selector:
  - [ ] Click opens dropdown with proper contrast
  - [ ] Hover shows gray background
  - [ ] Focus shows blue ring
- [ ] Test Logout button:
  - [ ] White background with gray border
  - [ ] Hover changes to light gray (#fafbfc)
- [ ] Compare with Frappe Desk page (e.g., `/app/user`)
  - [ ] Header height matches
  - [ ] Border color matches
  - [ ] Button style matches

---

## 🚀 Deployment

### Local Testing:
```bash
# Already built - just refresh browser
# Bundle: main.HFRu33v2.js
# CSS: main.dkrOJle4.css
```

### Production Deploy:
```bash
# SSH to production server
cd ~/frappe-bench
bench --site your-site.frappe.cloud clear-cache
bench build --app imogi_pos
bench restart
```

---

## 🔄 Rollback (If Needed)

If users prefer the gradient design:

1. **Revert CSS variables** (lines 9-30):
   ```css
   --primary-color: #fe9c2b;  /* Orange instead of blue */
   ```

2. **Restore gradient header** (lines 56-63):
   ```css
   background: linear-gradient(135deg, var(--primary-color) 0%, #ff8a00 100%);
   color: white;
   ```

3. **Rebuild:**
   ```bash
   VITE_APP=module-select npm run build
   ```

---

## 📝 Notes

- **Module cards** styling unchanged (already Frappe-compatible)
- **Sidebar** styling unchanged (green Active POS box remains)
- **Modals** remain custom styled (intentional for brand identity)
- **Icons** unchanged (FontAwesome icons work with both themes)

---

**Review Status:** ✅ Approved  
**Implementation:** ✅ Complete  
**Bundle Hash:** `main.HFRu33v2.js`  
**CSS Hash:** `main.dkrOJle4.css`
