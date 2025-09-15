import importlib, sys, types


def load_billing():
    sys.path.insert(0, '.')

    utils = types.ModuleType('frappe.utils')
    utils.now_datetime = lambda: None
    utils.cint = int
    utils.add_to_date = lambda *a, **k: None
    utils.get_url = lambda *a, **k: 'http://test'
    utils.flt = float

    frappe = types.ModuleType('frappe')
    frappe.utils = utils
    frappe._ = lambda x: x
    frappe.db = types.SimpleNamespace(get_value=lambda *a, **k: 'Item Name')
    realtime = types.ModuleType('frappe.realtime')
    realtime.publish_realtime = lambda *a, **k: None
    frappe.realtime = realtime
    frappe.whitelist = lambda *a, **kw: (lambda f: f)
    frappe.has_permission = lambda *a, **k: True
    frappe.throw = lambda msg, exc=None: (_ for _ in ()).throw((exc or Exception)(msg))
    
    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils
    sys.modules['frappe.realtime'] = realtime

    mod = importlib.import_module('imogi_pos.api.billing')
    importlib.reload(mod)
    return mod


def unload_billing():
    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.modules.pop('imogi_pos.api.billing', None)
    if sys.path[0] == '.':
        sys.path.pop(0)


def test_build_invoice_items_applies_customization_delta():
    billing = load_billing()
    item = types.SimpleNamespace(
        item='ITEM-1',
        item_name='Item 1',
        qty=2,
        rate=10,
        amount=20,
        pos_customizations_delta=5,
    )
    order_doc = types.SimpleNamespace(items=[item])
    result = billing.build_invoice_items(order_doc, mode='Counter')
    unload_billing()

    assert result[0]['amount'] == 25
    assert result[0]['rate'] == 12.5
