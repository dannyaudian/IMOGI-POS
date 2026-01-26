import frappe
from frappe import _


def get_context(context):
    """
    DEPRECATED: This path has been moved to /customer_display_editor
    
    Redirect to new React-based Customer Display Editor
    """
    # Force redirect to new implementation
    frappe.local.flags.redirect_location = '/customer_display_editor'
    raise frappe.Redirect
