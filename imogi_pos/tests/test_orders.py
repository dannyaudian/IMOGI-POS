import sys
import types
import json
import datetime
import importlib
import pytest

@pytest.fixture
def frappe_env(monkeypatch):
    class StubTable:
        def __init__(self, name, branch, status="Available", current_pos_order=None, floor="F1"):
            self.doctype = "Restaurant Table"
            self.name = name
            self.branch = branch
            self.status = status
            self.current_pos_order = current_pos_order
            self.floor = floor
        def save(self):
            tables[self.name] = self
        def reload(self):
            current = tables[self.name]
            self.status = current.status
            self.current_pos_order = current.current_pos_order
        def set_status(self, status, pos_order=None):
            current = tables[self.name]
            if self.status != current.status:
                raise frappe.exceptions.TimestampMismatchError("conflict")
            self.status = status
            self.current_pos_order = pos_order
            self.save()
            return {"status": self.status, "current_pos_order": self.current_pos_order}

        def ensure_available_for_new_order(self):
            if not self.current_pos_order:
                return
            state = orders[self.current_pos_order].workflow_state
            if state in ("Closed", "Cancelled", "Returned"):
                self.set_status("Available")
            else:
                frappe.throw(
                    f"POS Order {self.current_pos_order} is still {state}",
                    frappe.ValidationError,
                )

    class StubOrder:
        def __init__(self, name):
            self.doctype = "POS Order"
            self.name = name
            self.items = []
            self.workflow_state = "Draft"
            self.creation = None
        def update(self, data):
            for k, v in data.items():
                setattr(self, k, v)
        def insert(self):
            self.creation = frappe.utils.now_datetime()
            orders[self.name] = self
            return self
        def save(self):
            orders[self.name] = self
        def db_set(self, fieldname, value, update_modified=False):
            setattr(self, fieldname, value)
        def append(self, field, value):
            if isinstance(value, dict):
                value = types.SimpleNamespace(**value)
            if not hasattr(value, "as_dict"):
                value.as_dict = lambda ns=value: ns.__dict__.copy()
            getattr(self, field).append(value)
            return value
        def as_dict(self):
            return {
                "name": self.name,
                "order_type": self.order_type,
                "branch": self.branch,
                "pos_profile": self.pos_profile,
                "table": self.table,
                "workflow_state": self.workflow_state,
                "floor": getattr(self, "floor", None),
                "customer": getattr(self, "customer", None),
                "customer_full_name": getattr(self, "customer_full_name", None),
                "customer_gender": getattr(self, "customer_gender", None),
                "customer_phone": getattr(self, "customer_phone", None),
                "customer_age": getattr(self, "customer_age", None),
                "customer_identification": getattr(
                    self, "customer_identification", None
                ),
                "discount_amount": getattr(self, "discount_amount", 0),
                "discount_percent": getattr(self, "discount_percent", 0),
                "promo_code": getattr(self, "promo_code", None),
                "queue_number": getattr(self, "queue_number", None),
            }

    class DB:
        def get_value(self, doctype, name, field):
            if doctype == "POS Profile":
                return getattr(pos_profiles[name], field)
            if doctype == "Restaurant Table":
                return getattr(tables[name], field)
            if doctype == "POS Order":
                return getattr(orders[name], field)
            if doctype == "Item":
                return getattr(items[name], field)
            return None
        def set_value(self, doctype, name, field, value):
            setattr(orders[name], field, value)
        def exists(self, doctype, name):
            if doctype == "Item":
                return name in items
            if doctype == "Customer":
                return name in customers
            return False

        def sql(self, query, params=None, as_dict=False):
            if "MAX(queue_number)" in query:
                branch = params[0] if isinstance(params, (list, tuple)) else params
                today = frappe.utils.now_datetime().date()
                max_no = 0
                for order in orders.values():
                    if (
                        order.branch == branch
                        and order.creation
                        and order.creation.date() == today
                        and getattr(order, "queue_number", None) is not None
                    ):
                        max_no = max(max_no, order.queue_number)
                return [{"max_number": max_no}] if as_dict else max_no
            return []

    def new_doc(doctype):
        if doctype == "POS Order":
            name = f"POS-ORD-{len(orders)+1}"
            return StubOrder(name)
        raise Exception("Unsupported doctype")

    def get_doc(doctype, name):
        if doctype == "POS Order":
            return orders[name]
        if doctype == "Restaurant Table":
            return tables[name]
        return None

    def has_permission(doctype, doc=None):
        return True

    def throw(msg, exc=None):
        raise (exc or Exception)(msg)

    def parse_json(val):
        return json.loads(val)

    frappe = types.ModuleType("frappe")
    frappe.db = DB()
    frappe.new_doc = new_doc
    frappe.get_doc = get_doc
    def get_all(doctype, filters=None, fields=None, pluck=None):
        if doctype == "Restaurant Table":
            results = []
            for t in tables.values():
                match = True
                if filters:
                    for key, val in filters.items():
                        if getattr(t, key) != val:
                            match = False
                            break
                if match:
                    results.append({"name": t.name})
            if pluck:
                return [r[pluck] for r in results]
            return results
        if doctype == "POS Promo Code":
            results = []
            for record in promo_codes.values():
                match = True
                if filters:
                    for key, val in filters.items():
                        if record.get(key) != val:
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
        if doctype == "Item Price":
            results = []
            for record in item_prices:
                match = True
                if filters:
                    for key, expected in filters.items():
                        value = getattr(record, key, None)
                        if isinstance(expected, (list, tuple)):
                            operator = expected[0]
                            values = expected[1] if len(expected) > 1 else []
                            if operator == "in":
                                if value not in values:
                                    match = False
                                    break
                            else:
                                match = False
                                break
                        elif value != expected:
                            match = False
                            break
                if not match:
                    continue

                if fields:
                    payload = {field: getattr(record, field, None) for field in fields}
                    results.append(types.SimpleNamespace(**payload))
                else:
                    results.append(record)
            return results
        return []
    frappe.get_all = get_all
    frappe.has_permission = has_permission
    frappe.throw = throw
    frappe.ValidationError = Exception
    frappe.PermissionError = Exception
    frappe.exceptions = types.ModuleType("exceptions")
    class TimestampMismatchError(Exception):
        pass
    frappe.exceptions.TimestampMismatchError = TimestampMismatchError
    frappe.parse_json = parse_json
    frappe._ = lambda x: x
    frappe.whitelist = lambda *a, **kw: (lambda f: f)
    frappe.utils = types.ModuleType("utils")
    frappe.utils.now_datetime = lambda: datetime.datetime(2023,1,1,12,0,0)
    frappe.utils.getdate = lambda value: value
    frappe.utils.flt = float
    frappe.utils.cstr = lambda value: "" if value is None else str(value)
    frappe.utils.cint = lambda value: 0 if value in (None, "") else int(value)
    frappe.call_hook = lambda method, **kwargs: None
    frappe.get_hooks = lambda *a, **kw: []
    frappe.log_error = lambda *a, **kw: None

    user_roles = {"test-user": ["System Manager"], "Guest": []}

    frappe.local = types.SimpleNamespace(flags={})
    frappe.session = types.SimpleNamespace(user="test-user")

    def get_roles(user=None):
        return user_roles.get(user or frappe.session.user, [])

    frappe.get_roles = get_roles
    frappe._user_roles = user_roles

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = frappe.utils
    sys.modules['frappe.exceptions'] = frappe.exceptions
    global orders, tables, pos_profiles, items, customers, promo_codes, item_prices
    orders = {}
    tables = {
        "T1": StubTable("T1", "BR-1"),
        "T2": StubTable("T2", "BR-1")
    }
    pos_profiles = {
        "P1": types.SimpleNamespace(
            imogi_pos_domain="Restaurant",
            imogi_branch="BR-1",
            update_stock=1,
            selling_price_list="Standard",
        )
    }
    items = {
        "SALES-ITEM": types.SimpleNamespace(is_sales_item=1),
        "NON-SALES-ITEM": types.SimpleNamespace(is_sales_item=0),
    }
    customers = {"CUST-1": object()}
    promo_codes = {}
    item_prices = []

    import imogi_pos.api.orders as orders_module
    importlib.reload(orders_module)
    return frappe, orders_module

def test_create_order_assigns_table(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    assert result["table"] == "T1"
    assert tables["T1"].status == "Occupied"
    assert tables["T1"].current_pos_order == result["name"]

def test_create_order_stores_items(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", items={"item": "SALES-ITEM", "rate": 10}
    )
    assert len(orders[result["name"]].items) == 1
    assert orders[result["name"]].items[0].item == "SALES-ITEM"
    assert orders[result["name"]].items[0].rate == 10

def test_switch_table_moves_order(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    orders_module.switch_table(result["name"], "T1", "T2")
    assert orders[result["name"]].table == "T2"
    assert tables["T1"].status == "Available"
    assert tables["T2"].current_pos_order == result["name"]

def test_merge_tables_moves_items(frappe_env):
    frappe, orders_module = frappe_env
    order1 = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    order2 = orders_module.create_order("Dine-in", "BR-1", "P1", table="T2")
    orders[order1["name"]].items = [types.SimpleNamespace(item="A")]
    orders[order2["name"]].items = [types.SimpleNamespace(item="B")]
    orders_module.merge_tables("T1", ["T2"])
    assert len(orders[order1["name"]].items) == 2
    assert tables["T2"].status == "Available"
    assert orders[order2["name"]].workflow_state == "Merged"

def test_create_order_requires_update_stock(frappe_env):
    frappe, orders_module = frappe_env
    pos_profiles["P2"] = types.SimpleNamespace(imogi_pos_domain="Restaurant", imogi_branch="BR-1", update_stock=0)
    with pytest.raises(frappe.ValidationError):
        orders_module.create_order("Dine-in", "BR-1", "P2", table="T1")

def test_after_create_order_hook_called(frappe_env):
    frappe, orders_module = frappe_env
    calls = []
    def hook(method, **kwargs):
        calls.append((method, kwargs))
    frappe.call_hook = hook
    orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    assert calls and calls[0][0] == "after_create_order"
    assert "order" in calls[0][1]

def test_non_sales_items_rejected(frappe_env):
    frappe, orders_module = frappe_env
    with pytest.raises(frappe.ValidationError):
        orders_module.create_order(
            "Dine-in", "BR-1", "P1", table="T1", items={"item": "NON-SALES-ITEM"}
        )

def test_create_order_records_customer(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order(
        "Dine-in", "BR-1", "P1", table="T1", customer="CUST-1"
    )
    assert orders[result["name"]].customer == "CUST-1"
    assert result["customer"] == "CUST-1"

def test_create_order_records_customer_info(frappe_env):
    frappe, orders_module = frappe_env
    info = {
        "customer_full_name": "  Jane Doe  ",
        "customer_gender": "Female",
        "customer_phone": "08123",
        "customer_age": "20 - 29",
        "customer_identification": "Tidak Berkeluarga",
    }

    result = orders_module.create_order(
        "POS",
        "BR-1",
        "P1",
        customer_info=info,
    )

    order = orders[result["name"]]
    assert order.customer_full_name == "Jane Doe"
    assert order.customer_gender == "Female"
    assert order.customer_phone == "08123"
    assert order.customer_age == "20 - 29"
    assert order.customer_identification == "Tidak Berkeluarga"
    assert result["customer_full_name"] == "Jane Doe"

def test_create_staff_order_accepts_string_discounts(frappe_env):
    frappe, orders_module = frappe_env
    frappe.local.flags = {}
    result = orders_module.create_staff_order(
        "Dine-in",
        "BR-1",
        "P1",
        table="T1",
        items={"item": "SALES-ITEM", "rate": 100, "qty": 2},
        discount_percent="10",
        discount_amount="5",
    )

    order = orders[result["name"]]

    # Mimic POSOrder.calculate_totals without requiring Frappe Document
    subtotal = 0
    for item in order.items:
        if not getattr(item, "amount", None):
            item.amount = (item.qty or 0) * (item.rate or 0)
        subtotal += item.amount

    pb1 = subtotal * 0.11
    subtotal_with_pb1 = subtotal + pb1

    discount = 0
    if getattr(order, "discount_percent", None):
        discount += subtotal_with_pb1 * (order.discount_percent / 100)
    if getattr(order, "discount_amount", None):
        discount += order.discount_amount

    order.discount_amount = discount
    order.totals = max(subtotal_with_pb1 - discount, 0)

    assert order.totals == pytest.approx(194.8)
    assert order.discount_amount == pytest.approx(27.2)


def test_create_order_blocks_discounts_for_guest(frappe_env):
    frappe, orders_module = frappe_env
    frappe.session.user = "Guest"
    frappe.local.flags = {}

    result = orders_module.create_order(
        "Kiosk",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "rate": 50},
        discount_percent=15,
        discount_amount=10,
    )

    assert result["discount_percent"] == 0
    assert result["discount_amount"] == 0
    assert orders[result["name"]].discount_percent == 0
    assert orders[result["name"]].discount_amount == 0


def test_create_pos_order_assigns_queue_number(frappe_env):
    frappe, orders_module = frappe_env

    result = orders_module.create_order(
        "POS",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "rate": 25},
    )

    assert result["order_type"] == "POS"
    assert result["queue_number"] == 1
    assert orders[result["name"]].queue_number == 1


def test_create_order_blocks_discounts_without_roles(frappe_env):
    frappe, orders_module = frappe_env
    frappe.session.user = "basic-user"
    frappe._user_roles["basic-user"] = []
    frappe.local.flags = {}

    result = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "rate": 80},
        discount_percent=20,
        discount_amount=5,
    )

    assert result["discount_percent"] == 0
    assert result["discount_amount"] == 0


def test_create_order_requires_override_even_for_privileged_user(frappe_env):
    frappe, orders_module = frappe_env
    frappe.session.user = "manager"
    frappe._user_roles["manager"] = ["Cashier"]
    frappe.local.flags = {}

    result = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "rate": 60},
        discount_percent=15,
        discount_amount=10,
    )

    assert result["discount_percent"] == 0
    assert result["discount_amount"] == 0


def test_create_order_allows_trusted_override(frappe_env):
    frappe, orders_module = frappe_env
    frappe.session.user = "basic-user"
    frappe._user_roles["basic-user"] = []
    frappe.local.flags = {"imogi_allow_discount_override": True}

    result = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "rate": 40, "qty": 2},
        discount_percent=10,
        discount_amount=5,
    )

    assert result["discount_percent"] == 10
    assert result["discount_amount"] == 5


def test_automatic_bulk_discount_applied(frappe_env):
    frappe, orders_module = frappe_env
    items_payload = [
        {"item": "SALES-ITEM", "rate": 20, "qty": 3},
        {"item": "SALES-ITEM", "rate": 15, "qty": 2},
    ]

    result = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        items=items_payload,
    )

    assert result["discount_percent"] == 10
    assert result["discount_amount"] == 0


def test_valid_promo_code_applies_configured_discount(frappe_env):
    frappe, orders_module = frappe_env
    global promo_codes
    promo_codes["SAVE25"] = {
        "name": "SAVE25",
        "code": "SAVE25",
        "discount_type": "Amount",
        "discount_value": 25,
        "enabled": 1,
    }

    result = orders_module.create_order(
        "Takeaway",
        "BR-1",
        "P1",
        items={"item": "SALES-ITEM", "qty": 2, "rate": 40},
        promo_code="save25",
    )

    assert result["discount_amount"] == 25
    assert result["discount_percent"] == 0
    assert result.get("promo_code") == "SAVE25"


def test_invalid_or_disabled_promo_code_returns_error(frappe_env):
    frappe, orders_module = frappe_env
    global promo_codes
    promo_codes["OFFLINE"] = {
        "name": "OFFLINE",
        "code": "OFFLINE",
        "discount_type": "Percent",
        "discount_value": 20,
        "enabled": 0,
    }

    import imogi_pos.api.pricing as pricing_module
    importlib.reload(pricing_module)

    evaluation = pricing_module.evaluate_order_discounts(
        [{"item": "SALES-ITEM", "qty": 1, "rate": 30}],
        promo_code="OFFLINE",
    )

    assert evaluation["errors"]
    assert evaluation["discount_percent"] == 0
    assert evaluation["discount_amount"] == 0

    with pytest.raises(frappe.ValidationError):
        orders_module.create_order(
            "Takeaway",
            "BR-1",
            "P1",
            items={"item": "SALES-ITEM", "qty": 1, "rate": 30},
            promo_code="INVALID",
        )


def test_validate_promo_code_returns_discount_payload(frappe_env):
    frappe, _ = frappe_env
    global promo_codes
    promo_codes["SAVE10"] = {
        "name": "SAVE10",
        "code": "SAVE10",
        "discount_type": "Percent",
        "discount_value": 10,
        "enabled": 1,
    }

    import imogi_pos.api.pricing as pricing_module

    importlib.reload(pricing_module)

    response = pricing_module.validate_promo_code(
        promo_code="save10",
        pos_profile="P1",
        branch="BR-1",
        quantity=2,
        subtotal=100,
        tax=10,
        total=110,
        order_type="Takeaway",
    )

    assert response["valid"] is True
    assert response["code"] == "SAVE10"
    assert response["discount_type"].lower() == "percent"
    assert response["discount_percent"] == pytest.approx(10)
    assert response["discount_amount"] == pytest.approx(0)
    assert response["label"].startswith("Promo SAVE10")
    assert "SAVE10" in response["description"]
    assert "% off" in response["description"]


def test_validate_promo_code_handles_invalid_submission(frappe_env):
    frappe, _ = frappe_env
    import imogi_pos.api.pricing as pricing_module

    importlib.reload(pricing_module)

    response = pricing_module.validate_promo_code(
        promo_code="invalid",
        pos_profile="P1",
        branch="BR-1",
        quantity=1,
        subtotal=20,
        tax=2,
        total=22,
        order_type="Takeaway",
    )

    assert response["valid"] is False
    assert response["code"] == "INVALID"
    assert "error" in response and response["error"]
    assert response.get("discount_percent", 0) == 0
    assert response.get("discount_amount", 0) == 0


def test_update_order_status_clears_table(frappe_env):
    frappe, orders_module = frappe_env
    order = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    assert tables["T1"].status == "Occupied"
    orders_module.update_order_status(order["name"], "Closed")
    assert tables["T1"].status == "Available"
    assert tables["T1"].current_pos_order is None


def test_create_order_clears_stale_order(frappe_env):
    frappe, orders_module = frappe_env
    old = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    orders[old["name"]].workflow_state = "Closed"
    tables["T1"].status = "Available"
    tables["T1"].current_pos_order = old["name"]
    new = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    assert new["name"] != old["name"]
    assert tables["T1"].current_pos_order == new["name"]


def test_open_or_create_for_table_reuses_existing_order(frappe_env):
    frappe, orders_module = frappe_env
    existing = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    result = orders_module.open_or_create_for_table("T1", "F1", "P1")
    assert result["name"] == existing["name"]
