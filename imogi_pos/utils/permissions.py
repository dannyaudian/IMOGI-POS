"""Permissions utilities for IMOGI POS."""

import frappe
from frappe import _


def has_privileged_access(user=None):
    """Check if user has privileged access (Administrator or System Manager).
    
    Args:
        user (str, optional): User email. If None, uses current session user.
    
    Returns:
        bool: True if user is Administrator or System Manager
    """
    if not user:
        user = frappe.session.user
    
    if user == "Administrator":
        return True
    
    roles = frappe.get_roles(user)
    return "System Manager" in roles


def validate_api_permission(doctype, doc=None, perm_type="read", throw=True):
    """Validate API permission with informative error messages.
    
    Administrator and System Manager have unrestricted access.
    Other users follow native ERPNext v15+ permission rules.
    
    Args:
        doctype (str): DocType to check permission for
        doc (str, optional): Document name to check permission on
        perm_type (str): Permission type (read, write, create, delete, etc.)
        throw (bool): Whether to throw exception on permission denial
    
    Returns:
        bool: True if user has permission
    
    Raises:
        frappe.PermissionError: If user lacks permission and throw=True
    """
    # Privileged users have unrestricted access
    if has_privileged_access():
        return True
    
    # Check ERPNext native permissions for regular users
    has_permission = frappe.has_permission(doctype, perm_type=perm_type, doc=doc)
    
    if not has_permission and throw:
        user = frappe.session.user
        user_roles = ", ".join(frappe.get_roles(user))
        
        error_msg = _(
            "Access Denied: You do not have permission to {0} {1}.\n"
            "Current user: {2}\n"
            "Your roles: {3}\n"
            "This operation requires appropriate permissions. "
            "Please contact your system administrator if you need access."
        ).format(
            perm_type,
            doctype if not doc else f"{doctype} ({doc})",
            user,
            user_roles
        )
        
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_permission


def validate_branch_access(branch, throw=True):
    """Validate that the current user can access the given branch.
    
    Administrator and System Manager have unrestricted access.
    Other users must have explicit permission to the Branch document.

    Args:
        branch (str): Branch name.
        throw (bool): Whether to throw exception on access denial

    Returns:
        bool: True if user has access
    
    Raises:
        frappe.PermissionError: If the user lacks access to the branch and throw=True
    """
    # Privileged users have unrestricted access
    if has_privileged_access():
        return True
    
    # Check if branch is provided
    if not branch:
        if throw:
            frappe.throw(
                _("Branch is required for this operation. Please contact your system administrator."),
                frappe.ValidationError
            )
        return False
    
    # Check native ERPNext permission for the Branch document
    has_permission = frappe.has_permission("Branch", doc=branch)
    
    if not has_permission and throw:
        user = frappe.session.user
        user_roles = ", ".join(frappe.get_roles(user))
        
        error_msg = _(
            "Access Denied: You do not have permission to access Branch: {0}\n"
            "Current user: {1}\n"
            "Your roles: {2}\n"
            "You are only authorized to access specific branches assigned to you. "
            "Please contact your system administrator if you need access to this branch."
        ).format(branch, user, user_roles)
        
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_permission
