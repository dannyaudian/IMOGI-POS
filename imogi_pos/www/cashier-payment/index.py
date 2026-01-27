import frappe

no_cache = 1

def get_context(context):
    """
    Cashier Payment - DEPRECATED
    
    This module has been merged into Cashier Console (/counter/pos).
    This handler now redirects to /counter/pos with appropriate filter.
    
    IMPORTANT: Now uses centralized operational context.
    - No longer embeds pos_profile in redirect URL
    - Context managed server-side via operational_context module
    """
    context.no_cache = 1
    
    # Check if user is logged in
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/login'
        raise frappe.Redirect
    
    # Use operational context (authoritative)
    from imogi_pos.utils.operational_context import (
        get_active_operational_context,
        resolve_operational_context,
        set_active_operational_context
    )

    active_context = get_active_operational_context(
        user=frappe.session.user,
        auto_resolve=False
    )
    resolved = resolve_operational_context(
        user=frappe.session.user,
        requested_profile=active_context.get("pos_profile") if active_context else None
    )
    
    pos_profile = resolved.get("current_pos_profile")
    
    # If profile was resolved, store it in session
    if pos_profile:
        set_active_operational_context(
            user=frappe.session.user,
            pos_profile=pos_profile,
            branch=resolved.get("current_branch")
        )
    
    # Redirect to /counter/pos with filter=pending (NO pos_profile in URL)
    redirect_url = '/counter/pos?filter=pending'
    
    frappe.local.flags.redirect_location = redirect_url
    raise frappe.Redirect
