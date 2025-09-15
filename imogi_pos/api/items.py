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
        having ``option_name`` and ``additional_price``.
    """

    result = {}
    if not item:
        return result

    try:
        item_doc = frappe.get_doc("Item", item)
    except Exception:
        return result

    def collect(child_rows):
        options = []
        for row in child_rows or []:
            name = getattr(row, "option_name", None)
            if not name:
                continue
            price = getattr(row, "additional_price", 0)
            options.append({"option_name": name, "additional_price": price})
        return options

    if getattr(item_doc, "has_size_option", 0):
        size_opts = collect(getattr(item_doc, "item_size_options", []))
        if size_opts:
            result["sizes"] = size_opts

    if getattr(item_doc, "has_spice_option", 0):
        spice_opts = collect(getattr(item_doc, "item_spice_options", []))
        if spice_opts:
            result["spices"] = spice_opts

    if getattr(item_doc, "has_topping_option", 0):
        topping_opts = collect(getattr(item_doc, "item_topping_options", []))
        if topping_opts:
            result["toppings"] = topping_opts

    return result

