import frappe

def get_context(context):
    """Provide context data for the login page."""
    context.title = "IMOGI POS Login"
    context.brand_info = get_brand_info()
    return context

def get_brand_info():
    """Get brand information from settings hierarchy."""
    try:
        # Try to get from Restaurant Settings first
        restaurant_settings = frappe.get_doc("Restaurant Settings")
        if hasattr(restaurant_settings, "imogi_brand_logo") and restaurant_settings.imogi_brand_logo:
            return {
                "logo": restaurant_settings.imogi_brand_logo,
                "name": restaurant_settings.imogi_brand_name or "IMOGI POS"
            }
        
        # Fallback to company logo
        company = frappe.defaults.get_user_default("Company")
        if company:
            company_doc = frappe.get_doc("Company", company)
            if company_doc.company_logo:
                return {
                    "logo": company_doc.company_logo,
                    "name": company_doc.company_name
                }
        
        # Final fallback to system settings
        system_settings = frappe.get_doc("System Settings")
        return {
            "logo": None,
            "name": system_settings.app_name or "IMOGI POS"
        }
    except Exception:
        return {
            "logo": None,
            "name": "IMOGI POS"
        }