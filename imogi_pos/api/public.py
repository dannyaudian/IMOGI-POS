# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now, nowdate, get_url, flt
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.permissions import validate_branch_access, validate_api_permission
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
    "get_user_pos_profile_info",
    "set_user_default_pos_profile",
]

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
def get_branding(pos_profile=None):
    """
    Get branding information based on the provided POS Profile or fallback
    to global settings.
    
    Args:
        pos_profile (str, optional): Name of the POS Profile. Defaults to None.
    
    Returns:
        dict: Branding information including logo URLs and colors
    """
    result = {
        "brand_name": frappe.defaults.get_global_default('company') or "IMOGI POS",
        "logo": None,
        "logo_dark": None,
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
        "show_header": True,
        "home_url": get_url(),
        "css_vars": ""
    }
    
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
    associated with their default POS Profile.

    Returns:
        str | None: Branch name if available.
    """

    branch = frappe.defaults.get_user_default("imogi_branch")
    if branch:
        return branch

    pos_profile = frappe.defaults.get_user_default("imogi_pos_profile")
    if pos_profile:
        branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
        if branch:
            return branch

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

    validate_branch_access(branch)
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

    return bool(frappe.has_permission(doctype=doctype, permtype=perm_type))


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


@frappe.whitelist()
def get_user_pos_profile_info():
    """Get user's available POS Profiles and current selection.
    
    This is the primary method for POS Profile-first architecture.
    Returns POS Profiles the user has access to via POS Profile User table,
    or all profiles if user is Administrator/System Manager.
    
    Returns:
        dict: Contains:
            - current_pos_profile: Currently selected POS Profile name
            - available_pos_profiles: List of accessible POS Profiles with details
            - branches: Derived list of unique branches from available profiles
    """
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        user_roles = frappe.get_roles(user)
        is_privileged = 'System Manager' in user_roles or 'Administrator' in user_roles
        
        # Get available POS Profiles
        available_pos_profiles = []
        
        if is_privileged:
            # System Manager / Administrator can access all POS Profiles
            profiles = frappe.get_all(
                'POS Profile',
                filters={'disabled': 0},
                fields=['name', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode', 
                        'company', 'imogi_enable_cashier', 'imogi_enable_kot',
                        'imogi_enable_waiter', 'imogi_enable_kitchen']
            )
            available_pos_profiles = profiles
        else:
            # Regular users: get from POS Profile User child table
            profile_users = frappe.get_all(
                'POS Profile User',
                filters={'user': user},
                fields=['parent'],
                pluck='parent'
            )
            
            if profile_users:
                profiles = frappe.get_all(
                    'POS Profile',
                    filters={'name': ['in', profile_users], 'disabled': 0},
                    fields=['name', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode',
                            'company', 'imogi_enable_cashier', 'imogi_enable_kot',
                            'imogi_enable_waiter', 'imogi_enable_kitchen']
                )
                available_pos_profiles = profiles
        
        if not available_pos_profiles:
            frappe.throw(_('No POS Profile configured for your account. Please contact administrator.'))
        
        # Determine current POS Profile
        current_pos_profile = None
        
        # Priority 1: User's default POS Profile field
        if frappe.db.has_column('User', 'imogi_default_pos_profile'):
            current_pos_profile = frappe.db.get_value('User', user, 'imogi_default_pos_profile')
        
        # Priority 2: User defaults (session-based)
        if not current_pos_profile:
            current_pos_profile = frappe.defaults.get_user_default("imogi_pos_profile")
        
        # Validate current_pos_profile is in available list
        profile_names = [p.get('name') for p in available_pos_profiles]
        if current_pos_profile and current_pos_profile not in profile_names:
            current_pos_profile = None
        
        # Priority 3: Auto-select if only one profile
        if not current_pos_profile and len(available_pos_profiles) == 1:
            current_pos_profile = available_pos_profiles[0].get('name')
        
        # Extract unique branches from available profiles
        branches = list(set([
            p.get('imogi_branch') for p in available_pos_profiles 
            if p.get('imogi_branch')
        ]))
        
        # Get current branch (derived from current POS Profile)
        current_branch = None
        if current_pos_profile:
            current_branch = frappe.db.get_value('POS Profile', current_pos_profile, 'imogi_branch')
        
        return {
            'current_pos_profile': current_pos_profile,
            'current_branch': current_branch,
            'available_pos_profiles': available_pos_profiles,
            'branches': branches,
            'is_privileged': is_privileged
        }
    
    except frappe.PermissionError:
        raise
    except Exception as e:
        frappe.log_error(f'Error in get_user_pos_profile_info: {str(e)}')
        frappe.throw(_('Error loading POS Profile information. Please try again.'))


@frappe.whitelist()
def set_user_default_pos_profile(pos_profile, sync_to_server=False):
    """Set user's current POS Profile preference.
    
    Args:
        pos_profile (str): POS Profile name to set as default
        sync_to_server (bool): If True, also saves to User's imogi_default_pos_profile field
        
    Returns:
        dict: Success status with profile and derived branch info
    """
    try:
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Please login to continue'))
        
        # Verify POS Profile exists and is not disabled
        if not frappe.db.exists('POS Profile', pos_profile):
            frappe.throw(_('POS Profile {0} does not exist').format(pos_profile))
        
        profile_data = frappe.db.get_value(
            'POS Profile', 
            pos_profile, 
            ['disabled', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode'],
            as_dict=True
        )
        
        if profile_data.get('disabled'):
            frappe.throw(_('POS Profile {0} is disabled').format(pos_profile))
        
        # Verify user has access to this profile
        user_roles = frappe.get_roles(user)
        is_privileged = 'System Manager' in user_roles or 'Administrator' in user_roles
        
        if not is_privileged:
            has_access = frappe.db.exists('POS Profile User', {
                'parent': pos_profile,
                'user': user
            })
            if not has_access:
                frappe.throw(_('You do not have access to POS Profile {0}').format(pos_profile))
        
        # Set in user defaults (session-based, fast)
        frappe.defaults.set_user_default("imogi_pos_profile", pos_profile)
        
        # Optionally sync to server (permanent storage)
        if sync_to_server and frappe.db.has_column('User', 'imogi_default_pos_profile'):
            frappe.db.set_value('User', user, 'imogi_default_pos_profile', pos_profile)
            frappe.db.commit()
        
        return {
            'success': True,
            'message': _('POS Profile changed to {0}').format(pos_profile),
            'pos_profile': pos_profile,
            'branch': profile_data.get('imogi_branch'),
            'domain': profile_data.get('imogi_pos_domain'),
            'mode': profile_data.get('imogi_mode')
        }
    
    except frappe.PermissionError:
        raise
    except Exception as e:
        frappe.log_error(f'Error in set_user_default_pos_profile: {str(e)}')
        frappe.throw(_('Error setting POS Profile. Please try again.'))

