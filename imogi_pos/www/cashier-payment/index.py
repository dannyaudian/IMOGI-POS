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
    
    # Resolve POS Profile via centralized resolver (DefaultValue is not used)
    from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

    resolution = resolve_pos_profile(
        user=frappe.session.user,
        last_used=frappe.form_dict.get('last_used'),
        requested=frappe.form_dict.get('pos_profile')
    )
    pos_profile = resolution.get('selected')
    
    # Redirect to /counter/pos with filter=pending query param
    redirect_url = '/counter/pos?filter=pending'
    if pos_profile:
        redirect_url += f'&pos_profile={pos_profile}'
    
    frappe.local.flags.redirect_location = redirect_url
    raise frappe.Redirect
