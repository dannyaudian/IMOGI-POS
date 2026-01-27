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
    "get_user_pos_profile_info",
    "get_allowed_pos_profiles",
    "get_default_pos_profile",
    "set_user_default_pos_profile",
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

    # Resolve branch from centralized POS Profile resolver (authoritative)
    try:
        from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

        last_used = frappe.form_dict.get('last_used')
        resolution = resolve_pos_profile(
            user=frappe.session.user,
            last_used=last_used
        )
        if resolution.get('selected'):
            return frappe.db.get_value("POS Profile", resolution["selected"], "imogi_branch")
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
    
    This is the PRIMARY API for POS Profile-first architecture in IMOGI POS.
    Returns POS Profiles the user has access to via POS Profile User table,
    or all profiles if user is Administrator/System Manager.
    
    IMPORTANT: This function now delegates to the centralized resolver in
    imogi_pos.utils.pos_profile_resolver for consistent POS Profile resolution.
    
    CRITICAL DESIGN DECISION: This API NEVER throws error for valid states.
    Empty available_pos_profiles is a valid state (new user not assigned yet).
    Frontend components decide how to handle each state based on response flags.
    
    Access Control:
        - Privileged users (System Manager/Administrator): See all active profiles
        - Regular users: Only profiles listed in POS Profile User child table
    
    POS Profile Resolution Priority (via centralized resolver):
        1. requested POS Profile (explicit query param)
        2. last_used POS Profile (client localStorage or User.imogi_default_pos_profile)
        3. Auto-select when only one candidate
        4. Return None if multiple profiles (require user selection)
    
    NOTE ON DefaultValue:
        DefaultValue DocType is NOT used for POS Profile gating.
        POS Profile DocType is the ONLY authoritative source.
    
    Returns:
        dict: Contains:
            - current_pos_profile (str|None): Currently selected POS Profile name
            - current_branch (str|None): Branch derived from current profile
            - available_pos_profiles (list): POS Profiles user can access (can be [])
            - branches (list): Unique branches from available profiles
            - require_selection (bool): True if user must choose from multiple profiles
            - has_access (bool): True if user has at least one available profile
            - is_privileged (bool): True if user is System Manager/Administrator
            - selection_method (str): How profile was resolved (for debugging)
    
    Response Examples:
        >>> # Example 1: New user with no POS Profile assigned
        {
            'current_pos_profile': None,
            'current_branch': None,
            'available_pos_profiles': [],
            'branches': [],
            'require_selection': False,
            'has_access': False,          # Frontend shows "Contact admin" message
            'is_privileged': False,
            'selection_method': 'resolver'
        }
        
        >>> # Example 2: User with one profile (auto-selected)
        {
            'current_pos_profile': 'Main-Cashier',
            'current_branch': 'Main Branch',
            'available_pos_profiles': [
                {
                    'name': 'Main-Cashier',
                    'imogi_branch': 'Main Branch',
                    'imogi_mode': 'Counter',
                    'company': 'IMOGI Restaurant',
                    'imogi_enable_cashier': 1,
                    'imogi_enable_kitchen': 0,
                    'imogi_enable_waiter': 0
                }
            ],
            'branches': ['Main Branch'],
            'require_selection': False,   # No selection needed (only one)
            'has_access': True,
            'is_privileged': False,
            'selection_method': 'resolver'
        }
        
        >>> # Example 3: User with multiple profiles (need selection)
        {
            'current_pos_profile': None,
            'current_branch': None,
            'available_pos_profiles': [
                {'name': 'Main-Cashier', 'imogi_branch': 'Main Branch', ...},
                {'name': 'Branch-A-Cashier', 'imogi_branch': 'Branch A', ...},
                {'name': 'Main-Kitchen', 'imogi_branch': 'Main Branch', ...}
            ],
            'branches': ['Main Branch', 'Branch A'],
            'require_selection': True,    # Frontend shows dropdown selector
            'has_access': True,
            'is_privileged': False,
            'selection_method': 'resolver'
        }
        
        >>> # Example 4: System Manager (sees all profiles)
        {
            'current_pos_profile': 'Main-Cashier',
            'current_branch': 'Main Branch',
            'available_pos_profiles': [...all active profiles...],
            'branches': ['Main Branch', 'Branch A', 'Branch B'],
            'require_selection': False,
            'has_access': True,
            'is_privileged': True,
            'selection_method': 'resolver'
        }
    
    Frontend Integration:
        ```javascript
        const { data, isLoading } = useFrappeGetCall('imogi_pos.api.public.get_user_pos_profile_info')
        const { has_access, require_selection, current_pos_profile } = data?.message || {}
        
        if (!has_access) {
            return <EmptyState message="No POS Profiles configured. Contact admin." />
        }
        
        if (require_selection) {
            return <ProfileSelector profiles={available_pos_profiles} />
        }
        
        if (current_pos_profile) {
            return <ModuleGrid profile={current_pos_profile} />
        }
        ```
    
    Raises:
        frappe.AuthenticationError: If user is not logged in (Guest)
        frappe.exceptions.ValidationError: If critical data integrity issue
    
    See Also:
        - set_user_default_pos_profile(): To change user's default profile
        - imogi_pos.utils.pos_profile_resolver.resolve_pos_profile(): Core resolver
    """
    try:
        # CRITICAL: Delegate to centralized resolver
        # This is the ONLY authoritative POS Profile resolution logic
        from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile
        
        user = frappe.session.user
        if not user or user == 'Guest':
            frappe.throw(_('Authentication required'), frappe.AuthenticationError)
        
        # Get resolution from centralized resolver
        # Context can include last_used from localStorage (passed by frontend)
        last_used = frappe.form_dict.get('last_used')
        requested = frappe.form_dict.get('requested')
        result = resolve_pos_profile(
            user=user,
            requested=requested,
            last_used=last_used
        )
        
        # Extract unique branches from available profiles
        candidate_details = result.get('candidate_details', [])
        branches = list(set([
            p.get('branch')
            for p in candidate_details
            if p.get('branch')
        ]))
        
        # Map resolver result to legacy API format
        return {
            'current_pos_profile': result['selected'],  # Can be None
            'current_branch': frappe.db.get_value("POS Profile", result["selected"], "imogi_branch")
            if result.get("selected") else None,
            'available_pos_profiles': [
                {
                    'name': p.get('name'),
                    'imogi_branch': p.get('branch'),
                    'imogi_mode': p.get('mode'),
                    'company': p.get('company')
                }
                for p in candidate_details
            ],  # Can be []
            'branches': branches,
            'require_selection': result['needs_selection'],
            'has_access': result['has_access'],
            'is_privileged': result['is_privileged'],
            'selection_method': 'resolver'  # For debugging
        }
    
    except frappe.AuthenticationError:
        raise
    except frappe.PermissionError:
        raise
    except Exception as e:
        frappe.log_error(f'Error in get_user_pos_profile_info: {str(e)}')
        frappe.throw(_('Error loading POS Profile information. Please try again.'))


@frappe.whitelist()
def get_allowed_pos_profiles():
    """Get POS Profiles the current user can access (legacy wrapper).

    This is a backwards-compatible wrapper around the centralized resolver.
    It returns the list of available profiles but does not decide selection
    independently.
    """
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

    last_used = frappe.form_dict.get('last_used')
    result = resolve_pos_profile(
        user=frappe.session.user,
        last_used=last_used
    )
    return result.get('candidate_details', [])


@frappe.whitelist()
def get_default_pos_profile(last_used=None, requested=None):
    """Resolve POS Profile for the current user (legacy wrapper).

    IMPORTANT: This delegates to the centralized resolver so that all POS
    entry points share the same logic. DefaultValue DocType is NOT required.

    Args:
        last_used (str, optional): Last used profile from client localStorage.
        requested (str, optional): Explicitly requested POS Profile name.

    Returns:
        dict: Resolver result including selected and needs_selection.
    """
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

    return resolve_pos_profile(
        user=frappe.session.user,
        requested=requested or frappe.form_dict.get('requested'),
        last_used=last_used or frappe.form_dict.get('last_used')
    )


def _get_available_pos_profiles(user, is_privileged):
    """
    DEPRECATED: Use imogi_pos.utils.pos_profile_resolver.get_available_pos_profiles() instead.
    
    This function is kept for backward compatibility only.
    New code should import from the centralized resolver module.
    """
    from imogi_pos.utils.pos_profile_resolver import get_available_pos_profiles
    return get_available_pos_profiles(user, is_privileged)


def _resolve_current_pos_profile(user, available_profiles, is_privileged):
    """
    DEPRECATED: Use imogi_pos.utils.pos_profile_resolver.resolve_pos_profile() instead.
    
    This function is kept for backward compatibility only.
    New code should import from the centralized resolver module.
    
    Note: This helper returns only the profile name, not the full resolution result.
    """
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile
    
    # Build context from available_profiles for backward compat
    result = resolve_pos_profile(user=user)
    return result.get('selected')


@frappe.whitelist()
def set_user_default_pos_profile(pos_profile, sync_to_server=False):
    """Set user's current POS Profile preference.
    
    This function validates access via the centralized POS Profile resolver
    to ensure consistent access control across all POS modules.
    
    Args:
        pos_profile (str): POS Profile name to set as default
        sync_to_server (bool): If True, also saves to User's imogi_default_pos_profile field
        
    Returns:
        dict: Success status with profile and derived branch info
    
    NOTE ON DefaultValue:
        This function sets frappe.defaults.set_user_default() for session-based
        storage, which is FAST and sufficient for most use cases. However,
        this is NOT the DefaultValue DocType - it's a lightweight session storage.
        
        For persistent storage across sessions, use sync_to_server=True to
        save to User.imogi_default_pos_profile field.
    
    Raises:
        frappe.ValidationError: If profile doesn't exist or is disabled
        frappe.PermissionError: If user doesn't have access to the profile
    """
    try:
        # CRITICAL: Use centralized validator for access control
        from imogi_pos.utils.pos_profile_resolver import validate_pos_profile_access
        
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
        
        # Use centralized validator for access control
        if not validate_pos_profile_access(pos_profile, user):
            frappe.throw(
                _('You do not have access to POS Profile {0}. Please contact your administrator.').format(pos_profile),
                frappe.PermissionError
            )
        
        # Set in user defaults (session-based, fast)
        # NOTE: This is NOT DefaultValue DocType - it's lightweight session storage
        frappe.defaults.set_user_default("imogi_pos_profile", pos_profile)
        
        # Optionally sync to server (permanent storage in User field)
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
