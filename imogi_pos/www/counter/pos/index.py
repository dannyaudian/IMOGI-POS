import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context
from imogi_pos.utils.error_pages import set_setup_error
from imogi_pos.utils.auth_decorators import require_roles


@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    """Context builder for Cashier Console page.
    
    IMPORTANT: Now uses centralized operational context.
    - No longer reads pos_profile from URL parameters
    - Context managed server-side via operational_context module
    - Backward compatible: accepts URL param as one-time request
    """
    try:
        # Get branding info
        branding = get_brand_context()
        
        # Use operational context (authoritative)
        from imogi_pos.utils.operational_context import (
            resolve_operational_context,
            set_active_operational_context
        )
        
        # Handle backward compatibility: URL param as one-time request
        requested_profile = frappe.form_dict.get('pos_profile')
        
        # Resolve operational context
        resolved = resolve_operational_context(
            user=frappe.session.user,
            requested_profile=requested_profile
        )
        
        pos_profile = resolved.get("current_pos_profile")
        branch = resolved.get("current_branch")
        
        # If profile was resolved, store it in session
        if pos_profile:
            set_active_operational_context(
                user=frappe.session.user,
                pos_profile=pos_profile,
                branch=branch
            )
        
        # Get POS Profile details including mode
        pos_mode = "Counter"  # Default
        
        if pos_profile:
            profile_details = frappe.get_cached_doc("POS Profile", pos_profile)
            pos_mode = profile_details.get("imogi_mode") or "Counter"
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Cashier Console")
        
        # Add React bundle URLs and initial state (auto-loads from manifest.json)
        add_react_context(context, 'cashier-console', {
            'branding': branding,
            'pos_profile': pos_profile,
            'pos_mode': pos_mode,
            'branch': branch,
            'operational_context': resolved
        })

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in counter_pos get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Cashier Console"))
        context.title = _("Cashier Console")
        return context
