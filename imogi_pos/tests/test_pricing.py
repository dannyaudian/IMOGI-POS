import importlib
import json
import sys
import types

import pytest


@pytest.fixture
def pricing_env():
    promo_codes = {}
    items = {}

    frappe = types.ModuleType("frappe")

    class DB:
        def get_value(self, doctype, name, fieldname):
            if doctype == "Item":
                key = name
                if key in items:
                    record = items[key]
                else:
                    key = (name or "").upper()
                    record = items.get(key)
                if record:
                    return getattr(record, fieldname, None)
            return None

    def get_all(doctype, filters=None, fields=None, pluck=None):
        if doctype == "POS Promo Code":
            results = []
            for record in promo_codes.values():
                match = True
                if filters:
                    for key, expected in filters.items():
                        if record.get(key) != expected:
                            match = False
                            break
                if not match:
                    continue
                if fields:
                    payload = {field: record.get(field) for field in fields}
                    results.append(types.SimpleNamespace(**payload))
                else:
                    results.append(record.copy())
            return results

        if doctype == "POS Promo Category":
            results = []
            parent_filter = filters.get("parent") if filters else None
            parenttype_filter = filters.get("parenttype") if filters else None
            for record in promo_codes.values():
                parent_name = record.get("name")
                if parent_filter and parent_filter != parent_name:
                    continue
                if parenttype_filter and parenttype_filter != "POS Promo Code":
                    continue
                categories = record.get("categories") or record.get("applicable_categories") or []
                for idx, category in enumerate(categories):
                    entry = {
                        "name": f"{parent_name}-CAT-{idx}",
                        "menu_category": category,
                        "parent": parent_name,
                        "parenttype": "POS Promo Code",
                    }
                    results.append(entry)
            if pluck:
                return [row.get(pluck) for row in results if pluck in row]
            if fields:
                return [types.SimpleNamespace(**{field: row.get(field) for field in fields}) for row in results]
            return results

        if doctype == "POS Promo Item":
            results = []
            parent_filter = filters.get("parent") if filters else None
            parenttype_filter = filters.get("parenttype") if filters else None
            for record in promo_codes.values():
                parent_name = record.get("name")
                if parent_filter and parent_filter != parent_name:
                    continue
                if parenttype_filter and parenttype_filter != "POS Promo Code":
                    continue
                scoped_items = record.get("items") or record.get("applicable_items") or []
                for idx, item in enumerate(scoped_items):
                    entry = {
                        "name": f"{parent_name}-ITEM-{idx}",
                        "item": item,
                        "parent": parent_name,
                        "parenttype": "POS Promo Code",
                    }
                    results.append(entry)
            if pluck:
                return [row.get(pluck) for row in results if pluck in row]
            if fields:
                return [types.SimpleNamespace(**{field: row.get(field) for field in fields}) for row in results]
            return results

        return []

    def parse_json(value):
        return json.loads(value)

    def _(message):
        return message

    frappe.db = DB()
    frappe.get_all = get_all
    frappe.parse_json = parse_json
    frappe._ = _
    frappe.whitelist = lambda *a, **kw: (lambda fn: fn)
    frappe.ValidationError = Exception

    frappe.utils = types.ModuleType("frappe.utils")
    frappe.utils.flt = float
    frappe.utils.getdate = lambda value: value
    frappe.utils.now_datetime = lambda: None

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = frappe.utils

    pricing = importlib.import_module("imogi_pos.api.pricing")
    pricing = importlib.reload(pricing)

    yield pricing, promo_codes, items


def test_list_active_promo_codes_returns_ordered_display(pricing_env):
    pricing, promo_codes, _ = pricing_env

    promo_codes["SAVE10"] = {
        "name": "SAVE10",
        "code": "SAVE10",
        "discount_type": "Percent",
        "discount_value": 10,
        "enabled": 1,
    }

    promo_codes["MEAL50"] = {
        "name": "MEAL50",
        "code": "MEAL50",
        "discount_type": "Amount",
        "discount_value": 5000,
        "enabled": 1,
    }

    result = pricing.list_active_promo_codes()

    assert isinstance(result, list)
    assert [entry["code"] for entry in result] == ["MEAL50", "SAVE10"]

    first, second = result
    assert first["discount_type"] == "Amount"
    assert first["discount_value"] == pytest.approx(5000)
    assert "MEAL50" in first["label"]
    assert "discount" in first["description"].lower()

    assert second["discount_type"] == "Percent"
    assert second["discount_value"] == pytest.approx(10)
    assert "SAVE10" in second["label"]
    assert "%" in second["description"] or "percent" in second["description"].lower()


def test_scoped_promo_accepts_matching_category(pricing_env):
    pricing, promo_codes, items = pricing_env

    promo_codes["PROMO-CAFE"] = {
        "name": "PROMO-CAFE",
        "code": "PROMO-CAFE",
        "discount_type": "Percent",
        "discount_value": 10,
        "enabled": 1,
        "categories": ["Beverages"],
    }

    items["COFFEE-1"] = types.SimpleNamespace(menu_category="Beverages")

    result = pricing.evaluate_order_discounts(
        [{"item_code": "COFFEE-1", "qty": 2}], promo_code="PROMO-CAFE"
    )

    assert result["applied_promo_code"] == "PROMO-CAFE"
    assert result["discount_percent"] == pytest.approx(10)
    assert not result["errors"]


def test_scoped_promo_rejects_non_matching_category(pricing_env):
    pricing, promo_codes, items = pricing_env

    promo_codes["PROMO-CAFE"] = {
        "name": "PROMO-CAFE",
        "code": "PROMO-CAFE",
        "discount_type": "Percent",
        "discount_value": 10,
        "enabled": 1,
        "categories": ["Beverages"],
    }

    items["SANDWICH-1"] = types.SimpleNamespace(menu_category="Food")

    result = pricing.evaluate_order_discounts(
        [{"item_code": "SANDWICH-1", "qty": 1}], promo_code="PROMO-CAFE"
    )

    assert result["applied_promo_code"] is None
    assert result["discount_percent"] == 0
    assert result["discount_amount"] == 0
    assert result["errors"]
    assert (
        result["errors"][0]
        == "Promo code PROMO-CAFE only applies to menu categories: Beverages."
    )


def test_item_scoped_promo_requires_specific_item(pricing_env):
    pricing, promo_codes, items = pricing_env

    promo_codes["BURGER5"] = {
        "name": "BURGER5",
        "code": "BURGER5",
        "discount_type": "Amount",
        "discount_value": 5000,
        "enabled": 1,
        "items": ["BURGER-1"],
    }

    items["BURGER-1"] = types.SimpleNamespace(menu_category="Food")
    items["COFFEE-1"] = types.SimpleNamespace(menu_category="Beverages")

    valid = pricing.evaluate_order_discounts(
        [{"item_code": "BURGER-1", "qty": 1}], promo_code="BURGER5"
    )
    assert valid["applied_promo_code"] == "BURGER5"
    assert valid["discount_amount"] == pytest.approx(5000)
    assert not valid["errors"]

    invalid = pricing.evaluate_order_discounts(
        [{"item_code": "COFFEE-1", "qty": 1}], promo_code="BURGER5"
    )
    assert invalid["applied_promo_code"] is None
    assert invalid["discount_amount"] == 0
    assert invalid["errors"]
    assert (
        invalid["errors"][0]
        == "Promo code BURGER5 only applies to the following items: BURGER-1."
    )


def test_validate_promo_code_propagates_scope_error(pricing_env):
    pricing, promo_codes, items = pricing_env

    promo_codes["BURGER5"] = {
        "name": "BURGER5",
        "code": "BURGER5",
        "discount_type": "Amount",
        "discount_value": 5000,
        "enabled": 1,
        "items": ["BURGER-1"],
    }

    items["COFFEE-1"] = types.SimpleNamespace(menu_category="Beverages")

    result = pricing.validate_promo_code(
        items=[{"item_code": "COFFEE-1", "qty": 1}], promo_code="BURGER5"
    )

    assert not result["valid"]
    assert (
        result["error"]
        == "Promo code BURGER5 only applies to the following items: BURGER-1."
    )
    assert result["code"] == "BURGER5"
