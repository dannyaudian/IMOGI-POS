"""Error handling utilities for IMOGI POS.

This module provides helpers that integrate with the Frappe framework's
error reporting while being resilient to broken pipes.  When a client
closes the connection early, calls to ``frappe.errprint`` or the builtin
``print`` may raise a ``BrokenPipeError`` which can mask the original
exception.  The helpers below ensure the original error is logged and
that such secondary exceptions are handled gracefully.
"""

from __future__ import annotations

import traceback
from typing import Any

import frappe
import importlib.machinery
import importlib.util
import importlib.abc
import sys
import types

# Provide minimal ``frappe.utils.response`` implementation for tests when the
# real Frappe package isn't available.
if "frappe.utils.response" not in sys.modules:
    class _DummyLoader(importlib.abc.Loader):
        def create_module(self, spec):  # pragma: no cover - default module
            return None
        def exec_module(self, module):  # pragma: no cover - nothing to exec
            pass

    loader = _DummyLoader()
    utils_mod = types.ModuleType("frappe.utils")
    utils_mod.__loader__ = loader
    utils_mod.__spec__ = importlib.machinery.ModuleSpec("frappe.utils", loader, is_package=True)
    utils_mod.__path__ = []
    response_mod = types.ModuleType("frappe.utils.response")
    response_mod.__loader__ = loader
    response_mod.__spec__ = importlib.machinery.ModuleSpec("frappe.utils.response", loader)

    def report_error():
        frappe_mod = sys.modules.get("frappe")
        tb = getattr(frappe_mod, "get_traceback", lambda: "")()
        if hasattr(frappe_mod, "log_error"):
            frappe_mod.log_error(tb)
        # Use ``safe_errprint`` so a client disconnect doesn't mask the
        # original traceback with a secondary ``BrokenPipeError``
        safe_errprint(tb)

    response_mod.report_error = report_error
    utils_mod.response = response_mod

    class _FrappeFinder(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path, target=None):  # pragma: no cover - simple finder
            if fullname == "frappe.utils":
                return utils_mod.__spec__
            if fullname == "frappe.utils.response":
                return response_mod.__spec__
            return None

    sys.meta_path.insert(0, _FrappeFinder())
    sys.modules["frappe.utils"] = utils_mod
    sys.modules["frappe.utils.response"] = response_mod


def safe_errprint(message: str | bytes, *args: Any, **kwargs: Any) -> None:
    """Safely call :func:`frappe.errprint`.

    ``frappe.errprint`` writes to ``stderr`` and may raise a
    :class:`BrokenPipeError` if the pipe is closed (for example when the
    client disconnects).  This helper suppresses that specific error and
    falls back to :func:`frappe.log_error` so the original exception can
    be handled gracefully.
    """

    try:  # pragma: no cover - straightforward error handling
        frappe.errprint(message, *args, **kwargs)
    except BrokenPipeError:
        # Log the message instead of letting the BrokenPipeError bubble up
        frappe.log_error(message, "BrokenPipeError")


def safe_print(*args: Any, **kwargs: Any) -> None:
    """Safely call the builtin :func:`print`.

    Similar to :func:`safe_errprint`, this helper catches
    :class:`BrokenPipeError` and logs the attempted message using
    :func:`frappe.log_error`.
    """

    try:  # pragma: no cover - straightforward error handling
        print(*args, **kwargs)
    except BrokenPipeError:
        message = " ".join(map(str, args))
        frappe.log_error(message, "BrokenPipeError")


def log_sql_exception(exc: Exception) -> None:
    """Log a SQL exception and attempt to emit it via ``errprint``.

    The exception is first recorded using ``frappe.log_error`` so that the
    details are preserved even if writing to the pipe fails.  Afterwards
    we try to print the traceback using :func:`safe_errprint`.
    """

    frappe.log_error(traceback.format_exc(), "Database Error")
    safe_errprint(str(exc))
