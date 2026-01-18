import frappe
from frappe import _
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.branch import get_branch_details
from frappe.utils import cint
from imogi_pos.utils.currency import get_currency_symbol
from imogi_pos.api.queue import get_next_queue_number

def get_context(context):
    """Get context for kiosk page."""
    try:
        context.title = _("IMOGI POS Kiosk")
        
        # Check if guest access is allowed or user is logged in
        allow_guest = check_guest_access()
        if frappe.session.user == "Guest" and not allow_guest:
            raise frappe.Redirect("/imogi-login?redirect=/kiosk")
    
    # Get POS Profile for kiosk mode
    pos_profile = get_pos_profile()
    if not pos_profile:
        frappe.throw(_("No POS Profile found for Kiosk mode"))
    
    context.pos_profile = pos_profile
    
    # Check if domain is valid
    domain = pos_profile.get("imogi_pos_domain", "Restaurant")
    context.domain = domain
    
    
    # Get branding information
    context.branding = get_branding_info(pos_profile)
    
    # Get branch
    branch_name = get_current_branch(pos_profile)
    context.branch = branch_name
    context.branch_info = get_branch_details(branch_name)
    context.receipt_logo = "/service-select/images/imogi.png"
    
    # Get payment settings
    context.payment_settings = {
        "gateway_enabled": cint(pos_profile.get("imogi_enable_payment_gateway", 0)),
        "payment_mode": pos_profile.get("imogi_checkout_payment_mode", "Mixed"),
        "show_payment_qr_on_customer_display": cint(pos_profile.get("imogi_show_payment_qr_on_customer_display", 0)),
        "payment_timeout": cint(pos_profile.get("imogi_payment_timeout_seconds", 300))
    }
    
    # Currency information
    context.currency_symbol = get_currency_symbol()
    context.default_currency = frappe.get_cached_doc("Company", frappe.defaults.get_user_default("Company")).default_currency
    
    # Item categories for filtering
    context.item_categories = get_item_categories()
    
    # Get printer settings
    context.print_settings = {
        "print_receipt": cint(pos_profile.get("imogi_print_receipt_on_kiosk", 1)),
        "print_queue_ticket": cint(pos_profile.get("imogi_print_queue_ticket_on_kiosk", 1)),
        "print_notes_on_kiosk_receipt": cint(pos_profile.get("imogi_print_notes_on_kiosk_receipt", 1))
    }
    
    # UI Settings
    context.show_header = cint(pos_profile.get("imogi_show_header_on_pages", 1))
    context.allow_notes = cint(pos_profile.get("imogi_allow_notes_on_kiosk", 1))
    discount_fields = [
        "imogi_allow_discounts_on_kiosk",
        "imogi_allow_discounts",
        "imogi_enable_discounts",
        "allow_discount",
    ]
    discount_flag = 0
    for field in discount_fields:
        value = pos_profile.get(field)
        if value is not None:
            discount_flag = value
            break
    context.allow_discounts = cint(discount_flag)
    
    try:
        restaurant_settings = frappe.get_cached_doc("Restaurant Settings")
    except Exception:
        restaurant_settings = None

    if restaurant_settings:
        restaurant_discount_fields = [
            "imogi_allow_discounts_on_kiosk",
            "imogi_allow_discounts",
            "imogi_enable_discounts",
            "allow_discount",
        ]
        for field in restaurant_discount_fields:
            if cint(restaurant_settings.get(field)):
                context.allow_discounts = 1
                break

    # Get Queue Number if applicable
    context.next_queue_number = (
        get_next_queue_number(context.branch) if context.branch else 1
    )

        return context
    except frappe.Redirect:
        raise
    except Exception as e:
        frappe.log_error(f"Error in kiosk get_context: {str(e)}")
        raise frappe.Redirect("/imogi-login?redirect=/kiosk")

def get_pos_profile():
    """Get appropriate POS profile for kiosk mode."""
    try:
        # First try to find from User's POS Profile
        if frappe.session.user != "Guest":
            pos_profile_name = frappe.db.get_value("POS Profile User", 
                {"user": frappe.session.user}, "parent")
            
            if pos_profile_name:
                pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
                if pos_profile.get("imogi_mode") == "Kiosk":
                    return pos_profile
        
        # Then try to find any Kiosk profile
        kiosk_profiles = frappe.get_all(
            "POS Profile",
            filters={"imogi_mode": "Kiosk"},
            fields=["name"],
            limit=1
        )
        
        if kiosk_profiles:
            return frappe.get_doc("POS Profile", kiosk_profiles[0].name)
        
        return None
    except Exception as e:
        frappe.log_error(f"Error fetching Kiosk POS Profile: {str(e)}")
        return None


def get_branding_info(pos_profile):
    """Get branding information from profile or settings."""
    branding = {
        "logo": None,
        "name": "IMOGI POS",
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
    }
    
    try:
        # Get from POS Profile first
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
        
        # Fallback to Restaurant Settings
        if not branding["logo"]:
            restaurant_settings = frappe.get_cached_doc("Restaurant Settings")
            if hasattr(restaurant_settings, "imogi_brand_logo") and restaurant_settings.imogi_brand_logo:
                branding["logo"] = restaurant_settings.imogi_brand_logo
            if hasattr(restaurant_settings, "imogi_brand_name") and restaurant_settings.imogi_brand_name:
                branding["name"] = restaurant_settings.imogi_brand_name
        
        # Final fallback to company
        if not branding["logo"]:
            company = frappe.defaults.get_user_default("Company")
            if company:
                company_doc = frappe.get_cached_doc("Company", company)
                if company_doc.company_logo:
                    branding["logo"] = company_doc.company_logo
    except Exception as e:
        frappe.log_error(f"Error fetching branding info: {str(e)}")
    
    return branding

def get_current_branch(pos_profile):
    """Get current branch from context or POS Profile."""
    # First check if branch is stored in session
    branch = frappe.cache().hget("imogi_pos_branch", frappe.session.user)
    
    # If not in session, check POS Profile
    if not branch and pos_profile and pos_profile.get("imogi_branch"):
        branch = pos_profile.imogi_branch
    
    return branch

def check_guest_access():
    """Check if guest access is allowed for kiosk."""
    try:
        # Check if guest access is allowed in settings
        settings = frappe.get_cached_doc("Restaurant Settings")
        if hasattr(settings, "imogi_kiosk_allow_guest"):
            return cint(settings.imogi_kiosk_allow_guest)
    except Exception:
        pass
    
    return False

def get_item_categories():
    """Get item categories for filtering."""
    try:
        # Get all item groups
        item_groups = frappe.get_all(
            "Item Group",
            filters={"is_group": 0, "show_in_website": 1},
            fields=["name", "parent_item_group"],
            order_by="name"
        )
        
        # Get all menu categories (custom field)
        menu_categories = []
        if frappe.db.exists("DocField", {"fieldname": "menu_category", "parent": "Item"}):
            menu_categories = frappe.db.sql(
                """
                SELECT DISTINCT menu_category as name
                FROM `tabItem`
                WHERE menu_category IS NOT NULL AND menu_category != ''
                ORDER BY menu_category
                """,
                as_dict=True
            )
        
        return {
            "item_groups": item_groups,
            "menu_categories": menu_categories
        }
    except Exception as e:
        frappe.log_error(f"Error getting item categories: {str(e)}")
        return {"item_groups": [], "menu_categories": []}
