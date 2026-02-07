# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint, flt
from imogi_pos.api.billing import get_bom_capacity_summary
from imogi_pos.api.items import _channel_matches
from imogi_pos.api.pricing import get_price_list_rate_maps
from imogi_pos.utils.permission_manager import check_branch_access

def get_order_branch(pos_order):
    """
    Gets the branch for a POS Order.
    
    Args:
        pos_order (str): POS Order name
    
    Returns:
        str: Branch name
    
    Raises:
        frappe.DoesNotExistError: If POS Order not found
    """
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    branch = frappe.db.get_value("POS Order", pos_order, "branch")
    if not branch:
        frappe.throw(_("POS Order not found or has no branch"), frappe.DoesNotExistError)

    return branch

def get_variant_picker_config(item_template):
    """
    Gets configuration for the variant picker for a template item.
    
    Args:
        item_template (str): Item Template code
    
    Returns:
        dict: Variant picker configuration with attributes and options
    
    Raises:
        frappe.ValidationError: If item is not a template
    """
    # Check if item is a template
    is_template = frappe.db.get_value("Item", item_template, "has_variants")
    if not is_template:
        frappe.throw(_("Item {0} is not a template").format(item_template), frappe.ValidationError)
    
    # Get item attributes
    attributes = []
    item_doc = frappe.get_doc("Item", item_template)
    
    for attr in item_doc.attributes:
        attribute_doc = frappe.get_doc("Item Attribute", attr.attribute)
        
        # Get attribute values
        values = []
        if attribute_doc.numeric_values:
            from_value = cint(attr.from_range)
            to_value = cint(attr.to_range)
            increment = cint(attr.increment)
            
            for val in range(from_value, to_value + 1, increment):
                values.append({
                    "value": val,
                    "abbr": str(val),
                    "label": str(val) + " " + (attribute_doc.numeric_values_suffix or "")
                })
        else:
            # Get attribute values from Item Attribute Values
            for attr_value in attribute_doc.item_attribute_values:
                values.append({
                    "value": attr_value.attribute_value,
                    "abbr": attr_value.abbr,
                    "label": attr_value.attribute_value
                })
        
        attributes.append({
            "name": attr.attribute,
            "label": attribute_doc.attribute_name,
            "field_name": attr.attribute.lower().replace(" ", "_"),
            "values": values,
            "required": 1  # All attributes are required for variant selection
        })
    
    # Get thumbnail image if available
    thumbnail = item_doc.image or None
    
    return {
        "template": item_template,
        "template_name": item_doc.item_name,
        "attributes": attributes,
        "thumbnail": thumbnail,
        "description": item_doc.description,
        "has_variants": len(attributes) > 0
    }

@frappe.whitelist(allow_guest=True)
def get_item_variants(item_template=None, price_list=None, base_price_list=None, **kwargs):
    """
    Gets all variants for a template item.
    
    Args:
        item_template (str): Item Template code
    
    Returns:
        list: List of item variants with attributes
    
    Raises:
        frappe.ValidationError: If item is not a template
    """
    form_dict = getattr(frappe, "form_dict", {}) or {}

    base_price_list = (
        base_price_list
        or kwargs.get("base_price_list")
        or form_dict.get("base_price_list")
    )

    item_template = (
        item_template
        or kwargs.get("template_item")
        or kwargs.get("template")
        or form_dict.get("item_template")
        or form_dict.get("template_item")
        or form_dict.get("template")
    )

    if not item_template:
        frappe.throw(_("Item template is required"), frappe.ValidationError)

    # Check if item is a template
    is_template = frappe.db.get_value("Item", item_template, "has_variants")
    if not is_template:
        frappe.throw(_("Item {0} is not a template").format(item_template), frappe.ValidationError)
    
    # Get attribute configuration
    attr_config = get_variant_picker_config(item_template)
    attributes = attr_config.get("attributes", [])
    
    # Get all variants
    variants = frappe.get_all(
        "Item",
        filters={"variant_of": item_template, "disabled": 0},
        fields=[
            "name",
            "item_name",
            "image",
            "item_code",
            "description",
            "standard_rate",
            "stock_uom",
        ],
    )

    variant_names = [variant.name for variant in variants]

    rate_maps = get_price_list_rate_maps(
        variant_names,
        price_list=price_list,
        base_price_list=base_price_list,
    )

    rate_map = rate_maps["price_list_rates"]
    currency_map = rate_maps["price_list_currencies"]
    base_rate_map = rate_maps["base_price_list_rates"]
    base_currency_map = rate_maps["base_price_list_currencies"]

    # Enrich variants with their attribute values
    for variant in variants:
        item_code = variant["name"]

        # Get attribute values for this variant
        attr_values = frappe.get_all("Item Variant Attribute", 
                                   filters={"parent": item_code},
                                   fields=["attribute", "attribute_value"])
        
        # Create a dict of attribute values
        variant_attrs = {}
        for attr in attr_values:
            variant_attrs[attr.attribute] = attr.attribute_value
        
        variant["attributes"] = variant_attrs
        
        # Check if this variant has menu category, kitchen, etc.
        routing = frappe.db.get_value("Item", item_code,
                                   ["menu_category", "default_kitchen", "default_kitchen_station"],
                                   as_dict=True)
        if routing:
            variant.update(routing)

        base_standard_rate = flt(variant.get("standard_rate"))
        fallback_currency = None
        if not base_standard_rate and base_rate_map:
            if item_code in base_rate_map:
                base_standard_rate = flt(base_rate_map[item_code])
                fallback_currency = base_currency_map.get(item_code)

        if not flt(variant.get("standard_rate")) and base_standard_rate:
            variant["standard_rate"] = base_standard_rate

        variant["imogi_base_standard_rate"] = base_standard_rate
        variant["has_explicit_price_list_rate"] = 0
        if fallback_currency and not variant.get("currency"):
            variant["currency"] = fallback_currency

        if item_code in rate_map:
            explicit_rate = flt(rate_map[item_code])
            variant["standard_rate"] = explicit_rate
            variant["imogi_base_standard_rate"] = explicit_rate
            variant["has_explicit_price_list_rate"] = 1
            if currency_map.get(item_code):
                variant["currency"] = currency_map[item_code]

        # Provide a ``rate`` alias for compatibility with clients expecting this field
        variant["rate"] = variant.get("standard_rate")

    return {
        "template": item_template,
        "attributes": attributes,
        "variants": variants
    }

@frappe.whitelist()
def choose_variant_for_order_item(pos_order, order_item_row, selected_attributes=None, variant_item=None):
    """
    Replaces a template item line with the selected variant in a POS Order.
    Either selected_attributes or variant_item must be provided.
    
    Args:
        pos_order (str): POS Order name
        order_item_row (str): POS Order Item row name
        selected_attributes (dict or str, optional): Selected attribute values. Defaults to None.
        variant_item (str, optional): Direct variant item code. Defaults to None.
    
    Returns:
        dict: Updated POS Order Item details
    
    Raises:
        frappe.ValidationError: If neither attributes nor variant are provided,
                              or if template item cannot be replaced
    """
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    # Get order details for branch validation
    branch = get_order_branch(pos_order)
    check_branch_access(branch)
    
    # Get the current order item
    order_item = frappe.get_doc("POS Order Item", order_item_row)
    if not order_item:
        frappe.throw(_("Order item row not found"), frappe.ValidationError)
    
    # Get the parent order
    order_doc = frappe.get_doc("POS Order", pos_order)
    
    # Verify this is a template item
    item_code = order_item.item
    is_template = frappe.db.get_value("Item", item_code, "has_variants")
    
    if not is_template:
        frappe.throw(_("Item {0} is not a template and cannot be replaced with a variant").format(item_code), 
                    frappe.ValidationError)
    
    # Determine the variant item
    variant = None
    
    # If variant_item is provided directly
    if variant_item:
        # Verify this is a variant of the template
        variant_of = frappe.db.get_value("Item", variant_item, "variant_of")
        if variant_of != item_code:
            frappe.throw(_("Item {0} is not a variant of {1}").format(variant_item, item_code), 
                        frappe.ValidationError)
        
        variant = frappe.get_doc("Item", variant_item)
    
    # If selected_attributes is provided
    elif selected_attributes:
        # Parse selected attributes if passed as string
        if isinstance(selected_attributes, str):
            import json
            selected_attributes = json.loads(selected_attributes)
        
        if not selected_attributes:
            frappe.throw(_("No attributes selected for variant"), frappe.ValidationError)
        
        # Find the matching variant based on selected attributes
        template_doc = frappe.get_doc("Item", item_code)
        
        # Build candidate variants by intersecting attribute matches
        candidate_variants = None
        for attr in template_doc.attributes:
            attr_name = attr.attribute
            if attr_name not in selected_attributes:
                frappe.throw(_("Required attribute {0} not provided").format(attr_name),
                            frappe.ValidationError)

            attr_value = selected_attributes[attr_name]
            attr_rows = frappe.get_all(
                "Item Variant Attribute",
                filters={
                    "attribute": attr_name,
                    "attribute_value": attr_value,
                },
                fields=["parent"],
            )

            matching_variants = {row.parent for row in attr_rows}
            if not matching_variants:
                candidate_variants = set()
                break

            if candidate_variants is None:
                candidate_variants = matching_variants
            else:
                candidate_variants &= matching_variants

            if not candidate_variants:
                break

        candidate_variants = candidate_variants or set()

        if not candidate_variants:
            frappe.throw(_("No variant found with the selected attributes"), frappe.ValidationError)

        # Find variant that matches all attributes and belongs to the template
        variants = frappe.get_all(
            "Item",
            filters={
                "name": ["in", sorted(candidate_variants)],
                "variant_of": item_code,
                "disabled": 0,
            },
            fields=["name"],
        )

        if not variants:
            frappe.throw(_("No variant found with the selected attributes"), frappe.ValidationError)
        
        # Use the first matching variant
        variant = frappe.get_doc("Item", variants[0].name)
    
    else:
        frappe.throw(_("Either selected_attributes or variant_item must be provided"), 
                    frappe.ValidationError)
    
    # Now replace the template with the variant in the order
    
    # Keep original quantity, notes, etc.
    original_qty = order_item.qty
    original_notes = order_item.notes or ""
    
    # Update order item with variant details
    order_item.item = variant.name
    order_item.item_name = variant.item_name
    order_item.description = variant.description or variant.item_name
    
    # Update price if standard_rate is available
    if variant.standard_rate:
        order_item.rate = variant.standard_rate
        order_item.amount = variant.standard_rate * original_qty
    
    # Update kitchen routing if available
    if hasattr(variant, 'default_kitchen') and variant.default_kitchen:
        order_item.kitchen = variant.default_kitchen
    
    if hasattr(variant, 'default_kitchen_station') and variant.default_kitchen_station:
        order_item.kitchen_station = variant.default_kitchen_station
    
    # Save the updated order item
    order_item.save()
    
    # Return the updated order item
    return {
        "success": True,
        "message": _("Template replaced with variant successfully"),
        "order_item": order_item.as_dict(),
        "variant_item": variant.name,
        "variant_name": variant.item_name
    }

@frappe.whitelist()
def find_template_for_variant(variant_item):
    """
    Finds the template for a variant item.
    Useful when scanning a variant barcode directly.
    
    Args:
        variant_item (str): Variant item code
    
    Returns:
        dict: Template information with variant details
    
    Raises:
        frappe.ValidationError: If item is not a variant
    """
    # Get the variant's template
    template = frappe.db.get_value("Item", variant_item, "variant_of")
    
    if not template:
        frappe.throw(_("Item {0} is not a variant").format(variant_item), frappe.ValidationError)
    
    # Get the template details
    template_doc = frappe.get_doc("Item", template)
    
    # Get the variant details
    variant_doc = frappe.get_doc("Item", variant_item)
    
    # Get attribute values for this variant
    attr_values = frappe.get_all("Item Variant Attribute", 
                               filters={"parent": variant_item},
                               fields=["attribute", "attribute_value"])
    
    # Create a dict of attribute values
    variant_attrs = {}
    for attr in attr_values:
        variant_attrs[attr.attribute] = attr.attribute_value
    
    return {
        "template": template,
        "template_name": template_doc.item_name,
        "variant": variant_item,
        "variant_name": variant_doc.item_name,
        "attributes": variant_attrs,
        "image": variant_doc.image or template_doc.image
    }

@frappe.whitelist(allow_guest=True)
def get_item_groups(pos_profile=None):
    """
    Get item groups that have items available for POS.
    Only returns groups that have template or non-variant items.
    
    Args:
        pos_profile (str): POS Profile (optional, for future filtering)
    
    Returns:
        list: Item groups with item counts
    """
    # Get all item groups that have items (excluding variant children)
    item_groups = frappe.db.sql("""
        SELECT DISTINCT 
            i.item_group as name,
            ig.item_group_name,
            COUNT(i.name) as item_count
        FROM `tabItem` i
        INNER JOIN `tabItem Group` ig ON i.item_group = ig.name
        WHERE i.disabled = 0
            AND i.is_sales_item = 1
            AND (i.variant_of IS NULL OR i.variant_of = '')
        GROUP BY i.item_group, ig.item_group_name
        HAVING item_count > 0
        ORDER BY ig.item_group_name
    """, as_dict=True)
    
    return item_groups