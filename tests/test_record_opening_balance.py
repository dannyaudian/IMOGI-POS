import importlib
import json
import re
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

    class SessionDoc:
        def __init__(self, data):
            self.data = data
            self.name = "SHF-20230101-001"
            self.meta = types.SimpleNamespace(get_field=lambda x: None)

        def insert(self, ignore_permissions=False):
            inserted.append(self.data)
            return self

        def db_set(self, fieldname, value):
            self.data[fieldname] = value

    class JournalDoc:
        def __init__(self):
            self.voucher_type = None
            self.posting_date = None
            self.company = None
            self.accounts = []
            self.name = "JE-001"

        def append(self, fieldname, value):
            if fieldname == "accounts":
                self.accounts.append(value)

        def insert(self, ignore_permissions=False):
            inserted.append({
                "doctype": "Journal Entry",
                "voucher_type": self.voucher_type,
                "posting_date": self.posting_date,
                "company": self.company,
                "accounts": self.accounts,
            })
            return self

        def submit(self):
            pass

    def get_doc(data):
        return SessionDoc(data)

    def new_doc(doctype):
        assert doctype == "Journal Entry"
        return JournalDoc()

    frappe.get_doc = get_doc
    frappe.new_doc = new_doc

    def db_get_value(doctype, name, field, as_dict=False):
        if isinstance(field, (list, tuple)):
            return types.SimpleNamespace(
                root_type="Asset", balance_must_be=None, company="Test Company"
            )
        if field == "balance_must_be":
            return None
        return None

    frappe.db = types.SimpleNamespace(get_value=db_get_value)

    settings_doc = types.SimpleNamespace(
        big_cash_account="Kas Besar", petty_cash_account="Kas Kecil"
    )
    frappe.get_cached_doc = lambda name: settings_doc

    class Defaults:
        def get_user_default(self, key):
            return None

        def get_global_default(self, key):
            return "Test Company"

    frappe.defaults = Defaults()

    class DB:
        def get_value(self, doctype, name, fields, as_dict=False):
            if as_dict:
                return types.SimpleNamespace(
                    root_type="Asset", balance_must_be=None, company="Test Company"
                )
            return None

    frappe.db = DB()

    def get_cached_doc(doctype):
        if doctype == "Restaurant Settings":
            return types.SimpleNamespace(
                big_cash_account="Kas Besar", petty_cash_account="Kas Kecil"
            )
        raise KeyError(doctype)

    frappe.get_cached_doc = get_cached_doc

    class FrappeExc(Exception):
        pass

    frappe.throw = lambda msg: (_ for _ in ()).throw(FrappeExc(msg))
    frappe._ = lambda x: x
    utils = types.ModuleType("frappe.utils")
    utils.now = lambda: "now"
    utils.nowdate = lambda: "2023-01-01"
    utils.get_url = lambda path=None: f"http://test/{path}" if path else "http://test"
    utils.flt = float
    frappe.utils = utils

    frappe.parse_json = lambda s: json.loads(s)

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

    denoms = [{"value": 50, "qty": 2}]
    result = public.record_opening_balance("terminal", 0, denoms)


    assert result == {"status": "ok", "shift_id": "SHF-20230101-001", "opening_balance": 100.0}
    assert cache[("active_devices", "cashier@example.com")] == "terminal"
    # first insert is the session document
    assert inserted[0]["opening_balance"] == 100
    assert inserted[0]["denominations"] == denoms
    assert inserted[0]["user"] == "cashier@example.com"
    # second insert is the journal entry
    je = inserted[1]
    assert je["doctype"] == "Journal Entry"
    assert je["voucher_type"] == "Cash Entry"
    assert je["accounts"][0]["account"] == "Kas Kecil"
    assert je["accounts"][0]["debit_in_account_currency"] == 100
    assert je["accounts"][1]["account"] == "Kas Besar"
    assert je["accounts"][1]["credit_in_account_currency"] == 100


def test_record_opening_balance_accepts_alt_keys(public_module):
    public, inserted, cache, _ = public_module

    denoms = [{"nominal": 20, "quantity": 3}]
    result = public.record_opening_balance("terminal", 0, denoms)

    assert result == {
        "status": "ok",
        "shift_id": "SHF-20230101-001",
        "opening_balance": 60.0,
    }
    assert inserted[0]["opening_balance"] == 60
    assert inserted[0]["denominations"] == denoms


def test_record_opening_balance_accepts_json_string(public_module):
    public, inserted, cache, _ = public_module

    # Pass denominations as JSON string
    denoms_json = json.dumps([{"value": 25, "qty": 4}])
    result = public.record_opening_balance("terminal", 0, denoms_json)

    assert result == {
        "status": "ok",
        "shift_id": "SHF-20230101-001",
        "opening_balance": 100.0,
    }
    assert inserted[0]["opening_balance"] == 100
    assert inserted[0]["denominations"] == [{"value": 25, "qty": 4}]


def test_record_opening_balance_uses_opening_balance_when_no_denoms(public_module):
    public, inserted, cache, _ = public_module

    result = public.record_opening_balance("terminal", 150)

    assert result == {
        "status": "ok",
        "shift_id": "SHF-20230101-001",
        "opening_balance": 150.0,
    }
    assert inserted[0]["opening_balance"] == 150
    assert inserted[0]["denominations"] == []


def test_record_opening_balance_rejects_existing(public_module):
    public, inserted, cache, Exc = public_module
    cache[("active_devices", "cashier@example.com")] = "terminal"

    with pytest.raises(Exc):
        public.record_opening_balance("other", 0, [{"value": 50, "qty": 1}])


def test_record_opening_balance_creates_journal_entry(public_module, monkeypatch):
    """Ensure a Journal Entry is created with debit and credit lines."""
    public, inserted, cache, _ = public_module

    import frappe
    class Settings:
        big_cash_account = "Vault"
        petty_cash_account = "Drawer"

    monkeypatch.setattr(frappe, "get_cached_doc", lambda d: Settings())

    denoms = [{"value": 100, "qty": 2}, {"value": 50, "qty": 1}]
    public.record_opening_balance("terminal", 0, denoms)

    # Session doc is inserted first, journal entry second
    je = inserted[1]
    assert je["doctype"] == "Journal Entry"
    assert je["accounts"][0]["account"] == "Drawer"
    assert je["accounts"][0]["debit_in_account_currency"] == 250
    assert je["accounts"][1]["account"] == "Vault"
    assert je["accounts"][1]["credit_in_account_currency"] == 250


def test_record_opening_balance_auto_creates_accounts(public_module, monkeypatch):
    """If cash accounts are missing, they should be created automatically."""
    public, inserted, cache, _ = public_module

    import frappe
    import imogi_pos.setup.install as install

    calls = {"created": False, "count": 0}

    def fake_get_cached_doc(name):
        calls["count"] += 1
        if calls["count"] == 1:
            # first call returns missing accounts
            return types.SimpleNamespace(big_cash_account=None, petty_cash_account=None)
        # second call returns the created accounts
        return types.SimpleNamespace(big_cash_account="Vault", petty_cash_account="Drawer")

    def fake_create_cash_accounts():
        calls["created"] = True

    monkeypatch.setattr(frappe, "get_cached_doc", fake_get_cached_doc)
    monkeypatch.setattr(install, "create_cash_accounts", fake_create_cash_accounts)

    denoms = [{"value": 50, "qty": 1}, {"value": 20, "qty": 1}, {"value": 5, "qty": 1}]
    result = public.record_opening_balance("terminal", 0, denoms)


    assert result == {"status": "ok", "shift_id": "SHF-20230101-001", "opening_balance": 75.0}
    assert calls["created"] is True
    je = inserted[1]
    assert je["accounts"][0]["account"] == "Drawer"
    assert je["accounts"][1]["account"] == "Vault"
