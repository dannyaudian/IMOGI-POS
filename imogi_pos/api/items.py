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


# System defaults for item handling
# For native-first approach, always use native variants and don't use menu channels
SYSTEM_DEFAULTS = {
    "use_native_variants": 1,  # Always native first (user's requirement)
    "enable_menu_channels": 0,  # Always off - use Item Group native filtering instead
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
    # Always use native variants (user's native-first requirement)
    if SYSTEM_DEFAULTS.get("use_native_variants", 1):
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
    """Set kitchen routing for items based on Menu Category configuration.

    Args:
        doc: The Item document being saved
        method: The event method name (unused)
    """
    # Auto-set kitchen routing from Menu Category routes
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
    """DEPRECATED: Use get_pos_items() instead.
    
    Legacy wrapper for backward compatibility.
    Now delegates to unified get_pos_items() with mode="sellable".
    
    Args:
        search_term (str, optional): Search query for item name/code
        category (str, optional): Filter by item group (legacy: was menu category)
        limit (int, optional): Number of items to return (ignored)
    
    Returns:
        dict: {
            "items": list of items with details,
            "categories": list of available menu categories
        }
    """
    import logging
    from imogi_pos.utils.operational_context import require_operational_context
    
    # Log deprecation warning
    logging.warning(
        "[DEPRECATED] get_items_for_counter() is deprecated. "
        "Use get_pos_items(mode='sellable') instead."
    )
    
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
    
    # Delegate to unified API (sellable mode: has_variants=0)
    items = get_pos_items(
        pos_profile=pos_profile,
        mode="sellable",
        item_group=category,  # Legacy: category param mapped to item_group
        search_term=search_term,
        price_list=price_list,
        require_menu_category=0,
        require_price=0,
        debug=0
    )
    
    # Legacy: return format with categories list
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


@frappe.whitelist()
def get_pos_items(
    pos_profile=None,
    mode="sellable",
    item_group=None,
    search_term=None,
    price_list=None,
    require_menu_category=0,
    require_price=0,
    item_code=None,
    debug=0
):
    """
    Unified POS item query - single source of truth for item visibility.
    
    Args:
        pos_profile (str): POS Profile for context (optional, used to get price list/menu profile)
        mode (str): Item selection mode:
            - "sellable" (default): Only sellable items (has_variants=0) - variants + standalone
            - "template": Only template items (variant_of IS NULL) - for grouping UI
            - "variant": Variant children of a specific template (requires item_code)
            - "both": All items regardless of variant status
        item_group (str): Filter by Item Group (optional)
        search_term (str): Search in item_code/item_name/description (optional)
        price_list (str): Price List for pricing (optional, fallback to POS Profile)
        require_menu_category (int): If 1, exclude items without menu_category (default 0)
        require_price (int): If 1, exclude items without valid price (strict mode for production, default 0)
        item_code (str): Required for mode="variant" - the template item code
        debug (int): If 1, return debug metadata (default 0)
    
    Returns:
        list: Item list with essential fields
        OR dict with 'items' and 'debug' keys when debug=1
        
    Essential filters (ALWAYS applied):
        - disabled = 0
        - is_sales_item = 1
        - end_of_life IS NULL OR end_of_life >= TODAY
        - POS Menu Profile match (if pos_profile has pos_menu_profile set)
        
    Mode behavior:
        - sellable: Best for Cashier Console - shows what can be sold directly
        - template: For grouping UI that needs variant pickers
        - variant: Fetch children of a specific template (for variant picker)
        - both: For advanced scenarios
        
    Best Practices (v15):
        - Use require_price=1 in production to prevent items with missing/zero prices
        - POS Menu Profile scoping automatically applied when pos_profile is provided
        - Explicit require_menu_category flag prevents silent filtering
    """
    from frappe.utils import today, cint, flt
    
    # Validate mode parameter
    valid_modes = ("sellable", "template", "variant", "both")
    if mode not in valid_modes:
        frappe.throw(f"Invalid mode '{mode}'. Must be one of: {', '.join(valid_modes)}")
    
    # Validate variant mode requirements
    if mode == "variant" and not item_code:
        frappe.throw("item_code is required when mode='variant'")
    
    # Get price list and POS Menu Profile from POS Profile if not provided
    pos_menu_profile = None
    if pos_profile:
        profile_data = frappe.db.get_value(
            "POS Profile", 
            pos_profile, 
            ["selling_price_list", "pos_menu_profile"],
            as_dict=True
        )
        if profile_data:
            if not price_list:
                price_list = profile_data.get("selling_price_list")
            pos_menu_profile = profile_data.get("pos_menu_profile")
    
    # Base filters - ALWAYS applied
    filters = [
        ["Item", "disabled", "=", 0],
        ["Item", "is_sales_item", "=", 1],
    ]
    
    # Add end_of_life filter (defensive - check if field exists)
    # ERPNext v15 pattern: Items with NULL end_of_life OR future date are valid
    item_meta = frappe.get_meta("Item")
    if item_meta.has_field("end_of_life"):
        # Use OR filters: (end_of_life IS NULL) OR (end_of_life >= today)
        or_filters_eol = [
            ["Item", "end_of_life", "is", "not set"],
            ["Item", "end_of_life", ">=", today()],
        ]
    else:
        or_filters_eol = None
    
    # POS Menu Profile filter (v15 best practice: scope items by menu profile)
    # If POS Profile has pos_menu_profile set, filter items:
    # - Item.pos_menu_profile matches POS Profile.pos_menu_profile
    # - OR Item.pos_menu_profile is NULL/empty (treated as "global" / available to all)
    if pos_menu_profile and item_meta.has_field("pos_menu_profile"):
        # Items with matching menu profile OR no menu profile (global)
        or_filters_menu = [
            ["Item", "pos_menu_profile", "=", pos_menu_profile],
            ["Item", "pos_menu_profile", "is", "not set"],
            ["Item", "pos_menu_profile", "=", ""],
        ]
    
    # Mode-specific filters
    if mode == "sellable":
        # Only sellable items: variants (has_variants=0) + standalone items (has_variants=0)
        # Exclude templates (has_variants=1)
        filters.append(["Item", "has_variants", "=", 0])
    elif mode == "template":
        # Only templates and standalone items (exclude variant children)
        filters.append(["Item", "has_variants", "!=", None])
        or_filters_variant = [
            ["Item", "variant_of", "is", "not set"],
            ["Item", "variant_of", "=", ""],
        ]
    elif mode == "variant":
        # Variant children of specific template
        filters.append(["Item", "variant_of", "=", item_code])
        filters.append(["Item", "has_variants", "=", 0])
    else:  # mode == "both"
        or_filters_variant = None
    
    # Item Group filter (optional)
    if item_group:
        filters.append(["Item", "item_group", "=", item_group])
    
    # Menu Category filter (optional, explicit)
    if cint(require_menu_category):
        filters.append(["Item", "menu_category", "!=", ""])
        filters.append(["Item", "menu_category", "is", "set"])
    
    # Build fields list
    fields = [
        "name",
        "item_code",
        "item_name",
        "description",
        "image",
        "stock_uom",
        "standard_rate",
        "menu_category",
        "item_group",
        "has_variants",
        "variant_of",
    ]
    
    # Conditionally add custom fields if they exist
    if item_meta.has_field("imogi_menu_channel"):
        fields.append("imogi_menu_channel")
    
    if item_meta.has_field("pos_menu_profile"):
        fields.append("pos_menu_profile")
    
    # Execute query with conditional OR filters
    # Note: frappe.get_all only supports ONE or_filters parameter
    # Priority order: variant_of filters > end_of_life filters
    query_kwargs = {
        "doctype": "Item",
        "filters": filters,
        "fields": fields,
        "order_by": "item_name asc",
        "limit_page_length": 1000,  # Reasonable limit
    }
    
    # Priority: mode-specific OR filters (variant_of for template mode)
    if mode == "template" and or_filters_variant:
        query_kwargs["or_filters"] = or_filters_variant
    # Otherwise use end_of_life OR filters if available
    elif or_filters_eol:
        query_kwargs["or_filters"] = or_filters_eol
    
    items = frappe.get_all(**query_kwargs)
    
    # Post-query filtering for POS Menu Profile (if not handled in query)
    if pos_menu_profile and item_meta.has_field("pos_menu_profile"):
        items = [
            item for item in items
            if not item.get("pos_menu_profile") or item.get("pos_menu_profile") == pos_menu_profile
        ]
    
    initial_count = len(items)
    
    # Search term filter (client-side for flexibility)
    if search_term:
        search_term_lower = search_term.lower()
        items = [
            item for item in items
            if (
                search_term_lower in (item.get("item_code") or "").lower()
                or search_term_lower in (item.get("item_name") or "").lower()
                or search_term_lower in (item.get("description") or "").lower()
            )
        ]
    
    # Enrich with pricing
    if price_list and items:
        # Get item codes
        item_codes = [item["name"] for item in items]
        
        # Fetch prices in bulk
        prices = frappe.get_all(
            "Item Price",
            filters={
                "item_code": ["in", item_codes],
                "price_list": price_list,
            },
            fields=["item_code", "price_list_rate"]
        )
        
        # Map prices to items
        price_map = {p["item_code"]: p["price_list_rate"] for p in prices}
        
        for item in items:
            item["price_list_rate"] = price_map.get(item["name"], None)
            # Fallback to standard_rate if no price list rate
            if item["price_list_rate"] is None:
                item["price_list_rate"] = item.get("standard_rate", 0)
    else:
        # No price list, use standard_rate
        for item in items:
            item["price_list_rate"] = item.get("standard_rate", 0)
    
    # Strict pricing mode (production best practice)
    # Filter out items with zero/missing price if require_price=1
    if cint(require_price):
        items_before_price_filter = len(items)
        items = [
            item for item in items
            if flt(item.get("price_list_rate", 0)) > 0
        ]
        items_after_price_filter = len(items)
        
        # Log warning if items were filtered out (production issue)
        if items_before_price_filter > items_after_price_filter:
            frappe.logger().warning(
                f"[get_pos_items] Strict pricing mode: Filtered out "
                f"{items_before_price_filter - items_after_price_filter} items with zero/missing price. "
                f"Price list: {price_list}"
            )
    
    # Enrich with variant attributes for variant mode or sellable mode
    # This allows UI to display attribute badges/filters
    if mode in ("variant", "sellable") and items:
        item_codes = [item["name"] for item in items]
        
        # Fetch all attributes for these items in bulk
        variant_attributes = frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "attribute", "attribute_value"]
        )
        
        # Group attributes by item
        attr_map = {}
        for attr in variant_attributes:
            parent = attr["parent"]
            if parent not in attr_map:
                attr_map[parent] = {}
            attr_map[parent][attr["attribute"]] = attr["attribute_value"]
        
        # Add attributes to items
        for item in items:
            item["attributes"] = attr_map.get(item["name"], {})
    
    # Return with optional debug metadata
    if cint(debug):
        return {
            "items": items,
            "debug": {
                "mode": mode,
                "item_code": item_code if mode == "variant" else None,
                "total_before_search": initial_count,
                "total_after_search": len(items),
                "filters_applied": {
                    "item_group": item_group,
                    "search_term": search_term,
                    "require_menu_category": bool(cint(require_menu_category)),
                    "require_price": bool(cint(require_price)),
                    "pos_menu_profile": pos_menu_profile,
                },
                "price_list": price_list,
                "pos_profile": pos_profile,
                "pos_menu_profile": pos_menu_profile,
            }
        }
    
    return items
