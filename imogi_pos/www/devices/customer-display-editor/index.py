import frappe
from frappe import _


def get_context(context):
    """
    Build page context for customer display editor
    """
    # Check if user is logged in
    if frappe.session.user == 'Guest':
        frappe.throw(_('Login required'), frappe.PermissionError)
    
    # Check if user has permission to access customer display editor
    if not frappe.has_permission('Customer Display Device', 'read'):
        frappe.throw(_('Not permitted to access Customer Display Editor'), frappe.PermissionError)
    
    # Add basic context
    context.update({
        'title': 'Customer Display Editor',
        'page_title': 'Customer Display Editor',
        'no_breadcrumbs': True,
        'show_sidebar': False
    })
    
    return context
