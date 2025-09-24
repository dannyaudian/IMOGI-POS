# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe

from imogi_pos.utils.kitchen_routing import (
    get_menu_category_kitchen_station_by_category,
)


@frappe.whitelist(allow_guest=True)
def get_item_options(item):
    """Retrieve available options for a given item using option flags.

    The Item document may define flags ``has_size_option``, ``has_spice_option``,
    ``has_topping_option``, ``has_sugar_option`` and ``has_ice_option``. When a
    flag is enabled, the corresponding child table (``item_size_options``,
    ``item_spice_options``, ``item_topping_options``, ``item_sugar_options`` or
    ``item_ice_options``) is read and returned in the response.

    Args:
        item (str): Item code or name.

    Returns:
        dict: Only contains keys for active categories with list of dictionaries
        having ``label``, ``value`` and ``price``. Options may include an
        optional ``linked_item`` when the selection should use another Item or
        BOM.
    """

    result = {}
    if not item:
        return result

    try:
        item_doc = frappe.get_cached_doc("Item", item)
    except Exception:
        return result

    def normalise_component_value(value):
        if not value:
            return None

        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            try:
                return json.loads(value)
            except ValueError:
                return value

        if isinstance(value, dict):
            return value

        normalised = []
        for component in value or []:
            if component is None:
                continue
            if hasattr(component, "as_dict"):
                component_dict = component.as_dict()
            elif isinstance(component, dict):
                component_dict = component
            else:
                component_dict = {
                    key: val
                    for key, val in getattr(component, "__dict__", {}).items()
                    if not key.startswith("_")
                }
            if component_dict:
                normalised.append(component_dict)

        return normalised or None

    def to_option(row):
        name = getattr(row, "option_name", None)
        if not name:
            return None
        price = getattr(row, "additional_price", 0) or 0
        opt = {"label": name, "value": name, "price": price}

        linked_item = getattr(row, "linked_item", None)
        if linked_item:
            opt["linked_item"] = linked_item

        qty_factor = getattr(row, "qty_factor", None)
        if qty_factor not in (None, ""):
            try:
                opt["qty_factor"] = float(qty_factor)
            except (TypeError, ValueError):
                opt["qty_factor"] = qty_factor

        for field in ("components", "components_delta"):
            payload = normalise_component_value(getattr(row, field, None))
            if payload is not None:
                opt[field] = payload

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

    if getattr(item_doc, "has_variant_option", 0):
        variant_opts = collect(getattr(item_doc, "item_variant_options", []))
        if variant_opts:
            result["variant"] = variant_opts

    if getattr(item_doc, "has_sugar_option", 0):
        sugar_opts = collect(getattr(item_doc, "item_sugar_options", []))
        if sugar_opts:
            result["sugar"] = sugar_opts

    if getattr(item_doc, "has_ice_option", 0):
        ice_opts = collect(getattr(item_doc, "item_ice_options", []))
        if ice_opts:
            result["ice"] = ice_opts

    return result

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
    """Set item option flags based on the menu category.

    Categories are defined in :data:`MENU_FLAG_MAP`.

    Args:
        doc (frappe.model.document.Document): The Item document being saved.
        method (str, optional): The event method name (unused).
    """
    category = (doc.get("menu_category") or "").lower()
    flags = MENU_FLAG_MAP.get(category, {})
    for base in ("has_size", "has_spice", "has_topping", "has_sugar", "has_ice"):
        doc.set(f"{base}_option", flags.get(base, 0))

    kitchen, kitchen_station = get_menu_category_kitchen_station_by_category(
        doc.get("menu_category")
    )

    if kitchen and not (doc.get("default_kitchen")):
        doc.set("default_kitchen", kitchen)

    if kitchen_station and not (doc.get("default_kitchen_station")):
        doc.set("default_kitchen_station", kitchen_station)
