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
    utils.nowdate = lambda: "2023-01-01"
    utils.get_datetime = lambda x=None: datetime.datetime(2023, 1, 1, 0, 0, 0)
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
            self.exists_map = {}
        def get_value(self, doctype, name=None, fieldname=None):
            return 0
        def set_value(self, doctype, name, field, value):
            self.set_calls.append((doctype, name, field, value))
        def exists(self, doctype, name):
            return self.exists_map.get((doctype, name), True)
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
            self.item = 'ITEM-1'
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
            self.item = 'ITEM-1'
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


def test_prepare_invoice_draft_includes_notes(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
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
        table=None,
        items=[OrderItem()]
    )

    class Profile:
        imogi_mode = 'Counter'
        def get(self, field, default=None):
            return getattr(self, field, default)
    profile = Profile()

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    draft = billing.prepare_invoice_draft('POS-1')

    assert draft['items'][0]['description'] == 'Item 1\nNo onions'
    assert draft['items'][0]['has_notes'] is True


def test_validate_pos_session_skips_if_doctype_missing(billing_module):
    billing, frappe = billing_module
    frappe.db.exists_map[("DocType", "POS Session")] = False
    assert billing.validate_pos_session("P1") is None


def test_get_active_pos_session_returns_none_if_doctype_missing(billing_module):
    billing, frappe = billing_module
    frappe.db.exists_map[("DocType", "POS Session")] = False
    assert billing.get_active_pos_session() is None


def test_generate_invoice_omits_pos_session_when_none(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
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

    frappe.db.exists_map[("DocType", "POS Session")] = False

    result = billing.generate_invoice('POS-1')

    assert 'pos_session' not in result


def test_list_orders_for_cashier_resolves_branch(billing_module):
    billing, frappe = billing_module

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'POS Profile User':
            return 'P1'
        if doctype == 'POS Profile' and name == 'P1' and fieldname == 'imogi_branch':
            return 'BR-1'
        return None

    frappe.db.get_value = get_value

    called = {}

    def get_all(doctype, filters=None, fields=None, order_by=None):
        if doctype == 'POS Order':
            called['branch'] = filters.get('branch')
            return []
        return []

    frappe.get_all = get_all

    assert billing.list_orders_for_cashier() == []
    assert called['branch'] == 'BR-1'


def test_list_orders_for_cashier_errors_without_profile(billing_module):
    billing, frappe = billing_module

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'POS Profile User':
            return None
        return None

    frappe.db.get_value = get_value

    with pytest.raises(Exception) as exc:
        billing.list_orders_for_cashier()

    assert 'No POS Profile found' in str(exc.value)
