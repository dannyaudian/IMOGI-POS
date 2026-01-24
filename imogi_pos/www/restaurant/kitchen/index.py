import frappe
from frappe import _
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.restaurant_settings import get_default_branch
from imogi_pos.utils.auth_decorators import require_roles
from imogi_pos.utils.error_pages import set_setup_error


@require_roles("Kitchen Staff", "Restaurant Manager", "System Manager")
def get_context(context):
    """Context builder for kitchen display page."""
    try:
        pos_profile = get_pos_profile()
        
        if not pos_profile:
            set_setup_error(context, "pos_profile", page_name=_("Kitchen Display"))
            context.title = _("Kitchen Display")
            return context
        
        context.setup_error = False
        context.pos_profile = pos_profile

        context.branding = get_branding_info(pos_profile)

        branch = get_current_branch(pos_profile)
        if not branch:
            branch = get_default_branch()
        context.branch = branch
        context.domain = pos_profile.get("imogi_pos_domain", "Restaurant") if pos_profile else "Restaurant"
        context.title = _("Kitchen Display")

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in kitchen_display get_context: {str(e)}")
        set_setup_error(context, "generic", str(e), page_name=_("Kitchen Display"))
        context.title = _("Kitchen Display")
        return context


def get_pos_profile():
    try:
        pos_profile_name = frappe.db.get_value(
            "POS Profile User", {"user": frappe.session.user}, "parent"
        )
        if pos_profile_name:
            pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
            # Accept restaurant modes for kitchen display
            if pos_profile.get("imogi_mode") in ["Table", "Kiosk", "Self-Order"]:
                return pos_profile

        # Fallback to any restaurant profile
        profiles = frappe.get_all(
            "POS Profile",
            filters={"imogi_mode": ["in", ["Table", "Kiosk", "Self-Order"]]},
            fields=["name"],
            limit=1
        )
        if profiles:
            return frappe.get_doc("POS Profile", profiles[0].name)
    except Exception as e:
        frappe.log_error(f"Error fetching POS Profile: {str(e)}")
    return None


def get_branding_info(pos_profile):
    branding = {
        "logo": None,
        "name": "IMOGI POS",
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
    }

    try:
        if pos_profile:
            if pos_profile.get("imogi_brand_logo"):
                branding["logo"] = pos_profile.imogi_brand_logo
            if pos_profile.get("imogi_brand_name"):
                branding["name"] = pos_profile.imogi_brand_name
            if pos_profile.get("imogi_brand_color_primary"):
                branding["primary_color"] = pos_profile.imogi_brand_color_primary
            if pos_profile.get("imogi_brand_color_accent"):
                branding["accent_color"] = pos_profile.imogi_brand_color_accent
            if pos_profile.get("imogi_brand_header_bg"):
                branding["header_bg"] = pos_profile.imogi_brand_header_bg

        if not branding["logo"]:
            company = frappe.defaults.get_user_default("Company")
            if company:
                company_doc = frappe.get_cached_doc("Company", company)
                if company_doc.company_logo:
                    branding["logo"] = company_doc.company_logo
                    branding["name"] = company_doc.company_name
    except Exception as e:
        frappe.log_error(f"Error fetching branding info: {str(e)}")

    return branding


def get_current_branch(pos_profile):
    branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)
    if not branch and pos_profile and pos_profile.get("imogi_branch"):
        branch = pos_profile.imogi_branch
    return branch
