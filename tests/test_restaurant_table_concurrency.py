import sys
import types
import copy
import pytest

sys.path.insert(0, ".")


@pytest.fixture
def table_env(monkeypatch):
    DOCUMENT_STORE = {}

    class TimestampMismatchError(Exception):
        pass

    class Document:
        def __init__(self, doctype=None, name=None):
            self.doctype = doctype
            self.name = name
            self._version = 0

        def save(self, ignore_version=False):
            stored = DOCUMENT_STORE.get(self.name)
            if stored and not ignore_version and self._version != stored._version:
                raise TimestampMismatchError("Timestamp mismatch")
            new = copy.deepcopy(self)
            new._version = (stored._version + 1) if stored else 1
            DOCUMENT_STORE[self.name] = new
            self._version = new._version

        def reload(self):
            stored = DOCUMENT_STORE[self.name]
            self.status = stored.status
            self.current_pos_order = stored.current_pos_order
            self._version = stored._version

    def get_doc(doctype, name):
        return copy.deepcopy(DOCUMENT_STORE[name])

    frappe = types.ModuleType("frappe")
    frappe.TimestampMismatchError = TimestampMismatchError
    frappe.publish_realtime = lambda *args, **kwargs: None
    frappe.get_doc = get_doc
    frappe._ = lambda x: x
    frappe.db = types.SimpleNamespace()
    sys.modules["frappe"] = frappe
    sys.modules["frappe.model"] = types.SimpleNamespace(document=types.SimpleNamespace(Document=Document))
    sys.modules["frappe.model.document"] = sys.modules["frappe.model"].document

    from imogi_pos.imogi_pos.doctype.restaurant_table.restaurant_table import RestaurantTable

    return frappe, RestaurantTable, DOCUMENT_STORE


def test_concurrent_status_updates(table_env):
    frappe, RestaurantTable, store = table_env
    table = RestaurantTable("Restaurant Table", "T1")
    table.status = "Available"
    table.current_pos_order = None
    table.floor = None
    store["T1"] = copy.deepcopy(table)

    first = frappe.get_doc("Restaurant Table", "T1")
    second = frappe.get_doc("Restaurant Table", "T1")

    first.set_status("Occupied", pos_order="POS-1")

    try:
        second.set_status("Reserved")
    except frappe.TimestampMismatchError:
        pytest.fail("TimestampMismatchError raised")

    assert store["T1"].status == "Reserved"
