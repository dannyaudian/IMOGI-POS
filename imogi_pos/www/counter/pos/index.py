import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context
from imogi_pos.utils.error_pages import set_setup_error
from imogi_pos.utils.auth_decorators import require_roles


@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    """Context builder for Cashier Console page."""
    try:
        # Get branding info
        branding = get_brand_context()
        
        # Resolve POS Profile via centralized resolver (authoritative)
        from imogi_pos.utils.pos_profile_resolver import resolve_pos_profile

        resolution = resolve_pos_profile(
            user=frappe.session.user,
            last_used=frappe.form_dict.get('last_used'),
            requested=frappe.form_dict.get('pos_profile')
        )
        pos_profile = resolution.get("selected")
        
        # Get POS Profile details including mode
        pos_mode = "Counter"  # Default
        branch = None
        
        if pos_profile:
            profile_details = frappe.get_cached_doc("POS Profile", pos_profile)
            pos_mode = profile_details.get("imogi_mode") or "Counter"
            branch = profile_details.get("imogi_branch")
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Cashier Console")
        
        # Add React bundle URLs and initial state (auto-loads from manifest.json)
        add_react_context(context, 'cashier-console', {
            'branding': branding,
            'pos_profile': pos_profile,
            'pos_mode': pos_mode,
            'branch': branch,
            'pos_profile_resolution': resolution
        })

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in counter_pos get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Cashier Console"))
        context.title = _("Cashier Console")
        return context
