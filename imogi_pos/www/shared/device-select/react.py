import frappe
from imogi_pos.utils.react_helpers import add_react_context
from imogi_pos.utils.error_pages import set_setup_error


def get_context(context):
    """Provide context data for the device select React app."""
    try:
        context.title = "Select Device"
        
        # Add React bundle URLs and initial state
        add_react_context(context, 'device-select')
        
        return context
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Device Select Page Error")
        set_setup_error(context, "general", page_name="Device Select")
        return context
