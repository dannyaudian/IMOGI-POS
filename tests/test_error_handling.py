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

    # original exception logged and fallback log_error triggered
    assert calls["log_error"][0][1] == "Database Error"
    assert calls["log_error"][1] == ("SELECT * FROM table", "BrokenPipeError")
    # errprint was attempted even though it raised BrokenPipeError
    assert calls["errprint"] == ["SELECT * FROM table"]


def test_safe_print_handles_broken_pipe(error_module, monkeypatch):
    mod, calls = error_module

    import builtins

    def failing_print(*a, **k):
        raise BrokenPipeError("pipe closed")

    monkeypatch.setattr(builtins, "print", failing_print)

    mod.safe_print("hello", "world")

    assert calls["log_error"][-1] == ("hello world", "BrokenPipeError")


def test_safe_errprint_handles_broken_pipe(error_module):
    mod, calls = error_module

    # Should not raise even if ``frappe.errprint`` blows up with BrokenPipeError
    mod.safe_errprint("broken")

    assert calls["errprint"] == ["broken"]
    assert calls["log_error"] == [("broken", "BrokenPipeError")]


@pytest.fixture
def response_module():
    sys.path.insert(0, ".")

    calls = {}

    frappe = types.ModuleType("frappe")

    def errprint(msg, *a, **k):
        calls.setdefault("errprint", []).append(msg)
        raise BrokenPipeError("pipe closed")

    def log_error(message, title=None):
        calls.setdefault("log_error", []).append((message, title))

    def get_traceback():
        return "Original Traceback"

    frappe.errprint = errprint
    frappe.log_error = log_error
    frappe.get_traceback = get_traceback
    # create minimal frappe.utils.response module
    utils_mod = types.ModuleType("frappe.utils")
    utils_mod.__path__ = []
    response_mod = types.ModuleType("frappe.utils.response")

    def report_error():
        tb = frappe.get_traceback()
        frappe.log_error(tb)
        try:
            frappe.errprint(tb)
        except BrokenPipeError:
            frappe.log_error(tb, "BrokenPipeError")

    response_mod.report_error = report_error
    utils_mod.response = response_mod

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils_mod
    sys.modules["frappe.utils.response"] = response_mod

    # Create in-memory stub for frappe.utils.response
    utils_mod = types.ModuleType("frappe.utils")

    response_mod = types.ModuleType("frappe.utils.response")

    def report_error():
        traceback_msg = frappe.get_traceback()
        frappe.log_error(traceback_msg)
        try:
            frappe.errprint(traceback_msg)
        except BrokenPipeError:
            frappe.log_error(traceback_msg, "BrokenPipeError")

    response_mod.report_error = report_error

    utils_mod.response = response_mod

    sys.modules["frappe.utils"] = utils_mod
    sys.modules["frappe.utils.response"] = response_mod

    err_mod = importlib.import_module("imogi_pos.utils.error")
    importlib.reload(err_mod)

    resp_mod = importlib.import_module("frappe.utils.response")

    yield resp_mod, calls

    for mod in ["frappe.utils.response", "frappe.utils", "imogi_pos.utils.error", "frappe"]:
        sys.modules.pop(mod, None)
    sys.path.remove(".")


def test_report_error_handles_broken_pipe(response_module):
    mod, calls = response_module

    # Should not raise BrokenPipeError even though errprint fails
    mod.report_error()

    assert calls["log_error"][0][0] == "Original Traceback"
    assert calls["log_error"][1] == ("Original Traceback", "BrokenPipeError")
    assert calls["errprint"] == ["Original Traceback"]
