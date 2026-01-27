"""
Authentication helper functions.

Centralized utilities for authentication, authorization, and user context
in the IMOGI POS system.

NOTE: This module is deprecated. Use imogi_pos.utils.permission_manager instead.
"""

import frappe
from frappe import _



def get_user_pos_profile(user=None, allow_fallback=True):
    """
    Get POS Profile for the current or specified user.
    
    Delegates to the centralized POS Profile resolver to ensure consistent
    access control and selection behavior.
    
    Args:
        user: User email. If None, uses current session user.
        allow_fallback: If False, requires explicit selection when multiple
                        profiles are available.
    
    Returns:
        str: POS Profile name, or None if not found
    """
    if not user:
        user = frappe.session.user

    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

    result = resolve_pos_profile(
        user=user,
        last_used=None
    )
    if not allow_fallback and result.get("needs_selection"):
        return None
    return result.get('selected')


@frappe.whitelist(allow_guest=True)
def get_user_role_context(user=None):
    """
    Get comprehensive role context for user.
    
    Returns dictionary with user roles and permissions useful for
    conditional rendering in UI.
    
    Args:
        user: User email. If None, uses current session user.
    
    Returns:
        dict: {
            "user": str,
            "full_name": str,
            "roles": list,
            "is_guest": bool,
            "is_admin": bool,
            "is_area_manager": bool,
            "is_branch_manager": bool,
            "is_manager": bool,  # Area Manager or Branch Manager
            "is_finance_controller": bool,
            "is_cashier": bool,
            "is_waiter": bool,
            "is_kitchen_staff": bool,
            "defaults": dict
        }
    """
    if not user:
        user = frappe.session.user
    
    is_guest = user == "Guest"
    roles = [] if is_guest else frappe.get_roles(user)
    
    is_area_manager = "Area Manager" in roles
    is_branch_manager = "Branch Manager" in roles
    is_finance_controller = "Finance Controller" in roles
    
    # Get user's full name
    full_name = user
    if not is_guest:
        try:
            full_name = frappe.db.get_value("User", user, "full_name") or user
        except Exception:
            full_name = user
    
    # Get user defaults - simplified to avoid serialization issues
    defaults = {}
    if not is_guest:
        try:
            raw_defaults = frappe.defaults.get_defaults() or {}
            # Only include string/number/bool values to ensure JSON serializable
            for key, value in raw_defaults.items():
                if isinstance(value, (str, int, float, bool, type(None))):
                    defaults[key] = value
        except Exception:
            defaults = {}
    
    def _is_admin_user(username, user_roles):
        """Check if user is admin (either Administrator username or has System Manager role)."""
        return username == "Administrator" or "System Manager" in user_roles
    
    return {
        "user": user,
        "full_name": full_name,
        "roles": roles,
        "is_guest": is_guest,
        "is_admin": _is_admin_user(user, roles),
        "is_area_manager": is_area_manager,
        "is_branch_manager": is_branch_manager,
        "is_manager": is_area_manager or is_branch_manager,  # Either type of manager
        "is_finance_controller": is_finance_controller,
        "is_cashier": "Cashier" in roles,
        "is_waiter": "Waiter" in roles,
        "is_kitchen_staff": "Kitchen Staff" in roles,
        "defaults": defaults,
    }


def validate_pos_profile_access(pos_profile, user=None):
    """
    Validate that user has access to specified POS Profile.
    
    Checks if user is assigned to the profile or has privileged access (System Manager).
    
    Args:
        pos_profile: POS Profile name
        user: User email. If None, uses current session user.
    
    Raises:
        frappe.PermissionError: If user doesn't have access
    """
    if not user:
        user = frappe.session.user
    
    from imogi_pos.utils.pos_profile_resolver import validate_pos_profile_access

    if not validate_pos_profile_access(pos_profile, user=user):
        frappe.throw(
            _("You don't have access to POS Profile: {0}").format(pos_profile),
            frappe.PermissionError
        )


def get_active_branch(user=None):
    """
    Get the active branch for user.
    
    Checks in order:
    1. User's default branch setting
    2. Branch from user's POS Profile
    3. None if no branch configured
    
    Args:
        user: User email. If None, uses current session user.
    
    Returns:
        str: Branch name, or None
    """
    if not user:
        user = frappe.session.user
    
    # Check user's default branch
    branch = frappe.defaults.get_user_default("imogi_branch", user)
    if branch:
        return branch
    
    # Check POS Profile's branch
    pos_profile = get_user_pos_profile(user)
    if pos_profile:
        branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
        if branch:
            return branch
    
    return None


def set_active_branch(branch, user=None):
    """
    Set active branch for user.
    
    Validates that user can access the branch before setting as default.
    Uses ERPNext permission system to check access.
    
    Args:
        branch: Branch name
        user: User email. If None, uses current session user.
    
    Returns:
        str: Branch name if successful
    
    Raises:
        frappe.PermissionError: If user doesn't have access to branch
    """
    if not user:
        user = frappe.session.user
    
    if not branch:
        return None
    
    # Validate access to the branch using standard ERPNext permissions
    # Note: validate_branch_access() checks current user, so we need to
    # temporarily change session for other users (use with caution)
    try:
        validate_branch_access(branch, throw=True)
    except frappe.PermissionError:
        # Re-raise with proper context
        frappe.throw(
            _("You don't have access to Branch: {0}").format(branch),
            frappe.PermissionError
        )
    
    # Set as default for the user
    frappe.defaults.set_user_default("imogi_branch", branch, user)
    
    return branch


def validate_active_session(pos_profile):
    """
    Validate that user has an active POS Opening Entry if required.
    
    Checks POS Profile setting and ensures open session exists.
    
    Args:
        pos_profile: POS Profile name
    
    Returns:
        str: POS Opening Entry name if exists, None if not required
    
    Raises:
        frappe.ValidationError: If session required but not found
    """
    # Get profile settings
    profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
    require_session = profile_doc.get("imogi_require_pos_session", 0)
    
    if not require_session:
        return None
    
    # Determine session scope
    scope = profile_doc.get("imogi_pos_session_scope", "User")
    filters = {
        "docstatus": 1,  # Submitted
        "status": "Open",
        "pos_profile": pos_profile
    }
    
    if scope == "User":
        filters["user"] = frappe.session.user
    # POS Profile scope doesn't add user filter
    
    # Check for open POS Opening Entry
    opening_entry = frappe.db.get_value("POS Opening Entry", filters, "name")
    
    # If no session and enforcement is enabled, throw error
    if not opening_entry and profile_doc.get("imogi_enforce_session_on_cashier"):
        frappe.throw(
            _("No active POS Opening Entry found. Please open a session before proceeding."),
            frappe.ValidationError
        )
    
    return opening_entry


def get_role_based_default_route(user=None):
    """
    Get default route based on user's roles.
    
    Returns appropriate landing page URL based on user's primary role.
    With multi-module architecture, POS users should go to module-select
    instead of being forced to specific module.
    
    Args:
        user: User email. If None, uses current session user.
    
    Returns:
        str: URL path, or None for default ERPNext desk
    """
    if not user:
        user = frappe.session.user
    
    if user == "Guest":
        return "/imogi-login"
    
    roles = frappe.get_roles(user)
    
    # Priority-based routing for management/admin roles
    if "System Manager" in roles:
        return "/app"  # ERPNext desk
    
    if "Area Manager" in roles:
        return "/app/dashboard-view/area-performance"
    
    if "Branch Manager" in roles:
        return "/module-select"  # Branch managers can access multiple modules
    
    if "Finance Controller" in roles:
        return "/app/query-report/financial-summary"
    
    # POS operational roles → Module Select (multi-module support)
    if any(role in roles for role in ["Cashier", "Waiter", "Kitchen Staff", "Kiosk"]):
        return "/module-select"
    
    # Default to desk
    return "/app"
