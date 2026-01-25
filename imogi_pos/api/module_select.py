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
                'description': 'Counter/Retail mode - Quick service',
                'type': 'cashier',
                'icon': 'fa-cash-register',
                'url': '/counter',
                'requires_roles': ['Cashier', 'Branch Manager', 'System Manager'],
                'requires_session': True,
                'requires_opening': True,
                'order': 1
            },
            'cashier-payment': {
                'name': 'Cashier Payment',
                'description': 'Table service payment processing',
                'type': 'cashier-payment',
                'icon': 'fa-money-bill-wave',
                'url': '/cashier-payment',
                'requires_roles': ['Cashier', 'Branch Manager', 'System Manager'],
                'requires_session': False,
                'requires_opening': False,
                'order': 2
            },3
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
                'order': 4
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
            },5
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
                'requires_active_cashier': True,
                'order': 6
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
                'order': 7
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
        
        # Get user's primary branch with multiple fallbacks
        current_branch = frappe.db.get_value(
            'User',
            user,
            'imogi_default_branch'
        )
        
        # If no user branch set, try getting from defaults
        if not current_branch:
            defaults = frappe.defaults.get_defaults()
            current_branch = defaults.get('company')
        
        # If still no branch, get the first available branch
        if not current_branch:
            first_branch = frappe.db.get_value('Branch', filters={}, fieldname='name')
            if first_branch:
                current_branch = first_branch
                # Set it as user's default for next time
                frappe.db.set_value('User', user, 'imogi_default_branch', first_branch)
                frappe.db.commit()
        
        # Get available branches (from Branch doctype)
        available_branches = frappe.get_list(
            'Branch',
            fields=['name', 'branch'],
            limit_page_length=0
        )
        
        # If no branches found, throw error
        if not available_branches:
            frappe.throw(_('No branches configured in the system. Please contact administrator.'))
        
        # If current branch is still None, use first available
        if not current_branch and available_branches:
            current_branch = available_branches[0].name
        
        return {
            'current_branch': current_branch,
            'available_branches': available_branches
        }
    
    except Exception as e:
        frappe.log_error(f'Error in get_user_branch_info: {str(e)}')
        # Try one last fallback
        try:
            defaults = frappe.defaults.get_defaults()
            fallback_branch = defaults.get('company')
            if fallback_branch:
                return {
                    'current_branch': fallback_branch,
                    'available_branches': [{'name': fallback_branch, 'branch': fallback_branch}]
                }
        except:
            pass
        
        # If all else fails, return error
        frappe.throw(_('Unable to determine branch. Please contact administrator.'))


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


@frappe.whitelist()
def check_active_cashiers(branch=None):
    """
    Check if there are any active cashier POS sessions.
    Used to validate that payment can be processed for Waiter/Kiosk/Self-Order modules.
    """
    try:
        # Get current branch if not provided
        if not branch:
            branch = frappe.db.get_value('User', frappe.session.user, 'imogi_default_branch')
            if not branch:
                branch = frappe.defaults.get_defaults().get('company')
        
        # Query active POS Opening Entries for Cashier module
        active_cashier_sessions = frappe.get_list(
            'POS Opening Entry',
            filters={
                'status': 'Open',
                'docstatus': 1,
                'company': branch,
                'period_start_date': ['>=', frappe.utils.today()]
            },
            fields=['name', 'pos_profile', 'user', 'opening_balance', 'creation'],
            order_by='creation desc'
        )
        
        # Filter to only cashier sessions (check POS Profile has imogi_enable_cashier = 1)
        cashier_sessions = []
        for session in active_cashier_sessions:
            pos_profile = frappe.get_cached_doc('POS Profile', session.get('pos_profile'))
            if pos_profile.get('imogi_enable_cashier'):
                cashier_sessions.append({
                    'pos_opening_entry': session.get('name'),
                    'pos_profile': session.get('pos_profile'),
                    'user': session.get('user'),
                    'opening_balance': session.get('opening_balance', 0),
                    'timestamp': session.get('creation')
                })
        
        has_active = len(cashier_sessions) > 0
        
        return {
            'has_active_cashier': has_active,
            'active_sessions': cashier_sessions,
            'total_cashiers': len(cashier_sessions),
            'message': 'Active cashier found' if has_active else 'No active cashier sessions. Please ask a cashier to open a POS session first.',
            'branch': branch
        }
    
    except Exception as e:
        frappe.log_error(f'Error in check_active_cashiers: {str(e)}')
        return {
            'has_active_cashier': False,
            'active_sessions': [],
            'total_cashiers': 0,
            'message': 'Error checking cashier sessions',
            'error': str(e)
        }
