import frappe
from frappe import _


def get_context(context):
    """
    Build page context for table display editor
    """
    # Check if user is logged in
    if frappe.session.user == 'Guest':
        frappe.throw(_('Login required'), frappe.PermissionError)
    
    # Check if user has permission to access table display editor
    if not frappe.has_permission('Restaurant Table Display', 'read'):
        frappe.throw(_('Not permitted to access Table Display Editor'), frappe.PermissionError)
    
    # Add basic context
    context.update({
        'title': 'Table Display Editor',
        'page_title': 'Table Display Editor',
        'no_breadcrumbs': True,
        'show_sidebar': False
    })
    
    return context
