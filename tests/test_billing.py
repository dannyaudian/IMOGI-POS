import importlib
import sys
import types
import datetime
import pytest


@pytest.fixture
def billing_module():
    sys.path.insert(0, '.')
    utils = types.ModuleType("frappe.utils")
    utils.now_datetime = lambda: datetime.datetime(2023, 1, 1, 0, 0, 0)
    utils.cint = int
    utils.add_to_date = lambda dt, **kw: dt
    utils.get_url = lambda path=None: path or ""

    frappe = types.ModuleType("frappe")
    class FrappeException(Exception):
        pass
    frappe.ValidationError = FrappeException
    frappe.PermissionError = FrappeException
    frappe._ = lambda x: x
    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner
    frappe.whitelist = whitelist
    frappe.has_permission = lambda doctype, doc=None: True
    frappe.log_error = lambda *a, **k: None
    def throw(msg, exc=None):
        raise (exc or Exception)(msg)
    frappe.throw = throw
    frappe.realtime = types.SimpleNamespace(publish_realtime=lambda *a, **k: None)
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.local = types.SimpleNamespace(request_ip="test-device")

    class DB:
        def __init__(self):
            self.set_calls = []
        def get_value(self, doctype, name=None, fieldname=None):
            return 0
        def set_value(self, doctype, name, field, value):
            self.set_calls.append((doctype, name, field, value))
    frappe.db = DB()
    frappe.utils = utils

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils
    sys.modules['frappe.realtime'] = frappe.realtime

    billing = importlib.import_module('imogi_pos.api.billing')
    importlib.reload(billing)

    yield billing, frappe

    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('frappe.realtime', None)
    sys.modules.pop('imogi_pos.api.billing', None)
    sys.modules.pop('imogi_pos', None)


def test_generate_invoice_copies_notes_and_updates_order(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item_code = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 1
            self.rate = 10
            self.amount = 10
            self.notes = 'No onions'

    order = types.SimpleNamespace(
        name='POS-1',
        branch='BR-1',
        pos_profile='P1',
        customer='CUST-1',
        order_type='Dine-in',
        table='T1',
        items=[OrderItem()]
    )
    class Profile:
        imogi_mode = 'Counter'
        def get(self, field, default=None):
            return getattr(self, field, default)
    profile = Profile()

    class InvoiceDoc(types.SimpleNamespace):
        def insert(self, ignore_permissions=True):
            self.name = 'SINV-1'
            return self
        def submit(self):
            self.submitted = True
        def as_dict(self):
            return self.__dict__

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    frappe.db.get_value = lambda doctype, name=None, fieldname=None: {'Item': 0, 'Restaurant Table': 'F1'}.get(doctype, 0)

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1')

    assert result['name'] == 'SINV-1'
    assert result['items'][0]['description'] == 'Item 1\nNo onions'
    assert ('POS Order', 'POS-1', 'sales_invoice', 'SINV-1') in frappe.db.set_calls


def test_generate_invoice_error_handling(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item_code = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 1
            self.rate = 10
            self.amount = 10
            self.notes = ''

    order = types.SimpleNamespace(
        name='POS-1',
        branch='BR-1',
        pos_profile='P1',
        customer='CUST-1',
        order_type='Dine-in',
        table=None,
        items=[OrderItem()]
    )
    class Profile:
        imogi_mode = 'Counter'
        def get(self, field, default=None):
            return getattr(self, field, default)
    profile = Profile()

    class BadInvoice(types.SimpleNamespace):
        def insert(self, ignore_permissions=True):
            raise Exception('DB fail')
        def submit(self):
            pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return BadInvoice(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    with pytest.raises(Exception) as exc:
        billing.generate_invoice('POS-1')

    assert 'Failed to generate invoice' in str(exc.value)


@pytest.mark.parametrize("has_session", [True, False])
def test_get_active_pos_session_user_scope(billing_module, has_session):
    billing, frappe = billing_module

    # Adjust stub to return session based on input flag
    def get_value(doctype, filters=None, fieldname=None):
        expected_filters = {"user": "test-user", "status": "Open"}
        if doctype == "POS Session" and filters == expected_filters and has_session:
            return "USER-SESSION"
        return None

    frappe.db.get_value = get_value

    result = billing.get_active_pos_session("User")
    if has_session:
        assert result == "USER-SESSION"
    else:
        assert result is None


@pytest.mark.parametrize("has_session", [True, False])
def test_get_active_pos_session_device_scope(billing_module, has_session):
    billing, frappe = billing_module

    # Ensure device identifier present
    frappe.local.request_ip = "device-1"

    def get_value(doctype, filters=None, fieldname=None):
        expected_filters = {"device_id": "device-1", "status": "Open"}
        if doctype == "POS Session" and filters == expected_filters and has_session:
            return "DEVICE-SESSION"
        return None

    frappe.db.get_value = get_value

    result = billing.get_active_pos_session("Device")
    if has_session:
        assert result == "DEVICE-SESSION"
    else:
        assert result is None

    # Missing device identifier should gracefully return None
    frappe.local.request_ip = None
    assert billing.get_active_pos_session("Device") is None


@pytest.mark.parametrize("has_session", [True, False])
def test_get_active_pos_session_profile_scope(billing_module, has_session):
    billing, frappe = billing_module

    def get_value(doctype, filters=None, fieldname=None):
        if doctype == "POS Profile" and filters == {"user": "test-user"}:
            return "PROFILE-1"
        expected_filters = {"pos_profile": "PROFILE-1", "status": "Open"}
        if doctype == "POS Session" and filters == expected_filters and has_session:
            return "PROFILE-SESSION"
        return None

    frappe.db.get_value = get_value

    result = billing.get_active_pos_session("POS Profile")
    if has_session:
        assert result == "PROFILE-SESSION"
    else:
        assert result is None

    # Missing profile should also return None
    def get_value_no_profile(doctype, filters=None, fieldname=None):
        if doctype == "POS Profile" and filters == {"user": "test-user"}:
            return None
        return None

    frappe.db.get_value = get_value_no_profile
    assert billing.get_active_pos_session("POS Profile") is None
