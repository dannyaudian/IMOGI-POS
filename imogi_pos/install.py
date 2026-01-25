"""
Installation hooks for IMOGI POS.

This file runs after app installation or migration to ensure
React apps are properly built for production.
"""

import os
import subprocess
import frappe
from frappe import _


def after_install():
    """
    Run after app installation.
    
    This ensures React apps are built when installing app
    for the first time on a new site.
    """
    frappe.logger().info("Running IMOGI POS after_install hook...")
    build_react_apps()


def after_migrate():
    """
    Run after bench migrate.
    
    This ensures React apps are rebuilt after pulling updates
    and running migrations.
    """
    # Only build on production/staging, skip on development
    if frappe.conf.get('developer_mode'):
        frappe.logger().info("Developer mode: Skipping React build")
        return
    
    frappe.logger().info("Running IMOGI POS after_migrate hook...")
    build_react_apps()


def build_react_apps():
    """
    Build all React apps using npm run build:all.
    
    This function:
    1. Installs npm dependencies (production only)
    2. Builds all React apps using Vite
    3. Logs success or errors
    
    Called by:
    - after_install(): First time app installation
    - after_migrate(): After running migrations (production only)
    """
    try:
        app_path = frappe.get_app_path('imogi_pos')
        parent_path = os.path.dirname(app_path)
        
        frappe.logger().info(f"Building React apps in: {parent_path}")
        
        # Check if node_modules exists
        node_modules = os.path.join(parent_path, 'node_modules')
        if not os.path.exists(node_modules):
            frappe.logger().info("node_modules not found, installing npm packages...")
            
            # Install npm packages (production only)
            result = subprocess.run(
                ['npm', 'install', '--production'],
                cwd=parent_path,
                check=True,
                capture_output=True,
                text=True
            )
            frappe.logger().info(f"npm install output: {result.stdout}")
        
        # Build all React apps
        frappe.logger().info("Building all React apps...")
        result = subprocess.run(
            ['npm', 'run', 'build:all'],
            cwd=parent_path,
            check=True,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        frappe.logger().info(f"React build output: {result.stdout}")
        frappe.logger().info("✅ React apps built successfully!")
        
        # Verify builds
        verify_builds(parent_path)
        
    except subprocess.TimeoutExpired:
        error_msg = "React build timed out after 5 minutes"
        frappe.log_error(error_msg, "React Build Timeout")
        frappe.logger().error(f"❌ {error_msg}")
        
    except subprocess.CalledProcessError as e:
        error_msg = f"Failed to build React apps: {e.stderr}"
        frappe.log_error(error_msg, "React Build Error")
        frappe.logger().error(f"❌ {error_msg}")
        
    except Exception as e:
        error_msg = f"Unexpected error building React apps: {str(e)}"
        frappe.log_error(error_msg, "React Build Error")
        frappe.logger().error(f"❌ {error_msg}")


def verify_builds(app_path):
    """
    Verify that React bundles were built successfully.
    
    Args:
        app_path (str): Path to app directory
    """
    react_apps = [
        'customer-display-editor',
        'table-layout-editor',
        'cashier-console',
        'kitchen',
        'waiter',
        'kiosk',
        'self-order',
        'customer-display',
        'table-display'
    ]
    
    missing_builds = []
    
    for app in react_apps:
        manifest_path = os.path.join(
            app_path,
            'imogi_pos',
            'public',
            'react',
            app,
            '.vite',
            'manifest.json'
        )
        
        if not os.path.exists(manifest_path):
            missing_builds.append(app)
            frappe.logger().warning(f"⚠️ Build missing for: {app}")
    
    if missing_builds:
        frappe.logger().warning(
            f"Some React apps were not built: {', '.join(missing_builds)}"
        )
    else:
        frappe.logger().info(f"✅ All {len(react_apps)} React apps verified")
