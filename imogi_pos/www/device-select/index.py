import frappe
from frappe import _


def get_context(context):
    """Ensure user is logged in with Cashier role."""
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/imogi-login?redirect=/device-select"
        raise frappe.Redirect

    if "Cashier" not in frappe.get_roles():
        frappe.throw(_("Access denied: Cashier role required"))

    return context
