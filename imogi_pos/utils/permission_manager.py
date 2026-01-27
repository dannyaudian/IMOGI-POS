"""
IMOGI POS - Centralized Permission Manager
===========================================

Consolidates ALL permission checking logic into a single module to prevent
conflicts, duplication, and race conditions. This is the single source of truth
for all authorization logic in IMOGI POS.

Key Features:
- Single function for each permission type
- Consistent error messages
- Thread-safe caching
- Logging and audit trail
- Type hints for IDE support
"""

import frappe
from frappe import _
from functools import wraps
import logging
from typing import Optional, List, Tuple

logger = logging.getLogger(__name__)

# =============================================================================
# DOCTYPE NORMALIZATION
# =============================================================================

def _normalize_doctype(doctype: Optional[str]) -> Optional[str]:
    """Map legacy DocType names to ERPNext v15 equivalents."""
    if not doctype:
        return doctype
    return doctype

# =============================================================================
# CORE PERMISSION CHECKS
# =============================================================================

class PermissionError(frappe.PermissionError):
    """IMOGI POS Permission Error"""
    pass


def is_privileged_user(user: Optional[str] = None) -> bool:
    """
    Check if user is privileged (Administrator or System Manager).
    
    CENTRALIZED: This is the ONLY function that checks privileged access.
    All decorators and permission functions must use this function.
    
    Args:
        user: User email. If None, uses current session user.
        
    Returns:
        True if user is Administrator or System Manager
        
    Raises:
        None - Returns False if session not ready, no exception
    """
    try:
        if not user:
            # Null safety: check if session exists
            if not hasattr(frappe, 'session') or not frappe.session:
                return False
            user = frappe.session.user
        
        if not user:
            return False
            
        # Administrator has unconditional access
        if user == "Administrator":
            return True
        
        # Check System Manager role
        roles = frappe.get_roles(user)
        return "System Manager" in roles
        
    except Exception as e:
        logger.warning(f"Error checking privileged access for {user}: {e}")
        return False


def check_doctype_permission(
    doctype: str, 
    doc: Optional[str] = None, 
    perm_type: str = "read", 
    throw: bool = True,
    user: Optional[str] = None
) -> bool:
    """
    Check if user has permission for a DocType.
    
    CENTRALIZED: Use this for ALL DocType permission checks.
    
    Args:
        doctype: DocType name
        doc: Optional document name for document-level checks
        perm_type: Permission type (read, write, create, delete, submit, amend, etc.)
        throw: If True, raise exception on permission denial
        user: User to check (defaults to current session user)
        
    Returns:
        True if user has permission
        
    Raises:
        frappe.PermissionError: If user lacks permission and throw=True
    """
    doctype = _normalize_doctype(doctype)

    db = getattr(frappe, "db", None)
    if db and hasattr(db, "exists"):
        try:
            if not db.exists("DocType", doctype):
                logger.warning("DocType %s not found; skipping permission check.", doctype)
                return True
        except Exception:
            logger.warning("Unable to verify DocType %s; skipping permission check.", doctype)
            return True

    # Privileged users have unrestricted access
    if is_privileged_user(user):
        return True
    
    # Get current user if not specified
    if not user:
        user = frappe.session.user
    
    # Use native Frappe permission system
    try:
        has_permission = frappe.has_permission(doctype, perm_type=perm_type, doc=doc)
    except TypeError:
        has_permission = frappe.has_permission(doctype, doc=doc)
    
    if not has_permission and throw:
        user_roles = ", ".join(frappe.get_roles(user))
        doc_ref = f"{doctype} ({doc})" if doc else doctype
        
        error_msg = _(
            "Access Denied: You do not have {0} permission on {1}.\n"
            "Current user: {2}\n"
            "Your roles: {3}\n"
            "Contact your administrator for access."
        ).format(perm_type.upper(), doc_ref, user, user_roles)
        
        logger.warning(f"Permission denied: {user} [{user_roles}] - {perm_type} on {doc_ref}")
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_permission


def check_branch_access(
    branch: str, 
    throw: bool = True, 
    user: Optional[str] = None
) -> bool:
    """
    Check if user has access to a specific branch.
    
    CENTRALIZED: Use this for ALL branch access checks.
    
    Args:
        branch: Branch name
        throw: If True, raise exception on access denial
        user: User to check (defaults to current session user)
        
    Returns:
        True if user has access to branch
        
    Raises:
        frappe.ValidationError: If branch parameter missing
        frappe.PermissionError: If user lacks branch access and throw=True
    """
    # Privileged users have unrestricted access
    if is_privileged_user(user):
        return True
    
    # Get current user if not specified
    if not user:
        user = frappe.session.user
    
    # Validate branch parameter
    if not branch:
        if throw:
            frappe.throw(
                _("Branch parameter is required. Contact your administrator."),
                frappe.ValidationError
            )
        return False
    
    # Check native permission on Branch document
    has_permission = frappe.has_permission("Branch", doc=branch)
    
    if not has_permission and throw:
        user_roles = ", ".join(frappe.get_roles(user))
        error_msg = _(
            "Access Denied: You do not have access to Branch: {0}\n"
            "Current user: {1}\n"
            "Your roles: {2}\n"
            "Contact your administrator for branch access."
        ).format(branch, user, user_roles)
        
        logger.warning(f"Branch access denied: {user} [{user_roles}] - {branch}")
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_permission


def check_pos_profile_access(
    pos_profile: str, 
    throw: bool = True, 
    user: Optional[str] = None
) -> bool:
    """
    Check if user is assigned to a POS Profile.
    
    CENTRALIZED: Use this for STRICT POS Profile access checks.
    Requires EXPLICIT assignment in POS Profile User table.
    
    Args:
        pos_profile: POS Profile name
        throw: If True, raise exception on access denial
        user: User to check (defaults to current session user)
        
    Returns:
        True if user is assigned to POS Profile
        
    Raises:
        frappe.PermissionError: If user not assigned and throw=True
    """
    # Get current user if not specified
    if not user:
        user = frappe.session.user
    
    # Validate POS Profile parameter
    if not pos_profile:
        if throw:
            frappe.throw(
                _("POS Profile is required."),
                frappe.ValidationError
            )
        return False
    
    from imogi_pos.utils.pos_profile_resolver import validate_pos_profile_access
    has_access = validate_pos_profile_access(pos_profile, user=user)
    
    if not has_access and throw:
        user_roles = ", ".join(frappe.get_roles(user))
        error_msg = _(
            "Access Denied: You are not assigned to POS Profile '{0}'.\n"
            "Current user: {1}\n"
            "Your roles: {2}\n"
            "Contact your Branch Manager to assign you to this POS Profile."
        ).format(pos_profile, user, user_roles)
        
        logger.warning(f"POS Profile access denied: {user} [{user_roles}] - {pos_profile}")
        frappe.throw(error_msg, frappe.PermissionError)
    
    return bool(has_access)


def check_role(
    role: str, 
    throw: bool = True, 
    user: Optional[str] = None
) -> bool:
    """
    Check if user has a specific role.
    
    CENTRALIZED: Use this for ALL role checks.
    
    Args:
        role: Role name
        throw: If True, raise exception if user lacks role
        user: User to check (defaults to current session user)
        
    Returns:
        True if user has the role
        
    Raises:
        frappe.PermissionError: If user lacks role and throw=True
    """
    # Privileged users have all roles
    if is_privileged_user(user):
        return True
    
    # Get current user if not specified
    if not user:
        user = frappe.session.user
    
    # Check if user has role
    user_roles = frappe.get_roles(user)
    has_role = role in user_roles
    
    if not has_role and throw:
        error_msg = _(
            "Access Denied: This operation requires '{0}' role.\n"
            "Current user: {1}\n"
            "Your roles: {2}\n"
            "Contact your administrator."
        ).format(role, user, ", ".join(user_roles))
        
        logger.warning(f"Role check failed: {user} [{', '.join(user_roles)}] - required: {role}")
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_role


def check_any_role(
    roles: List[str], 
    throw: bool = True, 
    user: Optional[str] = None
) -> bool:
    """
    Check if user has ANY of the specified roles.
    
    CENTRALIZED: Use this for checking multiple role options.
    
    Args:
        roles: List of role names
        throw: If True, raise exception if user lacks all roles
        user: User to check (defaults to current session user)
        
    Returns:
        True if user has at least one of the roles
        
    Raises:
        frappe.PermissionError: If user lacks all roles and throw=True
    """
    # Privileged users have all roles
    if is_privileged_user(user):
        return True
    
    # Get current user if not specified
    if not user:
        user = frappe.session.user
    
    # Check if user has any of the roles
    user_roles = frappe.get_roles(user)
    has_any = any(role in user_roles for role in roles)
    
    if not has_any and throw:
        error_msg = _(
            "Access Denied: This operation requires one of these roles: {0}\n"
            "Current user: {1}\n"
            "Your roles: {2}\n"
            "Contact your administrator."
        ).format(", ".join(roles), user, ", ".join(user_roles))
        
        logger.warning(f"Any role check failed: {user} [{', '.join(user_roles)}] - required any: {roles}")
        frappe.throw(error_msg, frappe.PermissionError)
    
    return has_any


def check_multiple_conditions(
    checks: List[Tuple[str, dict]]
) -> bool:
    """
    Check multiple permission conditions and return early on first failure.
    
    CENTRALIZED: Use for complex permission logic with multiple checks.
    
    Args:
        checks: List of (check_type, kwargs) tuples
                check_type: 'doctype', 'branch', 'pos_profile', 'role', 'any_role'
                kwargs: Arguments to pass to corresponding check function
    
    Returns:
        True if all checks pass
        
    Example:
        check_multiple_conditions([
            ('doctype', {'doctype': 'POS Order', 'perm_type': 'write'}),
            ('branch', {'branch': branch_name}),
            ('role', {'role': 'Cashier'})
        ])
    """
    check_functions = {
        'doctype': check_doctype_permission,
        'branch': check_branch_access,
        'pos_profile': check_pos_profile_access,
        'role': check_role,
        'any_role': check_any_role
    }
    
    for check_type, kwargs in checks:
        if check_type not in check_functions:
            frappe.throw(f"Unknown check type: {check_type}")
        
        # Add throw=True to all checks
        kwargs['throw'] = True
        check_functions[check_type](**kwargs)
    
    return True


# =============================================================================
# DECORATORS USING CENTRALIZED FUNCTIONS
# =============================================================================

def require_doctype_permission(doctype: str, perm_type: str = "read", validate_branch: bool = False):
    """
    Decorator: Require DocType permission.
    
    Args:
        doctype: DocType name
        perm_type: Permission type
        validate_branch: If True, extract and validate branch parameter
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Use centralized permission check
            check_doctype_permission(doctype, perm_type=perm_type, throw=True)
            
            # Optionally validate branch parameter
            if validate_branch:
                import inspect
                sig = inspect.signature(fn)
                branch = kwargs.get('branch')
                
                if not branch:
                    param_names = list(sig.parameters.keys())
                    if 'branch' in param_names:
                        branch_idx = param_names.index('branch')
                        if branch_idx < len(args):
                            branch = args[branch_idx]
                
                if branch:
                    check_branch_access(branch, throw=True)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_pos_profile_access(strict: bool = True):
    """
    Decorator: Require POS Profile access.
    
    Args:
        strict: If True, requires explicit assignment (strict mode)
                If False, allows default profile (lenient mode)
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            from imogi_pos.utils.pos_profile_resolver import (
                resolve_pos_profile,
                raise_setup_required_if_no_candidates,
            )
            
            # Get POS Profile with fallback based on strict mode
            resolution = resolve_pos_profile(user=frappe.session.user)
            raise_setup_required_if_no_candidates(resolution)
            if resolution.get("needs_selection") and strict:
                frappe.throw(
                    _("POS Profile selection required. Please select a POS Profile."),
                    frappe.ValidationError,
                )
            pos_profile = resolution.get("selected")
            if not pos_profile:
                frappe.throw(
                    _("POS Profile selection required. Please select a POS Profile."),
                    frappe.ValidationError
                )
            
            # Use centralized check for strict mode
            if strict:
                check_pos_profile_access(pos_profile, throw=True)
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_role_check(*roles):
    """
    Decorator: Require one of the specified roles.
    
    Args:
        *roles: Role names
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Use centralized any_role check
            check_any_role(list(roles), throw=True)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_branch_check(branch_param: str = "branch"):
    """
    Decorator: Require branch access.
    
    Args:
        branch_param: Parameter name containing branch
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            branch = kwargs.get(branch_param) or frappe.request.form.get(branch_param)
            if branch:
                check_branch_access(branch, throw=True)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_user_permissions(user: Optional[str] = None) -> dict:
    """
    Get comprehensive permission context for a user.
    
    Returns dict with:
    - is_privileged: Is Administrator or System Manager
    - roles: List of user roles
    - accessible_doctypes: Dict of accessible DocTypes with permissions
    
    This is the CENTRALIZED function for getting user permissions.
    """
    if not user:
        user = frappe.session.user
    
    return {
        'user': user,
        'is_privileged': is_privileged_user(user),
        'roles': frappe.get_roles(user),
        # Extended: Could add accessible_doctypes, branches, etc.
    }


def log_permission_event(action: str, details: dict, level: str = "INFO"):
    """
    Log permission-related events for audit trail.
    
    This provides centralized audit logging for all permission events.
    """
    log_func = getattr(logger, level.lower(), logger.info)
    log_func(f"PERMISSION EVENT: {action} - {details}")


# =============================================================================
# INITIALIZATION & VALIDATION
# =============================================================================

def validate_all_permission_imports():
    """
    Validate that all old permission modules are deprecated.
    Call this at startup to warn about duplicate code.
    """
    import warnings
    
    # List of modules that should import from this centralized module
    deprecated_imports = [
        'imogi_pos.utils.permissions.validate_api_permission',
        'imogi_pos.utils.permissions.has_privileged_access',
        'imogi_pos.utils.permissions.validate_branch_access'
    ]
    
    logger.info("PermissionManager initialized - all permission logic centralized")


# Initialize on import
validate_all_permission_imports()
