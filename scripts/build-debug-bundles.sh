#!/bin/bash

# IMOGI POS - Debug Build Setup
# Builds non-minified bundles with sourcemaps for readable error stacks

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║  IMOGI POS - DEBUG BUILD SETUP                                        ║"
echo "║  Builds non-minified bundles with inline sourcemaps                   ║"
echo "║  Error stacks will show real function names, not minified names       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

cd /Users/dannyaudian/github/IMOGI-POS

echo "[1/4] Building cashier-console debug bundle..."
VITE_APP=cashier-console VITE_DEBUG=true npm run build:cashier 2>&1 | tail -10

echo ""
echo "[2/4] Building module-select debug bundle..."
VITE_APP=module-select VITE_DEBUG=true npm run build:module-select 2>&1 | tail -10

echo ""
echo "[3/4] Verifying debug bundle structure..."
echo ""

# Check debug bundles were created
CASHIER_DEBUG_DIR="imogi_pos/public/react/cashier-console-debug"
MODULE_DEBUG_DIR="imogi_pos/public/react/module-select-debug"

if [ -d "$CASHIER_DEBUG_DIR" ]; then
    echo "✓ Cashier Console debug bundle:"
    ls -lh "$CASHIER_DEBUG_DIR/static/js/" | grep "main"
else
    echo "✗ Cashier debug bundle not found"
fi

if [ -d "$MODULE_DEBUG_DIR" ]; then
    echo ""
    echo "✓ Module Select debug bundle:"
    ls -lh "$MODULE_DEBUG_DIR/static/js/" | grep "main"
else
    echo "✗ Module Select debug bundle not found"
fi

echo ""
echo "[4/4] Setup complete!"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  HOW TO USE DEBUG BUILDS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "Option 1: URL parameter"
echo "  Navigate to: /app/imogi-cashier?debug=1"
echo "  - Loader will detect ?debug=1 flag"
echo "  - Will load non-minified bundle from -debug folder"
echo "  - DevTools will show real function names"
echo ""
echo "Option 2: localStorage flag"
echo "  Run in DevTools Console:"
echo "  localStorage.setItem('imogi_debug', 'true')"
echo "  location.reload()"
echo ""
echo "Option 3: Developer mode"
echo "  If frappe developer_mode is enabled, debug build auto-loads"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  VERIFICATION"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "After enabling debug mode:"
echo ""
echo "1. Open DevTools (F12)"
echo "2. Go to Console tab"
echo "3. Look for: '[IMOGI Loader] Using non-minified debug bundle...'"
echo ""
echo "4. Go to Sources tab"
echo "5. Expand: top → imogi_pos/react/..."
echo "6. Should see actual .js/.jsx source files, not minified"
echo ""
echo "7. If error occurs, stack trace will show:"
echo "   BEFORE (minified): useImogiPOS (at Sx:123)"
echo "   AFTER (debug):     useImogiPOS (at ImogiPOSProvider.jsx:50)"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  IMPORTANT: Restart Frappe to deploy debug builds"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "cd ~/frappe-bench && bench restart"
echo ""
