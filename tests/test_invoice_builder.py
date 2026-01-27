import importlib
import sys
import types
import datetime
import pytest


@pytest.fixture
def invoice_builder_module():
    sys.path.insert(0, '.')
    utils = types.ModuleType("frappe.utils")
    utils.now_datetime = lambda: datetime.datetime(2023, 1, 1, 0, 0, 0)
    utils.nowdate = lambda: "2023-01-01"
    utils.get_datetime = lambda x=None: datetime.datetime(2023, 1, 1, 0, 0, 0)

    frappe = types.ModuleType("frappe")
    frappe._ = lambda x: x
    def throw(msg, exc=None):
        raise (exc or Exception)(msg)
    frappe.throw = throw
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.local = types.SimpleNamespace(request_ip="test-device")

    class DB:
        def __init__(self):
            self.exists_map = {}
        def get_value(self, doctype, name=None, fieldname=None, as_dict=False):
            return 0
        def exists(self, doctype, name):
            return self.exists_map.get((doctype, name), True)
    frappe.db = DB()
    frappe.defaults = types.SimpleNamespace(get_user_default=lambda key: "COMP-1")
    frappe.utils = utils

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils

    invoice_builder = importlib.import_module('imogi_pos.billing.invoice_builder')
    importlib.reload(invoice_builder)

    yield invoice_builder, frappe

    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('imogi_pos.billing.invoice_builder', None)
    sys.modules.pop('imogi_pos', None)


def test_get_active_pos_opening_returns_none_if_doctype_missing(invoice_builder_module):
    invoice_builder, frappe = invoice_builder_module
    frappe.db.exists_map[("DocType", "POS Opening Entry")] = False
    assert invoice_builder.get_active_pos_opening("P1") is None
