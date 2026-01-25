#!/usr/bin/env python3
"""
Validate that www/ pages have proper authorization imports.

This script ensures that:
1. Pages using @require_roles have the proper import
2. Pages using @allow_guest_if_configured have the proper import
3. Pages accessing branch have get_active_branch import
"""

import os
import re
import sys

def check_file(filepath):
    """Check a single Python file for authorization imports."""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return False
    
    errors = []
    
    # Check if file uses @require_roles decorator
    if '@require_roles' in content:
        if 'from imogi_pos.utils.auth_decorators import require_roles' not in content:
            errors.append(f"  ❌ Uses @require_roles but missing import")
    
    # Check if file uses @allow_guest_if_configured decorator
    if '@allow_guest_if_configured' in content:
        if 'from imogi_pos.utils.auth_decorators import allow_guest_if_configured' not in content:
            errors.append(f"  ❌ Uses @allow_guest_if_configured but missing import")
    
    # Check if file accesses branch and uses get_active_branch
    if 'get_active_branch' in content and 'frappe.cache()' in content:
        if 'from imogi_pos.utils.auth_helpers import get_active_branch' not in content:
            errors.append(f"  ❌ Calls get_active_branch() but missing import")
    
    # Check for anti-patterns
    if 'frappe.get_roles()' in content:
        errors.append(f"  ❌ Uses inline frappe.get_roles() - use @require_roles decorator instead")
    
    if 'frappe.cache().hget("imogi_pos_branch"' in content:
        errors.append(f"  ❌ Uses direct cache access - use get_active_branch() instead")
    
    if errors:
        print(f"⚠️  {filepath}")
        for error in errors:
            print(error)
        return False
    
    return True

def main():
    """Main entry point."""
    www_dir = 'imogi_pos/www'
    
    if not os.path.isdir(www_dir):
        print(f"✅ Directory {www_dir} not found, skipping validation")
        return 0
    
    errors_found = False
    
    for root, dirs, files in os.walk(www_dir):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                if not check_file(filepath):
                    errors_found = True
    
    if errors_found:
        print("\n❌ Authorization import validation failed")
        print("Please fix the issues above")
        return 1
    else:
        print("✅ All authorization imports are correct")
        return 0

if __name__ == '__main__':
    sys.exit(main())
