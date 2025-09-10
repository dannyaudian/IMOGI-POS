import importlib
import sys
import types

import pytest


@pytest.fixture
def public_module():
    import os
    sys.path.insert(0, os.getcwd())

    frappe = types.SimpleNamespace()

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner
    frappe.whitelist = whitelist

    frappe.session = types.SimpleNamespace(user="cashier@example.com")

    cache_data = {}

    class Cache:
        def hget(self, key, field):
            return cache_data.get((key, field))

        def hset(self, key, field, value):
            cache_data[(key, field)] = value

    frappe.cache = Cache

    inserted = []

    class Doc:
        def __init__(self, data):
            self.data = data

        def insert(self, ignore_permissions=False):
            inserted.append(self.data)
            return self

    def get_doc(data):
        return Doc(data)

    frappe.get_doc = get_doc

    class FrappeExc(Exception):
        pass

    frappe.throw = lambda msg: (_ for _ in ()).throw(FrappeExc(msg))
    frappe._ = lambda x: x
    utils = types.ModuleType("frappe.utils")
    utils.now = lambda: "now"
    utils.get_url = lambda path=None: f"http://test/{path}" if path else "http://test"
    frappe.utils = utils

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    public = importlib.import_module("imogi_pos.api.public")
    importlib.reload(public)

    yield public, inserted, cache_data, FrappeExc

    sys.modules.pop("frappe", None)
    sys.modules.pop("frappe.utils", None)
    sys.modules.pop("imogi_pos.api.public", None)
    sys.modules.pop("imogi_pos", None)
    sys.path.pop(0)


def test_record_opening_balance_inserts(public_module):
    public, inserted, cache, _ = public_module

    result = public.record_opening_balance("terminal", 100)

    assert result == {"status": "ok"}
    assert cache[("active_devices", "cashier@example.com")] == "terminal"
    assert inserted[0]["opening_balance"] == 100
    assert inserted[0]["user"] == "cashier@example.com"


def test_record_opening_balance_rejects_existing(public_module):
    public, inserted, cache, Exc = public_module
    cache[("active_devices", "cashier@example.com")] = "terminal"

    with pytest.raises(Exc):
        public.record_opening_balance("other", 50)
