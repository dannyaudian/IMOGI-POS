import frappe
from frappe.desk.desktop import get_desktop_page as frappe_get_desktop_page


@frappe.whitelist()
def get_desktop_page(page=None, **kwargs):
    if not page:
        page = (
            frappe.form_dict.get("page")
            or frappe.form_dict.get("workspace")
            or frappe.form_dict.get("name")
        )

    if not page:
        page = frappe.defaults.get_user_default("workspace") or "Home"

    return frappe_get_desktop_page(page)
