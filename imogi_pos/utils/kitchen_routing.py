import frappe
from typing import Optional, Tuple

from frappe.utils import cstr


def get_item_group_kitchen_station_by_group(
    item_group: Optional[str],
    pos_profile: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return the kitchen/station mapped to the provided item group from POS Profile routes."""
    if not item_group:
        return None, None

    # Get POS Profile if not provided (from operational context)
    if not pos_profile:
        try:
            from imogi_pos.utils.operational_context import get_operational_context
            ctx = get_operational_context()
            pos_profile = ctx.get("pos_profile") if ctx else None
        except Exception:
            pos_profile = None
    
    if not pos_profile:
        # Fallback: no kitchen routing available
        return None, None

    # Get routes from POS Profile child table
    try:
        routes = frappe.db.get_list(
            "POS Profile Item Group Route",
            filters={"parent": pos_profile},
            fields=["item_group", "kitchen", "kitchen_station"]
        )
    except Exception:
        # If child table doesn't exist or error, return None
        routes = []
    
    if not routes:
        return None, None

    item_group_normalized = cstr(item_group).strip().casefold()

    for route in routes:
        route_group = cstr(route.get("item_group", "")).strip()
        if not route_group:
            continue

        if route_group.casefold() == item_group_normalized:
            kitchen = route.get("kitchen") or None
            kitchen_station = route.get("kitchen_station") or None
            return kitchen, kitchen_station

    return None, None


def get_item_group_kitchen_station(
    item_code: Optional[str],
    pos_profile: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Return the kitchen and station mapped to an item's item group."""
    if not item_code:
        return None, None

    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return None, None

    return get_item_group_kitchen_station_by_group(item_group, pos_profile)


# Backward compatibility aliases - now with pos_profile support
def get_menu_category_kitchen_station_by_category(menu_category: Optional[str], pos_profile: Optional[str] = None):
    """Backward compat: menu_category links to Menu Category, get its routing"""
    if not menu_category:
        return None, None
    
    # Get item group from menu category if needed - for now return defaults from Menu Category doctype
    try:
        doc = frappe.get_cached_doc("Menu Category", menu_category)
        return (
            getattr(doc, "default_kitchen", None),
            getattr(doc, "default_kitchen_station", None)
        )
    except Exception:
        return None, None


def get_menu_category_kitchen_station(item_code: Optional[str], pos_profile: Optional[str] = None):
    """Backward compat wrapper"""
    menu_category = frappe.db.get_value("Item", item_code, "menu_category") if item_code else None
    if not menu_category:
        return None, None
    return get_menu_category_kitchen_station_by_category(menu_category, pos_profile)
