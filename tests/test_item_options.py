import importlib
import sys
import types
import pytest


@pytest.fixture
def items_module():
    sys.path.insert(0, ".")

    frappe = types.ModuleType("frappe")

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist
    frappe._ = lambda x: x

    # Stub get_doc to return empty object
    frappe.get_doc = lambda *a, **k: types.SimpleNamespace()

    def get_all(doctype, filters=None, fields=None, pluck=None):
        if doctype == "Item Option":
            return [
                {"option_type": "Size", "option": "Large"},
                {"option_type": "Spice Level", "option": "Hot"},
            ]
        if doctype == "Item Topping":
            if pluck == "topping":
                return ["Cheese"]
            return [{"topping": "Cheese"}]
        return []

    frappe.get_all = get_all

    sys.modules["frappe"] = frappe

    items = importlib.import_module("imogi_pos.api.items")
    importlib.reload(items)

    yield items

    sys.modules.pop("frappe", None)
    sys.modules.pop("imogi_pos.api.items", None)
    sys.path.pop(0)


def test_get_item_options_structure(items_module):
    result = items_module.get_item_options("ITEM-1")
    assert set(result.keys()) == {"sizes", "spice_levels", "toppings"}
    assert result["sizes"] == ["Large"]
    assert result["spice_levels"] == ["Hot"]
    assert result["toppings"] == ["Cheese"]
