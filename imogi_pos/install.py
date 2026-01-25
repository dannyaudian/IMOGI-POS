"""
Installation hooks for IMOGI POS.

⚠️ IMPORTANT FOR FRAPPE CLOUD:
This file is designed for self-hosted installations.

For Frappe Cloud deployment, use GitHub Actions to pre-build React apps
and commit them to the repository. See .github/workflows/build-react.yml

Frappe Cloud will then deploy the pre-built bundles directly.
"""

import os
import frappe
from frappe import _


def after_install():
    """
    Run after app installation.
    
    ⚠️ FRAPPE CLOUD: This hook may timeout. Use pre-built bundles instead.
    """
    if is_frappe_cloud():
        frappe.logger().info("Frappe Cloud detected: Skipping React build (use pre-built bundles)")
        verify_prebuilt_bundles()
        return
    
    frappe.logger().info("Running IMOGI POS after_install hook...")
    # For self-hosted only
    frappe.logger().info("For React apps, run: npm run build:all")


def after_migrate():
    """
    Run after bench migrate.
    
    ⚠️ FRAPPE CLOUD: This hook may timeout. Use pre-built bundles instead.
    """
    if is_frappe_cloud():
        frappe.logger().info("Frappe Cloud detected: Verifying pre-built React bundles")
        verify_prebuilt_bundles()
        return
    
    # Skip in developer mode
    if frappe.conf.get('developer_mode'):
        frappe.logger().info("Developer mode: Skipping React build")
        return
    
    frappe.logger().info("For React apps, run: npm run build:all")


def is_frappe_cloud():
    """
    Detect if running on Frappe Cloud.
    
    Returns:
        bool: True if Frappe Cloud environment
    """
    # Check common Frappe Cloud indicators
    if os.environ.get('FRAPPE_CLOUD'):
        return True
    
    if os.path.exists('/home/frappe/frappe-bench/sites/.frappe-cloud'):
        return True
    
    # Check if hostname contains frappe.cloud
    hostname = os.environ.get('HOSTNAME', '')
    if 'frappe.cloud' in hostname or 'fc-' in hostname:
        return True
    
    return False


def verify_prebuilt_bundles():
    """
    Verify that pre-built React bundles exist in the repository.
    
    This is critical for Frappe Cloud deployment where npm build
    cannot run during installation.
    """
    app_path = frappe.get_app_path('imogi_pos')
    
    react_apps = [
        'customer-display-editor',
        'table-layout-editor',
        # Add more as you migrate them
        # 'cashier-console',
        # 'kitchen',
        # 'waiter',
        # 'kiosk',
        # 'self-order',
        # 'customer-display',
        # 'table-display'
    ]
    
    missing_builds = []
    
    for app in react_apps:
        manifest_path = os.path.join(
            app_path,
            'public',
            'react',
            app,
            '.vite',
            'manifest.json'
        )
        
        if not os.path.exists(manifest_path):
            missing_builds.append(app)
            frappe.logger().warning(f"⚠️ Pre-built bundle missing for: {app}")
        else:
            frappe.logger().info(f"✅ Found pre-built bundle for: {app}")
    
    if missing_builds:
        error_msg = (
            f"Missing pre-built React bundles: {', '.join(missing_builds)}\n\n"
            f"For Frappe Cloud deployment:\n"
            f"1. Build locally: npm run build:all\n"
            f"2. Commit bundles: git add imogi_pos/public/react/\n"
            f"3. Push to repo: git push\n\n"
            f"Or use GitHub Actions (recommended):\n"
            f"See .github/workflows/build-react.yml"
        )
        frappe.log_error(error_msg, "Missing React Bundles")
        frappe.logger().error(f"❌ {error_msg}")
    else:
        frappe.logger().info(f"✅ All {len(react_apps)} React apps verified")

