import importlib
import sys
import types
import datetime
import pytest


class MockRow(dict):
    def __getattr__(self, item):
        return self.get(item)

    def __setattr__(self, key, value):
        self[key] = value


@pytest.fixture
def variants_module():
    sys.path.insert(0, '.')

    utils = types.ModuleType("frappe.utils")
    utils.cint = int
    utils.flt = float
    utils.now_datetime = lambda: datetime.datetime(2023, 1, 1, 0, 0, 0)
    utils.add_to_date = lambda dt, **kw: dt
    utils.get_url = lambda path=None: path or ""
    utils.cstr = str

    frappe = types.ModuleType("frappe")

    class FrappeException(Exception):
        pass

    frappe.ValidationError = FrappeException
    frappe.PermissionError = FrappeException
    frappe._ = lambda msg: msg

    def throw(msg, exc=None):
        raise (exc or Exception)(msg)

    frappe.throw = throw
    frappe.has_permission = lambda *args, **kwargs: True
    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner
    frappe.whitelist = whitelist
    frappe.log_error = lambda *args, **kwargs: None
    frappe.session = types.SimpleNamespace(user="test-user")
    frappe.local = types.SimpleNamespace(request_ip="test-device")
    frappe.realtime = types.SimpleNamespace(publish_realtime=lambda *a, **k: None)
    frappe.publish_realtime = frappe.realtime.publish_realtime

    frappe.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: 0,
        exists=lambda *args, **kwargs: False,
        has_column=lambda *args, **kwargs: False,
    )

    frappe._mock_data = {}
    frappe.MockRow = MockRow

    def get_all(doctype, filters=None, fields=None, limit_page_length=None, pluck=None):
        rows = list(frappe._mock_data.get(doctype, []))

        if doctype == "Item":
            return rows[:limit_page_length] if limit_page_length else rows

        if doctype == "Item Group":
            if filters and isinstance(filters, dict):
                allowed = set()
                condition = filters.get("name")
                if isinstance(condition, list) and len(condition) > 1:
                    allowed = set(condition[1] or [])
                if allowed:
                    rows = [row for row in rows if row.name in allowed]
            return rows

        if doctype == "Bin":
            result = []
            for row in rows:
                match = True
                if filters:
                    for key, condition in filters.items():
                        if isinstance(condition, list):
                            op, values = condition[0], condition[1]
                            if op == "in" and row.get(key) not in values:
                                match = False
                                break
                        else:
                            if row.get(key) != condition:
                                match = False
                                break
                if match:
                    result.append(row)
            return result

        if pluck and rows:
            return [row.get(pluck) for row in rows]

        return rows

    frappe.get_all = get_all
    frappe.get_doc = lambda *args, **kwargs: None

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils
    sys.modules['frappe.realtime'] = frappe.realtime

    pricing = types.ModuleType("imogi_pos.api.pricing")

    def get_price_list_rate_maps(*args, **kwargs):
        return {
            "price_list_rates": {},
            "price_list_currencies": {},
            "base_price_list_rates": {},
            "base_price_list_currencies": {},
        }

    pricing.get_price_list_rate_maps = get_price_list_rate_maps
    sys.modules['imogi_pos.api.pricing'] = pricing

    billing = importlib.import_module('imogi_pos.api.billing')
    importlib.reload(billing)

    variants = importlib.import_module('imogi_pos.api.variants')
    importlib.reload(variants)

    yield variants, frappe, billing

    sys.modules.pop('imogi_pos.api.variants', None)
    sys.modules.pop('imogi_pos.api.pricing', None)
    sys.modules.pop('imogi_pos.api.billing', None)
    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('frappe.realtime', None)
    sys.path.pop(0)


def test_get_items_with_stock_limits_by_bom_capacity(variants_module):
    variants, frappe, billing = variants_module

    component_stock = 2
    finished_stock = 0
    sale_stock = 5

    frappe._mock_data['Item'] = [
        MockRow({
            'name': 'ITEM-1',
            'item_name': 'Item 1',
            'item_code': 'ITEM-1',
            'description': '',
            'image': None,
            'standard_rate': 10,
            'has_variants': 0,
            'variant_of': None,
            'item_group': 'Beverages',
            'menu_category': 'Drinks',
            'photo': None,
            'default_kitchen': None,
            'default_kitchen_station': None,
            'pos_menu_profile': None,
        })
    ]

    frappe._mock_data['Item Group'] = [
        MockRow({'name': 'Beverages', 'default_pos_menu_profile': None})
    ]

    frappe._mock_data['Bin'] = [
        MockRow({'item_code': 'ITEM-1', 'warehouse': 'POS-WH', 'actual_qty': sale_stock})
    ]

    bom_doc = types.SimpleNamespace(
        quantity=1,
        fg_warehouse='FG-WH',
        items=[MockRow({'item_code': 'COMP-1', 'qty': 2, 'source_warehouse': 'RM-WH'})],
    )

    def get_doc(doctype, name=None):
        if doctype == 'BOM' and name == 'BOM-ITEM-1':
            return bom_doc
        raise Exception('Unexpected doctype')

    frappe.get_doc = get_doc

    def get_value(doctype, name=None, fieldname=None):
        if doctype == 'BOM':
            if isinstance(name, dict) and name.get('item') == 'ITEM-1':
                return 'BOM-ITEM-1'
            return None
        if doctype == 'Bin':
            if isinstance(name, dict):
                if name.get('item_code') == 'COMP-1':
                    return component_stock
                if name.get('item_code') == 'ITEM-1' and name.get('warehouse') == 'FG-WH':
                    return finished_stock
        return 0

    frappe.db.get_value = get_value

    result = variants.get_items_with_stock(warehouse='POS-WH', limit=10)

    assert result[0]['actual_qty'] == pytest.approx(1)

