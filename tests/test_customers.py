import importlib
import sys
import types
import pytest


@pytest.fixture
def customers_module():
    sys.path.insert(0, '.')

    frappe = types.ModuleType("frappe")

    class FrappeException(Exception):
        pass

    frappe.ValidationError = FrappeException
    frappe._ = lambda x: x

    def throw(msg, exc=None):
        raise (exc or Exception)(msg)

    frappe.throw = throw

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist
    frappe.log_error = lambda *a, **k: None

    class DB:
        def get_single_value(self, doctype, field):
            return f"Default-{field}"

        def get_value(self, doctype, filters, field):
            return f"Default-{field}"

    frappe.db = DB()
    docs_created = []

    class FakeDoc(types.SimpleNamespace):
        def insert(self, ignore_permissions=True):
            self.name = f"{self.doctype}-1"
            docs_created.append(self)
            return self

    def get_doc(data):
        if isinstance(data, dict):
            return FakeDoc(**data)
        raise Exception("Unexpected call")

    frappe.get_doc = get_doc
    frappe.has_permission = lambda *a, **k: True
    frappe.realtime = types.SimpleNamespace(publish_realtime=lambda *a, **k: None)
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.local = types.SimpleNamespace(request_ip="test-device")

    sys.modules['frappe'] = frappe

    customers = importlib.import_module('imogi_pos.api.customers')
    importlib.reload(customers)

    customers.find_customer_by_phone = lambda phone: []

    yield customers, docs_created, frappe

    sys.modules.pop('frappe', None)
    sys.modules.pop('imogi_pos.api.customers', None)
    sys.modules.pop('imogi_pos', None)
    sys.path.pop(0)


def test_quick_create_customer_with_contact_creates_docs(customers_module):
    customers, docs_created, _ = customers_module

    result = customers.quick_create_customer_with_contact(
        customer_name="John Doe", mobile_no="08123456789", email_id="john@example.com"
    )

    assert result["success"] is True
    assert result["customer"]["customer_name"] == "John Doe"
    assert result["customer"]["phone"] == "08123456789"
    doctypes = {doc.doctype for doc in docs_created}
    assert "Customer" in doctypes and "Contact" in doctypes


@pytest.mark.parametrize(
    "kwargs",
    [
        {"mobile_no": "081234"},
        {"customer_name": "John"},
    ],
)
def test_quick_create_customer_with_contact_validation(kwargs, customers_module):
    customers, _, frappe = customers_module
    with pytest.raises(frappe.ValidationError):
        customers.quick_create_customer_with_contact(**kwargs)
