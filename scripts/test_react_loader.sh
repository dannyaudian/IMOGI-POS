#!/bin/bash

# IMOGI React Loader - Quick Test Script
# 
# This script helps verify that the React loader refactoring is working correctly
# 
# Usage:
#   ./scripts/test_react_loader.sh
#   
# What it does:
#   1. Checks that imogi_loader.js exists
#   2. Verifies hooks.py includes the loader
#   3. Validates all page loaders have been updated
#   4. Provides instructions for browser testing

set -e

echo "=== IMOGI React Loader - File System Validation ==="
echo ""

# Check shared loader exists
if [ -f "imogi_pos/public/js/imogi_loader.js" ]; then
    echo "✅ imogi_loader.js exists"
else
    echo "❌ imogi_loader.js NOT FOUND"
    exit 1
fi

# Check hooks.py includes loader
if grep -q "imogi_loader.js" imogi_pos/hooks.py; then
    echo "✅ imogi_loader.js registered in hooks.py"
else
    echo "❌ imogi_loader.js NOT registered in hooks.py"
    exit 1
fi

# Check all page loaders have been updated to use shared loader
echo ""
echo "Checking page loaders for window.loadImogiReactApp usage..."

pages=(
    "imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js"
    "imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js"
    "imogi_pos/imogi_pos/page/imogi_waiter/imogi_waiter.js"
    "imogi_pos/imogi_pos/page/imogi_kitchen/imogi_kitchen.js"
    "imogi_pos/imogi_pos/page/imogi_displays/imogi_displays.js"
)

all_updated=true
for page in "${pages[@]}"; do
    if grep -q "window.loadImogiReactApp" "$page"; then
        echo "✅ $(basename $(dirname $page))"
    else
        echo "❌ $(basename $(dirname $page)) - NOT using shared loader"
        all_updated=false
    fi
done

echo ""
if [ "$all_updated" = true ]; then
    echo "✅ All page loaders updated successfully!"
else
    echo "❌ Some page loaders not updated"
    exit 1
fi

# Check for old injection patterns (should not exist)
echo ""
echo "Checking for old injection patterns..."

old_patterns_found=false

for page in "${pages[@]}"; do
    # Check for old setInterval patterns without using shared loader
    if grep -q "setInterval.*Mount" "$page" && ! grep -q "window.loadImogiReactApp" "$page"; then
        echo "⚠️  Old pattern found in $(basename $(dirname $page))"
        old_patterns_found=true
    fi
done

if [ "$old_patterns_found" = true ]; then
    echo "⚠️  Some old injection patterns still exist"
else
    echo "✅ No old injection patterns detected"
fi

# Count lines in loader
loader_lines=$(wc -l < "imogi_pos/public/js/imogi_loader.js" | tr -d ' ')
echo ""
echo "📊 Loader size: $loader_lines lines"

# Final instructions
echo ""
echo "=== Browser Testing Instructions ==="
echo ""
echo "1. Clear browser cache and hard reload (Cmd+Shift+R / Ctrl+Shift+R)"
echo "2. Open browser console (F12)"
echo "3. Navigate through these pages:"
echo "   - Module Select"
echo "   - Cashier Console"
echo "   - Waiter"
echo "   - Kitchen Display"
echo "   - Customer Display"
echo ""
echo "4. Run validation script in console:"
echo "   Copy and paste the contents of scripts/validate_react_loader.js"
echo ""
echo "5. Or manually check with:"
echo "   window.__imogiDebugScripts()"
echo ""
echo "Expected result: Each app should have exactly 1 script tag"
echo ""
echo "✅ File system validation complete!"
