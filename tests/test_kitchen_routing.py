import datetime
import importlib
import sys
import types

import pytest

# Ensure package root is on path
sys.path.insert(0, ".")


class ItemRow(types.SimpleNamespace):
    def get(self, key, default=None):
        return getattr(self, key, default)


@pytest.fixture
def kitchen_routing_env():
    # Ensure a clean module state
    for module in [
        'frappe',
        'frappe.utils',
        'frappe.model',
        'frappe.model.document',
        'imogi_pos',
        'imogi_pos.utils.restaurant_settings',
        'imogi_pos.utils.kitchen_routing',
        'imogi_pos.imogi_pos.doctype.pos_order_item.pos_order_item',
        'imogi_pos.kitchen.kot_service',
    ]:
        sys.modules.pop(module, None)

    frappe = types.ModuleType("frappe")
    frappe._ = lambda value: value
    frappe.session = types.SimpleNamespace(user="test-user")

    class Cache:
        def __init__(self):
            self._store = {}

        def get_value(self, key):
            return self._store.get(key)

        def set_value(self, key, value):
            self._store[key] = value

    cache = Cache()
    frappe.cache = lambda: cache

    item_records = {
        "ITEM-001": {
            "menu_category": "Main Course",
            "default_kitchen": None,
            "default_kitchen_station": None,
        }
    }

    class DB:
        def get_value(self, doctype, name=None, fieldname=None, as_dict=False):
            if doctype == "Item":
                record = item_records.get(name, {})
                if isinstance(fieldname, (list, tuple)):
                    data = {field: record.get(field) for field in fieldname}
                    if as_dict:
                        return types.SimpleNamespace(**data)
                    return [data.get(field) for field in fieldname]
                return record.get(fieldname)
            return None

        def get_single_value(self, doctype, fieldname):
            if doctype == "Restaurant Settings" and fieldname == "default_kitchen_station":
                return "DEFAULT-STATION"
            return None

    frappe.db = DB()

    kitchens = {
        "Hot Kitchen": types.SimpleNamespace(default_station="KITCHEN-DEFAULT")
    }

    def get_doc(doctype, name=None):
        if doctype == "Kitchen":
            return kitchens.get(name)
        raise Exception(f"Unexpected get_doc call for {doctype}")

    frappe.get_doc = get_doc

    routes = [
        types.SimpleNamespace(
            menu_category="Main Course",
            kitchen="Hot Kitchen",
            kitchen_station="Pass Station",
        )
    ]

    def get_single(doctype):
        if doctype == "Restaurant Settings":
            return types.SimpleNamespace(menu_category_routes=routes)
        raise Exception(f"Unexpected get_single call for {doctype}")

    frappe.get_single = get_single

    frappe.utils = types.SimpleNamespace(
        cstr=lambda value: "" if value is None else str(value),
        cint=int,
        now_datetime=lambda: datetime.datetime(2023, 1, 1, 0, 0, 0),
    )

    model = types.ModuleType("frappe.model")
    document = types.ModuleType("frappe.model.document")

    class Document:
        pass

    document.Document = Document
    model.document = document

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = frappe.utils
    sys.modules['frappe.model'] = model
    sys.modules['frappe.model.document'] = document

    import imogi_pos.utils.restaurant_settings as restaurant_settings
    importlib.reload(restaurant_settings)
    import imogi_pos.utils.kitchen_routing as kitchen_routing
    importlib.reload(kitchen_routing)

    yield types.SimpleNamespace(
        frappe=frappe,
        kitchen_routes=routes,
        item_records=item_records,
    )

    for module in [
        'imogi_pos.utils.kitchen_routing',
        'imogi_pos.utils.restaurant_settings',
        'imogi_pos.imogi_pos.doctype.pos_order_item.pos_order_item',
        'imogi_pos.kitchen.kot_service',
        'imogi_pos',
        'frappe',
        'frappe.utils',
        'frappe.model',
        'frappe.model.document',
    ]:
        sys.modules.pop(module, None)


def test_pos_order_item_uses_menu_category_mapping(kitchen_routing_env):
    module = importlib.import_module(
        "imogi_pos.imogi_pos.doctype.pos_order_item.pos_order_item"
    )
    importlib.reload(module)

    item = module.POSOrderItem()
    item.item = "ITEM-001"
    item.kitchen = None
    item.kitchen_station = None

    item.set_default_kitchen_station()

    assert item.kitchen == "Hot Kitchen"
    assert item.kitchen_station == "Pass Station"


def test_kot_service_groups_items_by_mapped_station(kitchen_routing_env):
    module = importlib.import_module("imogi_pos.kitchen.kot_service")
    importlib.reload(module)

    service = module.KOTService()
    pos_item = ItemRow(item="ITEM-001", name="POS-ITEM-1", kitchen=None, kitchen_station=None)

    grouped = service._group_items_by_station([pos_item])

    assert "Pass Station" in grouped
    assert pos_item in grouped["Pass Station"]
    assert pos_item.kitchen == "Hot Kitchen"
    assert pos_item.kitchen_station == "Pass Station"
