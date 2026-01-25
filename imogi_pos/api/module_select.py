"""
IMOGI POS - Module Selection API
Provides available modules based on user permissions and roles
"""

import frappe
from frappe import _
from imogi_pos.utils.auth_decorators import require_roles


@frappe.whitelist()
def get_available_modules(branch=None):
    """Get list of available modules based on user's roles and permissions."""
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        # Get user roles
        user_roles = frappe.get_roles(user)
        
        # Define module-to-roles mapping
        modules_config = {
            'cashier': {
                'name': 'Cashier Console',
                'description': 'Manage orders and process payments',
                'type': 'cashier',
                'icon': 'fa-cash-register',
                'url': '/cashier-console',
                'requires_roles': ['Cashier', 'Branch Manager', 'System Manager'],
                'requires_session': True,
                'requires_opening': True,
                'order': 1
            },
            'waiter': {
                'name': 'Waiter Station',
                'description': 'Create and manage dining orders',
                'type': 'waiter',
                'icon': 'fa-server',
                'url': '/restaurant/waiter',
                'requires_roles': ['Waiter', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 2
            },
            'kitchen': {
                'name': 'Kitchen Display',
                'description': 'View and manage KOT tickets',
                'type': 'kitchen',
                'icon': 'fa-fire',
                'url': '/restaurant/kitchen',
                'requires_roles': ['Kitchen Staff', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 3
            },
            'kiosk': {
                'name': 'Self-Service Kiosk',
                'description': 'Customers order from self-service terminals',
                'type': 'kiosk',
                'icon': 'fa-tablet',
                'url': '/restaurant/waiter?mode=kiosk',
                'requires_roles': ['Kiosk', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 4
            },
            'self-order': {
                'name': 'Self-Order Kiosk',
                'description': 'QR code based ordering system',
                'type': 'self-order',
                'icon': 'fa-shopping-bag',
                'url': '/restaurant/self-order',
                'requires_roles': ['Guest', 'Waiter', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 5
            },
            'table-display': {
                'name': 'Table Display',
                'description': 'Display table status and orders',
                'type': 'table-display',
                'icon': 'fa-th',
                'url': '/restaurant/tables',
                'requires_roles': ['Waiter', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 6
            },
            'customer-display': {
                'name': 'Customer Display',
                'description': 'Show order and payment info to customers',
                'type': 'customer-display',
                'icon': 'fa-tv',
                'url': '/devices/displays',
                'requires_roles': ['Guest', 'Waiter', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 7
            }
            # NOTE: Table Layout Editor is a separate standalone app
            # Not included in Module Select (accessed via /table_layout_editor directly)
        }
        
        # Filter modules based on user roles
        available_modules = []
        for module_type, config in modules_config.items():
            required_roles = config.get('requires_roles', [])
            # Check if user has any of the required roles
            if any(role in user_roles for role in required_roles):
                available_modules.append({
                    'type': config['type'],
                    'name': config['name'],
                    'description': config['description'],
                    'url': config['url'],
                    'icon': config['icon'],
                    'requires_session': config.get('requires_session', False),
                    'requires_opening': config.get('requires_opening', False),
                    'order': config.get('order', 99)
                })
        
        # Sort by order
        available_modules.sort(key=lambda x: x['order'])
        
        return {
            'modules': available_modules,
            'user': user,
            'roles': user_roles
        }
    
    except Exception as e:
        frappe.log_error(f'Error in get_available_modules: {str(e)}')
        frappe.throw(_('Error loading modules. Please refresh and try again.'))


@frappe.whitelist()
def get_user_branch_info():
    """Get user's current branch and available branches."""
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        # Get user's primary branch
        user_doc = frappe.get_doc('User', user)
        current_branch = frappe.db.get_value(
            'User',
            user,
            'imogi_default_branch'
        ) or frappe.db.get_value('Company', filters={}, fieldname='name')
        
        # Get available branches (from Company doctype)
        available_branches = frappe.get_list(
            'Company',
            fields=['name', 'company_name'],
            limit_page_length=0
        )
        
        return {
            'current_branch': current_branch,
            'available_branches': available_branches
        }
    
    except Exception as e:
        frappe.log_error(f'Error in get_user_branch_info: {str(e)}')
        return {
            'current_branch': frappe.defaults.get_defaults()['company'],
            'available_branches': []
        }


@frappe.whitelist()
def get_active_pos_opening(branch=None):
    """Get the active POS opening entry for the current user."""
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            return {
                'pos_opening_entry': None,
                'pos_profile_name': None,
                'opening_balance': 0,
                'timestamp': None
            }
        
        # If no branch provided, get default
        if not branch:
            branch = frappe.db.get_value(
                'User',
                user,
                'imogi_default_branch'
            ) or frappe.defaults.get_defaults()['company']
        
        # Get active POS opening entry (most recent one submitted today)
        from datetime import datetime, timedelta
        today = datetime.now().date()
        
        pos_opening = frappe.db.get_list(
            'POS Opening Entry',
            filters={
                'docstatus': 1,  # Submitted
                'company': branch
            },
            fields=['name', 'pos_profile', 'user', 'opening_balance', 'creation'],
            order_by='creation desc',
            limit_page_length=1
        )
        
        if pos_opening:
            entry = pos_opening[0]
            pos_profile = frappe.get_doc('POS Profile', entry.get('pos_profile'))
            
            return {
                'pos_opening_entry': entry.get('name'),
                'pos_profile_name': entry.get('pos_profile'),
                'opening_balance': entry.get('opening_balance', 0),
                'timestamp': entry.get('creation')
            }
        
        return {
            'pos_opening_entry': None,
            'pos_profile_name': None,
            'opening_balance': 0,
            'timestamp': None
        }
    
    except Exception as e:
        frappe.log_error(f'Error in get_active_pos_opening: {str(e)}')
        return {
            'pos_opening_entry': None,
            'pos_profile_name': None,
            'opening_balance': 0,
            'timestamp': None
        }


@frappe.whitelist()
def set_user_branch(branch):
    """Set user's current branch preference."""
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        # Update user's default branch
        frappe.db.set_value('User', user, 'imogi_default_branch', branch)
        frappe.db.commit()
        
        # Also set in session
        frappe.session.data.user_branch = branch
        
        return {
            'success': True,
            'message': f'Branch changed to {branch}'
        }
    
    except Exception as e:
        frappe.log_error(f'Error in set_user_branch: {str(e)}')
        frappe.throw(_('Error setting branch. Please try again.'))
