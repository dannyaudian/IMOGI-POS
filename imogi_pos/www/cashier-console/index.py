import frappe
from frappe import _
from frappe.utils import cint
from imogi_pos.utils.branding import get_brand_context


def get_context(context):
    """Get context for cashier console page."""
    try:
        # Check if user is logged in and has required roles
        if frappe.session.user == "Guest":
            frappe.local.flags.redirect_location = "/imogi-login?redirect=/cashier-console"
            raise frappe.Redirect
        
        # Check for required roles (Cashier or Manager)
        user_roles = frappe.get_roles(frappe.session.user)
        required_roles = ["Cashier", "Restaurant Manager", "System Manager"]
        if not any(role in user_roles for role in required_roles):
            frappe.throw(_("Access denied: Requires Cashier or Manager role"))
        
        # Check active POS session if required
        pos_profile = get_pos_profile()
        if pos_profile:
            context.pos_profile = pos_profile
            context.require_pos_session = cint(pos_profile.get("imogi_require_pos_session", 0))
            context.enforce_session_on_cashier = cint(pos_profile.get("imogi_enforce_session_on_cashier", 0))
            
            # Check if session enforcement is enabled
            if context.require_pos_session and context.enforce_session_on_cashier:
                active_session = check_active_pos_session(pos_profile.name)
                context.has_active_session = bool(active_session)
                context.active_pos_session = active_session
            else:
                context.has_active_session = True
                context.active_pos_session = None
                
            # Set branding information
            context.branding = get_brand_context(pos_profile)
            
            # Set branch information
            context.branch = get_current_branch(pos_profile)
            
            # UI configuration
            context.title = _("Cashier Console")
            context.domain = pos_profile.get("imogi_pos_domain", "Restaurant")
            context.show_header = cint(pos_profile.get("imogi_show_header_on_pages", 1))
        else:
            # Handle the case when no pos_profile is found
            context.pos_profile = None
            context.require_pos_session = 0
            context.has_active_session = False
            context.active_pos_session = None
            context.branding = get_brand_context()
            context.branch = None
            context.title = _("Cashier Console")
            context.domain = "Restaurant"
            context.show_header = 1
            
            # Add an error message
            context.error_message = _("No POS Profile found. Please contact your administrator.")
    
    except Exception as e:
        frappe.log_error(f"Error in cashier console: {str(e)}")
        context.error_message = _("An error occurred. Please try again or contact support.")
        context.pos_profile = None
        context.show_header = 1
        context.branding = get_brand_context()
        context.title = _("Cashier Console")
        context.domain = "Restaurant"
        context.branch = None

    # Add currency symbol for use in templates
    context.currency_symbol = get_currency_symbol()
    return context


def get_pos_profile():
    """Get active POS profile for current user."""
    try:
        pos_profile_name = frappe.db.get_value("POS Profile User", 
            {"user": frappe.session.user}, "parent")
        
        if pos_profile_name:
            return frappe.get_doc("POS Profile", pos_profile_name)
        
        # Fallback to any POS profile with cashier mode
        profile = frappe.get_all(
            "POS Profile",
            filters={"imogi_mode": "Counter"},
            fields=["name"],
            limit=1
        )
        
        if profile:
            return frappe.get_doc("POS Profile", profile[0].name)
        
        return None
    except Exception as e:
        frappe.log_error(f"Error fetching POS Profile: {str(e)}")
        return None


def check_active_pos_session(pos_profile_name):
    """Check if there's an active POS session for the user and profile."""
    try:
        filters = {
            "user": frappe.session.user,
            "pos_profile": pos_profile_name,
            "status": "Open"
        }
        
        session = frappe.get_all(
            "POS Session",
            filters=filters,
            fields=["name", "pos_opening_shift", "creation"],
            order_by="creation desc",
            limit=1
        )
        
        return session[0] if session else None
    except Exception as e:
        frappe.log_error(f"Error checking active POS session: {str(e)}")
        return None

def get_current_branch(pos_profile):
    """Get current branch from context or POS Profile."""
    # First check if branch is stored in session
    branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)

    # If not in session, check POS Profile
    if not branch and pos_profile and pos_profile.get("imogi_branch"):
        branch = pos_profile.imogi_branch

    return branch


def get_currency_symbol():
    """Get the default currency symbol."""
    currency = frappe.db.get_default("currency")
    if currency:
        return frappe.db.get_value("Currency", currency, "symbol") or currency
    return ""
