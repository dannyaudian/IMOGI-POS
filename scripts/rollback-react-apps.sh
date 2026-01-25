#!/bin/bash
# Script untuk rollback dari React ke legacy HTML
# Run this script jika ada masalah dengan React version

set -e

echo "⏪ IMOGI POS - Rollback ke Legacy HTML"
echo "======================================"
echo ""

# Function to rollback
rollback_react() {
    local app_path=$1
    local app_name=$2
    
    echo "📦 Rolling back $app_name..."
    
    # Restore legacy files
    if [ -f "$app_path/index.html" ]; then
        mv "$app_path/index.html" "$app_path/react.html"
        echo "  ✓ Moved index.html → react.html"
    fi
    
    if [ -f "$app_path/index.py" ]; then
        mv "$app_path/index.py" "$app_path/react.py"
        echo "  ✓ Moved index.py → react.py"
    fi
    
    if [ -f "$app_path/index.html.legacy" ]; then
        mv "$app_path/index.html.legacy" "$app_path/index.html"
        echo "  ✓ Restored index.html.legacy → index.html"
    fi
    
    if [ -f "$app_path/index.py.legacy" ]; then
        mv "$app_path/index.py.legacy" "$app_path/index.py"
        echo "  ✓ Restored index.py.legacy → index.py"
    fi
    
    echo "  ✅ $app_name rollback complete!"
    echo ""
}

# Change to project root
cd "$(dirname "$0")"
cd imogi_pos/www

# Rollback all 4 React apps
rollback_react "shared/login" "Login"
rollback_react "shared/service-select" "Service Select"
rollback_react "shared/device-select" "Device Select"
rollback_react "opening-balance" "Opening Balance"

echo "================================================"
echo "✅ All apps rolled back to legacy HTML!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Restart bench: bench restart"
echo "2. Clear cache: bench clear-cache"
echo ""
echo "To re-activate React, run: ./scripts/activate-react-apps.sh"
