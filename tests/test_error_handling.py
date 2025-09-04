import importlib
import sys
import types

import pytest


@pytest.fixture
def error_module():
    sys.path.insert(0, ".")

    calls = {}

    frappe = types.ModuleType("frappe")

    def errprint(msg, *a, **k):
        calls.setdefault("errprint", []).append(msg)
        raise BrokenPipeError("pipe closed")

    def log_error(message, title=None):
        calls.setdefault("log_error", []).append((message, title))

    frappe.errprint = errprint
    frappe.log_error = log_error

    sys.modules["frappe"] = frappe

    mod = importlib.import_module("imogi_pos.utils.error")
    importlib.reload(mod)

    yield mod, calls

    sys.modules.pop("frappe", None)
    sys.modules.pop("imogi_pos.utils.error", None)
    sys.path.remove(".")


def test_log_sql_exception_handles_broken_pipe(error_module):
    mod, calls = error_module

    try:
        raise Exception("SELECT * FROM table")
    except Exception as exc:
        # should not raise BrokenPipeError
        mod.log_sql_exception(exc)

    # original exception logged before BrokenPipeError occurs
    assert calls["log_error"], "log_error was not called"
    # errprint was attempted even though it raised BrokenPipeError
    assert calls["errprint"] == ["SELECT * FROM table"]
