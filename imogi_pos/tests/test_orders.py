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
        def set_status(self, status, pos_order=None):
            self.status = status
            self.current_pos_order = pos_order
            self.save()
            return {"status": self.status, "current_pos_order": self.current_pos_order}

    class StubOrder:
        def __init__(self, name):
            self.doctype = "POS Order"
            self.name = name
            self.items = []
            self.workflow_state = "Draft"
        def update(self, data):
            for k, v in data.items():
                setattr(self, k, v)
        def insert(self):
            orders[self.name] = self
            return self
        def save(self):
            orders[self.name] = self
        def append(self, field, value):
            getattr(self, field).append(value)
        def as_dict(self):
            return {
                "name": self.name,
                "order_type": self.order_type,
                "branch": self.branch,
                "pos_profile": self.pos_profile,
                "table": self.table,
                "workflow_state": self.workflow_state,
                "floor": getattr(self, "floor", None),
            }

    class DB:
        def get_value(self, doctype, name, field):
            if doctype == "POS Profile":
                return getattr(pos_profiles[name], field)
            if doctype == "Restaurant Table":
                return getattr(tables[name], field)
            if doctype == "POS Order":
                return getattr(orders[name], field)
            return None
        def set_value(self, doctype, name, field, value):
            setattr(orders[name], field, value)
        def exists(self, doctype, filters):
            return False

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
    frappe.has_permission = has_permission
    frappe.throw = throw
    frappe.ValidationError = Exception
    frappe.PermissionError = Exception
    frappe.parse_json = parse_json
    frappe._ = lambda x: x
    frappe.whitelist = lambda *a, **kw: (lambda f: f)
    frappe.utils = types.ModuleType("utils")
    frappe.utils.now_datetime = lambda: datetime.datetime(2023,1,1,12,0,0)

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = frappe.utils
    global orders, tables, pos_profiles
    orders = {}
    tables = {
        "T1": StubTable("T1", "BR-1"),
        "T2": StubTable("T2", "BR-1")
    }
    pos_profiles = {
        "P1": types.SimpleNamespace(imogi_pos_domain="Restaurant", imogi_branch="BR-1")
    }

    import imogi_pos.api.orders as orders_module
    importlib.reload(orders_module)
    return frappe, orders_module

def test_create_order_assigns_table(frappe_env):
    frappe, orders_module = frappe_env
    result = orders_module.create_order("Dine-in", "BR-1", "P1", table="T1")
    assert result["table"] == "T1"
    assert tables["T1"].status == "Occupied"
    assert tables["T1"].current_pos_order == result["name"]

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
    orders[order1["name"]].items = [types.SimpleNamespace(item_code="A")]
    orders[order2["name"]].items = [types.SimpleNamespace(item_code="B")]
    orders_module.merge_tables("T1", ["T2"])
    assert len(orders[order1["name"]].items) == 2
    assert tables["T2"].status == "Available"
    assert orders[order2["name"]].workflow_state == "Merged"
