# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe

from imogi_pos.utils.kitchen_routing import (
    get_menu_category_kitchen_station_by_category,
)


# Channel keywords that mean "all channels"
CHANNEL_ALL = {"", "both", "all", "any", "universal"}


def get_restaurant_settings():
    """Get Restaurant Settings with caching.
    
    Returns:
        dict: Restaurant settings values
    """
    try:
        settings = frappe.get_cached_doc("Restaurant Settings", "Restaurant Settings")
        return {
            "use_native_variants": settings.get("use_native_variants", 1),
            "enable_menu_channels": settings.get("enable_menu_channels", 0),
            "max_items_per_query": settings.get("max_items_per_query", 500),
        }
    except Exception:
        # Fallback to defaults if settings not found
        return {
            "use_native_variants": 1,
            "enable_menu_channels": 0,
            "max_items_per_query": 500,
        }


def _normalise_channel(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip().casefold()
    return str(value).strip().casefold()


def _channel_matches(entry_channel, requested_channel):
    """Check if entry channel matches requested channel.
    
    Args:
        entry_channel: Channel value from item/entry
        requested_channel: Requested channel filter
        
    Returns:
        bool: True if matches, False otherwise
    """
    settings = get_restaurant_settings()
    if not settings.get("enable_menu_channels"):
        return True

    requested = _normalise_channel(requested_channel)
    if not requested or requested in CHANNEL_ALL:
        return True

    entry = _normalise_channel(entry_channel)
    if entry in CHANNEL_ALL:
        return True

    return entry == requested


@frappe.whitelist(allow_guest=True)
def get_item_options(item, menu_channel=None):
    """Get available options for an item using native Item Variants.

    Args:
        item: Item code or name
        menu_channel: Channel context for filtering (optional)

    Returns:
        dict: Item options grouped by attribute
    """
    settings = get_restaurant_settings()
    
    if settings.get("use_native_variants", 1):
        return get_item_options_native(item, menu_channel)
    
    return {}


def get_item_options_native(item, menu_channel=None):
    """Get item options using native Item Variants.
    
    Args:
        item: Item code or name
        menu_channel: Channel context for filtering (optional)
        
    Returns:
        dict: Options grouped by attribute with variant details
    """
    if not item:
        return {}
    
    try:
        item_doc = frappe.get_cached_doc("Item", item)
    except Exception:
        return {}
    
    # Check if item has native variants
    if not getattr(item_doc, "has_variants", 0):
        return {}
    
    # Import here to avoid circular dependency
    from imogi_pos.api.variants import get_item_variants
    
    try:
        # Get all variants with their attributes
        variant_data = get_item_variants(
            item_template=item,
            menu_channel=menu_channel
        )
        
        if not variant_data or not isinstance(variant_data, dict):
            return {}
        
        variants = variant_data.get("variants", [])
        attributes = variant_data.get("attributes", [])
        
        if not variants:
            return {}
        
        # Group variants by attribute for backward compatibility
        result = {}
        
        for attr_info in attributes:
            attr_name = attr_info.get("name") or attr_info.get("attribute")
            attr_label = attr_info.get("label") or attr_name
            
            if not attr_name:
                continue
            
            # Normalize attribute name for grouping
            attr_key = attr_name.lower().replace(" ", "_")
            
            # Collect unique values for this attribute
            attr_values = {}
            
            for variant in variants:
                variant_attrs = variant.get("attributes", {})
                
                if attr_name in variant_attrs:
                    attr_value = variant_attrs[attr_name]
                    
                    if attr_value not in attr_values:
                        attr_values[attr_value] = {
                            "label": attr_value,
                            "value": variant.get("name"),
                            "price": variant.get("standard_rate", 0) or variant.get("rate", 0),
                            "linked_item": variant.get("name"),
                            "variant_name": variant.get("item_name"),
                        }
            
            if attr_values:
                result[attr_key] = list(attr_values.values())
        
        return result
        
    except Exception as e:
        frappe.log_error(
            message=f"Error getting native variants for {item}: {str(e)}",
            title="Native Variant Option Error"
        )
        return {}


def set_item_flags(doc, method=None):
    """Set kitchen routing for items based on Restaurant Settings.

    Args:
        doc: The Item document being saved
        method: The event method name (unused)
    """
    # Auto-set kitchen routing from Restaurant Settings menu category routes
    kitchen, kitchen_station = get_menu_category_kitchen_station_by_category(
        doc.get("menu_category")
    )

    if kitchen and not doc.get("default_kitchen"):
        doc.set("default_kitchen", kitchen)

    if kitchen_station and not doc.get("default_kitchen_station"):
        doc.set("default_kitchen_station", kitchen_station)

    # For variant items, ensure has_variants flag is disabled
    if doc.get("variant_of"):
        doc.set("has_variants", 0)
        doc.flags.ignore_validate_update_after_stock = True
