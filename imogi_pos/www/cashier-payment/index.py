import frappe

no_cache = 1

def get_context(context):
    """
    Cashier Payment - DEPRECATED
    
    This module has been merged into Cashier Console (/counter/pos).
    This handler now redirects to /counter/pos with appropriate filter.
    """
    context.no_cache = 1
    
    # Check if user is logged in
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/login'
        raise frappe.Redirect
    
    # Get user's default POS Profile
    pos_profile = None
    if frappe.db.has_column('User', 'imogi_default_pos_profile'):
        pos_profile = frappe.db.get_value('User', frappe.session.user, 'imogi_default_pos_profile')
    
    if not pos_profile:
        pos_profile = frappe.defaults.get_user_default("imogi_pos_profile")
    
    # Redirect to /counter/pos with filter=pending query param
    redirect_url = '/counter/pos?filter=pending'
    if pos_profile:
        redirect_url += f'&pos_profile={pos_profile}'
    
    frappe.local.flags.redirect_location = redirect_url
    raise frappe.Redirect
