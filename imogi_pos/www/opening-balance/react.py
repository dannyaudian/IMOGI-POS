import frappe
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context


def get_context(context):
    """Provide context data for the opening balance React app."""
    context.title = "Opening Balance"
    context.branding = get_brand_context()
    
    # Get device and next params from query
    device = frappe.form_dict.get('device', 'kiosk')
    next_url = frappe.form_dict.get('next', '/service-select')
    
    # Add React bundle URLs and initial state
    add_react_context(context, 'opening-balance', {
        'device': device,
        'nextUrl': next_url,
        'branding': context.branding
    })
    
    return context
