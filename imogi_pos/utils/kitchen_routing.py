import frappe
from typing import Optional, Tuple

from frappe.utils import cstr

from imogi_pos.utils.restaurant_settings import get_restaurant_settings


def get_item_group_kitchen_station_by_group(
    item_group: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """Return the kitchen/station mapped to the provided item group."""
    if not item_group:
        return None, None

    settings = get_restaurant_settings()
    if not settings:
        return None, None

    routes = getattr(settings, "item_group_routes", None) or []
    item_group_normalized = cstr(item_group).strip().casefold()

    for route in routes:
        route_group = cstr(getattr(route, "item_group", "")).strip()
        if not route_group:
            continue

        if route_group.casefold() == item_group_normalized:
            kitchen = getattr(route, "kitchen", None) or None
            kitchen_station = getattr(route, "kitchen_station", None) or None
            return kitchen, kitchen_station

    return None, None


def get_item_group_kitchen_station(item_code: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return the kitchen and station mapped to an item's item group."""
    if not item_code:
        return None, None

    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return None, None

    return get_item_group_kitchen_station_by_group(item_group)


# Backward compatibility aliases
get_menu_category_kitchen_station_by_category = get_item_group_kitchen_station_by_group
get_menu_category_kitchen_station = get_item_group_kitchen_station

