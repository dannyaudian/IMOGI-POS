"""
Customer Display Editor API
Manages configuration for customer display using Customer Display Profile
"""

import frappe
import json
from frappe import _
from frappe.utils import get_datetime


@frappe.whitelist()
def get_available_devices():
    """
    Get list of all Customer Display Profiles
    
    Returns:
        dict: List of profiles with name, branch, status
    """
    if not frappe.has_permission('Customer Display Profile', 'read'):
        frappe.throw(_('No permission to read Customer Display Profile'))
    
    profiles = frappe.get_all(
        'Customer Display Profile',
        filters={'is_active': 1},
        fields=['name', 'profile_name', 'branch', 'description'],
        order_by='profile_name'
    )
    
    # Format for compatibility with frontend
    devices = []
    for profile in profiles:
        devices.append({
            'name': profile.name,
            'device_name': profile.profile_name,
            'location': profile.branch,
            'status': 'active',
            'display_type': 'profile',
            'description': profile.description
        })
    
    return {
        'devices': devices,
        'total': len(devices)
    }


@frappe.whitelist()
def get_device_config(device):
    """
    Get configuration from Customer Display Profile
    
    Args:
        device (str): Customer Display Profile name
    
    Returns:
        dict: Profile data with config
    """
    if not frappe.has_permission('Customer Display Profile', 'read'):
        frappe.throw(_('No permission to read Customer Display Profile'))
    
    try:
        profile_doc = frappe.get_doc('Customer Display Profile', device)
        
        # Build config from profile fields
        config = {
            'layout_type': profile_doc.get('layout_type', 'Grid'),
            'grid_columns': profile_doc.get('grid_columns', 3),
            'grid_rows': profile_doc.get('grid_rows', 2),
            'override_brand': profile_doc.get('override_brand', 0),
            'brand_logo': profile_doc.get('brand_logo'),
            'brand_logo_dark': profile_doc.get('brand_logo_dark'),
            'brand_name': profile_doc.get('brand_name'),
            'brand_color_primary': profile_doc.get('brand_color_primary'),
            'brand_color_accent': profile_doc.get('brand_color_accent'),
            'brand_header_bg': profile_doc.get('brand_header_bg'),
            'blocks': [block.as_dict() for block in profile_doc.get('blocks', [])]
        }
        
        return {
            'device': {
                'name': profile_doc.name,
                'device_name': profile_doc.profile_name,
                'branch': profile_doc.branch
            },
            'config': config
        }
    except frappe.DoesNotExistError:
        frappe.throw(_('Customer Display Profile not found'))
    except Exception as e:
        frappe.log_error(f'Error getting profile config: {str(e)}')
        frappe.throw(_('Error loading profile configuration'))


@frappe.whitelist()
def save_device_config(device, config=None):
    """
    Save configuration to Customer Display Profile
    
    Args:
        device (str): Customer Display Profile name
        config: Configuration dict/JSON string
    """
    if not frappe.has_permission('Customer Display Profile', 'write'):
        frappe.throw(_('No permission to write Customer Display Profile'))
    
    if not device:
        frappe.throw(_('Device profile name is required'))
    
    # Parse config if string
    if config:
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                frappe.throw(_('Invalid JSON in config'))
        
        if not isinstance(config, dict):
            frappe.throw(_('Config must be a dictionary'))
    else:
        frappe.throw(_('Config is required'))
    
    try:
        profile_doc = frappe.get_doc('Customer Display Profile', device)
        
        # Update profile fields from config
        if 'layout_type' in config:
            profile_doc.layout_type = config['layout_type']
        if 'grid_columns' in config:
            profile_doc.grid_columns = config['grid_columns']
        if 'grid_rows' in config:
            profile_doc.grid_rows = config['grid_rows']
        if 'override_brand' in config:
            profile_doc.override_brand = config['override_brand']
        if 'brand_logo' in config:
            profile_doc.brand_logo = config['brand_logo']
        if 'brand_logo_dark' in config:
            profile_doc.brand_logo_dark = config['brand_logo_dark']
        if 'brand_name' in config:
            profile_doc.brand_name = config['brand_name']
        if 'brand_color_primary' in config:
            profile_doc.brand_color_primary = config['brand_color_primary']
        if 'brand_color_accent' in config:
            profile_doc.brand_color_accent = config['brand_color_accent']
        if 'brand_header_bg' in config:
            profile_doc.brand_header_bg = config['brand_header_bg']
        
        # Update blocks if provided
        if 'blocks' in config and isinstance(config['blocks'], list):
            profile_doc.blocks = []
            for block_data in config['blocks']:
                profile_doc.append('blocks', block_data)
        
        profile_doc.save(ignore_permissions=True)
        
        return {
            'success': True,
            'message': _('Configuration saved successfully')
        }
    except frappe.DoesNotExistError:
        frappe.throw(_('Customer Display Profile not found'))
    except Exception as e:
        frappe.log_error(f'Error saving profile config: {str(e)}')
        frappe.throw(_('Error saving profile configuration'))


@frappe.whitelist()
def reset_device_config(device):
    """
    Reset Customer Display Profile to default values
    
    Args:
        device (str): Customer Display Profile name
    """
    if not frappe.has_permission('Customer Display Profile', 'write'):
        frappe.throw(_('No permission to write Customer Display Profile'))
    
    try:
        profile_doc = frappe.get_doc('Customer Display Profile', device)
        
        # Reset to defaults
        profile_doc.layout_type = 'Grid'
        profile_doc.grid_columns = 3
        profile_doc.grid_rows = 2
        profile_doc.override_brand = 0
        profile_doc.brand_logo = None
        profile_doc.brand_logo_dark = None
        profile_doc.brand_name = None
        profile_doc.brand_color_primary = None
        profile_doc.brand_color_accent = None
        profile_doc.brand_header_bg = None
        profile_doc.blocks = []
        
        profile_doc.save(ignore_permissions=True)
        
        return {
            'success': True,
            'message': _('Configuration reset to defaults')
        }
    except frappe.DoesNotExistError:
        frappe.throw(_('Customer Display Profile not found'))
    except Exception as e:
        frappe.log_error(f'Error resetting profile config: {str(e)}')
        frappe.throw(_('Error resetting profile configuration'))



@frappe.whitelist()
def test_device_display(device):
    """
    Send a test message to customer display via realtime event
    
    Args:
        device (str): Customer Display Profile name
    """
    if not frappe.has_permission('Customer Display Profile', 'read'):
        frappe.throw(_('No permission to read Customer Display Profile'))
    
    try:
        profile_doc = frappe.get_doc('Customer Display Profile', device)
    except frappe.DoesNotExistError:
        frappe.throw(_('Customer Display Profile not found'))
    
    from frappe.realtime import publish_realtime
    
    test_payload = {
        'test': True,
        'message': f'Test from {profile_doc.profile_name}',
        'profile': profile_doc.name,
        'branch': profile_doc.branch,
        'timestamp': get_datetime().isoformat(),
        'items': [
            {'item_name': 'Test Item 1', 'qty': 2, 'rate': 15000, 'amount': 30000},
            {'item_name': 'Test Item 2', 'qty': 1, 'rate': 25000, 'amount': 25000}
        ],
        'total': 55000
    }
    
    # Publish to customer display channel
    publish_realtime('customer_display_update', test_payload)
    
    return {
        'success': True,
        'message': _('Test message sent to display')
    }

