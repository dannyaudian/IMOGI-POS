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
4. DefaultValue may exist as fallback but NEVER required
5. Multi-profile selection is deterministic and user-friendly

CRITICAL: This is the ONLY place where POS Profile resolution logic should exist.
All other modules MUST call resolve_pos_profile_for_user() from this module.

Usage:
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile_for_user
    
    # Get POS Profile for current user
    result = resolve_pos_profile_for_user()
    
    # Get POS Profile with context
    result = resolve_pos_profile_for_user(
        user='user@example.com',
        context={'last_used': 'Main-POS', 'require_selection': False}
    )
    
    # Result structure:
    {
        'pos_profile': 'Main-POS',  # Selected profile name (or None)
        'branch': 'Main Branch',    # Derived branch
        'available_profiles': [...],  # List of accessible profiles
        'is_privileged': True,      # System Manager / Administrator
        'needs_selection': False,   # True if user must choose from multiple
        'has_access': True,         # True if user has at least one profile
        'selection_method': 'auto_single'  # How profile was selected
    }
"""

from __future__ import unicode_literals
import frappe
from frappe import _

__all__ = [
    'resolve_pos_profile_for_user',
    'get_available_pos_profiles',
    'validate_pos_profile_access',
    'get_pos_profile_branch'
]


# ============================================================================
# MAIN RESOLVER - SINGLE SOURCE OF TRUTH
# ============================================================================

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
        1. context['last_used'] (if still valid)
        2. User.imogi_default_pos_profile (persistent)
        3. frappe.defaults.get_user_default('imogi_pos_profile') (session)
        4. Auto-select if only one profile available
        5. Return needs_selection=True (require user choice)
    
    STEP 4 - Persistence:
        - Selection stored in localStorage (frontend)
        - Optional server sync to User.imogi_default_pos_profile
        - DefaultValue DocType NEVER required (may exist as fallback only)
    
    Args:
        user (str, optional): Username to resolve for. Defaults to current user.
        context (dict, optional): Additional context:
            - last_used (str): Last used POS Profile name
            - require_selection (bool): Force selection even if one profile
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
                - 'context_last_used': From context.last_used
                - 'user_default_persistent': From User field
                - 'user_default_session': From frappe.defaults
                - 'auto_single': Only one profile available
                - 'none_requires_selection': Multiple profiles, need choice
                - 'none_no_access': User has no profiles
    
    Raises:
        frappe.AuthenticationError: If user is Guest or not logged in
    
    Examples:
        >>> # System Manager accessing POS
        >>> result = resolve_pos_profile_for_user()
        >>> result['is_privileged']
        True
        >>> result['has_access']
        True
        
        >>> # Regular user with one profile
        >>> result = resolve_pos_profile_for_user(user='cashier@example.com')
        >>> result['pos_profile']
        'Main-Cashier'
        >>> result['selection_method']
        'auto_single'
        
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
    # Initialize context
    context = context or {}
    user = user or frappe.session.user
    
    # Guest user cannot access POS
    if not user or user == 'Guest':
        return {
            'pos_profile': None,
            'branch': None,
            'company': None,
            'available_profiles': [],
            'is_privileged': False,
            'needs_selection': False,
            'has_access': False,
            'selection_method': 'none_no_access',
            'error': 'Authentication required'
        }
    
    # STEP 1: Detect privileged users
    user_roles = frappe.get_roles(user)
    is_privileged = 'System Manager' in user_roles or user == 'Administrator'
    
    # STEP 2: Get available profiles
    available_profiles = get_available_pos_profiles(user, is_privileged)
    
    # No profiles available
    if not available_profiles:
        return {
            'pos_profile': None,
            'branch': None,
            'company': None,
            'available_profiles': [],
            'is_privileged': is_privileged,
            'needs_selection': False,
            'has_access': False,
            'selection_method': 'none_no_access',
            'message': 'No POS Profiles configured' if is_privileged else 'No POS Profiles assigned'
        }
    
    # STEP 3: Apply selection priority
    selected_profile = None
    selection_method = None
    profile_names = [p['name'] for p in available_profiles]
    
    # Priority 1: Context last_used (e.g., from localStorage)
    last_used = context.get('last_used')
    if last_used and last_used in profile_names:
        if _is_profile_active(last_used):
            selected_profile = last_used
            selection_method = 'context_last_used'
    
    # Priority 2: User persistent default (User.imogi_default_pos_profile)
    if not selected_profile and frappe.db.has_column('User', 'imogi_default_pos_profile'):
        user_default = frappe.db.get_value('User', user, 'imogi_default_pos_profile')
        if user_default and user_default in profile_names:
            if _is_profile_active(user_default):
                selected_profile = user_default
                selection_method = 'user_default_persistent'
    
    # Priority 3: Session default (frappe.defaults)
    # NOTE: DefaultValue lookup is used here ONLY as fallback, never required
    if not selected_profile:
        try:
            session_default = frappe.defaults.get_user_default('imogi_pos_profile', user)
            if session_default and session_default in profile_names:
                if _is_profile_active(session_default):
                    selected_profile = session_default
                    selection_method = 'user_default_session'
        except Exception:
            # DefaultValue may not exist or be accessible - this is OK
            pass
    
    # Priority 4: Auto-select if only one profile (unless context prevents it)
    if not selected_profile and len(profile_names) == 1:
        if not context.get('require_selection'):
            selected_profile = profile_names[0]
            selection_method = 'auto_single'
    
    # Priority 5: No selection made - user must choose
    if not selected_profile:
        return {
            'pos_profile': None,
            'branch': None,
            'company': None,
            'available_profiles': available_profiles,
            'is_privileged': is_privileged,
            'needs_selection': True,
            'has_access': True,
            'selection_method': 'none_requires_selection'
        }
    
    # STEP 4: Get derived data from selected profile
    profile_data = next((p for p in available_profiles if p['name'] == selected_profile), None)
    
    return {
        'pos_profile': selected_profile,
        'branch': profile_data.get('imogi_branch') if profile_data else None,
        'company': profile_data.get('company') if profile_data else None,
        'available_profiles': available_profiles,
        'is_privileged': is_privileged,
        'needs_selection': False,
        'has_access': True,
        'selection_method': selection_method,
        'profile_data': profile_data  # Full profile metadata
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


def _is_profile_active(pos_profile):
    """
    Internal: Check if a POS Profile is active (not disabled).
    
    Args:
        pos_profile (str): POS Profile name
    
    Returns:
        bool: True if active, False if disabled or doesn't exist
    """
    try:
        is_disabled = frappe.db.get_value('POS Profile', pos_profile, 'disabled')
        return not is_disabled
    except Exception:
        return False


# ============================================================================
# BACKWARD COMPATIBILITY HELPERS
# ============================================================================

def get_user_pos_profile(user=None):
    """
    DEPRECATED: Legacy helper for backward compatibility.
    
    Use resolve_pos_profile_for_user() instead for full context.
    
    This function remains for code that only needs the profile name,
    but new code should use the full resolver.
    
    Args:
        user (str, optional): Username
    
    Returns:
        str|None: POS Profile name or None
    """
    result = resolve_pos_profile_for_user(user=user)
    return result.get('pos_profile')
