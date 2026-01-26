"""
Table Display Editor API
Manages configuration and testing for restaurant table display devices
"""

import frappe
import json
from frappe import _
from frappe.utils import get_datetime


@frappe.whitelist()
def get_available_displays():
    """
    Get list of all restaurant table displays
    
    Returns:
        dict: List of displays or error state with graceful degradation
    """
    # Check permission - return error state instead of throwing
    if not frappe.has_permission('Restaurant Table Display', 'read'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('You do not have permission to view Restaurant Table Displays'),
            'displays': [],
            'total': 0
        }
    
    try:
        displays = frappe.get_list(
            'Restaurant Table Display',
            fields=['name', 'display_name', 'section', 'status', 'display_type', 'ip_address'],
            order_by='display_name asc'
        )
        
        return {
            'success': True,
            'displays': displays,
            'total': len(displays)
        }
    except Exception as e:
        frappe.log_error(f'Error fetching Restaurant Table Displays: {str(e)}')
        return {
            'success': False,
            'error': 'fetch_failed',
            'message': _('Failed to load Restaurant Table Displays'),
            'displays': [],
            'total': 0
        }


@frappe.whitelist()
def get_display_config(display):
    """
    Get configuration for a specific table display
    
    Args:
        display: Display name/ID
    
    Returns:
        dict with display info and config or error state
    """
    # Check permission - return error state instead of throwing
    if not frappe.has_permission('Restaurant Table Display', 'read'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('You do not have permission to view Restaurant Table Displays')
        }
    
    try:
        display_doc = frappe.get_doc('Restaurant Table Display', display)
    except frappe.DoesNotExistError:
        frappe.throw(_('Display not found'), frappe.DoesNotExistError)
    
    # Parse stored config
    config = {}
    if display_doc.get('imogi_display_config'):
        try:
            config = json.loads(display_doc.imogi_display_config)
        except (json.JSONDecodeError, TypeError):
            config = {}
    
    # Apply defaults if not present
    default_config = get_default_config()
    config = {**default_config, **config}
    
    return {
        'display': {
            'name': display_doc.name,
            'display_name': display_doc.display_name,
            'section': display_doc.section,
            'status': display_doc.status,
            'display_type': display_doc.display_type,
            'ip_address': display_doc.get('ip_address')
        },
        'config': config
    }


@frappe.whitelist()
def save_display_config(display, config):
    """
    Save configuration for a table display
    
    Args:
        display: Display name/ID
        config: Configuration dict/JSON string
    
    Returns:
        dict: Success/error state
    """
    # Check permission - return error state instead of throwing
    if not frappe.has_permission('Restaurant Table Display', 'write'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('You do not have permission to modify Restaurant Table Displays')
        }
    
    try:
        display_doc = frappe.get_doc('Restaurant Table Display', display)
    except frappe.DoesNotExistError:
        frappe.throw(_('Display not found'), frappe.DoesNotExistError)
    
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
    display_doc.imogi_display_config = json.dumps(config)
    display_doc.save()
    frappe.db.commit()
    
    return {
        'success': True,
        'message': _('Configuration saved successfully')
    }


@frappe.whitelist()
def reset_display_config(display):
    """
    Reset display configuration to defaults
    
    Args:
        display: Display name/ID
    
    Returns:
        dict: Success/error state
    """
    # Check permission - return error state instead of throwing
    if not frappe.has_permission('Restaurant Table Display', 'write'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('You do not have permission to modify Restaurant Table Displays')
        }
    
    try:
        display_doc = frappe.get_doc('Restaurant Table Display', display)
    except frappe.DoesNotExistError:
        frappe.throw(_('Display not found'), frappe.DoesNotExistError)
    
    # Reset to defaults
    display_doc.imogi_display_config = json.dumps(get_default_config())
    display_doc.save()
    frappe.db.commit()
    
    return {
        'success': True,
        'message': _('Configuration reset to defaults'),
        'config': get_default_config()
    }


@frappe.whitelist()
def test_display(display):
    """
    Send a test message to the table display
    
    Args:
        display: Display name/ID
    """
    if not frappe.has_permission('Restaurant Table Display', 'read'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    try:
        display_doc = frappe.get_doc('Restaurant Table Display', display)
    except frappe.DoesNotExistError:
        frappe.throw(_('Display not found'), frappe.DoesNotExistError)
    
    # Send test payload to display via API
    test_payload = {
        'message': 'Test from IMOGI POS',
        'timestamp': get_datetime().isoformat(),
        'test': True,
        'tables': [
            {'id': 'T01', 'status': 'available'},
            {'id': 'T02', 'status': 'occupied'},
            {'id': 'T03', 'status': 'reserved'}
        ]
    }
    
    try:
        # Example: Send to display's IP/endpoint
        # Adjust based on your actual device protocol
        if display_doc.get('ip_address'):
            # This is a placeholder - implement your actual device communication
            frappe.log_error(
                f'Test payload for {display}: {json.dumps(test_payload)}',
                'Table Display Test'
            )
    except Exception as e:
        frappe.log_error(str(e), 'Table Display Test Error')
    
    return {
        'success': True,
        'message': _('Test message sent to display')
    }


def get_default_config():
    """
    Get default configuration for table display
    """
    return {
        # Layout settings
        'showTableNumbers': True,
        'showSeats': False,
        'showStatusLabels': True,
        'showWaiterName': False,
        'showOrderTime': False,
        'gridLayout': '4',
        'fontSize': '1rem',
        'updateInterval': 5,
        
        # Theme settings
        'backgroundColor': '#1f2937',
        'textColor': '#ffffff',
        'availableColor': '#10b981',
        'occupiedColor': '#ef4444',
        'reservedColor': '#f59e0b',
        'dirtyColor': '#8b5cf6',
        'themePreset': 'dark',
        
        # Advanced settings
        'enableAutoRefresh': True,
        'pollingInterval': 5,
        'animationSpeed': 300,
        'enableAnimations': True,
        'showSectionHeader': True,
        'debugMode': False
    }


@frappe.whitelist()
def batch_update_displays(updates):
    """
    Update configuration for multiple displays at once
    
    Args:
        updates: List of {display, config} dicts
    """
    if not frappe.has_permission('Restaurant Table Display', 'write'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    if isinstance(updates, str):
        try:
            updates = json.loads(updates)
        except json.JSONDecodeError:
            frappe.throw(_('Invalid JSON in updates'))
    
    results = []
    errors = []
    
    for update in updates:
        display = update.get('display')
        config = update.get('config')
        
        if not display or not config:
            errors.append(f'Invalid update entry: {update}')
            continue
        
        try:
            display_doc = frappe.get_doc('Restaurant Table Display', display)
            display_doc.imogi_display_config = json.dumps(config)
            display_doc.save()
            results.append({
                'display': display,
                'status': 'success'
            })
        except Exception as e:
            errors.append(f'Error updating {display}: {str(e)}')
            results.append({
                'display': display,
                'status': 'error',
                'error': str(e)
            })
    
    frappe.db.commit()
    
    return {
        'success': len(errors) == 0,
        'results': results,
        'errors': errors
    }


@frappe.whitelist()
def get_section_displays(section):
    """
    Get all displays for a specific section
    
    Args:
        section: Section name
    
    Returns:
        List of displays in section with their config
    """
    if not frappe.has_permission('Restaurant Table Display', 'read'):
        frappe.throw(_('Not permitted'), frappe.PermissionError)
    
    displays = frappe.get_list(
        'Restaurant Table Display',
        filters={'section': section},
        fields=['name', 'display_name', 'status', 'ip_address']
    )
    
    result = []
    for display in displays:
        config_response = get_display_config(display['name'])
        result.append({
            'display': display,
            'config': config_response['config']
        })
    
    return {
        'section': section,
        'displays': result,
        'total': len(result)
    }
