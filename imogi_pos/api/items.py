# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe

from imogi_pos.utils.kitchen_routing import (
    get_menu_category_kitchen_station_by_category,
)


# Feature flags for channel and menu option support.
# LEGACY: Custom option tables are deprecated in favor of native Item Variants
# Set ITEM_OPTIONS_FEATURE_ENABLED = False to use native variants only
MENU_CHANNEL_FEATURE_ENABLED = False
ITEM_OPTIONS_FEATURE_ENABLED = False  # Deprecated: Use native Item Variants
USE_NATIVE_VARIANTS = True  # Enable native variant-first approach

CHANNEL_ALL = {"", "both", "all", "any", "universal"}


def _normalise_channel(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip().casefold()
    return str(value).strip().casefold()


def _channel_matches(entry_channel, requested_channel):
    if not MENU_CHANNEL_FEATURE_ENABLED:
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
    """Retrieve available options for a given item.
    
    For fresh deployments, use native Item Variants directly via get_item_options_native().
    This function is kept for backward compatibility only.

    Args:
        item (str): Item code or name.
        menu_channel (str, optional): Channel context for filtering

    Returns:
        dict: Item options - uses native variants when available
    """
    # Use native variants for fresh deployments
    if USE_NATIVE_VARIANTS:
        return get_item_options_native(item, menu_channel)
    
    # Legacy support (not recommended for fresh deployments)
    return {}


def get_item_options_native(item, menu_channel=None):
    """Get item options using native Item Variants (recommended).
    
    This is the new native-first approach that uses ERPNext's built-in
    Item Variant system instead of custom option tables.
    
    Args:
        item (str): Item code or name
        menu_channel (str, optional): Channel context for filtering
        
    Returns:
        dict: Options grouped by attribute with native variant details
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


# Mapping of menu categories to default item option flags.
#
# Categories:
# - ``dessert``: enables ``has_size`` and ``has_topping``
# - ``beverage``: enables ``has_size``, ``has_sugar`` and ``has_ice``
# - ``main course`` / ``appetizer``: enable ``has_spice``
# - ``special``: enables ``has_size``, ``has_spice`` and ``has_topping``
MENU_FLAG_MAP = {
    "dessert": {"has_size": 1, "has_topping": 1},
    "beverage": {"has_size": 1, "has_sugar": 1, "has_ice": 1},
    "main course": {"has_spice": 1},
    "appetizer": {"has_spice": 1},
    "special": {"has_size": 1, "has_spice": 1, "has_topping": 1},
    "allura": {"has_size": 1, "has_topping": 1},
    "sugus": {"has_size": 1, "has_topping": 1},
    "tea": {"has_size": 1, "has_topping": 1},
    "coffee": {"has_size": 1, "has_topping": 1},  # Coffee usually has size and topping
}


def set_item_flags(doc, method=None):
    """Set kitchen routing for items based on menu category.

    Args:
        doc (frappe.model.document.Document): The Item document being saved.
        method (str, optional): The event method name (unused).
    """
    # Set kitchen routing based on menu category
    kitchen, kitchen_station = get_menu_category_kitchen_station_by_category(
        doc.get("menu_category")
    )

    if kitchen and not (doc.get("default_kitchen")):
        doc.set("default_kitchen", kitchen)

    if kitchen_station and not (doc.get("default_kitchen_station")):
        doc.set("default_kitchen_station", kitchen_station)

    # For variant items, disable has_variants flag
    if doc.get("variant_of"):
        doc.set("has_variants", 0)

        # When template items are saved, ERPNext updates their variants and runs
        # validation. Marking the document tells ERPNext to skip stock validation,
        # allowing benign updates that do not impact inventory quantities.
        doc.flags.ignore_validate_update_after_stock = True
