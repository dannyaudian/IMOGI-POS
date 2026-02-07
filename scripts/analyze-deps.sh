#!/bin/bash

# IMOGI POS - Detailed Dependency Analysis
# Menggunakan madge untuk circular deps + grep untuk TDZ violations

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  IMOGI POS - CIRCULAR DEPENDENCY & TDZ VIOLATION ANALYSIS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

ENTRY="src/apps/cashier-console/main.jsx"

# Step 1: Madge analysis
echo "[1/4] Running madge for detailed circular dependency analysis..."
echo ""
npx madge "$ENTRY" --json 2>/dev/null | jq . > /tmp/madge-output.json

echo "[2/4] Analyzing dependency tree..."
echo ""

# Count files
FILE_COUNT=$(find src/apps/cashier-console -type f \( -name "*.js" -o -name "*.jsx" \) | wc -l)
echo "  ✓ Files found: $FILE_COUNT"

# Step 2: Check for top-level side effects in providers
echo ""
echo "[3/4] Scanning for top-level side effects (potential TDZ issues)..."
echo ""

# Look for exports that might be used at module load time
echo "  Checking for problematic export patterns:"
echo "  - export const (used at module level)"
echo "  - export hooks called at top-level"
echo "  - side effects in .jsx contexts"
echo ""

# Find suspicious patterns
echo "  Files with potential issues:"
grep -r "^export const\|^export function\|^export default" \
  src/apps/cashier-console/ src/shared/ \
  --include="*.jsx" --include="*.js" \
  2>/dev/null | head -20

echo ""
echo "[4/4] Checking actual imports at entry point..."
echo ""

# Trace imports from main.jsx
echo "  main.jsx imports:"
grep "^import" src/apps/cashier-console/main.jsx | sed 's/^/    /'

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  ANALYSIS RESULTS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Check if madge found cycles
if npx madge "$ENTRY" --circular 2>&1 | grep -q "circular dependency found"; then
  echo "⚠️  CIRCULAR DEPENDENCIES: FOUND"
  echo ""
  npx madge "$ENTRY" --circular 2>&1
else
  echo "✅ CIRCULAR DEPENDENCIES: None detected by madge"
  echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  RECOMMENDED CHECKS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "1. Check browser console for actual stack trace (readable sourcemap)"
echo "2. Look for double React instance: window.React in console"
echo "3. Check if module loads multiple times: console.log in top-level"
echo "4. Verify context providers are only instantiated once"
echo "5. Check for side effects in: "
echo "   - Hooks called at module top level"
echo "   - API calls triggered by import"
echo "   - CSS/styling that references undefined variables"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
