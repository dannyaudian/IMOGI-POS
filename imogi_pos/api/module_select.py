"""
IMOGI POS - Module Selection API
Provides available modules based on user permissions and roles
"""

from typing import Any, Dict, List, Optional

import frappe
from frappe import _
from imogi_pos.utils.auth_helpers import get_user_role_context
from imogi_pos.utils.operational_context import (
    get_active_operational_context,
    resolve_operational_context
)
from imogi_pos.utils.role_permissions import (
    PRIVILEGED_ROLES,
    MANAGEMENT_ROLES
)


# ============================================================================
# MODULE CONFIGURATION
# ============================================================================

# Define module-to-roles mapping using standardized role constants
MODULE_CONFIGS = {
    'cashier': {
        'name': 'Cashier Console',
        'description': 'Counter/Retail mode - Quick service & payment',
        'type': 'cashier',
        'icon': 'fa-cash-register',
        'url': '/app/imogi-cashier',
        'base_url': '/app/imogi-cashier',
        'requires_roles': ['Cashier'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': True,
        'requires_opening': True,
        'requires_pos_profile': True,
        'order': 1
    },
    # NOTE: cashier-payment module deprecated - merged into cashier (counter/pos)
    # Use /counter/pos?filter=pending for payment-only view
    'waiter': {
        'name': 'Waiter Order',
        'description': 'Table service order taking',
        'type': 'waiter',
        'icon': 'fa-utensils',
        'url': '/app/imogi-waiter',
        'base_url': '/app/imogi-waiter',
        'requires_roles': ['Waiter'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': False,
        'requires_opening': False,
        'requires_pos_profile': True,
        'order': 2
    },
    'kitchen': {
        'name': 'Kitchen Display',
        'description': 'View and manage KOT tickets',
        'type': 'kitchen',
        'icon': 'fa-fire',
        'url': '/app/imogi-kitchen',
        'base_url': '/app/imogi-kitchen',
        'requires_roles': ['Kitchen Staff'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': False,
        'requires_opening': False,
        'requires_pos_profile': True,
        'order': 3
    },
    'self-order': {
        'name': 'Self-Order Kiosk',
        'description': 'QR code based ordering system',
        'type': 'self-order',
        'icon': 'fa-shopping-bag',
        'url': '/restaurant/self-order',
        'requires_roles': ['Guest', 'Waiter'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': False,
        'requires_opening': False,
        'requires_active_cashier': True,
        'order': 4
    },
    'table-display': {
        'name': 'Table Display',
        'description': 'Display table status and orders',
        'type': 'table-display',
        'icon': 'fa-th',
        'url': '/app/imogi-tables',
        'base_url': '/app/imogi-tables',
        'requires_roles': ['Waiter'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': False,
        'requires_opening': False,
        'requires_pos_profile': True,
        'order': 5
    },
    'customer-display': {
        'name': 'Customer Display',
        'description': 'Show order and payment info to customers',
        'type': 'customer-display',
        'icon': 'fa-tv',
        'url': '/app/imogi-displays',
        'base_url': '/app/imogi-displays',
        'requires_roles': ['Guest', 'Waiter'] + MANAGEMENT_ROLES + PRIVILEGED_ROLES,
        'requires_session': False,
        'requires_opening': False,
        'order': 6
    }
    # NOTE: Table Layout Editor is a separate standalone app
    # Not included in Module Select (accessed via /table_layout_editor directly)
}


@frappe.whitelist()
def get_available_modules():
    """Get list of available modules based on user's roles and operational context.

    IMPORTANT: Uses centralized operational context.
    - No longer accepts pos_profile or branch parameters
    - POS Profile and branch resolved via operational_context module
    - Aggregates active opening + today's sessions in one payload
    - Module URLs are always base routes (no query string)

    Returns:
        dict: Available modules list with operational context metadata
    """
    try:
        role_context = get_user_role_context()
        if role_context.get("is_guest"):
            frappe.throw(_('Please login to continue'))

        # Get operational context (authoritative source)
        active_context = get_active_operational_context(
            user=frappe.session.user,
            auto_resolve=False
        )
        resolved_context = resolve_operational_context(
            user=frappe.session.user,
            requested_profile=active_context.get("pos_profile") if active_context else None
        )
        pos_profile = active_context.get("pos_profile") if active_context else None
        branch = active_context.get("branch") if active_context else None

        if not pos_profile:
            pos_profile = resolved_context.get("current_pos_profile")
        if not branch:
            branch = resolved_context.get("current_branch")

        # Get user roles
        user_roles = role_context.get("roles", [])

        # Administrator or System Manager sees all modules
        is_admin = role_context.get("is_admin", False)

        # Filter modules based on user roles
        available_modules = []
        for module_type, config in MODULE_CONFIGS.items():
            required_roles = config.get('requires_roles', [])

            # Admin bypass: show all modules
            # Regular users: check if they have any of the required roles
            if is_admin or any(role in user_roles for role in required_roles):
                module_url = config['url']
                requires_pos_profile = config.get('requires_pos_profile', False)

                available_modules.append({
                    'type': config['type'],
                    'name': config['name'],
                    'description': config['description'],
                    'url': module_url,
                    'base_url': module_url,  # Consistent naming
                    'icon': config['icon'],
                    'requires_session': config.get('requires_session', False),
                    'requires_opening': config.get('requires_opening', False),
                    'requires_pos_profile': requires_pos_profile,
                    'requires_active_cashier': config.get('requires_active_cashier', False),
                    'order': config.get('order', 99)
                })

        # Sort by order
        available_modules.sort(key=lambda x: x['order'])
        
        # Log for debugging when no modules are available
        if not available_modules:
            frappe.log_error(
                f"No modules available for user: {frappe.session.user}\n"
                f"User roles: {user_roles}\n"
                f"Is admin: {is_admin}\n"
                f"Required roles per module:\n" + 
                "\n".join([f"  - {k}: {v.get('requires_roles', [])}" for k, v in MODULE_CONFIGS.items()]),
                "IMOGI POS: No Modules Available"
            )

        active_opening = _get_active_pos_opening_for_context(
            {"current_pos_profile": pos_profile},
            frappe.session.user
        )
        sessions_today = _get_pos_sessions_today_for_context({"current_branch": branch})

        # Return modules with operational context + opening/session info
        return {
            'modules': available_modules,
            'context': {
                'current_pos_profile': pos_profile,
                'current_branch': branch,
                'available_pos_profiles': resolved_context.get('available_pos_profiles', []),
                'branches': resolved_context.get('branches', []),
                'require_selection': resolved_context.get('require_selection', False),
                'is_privileged': resolved_context.get('is_privileged', False),
                'roles': user_roles  # Add user roles for frontend filtering if needed
            },
            'active_opening': active_opening,
            'sessions_today': sessions_today,
            'debug_info': {
                'user_roles': user_roles,
                'is_admin': is_admin,
                'total_modules_configured': len(MODULE_CONFIGS),
                'modules_available': len(available_modules)
            }
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
        
        user_roles = frappe.get_roles(user)
        is_system_manager = 'System Manager' in user_roles
        
        # Get user's primary branch with multiple fallbacks
        current_branch = None
        
        # Priority 1: Custom field imogi_default_branch (IMOGI POS standard)
        # This is the primary branch assignment method for IMOGI POS
        if frappe.db.has_column('User', 'imogi_default_branch'):
            current_branch = frappe.db.get_value('User', user, 'imogi_default_branch')
        
        # Priority 2: User Defaults (Frappe standard fallback)
        # Only used if imogi_default_branch is not set
        if not current_branch:
            current_branch = frappe.defaults.get_user_default("branch")
        
        # Priority 3: Global default branch (final fallback)
        if not current_branch:
            current_branch = frappe.defaults.get_global_default("branch")
        
        # Get available branches from Branch doctype
        available_branches = []
        
        # Check if Branch doctype exists
        if not frappe.db.exists('DocType', 'Branch'):
            frappe.throw(_('Branch DocType does not exist. Please create Branch master first.'))
        
        try:
            # Use pluck to get only branch names - most robust method
            # Avoids issues with fields like 'disabled', 'company' that may not exist
            # ignore_permissions=True allows all authenticated users to see branch list
            branch_names = frappe.get_all(
                'Branch',
                pluck='name',
                ignore_permissions=True
            )
            
            # Transform to match expected format {name: "Main", branch: "Main"}
            if branch_names:
                available_branches = [
                    {'name': name, 'branch': name}
                    for name in branch_names
                ]
        except Exception as e:
            frappe.log_error(f'Error fetching branches: {str(e)}')
            frappe.throw(_('Error loading branches. Please check Branch DocType configuration.'))
        
        # If no branches found, throw error
        if not available_branches:
            frappe.log_error(
                f"Branch list empty. user={user}, roles={user_roles}",
                "IMOGI POS: Branch List Empty"
            )
            if is_system_manager:
                frappe.throw(_('No branches configured. Please create at least one Branch.'))
            else:
                frappe.throw(_('No branches configured in the system. Please contact administrator.'))
        
        # Verify current branch exists in available branches
        if current_branch:
            branch_names = [b.get('name') for b in available_branches]
            if current_branch not in branch_names:
                # Current branch from user doesn't exist in available list
                # Use first available instead
                current_branch = available_branches[0].get('name')
                
                # Update user's default branch
                if frappe.db.has_column('User', 'imogi_default_branch'):
                    try:
                        frappe.db.set_value('User', user, 'imogi_default_branch', current_branch)
                        frappe.db.commit()
                    except:
                        pass
        
        # If current branch is still None, use first available
        if not current_branch and available_branches:
            current_branch = available_branches[0].get('name')
            
            # Set it as user's default for next time
            if frappe.db.has_column('User', 'imogi_default_branch'):
                try:
                    frappe.db.set_value('User', user, 'imogi_default_branch', current_branch)
                    frappe.db.commit()
                except:
                    pass
        
        # Final validation before return
        if not current_branch:
            # Enhanced error message for troubleshooting
            debug_info = {
                'user': user,
                'has_imogi_field': frappe.db.has_column('User', 'imogi_default_branch'),
                'imogi_value': frappe.db.get_value('User', user, 'imogi_default_branch') if frappe.db.has_column('User', 'imogi_default_branch') else None,
                'user_default': frappe.defaults.get_user_default("branch"),
                'global_default': frappe.defaults.get_global_default("branch"),
                'available_count': len(available_branches)
            }
            
            frappe.log_error(
                f'Unable to determine branch for user {user}.\n'
                f'Debug info: {debug_info}',
                'IMOGI POS: Branch Config Error'
            )
            
            frappe.throw(_(
                'No branch configured for your account. '
                'Please set a default branch in User → Defaults → branch field, '
                'or ask administrator to assign a branch to your user profile.'
            ))
        
        return {
            'current_branch': current_branch,
            'available_branches': available_branches
        }
    
    except (frappe.ValidationError, frappe.PermissionError):
        # Let Frappe validation/permission errors bubble up so UI shows the real cause
        raise
    except Exception as e:
        # Enhanced error logging with traceback for unexpected errors
        import traceback
        error_msg = f'Error in get_user_branch_info: {str(e)}\n{traceback.format_exc()}'
        frappe.log_error(error_msg, 'IMOGI POS: Branch Info Error')
        frappe.throw(_('Unable to determine branch. Please contact administrator.'))


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _normalize_active_opening(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload or {}
    return {
        'pos_opening_entry': payload.get('pos_opening_entry'),
        'pos_profile_name': payload.get('pos_profile_name'),
        'opening_balance': payload.get('opening_balance', 0),
        'balance_details': _as_list(payload.get('balance_details')),
        'timestamp': payload.get('timestamp'),
        'company': payload.get('company'),
        'status': payload.get('status'),
        'scope': payload.get('scope'),
        'error_code': payload.get('error_code'),
        'error_message': payload.get('error_message'),
        'messages': _as_list(payload.get('messages')),
        'warnings': _as_list(payload.get('warnings')),
    }


def _empty_active_opening() -> Dict[str, Any]:
    return _normalize_active_opening({
        'pos_opening_entry': None,
        'pos_profile_name': None,
        'opening_balance': 0,
        'balance_details': [],
        'timestamp': None,
        'company': None,
        'status': None,
        'messages': [],
        'warnings': [],
    })


def _resolve_pos_opening_date_field():
    if frappe.db.has_column('POS Opening Entry', 'posting_date'):
        return 'posting_date'
    if frappe.db.has_column('POS Opening Entry', 'period_start_date'):
        return 'period_start_date'
    return 'creation'


def _get_active_pos_opening_for_context(context: Optional[Dict[str, Any]], user: str) -> Dict[str, Any]:
    from imogi_pos.utils.pos_opening import resolve_active_pos_opening

    pos_profile = None
    if isinstance(context, dict):
        pos_profile = context.get('current_pos_profile') or context.get('pos_profile')
    scope = context.get('scope') if isinstance(context, dict) else None
    device_id = None
    if isinstance(context, dict):
        device_id = context.get('device_id')
    if not device_id and hasattr(frappe.local, "request") and frappe.local.request:
        device_id = frappe.local.request.headers.get("X-Device-ID")

    if not pos_profile:
        return _empty_active_opening()

    opening = resolve_active_pos_opening(
        pos_profile=pos_profile,
        scope=scope,
        user=user,
        device_id=device_id,
    )

    return _normalize_active_opening({
        'pos_opening_entry': opening.get('pos_opening_entry'),
        'pos_profile_name': opening.get('pos_profile_name'),
        'opening_balance': opening.get('opening_balance', 0),
        'balance_details': opening.get('balance_details'),
        'timestamp': opening.get('timestamp'),
        'company': opening.get('company'),
        'status': opening.get('status'),
        'scope': opening.get('scope'),
        'error_code': opening.get('error_code'),
        'error_message': opening.get('error_message'),
        'messages': opening.get('messages'),
        'warnings': opening.get('warnings'),
    })


def _get_pos_sessions_today_for_context(context):
    branch = None
    if isinstance(context, dict):
        branch = context.get('current_branch') or context.get('branch')

    if not branch:
        return {
            'sessions': [],
            'total': 0,
            'branch': None
        }

    pos_profiles = frappe.get_list(
        'POS Profile',
        filters={'imogi_branch': branch},
        fields=['name', 'company'],
        limit_page_length=0
    )

    if not pos_profiles:
        return {
            'sessions': [],
            'total': 0,
            'branch': branch
        }

    profile_names = [p.get('name') for p in pos_profiles]
    date_field = _resolve_pos_opening_date_field()

    sessions = frappe.get_list(
        'POS Opening Entry',
        filters={
            'docstatus': 1,  # Submitted
            'status': 'Open',
            'pos_profile': ['in', profile_names],
            date_field: ['>=', frappe.utils.today()]
        },
        fields=['name', 'pos_profile', 'user', 'opening_balance', date_field, 'status'],
        order_by=f'{date_field} desc'
    )

    session_list = []
    for session in sessions:
        session_list.append({
            'name': session.get('name'),
            'pos_profile': session.get('pos_profile'),
            'user': session.get('user'),
            'opening_balance': session.get('opening_balance', 0),
            'period_start_date': session.get(date_field),
            'status': session.get('status')
        })

    return {
        'sessions': session_list,
        'total': len(session_list),
        'branch': branch
    }


@frappe.whitelist()
def get_active_pos_opening() -> Dict[str, Any]:
    """Get the active POS opening entry for the current user.
    
    IMPORTANT: Uses centralized operational context.
    - No longer accepts pos_profile or branch parameters
    - Context managed via operational_context module
    - System Managers can check POS opening even without assigned context
        
    Returns:
        dict: POS Opening Entry information with:
            - pos_opening_entry: Name of active POS Opening Entry (or None)
            - pos_profile_name: POS Profile used
            - opening_balance: Opening cash balance
            - timestamp: When session was opened
            - company: Company from POS Profile
            - messages: list of informational messages (always list)
            - warnings: list of warning messages (always list)
    """
    user = frappe.session.user
    if not user or user == 'Guest':
        return _empty_active_opening()

    try:
        from imogi_pos.utils.operational_context import require_operational_context

        context = require_operational_context(allow_optional=True)
        return _get_active_pos_opening_for_context(
            {
                "current_pos_profile": context.get("pos_profile"),
                "scope": context.get("scope"),
                "device_id": context.get("device_id"),
            },
            user,
        )
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(f'Error in get_active_pos_opening: {str(e)}')
        return _empty_active_opening()


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
def check_active_cashiers():
    """
    Check if there are any active cashier POS openings at current branch.
    Used to validate that payment can be processed for Waiter/Kiosk/Self-Order modules.
    
    IMPORTANT: Uses centralized operational context.
    - No longer accepts pos_profile or branch parameters
    - Context managed via operational_context module
    """
    try:
        context = get_active_operational_context(
            user=frappe.session.user,
            auto_resolve=True
        )
        branch = context.get('branch')
        
        if not branch:
            return {
                'has_active_cashier': False,
                'active_sessions': [],
                'total_cashiers': 0,
                'message': 'No branch configured for user',
                'branch': None
            }
        
        # Find POS Profiles for this branch
        pos_profiles = frappe.get_list(
            'POS Profile',
            filters={'imogi_branch': branch},
            fields=['name', 'company'],
            limit_page_length=0
        )
        
        if not pos_profiles:
            return {
                'has_active_cashier': False,
                'active_sessions': [],
                'total_cashiers': 0,
                'message': f'No POS Profiles configured for branch {branch}',
                'branch': branch
            }
        
        profile_names = [p.get('name') for p in pos_profiles]
        
        # Query active POS Opening Entries for Cashier module
        active_cashier_sessions = frappe.get_list(
            'POS Opening Entry',
            filters={
                'status': 'Open',
                'docstatus': 1,
                'pos_profile': ['in', profile_names],
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
            'message': 'Active cashier found' if has_active else 'No active cashier sessions. Please ask a cashier to open a POS opening first.',
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


@frappe.whitelist()
def get_pos_sessions_today():
    """
    Get all POS openings created today at current branch.
    Used for opening selector in module select UI.
    
    IMPORTANT: Uses centralized operational context.
    - No longer accepts branch parameter
    - Context managed via operational_context module
    """
    try:
        context = get_active_operational_context(
            user=frappe.session.user,
            auto_resolve=True
        )
        branch = context.get("branch")
        return _get_pos_sessions_today_for_context({"current_branch": branch})

    except Exception as e:
        frappe.log_error(f'Error in get_pos_sessions_today: {str(e)}')
        return {
            'sessions': [],
            'total': 0,
            'branch': context.get('branch') if isinstance(context, dict) else None,
            'error': str(e)
        }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def has_module_access(module_type, user=None):
    """
    Check if user has access to specific module.
    
    Args:
        module_type (str): Module type (e.g., 'cashier', 'waiter', 'kitchen')
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        bool: True if user has access to module
    """
    if not user:
        user = frappe.session.user
    
    # Guest cannot access most modules
    if user == 'Guest':
        # Only allow Guest for specific modules
        guest_allowed = ['self-order', 'customer-display']
        return module_type in guest_allowed
    
    # Administrator always has access
    if user == 'Administrator':
        return True
    
    user_roles = frappe.get_roles(user)
    
    # System Manager always has access
    if 'System Manager' in user_roles:
        return True
    
    # Check module configuration
    if module_type not in MODULE_CONFIGS:
        return False
    
    required_roles = MODULE_CONFIGS[module_type].get('requires_roles', [])
    return any(role in user_roles for role in required_roles)


def get_module_config(module_type):
    """
    Get configuration for specific module.
    
    Args:
        module_type (str): Module type (e.g., 'cashier', 'waiter')
        
    Returns:
        dict: Module configuration or None if not found
    """
    return MODULE_CONFIGS.get(module_type)


def get_user_default_module(user=None):
    """
    Get default module for user based on their primary role.
    
    Args:
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        str: Module type (e.g., 'cashier', 'waiter') or 'module-select'
    """
    if not user:
        user = frappe.session.user
    
    if user == 'Guest':
        return 'self-order'
    
    user_roles = frappe.get_roles(user)
    
    # Priority-based routing
    if 'System Manager' in user_roles or 'Administrator' == user:
        return 'module-select'
    
    if 'Branch Manager' in user_roles or 'Area Manager' in user_roles:
        return 'module-select'
    
    # Operational staff - direct to their module
    if 'Cashier' in user_roles:
        return 'cashier'
    
    if 'Waiter' in user_roles:
        return 'waiter'
    
    if 'Kitchen Staff' in user_roles:
        return 'kitchen'
    
    # Default to module select for unrecognized roles
    return 'module-select'


@frappe.whitelist()
def get_module_access_info(module_type, user=None):
    """
    API endpoint to check module access for user.
    
    Args:
        module_type (str): Module type to check
        user (str, optional): User to check. Defaults to current user.
        
    Returns:
        dict: Access information including has_access, required_roles, config
    """
    if not user:
        user = frappe.session.user
    
    # Only allow users to query their own access unless privileged
    if user != frappe.session.user:
        if frappe.session.user != 'Administrator' and 'System Manager' not in frappe.get_roles():
            frappe.throw(_('You can only query your own module access'), frappe.PermissionError)
    
    config = get_module_config(module_type)
    has_access = has_module_access(module_type, user)
    user_roles = frappe.get_roles(user)
    
    return {
        'module_type': module_type,
        'has_access': has_access,
        'user': user,
        'user_roles': user_roles,
        'required_roles': config.get('requires_roles', []) if config else [],
        'module_config': config
    }
