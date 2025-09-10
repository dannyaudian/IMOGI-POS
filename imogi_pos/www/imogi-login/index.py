import frappe
from imogi_pos.utils.branding import get_brand_context


def get_context(context):
    """Provide context data for the login page.

    Users accessing the kiosk must have the Cashier role.
    """
    context.title = "IMOGI POS Login"
    context.branding = get_brand_context()
    return context
