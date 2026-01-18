import frappe
from frappe import _
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)


def get_context(context):
    """Context builder for waiter order page."""
    if frappe.session.user == "Guest":
        raise frappe.Redirect("/imogi-login?redirect=/waiter_order")

    pos_profile = get_pos_profile()
    context.pos_profile = pos_profile

    context.branding = get_branding_info(pos_profile)
    context.branch = get_current_branch(pos_profile)
    context.domain = pos_profile.get("imogi_pos_domain", "Restaurant") if pos_profile else "Restaurant"
    context.title = _("Waiter Order")

    return context


def get_pos_profile():
    try:
        pos_profile_name = frappe.db.get_value(
            "POS Profile User", {"user": frappe.session.user}, "parent"
        )
        if pos_profile_name:
            return frappe.get_doc("POS Profile", pos_profile_name)

        profiles = frappe.get_all("POS Profile", fields=["name"], limit=1)
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
