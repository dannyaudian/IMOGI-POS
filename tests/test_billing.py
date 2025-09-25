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
    utils.flt = float
    utils.cstr = str

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
    frappe.publish_realtime = frappe.realtime.publish_realtime
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.local = types.SimpleNamespace(request_ip="test-device")
    frappe.created_stock_entries = []

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


class StubInvoiceDoc(types.SimpleNamespace):
    def append(self, field, value):
        lst = getattr(self, field, [])
        lst.append(value)
        setattr(self, field, lst)

    def insert(self, ignore_permissions=True):
        self.name = 'SINV-1'
        return self

    def submit(self):
        self.submitted = True

    def as_dict(self):
        return self.__dict__

    def get(self, field, default=None):
        return getattr(self, field, default)

    def set_missing_values(self):
        return None

    def calculate_taxes_and_totals(self):
        return None


class StubStockEntryDoc(types.SimpleNamespace):
    def __init__(self, **kwargs):
        if kwargs.get("items") is None:
            kwargs["items"] = []
        super().__init__(**kwargs)
        self.insert_called = False
        self.submitted = False

    def insert(self, ignore_permissions=True):
        self.insert_called = True
        frappe = sys.modules.get("frappe")
        if frappe:
            entries = getattr(frappe, "created_stock_entries", None)
            if isinstance(entries, list):
                if not getattr(self, "name", None):
                    self.name = f"STE-{len(entries) + 1}"
                if self not in entries:
                    entries.append(self)
        return self

    def submit(self):
        self.submitted = True
        return self

    def get(self, field, default=None):
        return getattr(self, field, default)

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

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        if doctype == 'Restaurant Table':
            return 'F1'
        return 0

    frappe.db.get_value = get_value

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)

    assert result['name'] == 'SINV-1'
    assert result['items'][0]['description'] == 'Item 1\nNo onions'
    assert result['payments'][0]['mode_of_payment'] == 'Cash'
    assert result['payments'][0]['amount'] == 10
    assert ('POS Order', 'POS-1', 'sales_invoice', 'SINV-1') in frappe.db.set_calls


def test_generate_invoice_handles_string_amounts(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 1
            self.rate = '10'
            self.amount = '10'
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

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount='10')

    assert result['name'] == 'SINV-1'
    assert result['payments'][0]['amount'] == '10'


def test_generate_invoice_populates_bom_components(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 3
            self.rate = 15
            self.amount = 45
            self.notes = ''
            self.warehouse = None

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
        warehouse = 'MAIN-WH'
        imogi_mode = 'Counter'
        update_stock = 1

        def get(self, field, default=None):
            return getattr(self, field, default)

    profile = Profile()

    class InvoiceDoc(StubInvoiceDoc):
        pass

    class StockEntryDoc(StubStockEntryDoc):
        pass

    bom_doc = types.SimpleNamespace(
        quantity=2,
        items=[types.SimpleNamespace(item_code='COMP-1', qty=4)]
    )

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if doctype == 'BOM' and name == 'BOM-ITEM-1':
            return bom_doc
        if isinstance(doctype, dict):
            if doctype.get('doctype') == 'Stock Entry':
                return StockEntryDoc(**doctype)
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        if doctype == 'BOM':
            if isinstance(name, dict) and name.get('item') == 'ITEM-1':
                return 'BOM-ITEM-1'
            return None
        if doctype == 'Bin':
            if isinstance(name, dict):
                return 10
        return 0

    frappe.db.get_value = get_value

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=45)

    assert result['packed_items'][0]['parent_item'] == 'ITEM-1'
    assert result['packed_items'][0]['item_code'] == 'COMP-1'
    assert result['packed_items'][0]['warehouse'] == 'MAIN-WH'
    assert result['packed_items'][0]['qty'] == pytest.approx(6)

    assert len(frappe.created_stock_entries) == 1
    stock_entry = frappe.created_stock_entries[0]
    assert stock_entry.stock_entry_type == 'Material Consumption for Manufacture'

    component_row = next(
        row for row in stock_entry.items if row['item_code'] == 'COMP-1'
    )
    assert component_row['qty'] == pytest.approx(6)
    assert component_row['s_warehouse'] == 'MAIN-WH'
    assert all('t_warehouse' not in row for row in stock_entry.items)

    assert result['imogi_manufacture_entries'] == ['STE-1']

def test_generate_invoice_records_outstanding_amount(billing_module):
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

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=5)
    assert result['outstanding_amount'] == 5


def test_generate_invoice_handles_none_grand_total(billing_module):
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

    class InvoiceDoc(StubInvoiceDoc):
        grand_total = None
        def set_missing_values(self):
            return None
        def calculate_taxes_and_totals(self):
            return None

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)
    assert result['payments'][0]['amount'] == 10

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=5)
    assert result['outstanding_amount'] == 5


def test_generate_invoice_respects_payment_tolerance(billing_module):
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
        imogi_payment_tolerance = 0.05
        def get(self, field, default=None):
            return getattr(self, field, default)
    profile = Profile()

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=9.97)
    assert result['outstanding_amount'] == 0


def test_generate_invoice_runs_missing_value_hooks_for_bundles(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'BUNDLED-ITEM'
            self.item_name = 'Bundled Item'
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
        update_stock = 0

        def get(self, field, default=None):
            return getattr(self, field, default)

    profile = Profile()

    class InvoiceDoc(StubInvoiceDoc):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.set_missing_values_called = False
            self.calculate_taxes_called = False

        def set_missing_values(self):
            self.set_missing_values_called = True
            self.packed_items = [{'item_code': 'BUNDLE-COMP', 'qty': 1}]

        def calculate_taxes_and_totals(self):
            self.calculate_taxes_called = True

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Bundled Item'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)

    assert result['set_missing_values_called'] is True
    assert result['calculate_taxes_called'] is True
    assert result['packed_items'] == [{'item_code': 'BUNDLE-COMP', 'qty': 1}]

def test_generate_invoice_raises_on_insufficient_stock(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 5
            self.rate = 10
            self.amount = 50
            self.notes = ''

    order = types.SimpleNamespace(
        name='POS-1',
        branch='BR-1',
        pos_profile='P1',
        customer='CUST-1',
        order_type='Dine-in',
        table=None,
        items=[OrderItem()],
    )

    class Profile:
        imogi_mode = 'Counter'
        update_stock = 1

        def get(self, field, default=None):
            return getattr(self, field, default)

    profile = Profile()

    class InvoiceDoc(StubInvoiceDoc):
        def insert(self, ignore_permissions=True):
            for item in self.items:
                actual = frappe.db.get_value('Item', item['item_code'], 'actual_qty')
                if actual < item['qty']:
                    frappe.throw(
                        f"Insufficient stock for item {item['item_code']}",
                        frappe.ValidationError,
                    )
            return super().insert(ignore_permissions=ignore_permissions)

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def mock_get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
            if fieldname == 'actual_qty':
                return 2
        return 0

    original_get_value = frappe.db.get_value
    frappe.db.get_value = mock_get_value
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    try:
        with pytest.raises(frappe.ValidationError) as exc:
            billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=50)
        assert 'Insufficient stock' in str(exc.value)
    finally:
        frappe.db.get_value = original_get_value


def test_generate_invoice_requires_payment_details(billing_module):
    billing, frappe = billing_module
    with pytest.raises(frappe.ValidationError):
        billing.generate_invoice('POS-1')


def test_generate_invoice_requires_pos_order(billing_module):
    billing, frappe = billing_module
    with pytest.raises(frappe.ValidationError):
        billing.generate_invoice(None, mode_of_payment='Cash', amount=10)


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
        def get(self, field, default=None):
            return getattr(self, field, default)

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return BadInvoice(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        return 0

    frappe.db.get_value = get_value
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    with pytest.raises(Exception) as exc:
        billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)

    assert 'Failed to generate invoice' in str(exc.value)


def test_generate_invoice_validates_sales_item_strict(billing_module):
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

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            raise AssertionError('Invoice should not be created')
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 0
        return 0

    frappe.db.get_value = get_value

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    with pytest.raises(frappe.ValidationError) as exc:
        billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)

    assert 'ITEM-1' in str(exc.value)


def test_generate_invoice_skips_non_sales_items_when_allowed(billing_module):
    billing, frappe = billing_module

    class OrderItem:
        def __init__(self, code, name='Item'):
            self.item = code
            self.item_name = name
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
        items=[OrderItem('ITEM-1', 'Item 1'), OrderItem('ITEM-2', 'Item 2')]
    )

    class Profile:
        imogi_mode = 'Counter'
        imogi_allow_non_sales_items = 1
        def get(self, field, default=None):
            return getattr(self, field, default)
    profile = Profile()

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value_with_item(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1' if name == 'ITEM-1' else 'Item 2'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1 if name == 'ITEM-1' else 0
        if doctype == 'Restaurant Table':
            return 'F1'
        return 0

    frappe.db.get_value = get_value_with_item

    billing.validate_pos_session = lambda profile: 'SESSION-1'

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)
    assert len(result['items']) == 1
    assert result['items'][0]['item_code'] == 'ITEM-1'


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
    frappe.db.get_value = lambda doctype, name=None, fieldname=None: 'Item 1' if doctype == 'Item' and fieldname == 'item_name' else 0
    billing.validate_pos_session = lambda profile: 'SESSION-1'

    draft = billing.prepare_invoice_draft('POS-1')

    assert draft['items'][0]['description'] == 'Item 1\nNo onions'
    assert draft['items'][0]['has_notes'] is True


def test_notify_stock_update_publishes_item_and_packed_updates(billing_module):
    billing, frappe = billing_module

    calls = []
    frappe.publish_realtime = lambda event, data: calls.append((event, data))

    class ProfileDoc:
        warehouse = 'MAIN-WH'

        def get(self, field, default=None):
            return getattr(self, field, default)

    profile_doc = ProfileDoc()

    invoice_doc = types.SimpleNamespace(
        items=[types.SimpleNamespace(item_code='ITEM-1'), {'item_code': 'ITEM-2'}],
        packed_items=[types.SimpleNamespace(item_code='ITEM-1-A'), {'item_code': 'ITEM-2-B'}],
    )

    original_get_value = frappe.db.get_value

    def get_value(doctype, filters=None, fieldname=None):
        if doctype == 'Bin':
            item_code = filters.get('item_code') if isinstance(filters, dict) else None
            stock_map = {
                'ITEM-1': 5,
                'ITEM-2': 3,
                'ITEM-1-A': 2,
                'ITEM-2-B': 7,
            }
            return stock_map.get(item_code, 0)
        return original_get_value(doctype, filters, fieldname)

    frappe.db.get_value = get_value

    try:
        billing.notify_stock_update(invoice_doc, profile_doc)
    finally:
        frappe.db.get_value = original_get_value

    assert len(calls) == 4
    payloads = {data['item_code']: data for _, data in calls}
    assert payloads['ITEM-1']['actual_qty'] == 5
    assert payloads['ITEM-2']['actual_qty'] == 3
    assert payloads['ITEM-1-A']['actual_qty'] == 2
    assert payloads['ITEM-2-B']['actual_qty'] == 7
    for data in payloads.values():
        assert data['warehouse'] == 'MAIN-WH'


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

    class InvoiceDoc(StubInvoiceDoc):
        pass

    def get_doc(doctype, name=None):
        if doctype == 'POS Order':
            return order
        if doctype == 'POS Profile':
            return profile
        if isinstance(doctype, dict):
            return InvoiceDoc(**doctype)
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc
    def get_value2(doctype, name=None, fieldname=None):
        if doctype == 'Item':
            if fieldname == 'item_name':
                return 'Item 1'
            if fieldname == 'has_variants':
                return 0
            if fieldname == 'is_sales_item':
                return 1
        if doctype == 'Restaurant Table':
            return 'F1'
        return 0

    frappe.db.get_value = get_value2

    frappe.db.exists_map[("DocType", "POS Session")] = False

    result = billing.generate_invoice('POS-1', mode_of_payment='Cash', amount=10)

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


def test_list_orders_for_cashier_includes_queue_number(billing_module):
    billing, frappe = billing_module

    def get_all(doctype, filters=None, fields=None, order_by=None):
        if doctype == 'POS Order':
            assert 'queue_number' in fields
            return [{
                'name': 'POS-1',
                'customer': 'CUST-1',
                'order_type': 'Dine-in',
                'table': 'T1',
                'queue_number': 7,
                'workflow_state': 'Ready',
                'discount_percent': 0,
                'discount_amount': 0,
                'promo_code': None,
                'totals': 10,
                'creation': '2023-01-01 00:00:00',
            }]
        if doctype == 'POS Order Item':
            return [{
                'item': 'ITEM-1',
                'qty': 1,
                'rate': 10,
                'amount': 10,
                'notes': ''
            }]
        return []

    frappe.get_all = get_all

    def get_value(doctype, name=None, fieldname=None, as_dict=False):
        if doctype == 'Customer' and fieldname == 'customer_name':
            return 'Test Customer'
        if doctype == 'Item' and as_dict:
            return {'item_name': 'Item 1', 'image': None}
        return None

    frappe.db.get_value = get_value

    orders = billing.list_orders_for_cashier(branch='BR-1')
    assert orders[0]['queue_number'] == 7


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


def test_request_payment_requires_sales_invoice(billing_module):
    billing, frappe = billing_module

    with pytest.raises(frappe.ValidationError) as exc:
        billing.request_payment(None)

    assert 'Missing Sales Invoice' in str(exc.value)


def test_build_invoice_items_adds_customization_fields(billing_module):
    billing, frappe = billing_module

    class Row(types.SimpleNamespace):
        pass

    item_doc = types.SimpleNamespace(
        item_size_options=[Row(option_name="Large", additional_price=1)],
        item_spice_options=[],
        item_topping_options=[Row(option_name="Cheese", additional_price=2)],
        item_variant_options=[Row(option_name="Vanilla", additional_price=3)],
        item_sugar_options=[Row(option_name="Less", additional_price=1)],
        item_ice_options=[Row(option_name="No Ice", additional_price=0)],
    )
    frappe.get_cached_doc = lambda doctype, name: item_doc

    class OrderItem:
        def __init__(self):
            self.item = 'ITEM-1'
            self.item_name = 'Item 1'
            self.qty = 1
            self.rate = 13
            self.amount = 13
            self.item_options = {
                "size": {"name": "Large"},
                "toppings": [{"name": "Cheese"}],
                "variant": {"name": "Vanilla"},
                "sugar": {"name": "Less"},
                "ice": {"name": "No Ice"},
            }
            self.notes = ''

    order = types.SimpleNamespace(items=[OrderItem()])
    items = billing.build_invoice_items(order, mode="Counter")

    assert items[0]["pos_customizations_delta"] == 7
    assert items[0]["pos_customizations"] == {
        "size": ["Large"],
        "toppings": ["Cheese"],
        "variant": ["Vanilla"],
        "sugar": ["Less"],
        "ice": ["No Ice"],
    }
    assert "Size: Large" in items[0]["pos_display_details"]
    assert "Toppings: Cheese" in items[0]["pos_display_details"]
    assert "Variant: Vanilla" in items[0]["pos_display_details"]
    assert "Sugar: Less" in items[0]["pos_display_details"]
    assert "Ice: No Ice" in items[0]["pos_display_details"]
