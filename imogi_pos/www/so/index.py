import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime
import json
import hashlib
import hmac
import base64
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)
from imogi_pos.utils.currency import get_currency_symbol

def get_context(context):
    """Get context for Self-Order page accessed via token/slug."""
    context.title = _("Self-Order")
    
    # Get token or slug from URL or route
    token = frappe.form_dict.get("token") or frappe.form_dict.get("slug")
    if not token:
        # Parse from route path when query params are absent
        path_parts = frappe.request.path.strip("/").split("/")
        if path_parts and path_parts[0] == "so" and len(path_parts) > 1:
            # Use the first part after /so/
            token = path_parts[1]

    if not token:
        # No token provided
        context.template = "invalid_token.html"
        context.error_title = _("Missing Token")
        context.error_message = _(
            "No token was provided. Please scan the QR code again or use a valid link."
        )
        return context

    # Verify token and get session data
    session_data, failure_reason = verify_token(token)
    if not session_data:
        context.template = "invalid_token.html"
        if failure_reason == "session_expired":
            context.error_title = _("Session Expired")
            context.error_message = _(
                "Your self-order session has expired. Please scan the QR code again or request a new link."
            )
        else:
            context.error_title = _("Invalid Token")
            context.error_message = _(
                "The self-order link is invalid. Please check the link or ask for a new one."
            )
        return context

    context.session_data = session_data
    context.token = token
    
    # Get POS Profile
    pos_profile = get_pos_profile(session_data.get("pos_profile"))
    if not pos_profile:
        frappe.throw(_("Invalid POS Profile"))
    
    context.pos_profile = pos_profile
    
    # Check if domain is valid for restaurant-specific features
    context.domain = pos_profile.get("imogi_pos_domain", "Restaurant")
    context.is_restaurant = context.domain == "Restaurant"
    
    # Get self-order mode from POS Profile
    context.mode = pos_profile.get("imogi_self_order_mode", "Takeaway")
    # Only allow Table mode in restaurant domain
    if context.mode == "Table" and not context.is_restaurant:
        context.mode = "Takeaway"
    
    # Set other context data
    context.branding = get_branding_info(pos_profile)
    context.branch = session_data.get("branch")
    context.table = session_data.get("table")
    context.allow_guest = cint(pos_profile.get("imogi_self_order_allow_guest", 0))
    context.require_payment = cint(pos_profile.get("imogi_self_order_require_payment", 0))
    context.allow_notes = cint(pos_profile.get("imogi_allow_notes_on_self_order", 1))
    
    # Check if there's already an active session
    self_order_session = get_or_create_self_order_session(token, session_data)
    context.self_order_session = self_order_session
    
    # Check if there's a linked order
    if self_order_session.get("order_linkage"):
        pos_order = get_pos_order(self_order_session.get("order_linkage"))
        if pos_order:
            context.pos_order = pos_order
    
    # Get payment settings
    context.payment_settings = {
        "gateway_enabled": cint(pos_profile.get("imogi_enable_payment_gateway", 0)),
        "payment_mode": pos_profile.get("imogi_checkout_payment_mode", "Mixed"),
        "payment_timeout": cint(pos_profile.get("imogi_payment_timeout_seconds", 300))
    }
    
    # Currency information
    context.currency_symbol = get_currency_symbol()
    context.default_currency = frappe.get_cached_doc("Company", frappe.defaults.get_user_default("Company")).default_currency
    
    # Item categories for filtering
    context.item_categories = get_item_categories()
    
    # Disclaimer text
    context.disclaimer = pos_profile.get("imogi_self_order_disclaimer", "")
    
    # Check if session has expired
    if self_order_session.get("expires_on"):
        expires_on = get_datetime(self_order_session.get("expires_on"))
        if expires_on < now_datetime():
            context.session_expired = True
        else:
            context.session_expired = False
            # Calculate remaining time in minutes
            time_diff = expires_on - now_datetime()
            context.expiry_minutes = int(time_diff.total_seconds() / 60)
    else:
        context.session_expired = False
    
    return context

def verify_token(token):
    """Verify the token/slug and return session data and failure reason."""
    try:
        # Check if token exists in Self Order Session
        session = frappe.get_all(
            "Self Order Session",
            filters={"token": token, "status": "Active"},
            fields=["name", "token", "branch", "table", "pos_profile",
                    "expires_on", "order_linkage", "data", "is_guest"]
        )

        if session:
            # Token found in Self Order Session
            session_data = session[0]

            # Check if session has expired
            if session_data.get("expires_on") and get_datetime(session_data.get("expires_on")) < now_datetime():
                return None, "session_expired"

            # Return session data
            data = session_data.get("data")
            if data and isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    data = {}
            else:
                data = {}

            return {
                "session_id": session_data.get("name"),
                "token": token,
                "branch": session_data.get("branch"),
                "table": session_data.get("table"),
                "pos_profile": session_data.get("pos_profile"),
                "expires_on": session_data.get("expires_on"),
                "order_linkage": session_data.get("order_linkage"),
                "is_guest": session_data.get("is_guest"),
                "data": data
            }, None

        # Check if it's a slug on Restaurant Table
        if frappe.db.exists("Restaurant Table", {"qr_slug": token}):
            table = frappe.get_doc("Restaurant Table", {"qr_slug": token})

            # Get POS Profile
            pos_profile_name = frappe.db.get_value(
                "Restaurant Settings", None, "default_pos_profile",
            )

            # Get expiry time
            settings = frappe.get_cached_doc("Restaurant Settings")
            token_ttl = getattr(settings, "imogi_self_order_token_ttl", 60)  # default 60 minutes

            # Return session data
            return {
                "session_id": None,
                "token": token,
                "branch": table.branch,
                "table": table.name,
                "pos_profile": pos_profile_name,
                "expires_on": None,
                "order_linkage": None,
                "is_guest": 1,
                "data": {},
            }, None

        # Finally, try to verify if it's a signed token
        if "." in token:
            try:
                payload_b64, signature = token.rsplit(".", 1)
                padding = "=" * (-len(payload_b64) % 4)
                payload_json = base64.urlsafe_b64decode(payload_b64 + padding).decode()
                payload = json.loads(payload_json)
            except Exception:
                return None, "invalid_token"

            secret = (
                frappe.conf.get("self_order_token_secret")
                or frappe.get_site_config().get("encryption_key")
            )
            if not secret:
                return None, "invalid_token"

            expected_signature = hmac.new(
                secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(signature, expected_signature):
                return None, "invalid_token"

            expires_on = payload.get("expires_on")
            if expires_on and get_datetime(expires_on) < now_datetime():
                return None, "session_expired"

            return {
                "session_id": None,
                "token": payload.get("token") or token,
                "branch": payload.get("branch"),
                "table": payload.get("table"),
                "pos_profile": payload.get("pos_profile"),
                "expires_on": payload.get("expires_on"),
                "order_linkage": None,
                "is_guest": payload.get("is_guest", 1),
                "data": payload.get("data", {}),
            }, None

        return None, "invalid_token"

    except Exception as e:
        frappe.log_error(f"Error verifying self-order token: {str(e)}")
        return None, "invalid_token"

def get_or_create_self_order_session(token, session_data):
    """Get or create a Self Order Session for this token."""
    try:
        # If we already have a session ID, just return the session
        if session_data.get("session_id"):
            return session_data
        
        # Otherwise, create a new session
        settings = frappe.get_cached_doc("Restaurant Settings")
        token_ttl = getattr(settings, "imogi_self_order_token_ttl", 60)  # default 60 minutes
        
        # Calculate expiry time
        expires_on = now_datetime().add(minutes=token_ttl)
        
        # Create session
        session = frappe.get_doc({
            "doctype": "Self Order Session",
            "token": token,
            "branch": session_data.get("branch"),
            "table": session_data.get("table"),
            "pos_profile": session_data.get("pos_profile"),
            "expires_on": expires_on,
            "is_guest": session_data.get("is_guest", 1),
            "status": "Active",
            "last_ip": frappe.local.request_ip,
            "user_agent": frappe.request.headers.get("User-Agent", "")
        })
        session.insert(ignore_permissions=True)
        
        # Return updated session data
        return {
            "session_id": session.name,
            "token": token,
            "branch": session_data.get("branch"),
            "table": session_data.get("table"),
            "pos_profile": session_data.get("pos_profile"),
            "expires_on": expires_on,
            "order_linkage": None,
            "is_guest": session_data.get("is_guest", 1),
            "data": {}
        }
    except Exception as e:
        frappe.log_error(f"Error creating self-order session: {str(e)}")
        return session_data

def get_pos_profile(profile_name):
    """Get POS Profile document."""
    try:
        if not profile_name:
            return None
        
        return frappe.get_doc("POS Profile", profile_name)
    except Exception as e:
        frappe.log_error(f"Error fetching POS Profile: {str(e)}")
        return None

def get_pos_order(order_name):
    """Get POS Order document."""
    try:
        if not order_name:
            return None
        
        order = frappe.get_doc("POS Order", order_name)
        
        # Format order for frontend
        formatted_order = {
            "name": order.name,
            "table": order.table,
            "customer": order.customer_name or order.customer,
            "total": order.totals,
            "status": order.workflow_state,
            "items": []
        }
        
        # Get items
        for item in order.items:
            formatted_order["items"].append({
                "item_code": item.item,
                "item_name": item.item_name,
                "qty": item.qty,
                "rate": item.rate,
                "amount": item.amount,
                "notes": item.notes
            })
            
        return formatted_order
    except Exception as e:
        frappe.log_error(f"Error fetching POS Order: {str(e)}")
        return None

def get_branding_info(pos_profile):
    """Get branding information from profile or settings."""
    branding = {
        "logo": None,
        "logo_dark": None,
        "name": "IMOGI POS",
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "header_bg": HEADER_BG_COLOR,
    }
    
    try:
        # Check if there's a brand profile in the POS Profile
        brand_profile = None
        if pos_profile and pos_profile.get("imogi_self_order_brand_profile"):
            brand_profile = frappe.get_doc("Brand Profile", pos_profile.imogi_self_order_brand_profile)
        
        # Get from brand profile first
        if brand_profile:
            if brand_profile.logo:
                branding["logo"] = brand_profile.logo
            if brand_profile.logo_dark:
                branding["logo_dark"] = brand_profile.logo_dark
            if brand_profile.brand_name:
                branding["name"] = brand_profile.brand_name
            if brand_profile.primary_color:
                branding["primary_color"] = brand_profile.primary_color
            if brand_profile.accent_color:
                branding["accent_color"] = brand_profile.accent_color
            if brand_profile.header_bg_color:
                branding["header_bg"] = brand_profile.header_bg_color
                
        # Then try POS Profile
        elif pos_profile:
            if pos_profile.get("imogi_brand_logo"):
                branding["logo"] = pos_profile.imogi_brand_logo
            if pos_profile.get("imogi_brand_logo_dark"):
                branding["logo_dark"] = pos_profile.imogi_brand_logo_dark
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
            if hasattr(restaurant_settings, "imogi_brand_logo_dark") and restaurant_settings.imogi_brand_logo_dark:
                branding["logo_dark"] = restaurant_settings.imogi_brand_logo_dark
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
