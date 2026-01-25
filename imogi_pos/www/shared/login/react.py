import frappe
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.react_helpers import add_react_context


def get_context(context):
    """Provide context data for the login React app."""
    context.title = "IMOGI POS Login"
    context.branding = get_brand_context()
    
    # Add React bundle URLs and initial state
    add_react_context(context, 'login', {
        'branding': context.branding
    })
    
    return context
