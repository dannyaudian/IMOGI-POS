#!/usr/bin/env python3
"""
Script untuk migrasi semua www pages ke React
Otomatis update index.html dan index.py untuk menggunakan React template
"""

import os
import shutil
from pathlib import Path

# Mapping: www path -> React app name
MIGRATIONS = {
    'counter/pos': {
        'react_app': 'cashier-console',
        'title': 'Cashier Console',
        'roles': ['Cashier', 'Branch Manager', 'System Manager']
    },
    'restaurant/kitchen': {
        'react_app': 'kitchen',
        'title': 'Kitchen Display',
        'roles': ['Kitchen Staff', 'Branch Manager', 'System Manager']
    },
    'restaurant/waiter': {
        'react_app': 'waiter',
        'title': 'Waiter Console',
        'roles': ['Waiter', 'Branch Manager', 'System Manager']
    },
    'restaurant/self-order': {
        'react_app': 'kiosk',
        'title': 'Self Order Kiosk',
        'roles': []  # Public access
    },
    'restaurant/tables': {
        'react_app': 'table-display',
        'title': 'Table Display',
        'roles': ['Waiter', 'Branch Manager', 'System Manager']
    },
    'devices/displays': {
        'react_app': 'customer-display',
        'title': 'Customer Display',
        'roles': []  # Public/device access
    },
    'table_layout_editor': {
        'react_app': 'table-layout-editor',
        'title': 'Table Layout Editor',
        'roles': ['Branch Manager', 'System Manager']
    },
    'shared/device-select': {
        'react_app': 'device-select',
        'title': 'Select Device',
        'roles': ['Cashier', 'Waiter', 'Kitchen Staff', 'Branch Manager', 'System Manager']
    },
    'shared/service-select': {
        'react_app': 'service-select',
        'title': 'Select Service',
        'roles': ['Cashier', 'Branch Manager', 'System Manager']
    },
    'opening-balance': {
        'react_app': 'opening-balance',
        'title': 'Opening Balance',
        'roles': ['Cashier', 'Branch Manager', 'System Manager']
    },
}

def backup_file(filepath):
    """Backup file dengan suffix .backup"""
    if os.path.exists(filepath):
        backup_path = f"{filepath}.backup"
        shutil.copy2(filepath, backup_path)
        print(f"  ✓ Backup: {backup_path}")

def create_react_html(www_path, react_app):
    """Buat index.html yang extends react_app.html"""
    html_content = f'''{{%extends "imogi_pos/templates/includes/react_app.html" %}}

{{# 
  {www_path.replace('_', ' ').title()} - React App
  
  This page uses the reusable react_app.html template.
  All React bundle loading is handled automatically via manifest.json.
  
  No need to manually update bundle URLs after rebuild!
#}}
'''
    return html_content

def update_index_py(www_path, config):
    """Update index.py untuk add React context"""
    react_app = config['react_app']
    title = config['title']
    roles = config['roles']
    
    # Import statements
    imports = [
        "import frappe",
        "from frappe import _",
        "from imogi_pos.utils.branding import get_brand_context",
        "from imogi_pos.utils.react_helpers import add_react_context",
        "from imogi_pos.utils.error_pages import set_setup_error",
    ]
    
    if roles:
        imports.append("from imogi_pos.utils.auth_decorators import require_roles")
    
    # Decorator
    roles_str = ", ".join([f'"{r}"' for r in roles]) if roles else ''
    decorator = f'@require_roles({roles_str})' if roles else ''
    
    # Function body
    func_body = f'''def get_context(context):
    """Context builder for {title} page."""
    try:
        # Get branding info
        branding = get_brand_context()
        
        context.setup_error = False
        context.branding = branding
        context.title = _("{title}")
        
        # Add React bundle URLs and initial state (auto-loads from manifest.json)
        add_react_context(context, '{react_app}', {{
            'branding': branding
        }})

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in {www_path.replace('/', '_')} get_context: {{str(e)}}")
        set_setup_error(context, "generic", str(e), page_name=_("{title}"))
        context.title = _("{title}")
        return context
'''
    
    # Combine all parts
    py_content = '\\n'.join(imports) + '\\n\\n\\n'
    if decorator:
        py_content += decorator + '\\n'
    py_content += func_body
    
    return py_content

def migrate_page(www_path, config):
    """Migrasi satu page ke React"""
    print(f"\\nMigrating: {www_path}")
    
    base_dir = Path(__file__).parent.parent
    page_dir = base_dir / 'imogi_pos' / 'www' / www_path
    
    if not page_dir.exists():
        print(f"  ⚠ Directory not found: {page_dir}")
        return False
    
    # Backup existing files
    html_file = page_dir / 'index.html'
    py_file = page_dir / 'index.py'
    
    if html_file.exists():
        backup_file(html_file)
    if py_file.exists():
        backup_file(py_file)
    
    # Create new React-based files
    new_html = create_react_html(www_path, config['react_app'])
    new_py = update_index_py(www_path, config)
    
    # Write files
    with open(html_file, 'w') as f:
        f.write(new_html)
    print(f"  ✓ Created: index.html")
    
    with open(py_file, 'w') as f:
        f.write(new_py)
    print(f"  ✓ Created: index.py")
    
    return True

def main():
    print("=" * 60)
    print("IMOGI POS - React Migration Script")
    print("=" * 60)
    
    success_count = 0
    total_count = len(MIGRATIONS)
    
    for www_path, config in MIGRATIONS.items():
        if migrate_page(www_path, config):
            success_count += 1
    
    print("\\n" + "=" * 60)
    print(f"Migration Complete: {success_count}/{total_count} pages migrated")
    print("=" * 60)
    
    print("\\nNext steps:")
    print("1. Review the migrated files")
    print("2. Run: npm run build:all")
    print("3. Commit and push to Frappe Cloud")

if __name__ == '__main__':
    main()
