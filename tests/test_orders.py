import sys

import pytest
import types

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


