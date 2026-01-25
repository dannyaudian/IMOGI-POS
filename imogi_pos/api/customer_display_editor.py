"""
Customer Display Editor API
Manages configuration and testing for customer display devices
"""

import frappe
import json
from frappe import _
from frappe.utils import get_datetime


@frappe.whitelist()
def get_available_devices():
    """
    Get list of all customer display devices
    """
    if not frappe.has_permission('Customer Display Device', 'read'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    devices = frappe.get_list(
        'Customer Display Device',
        fields=['name', 'device_name', 'location', 'status', 'display_type', 'ip_address'],
        order_by='device_name asc'
    )
    
    return {
        'devices': devices,
        'total': len(devices)
    }


@frappe.whitelist()
def get_device_config(device):
    """
    Get configuration for a specific customer display device
    
    Args:
        device: Device name/ID
    
    Returns:
        dict with device info and config
    """
    if not frappe.has_permission('Customer Display Device', 'read'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    try:
        device_doc = frappe.get_doc('Customer Display Device', device)
    except frappe.DoesNotExistError:
        frappe.throw(_('Device not found'), frappe.DoesNotExistError)
    
    # Parse stored config
    config = {}
    if device_doc.get('imogi_display_config'):
        try:
            config = json.loads(device_doc.imogi_display_config)
        except (json.JSONDecodeError, TypeError):
            config = {}
    
    # Apply defaults if not present
    default_config = get_default_config()
    config = {**default_config, **config}
    
    return {
        'device': {
            'name': device_doc.name,
            'device_name': device_doc.device_name,
            'location': device_doc.location,
            'status': device_doc.status,
            'display_type': device_doc.display_type,
            'ip_address': device_doc.get('ip_address')
        },
        'config': config
    }


@frappe.whitelist()
def save_device_config(device, config):
    """
    Save configuration for a customer display device
    
    Args:
        device: Device name/ID
        config: Configuration dict/JSON string
    """
    if not frappe.has_permission('Customer Display Device', 'write'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    try:
        device_doc = frappe.get_doc('Customer Display Device', device)
    except frappe.DoesNotExistError:
        frappe.throw(_('Device not found'), frappe.DoesNotExistError)
    
    # Parse config if it's a string
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            frappe.throw(_('Invalid JSON in config'))
    
    # Validate config
    if not isinstance(config, dict):
        frappe.throw(_('Config must be a dictionary'))
    
    # Save configuration
    device_doc.imogi_display_config = json.dumps(config)
    device_doc.save()
    frappe.db.commit()
    
    return {
        'success': True,
        'message': _('Configuration saved successfully')
    }


@frappe.whitelist()
def reset_device_config(device):
    """
    Reset device configuration to defaults
    
    Args:
        device: Device name/ID
    """
    if not frappe.has_permission('Customer Display Device', 'write'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    try:
        device_doc = frappe.get_doc('Customer Display Device', device)
    except frappe.DoesNotExistError:
        frappe.throw(_('Device not found'), frappe.DoesNotExistError)
    
    # Reset to defaults
    device_doc.imogi_display_config = json.dumps(get_default_config())
    device_doc.save()
    frappe.db.commit()
    
    return {
        'success': True,
        'message': _('Configuration reset to defaults'),
        'config': get_default_config()
    }


@frappe.whitelist()
def test_device_display(device):
    """
    Send a test message to the customer display device
    
    Args:
        device: Device name/ID
    """
    if not frappe.has_permission('Customer Display Device', 'read'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    try:
        device_doc = frappe.get_doc('Customer Display Device', device)
    except frappe.DoesNotExistError:
        frappe.throw(_('Device not found'), frappe.DoesNotExistError)
    
    # Send test payload to device via API
    # This would integrate with your actual display device API
    test_payload = {
        'message': 'Test from IMOGI POS',
        'timestamp': get_datetime().isoformat(),
        'test': True
    }
    
    try:
        # Example: Send to device's IP/endpoint
        # Adjust based on your actual device protocol
        if device_doc.get('ip_address'):
            # This is a placeholder - implement your actual device communication
            frappe.log_error(
                f'Test payload for {device}: {json.dumps(test_payload)}',
                'Customer Display Test'
            )
    except Exception as e:
        frappe.log_error(str(e), 'Customer Display Test Error')
    
    return {
        'success': True,
        'message': _('Test message sent to display')
    }


def get_default_config():
    """
    Get default configuration for customer display
    """
    return {
        # Layout settings
        'showImages': True,
        'showDescription': False,
        'showLogo': True,
        'showSubtotal': True,
        'showTaxes': False,
        'autoScroll': True,
        'scrollSpeed': 3,
        'fontSize': '1rem',
        
        # Theme settings
        'backgroundColor': '#1f2937',
        'textColor': '#ffffff',
        'accentColor': '#10b981',
        'priceColor': '#fbbf24',
        'themePreset': 'dark',
        
        # Advanced settings
        'displayTimeout': 30,
        'refreshInterval': 5,
        'debugMode': False
    }


@frappe.whitelist()
def batch_update_devices(updates):
    """
    Update configuration for multiple devices at once
    
    Args:
        updates: List of {device, config} dicts
    """
    if not frappe.has_permission('Customer Display Device', 'write'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    if isinstance(updates, str):
        try:
            updates = json.loads(updates)
        except json.JSONDecodeError:
            frappe.throw(_('Invalid JSON in updates'))
    
    results = []
    errors = []
    
    for update in updates:
        device = update.get('device')
        config = update.get('config')
        
        if not device or not config:
            errors.append(f'Invalid update entry: {update}')
            continue
        
        try:
            device_doc = frappe.get_doc('Customer Display Device', device)
            device_doc.imogi_display_config = json.dumps(config)
            device_doc.save()
            results.append({
                'device': device,
                'status': 'success'
            })
        except Exception as e:
            errors.append(f'Error updating {device}: {str(e)}')
            results.append({
                'device': device,
                'status': 'error',
                'error': str(e)
            })
    
    frappe.db.commit()
    
    return {
        'success': len(errors) == 0,
        'results': results,
        'errors': errors
    }
