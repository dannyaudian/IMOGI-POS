import types

from imogi_pos.tests.test_orders import frappe_env
import imogi_pos.tests.test_orders as order_utils


def test_add_item_to_order_uses_price_list_fallback_when_rate_missing(frappe_env):
    frappe, orders_module = frappe_env

    order_utils.item_prices[:] = []
    order_utils.items["SALES-ITEM"].standard_rate = 0

    order_utils.item_prices.append(
        types.SimpleNamespace(
            item_code="SALES-ITEM",
            price_list="Standard",
            price_list_rate=18500,
            currency="IDR",
        )
    )

    order_info = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        selling_price_list="Channel",
    )

    order_doc = order_utils.orders[order_info["name"]]
    order_doc.base_price_list = "Standard"
    order_doc.imogi_base_price_list = "Standard"

    response = orders_module.add_item_to_order(
        order_info["name"],
        {"item": "SALES-ITEM"},
    )

    assert response["item"]["rate"] == 18500
    assert order_utils.orders[order_info["name"]].items[-1].rate == 18500
