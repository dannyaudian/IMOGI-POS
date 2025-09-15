import sys

import pytest
import types
import copy

sys.path.insert(0, ".")
import sys

import pytest
import types

sys.path.insert(0, ".")
from imogi_pos.tests.test_orders import frappe_env
import imogi_pos.tests.test_orders as order_utils


def test_create_order_without_item_key_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item is required"):
        try:
            orders_module.create_order(
                "Dine-in", "BR-1", "P1", table="T1", items={"rate": 10}
            )
        except NameError as err:
            pytest.fail(f"Unexpected NameError: {err}")


def test_validate_item_without_identifier_raises(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item is required"):
        orders_module.validate_item_is_sales_item(types.SimpleNamespace())


def test_create_order_with_nonexistent_item_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item UNKNOWN-ITEM not found"):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", items={"item": "UNKNOWN-ITEM"}
        )


def test_create_order_with_existing_customer(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", customer="CUST-1"
    )
    assert result["customer"] == "CUST-1"


def test_create_order_with_unknown_customer_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Customer MISSING not found"):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", customer="MISSING"
        )


def test_create_order_with_walkin_customer_missing(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", customer="Walk-in Customer"
    )
    assert result["customer"] is None


def test_create_dine_in_without_table_allowed(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order("Dine-in", "BR-1", "P1")
    assert result["table"] is None


def test_get_next_available_table_returns_smallest_available(frappe_env):
    frappe, orders_module = frappe_env
    order_utils.tables["1"] = types.SimpleNamespace(name="1", branch="BR-1", status="Available")
    order_utils.tables["2"] = types.SimpleNamespace(name="2", branch="BR-1", status="Occupied")
    order_utils.tables["3"] = types.SimpleNamespace(name="3", branch="BR-1", status="Available")
    result = orders_module.get_next_available_table("BR-1")
    assert result == "1"


def test_create_order_with_item_options(frappe_env):
    frappe, orders_module = frappe_env
    opts = {
        "size": {"name": "Large"},
        "spice": {"name": "Hot"},
        "toppings": [{"name": "Cheese"}],
        "sugar": {"name": "Less"},
        "ice": {"name": "No Ice"},
    }
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", items={"item": "SALES-ITEM", "item_options": opts}
    )
    order_doc = order_utils.orders[result["name"]]
    assert order_doc.items[0].item_options == opts


def test_concurrent_create_order_fails_gracefully(frappe_env, monkeypatch):
    frappe, orders_module = frappe_env
    # Prepare a stale table document as if fetched before the first call committed
    stale_table = copy.deepcopy(order_utils.tables["T1"])

    # First call occupies the table
    orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")

    original_get_doc = frappe.get_doc

    def stale_get_doc(doctype, name):
        if doctype == "Restaurant Table" and name == "T1":
            return stale_table
        return original_get_doc(doctype, name)

    monkeypatch.setattr(frappe, "get_doc", stale_get_doc)
    monkeypatch.setattr(stale_table, "reload", lambda: None)

    def fail_set_status(status, pos_order=None):
        raise frappe.exceptions.TimestampMismatchError("conflict")

    monkeypatch.setattr(stale_table, "set_status", fail_set_status)

    with pytest.raises(frappe.ValidationError, match="Table already occupied"):
        orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")

    monkeypatch.setattr(frappe, "get_doc", original_get_doc)


def test_create_order_stores_item_options(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "item_options": {"size": "Large", "sugar": "Less", "ice": "No Ice"}},
    )
    created_order = order_utils.orders[result["name"]]
    assert created_order.items[0].item_options == {"size": "Large", "sugar": "Less", "ice": "No Ice"}


