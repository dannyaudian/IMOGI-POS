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


def pick_existing_fields(doctype, fields):
    """
    Defensive field picker - only return fields that exist in doctype schema.
    Prevents 500 errors when custom fields are referenced but not yet created.
    
    Args:
        doctype (str): DocType name
        fields (list): List of field names to check
        
    Returns:
        list: Only fields that exist in the doctype
    """
    if not fields:
        return []
    
    try:
        meta = frappe.get_meta(doctype)
        existing = []
        
        for field in fields:
            # Standard fields (always exist)
            if field in ("name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"):
                existing.append(field)
            # Check if field exists in meta
            elif meta.has_field(field):
                existing.append(field)
            else:
                # Log missing field for debugging (dev only)
                if frappe.conf.get("developer_mode"):
                    frappe.logger().debug(f"[pick_existing_fields] Field '{field}' not found in {doctype}")
        
        return existing
    except Exception as e:
        frappe.log_error(
            message=f"Error checking fields for {doctype}: {str(e)}\nFields: {fields}",
            title="pick_existing_fields Error"
        )
        # Fallback: return only standard fields
        return [f for f in fields if f in ("name", "owner", "creation", "modified")]


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
            - "grouped": Templates + standalone only (NO variant children) - DEFAULT for catalog
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
        - grouped: Templates + standalone ONLY (no variant children spam)
        - variant: Fetch children of a specific template (for variant picker)
        - both: For advanced scenarios
        
    Best Practices (v15):
        - Use require_price=1 in production to prevent items with missing/zero prices
        - POS Menu Profile scoping automatically applied when pos_profile is provided
        - Explicit require_menu_category flag prevents silent filtering
    """
    from frappe.utils import today, cint, flt
    
    # DEFENSIVE: Wrap entire function in try/except to prevent 500 errors
    try:
        # Validate mode parameter
        valid_modes = ("sellable", "template", "variant", "grouped", "both")
        if mode not in valid_modes:
            frappe.throw(f"Invalid mode '{mode}'. Must be one of: {', '.join(valid_modes)}")
        
        # Validate variant mode requirements
        if mode == "variant" and not item_code:
            frappe.throw("item_code is required when mode='variant'")
        
        # Get price list and POS Menu Profile from POS Profile if not provided
        pos_menu_profile = None
        if pos_profile:
            profile_fields = pick_existing_fields("POS Profile", ["selling_price_list", "pos_menu_profile"])
            if profile_fields:
                profile_data = frappe.db.get_value(
                    "POS Profile", 
                    pos_profile, 
                    profile_fields,
                    as_dict=True
                )
                if profile_data:
                    if not price_list:
                        price_list = profile_data.get("selling_price_list")
                    pos_menu_profile = profile_data.get("pos_menu_profile")
        
        # Get Item meta for defensive field checking
        item_meta = frappe.get_meta("Item")
        
        # Base filters - ALWAYS applied
        filters = [
            ["Item", "disabled", "=", 0],
            ["Item", "is_sales_item", "=", 1],
        ]
        
        # Add end_of_life filter (defensive - check if field exists)
        # ERPNext v15 pattern: Items with NULL end_of_life OR future date are valid
        or_filters_eol = None
        if item_meta.has_field("end_of_life"):
            # Use OR filters: (end_of_life IS NULL) OR (end_of_life >= today)
            or_filters_eol = [
                ["Item", "end_of_life", "is", "not set"],
                ["Item", "end_of_life", ">=", today()],
            ]
        
        # POS Menu Profile filter (v15 best practice: scope items by menu profile)
        # If POS Profile has pos_menu_profile set, filter items:
        # - Item.pos_menu_profile matches POS Profile.pos_menu_profile
        # - OR Item.pos_menu_profile is NULL/empty (treated as "global" / available to all)
        or_filters_menu = None
        if pos_menu_profile and item_meta.has_field("pos_menu_profile"):
            # Items with matching menu profile OR no menu profile (global)
            or_filters_menu = [
                ["Item", "pos_menu_profile", "=", pos_menu_profile],
                ["Item", "pos_menu_profile", "is", "not set"],
                ["Item", "pos_menu_profile", "=", ""],
            ]
        
        # Mode-specific filters
        or_filters_variant = None
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
        elif mode == "grouped":
            # NEW MODE: Templates (has_variants=1) + Standalone (has_variants=0 AND variant_of empty)
            # Exclude variant children completely
            or_filters_variant = [
                ["Item", "has_variants", "=", 1],  # Templates
                ["Item", "variant_of", "is", "not set"],  # Standalone (not a variant)
            ]
        elif mode == "variant":
            # Variant children of specific template
            filters.append(["Item", "variant_of", "=", item_code])
            filters.append(["Item", "has_variants", "=", 0])
        else:  # mode == "both"
            pass  # No additional filters
    # Item Group filter (optional)
        if item_group:
            filters.append(["Item", "item_group", "=", item_group])
        
        # Menu Category filter (optional, explicit) - defensive check
        if cint(require_menu_category) and item_meta.has_field("menu_category"):
            filters.append(["Item", "menu_category", "!=", ""])
            filters.append(["Item", "menu_category", "is", "set"])
        
        # Build fields list - DEFENSIVE: only select fields that exist
        base_fields = [
            "name",
            "item_code",
            "item_name",
            "description",
            "image",
            "stock_uom",
            "standard_rate",
            "item_group",
            "has_variants",
            "variant_of",
        ]
        
        # Add optional fields if they exist
        optional_fields = ["menu_category", "imogi_menu_channel", "pos_menu_profile"]
        
        fields = pick_existing_fields("Item", base_fields + optional_fields)
    # Execute query with conditional OR filters
        # Note: frappe.get_all only supports ONE or_filters parameter
        # Priority order: variant_of filters > menu profile filters > end_of_life filters
        query_kwargs = {
            "doctype": "Item",
            "filters": filters,
            "fields": fields,
            "order_by": "item_name asc",
            "limit_page_length": 1000,  # Reasonable limit
        }
        
        # Priority: mode-specific OR filters (variant_of for template/grouped mode)
        if or_filters_variant:
            query_kwargs["or_filters"] = or_filters_variant
        # Otherwise use menu profile OR filters if available
        elif or_filters_menu:
            query_kwargs["or_filters"] = or_filters_menu
        # Otherwise use end_of_life OR filters if available
        elif or_filters_eol:
            query_kwargs["or_filters"] = or_filters_eol
        
        items = frappe.get_all(**query_kwargs)
        
        # Post-query filtering for POS Menu Profile (if not handled in query)
        if pos_menu_profile and item_meta.has_field("pos_menu_profile") and not or_filters_menu:
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
        
        # For grouped/template mode: add is_template flag and variant_count
        if mode in ("grouped", "template") and items:
            template_items = [item for item in items if item.get("has_variants") == 1]
            
            # Add is_template and template_code flags to all items
            for item in items:
                item["is_template"] = bool(item.get("has_variants") == 1)
                item["template_code"] = item["name"] if item["is_template"] else None
            
            # Get variant counts for templates
            if template_items:
                template_names = [t["name"] for t in template_items]
                
                # Count variants per template
                variant_counts = frappe.db.sql("""
                    SELECT variant_of, COUNT(*) as variant_count
                    FROM `tabItem`
                    WHERE variant_of IN %(templates)s
                        AND disabled = 0
                    GROUP BY variant_of
                """, {"templates": template_names}, as_dict=True)
                
                count_map = {vc["variant_of"]: vc["variant_count"] for vc in variant_counts}
                
                # Add variant_count to templates
                for template in template_items:
                    template["variant_count"] = count_map.get(template["name"], 0)
        
        # Template mode: add price range from variants for display
        if mode in ("grouped", "template") and items:
            template_items = [item for item in items if item.get("has_variants") == 1]
            if template_items and price_list:
                template_names = [t["name"] for t in template_items]
                
                # Get all variants for these templates
                variant_item_codes = frappe.get_all(
                    "Item",
                    filters={"variant_of": ["in", template_names], "disabled": 0},
                    pluck="name"
                )
                
                if variant_item_codes:
                    variant_prices = frappe.get_all(
                        "Item Price",
                        filters={
                            "item_code": ["in", variant_item_codes],
                            "price_list": price_list,
                        },
                        fields=["item_code", "price_list_rate"],
                    )
                    
                    # Get variant parent mapping
                    variant_parent_map = {
                        v["name"]: v["variant_of"]
                        for v in frappe.get_all(
                            "Item",
                            filters={"variant_of": ["in", template_names], "disabled": 0},
                            fields=["name", "variant_of"]
                        )
                    }
                    
                    # Group prices by template
                    template_price_ranges = {}
                    for vp in variant_prices:
                        parent = variant_parent_map.get(vp["item_code"])
                        if parent:
                            if parent not in template_price_ranges:
                                template_price_ranges[parent] = []
                            template_price_ranges[parent].append(flt(vp["price_list_rate"]))
                    
                    # Attach price range to templates
                    for template in template_items:
                        prices = template_price_ranges.get(template["name"], [])
                        if prices:
                            min_price = min(prices)
                            max_price = max(prices)
                            template["min_rate"] = min_price
                            template["max_rate"] = max_price
                            if min_price == max_price:
                                template["price_display"] = f"Rp {min_price:,.0f}"
                            else:
                                template["price_display"] = f"Rp {min_price:,.0f} - Rp {max_price:,.0f}"
                        else:
                            template["price_display"] = "Select variant"
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
    
    except Exception as e:
        # Log full traceback for debugging
        frappe.log_error(
            message=frappe.get_traceback(),
            title=f"get_pos_items failed: {str(e)[:100]}"
        )
        
        # Return JSON error (not HTML) to frontend
        error_msg = f"get_pos_items failed: {str(e)}"
        frappe.throw(error_msg)
