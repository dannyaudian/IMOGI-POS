"""
Authentication helper functions.

Centralized utilities for authentication, authorization, and user context
in the IMOGI POS system.
"""

import frappe
from frappe import _


def get_user_pos_profile(user=None, allow_fallback=True):
    """
    Get POS Profile for the current or specified user.
    
    Checks user's assigned POS Profile via POS Profile User child table.
    If not found and allow_fallback is True, returns first available profile.
    
    Args:
        user: User email. If None, uses current session user.
        allow_fallback: If True, returns default profile when user has none.
    
    Returns:
        str: POS Profile name, or None if not found
    """
    if not user:
        user = frappe.session.user
    
    # Check if user has assigned POS Profile
    pos_profile = frappe.db.get_value(
        "POS Profile User",
        {"user": user},
        "parent"
    )
    
    if pos_profile:
        return pos_profile
    
    # Fallback to first available profile
    if allow_fallback:
        profiles = frappe.get_all(
            "POS Profile",
            filters={"disabled": 0},
            fields=["name"],
            limit=1
        )
        if profiles:
            return profiles[0].name
    
    return None


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
            "roles": list,
            "is_guest": bool,
            "is_admin": bool,
            "is_manager": bool,
            "is_cashier": bool,
            "is_waiter": bool,
            "is_kitchen_staff": bool
        }
    """
    if not user:
        user = frappe.session.user
    
    is_guest = user == "Guest"
    roles = [] if is_guest else frappe.get_roles(user)
    
    return {
        "user": user,
        "roles": roles,
        "is_guest": is_guest,
        "is_admin": "System Manager" in roles,
        "is_manager": "Restaurant Manager" in roles or "System Manager" in roles,
        "is_cashier": "Cashier" in roles,
        "is_waiter": "Waiter" in roles,
        "is_kitchen_staff": "Kitchen Staff" in roles,
    }


def validate_pos_profile_access(pos_profile, user=None):
    """
    Validate that user has access to specified POS Profile.
    
    Checks if user is assigned to the profile or has manager role.
    
    Args:
        pos_profile: POS Profile name
        user: User email. If None, uses current session user.
    
    Raises:
        frappe.PermissionError: If user doesn't have access
    """
    if not user:
        user = frappe.session.user
    
    # Admins and managers have access to all profiles
    if "System Manager" in frappe.get_roles(user) or "Restaurant Manager" in frappe.get_roles(user):
        return
    
    # Check if user is assigned to this profile
    assigned = frappe.db.exists("POS Profile User", {
        "parent": pos_profile,
        "user": user
    })
    
    if not assigned:
        frappe.throw(
            _("You don't have access to POS Profile: {0}").format(pos_profile),
            frappe.PermissionError
        )


def validate_branch_access(branch, user=None):
    """
    Validate that user has access to specified branch.
    
    Uses Frappe's permission system to check branch access.
    
    Args:
        branch: Branch name
        user: User email. If None, uses current session user.
    
    Raises:
        frappe.PermissionError: If user doesn't have access
    """
    if not user:
        user = frappe.session.user
    
    if not frappe.has_permission("Branch", doc=branch, user=user):
        frappe.throw(
            _("You don't have access to branch: {0}").format(branch),
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
    
    Validates access and persists to user defaults.
    
    Args:
        branch: Branch name
        user: User email. If None, uses current session user.
    
    Returns:
        str: Branch name if successful
    
    Raises:
        frappe.PermissionError: If user doesn't have access
    """
    if not user:
        user = frappe.session.user
    
    if not branch:
        return None
    
    # Validate access
    validate_branch_access(branch, user)
    
    # Set as default
    frappe.defaults.set_user_default("imogi_branch", branch, user)
    
    return branch


def validate_active_session(pos_profile):
    """
    Validate that user has an active POS Session if required.
    
    Checks POS Profile setting and ensures open session exists.
    
    Args:
        pos_profile: POS Profile name
    
    Returns:
        str: Session name if exists, None if not required
    
    Raises:
        frappe.ValidationError: If session required but not found
    """
    # Check if POS Session DocType exists
    if not frappe.db.exists("DocType", "POS Session"):
        return None
    
    # Get profile settings
    profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
    require_session = profile_doc.get("imogi_require_pos_session", 0)
    
    if not require_session:
        return None
    
    # Determine session scope
    scope = profile_doc.get("imogi_pos_session_scope", "User")
    filters = {
        "status": "Open",
        "pos_profile": pos_profile
    }
    
    if scope == "User":
        filters["user"] = frappe.session.user
    elif scope == "Device":
        filters["device_id"] = frappe.local.request_ip
    
    # Check for open session
    session = frappe.db.get_value("POS Session", filters, "name")
    
    # If no session and enforcement is enabled, throw error
    if not session and profile_doc.get("imogi_enforce_session_on_cashier"):
        frappe.throw(
            _("No active POS Session found. Please open a session before proceeding."),
            frappe.ValidationError
        )
    
    return session


def get_role_based_default_route(user=None):
    """
    Get default route based on user's roles.
    
    Returns appropriate landing page URL based on user's primary role.
    
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
    
    # Priority-based routing
    if "System Manager" in roles or "Restaurant Manager" in roles:
        return "/app"  # ERPNext desk
    
    if "Kiosk Manager" in roles:
        return "/kiosk"
    
    if "Cashier" in roles:
        return "/counter/pos"
    
    if "Waiter" in roles:
        return "/restaurant/waiter"
    
    if "Kitchen Staff" in roles:
        return "/restaurant/kitchen"
    
    # Default to desk
    return "/app"
