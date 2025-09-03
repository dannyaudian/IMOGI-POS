import importlib
import sys
import types
import pytest


@pytest.fixture
def layout_module():
    sys.path.insert(0, '.')

    frappe = types.ModuleType('frappe')
    class FrappeException(Exception):
        pass
    frappe.ValidationError = FrappeException
    frappe._ = lambda x: x

    def throw(msg, exc=None):
        raise (exc or Exception)(msg)
    frappe.throw = throw

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner
    frappe.whitelist = whitelist
    frappe.has_permission = lambda doctype, doc=None: True

    frappe.session = types.SimpleNamespace(user='test-user')
    frappe.db = types.SimpleNamespace(get_value=lambda *a, **k: None)

    utils = types.ModuleType('frappe.utils')
    utils.cint = int
    sys.modules['frappe.utils'] = utils
    frappe.utils = utils

    sys.modules['frappe'] = frappe

    layout = importlib.import_module('imogi_pos.api.layout')
    importlib.reload(layout)

    yield layout, frappe

    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('imogi_pos.api.layout', None)
    sys.modules.pop('imogi_pos', None)


def test_check_restaurant_domain_valid(layout_module):
    layout, frappe = layout_module

    def get_value(doctype, filters=None, fieldname=None):
        if doctype == 'POS Profile User' and filters == {'user': 'test-user'} and fieldname == 'parent':
            return 'P1'
        if doctype == 'POS Profile' and filters == 'P1' and fieldname == 'imogi_pos_domain':
            return 'Restaurant'
        return None
    frappe.db.get_value = get_value

    layout.check_restaurant_domain()


def test_check_restaurant_domain_missing_profile(layout_module):
    layout, frappe = layout_module

    frappe.db.get_value = lambda *a, **k: None

    with pytest.raises(frappe.ValidationError) as exc:
        layout.check_restaurant_domain()
    assert 'No POS Profile found' in str(exc.value)
