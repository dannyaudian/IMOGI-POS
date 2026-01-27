"""Helper functions for React app integration with Frappe."""

import json
import os
import frappe
from frappe import _


def get_react_bundle_urls(app_name):
    """
    Load React bundle URLs from Vite manifest.json
    
    Args:
        app_name (str): Name of the React app (e.g., 'customer-display-editor')
    
    Returns:
        dict: Dictionary with 'js' and 'css' URLs
        
    Example:
        >>> urls = get_react_bundle_urls('customer-display-editor')
        >>> urls['js']  # '/assets/imogi_pos/public/react/customer-display-editor/static/js/main.abc123.js'
        >>> urls['css']  # '/assets/imogi_pos/public/react/customer-display-editor/static/css/main.xyz456.css'
    """
    try:
        # Path to manifest.json
        site_path = frappe.get_site_path()
        manifest_path = os.path.join(
            site_path,
            'public',
            'files',
            'imogi_pos',
            'public',
            'react',
            app_name,
            '.vite',
            'manifest.json'
        )
        
        # Also try alternate path (in case of different structure)
        if not os.path.exists(manifest_path):
            manifest_path = os.path.join(
                frappe.get_app_path('imogi_pos'),
                'public',
                'react',
                app_name,
                '.vite',
                'manifest.json'
            )
        
        if not os.path.exists(manifest_path):
            frappe.log_error(
                f"React manifest not found for app '{app_name}' at {manifest_path}",
                "React Bundle Error"
            )
            return get_fallback_urls(app_name)
        
        # Read manifest
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        # Get entry point (usually main.jsx)
        entry_key = f'src/apps/{app_name}/main.jsx'
        if entry_key not in manifest:
            frappe.log_error(
                f"Entry point '{entry_key}' not found in manifest for app '{app_name}'",
                "React Bundle Error"
            )
            return get_fallback_urls(app_name)
        
        entry = manifest[entry_key]
        
        # Build URLs
        base_url = f'/assets/imogi_pos/react/{app_name}'
        
        urls = {
            'js': f"{base_url}/{entry['file']}",
            'css': None
        }
        
        # Add CSS if available
        if 'css' in entry and entry['css']:
            urls['css'] = f"{base_url}/{entry['css'][0]}"
        
        return urls
        
    except Exception as e:
        frappe.log_error(
            f"Error loading React manifest for '{app_name}': {str(e)}",
            "React Bundle Error"
        )
        return get_fallback_urls(app_name)


def get_fallback_urls(app_name):
    """
    Return fallback URLs when manifest cannot be loaded.
    This will trigger a rebuild message.
    
    Args:
        app_name (str): Name of the React app
    
    Returns:
        dict: Dictionary with error flag
    """
    return {
        'js': None,
        'css': None,
        'error': _('React bundle not found. Please rebuild the app.')
    }


def add_react_context(context, app_name, additional_state=None):
    """
    Add React bundle URLs and initial state to context.
    Also adds session/defaults data needed by react_app.html template.
    
    Args:
        context (dict): Frappe context object
        app_name (str): Name of the React app
        additional_state (dict): Additional state to pass to React app
    
    Example:
        >>> context = {}
        >>> add_react_context(context, 'customer-display-editor', {
        ...     'posProfile': 'Main POS',
        ...     'branch': 'Main Branch'
        ... })
    """
    # Store app name for error messages
    context.react_app_name = app_name
    
    # Get bundle URLs from manifest
    bundle_urls = get_react_bundle_urls(app_name)
    context.react_bundle_js = bundle_urls.get('js')
    context.react_bundle_css = bundle_urls.get('css')
    context.react_bundle_error = bundle_urls.get('error')
    
    # Add session data for react_app.html template (avoid Jinja sandbox errors)
    context.csrf_token = frappe.session.csrf_token
    context.session_user = frappe.session.user
    context.session_user_fullname = frappe.session.user_fullname or frappe.session.user
    context.default_company = frappe.db.get_single_value("Global Defaults", "default_company") or ""
    context.user_roles = frappe.get_roles()
    
    # Build initial state for React
    initial_state = {
        'csrfToken': frappe.session.csrf_token,
        'user': {
            'name': frappe.session.user,
            'full_name': frappe.session.data.get('full_name') or frappe.session.user
        }
    }
    
    # Add additional state
    if additional_state:
        initial_state.update(additional_state)
    
    context.react_initial_state = json.dumps(initial_state)
    
    return context
