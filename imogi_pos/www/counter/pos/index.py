import frappe
from frappe import _
from frappe.utils import cint
from imogi_pos.utils.branding import get_brand_context
from imogi_pos.utils.currency import get_currency_symbol
from imogi_pos.utils.auth_decorators import require_roles
from imogi_pos.utils.auth_helpers import get_user_pos_profile
from imogi_pos.utils.error_pages import set_setup_error


@require_roles("Cashier", "Branch Manager", "System Manager")
def get_context(context):
    """Get context for cashier console page."""
    try:
        # Get POS Profile for user
        pos_profile = get_user_pos_profile()
        if not pos_profile:
            set_setup_error(context, "pos_profile", page_name=_("Cashier Console"))
            context.title = _("Cashier Console")
            return context
        
        pos_profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
        
        # Redirect if wrong mode - Counter page is only for Counter mode
        current_mode = pos_profile_doc.get("imogi_mode", "Counter")
        if current_mode != "Counter":
            # Redirect to appropriate page based on mode
            if current_mode == "Table":
                frappe.local.flags.redirect_location = "/restaurant/waiter"
                raise frappe.Redirect
            elif current_mode == "Kiosk":
                frappe.local.flags.redirect_location = "/restaurant/waiter?mode=kiosk"
                raise frappe.Redirect
            elif current_mode == "Self-Order":
                frappe.local.flags.redirect_location = "/restaurant/self-order"
                raise frappe.Redirect
        
        context.setup_error = False
        context.pos_profile = pos_profile_doc
        context.require_pos_session = cint(pos_profile_doc.get("imogi_require_pos_session", 0))
        context.enforce_session_on_cashier = cint(pos_profile_doc.get("imogi_enforce_session_on_cashier", 0))
        
        # Check active session without throwing error
        if context.require_pos_session and context.enforce_session_on_cashier:
            # Check for active session using POS Opening Entry
            active_session = check_active_pos_session(pos_profile)
            context.has_active_session = bool(active_session)
            context.active_pos_session = active_session.get("name") if active_session else None
            
            # Get session info for display
            if active_session:
                context.session_info = get_session_info(active_session.get("name"))
            else:
                context.session_info = None
            
            if not active_session:
                set_setup_error(context, "session", page_name=_("Cashier Console"))
                context.title = _("Cashier Console")
                return context
        else:
            context.has_active_session = True
            context.active_pos_session = None
            context.session_info = None
            
        # Set branding information
        context.branding = get_brand_context(pos_profile_doc)
        
        # Set branch information
        branch_id = get_current_branch(pos_profile_doc)
        context.branch = branch_id
        context.branch_name = None
        context.branch_label = None

        if branch_id:
            try:
                branch_info = frappe.db.get_value(
                    "Branch",
                    branch_id,
                    ["name", "branch_name"],
                    as_dict=True,
                )

                if branch_info:
                    # Ensure the canonical branch name is available along with a user-facing label
                    context.branch = branch_info.get("name") or branch_id
                    context.branch_name = branch_info.get("branch_name") or branch_info.get("name")
                else:
                    context.branch_name = branch_id
            except Exception as branch_error:
                frappe.log_error(
                    f"Error fetching branch details for {branch_id}: {branch_error}"
                )
                context.branch_name = branch_id

            if context.branch_name:
                context.branch_label = context.branch_name
            elif context.branch:
                context.branch_label = context.branch

            # UI configuration
            context.title = _("Cashier Console")
            context.domain = pos_profile_doc.get("imogi_pos_domain", "Restaurant")
            context.mode = pos_profile_doc.get("imogi_mode", "Counter")
            context.show_header = cint(pos_profile_doc.get("imogi_show_header_on_pages", 1))

    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in cashier console: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Cashier Console"))
        context.title = _("Cashier Console")
        return context

    # Add currency symbol for use in templates
    context.currency_symbol = get_currency_symbol()
    return context


def get_pos_profile():
    """Get active POS profile for current user."""
    try:
        pos_profile_name = frappe.db.get_value("POS Profile User", 
            {"user": frappe.session.user}, "parent")
        
        if pos_profile_name:
            pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
            # Accept Counter mode for cashier console
            if pos_profile.get("imogi_mode") == "Counter":
                return pos_profile
        
        # Fallback to any POS profile with Counter mode
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
    """Check if there's an active POS Opening Entry for the user and profile."""
    try:
        filters = {
            "user": frappe.session.user,
            "pos_profile": pos_profile_name,
            "docstatus": 1,  # Submitted
            "status": "Open"
        }
        
        session = frappe.get_all(
            "POS Opening Entry",
            filters=filters,
            fields=["name", "period_start_date", "creation"],
            order_by="creation desc",
            limit=1
        )
        
        return session[0] if session else None
    except Exception as e:
        frappe.log_error(f"Error checking active POS Opening Entry: {str(e)}")
        return None

def get_session_info(pos_session_name):
    """Get POS Opening Entry information for display."""
    try:
        from frappe.utils import time_diff_in_seconds, now_datetime
        
        session_doc = frappe.get_doc("POS Opening Entry", pos_session_name)
        
        # Calculate session duration
        start_time = session_doc.get("period_start_date") or session_doc.get("creation")
        duration_seconds = time_diff_in_seconds(now_datetime(), start_time)
        duration_hours = duration_seconds / 3600
        
        return {
            "name": pos_session_name,
            "start_time": str(start_time),
            "duration_hours": round(duration_hours, 2),
            "status": session_doc.get("status"),
            "user": session_doc.get("user")
        }
    except Exception as e:
        frappe.log_error(f"Error getting session info: {str(e)}")
        return None

def get_current_branch(pos_profile):
    """Get current branch from context or POS Profile."""
    # First check if branch is stored in session
    branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)

    # If not in session, check POS Profile
    if not branch and pos_profile and pos_profile.get("imogi_branch"):
        branch = pos_profile.imogi_branch

    return branch


