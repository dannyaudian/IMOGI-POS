import frappe
from frappe import _
from imogi_pos.utils.auth_decorators import require_roles
from imogi_pos.utils.error_pages import set_setup_error


@require_roles("Cashier")
def get_context(context):
    """Ensure user is logged in with Cashier role."""
    context.setup_error = False
    return context
