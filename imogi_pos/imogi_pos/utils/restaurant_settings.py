# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint

def get_restaurant_settings():
    """
    Get cached restaurant settings
    
    Returns:
        dict: Restaurant settings values
    """
    settings = frappe.cache().get_value('restaurant_settings')
    if not settings:
        settings = frappe.get_single('Restaurant Settings')
        frappe.cache().set_value('restaurant_settings', settings)
    return settings

def get_default_branch():
    """
    Get the default branch from restaurant settings
    
    Returns:
        str: Default branch name or None
    """
    settings = get_restaurant_settings()
    return settings.default_branch if settings else None

def get_default_floor():
    """
    Get the default floor from restaurant settings
    
    Returns:
        str: Default floor name or None
    """
    settings = get_restaurant_settings()
    return settings.default_floor if settings else None

def get_kot_settings():
    """
    Get KOT-related settings
    
    Returns:
        dict: KOT settings
    """
    settings = get_restaurant_settings()
    if not settings:
        return {}
        
    return {
        "enable_kot": cint(settings.enable_kot),
        "auto_print": cint(settings.auto_kot_print),
        "copies": cint(settings.auto_kot_print_copies),
        "print_format": settings.kot_print_format,
        "group_by_station": cint(settings.kot_group_by_kitchen_station),
        "print_notes": cint(settings.print_notes_on_kot)
    }

def get_branding():
    """
    Get branding-related settings
    
    Returns:
        dict: Branding settings
    """
    settings = get_restaurant_settings()
    if not settings:
        return {}
        
    return {
        "logo": settings.imogi_brand_logo,
        "logo_dark": settings.imogi_brand_logo_dark,
        "name": settings.imogi_brand_name,
        "home_url": settings.imogi_brand_home_url,
        "primary_color": settings.imogi_brand_color_primary,
        "accent_color": settings.imogi_brand_color_accent
    }

def get_self_order_settings():
    """
    Get self-order related settings
    
    Returns:
        dict: Self-order settings
    """
    settings = get_restaurant_settings()
    if not settings:
        return {}
        
    return {
        "enable": cint(settings.enable_self_order),
        "mode": settings.default_self_order_mode,
        "qr_format": settings.self_order_qr_format,
        "allow_guest": cint(settings.self_order_allow_guest),
        "token_ttl": cint(settings.self_order_default_token_ttl),
        "disclaimer": settings.self_order_disclaimer,
        "show_prices": cint(settings.show_prices_on_qr_menu)
    }