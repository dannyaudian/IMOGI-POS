import frappe
from frappe import _
from imogi_pos.utils.error_pages import set_setup_error


def get_context(context):
    """Ensure user is logged in with Cashier role."""
    context.setup_error = False
    
    if frappe.session.user == "Guest":
        raise frappe.Redirect("/imogi-login?redirect=/device-select")

    if "Cashier" not in frappe.get_roles():
        set_setup_error(
            context,
            error_type="permission",
            error_message=_("You need the Cashier role to access this page."),
            page_name=_("Device Selection")
        )
        return context

    return context
