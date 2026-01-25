import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context
from imogi_pos.utils.error_pages import set_setup_error
from imogi_pos.utils.auth_decorators import require_roles


def get_context(context):
    """Context builder for Module Select page."""
    try:
        user = frappe.session.user
        
        # Redirect if not logged in
        if not user or user == 'Guest':
            frappe.local.response['type'] = 'redirect'
            frappe.local.response['location'] = '/imogi-login?next=/module-select'
            return
        
        # Get branding info
        branding = get_brand_context()
        
        # Get user's available modules
        from imogi_pos.api.module_select import get_available_modules, get_user_branch_info
        
        try:
            modules_data = frappe.call(
                'imogi_pos.api.module_select.get_available_modules',
                async_execution=False
            )
            branch_data = frappe.call(
                'imogi_pos.api.module_select.get_user_branch_info',
                async_execution=False
            )
        except:
            modules_data = {'message': {'modules': []}}
            branch_data = {'message': {'current_branch': None, 'available_branches': []}}
        
        context.setup_error = False
        context.branding = branding
        context.title = _("Select Module")
        
        # Add React bundle URLs and initial state
        add_react_context(context, 'module-select', {
            'branding': branding,
            'user': user,
            'modules': modules_data.get('message', {}).get('modules', []),
            'branch': branch_data.get('message', {}).get('current_branch'),
            'available_branches': branch_data.get('message', {}).get('available_branches', [])
        })
        
        return context
    
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in module_select get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Select Module"))
        context.title = _("Select Module")
        return context
