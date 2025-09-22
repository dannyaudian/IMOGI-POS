import importlib
import json
import sys
import types
from types import SimpleNamespace

import pytest


@pytest.fixture
def modifiers_module():
    sys.path.insert(0, ".")

    frappe = types.ModuleType("frappe")
    utils = types.ModuleType("frappe.utils")
    utils.flt = float
    frappe.utils = utils
    frappe._ = lambda x: x
    frappe.parse_json = json.loads

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn

        return inner

    frappe.whitelist = whitelist

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    module = importlib.import_module("imogi_pos.api.invoice_modifiers")
    importlib.reload(module)

    yield module

    sys.modules.pop("frappe", None)
    sys.modules.pop("frappe.utils", None)
    sys.modules.pop("imogi_pos.api.invoice_modifiers", None)
    sys.modules.pop("imogi_pos.api.items", None)
    sys.modules.pop("imogi_pos", None)
    if sys.path and sys.path[0] == ".":
        sys.path.pop(0)


def test_apply_invoice_modifiers_updates_packed_items(modifiers_module):
    module = modifiers_module

    module.get_item_options = lambda item_code: {
        "size": [
            {"label": "Large", "value": "Large", "modifiers": {"qty_factor": 1.5}},
        ],
        "extras": [
            {
                "label": "Extra Shot",
                "value": "Extra Shot",
                "modifiers": [
                    {"component_deltas": [{"item_code": "ESPRESSO_SHOT", "qty": 1}]}
                ],
            }
        ],
        "topping": [
            {
                "label": "Cinnamon",
                "value": "Cinnamon",
                "modifiers": [{"component_deltas": {"CINNAMON": 0.2}}],
            }
        ],
    }

    class InvoiceDoc:
        def __init__(self):
            self.items = []
            self.packed_items = []

        def append(self, field, value):
            if field != "packed_items":
                raise AttributeError(field)
            row = SimpleNamespace(**value)
            self.packed_items.append(row)
            return row

    invoice = InvoiceDoc()
    item = SimpleNamespace(
        item_code="LATTE",
        qty=2,
        pos_customizations={
            "size": ["Large"],
            "extras": ["Extra Shot"],
            "topping": ["Cinnamon"],
        },
    )
    invoice.items.append(item)
    invoice.packed_items.append(SimpleNamespace(parent_item="LATTE", item_code="ESPRESSO_SHOT", qty=2))
    invoice.packed_items.append(SimpleNamespace(parent_item="LATTE", item_code="MILK", qty=100))

    module.apply_invoice_modifiers(invoice)

    assert pytest.approx(invoice.packed_items[0].qty) == 5.0
    assert pytest.approx(invoice.packed_items[1].qty) == 150.0

    cinnamon = next((row for row in invoice.packed_items if row.item_code == "CINNAMON"), None)
    assert cinnamon is not None
    assert pytest.approx(cinnamon.qty) == 0.4
