# -*- coding: utf-8 -*-
"""Helper utilities for working with native ERPNext BOM (Bill of Materials)."""

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt


def create_bom(item, items, bom_name=None, qty=1.0, **kwargs):
    """Create a BOM (Bill of Materials) for an item.
    
    Args:
        item (str): Item code for the finished product
        items (list): List of dicts with item_code and qty
        bom_name (str, optional): Custom BOM name
        qty (float): Quantity produced by this BOM
        **kwargs: Additional BOM fields
        
    Returns:
        frappe.Document: BOM document
    """
    if not frappe.db.exists("Item", item):
        frappe.throw(_("Item {0} does not exist").format(item))
    
    # Check if BOM already exists for this item
    existing_bom = frappe.db.get_value("BOM", {"item": item, "is_active": 1, "is_default": 1})
    
    if existing_bom and not bom_name:
        frappe.throw(
            _("An active default BOM already exists for {0}. Use update_bom_items() to modify it.").format(item)
        )
    
    bom_doc = frappe.new_doc("BOM")
    bom_doc.item = item
    bom_doc.quantity = qty
    bom_doc.is_active = 1
    bom_doc.is_default = kwargs.pop("is_default", 1)
    bom_doc.allow_alternative_item = kwargs.pop("allow_alternative_item", 0)
    
    # Get item details
    item_doc = frappe.get_doc("Item", item)
    bom_doc.company = kwargs.pop("company", frappe.defaults.get_defaults().company)
    bom_doc.uom = item_doc.stock_uom
    
    # Add BOM items
    for bom_item in items:
        if isinstance(bom_item, dict):
            item_code = bom_item.get("item_code") or bom_item.get("item")
            item_qty = flt(bom_item.get("qty") or bom_item.get("quantity", 1))
        else:
            frappe.throw(_("BOM item must be a dictionary with item_code and qty"))
        
        if not frappe.db.exists("Item", item_code):
            frappe.throw(_("Item {0} does not exist").format(item_code))
        
        component_doc = frappe.get_doc("Item", item_code)
        
        bom_doc.append("items", {
            "item_code": item_code,
            "qty": item_qty,
            "uom": component_doc.stock_uom,
            "rate": component_doc.valuation_rate or component_doc.standard_rate or 0,
            "stock_uom": component_doc.stock_uom,
        })
    
    # Set additional fields
    for key, value in kwargs.items():
        if hasattr(bom_doc, key):
            setattr(bom_doc, key, value)
    
    bom_doc.insert(ignore_permissions=True)
    bom_doc.submit()
    
    return bom_doc


def update_bom_items(item, items, create_new_version=False):
    """Update BOM items for an existing BOM.
    
    Args:
        item (str): Item code
        items (list): List of dicts with item_code and qty
        create_new_version (bool): Create new version instead of amending
        
    Returns:
        frappe.Document: Updated or new BOM document
    """
    # Get current default BOM
    current_bom = frappe.db.get_value("BOM", {"item": item, "is_active": 1, "is_default": 1})
    
    if not current_bom:
        frappe.throw(_("No active default BOM found for {0}").format(item))
    
    if create_new_version:
        # Create new BOM version
        old_bom = frappe.get_doc("BOM", current_bom)
        old_bom.is_default = 0
        old_bom.save(ignore_permissions=True)
        
        return create_bom(item, items, is_default=1)
    else:
        # Amend existing BOM
        bom_doc = frappe.get_doc("BOM", current_bom)
        
        # Cancel and amend
        bom_doc.cancel()
        
        amended_bom = frappe.copy_doc(bom_doc)
        amended_bom.amended_from = current_bom
        
        # Clear existing items
        amended_bom.items = []
        
        # Add new items
        for bom_item in items:
            item_code = bom_item.get("item_code") or bom_item.get("item")
            item_qty = flt(bom_item.get("qty") or bom_item.get("quantity", 1))
            
            component_doc = frappe.get_doc("Item", item_code)
            
            amended_bom.append("items", {
                "item_code": item_code,
                "qty": item_qty,
                "uom": component_doc.stock_uom,
                "rate": component_doc.valuation_rate or component_doc.standard_rate or 0,
                "stock_uom": component_doc.stock_uom,
            })
        
        amended_bom.insert(ignore_permissions=True)
        amended_bom.submit()
        
        return amended_bom


def get_bom_for_item(item, as_dict=False):
    """Get the default BOM for an item.
    
    Args:
        item (str): Item code
        as_dict (bool): Return as dict instead of document
        
    Returns:
        frappe.Document or dict: BOM document or dict
    """
    bom_name = frappe.db.get_value("BOM", {"item": item, "is_active": 1, "is_default": 1})
    
    if not bom_name:
        return None
    
    if as_dict:
        bom_doc = frappe.get_doc("BOM", bom_name)
        return bom_doc.as_dict()
    
    return frappe.get_doc("BOM", bom_name)


def get_bom_items(item):
    """Get BOM items (components) for an item.
    
    Args:
        item (str): Item code
        
    Returns:
        list: List of BOM items with item_code, qty, rate
    """
    bom = get_bom_for_item(item)
    
    if not bom:
        return []
    
    return [
        {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "uom": item.uom,
            "rate": item.rate,
            "amount": item.amount,
        }
        for item in bom.items
    ]


def calculate_bom_cost(item):
    """Calculate total cost of BOM for an item.
    
    Args:
        item (str): Item code
        
    Returns:
        float: Total BOM cost
    """
    bom = get_bom_for_item(item)
    
    if not bom:
        return 0.0
    
    return flt(bom.total_cost)


def create_bom_with_scaling(base_item, scaled_item, scale_factor):
    """Create a scaled version of a BOM for size variants.
    
    Example: Create BOM for "Pizza-Large" based on "Pizza-Medium" with 1.5x factor
    
    Args:
        base_item (str): Base item code with existing BOM
        scaled_item (str): New item code for scaled variant
        scale_factor (float): Scaling factor for quantities
        
    Returns:
        frappe.Document: New BOM document
    """
    base_bom = get_bom_for_item(base_item)
    
    if not base_bom:
        frappe.throw(_("No BOM found for base item {0}").format(base_item))
    
    # Scale all quantities
    scaled_items = []
    for item in base_bom.items:
        scaled_items.append({
            "item_code": item.item_code,
            "qty": flt(item.qty) * flt(scale_factor)
        })
    
    return create_bom(
        item=scaled_item,
        items=scaled_items,
        qty=base_bom.quantity
    )


def create_bom_from_components(item, components, qty_factor=1.0):
    """Create BOM from legacy Item Option Component format.
    
    Args:
        item (str): Item code
        components (list): List of component dicts from legacy format
        qty_factor (float): Multiplier for quantities
        
    Returns:
        frappe.Document: BOM document
    """
    bom_items = []
    
    for component in components:
        if isinstance(component, dict):
            item_code = component.get("item_code")
            qty = flt(component.get("qty", 1)) * flt(qty_factor)
        else:
            # Handle object format
            item_code = getattr(component, "item_code", None)
            qty = flt(getattr(component, "qty", 1)) * flt(qty_factor)
        
        if item_code:
            bom_items.append({
                "item_code": item_code,
                "qty": qty
            })
    
    if not bom_items:
        return None
    
    return create_bom(item=item, items=bom_items)


def validate_bom(item):
    """Validate BOM for an item.
    
    Args:
        item (str): Item code
        
    Returns:
        dict: Validation result with status and messages
    """
    bom = get_bom_for_item(item)
    
    if not bom:
        return {
            "valid": False,
            "message": _("No BOM found for item {0}").format(item)
        }
    
    issues = []
    
    # Check if all component items exist and are not disabled
    for bom_item in bom.items:
        if not frappe.db.exists("Item", bom_item.item_code):
            issues.append(_("Component {0} does not exist").format(bom_item.item_code))
        else:
            is_disabled = frappe.db.get_value("Item", bom_item.item_code, "disabled")
            if is_disabled:
                issues.append(_("Component {0} is disabled").format(bom_item.item_code))
    
    # Check if BOM has items
    if not bom.items:
        issues.append(_("BOM has no items"))
    
    # Check if quantities are valid
    for bom_item in bom.items:
        if flt(bom_item.qty) <= 0:
            issues.append(_("Component {0} has invalid quantity").format(bom_item.item_code))
    
    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "total_cost": bom.total_cost if not issues else 0
    }


def copy_bom_to_variant(template_item, variant_item, attribute_adjustments=None):
    """Copy BOM from template to variant with optional adjustments.
    
    Args:
        template_item (str): Template item code
        variant_item (str): Variant item code
        attribute_adjustments (dict): Adjustments based on attributes
            e.g., {"Size": {"Large": 1.5, "Small": 0.7}}
        
    Returns:
        frappe.Document: New BOM for variant
    """
    template_bom = get_bom_for_item(template_item)
    
    if not template_bom:
        return None
    
    scale_factor = 1.0
    
    # Calculate scale factor from attribute adjustments
    if attribute_adjustments:
        variant_attrs = frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": variant_item},
            fields=["attribute", "attribute_value"]
        )
        
        for attr in variant_attrs:
            attr_name = attr.attribute
            attr_value = attr.attribute_value
            
            if attr_name in attribute_adjustments:
                value_factors = attribute_adjustments[attr_name]
                if attr_value in value_factors:
                    scale_factor *= value_factors[attr_value]
    
    return create_bom_with_scaling(template_item, variant_item, scale_factor)
