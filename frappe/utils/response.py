"""Response helpers patched for IMOGI POS tests.

This module provides a minimal implementation of Frappe's
``frappe.utils.response`` module.  The :func:`report_error` helper
is modified to use :func:`imogi_pos.utils.error.safe_errprint` instead
of calling :func:`frappe.errprint` directly.  This ensures that logging
errors does not raise ``BrokenPipeError`` when the underlying pipe is
closed.
"""

from __future__ import annotations

import frappe
from imogi_pos.utils.error import safe_errprint


def report_error(status_code: int | None = None) -> None:
    """Log the current traceback and emit it safely.

    The original Frappe implementation would call ``frappe.errprint``
    directly which could raise ``BrokenPipeError`` if ``stderr`` is
    closed.  We first log the traceback using ``frappe.log_error`` and
    then use :func:`safe_errprint` to safely attempt printing it.
    """

    message = frappe.get_traceback()
    frappe.log_error(message)
    safe_errprint(message)

