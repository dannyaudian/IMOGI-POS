import json
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

    # Frappe v15 get_desktop_page expects page as JSON string with "name" key.
    # If page is a plain string workspace name, wrap it in JSON.
    # If page is empty, fall back to user's default workspace.
    if not page:
        default_workspace = frappe.defaults.get_user_default("workspace") or "Home"
        page = json.dumps({"name": default_workspace})
    elif not page.strip().startswith("{"):
        # Plain string name — wrap it
        page = json.dumps({"name": page})

    return frappe_get_desktop_page(page)
