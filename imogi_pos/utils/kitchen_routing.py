import frappe
from typing import Optional, Tuple

from frappe.utils import cstr

from imogi_pos.utils.restaurant_settings import get_restaurant_settings


def get_menu_category_kitchen_station(item_code: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return the kitchen and station mapped to an item's menu category."""
    if not item_code:
        return None, None

    menu_category = frappe.db.get_value("Item", item_code, "menu_category")
    if not menu_category:
        return None, None

    settings = get_restaurant_settings()
    if not settings:
        return None, None

    routes = getattr(settings, "menu_category_routes", None) or []
    menu_category_normalized = cstr(menu_category).strip().casefold()

    for route in routes:
        route_category = cstr(getattr(route, "menu_category", "")).strip()
        if not route_category:
            continue

        if route_category.casefold() == menu_category_normalized:
            kitchen = getattr(route, "kitchen", None) or None
            kitchen_station = getattr(route, "kitchen_station", None) or None
            return kitchen, kitchen_station

    return None, None
