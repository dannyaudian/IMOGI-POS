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
        dict: List of profiles or error state with graceful degradation
    """
    # Check permission - return error state instead of throwing
    if not frappe.has_permission('Customer Display Profile', 'read'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('You do not have permission to view Customer Display Profiles'),
            'devices': [],
            'total': 0
        }
    
    try:
        profiles = frappe.get_all(
            'Customer Display Profile',
            filters={'is_active': 1},
            fields=['name', 'profile_name', 'branch', 'description', 'layout_type', 
                    'grid_columns', 'grid_rows', 'override_brand', 'brand_logo',
                    'brand_logo_dark', 'brand_name', 'brand_color_primary',
                    'brand_color_accent', 'brand_header_bg'],
            order_by='profile_name'
        )
        
        # Format for compatibility with frontend
        devices = []
        for profile in profiles:
            # Get blocks separately
            profile_doc = frappe.get_doc('Customer Display Profile', profile.name)
            
            # Build config
            config = {
                'layout_type': profile.layout_type or 'Grid',
                'grid_columns': profile.grid_columns or 3,
                'grid_rows': profile.grid_rows or 2,
                'override_brand': profile.override_brand or 0,
                'brand_logo': profile.brand_logo,
                'brand_logo_dark': profile.brand_logo_dark,
                'brand_name': profile.brand_name,
                'brand_color_primary': profile.brand_color_primary,
                'brand_color_accent': profile.brand_color_accent,
                'brand_header_bg': profile.brand_header_bg,
                'blocks': [block.as_dict() for block in profile_doc.get('blocks', [])]
            }
            
            devices.append({
                'name': profile.name,
                'profile_name': profile.profile_name,
                'device_name': profile.profile_name,  # Alias for compatibility
                'branch': profile.branch,
                'location': profile.branch,  # Alias for compatibility
                'is_active': True,
                'status': 'active',
                'display_type': 'profile',
                'description': profile.description,
                'config': config
            })
        
        return {
            'success': True,
            'devices': devices,
            'total': len(devices)
        }
    
    except Exception as e:
        frappe.log_error(f'Error fetching Customer Display Profiles: {str(e)}')
        return {
            'success': False,
            'error': 'fetch_failed',
            'message': _('Failed to load Customer Display Profiles'),
            'devices': [],
            'total': 0
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
        config (dict): Configuration object
        
    Returns:
        dict: Success status and message with structured error handling
    """
    # Define field mapping at function level for clarity
    CONFIG_FIELD_MAP = {
        # Frontend key: DocType field
        'layout_type': 'layout_type',
        'grid_columns': 'grid_columns',
        'grid_rows': 'grid_rows',
        'override_brand': 'override_brand',
        'brand_logo': 'brand_logo',
        'brand_logo_dark': 'brand_logo_dark',
        'brand_name': 'brand_name',
        'brand_color_primary': 'brand_color_primary',
        'brand_color_accent': 'brand_color_accent',
        'brand_header_bg': 'brand_header_bg',
    }
    
    # Check permission - return error instead of throwing
    if not frappe.has_permission('Customer Display Profile', 'write'):
        return {
            'success': False,
            'error': 'insufficient_permissions',
            'message': _('No permission to update Customer Display Profile')
        }
    
    if not device:
        return {
            'success': False,
            'error': 'validation_error',
            'message': _('Device profile name is required')
        }
    
    # Parse config if string
    if config:
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                return {
                    'success': False,
                    'error': 'invalid_json',
                    'message': _('Invalid JSON in config')
                }
    else:
        return {
            'success': False,
            'error': 'validation_error',
            'message': _('Config is required')
        }
    
    try:
        profile_doc = frappe.get_doc('Customer Display Profile', device)
        
        # Update fields using explicit mapping
        for frontend_key, doctype_field in CONFIG_FIELD_MAP.items():
            if frontend_key in config:
                setattr(profile_doc, doctype_field, config[frontend_key])
        
        # Handle blocks separately (child table)
        if 'blocks' in config and isinstance(config['blocks'], list):
            profile_doc.blocks = []
            for block_data in config['blocks']:
                profile_doc.append('blocks', block_data)
        
        # Save with permission check (no ignore_permissions)
        profile_doc.save(ignore_permissions=False)
        
        return {
            'success': True,
            'message': _('Configuration saved successfully'),
            'profile': {
                'name': profile_doc.name,
                'modified': profile_doc.modified
            }
        }
    
    except frappe.DoesNotExistError:
        return {
            'success': False,
            'error': 'not_found',
            'message': _('Customer Display Profile not found')
        }
    except frappe.exceptions.PermissionError:
        return {
            'success': False,
            'error': 'permission_denied',
            'message': _('Permission denied to save this profile')
        }
    except Exception as e:
        frappe.log_error(f'Error saving profile config: {str(e)}')
        return {
            'success': False,
            'error': 'save_failed',
            'message': _('Error saving profile configuration')
        }


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


@frappe.whitelist()
def get_display_templates():
    """
    Get available display templates/presets
    
    Returns:
        dict: List of templates with preview data
    """
    templates = [
        {
            'id': 'modern-dark',
            'name': 'Modern Dark',
            'description': 'Dark theme with modern layout',
            'preview_image': '/assets/imogi_pos/images/templates/modern-dark.png',
            'config': {
                'layout_type': 'Grid',
                'grid_columns': 2,
                'grid_rows': 3,
                'backgroundColor': '#1f2937',
                'textColor': '#ffffff',
                'accentColor': '#3b82f6',
                'priceColor': '#10b981',
                'fontSize': '1.25rem',
                'showLogo': True,
                'showImages': True
            }
        },
        {
            'id': 'light-minimal',
            'name': 'Light Minimal',
            'description': 'Clean light theme with minimal design',
            'preview_image': '/assets/imogi_pos/images/templates/light-minimal.png',
            'config': {
                'layout_type': 'List',
                'backgroundColor': '#ffffff',
                'textColor': '#1f2937',
                'accentColor': '#10b981',
                'priceColor': '#059669',
                'fontSize': '1rem',
                'showLogo': True,
                'showImages': False,
                'showSubtotal': True,
                'showTaxes': True
            }
        },
        {
            'id': 'colorful',
            'name': 'Colorful',
            'description': 'Vibrant colors for retail',
            'preview_image': '/assets/imogi_pos/images/templates/colorful.png',
            'config': {
                'layout_type': 'Grid',
                'grid_columns': 3,
                'grid_rows': 2,
                'backgroundColor': '#ec4899',
                'textColor': '#ffffff',
                'accentColor': '#fbbf24',
                'priceColor': '#ffffff',
                'fontSize': '1.5rem',
                'showLogo': True,
                'showImages': True
            }
        },
        {
            'id': 'restaurant',
            'name': 'Restaurant',
            'description': 'Perfect for restaurant displays',
            'preview_image': '/assets/imogi_pos/images/templates/restaurant.png',
            'config': {
                'layout_type': 'List',
                'backgroundColor': '#0f172a',
                'textColor': '#f1f5f9',
                'accentColor': '#f59e0b',
                'priceColor': '#fbbf24',
                'fontSize': '1.25rem',
                'showLogo': True,
                'showImages': True,
                'showDescription': True,
                'autoScroll': True,
                'scrollSpeed': 3
            }
        }
    ]
    
    return {
        'templates': templates,
        'total': len(templates)
    }


@frappe.whitelist()
def create_profile(profile_name, branch, template_id=None, config=None):
    """
    Create a new Customer Display Profile
    
    Args:
        profile_name (str): Name for the new profile
        branch (str): Branch for the profile
        template_id (str, optional): Template ID to use
        config (dict, optional): Initial configuration
    
    Returns:
        dict: New profile details
    """
    if not frappe.has_permission('Customer Display Profile', 'create'):
        frappe.throw(_('No permission to create Customer Display Profile'))
    
    if not profile_name:
        frappe.throw(_('Profile name is required'))
    
    if not branch:
        frappe.throw(_('Branch is required'))
    
    # Check if profile name already exists
    if frappe.db.exists('Customer Display Profile', profile_name):
        frappe.throw(_('Profile with this name already exists'))
    
    try:
        # Create new profile document
        new_doc = frappe.new_doc('Customer Display Profile')
        new_doc.profile_name = profile_name
        new_doc.branch = branch
        new_doc.is_active = 1
        
        # Apply template if provided
        if template_id:
            templates = get_display_templates()
            template = next((t for t in templates.get('templates', []) if t['id'] == template_id), None)
            if template and template.get('config'):
                config = template['config']
        
        # Apply config if provided
        if config:
            if isinstance(config, str):
                config = json.loads(config)
            
            new_doc.layout_type = config.get('layout_type', 'Grid')
            new_doc.grid_columns = config.get('grid_columns', 3)
            new_doc.grid_rows = config.get('grid_rows', 2)
            new_doc.override_brand = config.get('override_brand', 0)
            new_doc.brand_logo = config.get('brand_logo')
            new_doc.brand_logo_dark = config.get('brand_logo_dark')
            new_doc.brand_name = config.get('brand_name')
            new_doc.brand_color_primary = config.get('brand_color_primary')
            new_doc.brand_color_accent = config.get('brand_color_accent')
            new_doc.brand_header_bg = config.get('brand_header_bg')
            
            if 'blocks' in config and isinstance(config['blocks'], list):
                for block_data in config['blocks']:
                    new_doc.append('blocks', block_data)
        
        new_doc.insert(ignore_permissions=True)
        
        return {
            'success': True,
            'profile': {
                'name': new_doc.name,
                'profile_name': new_doc.profile_name,
                'branch': new_doc.branch,
                'is_active': new_doc.is_active
            },
            'message': _('Profile created successfully')
        }
    except Exception as e:
        frappe.log_error(f'Error creating profile: {str(e)}')
        frappe.throw(_(f'Error creating profile: {str(e)}'))


@frappe.whitelist()
def duplicate_profile(source_profile, new_name, new_branch=None):
    """
    Duplicate an existing Customer Display Profile
    
    Args:
        source_profile (str): Source profile name
        new_name (str): New profile name
        new_branch (str, optional): Branch for new profile
    
    Returns:
        dict: New profile details
    """
    if not frappe.has_permission('Customer Display Profile', 'create'):
        frappe.throw(_('No permission to create Customer Display Profile'))
    
    try:
        source_doc = frappe.get_doc('Customer Display Profile', source_profile)
        
        # Create new profile
        new_doc = frappe.copy_doc(source_doc)
        new_doc.profile_name = new_name
        
        if new_branch:
            new_doc.branch = new_branch
        
        new_doc.insert(ignore_permissions=True)
        
        return {
            'success': True,
            'profile': {
                'name': new_doc.name,
                'profile_name': new_doc.profile_name,
                'branch': new_doc.branch
            },
            'message': _('Profile duplicated successfully')
        }
    except frappe.DoesNotExistError:
        frappe.throw(_('Source profile not found'))
    except Exception as e:
        frappe.log_error(f'Error duplicating profile: {str(e)}')
        frappe.throw(_('Error duplicating profile'))


@frappe.whitelist()
def get_preview_data(device=None, sample_type='default'):
    """
    Get sample data for preview display
    
    Args:
        device (str, optional): Device profile name
        sample_type (str): Type of sample data (default, restaurant, retail)
    
    Returns:
        dict: Sample order data for preview
    """
    sample_data = {
        'default': {
            'items': [
                {'item_name': 'Product A', 'qty': 2, 'rate': 25000, 'amount': 50000, 'description': 'Standard product'},
                {'item_name': 'Product B', 'qty': 1, 'rate': 35000, 'amount': 35000, 'description': 'Premium item'},
                {'item_name': 'Product C', 'qty': 3, 'rate': 15000, 'amount': 45000, 'description': 'Budget option'}
            ],
            'subtotal': 130000,
            'tax': 13000,
            'total': 143000,
            'customer': 'Sample Customer'
        },
        'restaurant': {
            'items': [
                {'item_name': 'Nasi Goreng Special', 'qty': 2, 'rate': 35000, 'amount': 70000, 'description': 'Extra pedas'},
                {'item_name': 'Es Teh Manis', 'qty': 2, 'rate': 8000, 'amount': 16000, 'description': 'Less sugar'},
                {'item_name': 'Ayam Bakar', 'qty': 1, 'rate': 45000, 'amount': 45000, 'description': 'With sambal'},
                {'item_name': 'Jus Alpukat', 'qty': 1, 'rate': 15000, 'amount': 15000, 'description': 'Fresh'}
            ],
            'subtotal': 146000,
            'tax': 14600,
            'total': 160600,
            'customer': 'TABLE-05'
        },
        'retail': {
            'items': [
                {'item_name': 'T-Shirt Premium', 'qty': 1, 'rate': 125000, 'amount': 125000, 'description': 'Size L, Blue'},
                {'item_name': 'Jeans Classic', 'qty': 1, 'rate': 250000, 'amount': 250000, 'description': 'Size 32'},
                {'item_name': 'Sneakers Sport', 'qty': 1, 'rate': 350000, 'amount': 350000, 'description': 'Size 42'},
                {'item_name': 'Cap Limited Edition', 'qty': 2, 'rate': 75000, 'amount': 150000, 'description': 'Black'}
            ],
            'subtotal': 875000,
            'tax': 87500,
            'total': 962500,
            'customer': 'VIP Customer'
        }
    }
    
    data = sample_data.get(sample_type, sample_data['default'])
    
    # Add device config if provided
    if device:
        try:
            profile_doc = frappe.get_doc('Customer Display Profile', device)
            data['config'] = {
                'layout_type': profile_doc.layout_type,
                'brand_name': profile_doc.brand_name,
                'brand_logo': profile_doc.brand_logo
            }
        except:
            pass
    
    return data


@frappe.whitelist()
def get_profile_stats():
    """
    Get statistics about customer display profiles
    
    Returns:
        dict: Statistics data
    """
    if not frappe.has_permission('Customer Display Profile', 'read'):
        frappe.throw(_('No permission to read Customer Display Profile'))
    
    total = frappe.db.count('Customer Display Profile')
    active = frappe.db.count('Customer Display Profile', {'is_active': 1})
    inactive = total - active
    
    # Group by branch
    by_branch = frappe.db.sql("""
        SELECT branch, COUNT(*) as count
        FROM `tabCustomer Display Profile`
        WHERE is_active = 1
        GROUP BY branch
        ORDER BY count DESC
    """, as_dict=True)
    
    return {
        'total': total,
        'active': active,
        'inactive': inactive,
        'by_branch': by_branch
    }
