import importlib
import os
import sys
import types

import pytest


@pytest.fixture
def public_module():
    sys.path.insert(0, os.getcwd())

    frappe = types.SimpleNamespace()

    def whitelist(*args, **kwargs):
        def decorator(fn):
            return fn

        return decorator

    frappe.whitelist = whitelist
    frappe._ = lambda x: x
    frappe.session = types.SimpleNamespace(user="cashier@example.com")
    frappe.PermissionError = type("PermissionError", (Exception,), {})
    frappe.has_permission = lambda *args, **kwargs: True

    def _throw(msg, exc=None):
        error = exc or Exception
        raise error(msg)

    frappe.throw = _throw

    sessions = [
        {
            "name": "POS-SESSION-1",
            "device": "POS",
            "opening_balance": 100000,
            "timestamp": "2024-01-01 10:00:00",
            "user": "cashier@example.com",
        },
        {
            "name": "KIOSK-SESSION-1",
            "device": "KIOSK",
            "opening_balance": 50000,
            "timestamp": "2024-01-01 09:00:00",
            "user": "cashier@example.com",
        },
    ]

    calls = []

    def get_all(doctype, filters=None, fields=None, order_by=None, limit=None):
        calls.append(
            {
                "doctype": doctype,
                "filters": dict(filters or {}),
                "fields": fields,
                "order_by": order_by,
                "limit": limit,
            }
        )

        filtered = list(sessions)
        if filters and filters.get("device"):
            filtered = [row for row in filtered if row["device"] == filters["device"]]

        return filtered[:limit] if limit else filtered

    frappe.get_all = get_all

    utils = types.ModuleType("frappe.utils")
    utils.now = lambda: "now"
    utils.nowdate = lambda: "today"
    utils.get_url = lambda path=None: "http://example.com"
    utils.flt = float

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    public = importlib.import_module("imogi_pos.api.public")
    importlib.reload(public)

    yield public, calls

    sys.modules.pop("frappe", None)
    sys.modules.pop("frappe.utils", None)
    sys.modules.pop("imogi_pos.api.public", None)
    sys.modules.pop("imogi_pos", None)
    sys.path.pop(0)


def test_default_device_filter(public_module):
    public, calls = public_module

    result = public.get_cashier_device_sessions()

    assert calls[-1]["filters"].get("device") == "POS"
    assert all(session["device"] == "POS" for session in result)


def test_custom_device_filter(public_module):
    public, calls = public_module

    result = public.get_cashier_device_sessions(device="KIOSK")

    assert calls[-1]["filters"].get("device") == "KIOSK"
    assert all(session["device"] == "KIOSK" for session in result)
