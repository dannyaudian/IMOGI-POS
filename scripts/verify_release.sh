#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

header() {
  echo
  echo "=== $1 ==="
}

require_file() {
  local path="$1"
  if [[ -f "$ROOT_DIR/$path" ]]; then
    echo "  ✅ $path"
  else
    echo "  ❌ $path NOT FOUND"
    exit 1
  fi
}

check_react_loader() {
  header "React Loader - File System Validation"

  if [[ -f "$ROOT_DIR/imogi_pos/public/js/imogi_loader.js" ]]; then
    echo "✅ imogi_loader.js exists"
  else
    echo "❌ imogi_loader.js NOT FOUND"
    exit 1
  fi

  if grep -q "imogi_loader.js" "$ROOT_DIR/imogi_pos/hooks.py"; then
    echo "✅ imogi_loader.js registered in hooks.py"
  else
    echo "❌ imogi_loader.js NOT registered in hooks.py"
    exit 1
  fi

  echo
  echo "Checking page loaders for window.loadImogiReactApp usage..."
  local pages=(
    "imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js"
    "imogi_pos/imogi_pos/page/imogi_cashier/imogi_cashier.js"
    "imogi_pos/imogi_pos/page/imogi_waiter/imogi_waiter.js"
    "imogi_pos/imogi_pos/page/imogi_kitchen/imogi_kitchen.js"
    "imogi_pos/imogi_pos/page/imogi_displays/imogi_displays.js"
  )

  local all_updated=true
  for page in "${pages[@]}"; do
    if grep -q "window.loadImogiReactApp" "$ROOT_DIR/$page"; then
      echo "✅ $(basename "$(dirname "$page")")"
    else
      echo "❌ $(basename "$(dirname "$page")") - NOT using shared loader"
      all_updated=false
    fi
  done

  if [[ "$all_updated" == true ]]; then
    echo "✅ All page loaders updated successfully!"
  else
    echo "❌ Some page loaders not updated"
    exit 1
  fi

  echo
  echo "Checking for old injection patterns..."
  local old_patterns_found=false
  for page in "${pages[@]}"; do
    if grep -q "setInterval.*Mount" "$ROOT_DIR/$page" && ! grep -q "window.loadImogiReactApp" "$ROOT_DIR/$page"; then
      echo "⚠️  Old pattern found in $(basename "$(dirname "$page")")"
      old_patterns_found=true
    fi
  done

  if [[ "$old_patterns_found" == true ]]; then
    echo "⚠️  Some old injection patterns still exist"
  else
    echo "✅ No old injection patterns detected"
  fi

  local loader_lines
  loader_lines=$(wc -l < "$ROOT_DIR/imogi_pos/public/js/imogi_loader.js" | tr -d ' ')
  echo
  echo "📊 Loader size: $loader_lines lines"
}

check_module_select_fix() {
  header "Module Select Double-Mount Verification"

  if [[ -d "$ROOT_DIR/imogi_pos/www/shared/module-select" ]]; then
    echo "❌ Legacy WWW route still exists at imogi_pos/www/shared/module-select/"
    exit 1
  else
    echo "✅ Legacy WWW route deleted"
  fi

  local desk_page_dir="imogi_pos/imogi_pos/page/imogi_module_select"
  require_file "$desk_page_dir/imogi_module_select.js"
  require_file "$desk_page_dir/imogi_module_select.json"

  if grep -q "includes('/assets/imogi_pos/react/module-select/')" "$ROOT_DIR/$desk_page_dir/imogi_module_select.js"; then
    echo "✅ Script guard validates exact src path"
  else
    echo "❌ Script guard missing src validation"
    exit 1
  fi

  local main_jsx="src/apps/module-select/main.jsx"
  if grep -q "__imogiModuleSelectMountVersion" "$ROOT_DIR/$main_jsx"; then
    echo "✅ Version stamp found in bundle"
  else
    echo "⚠️  Version stamp not found (optional but recommended)"
  fi

  if grep -q "Object.defineProperty(window, 'imogiModuleSelectMount'" "$ROOT_DIR/$main_jsx"; then
    echo "✅ Mount function locked with Object.defineProperty"
  else
    echo "❌ Mount function not locked (writable: false missing)"
    exit 1
  fi

  if grep -q "window.__imogiModuleSelectRootKey" "$ROOT_DIR/$main_jsx"; then
    echo "✅ Root key exported for verification"
  else
    echo "⚠️  Root key not exported (recommended for debugging)"
  fi

  if grep -q '"/shared/module-select".*"/app/imogi-module-select"' "$ROOT_DIR/imogi_pos/hooks.py"; then
    echo "✅ Redirect from /shared/module-select → /app/imogi-module-select configured"
  else
    echo "⚠️  Redirect not found in hooks.py (may break old bookmarks)"
  fi

  local legacy_refs
  legacy_refs=$(rg -n "/shared/module-select" "$ROOT_DIR/src" --glob "*.jsx" --glob "*.js" | wc -l | xargs)
  if [[ "$legacy_refs" == "0" ]]; then
    echo "✅ No hardcoded /shared/module-select references in src/"
  else
    echo "⚠️  Found $legacy_refs hardcoded references to /shared/module-select in src/"
    rg -n "/shared/module-select" "$ROOT_DIR/src" --glob "*.jsx" --glob "*.js" | head -5
  fi

  local manifest="imogi_pos/public/react/module-select/.vite/manifest.json"
  if [[ -f "$ROOT_DIR/$manifest" ]]; then
    echo "✅ Build manifest exists"
    local bundle
    bundle=$(grep '"file":' "$ROOT_DIR/$manifest" | head -1 | sed 's/.*"file": "\(.*\)".*/\1/')
    local bundle_path="imogi_pos/public/react/module-select/$bundle"
    if [[ -f "$ROOT_DIR/$bundle_path" ]]; then
      local bundle_size
      bundle_size=$(du -h "$ROOT_DIR/$bundle_path" | cut -f1)
      echo "   Bundle: $bundle ($bundle_size)"
    else
      echo "⚠️  Bundle file not found: $bundle_path"
    fi
  else
    echo "❌ Build manifest not found. Run 'VITE_APP=module-select npm run build'"
    exit 1
  fi
}

check_route_transition_fix() {
  header "Route Transition Verification"

  local files=(
    "src/apps/module-select/App.jsx"
    "src/apps/module-select/components/ModuleCard.jsx"
    "src/apps/module-select/styles.css"
    "src/shared/utils/deskNavigate.js"
    "imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js"
  )

  for file in "${files[@]}"; do
    require_file "$file"
  done

  if grep -q "navigationLock.*useState" "$ROOT_DIR/src/apps/module-select/App.jsx"; then
    echo "✅ navigationLock state found in App.jsx"
  else
    echo "❌ navigationLock state NOT found in App.jsx"
    exit 1
  fi

  if grep -q "__imogiNavigationLock" "$ROOT_DIR/src/shared/utils/deskNavigate.js"; then
    echo "✅ Global __imogiNavigationLock found in deskNavigate.js"
  else
    echo "❌ Global __imogiNavigationLock NOT found"
    exit 1
  fi

  if grep -q "__imogiNavigationLock" "$ROOT_DIR/imogi_pos/imogi_pos/page/imogi_module_select/imogi_module_select.js"; then
    echo "✅ Navigation lock check in module_select.js on_page_show"
  else
    echo "❌ Navigation lock check NOT found in Desk page"
    exit 1
  fi

  if grep -q "isNavigating.*isLoading" "$ROOT_DIR/src/apps/module-select/components/ModuleCard.jsx"; then
    echo "✅ Loading props found in ModuleCard.jsx"
  else
    echo "❌ Loading props NOT found in ModuleCard"
    exit 1
  fi

  if grep -q "loading-spinner" "$ROOT_DIR/src/apps/module-select/styles.css"; then
    echo "✅ Loading spinner CSS found"
  else
    echo "❌ Loading spinner CSS NOT found"
    exit 1
  fi

  if grep -q "module-navigating" "$ROOT_DIR/src/apps/module-select/styles.css"; then
    echo "✅ .module-navigating CSS found"
  else
    echo "❌ .module-navigating CSS NOT found"
    exit 1
  fi

  if grep -q "🔒.*NAVIGATION LOCK" "$ROOT_DIR/src/apps/module-select/App.jsx"; then
    echo "✅ Navigation lock logging with emoji found"
  else
    echo "❌ Enhanced navigation logging NOT found"
    exit 1
  fi

  if grep -q "⚙️.*CONTEXT SET" "$ROOT_DIR/src/apps/module-select/App.jsx"; then
    echo "✅ Context setting logging with emoji found"
  else
    echo "❌ Enhanced context logging NOT found"
    exit 1
  fi

  if grep -q "🚀.*ROUTE TRANSITION" "$ROOT_DIR/src/apps/module-select/App.jsx"; then
    echo "✅ Route transition logging with emoji found"
  else
    echo "❌ Enhanced route logging NOT found"
    exit 1
  fi

  if rg -n "handleModuleClick.*module" "$ROOT_DIR/src/apps/module-select/App.jsx" -U | rg -n "if.*navigationLock" -q; then
    echo "✅ Duplicate click prevention in handleModuleClick"
  else
    echo "❌ No duplicate click check found"
    exit 1
  fi

  if grep -q "if.*__imogiNavigationLock" "$ROOT_DIR/src/shared/utils/deskNavigate.js"; then
    echo "✅ Duplicate navigation prevention in deskNavigate"
  else
    echo "❌ No duplicate navigation check found"
    exit 1
  fi
}

header "IMOGI POS Release Verification"
check_react_loader
check_module_select_fix
check_route_transition_fix

echo
header "Browser Checks"
cat <<'INSTRUCTIONS'
1. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)
2. Navigate through Module Select, Cashier, Waiter, Kitchen, and Displays
3. Paste scripts/browser_diagnostics.js in the console for diagnostics + loader validation
INSTRUCTIONS

echo
header "Verification Complete"
