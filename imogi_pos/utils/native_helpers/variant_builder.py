# -*- coding: utf-8 -*-
"""Helper utilities for working with native ERPNext Item Variants."""

from __future__ import unicode_literals
import frappe
from frappe import _


def ensure_attribute_exists(attribute_name, attribute_values=None):
    """Ensure an Item Attribute exists, create if not.
    
    Args:
        attribute_name (str): Name of the attribute (e.g., "Size", "Spice Level")
        attribute_values (list, optional): List of attribute values to add
        
    Returns:
        frappe.Document: Item Attribute document
    """
    if frappe.db.exists("Item Attribute", attribute_name):
        attr_doc = frappe.get_doc("Item Attribute", attribute_name)
    else:
        attr_doc = frappe.new_doc("Item Attribute")
        attr_doc.attribute_name = attribute_name
        attr_doc.insert(ignore_permissions=True)
    
    # Add values if provided
    if attribute_values:
        existing_values = {v.attribute_value for v in attr_doc.item_attribute_values}
        
        for value in attribute_values:
            if value not in existing_values:
                attr_doc.append("item_attribute_values", {
                    "attribute_value": value,
                    "abbr": value[:3].upper()
                })
        
        if len(attr_doc.item_attribute_values) != len(existing_values):
            attr_doc.save(ignore_permissions=True)
    
    return attr_doc


def ensure_attribute_value_exists(attribute_name, attribute_value):
    """Ensure a specific attribute value exists.
    
    Args:
        attribute_name (str): Name of the attribute
        attribute_value (str): Value to ensure exists
        
    Returns:
        bool: True if value exists or was added
    """
    attr_doc = ensure_attribute_exists(attribute_name)
    
    existing_values = {v.attribute_value for v in attr_doc.item_attribute_values}
    
    if attribute_value not in existing_values:
        attr_doc.append("item_attribute_values", {
            "attribute_value": attribute_value,
            "abbr": attribute_value[:3].upper()
        })
        attr_doc.save(ignore_permissions=True)
    
    return True


def create_item_template(item_code, item_name=None, attributes=None, **kwargs):
    """Create an Item template with variants.
    
    Args:
        item_code (str): Item code for the template
        item_name (str, optional): Item name, defaults to item_code
        attributes (list): List of attribute names for this template
        **kwargs: Additional item fields
        
    Returns:
        frappe.Document: Item template document
    """
    if frappe.db.exists("Item", item_code):
        item_doc = frappe.get_doc("Item", item_code)
        
        # Update to template if not already
        if not item_doc.has_variants:
            item_doc.has_variants = 1
    else:
        item_doc = frappe.new_doc("Item")
        item_doc.item_code = item_code
        item_doc.item_name = item_name or item_code
        item_doc.has_variants = 1
        item_doc.stock_uom = kwargs.pop("stock_uom", "Nos")
        item_doc.item_group = kwargs.pop("item_group", "Products")
        
        # Set additional fields
        for key, value in kwargs.items():
            if hasattr(item_doc, key):
                setattr(item_doc, key, value)
    
    # Add attributes
    if attributes:
        existing_attrs = {a.attribute for a in item_doc.attributes}
        
        for attr_name in attributes:
            if attr_name not in existing_attrs:
                # Ensure attribute exists
                ensure_attribute_exists(attr_name)
                
                item_doc.append("attributes", {
                    "attribute": attr_name
                })
    
    item_doc.save(ignore_permissions=True)
    return item_doc


def create_item_variant(template, attributes, variant_code=None, **kwargs):
    """Create a variant for an item template.
    
    Args:
        template (str): Template item code
        attributes (dict): Dict of attribute_name: attribute_value
        variant_code (str, optional): Specific variant code, auto-generated if None
        **kwargs: Additional fields (rate, image, etc.)
        
    Returns:
        frappe.Document: Item variant document
    """
    # Get template
    template_doc = frappe.get_doc("Item", template)
    
    if not template_doc.has_variants:
        frappe.throw(_("Item {0} is not a template").format(template))
    
    # Ensure all attribute values exist
    for attr_name, attr_value in attributes.items():
        ensure_attribute_value_exists(attr_name, attr_value)
    
    # Generate variant code if not provided
    if not variant_code:
        variant_suffix = "-".join(str(v) for v in attributes.values())
        variant_code = f"{template}-{variant_suffix}"
    
    # Check if variant already exists
    if frappe.db.exists("Item", variant_code):
        variant_doc = frappe.get_doc("Item", variant_code)
    else:
        # Create variant using ERPNext's built-in method
        variant_doc = frappe.new_doc("Item")
        variant_doc.variant_of = template
        variant_doc.item_code = variant_code
        variant_doc.item_name = f"{template_doc.item_name} - {' '.join(attributes.values())}"
        variant_doc.stock_uom = template_doc.stock_uom
        variant_doc.item_group = template_doc.item_group
        
        # Copy fields from template
        copy_fields = [
            "description", "item_group", "default_kitchen", 
            "default_kitchen_station", "image"
        ]
        
        for field in copy_fields:
            if hasattr(template_doc, field):
                template_value = getattr(template_doc, field, None)
                if template_value:
                    setattr(variant_doc, field, template_value)
        
        # Add variant attributes
        for attr_name, attr_value in attributes.items():
            variant_doc.append("attributes", {
                "attribute": attr_name,
                "attribute_value": attr_value
            })
        
        # Set custom fields
        if "standard_rate" in kwargs:
            variant_doc.standard_rate = kwargs.pop("standard_rate")
        
        for key, value in kwargs.items():
            if hasattr(variant_doc, key):
                setattr(variant_doc, key, value)
        
        variant_doc.insert(ignore_permissions=True)
    
    return variant_doc


def get_or_create_variant(template, attributes, **kwargs):
    """Get existing variant or create if doesn't exist.
    
    Args:
        template (str): Template item code
        attributes (dict): Dict of attribute_name: attribute_value
        **kwargs: Additional fields for creation
        
    Returns:
        frappe.Document: Item variant document
    """
    # Try to find existing variant by attributes
    variant_filters = {
        "variant_of": template,
        "disabled": 0
    }
    
    variants = frappe.get_all("Item", filters=variant_filters, fields=["name"])
    
    # Check each variant for matching attributes
    for variant in variants:
        variant_attrs = frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": variant.name},
            fields=["attribute", "attribute_value"]
        )
        
        variant_attr_dict = {
            attr.attribute: attr.attribute_value 
            for attr in variant_attrs
        }
        
        if variant_attr_dict == attributes:
            return frappe.get_doc("Item", variant.name)
    
    # Variant not found, create new
    return create_item_variant(template, attributes, **kwargs)


def get_variants_for_template(template, filters=None):
    """Get all variants for a template.
    
    Args:
        template (str): Template item code
        filters (dict, optional): Additional filters
        
    Returns:
        list: List of variant documents
    """
    base_filters = {"variant_of": template, "disabled": 0}
    
    if filters:
        base_filters.update(filters)
    
    variants = frappe.get_all(
        "Item",
        filters=base_filters,
        fields=["name", "item_name", "item_code", "standard_rate", "image"]
    )
    
    # Enrich with attributes
    for variant in variants:
        attrs = frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": variant.name},
            fields=["attribute", "attribute_value"]
        )
        variant["attributes"] = {a.attribute: a.attribute_value for a in attrs}
    
    return variants


def delete_variant(variant_code, force=False):
    """Delete a variant safely.
    
    Args:
        variant_code (str): Variant item code
        force (bool): Force delete even if linked
        
    Returns:
        bool: True if deleted successfully
    """
    if not frappe.db.exists("Item", variant_code):
        return False
    
    variant_doc = frappe.get_doc("Item", variant_code)
    
    if not variant_doc.variant_of:
        frappe.throw(_("Item {0} is not a variant").format(variant_code))
    
    # Check for linked documents if not forcing
    if not force:
        # Check if used in orders, invoices, etc.
        linked_docs = frappe.get_all(
            "POS Order Item",
            filters={"item": variant_code},
            limit=1
        )
        
        if linked_docs:
            frappe.throw(
                _("Cannot delete variant {0} as it is used in orders").format(variant_code)
            )
    
    variant_doc.delete()
    return True
