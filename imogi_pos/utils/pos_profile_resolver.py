# -*- coding: utf-8 -*-
# Copyright (c) 2026, IMOGI and contributors
# For license information, please see license.txt

"""
IMOGI POS - Centralized POS Profile Resolver

This module provides the SINGLE, AUTHORITATIVE resolver for POS Profile access
across all IMOGI POS modules. It replaces scattered resolution logic and eliminates
dependency on DefaultValue DocType for POS Profile lookups.

ARCHITECTURE PRINCIPLES:
1. POS Profile DocType is the ONLY source of truth
2. System Manager / Administrator bypass default requirements
3. Regular users must be in "Applicable for Users" child table
4. DefaultValue DocType is NOT used for POS gating
5. Multi-profile selection is deterministic and user-friendly

CRITICAL: This is the ONLY place where POS Profile resolution logic should exist.
All other modules MUST call resolve_pos_profile() from this module.

Usage:
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile
    
    # Get POS Profile for current user
    result = resolve_pos_profile(user=frappe.session.user)
    
    # Get POS Profile with context
    result = resolve_pos_profile(
        user='user@example.com',
        requested='Main-POS'
    )
    
    # Result structure:
    {
        'selected': 'Main-POS',  # Selected profile name (or None)
        'candidates': [...],     # List of accessible profiles
        'needs_selection': False,
        'is_privileged': True,
        'has_access': True
    }
"""

from __future__ import unicode_literals
import frappe

__all__ = [
    'resolve_pos_profile',
    'resolve_pos_profile_for_user',
    'get_available_pos_profiles',
    'validate_pos_profile_access',
    'get_pos_profile_branch'
]


# ============================================================================
# MAIN RESOLVER - SINGLE SOURCE OF TRUTH
# ============================================================================

def resolve_pos_profile(user, *, requested=None, last_used=None):
    """
    Canonical POS Profile resolver (single source of truth).

    Args:
        user (str): User email to resolve for.
        requested (str | None): Explicitly requested POS Profile (e.g. query param).
        last_used (str | None): Last used POS Profile from client localStorage.

    Returns:
        dict: {
            "selected": str|None,
            "candidates": [
                {"name": str, "company": str, "branch": str|None, "mode": str|None}
            ],
            "needs_selection": bool,
            "is_privileged": bool,
            "has_access": bool
        }
    """
    user = user or frappe.session.user

    if not user or user == 'Guest':
        return {
            "selected": None,
            "candidates": [],
            "needs_selection": False,
            "is_privileged": False,
            "has_access": False
        }

    user_roles = frappe.get_roles(user)
    is_privileged = 'System Manager' in user_roles or user == 'Administrator'

    # System Manager/Administrator see all active profiles (authoritative choice)
    candidates = get_available_pos_profiles(user=user, is_privileged=is_privileged)
    profile_names = [p['name'] for p in candidates]

    selected = None
    needs_selection = False

    if requested and requested in profile_names:
        selected = requested
    else:
        # Last-used from client or server-stored preference (User.imogi_default_pos_profile)
        last_used = last_used or frappe.form_dict.get('last_used')
        stored = None
        if frappe.db.has_column('User', 'imogi_default_pos_profile'):
            stored = frappe.db.get_value('User', user, 'imogi_default_pos_profile')

        for candidate in (last_used, stored):
            if candidate and candidate in profile_names:
                selected = candidate
                break

    if not selected:
        if len(profile_names) == 1:
            selected = profile_names[0]
        else:
            needs_selection = bool(profile_names)

    result = {
        "selected": selected,
        "candidates": [
            {
                "name": profile.get("name"),
                "company": profile.get("company"),
                "branch": profile.get("imogi_branch"),
                "mode": profile.get("imogi_mode")
            }
            for profile in candidates
        ],
        "needs_selection": needs_selection,
        "is_privileged": is_privileged,
        "has_access": bool(profile_names)
    }

    _log_resolution(
        user=user,
        requested=requested,
        last_used=last_used,
        selected=selected,
        candidates=len(profile_names),
        needs_selection=needs_selection
    )

    return result


def resolve_pos_profile_for_user(user=None, context=None):
    """
    Central, authoritative POS Profile resolver for IMOGI POS.
    
    This is the ONLY function that should determine which POS Profile a user
    should use. All other code paths MUST call this function instead of
    implementing their own resolution logic.
    
    Resolution Algorithm (AUTHORITATIVE):
    
    STEP 1 - Detect Privileged Users:
        - System Manager role
        - Administrator user
        → Allow POS entry without defaults
        → See all active POS Profiles (disabled = 0)
    
    STEP 2 - For Regular Users:
        - Find POS Profiles where user is in "Applicable for Users" table
        - Filter to only active profiles (disabled = 0)
        - If zero profiles: Return has_access=False
    
    STEP 3 - Selection Priority (when multiple profiles available):
        1. requested POS Profile (explicit query param)
        2. last_used POS Profile (client localStorage or User.imogi_default_pos_profile)
        3. Auto-select when only one candidate
        4. Otherwise require user selection
    
    STEP 4 - Persistence:
        - Selection stored in localStorage (frontend)
        - Optional server sync to User.imogi_default_pos_profile
        - DefaultValue DocType is never required for POS access
    
    Args:
        user (str, optional): Username to resolve for. Defaults to current user.
        context (dict, optional): Additional context:
            - last_used (str): Last used POS Profile name
            - requested (str): Explicitly requested POS Profile name
            - source (str): Calling context for logging
    
    Returns:
        dict: Resolution result with:
            - pos_profile (str|None): Selected POS Profile name
            - branch (str|None): Derived branch from profile
            - company (str|None): Company from profile
            - available_profiles (list): All accessible profiles
            - is_privileged (bool): True if System Manager/Administrator
            - needs_selection (bool): True if user must choose
            - has_access (bool): True if user can access POS
            - selection_method (str): How profile was resolved
                - 'resolver': Selected by resolve_pos_profile
    
    Raises:
        frappe.AuthenticationError: If user is Guest or not logged in
    
    Examples:
        >>> # System Manager accessing POS
        >>> result = resolve_pos_profile_for_user(user=frappe.session.user)
        >>> result['is_privileged']
        True
        >>> result['has_access']
        True
        
        >>> # Regular user with one profile
        >>> result = resolve_pos_profile_for_user(user='cashier@example.com')
        >>> result['pos_profile']
        'Main-Cashier'
        >>> result['selection_method']
        'resolver'
        
        >>> # User with multiple profiles (needs selection)
        >>> result = resolve_pos_profile_for_user(user='manager@example.com')
        >>> result['needs_selection']
        True
        >>> result['available_profiles']
        [{'name': 'Branch-A', ...}, {'name': 'Branch-B', ...}]
    
    See Also:
        - get_available_pos_profiles(): Gets profiles user can access
        - validate_pos_profile_access(): Checks if user can use specific profile
        - get_pos_profile_branch(): Derives branch from profile
    """
    context = context or {}
    user = user or frappe.session.user

    resolution = resolve_pos_profile(
        user=user,
        requested=context.get('requested'),
        last_used=context.get('last_used')
    )

    selected = resolution.get("selected")
    candidates = resolution.get("candidates", [])
    profile_data = next((p for p in candidates if p.get("name") == selected), None)

    return {
        'pos_profile': selected,
        'branch': profile_data.get('branch') if profile_data else None,
        'company': profile_data.get('company') if profile_data else None,
        'available_profiles': [
            {
                'name': p.get('name'),
                'imogi_branch': p.get('branch'),
                'imogi_mode': p.get('mode'),
                'company': p.get('company')
            }
            for p in candidates
        ],
        'is_privileged': resolution.get('is_privileged', False),
        'needs_selection': resolution.get('needs_selection', False),
        'has_access': resolution.get('has_access', False),
        'selection_method': 'resolver',
        'profile_data': profile_data
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_available_pos_profiles(user=None, is_privileged=None):
    """
    Get POS Profiles that a user has access to.
    
    Access Rules:
        - Privileged users (System Manager/Administrator): All active profiles
        - Regular users: Only profiles where user is in "Applicable for Users" table
    
    Args:
        user (str, optional): Username. Defaults to current user.
        is_privileged (bool, optional): If None, auto-detected from roles
    
    Returns:
        list: POS Profiles with metadata (name, branch, company, etc.)
              Empty list is valid state (user not assigned yet)
    
    Notes:
        - This function NEVER throws errors
        - Empty result indicates user has no POS access (valid state)
        - Disabled profiles are automatically filtered out
    """
    user = user or frappe.session.user
    
    if user == 'Guest':
        return []
    
    # Auto-detect privileged status if not provided
    if is_privileged is None:
        user_roles = frappe.get_roles(user)
        is_privileged = 'System Manager' in user_roles or user == 'Administrator'
    
    try:
        if is_privileged:
            # System Manager / Administrator: See all active profiles
            profiles = frappe.get_all(
                'POS Profile',
                filters={'disabled': 0},
                fields=[
                    'name', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode',
                    'company', 'imogi_enable_cashier', 'imogi_enable_kot',
                    'imogi_enable_waiter', 'imogi_enable_kitchen', 
                    'modified', 'imogi_require_pos_session'
                ],
                order_by='modified desc',
                ignore_permissions=True
            )
            return profiles
        else:
            # Regular user: Only profiles from "Applicable for Users" table
            # First get profile names where user is listed
            profile_names = frappe.get_all(
                'POS Profile User',
                filters={'user': user},
                pluck='parent',
                ignore_permissions=True
            )
            
            if not profile_names:
                # User not assigned to any profiles - valid state
                return []
            
            # Get full profile data
            profiles = frappe.get_all(
                'POS Profile',
                filters={
                    'name': ['in', profile_names],
                    'disabled': 0
                },
                fields=[
                    'name', 'imogi_branch', 'imogi_pos_domain', 'imogi_mode',
                    'company', 'imogi_enable_cashier', 'imogi_enable_kot',
                    'imogi_enable_waiter', 'imogi_enable_kitchen',
                    'modified', 'imogi_require_pos_session'
                ],
                order_by='modified desc',
                ignore_permissions=True
            )
            return profiles
    
    except Exception as e:
        # Log error but don't throw - return empty list
        frappe.log_error(
            f'Error fetching POS Profiles for user {user}: {str(e)}',
            'POS Profile Resolver - Get Available Profiles'
        )
        return []


def validate_pos_profile_access(pos_profile, user=None):
    """
    Validate that a user has access to a specific POS Profile.
    
    Args:
        pos_profile (str): POS Profile name to validate
        user (str, optional): Username. Defaults to current user.
    
    Returns:
        bool: True if user has access, False otherwise
    
    Raises:
        frappe.PermissionError: If user does not have access (when strict=True)
    
    Notes:
        - System Manager / Administrator always have access
        - Regular users must be in "Applicable for Users" table
        - Profile must not be disabled
    """
    user = user or frappe.session.user
    
    if user == 'Guest':
        return False
    
    # Check if profile exists and is active
    if not frappe.db.exists('POS Profile', pos_profile):
        return False
    
    is_disabled = frappe.db.get_value('POS Profile', pos_profile, 'disabled')
    if is_disabled:
        return False
    
    # Check user access
    user_roles = frappe.get_roles(user)
    is_privileged = 'System Manager' in user_roles or user == 'Administrator'
    
    if is_privileged:
        return True
    
    # Check if user is in "Applicable for Users" table
    has_access = frappe.db.exists('POS Profile User', {
        'parent': pos_profile,
        'user': user
    })
    
    return bool(has_access)


def get_pos_profile_branch(pos_profile):
    """
    Get the branch associated with a POS Profile.
    
    Args:
        pos_profile (str): POS Profile name
    
    Returns:
        str|None: Branch name or None if not configured
    
    Notes:
        - Returns None if profile doesn't exist
        - Returns None if profile has no branch configured
        - Does not validate user access (use validate_pos_profile_access first)
    """
    if not pos_profile:
        return None
    
    try:
        branch = frappe.db.get_value('POS Profile', pos_profile, 'imogi_branch')
        return branch
    except Exception:
        return None


def _debug_enabled():
    """Check if POS Profile resolver debug logging is enabled."""
    return bool(getattr(frappe.conf, "imogi_pos_debug_pos_profile", False))


def _log_resolution(user, requested, last_used, selected, candidates, needs_selection):
    """Log resolver diagnostics when enabled via config flag."""
    if not _debug_enabled():
        return
    logger = frappe.logger("imogi_pos.pos_profile")
    logger.info({
        "event": "pos_profile_resolution",
        "user": user,
        "requested": requested,
        "last_used": last_used,
        "selected": selected,
        "candidates": candidates,
        "needs_selection": needs_selection
    })


# ============================================================================
# BACKWARD COMPATIBILITY HELPERS
# ============================================================================

def get_user_pos_profile(user=None):
    """
    DEPRECATED: Legacy helper for backward compatibility.
    
    Use resolve_pos_profile() instead for full context.
    
    This function remains for code that only needs the profile name,
    but new code should use the full resolver.
    
    Args:
        user (str, optional): Username
    
    Returns:
        str|None: POS Profile name or None
    """
    result = resolve_pos_profile(user=user)
    return result.get('selected')
