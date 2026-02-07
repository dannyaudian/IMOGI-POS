#!/bin/bash

# IMOGI POS - Build & Debug TDZ Issues
# This script builds the cashier-console with sourcemaps for readable stack traces

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  IMOGI POS - BUILD WITH SOURCEMAPS FOR TDZ DEBUGGING"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Check environment
echo "[1/4] Checking environment..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js first."
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ npm not found. Please install npm first."
  exit 1
fi

NODE_VERSION=$(node -v)
npm_VERSION=$(npm -v)
echo "     Node.js: $NODE_VERSION"
echo "     npm: $npm_VERSION"
echo ""

# Clean build
echo "[2/4] Cleaning previous build..."
rm -rf imogi_pos/public/react/cashier-console
echo "     ✓ Cleaned"
echo ""

# Build with sourcemaps
echo "[3/4] Building cashier-console with sourcemaps..."
echo "     This will enable readable error stack traces"
echo ""

# Set environment for building cashier-console
export VITE_APP=cashier-console

# Run build - Vite will auto-generate sourcemaps when building
npm run build 2>&1 | tee /tmp/build-output.log

echo ""
echo "[4/4] Build completed!"
echo ""

# Check sourcemap files
SOURCEMAP_COUNT=$(find imogi_pos/public/react/cashier-console -name "*.map" 2>/dev/null | wc -l)
JS_COUNT=$(find imogi_pos/public/react/cashier-console -name "*.js" 2>/dev/null | wc -l)

echo "═══════════════════════════════════════════════════════════════════════"
echo "  BUILD RESULTS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "JavaScript files: $JS_COUNT"
echo "Sourcemap files:  $SOURCEMAP_COUNT"
echo ""

if [ "$SOURCEMAP_COUNT" -eq 0 ]; then
  echo "⚠️  No sourcemaps found. Sourcemaps may be disabled in vite.config.js"
  echo ""
  echo "To enable sourcemaps, check vite.config.js and ensure:"
  echo "  build: {"
  echo "    sourcemap: true,"
  echo "    ..."
  echo "  }"
  echo ""
fi

echo "═══════════════════════════════════════════════════════════════════════"
echo "  NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "1. Restart Frappe bench:"
echo "   cd ~/frappe-bench && bench restart"
echo ""
echo "2. Open cashier-console in browser"
echo ""
echo "3. If error still occurs, check browser console for:"
echo "   - Readable function names (instead of minified Sx, Fu, etc.)"
echo "   - Look for patterns like 'useImogiPOS', 'useOperationalContext'"
echo "   - Copy full error to DEBUG_TDZ_ANALYSIS.md"
echo ""
echo "4. Enable DEBUG mode:"
echo "   localStorage.setItem('imogi_debug', 'true')"
echo "   location.reload()"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
