import sys

import pytest
import types
import copy
import importlib

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


def test_add_item_to_order_uses_linked_variant_sku(frappe_env, monkeypatch):
    frappe, orders_module = frappe_env

    template_code = "TEMPLATE-ITEM"
    variant_code = "TEMPLATE-ITEM-V1"

    order_utils.items[template_code] = types.SimpleNamespace(
        is_sales_item=1,
        has_variants=1,
        standard_rate=10500,
        item_name="Template Item",
    )
    order_utils.items[variant_code] = types.SimpleNamespace(
        is_sales_item=1,
        has_variants=0,
        standard_rate=12500,
        item_name="Template Item - Large",
    )

    order_info = orders_module.create_order("Dine-in", "BR-1", "P1")

    variant_options = {
        "variant": {
            "name": "Large",
            "value": "Large",
            "linked_item": variant_code,
        }
    }

    response = orders_module.add_item_to_order(
        order_info["name"],
        {"item": template_code, "item_options": variant_options},
    )

    order_doc = order_utils.orders[order_info["name"]]
    added_row = order_doc.items[-1]

    assert added_row.item == variant_code
    assert response["item"]["item"] == variant_code
    assert added_row.rate == order_utils.items[variant_code].standard_rate

    frappe.utils.cint = int
    frappe.utils.add_to_date = lambda dt, **kw: dt
    frappe.utils.get_url = lambda path=None: path or ""
    frappe.utils.nowdate = lambda: "2023-01-01"
    frappe.realtime = types.SimpleNamespace(publish_realtime=lambda *a, **k: None)
    sys.modules['frappe.realtime'] = frappe.realtime

    import imogi_pos.api.billing as billing

    importlib.reload(billing)

    class ProfileDoc:
        imogi_mode = "Counter"
        imogi_allow_non_sales_items = 0
        selling_price_list = "Standard"
        warehouse = None

        def get(self, field, default=None):
            return getattr(self, field, default)

    profile_doc = ProfileDoc()

    class InvoiceDoc:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)
            if not hasattr(self, "items"):
                self.items = []
            if not hasattr(self, "payments"):
                self.payments = []

        def append(self, field, value):
            getattr(self, field).append(value)

        def insert(self, ignore_permissions=True):
            self.name = "SINV-1"
            return self

        def submit(self):
            self.submitted = True

        def as_dict(self):
            return self.__dict__

        def get(self, field, default=None):
            return getattr(self, field, default)

        def set_missing_values(self):
            if not hasattr(self, "items"):
                self.items = []
            if not hasattr(self, "payments"):
                self.payments = []

        def calculate_taxes_and_totals(self):
            self.grand_total = sum(
                (item.get("amount", 0) if isinstance(item, dict) else getattr(item, "amount", 0))
                for item in getattr(self, "items", [])
            )

    original_get_doc = frappe.get_doc

    def custom_get_doc(doctype, name=None):
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        if doctype == "POS Profile":
            return profile_doc
        return original_get_doc(doctype, name)

    monkeypatch.setattr(frappe, "get_doc", custom_get_doc)
    monkeypatch.setattr(
        frappe,
        "get_cached_doc",
        lambda doctype, name: types.SimpleNamespace(
            item_size_options=[],
            item_spice_options=[],
            item_topping_options=[],
            item_variant_options=[],
            item_sugar_options=[],
            item_ice_options=[],
        ),
        raising=False,
    )

    amount = sum((getattr(row, "amount", 0) or 0) for row in order_doc.items)
    invoice = billing.generate_invoice(order_info["name"], mode_of_payment="Cash", amount=amount)

    assert invoice["items"][0]["item_code"] == variant_code
    assert invoice["items"][0]["pos_customizations"]["variant"] == ["Large"]

    order_utils.items.pop(template_code, None)
    order_utils.items.pop(variant_code, None)


