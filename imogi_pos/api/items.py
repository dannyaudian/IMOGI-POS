# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe


@frappe.whitelist(allow_guest=True)
def get_item_options(item):
    """Retrieve available options for a given item using option flags.

    The Item document may define flags ``has_size_option``, ``has_spice_option``
    and ``has_topping_option``. When a flag is enabled, the corresponding child
    table (``item_size_options``, ``item_spice_options`` or
    ``item_topping_options``) is read and returned in the response.

    Args:
        item (str): Item code or name.

    Returns:
        dict: Only contains keys for active categories with list of dictionaries
        having ``label``, ``value`` and ``price``.
    """

    result = {}
    if not item:
        return result

    try:
        item_doc = frappe.get_cached_doc("Item", item)
    except Exception:
        return result

    def to_option(row):
        name = getattr(row, "option_name", None)
        if not name:
            return None
        price = getattr(row, "additional_price", 0) or 0
        opt = {"label": name, "value": name, "price": price}

        # Some child tables may provide a flag indicating a default option.
        # The field name can vary (``default``/``is_default``), so we check
        # both to keep the helper generic. When present, the option is marked
        # so the frontend can auto-select it on load.
        if getattr(row, "default", None) or getattr(row, "is_default", None):
            opt["default"] = 1

        return opt

    def collect(child_rows):
        return [opt for opt in (to_option(row) for row in child_rows or []) if opt]

    if getattr(item_doc, "has_size_option", 0):
        size_opts = collect(getattr(item_doc, "item_size_options", []))
        if size_opts:
            result["size"] = size_opts

    if getattr(item_doc, "has_spice_option", 0):
        spice_opts = collect(getattr(item_doc, "item_spice_options", []))
        if spice_opts:
            result["spice"] = spice_opts

    if getattr(item_doc, "has_topping_option", 0):
        topping_opts = collect(getattr(item_doc, "item_topping_options", []))
        if topping_opts:
            result["topping"] = topping_opts

    return result

# Mapping of menu categories to default item option flags.
#
# Categories:
# - ``dessert``: enables ``has_size`` and ``has_topping``
# - ``beverage``: enables ``has_size``
# - ``main course`` / ``appetizer``: enable ``has_spice``
# - ``special``: enables ``has_size``, ``has_spice`` and ``has_topping``
MENU_FLAG_MAP = {
    "dessert": {"has_size": 1, "has_topping": 1},
    "beverage": {"has_size": 1},
    "main course": {"has_spice": 1},
    "appetizer": {"has_spice": 1},
    "special": {"has_size": 1, "has_spice": 1, "has_topping": 1},
    "Allura": {"has_size": 1, "has_topping": 1},
    "Sugus": {"has_size": 1, "has_topping": 1},
    "Tea": {"has_size": 1, "has_topping": 1},
    "Coffee": {"has_size": 1, "has_topping": 1},  # Coffee usually has size and topping
}


def set_item_flags(doc, method=None):
    """Set item option flags based on the menu category.

    Categories are defined in :data:`MENU_FLAG_MAP`.

    Args:
        doc (frappe.model.document.Document): The Item document being saved.
        method (str, optional): The event method name (unused).
    """
    category = (doc.get("menu_category") or "").lower()
    flags = MENU_FLAG_MAP.get(category, {})
    for base in ("has_size", "has_spice", "has_topping"):
        doc.set(f"{base}_option", flags.get(base, 0))
