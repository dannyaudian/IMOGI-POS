import importlib
import sys
import types
import datetime

import pytest


class Row(dict):
    def __getattr__(self, item):
        try:
            return self[item]
        except KeyError as exc:
            raise AttributeError(item) from exc


@pytest.fixture
def frappe_env():
    sys.path.insert(0, ".")

    frappe = types.ModuleType("frappe")
    utils = types.ModuleType("frappe.utils")

    utils.flt = lambda value, *_, **__: float(value or 0)
    utils.cint = lambda value, *_, **__: int(value or 0)
    utils.getdate = lambda value, *_, **__: value
    utils.now_datetime = lambda *_, **__: datetime.datetime(2023, 1, 1, 12, 0, 0)

    frappe.utils = utils
    frappe._ = lambda msg: msg
    frappe.defaults = types.SimpleNamespace(get_global_default=lambda *_: None)

    class ValidationError(Exception):
        pass

    frappe.ValidationError = ValidationError

    def whitelist(**kwargs):
        def decorator(fn):
            return fn

        return decorator

    frappe.whitelist = whitelist

    def throw(message, exc):
        raise exc(message)

    frappe.throw = throw

    frappe.db = types.SimpleNamespace(
        has_column=lambda *_: True,
        get_value=lambda *_: None,
        exists=lambda *_: False,
    )

    frappe.get_doc = lambda *_, **__: None
    frappe.get_all = lambda *_, **__: []

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    yield frappe

    for module in [
        "imogi_pos.api.pricing",
        "imogi_pos.api.variants",
        "frappe",
        "frappe.utils"
    ]:
        sys.modules.pop(module, None)

    sys.path.remove(".")


@pytest.fixture
def pricing_module(frappe_env):
    module = importlib.import_module("imogi_pos.api.pricing")
    importlib.reload(module)
    return module


@pytest.fixture
def variants_module(frappe_env):
    module = importlib.import_module("imogi_pos.api.variants")
    importlib.reload(module)
    return module


def _profile(price_list_name):
    profile = types.SimpleNamespace()
    profile.selling_price_list = price_list_name
    profile.meta = types.SimpleNamespace(get_table_fields=lambda: [])
    return profile


def test_get_allowed_price_lists_includes_adjustment_when_column_exists(pricing_module, frappe_env):
    profile = _profile("Retail")

    frappe_env.get_doc = lambda *_, **__: profile

    def get_all(doctype, *_, **kwargs):
        if doctype == "Price List":
            fields = kwargs.get("fields") or []
            assert "imogi_price_adjustment" in fields
            return [
                Row(
                    name="Retail",
                    price_list_name="Retail",
                    currency="USD",
                    enabled=1,
                    imogi_price_adjustment=2.5,
                )
            ]
        return []

    frappe_env.get_all = get_all
    frappe_env.db.has_column = lambda *_: True

    result = pricing_module.get_allowed_price_lists("POS-TEST")

    assert result["default_price_list"] == "Retail"
    assert result["price_lists"][0]["adjustment"] == pytest.approx(2.5)


def test_get_allowed_price_lists_ignores_adjustment_when_column_missing(pricing_module, frappe_env):
    profile = _profile("Retail")

    frappe_env.get_doc = lambda *_, **__: profile

    captured_fields = {}

    def get_all(doctype, *_, **kwargs):
        if doctype == "Price List":
            captured_fields["fields"] = list(kwargs.get("fields") or [])
            assert "imogi_price_adjustment" not in captured_fields["fields"]
            return [
                Row(
                    name="Retail",
                    price_list_name="Retail",
                    currency="USD",
                    enabled=1,
                )
            ]
        return []

    frappe_env.get_all = get_all
    frappe_env.db.has_column = lambda *_: False

    result = pricing_module.get_allowed_price_lists("POS-TEST")

    assert result["price_lists"][0]["adjustment"] == 0
    assert captured_fields["fields"] == ["name", "price_list_name", "currency", "enabled"]


def test_get_allowed_price_lists_includes_table_multiselect_links(pricing_module, frappe_env):
    table_field = types.SimpleNamespace(fieldname="linked_price_lists", options="Price List")
    row = Row(link_doctype="Price List", link_name="GoFood", link_title="Go Food")

    profile = types.SimpleNamespace(
        selling_price_list="Retail",
        linked_price_lists=[row],
        meta=types.SimpleNamespace(get_table_fields=lambda: [table_field]),
    )

    frappe_env.get_doc = lambda *_, **__: profile

    def get_all(doctype, *_, **kwargs):
        if doctype == "Price List":
            return [
                Row(
                    name="Retail",
                    price_list_name="Retail",
                    currency="USD",
                    enabled=1,
                    imogi_price_adjustment=0,
                ),
                Row(
                    name="GoFood",
                    price_list_name="Go Food",
                    currency="IDR",
                    enabled=1,
                    imogi_price_adjustment=3.25,
                )
            ]
        return []

    frappe_env.get_all = get_all
    frappe_env.db.has_column = lambda *_: True

    result = pricing_module.get_allowed_price_lists("POS-TEST")

    assert result["default_price_list"] == "Retail"
    assert {entry["name"] for entry in result["price_lists"]} == {"Retail", "GoFood"}

    gofood_entry = next(entry for entry in result["price_lists"] if entry["name"] == "GoFood")
    assert gofood_entry["label"] == "Go Food"
    assert gofood_entry["adjustment"] == pytest.approx(3.25)


def _base_item():
    return Row(
        name="ITEM-1",
        item_name="Item 1",
        item_code="ITEM-1",
        description=None,
        image=None,
        standard_rate=10,
        has_variants=0,
        variant_of=None,
        item_group="Group",
        menu_category="Default",
        photo=None,
        default_kitchen=None,
        default_kitchen_station=None
    )


def test_get_items_with_stock_applies_adjustment_when_column_exists(variants_module, frappe_env):
    frappe_env.db.has_column = lambda *_: True

    def get_all(doctype, *_, **kwargs):
        if doctype == "Item":
            return [_base_item()]
        if doctype == "Item Group":
            return [Row(name="Group", default_)]
        if doctype == "Item Price":
            return []
        return []

    frappe_env.get_all = get_all

    def get_value(doctype, name, fields, as_dict=False):
        assert fields == ["currency", "imogi_price_adjustment"]
        return {"currency": "USD", "imogi_price_adjustment": 1.5}

    frappe_env.db.get_value = get_value

    items = variants_module.get_items_with_stock(price_list="Retail")

    assert items[0]["standard_rate"] == pytest.approx(11.5)
    assert items[0]["imogi_price_adjustment_amount"] == pytest.approx(1.5)
    assert items[0]["imogi_price_adjustment_applied"] == 1
    assert items[0]["currency"] == "USD"


def test_get_items_with_stock_skips_adjustment_when_column_missing(variants_module, frappe_env):
    frappe_env.db.has_column = lambda *_: False

    def get_all(doctype, *_, **kwargs):
        if doctype == "Item":
            return [_base_item()]
        if doctype == "Item Group":
            return [Row(name="Group", default_)]
        if doctype == "Item Price":
            return []
        return []

    frappe_env.get_all = get_all

    def get_value(doctype, name, fields, as_dict=False):
        assert fields == ["currency"]
        return {"currency": "USD"}

    frappe_env.db.get_value = get_value

    items = variants_module.get_items_with_stock(price_list="Retail")

    assert items[0]["standard_rate"] == pytest.approx(10)
    assert items[0]["imogi_price_adjustment_amount"] == 0
    assert items[0]["imogi_price_adjustment_applied"] == 0
    assert items[0]["currency"] == "USD"
