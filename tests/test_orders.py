import sys

import pytest

sys.path.insert(0, ".")
from imogi_pos.tests.test_orders import frappe_env


def test_create_order_without_item_key_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item is required"):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", items={"rate": 10}
        )


def test_create_order_with_nonexistent_item_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item UNKNOWN-ITEM not found"):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", items={"item": "UNKNOWN-ITEM"}
        )

