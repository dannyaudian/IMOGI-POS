#!/bin/bash
# Route Transition Verification Script
# Tests navigation lock implementation and loading states

echo "🔍 Route Transition Fix - Verification Script"
echo "=============================================="
echo ""

# Check if files exist
echo "📁 Checking modified files..."
FILES=(
  "src/apps/module-select/App.jsx"
  "src/apps/module-select/components/ModuleCard.jsx"
  "src/apps/module-select/styles.css"
  "src/shared/utils/deskNavigate.js"
  "imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file NOT FOUND"
    exit 1
  fi
done

echo ""
echo "🔎 Checking for navigation lock implementation..."

# Check React component for navigationLock state
if grep -q "navigationLock.*useState" src/apps/module-select/App.jsx; then
  echo "  ✅ navigationLock state found in App.jsx"
else
  echo "  ❌ navigationLock state NOT found in App.jsx"
  exit 1
fi

# Check for global lock in deskNavigate
if grep -q "__imogiNavigationLock" src/shared/utils/deskNavigate.js; then
  echo "  ✅ Global __imogiNavigationLock found in deskNavigate.js"
else
  echo "  ❌ Global __imogiNavigationLock NOT found"
  exit 1
fi

# Check for lock guard in module-select Desk page
if grep -q "__imogiNavigationLock" imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js; then
  echo "  ✅ Navigation lock check in module_select.js on_page_show"
else
  echo "  ❌ Navigation lock check NOT found in Desk page"
  exit 1
fi

echo ""
echo "🎨 Checking for loading state implementation..."

# Check ModuleCard for loading props
if grep -q "isNavigating.*isLoading" src/apps/module-select/components/ModuleCard.jsx; then
  echo "  ✅ Loading props found in ModuleCard.jsx"
else
  echo "  ❌ Loading props NOT found in ModuleCard"
  exit 1
fi

# Check for loading spinner CSS
if grep -q "loading-spinner" src/apps/module-select/styles.css; then
  echo "  ✅ Loading spinner CSS found"
else
  echo "  ❌ Loading spinner CSS NOT found"
  exit 1
fi

# Check for module-navigating class
if grep -q "module-navigating" src/apps/module-select/styles.css; then
  echo "  ✅ .module-navigating CSS found"
else
  echo "  ❌ .module-navigating CSS NOT found"
  exit 1
fi

echo ""
echo "📝 Checking for enhanced logging..."

# Check for emoji markers in logs
if grep -q "🔒.*NAVIGATION LOCK" src/apps/module-select/App.jsx; then
  echo "  ✅ Navigation lock logging with emoji found"
else
  echo "  ❌ Enhanced navigation logging NOT found"
  exit 1
fi

if grep -q "⚙️.*CONTEXT SET" src/apps/module-select/App.jsx; then
  echo "  ✅ Context setting logging with emoji found"
else
  echo "  ❌ Enhanced context logging NOT found"
  exit 1
fi

if grep -q "🚀.*ROUTE TRANSITION" src/apps/module-select/App.jsx; then
  echo "  ✅ Route transition logging with emoji found"
else
  echo "  ❌ Enhanced route logging NOT found"
  exit 1
fi

echo ""
echo "🔧 Checking for duplicate prevention..."

# Check for lock check in handleModuleClick
if grep -A 5 "handleModuleClick.*module" src/apps/module-select/App.jsx | grep -q "if.*navigationLock"; then
  echo "  ✅ Duplicate click prevention in handleModuleClick"
else
  echo "  ❌ No duplicate click check found"
  exit 1
fi

# Check for lock check in deskNavigate
if grep -q "if.*__imogiNavigationLock" src/shared/utils/deskNavigate.js; then
  echo "  ✅ Duplicate navigation prevention in deskNavigate"
else
  echo "  ❌ No duplicate navigation check found"
  exit 1
fi

echo ""
echo "✨ All checks passed!"
echo ""
echo "📊 Summary of Changes:"
echo "  • Navigation lock (React state + global window property)"
echo "  • Loading state (isNavigating + isLoading props)"
echo "  • Loading spinner (CSS animation)"
echo "  • Duplicate click prevention"
echo "  • Premature remount prevention (Desk page guard)"
echo "  • Enhanced debug logging (emoji markers)"
echo ""
echo "🚀 Next Steps:"
echo "  1. Build module-select: npm run build:module-select"
echo "  2. Clear browser cache (Cmd+Shift+R)"
echo "  3. Test single-click navigation"
echo "  4. Test rapid-click prevention"
echo "  5. Check console for emoji markers (🔒, 🚀, ⚙️, ✅, ⛔)"
echo ""
echo "📖 Documentation: ROUTE_TRANSITION_FIX.md"
