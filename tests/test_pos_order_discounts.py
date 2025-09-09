import importlib
import sys
import types
import pytest


@pytest.fixture
def pos_order_module():
    sys.path.insert(0, '.')

    # Minimal frappe setup
    frappe = types.ModuleType('frappe')
    frappe._ = lambda x: x

    utils = types.ModuleType('frappe.utils')
    utils.flt = lambda x=0: float(x or 0)
    frappe.utils = utils

    # Stub Document class
    model = types.ModuleType('frappe.model')
    document = types.ModuleType('frappe.model.document')

    class Document:
        pass

    document.Document = Document
    model.document = document

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils
    sys.modules['frappe.model'] = model
    sys.modules['frappe.model.document'] = document

    module = importlib.import_module('imogi_pos.imogi_pos.doctype.pos_order.pos_order')
    importlib.reload(module)

    yield module

    # Cleanup
    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('frappe.model', None)
    sys.modules.pop('frappe.model.document', None)
    sys.modules.pop('imogi_pos.imogi_pos.doctype.pos_order.pos_order', None)
    sys.modules.pop('imogi_pos.imogi_pos.doctype.pos_order', None)
    sys.modules.pop('imogi_pos.imogi_pos.doctype', None)
    sys.modules.pop('imogi_pos.imogi_pos', None)
    sys.modules.pop('imogi_pos', None)
    sys.path.pop(0)


def test_calculate_totals_with_string_discount_percent(pos_order_module):
    POSOrder = pos_order_module.POSOrder
    item = types.SimpleNamespace(qty=2, rate=50, amount=None)
    order = POSOrder()
    order.items = [item]
    order.discount_percent = '10'
    order.discount_amount = None

    order.calculate_totals()

    assert order.subtotal == 100
    assert order.pb1_amount == pytest.approx(11)
    # 10% discount on subtotal_with_pb1 (111) -> 11.1
    assert order.discount_amount == pytest.approx(11.1)
    assert order.totals == pytest.approx(99.9)


def test_calculate_totals_with_string_discount_amount(pos_order_module):
    POSOrder = pos_order_module.POSOrder
    item = types.SimpleNamespace(qty=1, rate=100, amount=None)
    order = POSOrder()
    order.items = [item]
    order.discount_percent = 0
    order.discount_amount = '5'

    order.calculate_totals()

    assert order.subtotal == 100
    assert order.pb1_amount == pytest.approx(11)
    assert order.discount_amount == pytest.approx(5)
    assert order.totals == pytest.approx(106)

