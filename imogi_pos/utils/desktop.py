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

    # Frappe v15 get_desktop_page requires page argument (JSON string of workspace).
    # Fall back to empty JSON object so Frappe loads the default workspace.
    if not page:
        page = "{}"

    return frappe_get_desktop_page(page)
