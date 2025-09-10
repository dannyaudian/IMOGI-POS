import importlib
import sys
import types
import datetime
import pytest


@pytest.fixture
def printing_module():
    sys.path.insert(0, '.')

    utils = types.ModuleType("frappe.utils")
    utils.now_datetime = lambda: datetime.datetime(2023, 1, 1, 0, 0, 0)
    utils.cint = int
    utils.get_url = lambda path=None: path or ""

    frappe = types.ModuleType("frappe")
    frappe.utils = utils

    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner

    frappe.whitelist = whitelist
    frappe._ = lambda x: x
    frappe.log_error = lambda *a, **k: None

    class DB:
        def get_single_value(self, doctype, fieldname):
            return None

    frappe.db = DB()
    frappe.get_app_path = lambda *a: "/does/not/exist"

    sys.modules['frappe'] = frappe
    sys.modules['frappe.utils'] = utils

    printing = importlib.import_module('imogi_pos.api.printing')
    importlib.reload(printing)

    yield printing

    sys.modules.pop('imogi_pos.api.printing', None)
    sys.modules.pop('imogi_pos', None)
    sys.modules.pop('frappe', None)
    sys.modules.pop('frappe.utils', None)
    sys.path.pop(0)


def test_print_queue_ticket_returns_success(printing_module, monkeypatch):
    printing = printing_module
    monkeypatch.setattr(printing, 'get_print_adapter_settings', lambda *a, **k: {'interface': 'OS', 'adapter_config': {}})

    called = {}
    print_utils = types.ModuleType('imogi_pos.utils.printing')

    def fake_print_document(html, interface, config):
        called['html'] = html
        called['interface'] = interface
        called['config'] = config
        return {'success': True}

    print_utils.print_document = fake_print_document
    sys.modules['imogi_pos.utils.printing'] = print_utils
    monkeypatch.setattr(printing.os.path, 'exists', lambda p: False)

    resp = printing.print_queue_ticket('Q001')
    assert resp['success'] is True
    assert resp['queue_no'] == 'Q001'


def test_print_queue_ticket_requires_queue_no(printing_module):
    printing = printing_module
    with pytest.raises(TypeError) as exc:
        printing.print_queue_ticket()
    assert 'queue_no' in str(exc.value)
