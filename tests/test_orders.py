import sys

import pytest

sys.path.insert(0, ".")
from imogi_pos.tests.test_orders import frappe_env
import imogi_pos.tests.test_orders as order_utils


def test_create_order_without_item_key_fails(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError, match="Item is required"):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", items={"rate": 10}
        )


def test_create_order_with_item_code_succeeds(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", items={"item_code": "SALES-ITEM", "rate": 10}
    )
    order_items = order_utils.orders[result["name"]].items
    assert len(order_items) == 1
    assert order_items[0].item == "SALES-ITEM"

