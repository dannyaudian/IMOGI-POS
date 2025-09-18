import importlib
import sys
import types


class DictNamespace(dict):
    """Dictionary that also exposes keys as attributes."""

    def __getattr__(self, item):
        try:
            return self[item]
        except KeyError as exc:
            raise AttributeError(item) from exc

    def __setattr__(self, key, value):
        self[key] = value


def _normalize_fieldname(fieldname):
    if isinstance(fieldname, (list, tuple)):
        return tuple(fieldname)
    return fieldname


def load_variants_module(get_all_handlers=None, get_value_map=None, exists_handler=None):
    sys.path.insert(0, ".")

    frappe = types.ModuleType("frappe")

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn

        return inner

    frappe.whitelist = whitelist
    frappe._ = lambda x: x

    def throw(message, exc=None):
        raise Exception(message)

    frappe.throw = throw
    frappe.has_permission = lambda *args, **kwargs: True

    class DummyDB:
        def __init__(self, value_map=None, exists=None):
            self.value_map = value_map or {}
            self.exists_handler = exists

        def get_value(self, doctype, name=None, fieldname=None, as_dict=False):
            key = (doctype, name, _normalize_fieldname(fieldname))
            value = self.value_map.get(key)
            if callable(value):
                return value(doctype, name, fieldname, as_dict=as_dict)
            return value

        def exists(self, doctype, name=None):
            if self.exists_handler:
                return self.exists_handler(doctype, name)
            return False

    frappe.db = DummyDB(value_map=get_value_map, exists=exists_handler)

    def default_get_all(doctype, filters=None, fields=None, limit_page_length=None):
        handler = (get_all_handlers or {}).get(doctype)
        if callable(handler):
            return handler(filters or {}, fields or [], limit_page_length)
        return handler or []

    frappe.get_all = lambda doctype, **kwargs: default_get_all(
        doctype,
        kwargs.get("filters"),
        kwargs.get("fields"),
        kwargs.get("limit_page_length"),
    )

    sys.modules["frappe"] = frappe

    utils = types.ModuleType("frappe.utils")
    utils.cint = lambda x: int(x)
    utils.flt = lambda x: float(x or 0)
    sys.modules["frappe.utils"] = utils

    variants = importlib.import_module("imogi_pos.api.variants")
    importlib.reload(variants)
    return variants


def unload_variants_module():
    sys.modules.pop("imogi_pos.api.variants", None)
    sys.modules.pop("frappe.utils", None)
    sys.modules.pop("frappe", None)
    if sys.path and sys.path[0] == ".":
        sys.path.pop(0)


def test_get_items_with_stock_falls_back_to_base_price_list():
    item_rows = [
        DictNamespace(
            name="ITEM-001",
            item_name="Sample Item",
            item_code="ITEM-001",
            description=None,
            image=None,
            standard_rate=0,
            has_variants=0,
            variant_of=None,
            item_group="Beverages",
            menu_category=None,
            photo=None,
            default_kitchen=None,
            default_kitchen_station=None,
            pos_menu_profile=None,
        )
    ]

    get_all_handlers = {
        "Item": lambda *_: item_rows,
        "Item Group": lambda *_: [],
        "Bin": lambda *_: [],
        "Item Price": lambda filters, *_: [
            DictNamespace(item_code="ITEM-001", price_list_rate=15000, currency="IDR")
        ]
        if filters.get("price_list") == "Standard"
        else [],
    }

    get_value_map = {
        ("Price List", "Channel", ("currency", "imogi_price_adjustment")): {
            "currency": "IDR",
            "imogi_price_adjustment": 500,
        }
    }

    variants = load_variants_module(
        get_all_handlers=get_all_handlers,
        get_value_map=get_value_map,
        exists_handler=lambda *_: False,
    )

    try:
        items = variants.get_items_with_stock(
            price_list="Channel",
            base_price_list="Standard",
        )
    finally:
        unload_variants_module()

    assert len(items) == 1
    item = items[0]
    assert item.imogi_base_standard_rate == 15000
    assert item.has_explicit_price_list_rate == 0
    # Adjustment of 500 should apply on top of the base list rate
    assert item.standard_rate == 15500
    assert item.imogi_price_adjustment_applied == 1


def test_get_item_variants_flags_base_rate_from_price_list():
    variant_rows = [
        DictNamespace(
            name="ITEM-RED",
            item_name="Red Variant",
            image=None,
            item_code="ITEM-RED",
            description=None,
            standard_rate=0,
            stock_uom="Nos",
        ),
        DictNamespace(
            name="ITEM-BLUE",
            item_name="Blue Variant",
            image=None,
            item_code="ITEM-BLUE",
            description=None,
            standard_rate=0,
            stock_uom="Nos",
        ),
    ]

    def item_price_handler(filters, *_):
        price_list = filters.get("price_list")
        if price_list == "Standard":
            return [
                DictNamespace(item_code="ITEM-RED", price_list_rate=12000, currency="IDR"),
                DictNamespace(item_code="ITEM-BLUE", price_list_rate=14000, currency="IDR"),
            ]
        if price_list == "Channel":
            return [
                DictNamespace(item_code="ITEM-BLUE", price_list_rate=9000, currency="IDR"),
            ]
        return []

    def variant_attribute_handler(filters, *_):
        parent = filters.get("parent")
        if parent == "ITEM-RED":
            return [DictNamespace(attribute="Color", attribute_value="Red")]
        if parent == "ITEM-BLUE":
            return [DictNamespace(attribute="Color", attribute_value="Blue")]
        return []

    get_all_handlers = {
        "Item": lambda *_: variant_rows,
        "Item Variant Attribute": variant_attribute_handler,
        "Item Price": item_price_handler,
    }

    get_value_map = {
        ("Item", "TEMPLATE-ITEM", "has_variants"): 1,
        (
            "Item",
            "ITEM-RED",
            ("menu_category", "default_kitchen", "default_kitchen_station"),
        ): {"menu_category": None, "default_kitchen": None, "default_kitchen_station": None},
        (
            "Item",
            "ITEM-BLUE",
            ("menu_category", "default_kitchen", "default_kitchen_station"),
        ): {"menu_category": None, "default_kitchen": None, "default_kitchen_station": None},
    }

    variants = load_variants_module(
        get_all_handlers=get_all_handlers,
        get_value_map=get_value_map,
        exists_handler=lambda *_: False,
    )

    variants.get_variant_picker_config = lambda *_: {"attributes": []}

    try:
        response = variants.get_item_variants(
            "TEMPLATE-ITEM",
            price_list="Channel",
            base_price_list="Standard",
        )
    finally:
        unload_variants_module()

    variant_list = response["variants"]
    assert len(variant_list) == 2

    red = next(v for v in variant_list if v["name"] == "ITEM-RED")
    blue = next(v for v in variant_list if v["name"] == "ITEM-BLUE")

    assert red["imogi_base_standard_rate"] == 12000
    assert red["has_explicit_price_list_rate"] == 0
    assert red["standard_rate"] == 12000

    assert blue["imogi_base_standard_rate"] == 9000
    assert blue["has_explicit_price_list_rate"] == 1
    assert blue["standard_rate"] == 9000
