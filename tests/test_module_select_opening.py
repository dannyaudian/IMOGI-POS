import importlib
import sys
import types
from pathlib import Path

import pytest


@pytest.fixture
def module_select_module():
    frappe = types.ModuleType("frappe")
    frappe.session = types.SimpleNamespace(user="test-user")

    def whitelist(methods=None):
        def decorator(fn):
            return fn
        return decorator

    frappe.whitelist = whitelist
    frappe._ = lambda x: x

    class DB:
        def has_column(self, doctype, column):
            return False

        def get_value(self, doctype, name=None, fieldname=None, as_dict=False):
            return None

    frappe.db = DB()
    frappe.log_error = lambda *args, **kwargs: None

    class ValidationError(Exception):
        pass

    class PermissionError(Exception):
        pass

    class AuthenticationError(Exception):
        pass

    frappe.ValidationError = ValidationError
    frappe.PermissionError = PermissionError
    frappe.AuthenticationError = AuthenticationError

    sys.modules['frappe'] = frappe
    utils_module = types.ModuleType("frappe.utils")
    utils_module.cstr = lambda value=None: "" if value is None else str(value)
    utils_module.cint = lambda value=None: int(value or 0)
    sys.modules['frappe.utils'] = utils_module

    api_pkg = types.ModuleType("imogi_pos.api")
    api_pkg.__path__ = [str(Path(__file__).resolve().parents[1] / "imogi_pos" / "api")]
    sys.modules['imogi_pos.api'] = api_pkg

    auth_helpers = types.ModuleType("imogi_pos.utils.auth_helpers")
    auth_helpers.get_user_role_context = lambda user: {}
    sys.modules['imogi_pos.utils.auth_helpers'] = auth_helpers

    operational_context = types.ModuleType("imogi_pos.utils.operational_context")
    operational_context.get_active_operational_context = lambda user=None, auto_resolve=False: {}
    operational_context.resolve_operational_context = lambda **kwargs: {}
    operational_context.require_operational_context = lambda allow_optional=False: {}
    sys.modules['imogi_pos.utils.operational_context'] = operational_context

    role_permissions = types.ModuleType("imogi_pos.utils.role_permissions")
    role_permissions.PRIVILEGED_ROLES = []
    role_permissions.MANAGEMENT_ROLES = []
    sys.modules['imogi_pos.utils.role_permissions'] = role_permissions

    pos_opening = types.ModuleType("imogi_pos.utils.pos_opening")
    pos_opening.resolve_active_pos_opening = lambda **kwargs: {
        "pos_opening_entry": None,
        "pos_profile_name": None,
        "opening_balance": 0,
        "timestamp": None,
        "company": None,
        "scope": None,
        "error_code": "missing_pos_profile",
        "error_message": "POS Profile is required.",
        "messages": "not-array",
        "warnings": None,
    }
    sys.modules['imogi_pos.utils.pos_opening'] = pos_opening

    module_select = importlib.import_module('imogi_pos.api.module_select')
    importlib.reload(module_select)

    yield module_select

    for name in [
        'frappe',
        'frappe.utils',
        'imogi_pos.utils.auth_helpers',
        'imogi_pos.utils.operational_context',
        'imogi_pos.utils.role_permissions',
        'imogi_pos.utils.pos_opening',
        'imogi_pos.api',
        'imogi_pos.api.module_select',
    ]:
        sys.modules.pop(name, None)


def test_normalize_active_opening_forces_arrays(module_select_module):
    result = module_select_module._normalize_active_opening({
        "messages": "raw",
        "warnings": None,
    })
    assert isinstance(result["messages"], list)
    assert isinstance(result["warnings"], list)


def test_get_active_pos_opening_missing_returns_empty_lists(module_select_module):
    result = module_select_module.get_active_pos_opening()
    assert result["pos_opening_entry"] is None
    assert result["messages"] == []
    assert result["warnings"] == []
