import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime
from imogi_pos.utils.branding import (
    PRIMARY_COLOR,
    ACCENT_COLOR,
    HEADER_BG_COLOR,
)

def get_context(context):
    """
    Context provider for customer display page.
    This is a public page so guest access is allowed.
    """
    context.title = _("Customer Display")
    
    # Get device ID from query params
    device_id = frappe.form_dict.get("device_id") or "unregistered"
    context.device_id = device_id
    
    # Get branding information
    context.branding = get_branding_info()
    
    # Check if this is a registered display device
    display_device = get_display_device(device_id)
    if display_device:
        context.is_registered = True
        context.display_config = display_device
        
        # Get the linked order if any
        linked_order = get_linked_order(device_id)
        if linked_order:
            context.linked_order = linked_order
            context.show_order_summary = True
    else:
        context.is_registered = False
        context.show_registration = True
        context.display_config = {"layout": "default", "blocks": []}
    
    # Default layout if not configured
    if "blocks" not in context.display_config:
        context.display_config["blocks"] = [
            {"type": "branding", "position": "top", "height": "15vh"},
            {"type": "order_summary", "position": "middle", "height": "35vh"},
            {"type": "payment", "position": "middle", "height": "35vh"},
            {"type": "ticker", "position": "bottom", "height": "15vh", "content": "Thank you for your visit!"}
        ]
    
    # Configuration for client-side
    context.config = {
        "device_id": device_id,
        "fullscreen": True,
        "heartbeat_interval": 30000,  # 30 seconds
        "refresh_interval": 300000,   # 5 minutes
    }
    
    # Check if the page should be fullscreen
    context.fullscreen = True
    
    # Set default ticker message
    context.ticker_message = get_ticker_message()
    
    # Get promotional content
    context.promotional_content = get_promotional_content()
    
    return context

def get_display_device(device_id):
    """Get display device configuration by device ID."""
    try:
        if not device_id or device_id == "unregistered":
            return None
            
        display_device = frappe.get_all(
            "Customer Display Device",
            filters={"device_id": device_id, "status": "Active"},
            fields=["name", "device_id", "profile", "layout", "blocks", "last_heartbeat"]
        )
        
        if not display_device:
            return None
            
        device = display_device[0]
        
        # Get profile if available
        if device.get("profile"):
            profile = frappe.get_doc("Customer Display Profile", device.profile)
            device["blocks"] = profile.blocks
            device["layout"] = profile.layout
        
        # Log heartbeat
        update_heartbeat(device_id)
        
        return device
    except Exception as e:
        frappe.log_error(f"Error fetching display device: {str(e)}")
        return None

def get_linked_order(device_id):
    """Get order linked to this display device."""
    try:
        link = frappe.get_all(
            "Customer Display Link",
            filters={
                "device_id": device_id,
                "status": "Active"
            },
            fields=["pos_order", "creation"]
        )
        
        if not link:
            return None
        
        order_name = link[0].pos_order
        order = frappe.get_doc("POS Order", order_name)
        
        # Format order data for display
        formatted_order = {
            "name": order.name,
            "table": order.table,
            "customer": order.customer_name or order.customer,
            "total": order.grand_total,
            "currency": frappe.defaults.get_global_default("currency"),
            "items": [],
            "status": order.workflow_state,
            "timestamp": get_datetime(link[0].creation).strftime("%H:%M")
        }
        
        # Get items
        for item in order.items:
            formatted_order["items"].append({
                "item_name": item.item_name,
                "qty": item.qty,
                "amount": item.amount
            })
            
        return formatted_order
    except Exception as e:
        frappe.log_error(f"Error fetching linked order: {str(e)}")
        return None

def update_heartbeat(device_id):
    """Update the last heartbeat time for the device."""
    try:
        frappe.db.set_value("Customer Display Device", {"device_id": device_id}, "last_heartbeat", now_datetime())
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error updating heartbeat: {str(e)}")

def get_branding_info():
    """Get branding information for the display."""
    branding = {
        "logo": None,
        "name": "IMOGI POS",
        "primary_color": PRIMARY_COLOR,
        "accent_color": ACCENT_COLOR,
        "background_color": HEADER_BG_COLOR,
    }
    
    try:
        # Try to get from Restaurant Settings first
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
                    branding["name"] = company_doc.company_name
    except Exception as e:
        frappe.log_error(f"Error fetching branding info: {str(e)}")
    
    return branding

def get_ticker_message():
    """Get ticker message from settings."""
    try:
        settings = frappe.get_cached_doc("Restaurant Settings")
        if hasattr(settings, "imogi_display_ticker_message"):
            return settings.imogi_display_ticker_message
    except Exception:
        pass
    
    return "Thank you for dining with us! We appreciate your business."

def get_promotional_content():
    """Get promotional content/ads for the display."""
    try:
        # Get active promotions
        promotions = frappe.get_all(
            "Customer Display Content",
            filters={"status": "Active", "content_type": "Promotion"},
            fields=["title", "content", "image", "sequence"],
            order_by="sequence"
        )
        
        return promotions
    except Exception as e:
        frappe.log_error(f"Error fetching promotional content: {str(e)}")
        return []