import frappe
from frappe import _
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context

# Prevent Frappe from caching this page
no_cache = 1

def get_context(context):
    """Minimal SSR context for React app bootstrap.
    
    BEST PRACTICE: Keep get_context() lightweight
    - Only authentication check
    - Minimal branding for page chrome
    - React bundle URLs
    - Let React fetch data after mount (better performance, loading states)
    """
    user = frappe.session.user
    
    # Redirect if not logged in
    if not user or user == 'Guest':
        frappe.local.response['type'] = 'redirect'
        frappe.local.response['location'] = '/login?redirect-to=/shared/module-select'
        return
    
    # Lightweight branding (logo, colors only)
    branding = get_brand_context()
    
    # Set page metadata
    context.title = _("Select Module")
    context.branding = branding
    
    # Add React bundle URLs + minimal bootstrap data
    # React will fetch modules/profiles via API after mount
    add_react_context(context, 'module-select', {
        'user': user,
        'csrf_token': frappe.session.data.csrf_token
    })
    
    return context
