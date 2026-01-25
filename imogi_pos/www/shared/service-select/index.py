import frappe\nfrom frappe import _\nfrom imogi_pos.utils.branding import get_brand_context\nfrom imogi_pos.utils.react_helpers import add_react_context\nfrom imogi_pos.utils.error_pages import set_setup_error\nfrom imogi_pos.utils.auth_decorators import require_roles\n\n\n@require_roles("Cashier", "Branch Manager", "System Manager")\ndef get_context(context):
    """Context builder for Select Service page."""
    try:
        # Get branding info
        branding = get_brand_context()
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Select Service")
        
        # Add React bundle URLs and initial state (auto-loads from manifest.json)
        add_react_context(context, 'service-select', {
            'branding': branding
        })

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in shared_service-select get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Select Service"))
        context.title = _("Select Service")
        return context
