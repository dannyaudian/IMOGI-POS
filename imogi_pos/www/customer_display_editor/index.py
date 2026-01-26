import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.auth_decorators import require_roles
from imogi_pos.utils.auth_helpers import get_active_branch
from imogi_pos.utils.error_pages import set_setup_error
from imogi_pos.utils.react_helpers import add_react_context


@require_roles("Branch Manager", "System Manager")
def get_context(context):
    """Context builder for customer display editor page."""
    try:
        # Get branding info (no POS Profile needed for editor)
        branding = get_brand_context()
        
        # Get branch from user default
        branch = get_active_branch()
        
        context.setup_error = False
        context.branding = branding
        context.branch = branch
        context.title = _("Customer Display Editor")
        
        # Add React bundle URLs and initial state (auto-loads from manifest.json)
        add_react_context(context, 'customer-display-editor', {
            'branch': branch,
            'branding': branding
        })

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in customer_display_editor get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Customer Display Editor"))
        context.title = _("Customer Display Editor")
        return context
