import datetime
import pytest
import imogi_pos.tests.test_orders as order_utils
from imogi_pos.tests.test_orders import frappe_env


def test_queue_number_increments_and_resets(frappe_env, monkeypatch):
    frappe, orders_module = frappe_env

    first = orders_module.create_order("Kiosk", "BR-1", "P1")
    second = orders_module.create_order("POS", "BR-1", "P1")

    assert order_utils.orders[first["name"]].queue_number == 1
    assert order_utils.orders[second["name"]].queue_number == 2

    # Simulate next day by clearing previous orders and updating time
    order_utils.orders.clear()
    monkeypatch.setattr(
        frappe.utils,
        "now_datetime",
        lambda: datetime.datetime(2023, 1, 2, 0, 0, 1),
    )
    third = orders_module.create_order("POS", "BR-1", "P1")
    assert order_utils.orders[third["name"]].queue_number == 1
