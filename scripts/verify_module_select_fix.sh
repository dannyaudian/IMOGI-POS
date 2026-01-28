#!/bin/bash
# IMOGI POS - Module Select Double-Mount Verification Script
# Usage: bash scripts/verify_module_select_fix.sh

echo "🔍 IMOGI POS - Module Select Double-Mount Verification"
echo "========================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Legacy WWW route should be deleted
echo "📁 Check 1: Legacy WWW route deleted?"
if [ -d "imogi_pos/www/shared/module-select" ]; then
    echo -e "${RED}❌ FAIL${NC}: Legacy WWW route still exists at imogi_pos/www/shared/module-select/"
    echo "   Action: Run 'rm -rf imogi_pos/www/shared/module-select/'"
    exit 1
else
    echo -e "${GREEN}✅ PASS${NC}: Legacy WWW route deleted"
fi
echo ""

# Check 2: Desk page exists
echo "📄 Check 2: Desk page files exist?"
DESK_PAGE_DIR="imogi_pos/imogi_pos/page/imogi_module_select"
if [ ! -f "$DESK_PAGE_DIR/imogi_module_select.js" ]; then
    echo -e "${RED}❌ FAIL${NC}: Desk page JS not found"
    exit 1
fi
if [ ! -f "$DESK_PAGE_DIR/imogi_module_select.json" ]; then
    echo -e "${RED}❌ FAIL${NC}: Desk page JSON not found"
    exit 1
fi
echo -e "${GREEN}✅ PASS${NC}: Desk page files exist"
echo ""

# Check 3: Script guard has src validation
echo "🛡️  Check 3: Script guard has src validation?"
if grep -q "includes('/assets/imogi_pos/react/module-select/')" "$DESK_PAGE_DIR/imogi_module_select.js"; then
    echo -e "${GREEN}✅ PASS${NC}: Script guard validates exact src path"
else
    echo -e "${RED}❌ FAIL${NC}: Script guard missing src validation"
    echo "   Expected: scriptExists check should use .includes('/assets/imogi_pos/react/module-select/')"
    exit 1
fi
echo ""

# Check 4: Mount function has version stamp
echo "🏷️  Check 4: React bundle has version stamp?"
MAIN_JSX="src/apps/module-select/main.jsx"
if grep -q "__imogiModuleSelectMountVersion" "$MAIN_JSX"; then
    echo -e "${GREEN}✅ PASS${NC}: Version stamp found in bundle"
    VERSION=$(grep "__imogiModuleSelectMountVersion" "$MAIN_JSX" | head -1)
    echo "   Version: $VERSION"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Version stamp not found (optional but recommended)"
fi
echo ""

# Check 5: Sticky mount function (Object.defineProperty)
echo "🔒 Check 5: Mount function has sticky lock?"
if grep -q "Object.defineProperty(window, 'imogiModuleSelectMount'" "$MAIN_JSX"; then
    echo -e "${GREEN}✅ PASS${NC}: Mount function locked with Object.defineProperty"
else
    echo -e "${RED}❌ FAIL${NC}: Mount function not locked (writable: false missing)"
    exit 1
fi
echo ""

# Check 6: Root cache key consistency
echo "🔑 Check 6: Root cache key exported?"
if grep -q "window.__imogiModuleSelectRootKey" "$MAIN_JSX"; then
    echo -e "${GREEN}✅ PASS${NC}: Root key exported for verification"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Root key not exported (recommended for debugging)"
fi
echo ""

# Check 7: Hooks.py redirects configured
echo "↪️  Check 7: Frappe redirects configured in hooks.py?"
HOOKS_FILE="imogi_pos/hooks.py"
if grep -q '"/shared/module-select".*"/app/imogi-module-select"' "$HOOKS_FILE"; then
    echo -e "${GREEN}✅ PASS${NC}: Redirect from /shared/module-select → /app/imogi-module-select configured"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Redirect not found in hooks.py (may break old bookmarks)"
fi
echo ""

# Check 8: Hardcoded route references updated
echo "🔗 Check 8: Hardcoded route references updated?"
LEGACY_REFS=$(grep -r "/shared/module-select" src/ --include="*.jsx" --include="*.js" 2>/dev/null | wc -l | xargs)
if [ "$LEGACY_REFS" -eq "0" ]; then
    echo -e "${GREEN}✅ PASS${NC}: No hardcoded /shared/module-select references in src/"
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Found $LEGACY_REFS hardcoded references to /shared/module-select in src/"
    echo "   These should be updated to /app/imogi-module-select"
    grep -r "/shared/module-select" src/ --include="*.jsx" --include="*.js" 2>/dev/null | head -5
fi
echo ""

# Check 9: Build output exists
echo "📦 Check 9: Build output exists?"
MANIFEST="imogi_pos/public/react/module-select/.vite/manifest.json"
if [ -f "$MANIFEST" ]; then
    echo -e "${GREEN}✅ PASS${NC}: Build manifest exists"
    # Extract main bundle file
    BUNDLE=$(grep '"file":' "$MANIFEST" | head -1 | sed 's/.*"file": "\(.*\)".*/\1/')
    BUNDLE_PATH="imogi_pos/public/react/module-select/$BUNDLE"
    if [ -f "$BUNDLE_PATH" ]; then
        BUNDLE_SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)
        echo "   Bundle: $BUNDLE ($BUNDLE_SIZE)"
    else
        echo -e "${YELLOW}⚠️  WARN${NC}: Bundle file not found: $BUNDLE_PATH"
    fi
else
    echo -e "${RED}❌ FAIL${NC}: Build manifest not found. Run 'VITE_APP=module-select npm run build'"
    exit 1
fi
echo ""

# Summary
echo "========================================================"
echo -e "${GREEN}✅ All critical checks passed!${NC}"
echo ""
echo "📋 Next Steps:"
echo "   1. Rebuild module-select: VITE_APP=module-select npm run build"
echo "   2. Restart Frappe: bench restart"
echo "   3. Open browser console at /app/imogi-module-select"
echo "   4. Run browser verification (see below)"
echo ""
echo "🌐 Browser Console Verification:"
echo "   Run these commands in browser DevTools:"
echo ""
echo "   // Check version"
echo "   window.__imogiModuleSelectMountVersion"
echo ""
echo "   // Check script count (should be 1)"
echo "   document.querySelectorAll('script[data-imogi-app=\"module-select\"]').length"
echo ""
echo "   // Check script src"
echo "   [...document.querySelectorAll('script[data-imogi-app=\"module-select\"]')].map(s => s.src)"
echo ""
echo "   // Check root cache"
echo "   document.getElementById('imogi-module-select-root').__imogiModuleSelectRoot"
echo ""
echo "   // Verify mount function is locked"
echo "   Object.getOwnPropertyDescriptor(window, 'imogiModuleSelectMount')"
echo ""
