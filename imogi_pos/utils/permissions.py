"""Permissions utilities for IMOGI POS."""

import frappe
from frappe import _


def validate_branch_access(branch):
    """Validate that the current user can access the given branch.

    Args:
        branch (str): Branch name.

    Raises:
        frappe.PermissionError: If the user lacks access to the branch.
    """
    if not frappe.has_permission("Branch", doc=branch):
        frappe.throw(_("You don't have access to branch: {0}").format(branch),
                    frappe.PermissionError)
