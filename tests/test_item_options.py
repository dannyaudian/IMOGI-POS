import importlib
import sys
import types


def load_items_with_doc(item_doc):
    sys.path.insert(0, ".")
    frappe = types.ModuleType("frappe")

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist
    frappe._ = lambda x: x
    frappe.get_doc = lambda *a, **k: item_doc

    sys.modules["frappe"] = frappe

    items = importlib.import_module("imogi_pos.api.items")
    importlib.reload(items)
    return items


def unload_items_module():
    sys.modules.pop("frappe", None)
    sys.modules.pop("imogi_pos.api.items", None)
    sys.path.pop(0)


def test_get_item_options_structure():
    item_doc = types.SimpleNamespace(
        has_size_option=1,
        has_spice_option=1,
        has_topping_option=1,
        item_size_options=[types.SimpleNamespace(option_name="Large", additional_price=0)],
        item_spice_options=[types.SimpleNamespace(option_name="Hot", additional_price=0)],
        item_topping_options=[types.SimpleNamespace(option_name="Cheese", additional_price=0)],
    )
    items = load_items_with_doc(item_doc)
    result = items.get_item_options("ITEM-1")
    unload_items_module()

    assert set(result.keys()) == {"sizes", "spices", "toppings"}
    assert result["sizes"] == [{"option_name": "Large", "additional_price": 0}]
    assert result["spices"] == [{"option_name": "Hot", "additional_price": 0}]
    assert result["toppings"] == [{"option_name": "Cheese", "additional_price": 0}]


def test_get_item_options_skip_inactive():
    item_doc = types.SimpleNamespace(
        has_size_option=1,
        has_spice_option=0,
        has_topping_option=0,
        item_size_options=[types.SimpleNamespace(option_name="Large", additional_price=0)],
    )
    items = load_items_with_doc(item_doc)
    result = items.get_item_options("ITEM-1")
    unload_items_module()

    assert result == {"sizes": [{"option_name": "Large", "additional_price": 0}]}


def test_set_item_flags_special_category():
    items = load_items_with_doc(None)

    class DummyDoc:
        def __init__(self):
            self._data = {"menu_category": "Special"}

        def get(self, key):
            return self._data.get(key)

        def set(self, key, value):
            self._data[key] = value

    doc = DummyDoc()
    items.set_item_flags(doc)
    unload_items_module()

    assert doc.get("has_size") == 1
    assert doc.get("has_spice") == 1
    assert doc.get("has_topping") == 1

