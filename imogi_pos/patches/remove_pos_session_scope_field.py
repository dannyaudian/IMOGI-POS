"""
DEPRECATED PATCH - No longer used.

This patch was for removing session_scope field from POS Session doctype.
Since POS Session doctype is no longer used (migrated to POS Opening Entry),
this patch is not needed.

Kept for historical reference only.
"""

import frappe


def execute():
    """
    This patch is deprecated and does nothing.
    POS Session doctype is no longer used in IMOGI-POS.
    """
    print("✓ Skipping deprecated patch: remove_pos_session_scope_field")
    print("  Reason: POS Session doctype no longer used")
    pass
