# -*- coding: utf-8 -*-
"""Role-based permission configuration for IMOGI POS.

This module defines permission restrictions for different roles across
DocTypes, fields, buttons, and actions.
"""

import frappe
from frappe import _


# ============================================================================
# ROLE DEFINITIONS
# ============================================================================

PRIVILEGED_ROLES = ["Administrator", "System Manager"]

# Management hierarchy roles
MANAGEMENT_ROLES = ["Area Manager", "Branch Manager"]

# Financial roles
FINANCE_ROLES = ["Finance Controller"]

RESTRICTED_ROLES = {
    "Area Manager": {
        "description": "Manages multiple branches in an area",
        "level": "multi_branch",
        "hierarchy": 2
    },
    "Branch Manager": {
        "description": "Manages single branch operations",
        "level": "branch_manager",
        "hierarchy": 3
    },
    "Finance Controller": {
        "description": "Financial oversight and reporting across branches",
        "level": "finance",
        "hierarchy": 2
    },
    "Cashier": {
        "description": "POS operations for assigned branch only",
        "level": "branch_restricted",
        "hierarchy": 4
    },
    "Waiter": {
        "description": "Restaurant operations for assigned branch only",
        "level": "branch_restricted",
        "hierarchy": 4
    },
    "Kitchen Staff": {
        "description": "Kitchen operations for assigned station only",
        "level": "station_restricted",
        "hierarchy": 4
    }
}


# ============================================================================
# DOCTYPE RESTRICTIONS
# ============================================================================

DOCTYPE_RESTRICTIONS = {
    # System Configuration (System Manager only)
    "POS Profile": {
        "create": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Waiter"],
        "write": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "delete": PRIVILEGED_ROLES,
    },
    
    "Branch": {
        "create": PRIVILEGED_ROLES + ["Area Manager"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier", "Waiter", "Kitchen Staff"],
        "write": PRIVILEGED_ROLES + ["Area Manager"],
        "delete": PRIVILEGED_ROLES,
    },
    
    "Kitchen": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff", "Waiter"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "delete": PRIVILEGED_ROLES + ["Area Manager"],
    },
    
    "Kitchen Station": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "delete": PRIVILEGED_ROLES + ["Area Manager"],
    },
    
    # Operational Documents
    "POS Order": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Waiter"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier", "Waiter", "Kitchen Staff"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Waiter"],
        "delete": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "cancel": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
    },
    
    "Sales Invoice": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier", "Accounts User"],
        "write": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager", "Cashier"],
        "delete": PRIVILEGED_ROLES + ["Area Manager"],
        "cancel": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager", "Finance Controller"],
        "amend": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
    },
    
    "KOT Ticket": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter", "Cashier"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter", "Kitchen Staff", "Cashier"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
        "delete": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "cancel": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
    },
    
    "Restaurant Table": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter", "Cashier"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter"],
        "delete": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
    },
    
    "Customer": {
        "create": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Waiter", "Sales User"],
        "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier", "Waiter", "Sales User"],
        "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Sales User"],
        "delete": PRIVILEGED_ROLES + ["Area Manager"],
    },
}


# ============================================================================
# FIELD-LEVEL RESTRICTIONS
# ============================================================================

FIELD_RESTRICTIONS = {
    "POS Order": {
        # Financial fields - restricted to Cashier and above
        "discount_amount": {
            "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier"],
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        },
        "discount_percent": {
            "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier"],
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        },
        "promo_code": {
            "read": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier"],
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        },
        # Administrative fields - Management only
        "branch": {
            "write": PRIVILEGED_ROLES + ["Area Manager"],
        },
        "pos_profile": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        },
    },
    
    "Sales Invoice": {
        # Pricing fields
        "discount_amount": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        },
        "additional_discount_percentage": {
            "write": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        },
        # Payment fields
        "paid_amount": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier"],
        },
        # Administrative
        "cost_center": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Accounts User"],
        },
    },
    
    "KOT Ticket": {
        # Status changes
        "workflow_state": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
        },
        # Kitchen assignment
        "kitchen": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        },
        "station": {
            "write": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        },
    },
}


# ============================================================================
# BUTTON/ACTION RESTRICTIONS
# ============================================================================

BUTTON_RESTRICTIONS = {
    "POS Order": {
        "cancel_order": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "refund_order": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        "modify_discount": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        "change_table": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter"],
        "split_order": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter"],
        "merge_orders": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
    },
    
    "Sales Invoice": {
        "cancel": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager", "Finance Controller"],
        "amend": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "make_return": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier"],
        "payment_entry": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier", "Accounts User"],
    },
    
    "KOT Ticket": {
        "mark_ready": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
        "mark_served": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff", "Waiter"],
        "cancel_kot": PRIVILEGED_ROLES + ["Area Manager", "Branch Manager"],
        "reprint": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
    },
    
    "Restaurant Table": {
        "reserve_table": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter"],
        "clear_table": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter"],
        "merge_tables": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
    },
}


# ============================================================================
# MENU RESTRICTIONS
# ============================================================================

MENU_RESTRICTIONS = {
    "POS": {
        "visible_for": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Cashier", "Waiter"],
    },
    "Restaurant": {
        "visible_for": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Waiter", "Kitchen Staff"],
    },
    "Kitchen Display": {
        "visible_for": PRIVILEGED_ROLES + MANAGEMENT_ROLES + ["Kitchen Staff"],
    },
    "Reports": {
        "POS Sales Report": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Accounts User"],
        "Kitchen Performance": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "Table Occupancy": PRIVILEGED_ROLES + MANAGEMENT_ROLES,
        "Cashier Session": PRIVILEGED_ROLES + MANAGEMENT_ROLES + FINANCE_ROLES + ["Cashier"],
        "Financial Reports": PRIVILEGED_ROLES + ["Area Manager"] + FINANCE_ROLES + ["Accounts Manager"],
        "Branch Performance": PRIVILEGED_ROLES + ["Area Manager"] + FINANCE_ROLES,
    },
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def has_doctype_permission(doctype, perm_type="read", user=None):
    """Check if user has permission for DocType based on role restrictions.
    
    Args:
        doctype (str): DocType name
        perm_type (str): Permission type (read, write, create, delete, etc.)
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        bool: True if user has permission
    """
    if not user:
        user = frappe.session.user
    
    # Administrator always has access
    if user == "Administrator":
        return True
    
    user_roles = frappe.get_roles(user)
    
    # System Manager always has access
    if "System Manager" in user_roles:
        return True
    
    # Check if DocType has restrictions
    if doctype not in DOCTYPE_RESTRICTIONS:
        # No restrictions defined, use native ERPNext permissions
        return frappe.has_permission(doctype, perm_type=perm_type, user=user)
    
    # Check role-based restrictions
    allowed_roles = DOCTYPE_RESTRICTIONS[doctype].get(perm_type, [])
    return any(role in user_roles for role in allowed_roles)


def has_field_permission(doctype, fieldname, perm_type="read", user=None):
    """Check if user has permission for specific field.
    
    Args:
        doctype (str): DocType name
        fieldname (str): Field name
        perm_type (str): Permission type (read, write)
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        bool: True if user has permission
    """
    if not user:
        user = frappe.session.user
    
    # Administrator always has access
    if user == "Administrator":
        return True
    
    user_roles = frappe.get_roles(user)
    
    # System Manager always has access
    if "System Manager" in user_roles:
        return True
    
    # Check if field has restrictions
    if doctype not in FIELD_RESTRICTIONS:
        return True
    
    if fieldname not in FIELD_RESTRICTIONS[doctype]:
        return True
    
    # Check role-based restrictions
    allowed_roles = FIELD_RESTRICTIONS[doctype][fieldname].get(perm_type, [])
    if not allowed_roles:
        return True
    
    return any(role in user_roles for role in allowed_roles)


def has_button_permission(doctype, button_name, user=None):
    """Check if user has permission to see/use specific button.
    
    Args:
        doctype (str): DocType name
        button_name (str): Button/action name
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        bool: True if user has permission
    """
    if not user:
        user = frappe.session.user
    
    # Administrator always has access
    if user == "Administrator":
        return True
    
    user_roles = frappe.get_roles(user)
    
    # System Manager always has access
    if "System Manager" in user_roles:
        return True
    
    # Check if button has restrictions
    if doctype not in BUTTON_RESTRICTIONS:
        return True
    
    if button_name not in BUTTON_RESTRICTIONS[doctype]:
        return True
    
    # Check role-based restrictions
    allowed_roles = BUTTON_RESTRICTIONS[doctype][button_name]
    return any(role in user_roles for role in allowed_roles)


def has_menu_access(menu_item, user=None):
    """Check if user has access to menu item.
    
    Args:
        menu_item (str): Menu item name
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        bool: True if user has access
    """
    if not user:
        user = frappe.session.user
    
    # Administrator always has access
    if user == "Administrator":
        return True
    
    user_roles = frappe.get_roles(user)
    
    # System Manager always has access
    if "System Manager" in user_roles:
        return True
    
    # Check if menu has restrictions
    if menu_item not in MENU_RESTRICTIONS:
        return True
    
    # Check role-based restrictions
    allowed_roles = MENU_RESTRICTIONS[menu_item].get("visible_for", [])
    if not allowed_roles:
        return True
    
    return any(role in user_roles for role in allowed_roles)


def get_user_permissions_context(user=None):
    """Get comprehensive permission context for user.
    
    Args:
        user (str, optional): User email. Defaults to current user.
        
    Returns:
        dict: Permission context with accessible doctypes, fields, buttons, menus
    """
    if not user:
        user = frappe.session.user
    
    user_roles = frappe.get_roles(user)
    is_privileged = user == "Administrator" or "System Manager" in user_roles
    
    context = {
        "user": user,
        "roles": user_roles,
        "is_privileged": is_privileged,
        "accessible_doctypes": {},
        "restricted_fields": {},
        "accessible_buttons": {},
        "accessible_menus": [],
    }
    
    # Get accessible DocTypes
    for doctype in DOCTYPE_RESTRICTIONS.keys():
        context["accessible_doctypes"][doctype] = {
            "read": has_doctype_permission(doctype, "read", user),
            "write": has_doctype_permission(doctype, "write", user),
            "create": has_doctype_permission(doctype, "create", user),
            "delete": has_doctype_permission(doctype, "delete", user),
        }
    
    # Get restricted fields
    for doctype, fields in FIELD_RESTRICTIONS.items():
        context["restricted_fields"][doctype] = {}
        for field in fields.keys():
            context["restricted_fields"][doctype][field] = {
                "read": has_field_permission(doctype, field, "read", user),
                "write": has_field_permission(doctype, field, "write", user),
            }
    
    # Get accessible buttons
    for doctype, buttons in BUTTON_RESTRICTIONS.items():
        context["accessible_buttons"][doctype] = {}
        for button in buttons.keys():
            context["accessible_buttons"][doctype][button] = has_button_permission(doctype, button, user)
    
    # Get accessible menus
    for menu in MENU_RESTRICTIONS.keys():
        if has_menu_access(menu, user):
            context["accessible_menus"].append(menu)
    
    return context


@frappe.whitelist()
def get_permissions_for_user(user=None):
    """API endpoint to get permission context for user.
    
    Returns:
        dict: User permission context
    """
    if not user:
        user = frappe.session.user
    
    # Only allow users to query their own permissions unless privileged
    if user != frappe.session.user:
        if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
            frappe.throw(
                _("You can only query your own permissions"),
                frappe.PermissionError
            )
    
    return get_user_permissions_context(user)


def get_permission_query_conditions(user, doctype):
    """Get query conditions for list views based on user permissions.
    
    This is called by Frappe's permission system to filter list views.
    Administrator and System Manager see all records.
    Other users see only records from their assigned branch.
    
    Args:
        user (str): User name (passed by Frappe)
        doctype (str): DocType name
        
    Returns:
        str: SQL condition string or None for no restrictions
    """
    # Administrator sees everything
    if user == "Administrator":
        return None
    
    user_roles = frappe.get_roles(user)
    
    # System Manager sees everything
    if "System Manager" in user_roles:
        return None
    
    # Get user's assigned branches from POS Profile
    user_branches = frappe.get_all(
        "POS Profile User",
        filters={"user": user},
        fields=["parent"],
        distinct=True
    )
    
    if not user_branches:
        # User has no POS Profile assignment, allow no access
        return "1=0"  # SQL condition that always fails
    
    # Get branches from POS Profiles
    branches = []
    for profile in user_branches:
        branch = frappe.db.get_value("POS Profile", profile.parent, "imogi_branch")
        if branch:
            branches.append(branch)
    
    if not branches:
        return "1=0"
    
    # For doctypes with branch field, filter by user's branches
    if frappe.db.has_column(doctype, "branch"):
        branch_list = ", ".join([f"'{b}'" for b in branches])
        return f"`tab{doctype}`.`branch` IN ({branch_list})"
    
    # For Kitchen Station, filter by kitchen's branch
    if doctype == "Kitchen Station":
        kitchen_branches = frappe.get_all(
            "Kitchen",
            filters={"branch": ["in", branches]},
            pluck="name"
        )
        if not kitchen_branches:
            return "1=0"
        kitchen_list = ", ".join([f"'{k}'" for k in kitchen_branches])
        return f"`tabKitchen Station`.`parent_kitchen` IN ({kitchen_list})"
    
    # Default: no additional restrictions
    return None
