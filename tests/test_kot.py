import importlib
import sys
import types
import datetime
import json
import pytest


@pytest.fixture
def kot_module():
    sys.path.insert(0, '.')

    utils = types.ModuleType("frappe.utils")
    utils.now_datetime = lambda: datetime.datetime(2023, 1, 1, 0, 0, 0)
    utils.cint = int
    utils.get_datetime = lambda x=None: datetime.datetime(2023, 1, 1, 0, 0, 0)

    frappe = types.ModuleType("frappe")
    frappe.utils = utils

    class FrappeException(Exception):
        pass

    frappe.ValidationError = FrappeException
    frappe.PermissionError = FrappeException
    frappe._ = lambda x: x
    frappe.parse_json = json.loads
    frappe.has_permission = lambda doctype, doc=None: True

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist

    def throw(msg, exc=None):
        raise (exc or Exception)(msg)

    frappe.throw = throw
    frappe.session = types.SimpleNamespace(user="test-user")

    class DB:
        def __init__(self):
            self.requested_field = None
            self.looked_up_item = None

        def get_value(self, doctype, name=None, fieldname=None, as_dict=False):
            if doctype == "POS Order Item":
                self.requested_field = fieldname
                data = {
                    "item": "ITEM-1",
                    "qty": 1,
                    "notes": "Note",
                    "kitchen": "KIT-1",
                    "kitchen_station": "ST-1",
                    "item_options": {"size": "Large"},
                }
                if isinstance(fieldname, (list, tuple)):
                    return data if as_dict else [data.get(f) for f in fieldname]
                return data.get(fieldname)
            if doctype == "Item":
                self.looked_up_item = name
                if fieldname == "item_name":
                    return "Item Name"
                return False
            if doctype == "KOT Ticket" and fieldname == "branch":
                return "BR-1"
            if doctype == "POS Profile":
                return "Restaurant"
            return None

        def has_column(self, doctype, column_name):
            return doctype == "POS Order Item" and column_name == "item_code"

    frappe.db = DB()

    class Document:
        def __init__(self, doctype):
            self.doctype = doctype
            self.items = []
            self.name = f"{doctype}-1"

        def append(self, fieldname, value):
            getattr(self, fieldname).append(value)

        def insert(self):
            return self

        def as_dict(self):
            return {
                k: v for k, v in self.__dict__.items()
            }

    frappe.new_doc = lambda doctype: Document(doctype)

    def get_doc(doctype, name=None):
        if doctype == "POS Order":
            return types.SimpleNamespace(
                name=name,
                pos_profile="PROFILE-1",
                branch="BR-1",
                table=None,
                workflow_state="Draft",
            )
        raise Exception("Unexpected doctype")

    frappe.get_doc = get_doc

    class Realtime:
        def __init__(self):
            self.calls = []
        def publish_realtime(self, *args, **kwargs):
            self.calls.append((args, kwargs))

    realtime = Realtime()
    frappe.realtime = realtime

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils
    sys.modules['frappe.realtime'] = realtime
    sys.modules.pop('imogi_pos.utils.permissions', None)

    kot = importlib.import_module('imogi_pos.api.kot')
    importlib.reload(kot)

    yield kot, frappe

    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('frappe.realtime', None)
    sys.modules.pop('imogi_pos.api.kot', None)
    sys.modules.pop('imogi_pos', None)
    sys.path.pop(0)


def test_send_items_to_kitchen_creates_ticket(kot_module):
    kot, frappe = kot_module
    result = kot.send_items_to_kitchen("POS-1", ["ROW-1"])
    assert frappe.db.requested_field != "item_code"
    assert frappe.db.looked_up_item == "ITEM-1"
    assert [item["pos_order_item"] for item in result["items"]] == ["ROW-1"]
    assert result["items"][0]["item_options"] == {"size": {"name": "Large"}}


def test_send_items_to_kitchen_accepts_order_dict(kot_module):
    kot, frappe = kot_module
    result = kot.send_items_to_kitchen(order={"name": "POS-1"}, item_rows=["ROW-1"])
    assert result["pos_order"] == "POS-1"


def test_send_items_to_kitchen_includes_item_options(kot_module):
    kot, frappe = kot_module
    result = kot.send_items_to_kitchen("POS-1", ["ROW-1"])
    assert result["items"][0]["item_options"] == {"size": {"name": "Large"}}


def test_send_items_to_kitchen_requires_station(kot_module):
    kot, frappe = kot_module

    insert_called = False

    class Document:
        def __init__(self, doctype):
            self.doctype = doctype
            self.items = []
            self.name = f"{doctype}-1"

        def append(self, fieldname, value):
            getattr(self, fieldname).append(value)

        def insert(self):
            nonlocal insert_called
            insert_called = True
            return self

        def as_dict(self):
            return {k: v for k, v in self.__dict__.items()}

    frappe.new_doc = lambda doctype: Document(doctype)

    def db_get_value(self, doctype, name=None, fieldname=None, as_dict=False):
        self.requested_field = fieldname
        if doctype == "POS Order Item":
            data = {
                "item": "ITEM-1",
                "qty": 1,
                "notes": "Note",
                "kitchen": "KIT-1",
                "kitchen_station": None,
                "item_options": {"size": "Large"},
            }
            if isinstance(fieldname, (list, tuple)):
                return data if as_dict else [data.get(f) for f in fieldname]
            return data.get(fieldname)
        if doctype == "Item":
            self.looked_up_item = name
            if fieldname == "item_name":
                return "Item Name"
            return False
        if doctype == "KOT Ticket" and fieldname == "branch":
            return "BR-1"
        if doctype == "POS Profile":
            return "Restaurant"
        return None

    frappe.db.get_value = types.MethodType(db_get_value, frappe.db)

    with pytest.raises(frappe.ValidationError) as excinfo:
        kot.send_items_to_kitchen("POS-1", ["ROW-1"])

    assert "ITEM-1" in str(excinfo.value)
    assert not insert_called

@pytest.fixture
def kot_service_env():
    sys.path.insert(0, ".")

    import types

    frappe = types.ModuleType("frappe")
    utils = types.SimpleNamespace(now_datetime=lambda: datetime.datetime(2023, 1, 1),
                                  get_datetime=lambda x=None: datetime.datetime(2023, 1, 1))
    frappe.utils = utils

    class FrappeException(Exception):
        pass

    frappe.ValidationError = FrappeException
    frappe._ = lambda x: x

    def throw(msg, exc=None):
        raise (exc or FrappeException)(msg)

    frappe.throw = throw
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.publish_realtime = lambda *a, **k: None

    class Item:
        def __init__(self, name, parent, state):
            self.name = name
            self.parent = parent
            self.workflow_state = state
            self.pos_order_item = None
            self.last_edited_by = None

        def save(self):
            pass

    items = {
        "KOTI-1": Item("KOTI-1", "KT-1", "Queued"),
        "KOTI-2": Item("KOTI-2", "KT-1", "Queued"),
    }

    class Ticket:
        def __init__(self, name):
            self.name = name
            self.pos_order = "ORDER-1"
            self.workflow_state = "Queued"
            self.kitchen_station = None
            self.branch = "BR-1"
            self.table = None
            self.items = list(items.values())

        def save(self):
            pass

    tickets = {"KT-1": Ticket("KT-1")}

    def get_doc(doctype, name):
        if doctype == "KOT Item":
            return items[name]
        if doctype == "KOT Ticket":
            t = tickets[name]
            t.items = list(items.values())
            return t
        if doctype == "POS Order":
            return types.SimpleNamespace(pos_profile="PROFILE", branch="BR-1")
        raise Exception("Unexpected doctype")

    frappe.get_doc = get_doc

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    import importlib
    import imogi_pos  # ensure package registered
    sys.modules.pop("imogi_pos.kitchen.kot_service", None)
    ks = importlib.import_module("imogi_pos.kitchen.kot_service")
    service = ks.KOTService()
    service._update_ticket_state_if_needed = lambda *a, **k: None
    service._update_pos_item_counter = lambda *a, **k: None
    service._publish_kot_item_update = lambda *a, **k: None
    service._update_pos_order_state_if_needed = lambda *a, **k: None
    service._publish_kot_updates = lambda *a, **k: None

    yield service, items, tickets

    sys.modules.pop("frappe", None)
    sys.modules.pop("frappe.utils", None)
    sys.path.pop(0)


def test_update_kot_item_state_allows_forward_progress(kot_service_env):
    service, items, _ = kot_service_env
    service.update_kot_item_state("KOTI-1", "In Progress")
    assert items["KOTI-1"].workflow_state == "In Progress"
    service.update_kot_item_state("KOTI-1", "Ready")
    assert items["KOTI-1"].workflow_state == "Ready"


def test_update_kot_item_state_blocks_invalid_transition(kot_service_env):
    service, _, _ = kot_service_env
    with pytest.raises(Exception):
        service.update_kot_item_state("KOTI-1", "Ready")


def test_bulk_update_kot_items_records_results(kot_service_env):
    service, items, _ = kot_service_env
    service.update_kot_item_state("KOTI-1", "In Progress")
    result = service.bulk_update_kot_items(["KOTI-1", "KOTI-2"], "Ready")
    assert result["updated_items"] == ["KOTI-1"]
    assert result["failed_items"][0]["item"] == "KOTI-2"
    assert items["KOTI-1"].workflow_state == "Ready"
    assert items["KOTI-2"].workflow_state == "Queued"


def test_update_kot_ticket_state_allows_in_progress_to_served(kot_service_env):
    service, _, tickets = kot_service_env
    ticket = tickets["KT-1"]
    ticket.workflow_state = "In Progress"
    for item in ticket.items:
        item.workflow_state = "In Progress"

    service.update_kot_ticket_state("KT-1", "Served")

    assert ticket.workflow_state == "Served"
    assert all(item.workflow_state == "Served" for item in ticket.items)


def test_update_kot_ticket_state_blocks_invalid_transition(kot_service_env):
    service, _, tickets = kot_service_env
    ticket = tickets["KT-1"]
    ticket.workflow_state = "Served"
    for item in ticket.items:
        item.workflow_state = "Served"

    with pytest.raises(Exception):
        service.update_kot_ticket_state("KT-1", "In Progress")
