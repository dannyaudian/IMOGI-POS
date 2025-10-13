import importlib
import sys
import types


def load_items_with_doc(item_doc, kitchen_routes=None):
    sys.path.insert(0, ".")
    frappe = types.ModuleType("frappe")

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist
    frappe._ = lambda x: x
    frappe.get_cached_doc = lambda *a, **k: item_doc

    sys.modules["frappe"] = frappe

    kitchen_routes = kitchen_routes or {}
    route_map = {
        (str(key).strip().casefold() if isinstance(key, str) else str(key).casefold()): value
        for key, value in kitchen_routes.items()
        if key is not None and value is not None
    }

    kitchen_routing = types.ModuleType("imogi_pos.utils.kitchen_routing")

    def get_menu_category_kitchen_station_by_category(category):
        if category is None:
            return (None, None)
        key = str(category).strip().casefold()
        return route_map.get(key, (None, None))

    kitchen_routing.get_menu_category_kitchen_station_by_category = (
        get_menu_category_kitchen_station_by_category
    )
    kitchen_routing.get_menu_category_kitchen_station = lambda *_args, **_kwargs: (None, None)

    sys.modules["imogi_pos.utils.kitchen_routing"] = kitchen_routing

    items = importlib.import_module("imogi_pos.api.items")
    importlib.reload(items)
    return items


def unload_items_module():
    sys.modules.pop("frappe", None)
    sys.modules.pop("imogi_pos.api.items", None)
    sys.modules.pop("imogi_pos.utils.kitchen_routing", None)
    sys.path.pop(0)


def test_get_item_options_returns_empty_when_disabled():
    item_doc = types.SimpleNamespace(
        has_size_option=1,
        has_spice_option=1,
        has_topping_option=1,
        has_variant_option=1,
        has_sugar_option=1,
        has_ice_option=1,
        item_size_options=[
            types.SimpleNamespace(
                option_name="Large",
                additional_price=0,
                linked_item="ITEM-LARGE",
                qty_factor=1.5,
                components=[
                    types.SimpleNamespace(
                        component="Espresso", item_code="ITEM-ESPRESSO", qty=1
                    )
                ],
                components_delta=[
                    types.SimpleNamespace(
                        component="Water", item_code="ITEM-WATER", qty_delta=-0.25
                    )
                ],
            )
        ],
        item_spice_options=[types.SimpleNamespace(option_name="Hot", additional_price=0)],
        item_topping_options=[
            types.SimpleNamespace(
                option_name="Cheese", additional_price=0, linked_item="ITEM-CHEESE"
            )
        ],
        item_variant_options=[
            types.SimpleNamespace(
                option_name="Vanilla", additional_price=0, linked_item="ITEM-VANILLA"
            )
        ],
        item_sugar_options=[types.SimpleNamespace(option_name="Less", additional_price=0)],
        item_ice_options=[types.SimpleNamespace(option_name="No Ice", additional_price=0)],
    )
    items = load_items_with_doc(item_doc)
    result = items.get_item_options("ITEM-1")
    unload_items_module()

    assert result == {}


def test_get_item_options_ignores_flags_when_disabled():
    item_doc = types.SimpleNamespace(
        has_size_option=1,
        has_spice_option=0,
        has_topping_option=0,
        item_size_options=[types.SimpleNamespace(option_name="Large", additional_price=0)],
    )
    items = load_items_with_doc(item_doc)
    result = items.get_item_options("ITEM-1")
    unload_items_module()

    assert result == {}


def test_get_item_options_channel_parameter_is_ignored_when_disabled():
    item_doc = types.SimpleNamespace(
        has_size_option=1,
        has_spice_option=0,
        has_topping_option=1,
        item_size_options=[
            types.SimpleNamespace(option_name="POS Size", additional_price=0, menu_channel="POS"),
            types.SimpleNamespace(option_name="Shared Size", additional_price=1000, menu_channel="Universal"),
            types.SimpleNamespace(option_name="Restaurant Size", additional_price=0, menu_channel="Restaurant"),
        ],
        item_topping_options=[
            types.SimpleNamespace(option_name="POS Topping", additional_price=0, menu_channel="POS"),
            types.SimpleNamespace(option_name="Shared Topping", additional_price=0, menu_channel="Both"),
            types.SimpleNamespace(option_name="Restaurant Topping", additional_price=0, menu_channel="Restaurant"),
        ],
    )

    items = load_items_with_doc(item_doc)

    pos_options = items.get_item_options("ITEM-1", menu_channel="POS")
    restaurant_options = items.get_item_options("ITEM-1", menu_channel="Restaurant")
    universal_options = items.get_item_options("ITEM-1")

    unload_items_module()

    assert pos_options == {}
    assert restaurant_options == {}
    assert universal_options == {}


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

    assert doc.get("has_size_option") == 0
    assert doc.get("has_spice_option") == 0
    assert doc.get("has_topping_option") == 0
    assert doc.get("has_variant_option") == 0


def test_set_item_flags_beverage_category():
    items = load_items_with_doc(None)

    class DummyDoc:
        def __init__(self):
            self._data = {"menu_category": "Beverage"}

        def get(self, key):
            return self._data.get(key)

        def set(self, key, value):
            self._data[key] = value

    doc = DummyDoc()
    items.set_item_flags(doc)
    unload_items_module()

    assert doc.get("has_size_option") == 0
    assert doc.get("has_sugar_option") == 0
    assert doc.get("has_ice_option") == 0
    assert doc.get("has_variant_option") == 0


def test_set_item_flags_populates_kitchen_defaults():
    kitchen_routes = {"Allura": ("Main Kitchen", "Minuman")}
    items = load_items_with_doc(None, kitchen_routes=kitchen_routes)

    class DummyDoc:
        def __init__(self):
            self._data = {
                "menu_category": "Allura",
                "default_kitchen": None,
                "default_kitchen_station": None,
            }

        def get(self, key):
            return self._data.get(key)

        def set(self, key, value):
            self._data[key] = value

    doc = DummyDoc()
    items.set_item_flags(doc)
    unload_items_module()

    assert doc.get("default_kitchen") == "Main Kitchen"
    assert doc.get("default_kitchen_station") == "Minuman"


def test_set_item_flags_respects_manual_overrides():
    kitchen_routes = {"Allura": ("Main Kitchen", "Minuman")}
    items = load_items_with_doc(None, kitchen_routes=kitchen_routes)

    class DummyDoc:
        def __init__(self):
            self._data = {
                "menu_category": "Allura",
                "default_kitchen": "Manual Kitchen",
                "default_kitchen_station": "Manual Station",
            }

        def get(self, key):
            return self._data.get(key)

        def set(self, key, value):
            self._data[key] = value

    doc = DummyDoc()
    items.set_item_flags(doc)
    unload_items_module()

    assert doc.get("default_kitchen") == "Manual Kitchen"
    assert doc.get("default_kitchen_station") == "Manual Station"


def test_set_item_flags_keeps_template_variants():
    items = load_items_with_doc(None)

    class DummyDoc:
        def __init__(self):
            self._data = {
                "menu_category": "Special",
                "has_variants": 1,
                "variant_based_on": "Item Attribute",
                "variant_of": "",
            }

        def get(self, key):
            return self._data.get(key)

        def set(self, key, value):
            self._data[key] = value

    doc = DummyDoc()
    items.set_item_flags(doc)
    unload_items_module()

    assert doc.get("has_variants") == 1


