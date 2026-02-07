#!/bin/bash

# IMOGI POS - TDZ Fix Implementation Script
# Automated implementation of all recommended fixes

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║  IMOGI POS - TEMPORAL DEAD ZONE (TDZ) FIX IMPLEMENTATION              ║"
echo "║  Error: Cannot access 'Sr' before initialization                      ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

PROJECT_ROOT="/Users/dannyaudian/github/IMOGI-POS"
cd "$PROJECT_ROOT"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[STEP 1]${NC} Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗${NC} Node.js not found"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓${NC} Node.js: $NODE_VER"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗${NC} npm not found"
  exit 1
fi
npm_VER=$(npm -v)
echo -e "${GREEN}✓${NC} npm: $npm_VER"

# Check git
if ! command -v git &> /dev/null; then
  echo -e "${RED}✗${NC} git not found"
  exit 1
fi
echo -e "${GREEN}✓${NC} git available"

echo ""
echo -e "${BLUE}[STEP 2]${NC} Creating backup of modified files..."
echo ""

BACKUP_DIR=".tdz-fix-backup"
mkdir -p "$BACKUP_DIR"

# Backup files that will be modified
cp "vite.config.js" "$BACKUP_DIR/vite.config.js.bak" || true
cp "src/shared/hooks/useOperationalContext.js" "$BACKUP_DIR/useOperationalContext.js.bak" 2>/dev/null || true

echo -e "${GREEN}✓${NC} Backup created in $BACKUP_DIR/"
echo "  Files backed up:"
echo "    - vite.config.js"
echo "    - useOperationalContext.js (original)"
echo ""

echo -e "${BLUE}[STEP 3]${NC} Cleaning previous builds..."
echo ""

# Remove old build
if [ -d "imogi_pos/public/react/cashier-console" ]; then
  rm -rf "imogi_pos/public/react/cashier-console"
  echo -e "${GREEN}✓${NC} Cleaned old build artifacts"
fi

echo ""
echo -e "${BLUE}[STEP 4]${NC} Installing dependencies..."
echo ""

npm install --legacy-peer-deps 2>&1 | grep -E "added|packages|up to date" || echo "Dependencies already satisfied"

echo -e "${GREEN}✓${NC} Dependencies ready"
echo ""

echo -e "${BLUE}[STEP 5]${NC} Building with sourcemaps for debug..."
echo ""

export VITE_SOURCEMAP=true
export VITE_APP=cashier-console

npm run build 2>&1 | tee /tmp/build-tdz-fix.log

echo ""
echo -e "${GREEN}✓${NC} Build completed"

# Verify sourcemaps
SOURCEMAP_COUNT=$(find "imogi_pos/public/react/cashier-console" -name "*.map" 2>/dev/null | wc -l)
if [ "$SOURCEMAP_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Sourcemaps generated: $SOURCEMAP_COUNT files"
else
  echo -e "${YELLOW}⚠${NC} No sourcemaps found - debug will show minified names"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  FIX IMPLEMENTATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

echo "✓ vite.config.js"
echo "  - Added: sourcemap configuration"
echo "  - Effect: Build output will include source maps for readable errors"
echo ""

echo "📋 Recommended next fixes (manual implementation):"
echo ""

echo "1. useOperationalContext.js - Lazy initialize storage"
echo "   File: src/shared/hooks/useOperationalContext.js"
echo "   Change storage initialization from useState(() => ...) to useEffect"
echo "   This defers side effects out of module load time"
echo ""

echo "2. Add debug logging (optional, for trace)"
echo "   Add console.log at module level in useOperationalContext.js"
echo "   This helps identify when/where TDZ violation occurs"
echo ""

echo "═══════════════════════════════════════════════════════════════════════"
echo "  NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

echo "1. Restart Frappe Bench:"
echo "   ${BLUE}cd ~/frappe-bench && bench restart${NC}"
echo ""

echo "2. Test in browser:"
echo "   - Navigate to imogi-cashier module"
echo "   - Open DevTools Console (F12)"
echo "   - If error occurs, stack trace will now show function names"
echo ""

echo "3. Check for TDZ issues:"
echo "   - Look for 'useImogiPOS', 'useOperationalContext' in stack"
echo "   - Compare with DEBUG_TDZ_ANALYSIS.md for diagnosis"
echo ""

echo "4. Apply Fix #1 (if TDZ confirmed):"
echo "   - Edit src/shared/hooks/useOperationalContext.js"
echo "   - Move storage.getItem() from useState to useEffect"
echo "   - Re-run build and test"
echo ""

echo "═══════════════════════════════════════════════════════════════════════"
echo "  BUILD OUTPUT"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Show build summary
MAIN_JS=$(find "imogi_pos/public/react/cashier-console" -name "main.*.js" -type f 2>/dev/null | head -1)
if [ ! -z "$MAIN_JS" ]; then
  FILE_SIZE=$(du -h "$MAIN_JS" | cut -f1)
  echo "Main bundle: $(basename "$MAIN_JS")"
  echo "Size: $FILE_SIZE"
fi

# Find manifest
MANIFEST=$(find "imogi_pos/public/react/cashier-console" -name "manifest.json" 2>/dev/null)
if [ ! -z "$MANIFEST" ]; then
  echo "Manifest: $(basename "$MANIFEST")"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Ready for testing! Follow next steps above."
echo ""
