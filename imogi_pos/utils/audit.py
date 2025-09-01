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
    pass


def log_deletion(doc, method=None):
    """Record document deletions for audit trail.

    Args:
        doc: The document being deleted.
        method: Hook method (unused).
    """
    pass


def log_state_change(doc, method=None):
    """Log state transitions for documents.

    Args:
        doc: The document being updated.
        method: Hook method (unused).
    """
    pass
