# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe


def _get_child_field_values(child_list, fieldname):
    """Helper to extract field values from a child table list."""
    values = []
    for row in child_list or []:
        value = getattr(row, fieldname, None) or getattr(row, "name", None)
        if value:
            values.append(value)
    return values


@frappe.whitelist(allow_guest=True)
def get_item_options(item):
    """Retrieve available options for a given item.

    Args:
        item (str): Item code or name

    Returns:
        dict: Dictionary with keys ``sizes``, ``spice_levels`` and ``toppings``.
    """
    result = {"sizes": [], "spice_levels": [], "toppings": []}

    if not item:
        return result

    try:
        item_doc = frappe.get_doc("Item", item)
    except Exception:
        # Item not found, return empty options
        return result

    # --- Fetch sizes and spice levels from Item Option doctype if available
    try:
        options = frappe.get_all(
            "Item Option",
            filters={"item": item},
            fields=["option_type", "option"],
        )
        for opt in options:
            opt_type = (opt.get("option_type") or "").lower()
            option = opt.get("option")
            if not option:
                continue
            if opt_type == "size":
                result["sizes"].append(option)
            elif opt_type in ("spice", "spice level", "spice_level"):
                result["spice_levels"].append(option)
    except Exception:
        pass

    # --- Fetch toppings from Item Topping doctype if available
    try:
        toppings = frappe.get_all(
            "Item Topping", filters={"item": item}, pluck="topping"
        )
        if toppings:
            result["toppings"].extend(toppings)
    except Exception:
        pass

    # --- Fallback to fields/child tables on Item document
    if not result["sizes"] and hasattr(item_doc, "sizes"):
        sizes_field = item_doc.sizes
        if isinstance(sizes_field, list):
            result["sizes"] = _get_child_field_values(sizes_field, "size")
        elif isinstance(sizes_field, str):
            result["sizes"] = [s.strip() for s in sizes_field.split(",") if s.strip()]

    if not result["spice_levels"] and hasattr(item_doc, "spice_levels"):
        spice_field = item_doc.spice_levels
        if isinstance(spice_field, list):
            result["spice_levels"] = _get_child_field_values(spice_field, "spice_level")
        elif isinstance(spice_field, str):
            result["spice_levels"] = [s.strip() for s in spice_field.split(",") if s.strip()]

    if not result["toppings"] and hasattr(item_doc, "toppings"):
        toppings_field = item_doc.toppings
        if isinstance(toppings_field, list):
            result["toppings"] = _get_child_field_values(toppings_field, "topping")
        elif isinstance(toppings_field, str):
            result["toppings"] = [t.strip() for t in toppings_field.split(",") if t.strip()]

    return result


# Mapping of menu categories to default item option flags
MENU_FLAG_MAP = {
    "dessert": {"has_size": 1, "has_topping": 1},
    "beverage": {"has_size": 1},
    "main course": {"has_spice": 1},
    "appetizer": {"has_spice": 1},
}


def set_item_flags(doc, method=None):
    """Set item option flags based on the menu category.

    Args:
        doc (frappe.model.document.Document): The Item document being saved.
        method (str, optional): The event method name (unused).
    """
    category = (doc.get("menu_category") or "").lower()
    flags = MENU_FLAG_MAP.get(category, {})
    for field in ("has_size", "has_spice", "has_topping"):
        doc.set(field, flags.get(field, 0))
