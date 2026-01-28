#!/bin/bash
# Script untuk mengaktifkan React version untuk semua 4 app baru
# Run this script to migrate from legacy HTML to React

set -e

echo "🚀 IMOGI POS - Aktivasi React Apps"
echo "=================================="
echo ""

# Function to backup and activate
activate_react() {
    local app_path=$1
    local app_name=$2
    
    echo "📦 Migrating $app_name..."
    
    # Backup legacy files
    if [ -f "$app_path/index.html" ]; then
        mv "$app_path/index.html" "$app_path/index.html.legacy"
        echo "  ✓ Backed up index.html → index.html.legacy"
    fi
    
    if [ -f "$app_path/index.py" ]; then
        mv "$app_path/index.py" "$app_path/index.py.legacy"
        echo "  ✓ Backed up index.py → index.py.legacy"
    fi
    
    # Activate React version
    if [ -f "$app_path/react.html" ]; then
        mv "$app_path/react.html" "$app_path/index.html"
        echo "  ✓ Activated react.html → index.html"
    fi
    
    if [ -f "$app_path/react.py" ]; then
        mv "$app_path/react.py" "$app_path/index.py"
        echo "  ✓ Activated react.py → index.py"
    fi
    
    echo "  ✅ $app_name migration complete!"
    echo ""
}

# Change to project root
cd "$(dirname "$0")"
cd imogi_pos/www

# Activate all React apps
activate_react "shared/service-select" "Service Select"
activate_react "shared/device-select" "Device Select"
activate_react "opening-balance" "Opening Balance"

echo "================================================"
echo "✅ All React apps activated successfully!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Restart bench: bench restart"
echo "2. Clear cache: bench clear-cache"
echo "3. Test apps:"
echo "   - http://your-site.com/login  # Frappe built-in (Desk Pages)"
echo "   - http://your-site.com/service-select"
echo "   - http://your-site.com/device-select"
echo "   - http://your-site.com/opening-balance"
echo ""
echo "To rollback, run: ./scripts/rollback-react-apps.sh"
