"""Error handling utilities for IMOGI POS.

This module provides helpers that integrate with the Frappe framework's
error reporting while being resilient to broken pipes.  When a client
closes the connection early, calls to ``frappe.errprint`` may raise a
``BrokenPipeError`` which can mask the original exception.  The helpers
below ensure the original error is logged and that such secondary
exceptions are ignored.
"""

from __future__ import annotations

import traceback
from typing import Any

import frappe


def safe_errprint(message: str | bytes, *args: Any, **kwargs: Any) -> None:
    """Safely call :func:`frappe.errprint`.

    ``frappe.errprint`` writes to ``stderr`` and may raise a
    :class:`BrokenPipeError` if the pipe is closed (for example when the
    client disconnects).  This helper suppresses that specific error so
    the original exception can be handled gracefully.
    """

    try:  # pragma: no cover - straightforward error handling
        frappe.errprint(message, *args, **kwargs)
    except BrokenPipeError:
        # Ignore broken pipe to avoid masking the original exception
        pass


def log_sql_exception(exc: Exception) -> None:
    """Log a SQL exception and attempt to emit it via ``errprint``.

    The exception is first recorded using ``frappe.log_error`` so that the
    details are preserved even if writing to the pipe fails.  Afterwards
    we try to print the traceback using :func:`safe_errprint`.
    """

    frappe.log_error(traceback.format_exc(), "Database Error")
    safe_errprint(str(exc))
