import types
import sys
import importlib
import pytest

def setup_module(module):
    frappe = types.ModuleType("frappe")

    class PermissionError(Exception):
        pass

    def throw(msg, exc):
        raise exc(msg)

    def _(msg):
        return msg

    frappe.PermissionError = PermissionError
    frappe.throw = throw
    frappe._ = _
    frappe._allowed = True

    def has_permission(doctype, doc=None):
        return frappe._allowed

    frappe.has_permission = has_permission
    sys.modules['frappe'] = frappe
    sys.modules.pop("imogi_pos.utils.permissions", None)
    module.perms = importlib.import_module("imogi_pos.utils.permissions")

def test_validate_branch_access_allowed():
    perms.frappe._allowed = True
    # Should not raise
    perms.validate_branch_access("Test Branch")

def test_validate_branch_access_denied():
    perms.frappe._allowed = False
    with pytest.raises(perms.frappe.PermissionError):
        perms.validate_branch_access("Forbidden Branch")
