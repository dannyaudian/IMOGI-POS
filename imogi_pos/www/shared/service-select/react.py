import frappe
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context


def get_context(context):
    """Provide context data for the service select React app."""
    context.title = "Select Service"
    context.branding = get_brand_context()
    
    # Add React bundle URLs and initial state
    add_react_context(context, 'service-select', {
        'branding': context.branding
    })
    
    return context
