# -*- coding: utf-8 -*-
"""Decorator utilities for IMOGI POS API endpoints."""

import frappe
from frappe import _
from functools import wraps
from imogi_pos.utils.permissions import validate_api_permission, has_privileged_access


def require_permission(doctype, perm_type="read", validate_branch=False):
    """Decorator to require specific permission for API endpoint.
    
    Administrator and System Manager bypass this check.
    Other users must have the specified permission.
    
    Args:
        doctype (str): DocType to check permission for
        perm_type (str): Permission type (read, write, create, delete, etc.)
        validate_branch (bool): If True, extract and validate branch parameter
    
    Example:
        @frappe.whitelist()
        @require_permission("POS Order", "write")
        def update_order(order_name):
            # User has write permission on POS Order
            pass
            
        @frappe.whitelist()
        @require_permission("POS Order", "read", validate_branch=True)
        def get_orders(branch, pos_profile):
            # User has read permission on POS Order AND branch access
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users
            if not has_privileged_access():
                # Validate permission with informative error message
                validate_api_permission(doctype, perm_type=perm_type, throw=True)
                
                # Validate branch access if required
                if validate_branch:
                    from imogi_pos.utils.permissions import validate_branch_access
                    import inspect
                    
                    # Extract branch parameter from function signature
                    sig = inspect.signature(fn)
                    branch = None
                    
                    # Try to get branch from kwargs first
                    if 'branch' in kwargs:
                        branch = kwargs['branch']
                    else:
                        # Try to get from positional args
                        param_names = list(sig.parameters.keys())
                        if 'branch' in param_names:
                            branch_idx = param_names.index('branch')
                            if branch_idx < len(args):
                                branch = args[branch_idx]
                    
                    # Validate if branch was found
                    if branch:
                        validate_branch_access(branch, throw=True)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_any_permission(*doctypes, perm_type="read"):
    """Decorator to require permission on any of the specified DocTypes.
    
    Administrator and System Manager bypass this check.
    Other users must have permission on at least one of the specified DocTypes.
    
    Args:
        *doctypes: Variable number of DocType names
        perm_type (str): Permission type (read, write, create, delete, etc.)
    
    Example:
        @frappe.whitelist()
        @require_any_permission("POS Order", "Sales Invoice", perm_type="read")
        def get_order_data(order_name):
            # User has read permission on either POS Order or Sales Invoice
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users
            if has_privileged_access():
                return fn(*args, **kwargs)
            
            # Check if user has permission on any of the specified DocTypes
            has_any_permission = False
            for doctype in doctypes:
                if validate_api_permission(doctype, perm_type=perm_type, throw=False):
                    has_any_permission = True
                    break
            
            if not has_any_permission:
                user = frappe.session.user
                user_roles = ", ".join(frappe.get_roles(user))
                
                error_msg = _(
                    "Access Denied: You do not have {0} permission on any of: {1}\n"
                    "Current user: {2}\n"
                    "Your roles: {3}\n"
                    "This operation requires appropriate permissions. "
                    "Please contact your system administrator if you need access."
                ).format(
                    perm_type,
                    ", ".join(doctypes),
                    user,
                    user_roles
                )
                
                frappe.throw(error_msg, frappe.PermissionError)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_role(*roles):
    """Decorator to require specific role(s) for API endpoint.
    
    Administrator and System Manager bypass this check.
    Other users must have at least one of the specified roles.
    
    Args:
        *roles: Variable number of role names
    
    Example:
        @frappe.whitelist()
        @require_role("Cashier", "Branch Manager")
        def create_pos_order():
            # User has Cashier or Branch Manager role
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users
            if has_privileged_access():
                return fn(*args, **kwargs)
            
            # Check if user has any of the required roles
            user_roles = frappe.get_roles(frappe.session.user)
            has_required_role = any(role in user_roles for role in roles)
            
            if not has_required_role:
                user = frappe.session.user
                user_roles_str = ", ".join(user_roles)
                
                error_msg = _(
                    "Access Denied: This operation requires one of these roles: {0}\n"
                    "Current user: {1}\n"
                    "Your roles: {2}\n"
                    "Please contact your system administrator if you need access."
                ).format(
                    ", ".join(roles),
                    user,
                    user_roles_str
                )
                
                frappe.throw(error_msg, frappe.PermissionError)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def log_api_call(fn):
    """Decorator to log API calls for auditing purposes.
    
    Example:
        @frappe.whitelist()
        @log_api_call
        def critical_operation():
            pass
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            result = fn(*args, **kwargs)
            
            # Log successful call
            frappe.logger().info(
                f"API Call: {fn.__name__} by {frappe.session.user} - Success"
            )
            
            return result
        except Exception as e:
            # Log failed call
            frappe.logger().error(
                f"API Call: {fn.__name__} by {frappe.session.user} - Failed: {str(e)}"
            )
            raise
    
    return wrapper


def require_config_access(config_doctype, perm_type="write"):
    """Decorator to require permission on configuration DocType.
    
    ERPNext v15 Native Pattern for Configuration UIs:
    - Administrator and System Manager bypass check
    - Regular users require DocType permission
    - Uses frappe.has_permission() for native integration
    - Throws informative frappe.PermissionError
    
    This decorator is for CONFIGURATION UIs (editors/management pages)
    that do NOT require POS Profile. For runtime operational modules,
    use @require_runtime_access instead.
    
    Args:
        config_doctype (str): Configuration DocType name
        perm_type (str): Permission type (read, write, create, delete)
    
    Example:
        @frappe.whitelist()
        @require_config_access('Customer Display Profile', 'write')
        def save_display_config(profile_name, config):
            # User needs write permission on Customer Display Profile
            # No POS Profile validation (correct for config UI)
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users (ERPNext v15 standard)
            if not has_privileged_access():
                # Use centralized permission validation
                validate_api_permission(config_doctype, perm_type=perm_type, throw=True)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_runtime_access(requires_pos_profile=True, requires_opening=False):
    """Decorator to require runtime operational access.
    
    ERPNext v15 Native Pattern for Runtime Modules:
    - Validates user is in POS Profile User table (if requires_pos_profile)
    - Validates active POS Opening exists (if requires_opening)
    - Administrator and System Manager bypass checks
    
    This decorator is for RUNTIME/OPERATIONAL modules (cashier, waiter, kitchen)
    that require active POS Profile. For configuration UIs (editors),
    use @require_config_access instead.
    
    Args:
        requires_pos_profile (bool): Require user to have assigned POS Profile
        requires_opening (bool): Require active POS Opening to exist
    
    Example:
        @frappe.whitelist()
        @require_runtime_access(requires_pos_profile=True, requires_opening=True)
        def create_pos_order(pos_profile):
            # User must be in POS Profile User table
            # Active POS Opening must exist
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users
            if has_privileged_access():
                return fn(*args, **kwargs)
            
            user = frappe.session.user
            
            # Validate POS Profile access if required
            if requires_pos_profile:
                # Get pos_profile from function args/kwargs
                pos_profile = kwargs.get('pos_profile') or (args[0] if args else None)
                
                if not pos_profile:
                    frappe.throw(
                        _('POS Profile is required for this operation'),
                        frappe.ValidationError
                    )
                
                # Check if user is in POS Profile User table
                has_access = frappe.db.exists('POS Profile User', {
                    'parent': pos_profile,
                    'user': user
                })
                
                if not has_access:
                    user_roles = ", ".join(frappe.get_roles(user))
                    error_msg = _(
                        "Access Denied: You are not assigned to POS Profile '{0}'.\n"
                        "Current user: {1}\n"
                        "Your roles: {2}\n"
                        "Please contact your Branch Manager to assign you to this POS Profile."
                    ).format(pos_profile, user, user_roles)
                    
                    frappe.throw(error_msg, frappe.PermissionError)
            
            # Validate POS Opening if required
            if requires_opening:
                pos_profile = kwargs.get('pos_profile') or (args[0] if args else None)
                
                if not pos_profile:
                    frappe.throw(
                        _('POS Profile is required to check POS Opening'),
                        frappe.ValidationError
                    )
                
                # Check for active POS Opening
                opening = frappe.db.get_value(
                    'POS Opening Entry',
                    {
                        'pos_profile': pos_profile,
                        'user': user,
                        'docstatus': 1,
                        'status': 'Open'
                    },
                    'name'
                )
                
                if not opening:
                    frappe.throw(
                        _('No active POS Opening found for profile {0}. Please open a POS session first.').format(pos_profile),
                        frappe.ValidationError
                    )
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator
