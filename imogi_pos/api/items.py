# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe

from imogi_pos.utils.kitchen_routing import (
    get_menu_category_kitchen_station_by_category,
)
from imogi_pos.utils.auth_decorators import allow_guest_if_configured
from imogi_pos.utils.permission_manager import check_branch_access, check_doctype_permission


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
    
    Pure function - NO DB calls. Caller must check domain and enable_menu_channels.
    
    Args:
        entry_channel: Channel value from item/entry (can be None/empty)
        requested_channel: Requested channel filter (can be None/empty)
        
    Returns:
        bool: True if matches, False otherwise
        
    Matching logic:
        - None/""/"Universal"/"All"/"Both" in entry_channel = matches everything
        - None/"" in requested_channel = matches everything
        - Otherwise: case-insensitive exact match
    """
    # Normalize requested channel
    requested = _normalise_channel(requested_channel)
    if not requested or requested in CHANNEL_ALL:
        return True

    # Normalize entry channel
    entry = _normalise_channel(entry_channel)
    if entry in CHANNEL_ALL:
        return True

    # Exact match (case-insensitive)
    return entry == requested


@allow_guest_if_configured()
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


@frappe.whitelist()
def get_items_for_counter(search_term=None, category=None, limit=100):
    """
    Get items for Counter mode item selector with categories, variants, and pricing.
    Uses centralized operational context for POS Profile and branch resolution.
    
    Args:
        search_term (str, optional): Search query for item name/code
        category (str, optional): Filter by menu category
        limit (int, optional): Number of items to return
    
    Returns:
        dict: {
            "items": list of items with details,
            "categories": list of available menu categories
        }
    """
    from frappe.utils import flt, cint
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Authorize API call
    check_doctype_permission("Item")
    
    # Get operational context
    context = require_operational_context()
    pos_profile = context.get("pos_profile")
    branch = context.get("branch")
    
    # Validate user has access to this POS Profile
    check_doctype_permission("POS Profile", doc=pos_profile)
    
    # Additional branch validation for safety
    if branch:
        check_branch_access(branch)
    
    # Get item price list from POS Profile
    price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
    
    # Build filters
    filters = {
        "disabled": 0,
        "is_sales_item": 1,
        "has_variants": 0,  # Exclude templates, include actual items and variants
    }
    
    # Add category filter if specified
    if category:
        filters["item_group"] = category
    
    # Build query fields
    fields = [
        "name",
        "item_code",
        "item_name",
        "image",
        "description",
        "item_group",
        "stock_uom",
        "variant_of",
        "is_stock_item"
    ]
    
    # Search filter
    or_filters = None
    if search_term:
        search_term = search_term.strip()
        or_filters = [
            ["item_name", "like", f"%{search_term}%"],
            ["item_code", "like", f"%{search_term}%"],
            ["description", "like", f"%{search_term}%"]
        ]
    
    # Query items
    items = frappe.get_all(
        "Item",
        filters=filters,
        or_filters=or_filters,
        fields=fields,
        order_by="item_name asc",
        limit_page_length=limit
    )
    
    # Enrich items with pricing and variant info
    for item in items:
        # Get price from Item Price
        item_price = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item["item_code"],
                "price_list": price_list,
                "selling": 1
            },
            ["price_list_rate", "currency"],
            as_dict=True
        )
        
        item["rate"] = flt(item_price.get("price_list_rate") if item_price else 0)
        item["currency"] = item_price.get("currency") if item_price else "IDR"
        
        # Get stock quantity if stock item
        if cint(item.get("is_stock_item")):
            warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
            if warehouse:
                actual_qty = frappe.db.get_value(
                    "Bin",
                    {"item_code": item["item_code"], "warehouse": warehouse},
                    "actual_qty"
                ) or 0
                item["actual_qty"] = flt(actual_qty)
                item["in_stock"] = actual_qty > 0
            else:
                item["actual_qty"] = 0
                item["in_stock"] = True  # Assume available if no warehouse
        else:
            item["actual_qty"] = None
            item["in_stock"] = True  # Non-stock items always available
        
        # Get variants if this is a template item (shouldn't happen with has_variants=0 filter)
        # But check parent for variant items
        if item.get("variant_of"):
            item["is_variant"] = True
            item["template"] = item["variant_of"]
        else:
            item["is_variant"] = False
            item["template"] = None
    
    # Get list of categories for filtering
    categories = frappe.get_all(
        "Menu Category",
        filters={"disabled": 0},
        fields=["name", "category_name", "icon", "sort_order"],
        order_by="sort_order asc, category_name asc"
    )
    
    return {
        "items": items,
        "categories": categories,
        "price_list": price_list
    }
