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
                if isinstance(fieldname, (list, tuple)):
                    data = {"item": "ITEM-1", "item_code": None}
                    return data if as_dict else tuple(data.values())
                if fieldname == "item":
                    return "ITEM-1"
                if fieldname == "item_code":
                    raise Exception("old field used")
            if doctype == "Item":
                self.looked_up_item = name
                return False
            if doctype == "KOT Ticket":
                return "BR-1"
            if doctype == "POS Profile":
                return "Restaurant"
            return None

    frappe.db = DB()

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

    realtime = types.SimpleNamespace(publish_realtime=lambda *a, **k: None)
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


def test_send_items_to_kitchen_uses_item_field(kot_module):
    kot, frappe = kot_module
    result = kot.send_items_to_kitchen("POS-1", ["ROW-1"])
    assert frappe.db.requested_field != "item_code"
    assert frappe.db.looked_up_item == "ITEM-1"
    assert result["items"] == ["ROW-1"]


def test_get_kots_for_kitchen_returns_ticket_list(kot_module):
    kot, frappe = kot_module

    def get_all(doctype, filters=None, fields=None, order_by=None):
        if doctype == "KOT Ticket":
            assert filters == {
                "kitchen": "Main Kitchen",
                "kitchen_station": "Grill",
                "branch": "BR-1",
            }
            assert order_by == "creation asc"
            return [
                {
                    "name": "KOT-1",
                    "table": "T1",
                    "workflow_state": "Queued",
                },
                {
                    "name": "KOT-2",
                    "table": "T2",
                    "workflow_state": "In Progress",
                },
            ]
        if doctype == "KOT Item":
            parent = filters["parent"]
            if parent == "KOT-1":
                return [
                    {
                        "item_name": "Burger",
                        "qty": 1,
                        "notes": "No cheese",
                        "workflow_state": "Queued",
                    }
                ]
            if parent == "KOT-2":
                return [
                    {
                        "item_name": "Pizza",
                        "qty": 2,
                        "notes": "",
                        "workflow_state": "In Progress",
                    }
                ]
        return []

    frappe.get_all = get_all

    tickets = kot.get_kots_for_kitchen(
        kitchen="Main Kitchen", station="Grill", branch="BR-1"
    )

    assert tickets == [
        {
            "name": "KOT-1",
            "table": "T1",
            "workflow_state": "Queued",
            "items": [
                {
                    "item_name": "Burger",
                    "qty": 1,
                    "notes": "No cheese",
                    "status": "Queued",
                }
            ],
        },
        {
            "name": "KOT-2",
            "table": "T2",
            "workflow_state": "In Progress",
            "items": [
                {
                    "item_name": "Pizza",
                    "qty": 2,
                    "notes": "",
                    "status": "In Progress",
                }
            ],
        },
    ]
