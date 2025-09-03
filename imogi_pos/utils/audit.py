"""Audit utilities for IMOGI POS.

This module contains helper stubs for audit related hooks.
"""

import frappe


def sync_last_edited_by(doc, method=None):
    """Synchronize ``last_edited_by`` field before saving.

    Args:
        doc: The document being saved.
        method: Hook method (unused).
    """
    try:
        if hasattr(doc, "last_edited_by"):
            doc.last_edited_by = getattr(doc, "modified_by", None)
    except Exception:
        frappe.logger("imogi_pos.audit").debug(
            "Failed to sync last_edited_by for %s", getattr(doc, "name", None)
        )


def log_deletion(doc, method=None):
    """Record document deletions for audit trail.

    Args:
        doc: The document being deleted.
        method: Hook method (unused).
    """
    try:
        user = getattr(frappe.session, "user", None)
        frappe.logger("imogi_pos.audit").info(
            "Deleted %s %s by %s", getattr(doc, "doctype", None), getattr(doc, "name", None), user
        )
    except Exception:
        # swallow logging errors to avoid breaking the deletion hook
        frappe.logger("imogi_pos.audit").debug(
            "Failed to log deletion for %s", getattr(doc, "name", None)
        )


def log_state_change(doc, method=None):
    """Log state transitions for documents.

    Args:
        doc: The document being updated.
        method: Hook method (unused).
    """
    try:
        field = None
        if hasattr(doc, "workflow_state"):
            field = "workflow_state"
        elif hasattr(doc, "status"):
            field = "status"

        if field:
            previous = frappe.db.get_value(doc.doctype, doc.name, field)
            current = getattr(doc, field)
            if previous != current:
                user = getattr(frappe.session, "user", None)
                frappe.logger("imogi_pos.audit").info(
                    "%s %s %s changed from %s to %s by %s",
                    doc.doctype,
                    doc.name,
                    field,
                    previous,
                    current,
                    user,
                )
    except Exception:
        # ensure that audit logging never interrupts document processing
        frappe.logger("imogi_pos.audit").debug(
            "Failed to log state change for %s", getattr(doc, "name", None)
        )
