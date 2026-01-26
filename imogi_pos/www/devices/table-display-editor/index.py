import frappe
from frappe import _


def get_context(context):
    """
    DEPRECATED: This path has been moved to /table_layout_editor
    
    Redirect to new React-based Table Layout Editor
    """
    # Force redirect to new implementation
    frappe.local.flags.redirect_location = '/table_layout_editor'
    raise frappe.Redirect
