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
    assert result["pos_order"] == "POS-1"
    assert result["items"][0]["pos_order_item"] == "ROW-1"
    assert len(frappe.realtime.calls) > 0
