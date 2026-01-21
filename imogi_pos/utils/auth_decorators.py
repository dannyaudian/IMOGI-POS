"""
Authentication decorators for www pages.

These decorators provide centralized authentication and authorization
for public web pages (www/) in the IMOGI POS system.
"""

import frappe
from frappe import _
from functools import wraps


def require_login(redirect_to=None):
    """
    Decorator to ensure user is logged in.
    
    If user is Guest, redirects to login page with return URL.
    
    Args:
        redirect_to: Optional custom redirect path. If None, uses current request path.
    
    Example:
        @require_login()
        def get_context(context):
            # User is guaranteed to be logged in
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if frappe.session.user == "Guest":
                redirect_path = redirect_to or frappe.request.path
                raise frappe.Redirect(f"/imogi-login?redirect={redirect_path}")
            return func(*args, **kwargs)
        return wrapper
    return decorator


def require_roles(*roles):
    """
    Decorator to enforce role requirements.
    
    User must have at least one of the specified roles to access the page.
    If user is Guest, redirects to login. If logged in without required role,
    throws PermissionError.
    
    Args:
        *roles: Variable number of role names (strings)
    
    Example:
        @require_roles("Cashier", "Restaurant Manager", "System Manager")
        def get_context(context):
            # User has one of the required roles
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Check if user is logged in
            if frappe.session.user == "Guest":
                raise frappe.Redirect(f"/imogi-login?redirect={frappe.request.path}")
            
            # Check if user has required role
            user_roles = frappe.get_roles(frappe.session.user)
            if not any(role in user_roles for role in roles):
                frappe.throw(
                    _("Access denied: This page requires one of these roles: {0}").format(
                        ", ".join(roles)
                    ),
                    frappe.PermissionError
                )
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def allow_guest_if_configured(setting_field="imogi_allow_guest_access", setting_doctype="Restaurant Settings"):
    """
    Decorator to allow guest access if enabled in settings.
    
    This is used for pages like Kiosk and Self-Order that can optionally
    allow unauthenticated access based on configuration.
    
    Args:
        setting_field: Name of the boolean field in settings DocType
        setting_doctype: Name of the settings DocType to check
    
    Example:
        @allow_guest_if_configured("imogi_kiosk_allow_guest")
        def get_context(context):
            # Guest access allowed if setting is enabled
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if frappe.session.user == "Guest":
                try:
                    # Check if settings DocType exists
                    if not frappe.db.exists("DocType", setting_doctype):
                        raise frappe.Redirect(f"/imogi-login?redirect={frappe.request.path}")
                    
                    # Get settings
                    settings = frappe.get_cached_doc(setting_doctype)
                    
                    # Check if guest access is allowed
                    if not settings.get(setting_field):
                        raise frappe.Redirect(f"/imogi-login?redirect={frappe.request.path}")
                except frappe.DoesNotExistError:
                    # Settings doc doesn't exist, require login
                    raise frappe.Redirect(f"/imogi-login?redirect={frappe.request.path}")
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def require_pos_profile(allow_fallback=True):
    """
    Decorator to ensure user has an assigned POS Profile.
    
    Checks if user has a POS Profile assigned. If not and allow_fallback is True,
    attempts to get default profile for the domain. Throws error if no profile found.
    
    Args:
        allow_fallback: If True, tries to get default profile when user has none
    
    Example:
        @require_pos_profile()
        def get_context(context):
            # User has POS Profile access
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from imogi_pos.utils.auth_helpers import get_user_pos_profile
            
            pos_profile = get_user_pos_profile(allow_fallback=allow_fallback)
            
            if not pos_profile:
                frappe.throw(
                    _("No POS Profile assigned to your user. Please contact your administrator."),
                    frappe.ValidationError
                )
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


def require_branch_access(branch_param="branch"):
    """
    Decorator to validate user has access to the specified branch.
    
    Checks query parameter or form data for branch name and validates access.
    
    Args:
        branch_param: Name of the parameter containing branch name
    
    Example:
        @require_branch_access()
        def get_context(context):
            # User has access to the branch in query param
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from imogi_pos.utils.auth_helpers import validate_branch_access
            
            # Get branch from request
            branch = frappe.form_dict.get(branch_param)
            
            if branch:
                validate_branch_access(branch)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator
