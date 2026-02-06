import importlib
import sys
import types

import pytest


@pytest.fixture
def public_module():
    import os
    sys.path.insert(0, os.getcwd())
    utils = types.ModuleType("frappe.utils")
    utils.now = lambda: "now"
    utils.nowdate = lambda: "today"
    utils.get_url = lambda path=None: f"http://test/{path}" if path else "http://test"
    utils.flt = float

    frappe = types.ModuleType("frappe")

    class DoesNotExistError(Exception):
        pass

    frappe.DoesNotExistError = DoesNotExistError
    frappe._ = lambda x: x
    def whitelist(*args, **kwargs):
        def inner(fn):
            return fn
        return inner
    frappe.whitelist = whitelist

    class Defaults:
        def get_global_default(self, key):
            if key == "company":
                return "Default Co"
            return None

    frappe.defaults = Defaults()
    frappe.get_app_version = lambda app: "1.0"
    frappe.get_value = lambda doctype, name, fieldname: "/company_logo.png"
    log_messages = []
    frappe.log_error = log_messages.append
    frappe.utils = utils

    sys.modules["frappe"] = frappe
    sys.modules["frappe.utils"] = utils

    # Reload the target module with our stubbed frappe
    public = importlib.import_module("imogi_pos.api.public")
    importlib.reload(public)

    yield public, frappe, log_messages

    # Cleanup
    sys.modules.pop("frappe", None)
    sys.modules.pop("frappe.utils", None)
    sys.modules.pop("imogi_pos.api.public", None)
    sys.modules.pop("imogi_pos", None)

def test_get_branding_from_pos_profile(public_module):
    public, frappe, log = public_module
    log.clear()

    class Profile:
        imogi_brand_name = "Profile Brand"
        imogi_brand_logo = "logo.png"
        imogi_brand_logo_dark = "logo-dark.png"
        imogi_brand_color_primary = "#111111"
        imogi_brand_color_accent = "#222222"
        imogi_brand_header_bg = "#333333"
        imogi_show_header_on_pages = False
        imogi_brand_home_url = "http://home"
        imogi_brand_css_vars = "--primary: #111111;"

        def get(self, field):
            return getattr(self, field, None)

    def get_doc(doctype, name=None):
        if doctype == "POS Profile":
            return Profile()
        raise frappe.DoesNotExistError

    frappe.get_doc = get_doc

    result = public.get_branding("POS-1")

    assert result["brand_name"] == "Profile Brand"
    assert result["logo"] == "http://test/logo.png"
    assert result["logo_dark"] == "http://test/logo-dark.png"
    assert result["primary_color"] == "#111111"
    assert result["accent_color"] == "#222222"
    assert result["header_bg"] == "#333333"
    assert result["show_header"] is False
    assert result["home_url"] == "http://home"
    assert result["css_vars"] == "--primary: #111111;"
    assert log == []


def test_get_branding_no_profile(public_module):
    public, frappe, log = public_module
    log.clear()

    def get_doc(doctype, name=None):
        raise frappe.DoesNotExistError

    frappe.get_doc = get_doc

    result = public.get_branding()

    assert result["logo"] == "/company_logo.png"
    assert log == []
