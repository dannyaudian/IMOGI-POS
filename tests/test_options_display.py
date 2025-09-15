import importlib
import sys
import types

# Ensure package root is on path
sys.path.insert(0, ".")

import pytest

from imogi_pos.utils.options import format_options_for_display


@pytest.fixture
def frappe_stub():
    frappe = types.ModuleType("frappe")
    frappe.session = types.SimpleNamespace(user="test-user")
    model = types.ModuleType("model")
    document = types.ModuleType("document")

    class Document:
        pass

    document.Document = Document
    model.document = document
    frappe.model = model

    sys.modules['frappe'] = frappe
    sys.modules['frappe.model'] = model
    sys.modules['frappe.model.document'] = document
    yield frappe
    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.model', None)
    sys.modules.pop('frappe.model.document', None)


def test_format_options_for_display_dict():
    opts = {
        "size": {"name": "Large"},
        "extras": [{"name": "Cheese"}, {"name": "Bacon"}],
    }
    assert format_options_for_display(opts) == "Size: Large | Extras: Cheese, Bacon"


def test_pos_order_item_sets_options_display(frappe_stub):
    module = importlib.import_module(
        "imogi_pos.imogi_pos.doctype.pos_order_item.pos_order_item"
    )
    item = module.POSOrderItem()
    item.item_options = {"sugar": "Less"}
    item.set_options_display()
    assert item.options_display == "Sugar: Less"


def test_kot_item_sets_options_display(frappe_stub):
    module = importlib.import_module(
        "imogi_pos.imogi_pos.doctype.kot_item.kot_item"
    )
    item = module.KOTItem()
    item.item_options = {"temperature": {"name": "Hot"}}
    item.set_options_display()
    assert item.options_display == "Temperature: Hot"
