import frappe
from frappe.desk.desktop import get_desktop_page as frappe_get_desktop_page


@frappe.whitelist()
def get_desktop_page(page=None, **kwargs):
    if not page:
        page = (
            frappe.form_dict.get("page")
            or frappe.form_dict.get("workspace")
            or frappe.form_dict.get("name")
        ) or None

    # Frappe v15 get_desktop_page expects page as JSON string.
    # If page is None or empty, let Frappe handle it natively.
    if not page:
        return frappe_get_desktop_page()

    return frappe_get_desktop_page(page)
