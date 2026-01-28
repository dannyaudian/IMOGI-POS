# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

"""
IMOGI POS Public API Module

This module provides public-facing APIs for:
- POS Profile management (primary configuration mechanism)
- Branch selection (derived from POS Profile)
- Session management
- Branding configuration

Architecture Pattern: POS Profile First
- All modules receive pos_profile as primary identifier
- Branch is derived from pos_profile.imogi_branch
- User access controlled via POS Profile User table
"""

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now, nowdate, get_url, flt
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.permission_manager import check_branch_access, check_doctype_permission
from imogi_pos.utils.decorators import require_permission, require_role
from imogi_pos.utils.auth_helpers import (
    get_user_role_context,
    get_role_based_default_route,
)

__all__ = [
    "health",
    "get_branding",
    "get_active_branch",
    "set_active_branch",
    "check_session",
    "get_current_user_info",
    "check_permission",
]


# ============================================================================
# STANDARD API RESPONSE HELPERS
# ============================================================================

def api_success(data=None, message=None, meta=None):
    """
    Create standardized success response for IMOGI POS APIs.
    
    Args:
        data (any): Main response data
        message (str, optional): Success message
        meta (dict, optional): Metadata (timestamps, pagination, etc.)
    
    Returns:
        dict: Standardized response format
    
    Example:
        >>> return api_success(
        ...     data={'modules': [...]},
        ...     message='Modules loaded successfully',
        ...     meta={'count': 5}
        ... )
        {
            'success': True,
            'data': {'modules': [...]},
            'message': 'Modules loaded successfully',
            'meta': {'count': 5, 'timestamp': '2026-01-26 12:00:00'}
        }
    """
    response = {
        'success': True,
        'data': data
    }
    
    if message:
        response['message'] = message
    
    if meta is None:
        meta = {}
    
    meta['timestamp'] = now()
    meta['user'] = frappe.session.user
    response['meta'] = meta
    
    return response


def api_error(message, code=None, details=None):
    """
    Create standardized error response for IMOGI POS APIs.
    
    Note: This does NOT throw - use with frappe.throw() for HTTP errors.
    
    Args:
        message (str): Error message
        code (str, optional): Error code for client handling
        details (dict, optional): Additional error details
    
    Returns:
        dict: Standardized error format
    
    Example:
        >>> frappe.throw(
        ...     api_error('POS Profile not found', code='PROFILE_NOT_FOUND'),
        ...     exc=frappe.DoesNotExistError
        ... )
    """
    response = {
        'success': False,
        'error': {
            'message': message,
            'code': code or 'UNKNOWN_ERROR',
            'timestamp': now()
        }
    }
    
    if details:
        response['error']['details'] = details
    
    return response

@frappe.whitelist(allow_guest=True)
def health():
    """
    Simple health check endpoint to verify the service is running.
    
    Returns:
        dict: Status information including timestamp and app version
    """
    return {
        "status": "ok",
        "timestamp": now(),
        "app_version": frappe.get_app_version("imogi_pos"),
        "server": get_url()
    }

@frappe.whitelist()
def get_branding():
    """
    Get branding information based on operational context POS Profile.
    Falls back to global settings if no context.
    
    IMPORTANT: Now uses centralized operational context.
    - No longer accepts pos_profile parameter
    - Context managed server-side via operational_context module
    
    Returns:
        dict: Branding information including logo URLs and colors
    """
    from imogi_pos.utils.operational_context import get_active_operational_context
    
    company = frappe.defaults.get_global_default('company') or "IMOGI POS"
    
    result = {
        "brand_name": company,
        "company_name": company,  # Alias for compatibility
        "logo": None,
        "logo_dark": None,
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
        "show_header": True,
        "home_url": get_url(),
        "css_vars": ""
    }
    
    # Get POS Profile from operational context
    context = get_active_operational_context(auto_resolve=True)
    pos_profile = context.get("pos_profile")
    
    # Try to get branding from POS Profile
    if pos_profile:
        try:
            profile = frappe.get_doc("POS Profile", pos_profile)
            
            if profile.get("imogi_brand_name"):
                result["brand_name"] = profile.imogi_brand_name
                
            if profile.get("imogi_brand_logo"):
                result["logo"] = profile.imogi_brand_logo
                
            if profile.get("imogi_brand_logo_dark"):
                result["logo_dark"] = profile.imogi_brand_logo_dark
                
            if profile.get("imogi_brand_color_primary"):
                result["primary_color"] = profile.imogi_brand_color_primary
                
            if profile.get("imogi_brand_color_accent"):
                result["accent_color"] = profile.imogi_brand_color_accent
                
            if profile.get("imogi_brand_header_bg"):
                result["header_bg"] = profile.imogi_brand_header_bg
                
            if profile.get("imogi_show_header_on_pages") is not None:
                result["show_header"] = profile.imogi_show_header_on_pages
                
            if profile.get("imogi_brand_home_url"):
                result["home_url"] = profile.imogi_brand_home_url
                
            if profile.get("imogi_brand_css_vars"):
                result["css_vars"] = profile.imogi_brand_css_vars
                
        except frappe.DoesNotExistError:
            frappe.log_error(f"POS Profile {pos_profile} not found for branding")

    # Fallback to Restaurant Settings if POS Profile doesn't have branding
    if not result["logo"]:
        try:
            restaurant_settings = frappe.get_doc("Restaurant Settings")
            if restaurant_settings.get("imogi_brand_logo"):
                result["logo"] = restaurant_settings.imogi_brand_logo

            if restaurant_settings.get("imogi_brand_logo_dark"):
                result["logo_dark"] = restaurant_settings.imogi_brand_logo_dark
        except frappe.DoesNotExistError:
            frappe.log_error("Restaurant Settings not found for branding")
        except Exception as err:
            frappe.log_error(f"Unexpected error loading Restaurant Settings for branding: {err}")
    
    # Final fallback to company logo
    if not result["logo"]:
        company = frappe.defaults.get_global_default('company')
        if company:
            company_logo = frappe.get_value("Company", company, "company_logo")
            if company_logo:
                result["logo"] = company_logo
    
    # Format URLs for logo paths
    if result["logo"] and not result["logo"].startswith(("http:", "https:", "/")):
        result["logo"] = get_url(result["logo"])

    if result["logo_dark"] and not result["logo_dark"].startswith(("http:", "https:", "/")):
        result["logo_dark"] = get_url(result["logo_dark"])

    return result


@frappe.whitelist()
def get_active_branch():
    """Return the active branch for the current user.

    Checks the user's default branch setting and falls back to the branch
    associated with their resolved POS Profile (centralized resolver).

    NOTE ON DefaultValue:
        DefaultValue DocType is no longer required for POS access. Branch
        resolution uses the POS Profile doctype as the authoritative source,
        and only falls back to defaults when explicitly set by the user.

    Returns:
        str | None: Branch name if available.
    """

    branch = frappe.defaults.get_user_default("imogi_branch")
    if branch:
        return branch

    # DEPRECATED: Use operational_context.get_operational_context() instead
    # Kept for backward compatibility with legacy clients
    try:
        from imogi_pos.utils.operational_context import resolve_operational_context

        last_used = frappe.form_dict.get('last_used')
        context = resolve_operational_context(
            user=frappe.session.user,
            requested_profile=last_used
        )
        if context.get('current_pos_profile'):
            return frappe.db.get_value("POS Profile", context["current_pos_profile"], "imogi_branch")
    except Exception:
        pass

    return None


@frappe.whitelist()
def set_active_branch(branch):
    """Persist the user's active branch after verifying access rights.

    Args:
        branch (str): Branch name to set as active.

    Returns:
        str | None: The branch that was set, or ``None`` if input was falsy.
    """

    if not branch:
        return None

    check_branch_access(branch)
    frappe.defaults.set_user_default("imogi_branch", branch)
    return branch


@frappe.whitelist(allow_guest=True)
def check_session():
    """Check if the current session is valid.

    Returns:
        dict: Session information with validity flag and redirect URL.
    """

    user = frappe.session.user
    is_authenticated = user and user != "Guest"
    
    return {
        "valid": is_authenticated,
        "user": user,
        "redirect": get_role_based_default_route(user) if is_authenticated else None,
    }


def _get_role_based_redirect(roles):
    """Return the default landing page based on the provided roles.
    
    DEPRECATED: Use get_role_based_default_route() from auth_helpers instead.
    This function is kept for backwards compatibility only.
    """
    # For backwards compatibility, delegate to centralized function
    return get_role_based_default_route()


def _normalize_permission_doctype(doctype):
    """Map legacy DocType names to ERPNext v15 equivalents."""
    return doctype


@frappe.whitelist()
def get_current_user_info():
    """Return information about the currently logged-in user.

    Returns:
        dict: User details including full name, roles and default redirect.
    """

    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # Use centralized function for role context
    role_context = get_user_role_context(user)
    user_doc = frappe.get_doc("User", user)
    
    return {
        "user": user,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        "roles": role_context['roles'],
        "default_redirect": get_role_based_default_route(user),
    }


@frappe.whitelist()
def check_permission(doctype, perm_type="read"):
    """Check if current user has the given permission on a DocType.

    Args:
        doctype (str): DocType to check.
        perm_type (str): Permission type like read, write, create, etc.

    Returns:
        bool: ``True`` if user has permission, else ``False``.
    """

    if frappe.session.user == "Guest":
        return False

    doctype = _normalize_permission_doctype(doctype)
    try:
        return bool(frappe.has_permission(doctype=doctype, permtype=perm_type))
    except Exception:
        frappe.log_error(f"Permission check skipped for missing DocType: {doctype}")
        return True


@frappe.whitelist()
def set_user_branch(branch):
    """Set user's current branch preference for IMOGI POS module selection.
    
    DEPRECATED: Use set_user_default_pos_profile() instead. This function
    is maintained for backward compatibility only.
    
    Args:
        branch (str): Branch name to set as default
        
    Returns:
        dict: Success status and message
    """
    frappe.log("DEPRECATION WARNING: set_user_branch() is deprecated. Use set_user_default_pos_profile() instead.")
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        # Verify branch exists
        if not frappe.db.exists('Branch', branch):
            frappe.throw(_('Branch {0} does not exist').format(branch))
        
        # Update user's default branch
        if frappe.db.has_column('User', 'imogi_default_branch'):
            frappe.db.set_value('User', user, 'imogi_default_branch', branch)
            frappe.db.commit()
        else:
            frappe.throw(_('User default branch field not configured'))
        
        return {
            'success': True,
            'message': _('Branch changed to {0}').format(branch),
            'branch': branch
        }
    
    except Exception as e:
        frappe.log_error(f'Error in set_user_branch: {str(e)}')
        frappe.throw(_('Error setting branch. Please try again.'))

