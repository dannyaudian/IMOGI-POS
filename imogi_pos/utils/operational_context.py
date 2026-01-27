# -*- coding: utf-8 -*-
"""
IMOGI POS - Operational Context Manager
========================================

SINGLE SOURCE OF TRUTH for operational context resolution across ALL modules.

Operational Context represents:
• which outlet/POS Profile
• which branch
• which operating mode
• which privilege scope

This module is the AUTHORITATIVE resolver. ALL internal modules must use this
shared context. Frontend must NEVER infer business logic.

Architecture:
- Backend is SOURCE OF TRUTH
- Frontend is CONSUMER ONLY
- Role classification imported from central role policy
- No hardcoded role names
- No URL-based state management
- No DefaultValue dependencies
"""

import frappe
from frappe import _
from typing import Optional, Dict, List, Any
import logging

# Import role classification from central role policy
from imogi_pos.utils.role_permissions import (
    PRIVILEGED_ROLES,
    MANAGEMENT_ROLES,
    FINANCE_ROLES,
    RESTRICTED_ROLES
)

# Import existing resolver for POS Profile logic
from imogi_pos.utils.pos_profile_resolver import (
    get_available_pos_profiles,
    validate_pos_profile_access,
    get_pos_profile_branch
)

logger = logging.getLogger(__name__)

# Session key for storing active context
SESSION_CONTEXT_KEY = "imogi_operational_context"


# ============================================================================
# ROLE CLASSIFICATION (Using Central Role Policy)
# ============================================================================

def get_user_role_class(user: Optional[str] = None) -> str:
    """
    Classify user into role class based on central role policy.
    
    Role Classes:
        - SYSTEM_LEVEL: Administrator, System Manager
        - FINANCE_CONTROLLER: Finance Controller, Accounts Manager
        - AREA_MANAGER: Area Manager
        - BRANCH_MANAGER: Branch Manager
        - OPERATIONAL_STAFF: Cashier, Waiter, Kitchen Staff, etc.
    
    Args:
        user: User email. If None, uses current session user.
        
    Returns:
        str: Role class name
    """
    if not user:
        user = frappe.session.user
    
    if user == "Administrator":
        return "SYSTEM_LEVEL"
    
    user_roles = frappe.get_roles(user)
    
    # Check privileged roles (System Manager)
    if any(role in user_roles for role in PRIVILEGED_ROLES):
        return "SYSTEM_LEVEL"
    
    # Check finance roles
    if any(role in user_roles for role in FINANCE_ROLES):
        return "FINANCE_CONTROLLER"
    
    # Check management roles (hierarchical order matters)
    if "Area Manager" in user_roles:
        return "AREA_MANAGER"
    
    if "Branch Manager" in user_roles:
        return "BRANCH_MANAGER"
    
    # Check restricted roles (operational staff)
    if any(role in user_roles for role in RESTRICTED_ROLES.keys()):
        return "OPERATIONAL_STAFF"
    
    # Default to operational staff for unknown roles
    return "OPERATIONAL_STAFF"


def is_context_required_for_role_class(role_class: str) -> bool:
    """
    Determine if operational context is required for a role class.
    
    Business Rules:
        - SYSTEM_LEVEL: Optional (never blocked)
        - FINANCE_CONTROLLER: Optional (never forced to select)
        - AREA_MANAGER: Required (must be scoped)
        - BRANCH_MANAGER: Required (strictly limited)
        - OPERATIONAL_STAFF: Required (POS Profile must be mapped)
    
    Args:
        role_class: Role class name
        
    Returns:
        bool: True if context is required
    """
    return role_class in ["AREA_MANAGER", "BRANCH_MANAGER", "OPERATIONAL_STAFF"]


# ============================================================================
# CORE RESOLVER - SINGLE SOURCE OF TRUTH
# ============================================================================

def resolve_operational_context(
    user: Optional[str] = None,
    requested_profile: Optional[str] = None,
    requested_branch: Optional[str] = None
) -> Dict[str, Any]:
    """
    Resolve operational context for a user.
    
    This is the AUTHORITATIVE resolver. Never throws inside resolver.
    Returns pure data object with all context information.
    
    Args:
        user: User email. If None, uses current session user.
        requested_profile: Explicitly requested POS Profile name
        requested_branch: Explicitly requested branch name
        
    Returns:
        dict: {
            "current_pos_profile": str|None,
            "current_branch": str|None,
            "available_pos_profiles": list[dict],
            "branches": list[str],
            "require_selection": bool,
            "has_access": bool,
            "role_class": str,
            "selection_method": str,
            "is_privileged": bool,
            "context_required": bool
        }
    
    Selection Priority:
        1. requested_profile (if valid)
        2. last_used from session (if valid)
        3. single candidate auto-select
        4. otherwise require_selection=true
    
    Never reads:
        - DefaultValue
        - URL params directly (caller extracts and passes)
        - frappe.form_dict
    """
    if not user:
        user = frappe.session.user
    
    # Handle guest users
    if not user or user == "Guest":
        return {
            "current_pos_profile": None,
            "current_branch": None,
            "available_pos_profiles": [],
            "branches": [],
            "require_selection": False,
            "has_access": False,
            "role_class": "GUEST",
            "selection_method": "none",
            "is_privileged": False,
            "context_required": False
        }
    
    # Classify user role
    role_class = get_user_role_class(user)
    is_privileged = role_class in ["SYSTEM_LEVEL", "FINANCE_CONTROLLER"]
    context_required = is_context_required_for_role_class(role_class)
    
    # Get available POS Profiles (uses existing resolver)
    available_profiles = get_available_pos_profiles(user=user, is_privileged=is_privileged)
    profile_names = [p['name'] for p in available_profiles]
    
    # Get available branches
    branches = _get_available_branches(user, role_class, available_profiles)
    
    # Resolve POS Profile selection
    selected_profile = None
    selection_method = "none"
    
    # Priority 1: Requested profile (if valid)
    if requested_profile and requested_profile in profile_names:
        if validate_pos_profile_access(requested_profile, user):
            selected_profile = requested_profile
            selection_method = "requested"
    
    # Priority 2: Last used from session
    if not selected_profile:
        session_context = _get_session_context()
        last_used = session_context.get("pos_profile")
        if last_used and last_used in profile_names:
            if validate_pos_profile_access(last_used, user):
                selected_profile = last_used
                selection_method = "last_used"
    
    # Priority 3: Stored preference
    if not selected_profile:
        if frappe.db.has_column('User', 'imogi_default_pos_profile'):
            stored = frappe.db.get_value('User', user, 'imogi_default_pos_profile')
            if stored and stored in profile_names:
                if validate_pos_profile_access(stored, user):
                    selected_profile = stored
                    selection_method = "stored_preference"
    
    # Priority 4: Auto-select single candidate
    if not selected_profile and len(profile_names) == 1:
        selected_profile = profile_names[0]
        selection_method = "auto_single"
    
    # Derive current branch
    current_branch = None
    if selected_profile:
        current_branch = get_pos_profile_branch(selected_profile)
    elif requested_branch and requested_branch in branches:
        current_branch = requested_branch
    
    # Determine if selection is required
    require_selection = False
    if context_required and not selected_profile and len(profile_names) > 1:
        require_selection = True
    
    # Build result
    result = {
        "current_pos_profile": selected_profile,
        "current_branch": current_branch,
        "available_pos_profiles": [
            {
                "name": p.get("name"),
                "branch": p.get("imogi_branch"),
                "company": p.get("company"),
                "mode": p.get("imogi_mode"),
                "pos_domain": p.get("imogi_pos_domain")
            }
            for p in available_profiles
        ],
        "branches": branches,
        "require_selection": require_selection,
        "has_access": bool(profile_names),
        "role_class": role_class,
        "selection_method": selection_method,
        "is_privileged": is_privileged,
        "context_required": context_required
    }
    
    # Log resolution for debugging
    _log_context_resolution(user, result)
    
    return result


def set_active_operational_context(
    user: Optional[str] = None,
    pos_profile: Optional[str] = None,
    branch: Optional[str] = None
) -> Dict[str, Any]:
    """
    Set and persist active operational context for user.
    
    Storage locations:
        1. frappe.session.data[SESSION_CONTEXT_KEY] (session storage)
        2. User.imogi_default_pos_profile (persistent preference)
    
    Args:
        user: User email. If None, uses current session user.
        pos_profile: POS Profile name to set
        branch: Branch name to set
        
    Returns:
        dict: Updated context
        
    Raises:
        frappe.ValidationError: If pos_profile invalid
        frappe.PermissionError: If user lacks access
    """
    if not user:
        user = frappe.session.user
    
    # Validate POS Profile access
    if pos_profile:
        if not validate_pos_profile_access(pos_profile, user):
            frappe.throw(
                _("You do not have access to POS Profile: {0}").format(pos_profile),
                frappe.PermissionError
            )
    
    # Store in session
    context_data = {
        "pos_profile": pos_profile,
        "branch": branch or get_pos_profile_branch(pos_profile) if pos_profile else None,
        "timestamp": frappe.utils.now()
    }
    
    if not hasattr(frappe.session, 'data'):
        frappe.session.data = {}
    
    frappe.session.data[SESSION_CONTEXT_KEY] = context_data
    
    # Persist to user preference (optional but recommended)
    if pos_profile and frappe.db.has_column('User', 'imogi_default_pos_profile'):
        try:
            frappe.db.set_value('User', user, 'imogi_default_pos_profile', pos_profile)
            frappe.db.commit()
        except Exception as e:
            logger.warning(f"Could not persist POS Profile preference: {e}")
    
    return context_data


def get_active_operational_context(
    user: Optional[str] = None,
    auto_resolve: bool = True
) -> Dict[str, Any]:
    """
    Get active operational context for user.
    
    Args:
        user: User email. If None, uses current session user.
        auto_resolve: If True, auto-resolve if no context set
        
    Returns:
        dict: Current context or resolved context
    """
    if not user:
        user = frappe.session.user
    
    # Try to get from session first
    session_context = _get_session_context()
    
    if session_context and session_context.get("pos_profile"):
        return session_context
    
    # Auto-resolve if requested
    if auto_resolve:
        resolved = resolve_operational_context(user=user)
        
        # If a profile was selected, store it
        if resolved.get("current_pos_profile"):
            return set_active_operational_context(
                user=user,
                pos_profile=resolved["current_pos_profile"],
                branch=resolved["current_branch"]
            )
        
        return {
            "pos_profile": None,
            "branch": None,
            "resolved": resolved
        }
    
    return session_context or {"pos_profile": None, "branch": None}


def require_operational_context(
    user: Optional[str] = None,
    allow_optional: bool = False
) -> Dict[str, Any]:
    """
    Decorator helper: Require operational context for API endpoint.
    
    Throws controlled exception ONLY if role requires context and none available.
    
    Args:
        user: User email. If None, uses current session user.
        allow_optional: If True, allows optional context for privileged users
        
    Returns:
        dict: Active context
        
    Raises:
        frappe.ValidationError: If context required but not available
    """
    if not user:
        user = frappe.session.user
    
    # Get role classification
    role_class = get_user_role_class(user)
    context_required = is_context_required_for_role_class(role_class)
    
    # If context not required (System Manager, Finance Controller), allow through
    if not context_required and allow_optional:
        context = get_active_operational_context(user=user, auto_resolve=True)
        return context
    
    # If context required, ensure it exists
    if context_required:
        context = get_active_operational_context(user=user, auto_resolve=True)
        
        if not context.get("pos_profile"):
            # Check if user has any available profiles
            resolved = resolve_operational_context(user=user)
            
            if not resolved.get("has_access"):
                frappe.throw(
                    _("No POS Profiles configured for your account. Contact administrator."),
                    frappe.ValidationError
                )
            
            if resolved.get("require_selection"):
                frappe.throw(
                    _("POS Profile required. Please select one."),
                    frappe.ValidationError
                )
            
            # Should not reach here
            frappe.throw(
                _("POS Profile required. Please select one."),
                frappe.ValidationError
            )
        
        return context
    
    # For privileged users, return context (may be None)
    return get_active_operational_context(user=user, auto_resolve=False)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _get_session_context() -> Dict[str, Any]:
    """Get context from session storage."""
    if not hasattr(frappe.session, 'data'):
        return {}
    
    return frappe.session.data.get(SESSION_CONTEXT_KEY, {})


def _get_available_branches(
    user: str,
    role_class: str,
    available_profiles: List[Dict]
) -> List[str]:
    """
    Get list of branches user can access based on role class.
    
    Business Rules:
        - SYSTEM_LEVEL: All branches
        - FINANCE_CONTROLLER: All branches
        - AREA_MANAGER: Scoped by territory/assignment
        - BRANCH_MANAGER: Assigned branches only
        - OPERATIONAL_STAFF: Branch from assigned POS Profiles
    """
    # System level and finance see all branches
    if role_class in ["SYSTEM_LEVEL", "FINANCE_CONTROLLER"]:
        try:
            all_branches = frappe.get_all(
                'Branch',
                filters={'disabled': 0},
                pluck='name',
                ignore_permissions=True
            )
            return all_branches or []
        except Exception:
            return []
    
    # Extract branches from available POS Profiles
    branches = set()
    for profile in available_profiles:
        branch = profile.get('imogi_branch')
        if branch:
            branches.add(branch)
    
    return list(branches)


def _log_context_resolution(user: str, result: Dict[str, Any]):
    """Log context resolution for debugging."""
    if frappe.conf.get('imogi_pos_debug_context'):
        logger.info({
            "event": "operational_context_resolution",
            "user": user,
            "role_class": result.get("role_class"),
            "selected_profile": result.get("current_pos_profile"),
            "selection_method": result.get("selection_method"),
            "require_selection": result.get("require_selection"),
            "has_access": result.get("has_access")
        })


# ============================================================================
# PUBLIC API ENDPOINTS
# ============================================================================

@frappe.whitelist()
def get_operational_context():
    """
    API endpoint: Get operational context for current user.
    
    Returns:
        dict: Resolved operational context
    """
    user = frappe.session.user
    
    # Get current context or auto-resolve
    context = get_active_operational_context(user=user, auto_resolve=True)
    
    # If still no context, return full resolution
    if not context.get("pos_profile"):
        resolved = resolve_operational_context(user=user)
        return resolved
    
    # Return active context with metadata
    resolved = resolve_operational_context(
        user=user,
        requested_profile=context.get("pos_profile")
    )
    
    return {
        **resolved,
        "active_context": context
    }


@frappe.whitelist()
def set_operational_context(pos_profile=None, branch=None):
    """
    API endpoint: Set operational context for current user.
    
    Args:
        pos_profile: POS Profile name to set
        branch: Branch name to set (optional, derived from profile)
        
    Returns:
        dict: Updated context
    """
    user = frappe.session.user
    
    # Validate and set context
    context = set_active_operational_context(
        user=user,
        pos_profile=pos_profile,
        branch=branch
    )
    
    return {
        "success": True,
        "context": context,
        "message": _("Operational context updated successfully")
    }


# ============================================================================
# DECORATOR
# ============================================================================

def operational_context_required(allow_optional=False):
    """
    Decorator: Require operational context for API endpoint.
    
    Usage:
        @frappe.whitelist()
        @operational_context_required()
        def my_api_function():
            context = get_active_operational_context()
            pos_profile = context.get("pos_profile")
            ...
    
    Args:
        allow_optional: If True, allows privileged users without context
    """
    def decorator(fn):
        def wrapper(*args, **kwargs):
            # Ensure context exists
            require_operational_context(allow_optional=allow_optional)
            return fn(*args, **kwargs)
        return wrapper
    return decorator
