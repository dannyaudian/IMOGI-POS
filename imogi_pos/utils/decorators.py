# -*- coding: utf-8 -*-
"""Decorator utilities for IMOGI POS API endpoints."""

import frappe
from frappe import _
from functools import wraps
from imogi_pos.utils.permissions import validate_api_permission, has_privileged_access


def require_permission(doctype, perm_type="read"):
    """Decorator to require specific permission for API endpoint.
    
    Administrator and System Manager bypass this check.
    Other users must have the specified permission.
    
    Args:
        doctype (str): DocType to check permission for
        perm_type (str): Permission type (read, write, create, delete, etc.)
    
    Example:
        @frappe.whitelist()
        @require_permission("POS Order", "write")
        def update_order(order_name):
            # User has write permission on POS Order
            pass
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Skip check for privileged users
            if not has_privileged_access():
                # Validate permission with informative error message
                validate_api_permission(doctype, perm_type=perm_type, throw=True)
            
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
