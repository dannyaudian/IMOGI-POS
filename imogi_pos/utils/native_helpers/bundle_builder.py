# -*- coding: utf-8 -*-
"""Helper utilities for working with native ERPNext Product Bundle."""

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt


def create_product_bundle(parent_item, items, bundle_name=None, **kwargs):
    """Create a Product Bundle for combo deals.
    
    Args:
        parent_item (str): Parent item code (the bundle/combo)
        items (list): List of dicts with item_code and qty
        bundle_name (str, optional): Custom bundle name
        **kwargs: Additional bundle fields
        
    Returns:
        frappe.Document: Product Bundle document
    """
    if not frappe.db.exists("Item", parent_item):
        frappe.throw(_("Parent item {0} does not exist").format(parent_item))
    
    # Check if bundle already exists
    existing_bundle = frappe.db.exists("Product Bundle", parent_item)
    
    if existing_bundle:
        frappe.throw(
            _("Product Bundle already exists for {0}. Use update_product_bundle() to modify it.").format(parent_item)
        )
    
    # Update parent item to mark it as bundle
    parent_doc = frappe.get_doc("Item", parent_item)
    if not parent_doc.is_stock_item:
        parent_doc.is_stock_item = 0
    parent_doc.save(ignore_permissions=True)
    
    bundle_doc = frappe.new_doc("Product Bundle")
    bundle_doc.new_item_code = parent_item
    
    # Add bundle items
    for bundle_item in items:
        if isinstance(bundle_item, dict):
            item_code = bundle_item.get("item_code") or bundle_item.get("item")
            item_qty = flt(bundle_item.get("qty") or bundle_item.get("quantity", 1))
            description = bundle_item.get("description", "")
        else:
            frappe.throw(_("Bundle item must be a dictionary with item_code and qty"))
        
        if not frappe.db.exists("Item", item_code):
            frappe.throw(_("Item {0} does not exist").format(item_code))
        
        bundle_doc.append("items", {
            "item_code": item_code,
            "qty": item_qty,
            "uom": frappe.db.get_value("Item", item_code, "stock_uom"),
            "description": description or frappe.db.get_value("Item", item_code, "item_name")
        })
    
    bundle_doc.insert(ignore_permissions=True)
    
    return bundle_doc


def update_product_bundle(parent_item, items):
    """Update items in an existing Product Bundle.
    
    Args:
        parent_item (str): Parent item code
        items (list): New list of dicts with item_code and qty
        
    Returns:
        frappe.Document: Updated Product Bundle document
    """
    if not frappe.db.exists("Product Bundle", parent_item):
        frappe.throw(_("Product Bundle not found for {0}").format(parent_item))
    
    bundle_doc = frappe.get_doc("Product Bundle", parent_item)
    
    # Clear existing items
    bundle_doc.items = []
    
    # Add new items
    for bundle_item in items:
        item_code = bundle_item.get("item_code") or bundle_item.get("item")
        item_qty = flt(bundle_item.get("qty") or bundle_item.get("quantity", 1))
        
        bundle_doc.append("items", {
            "item_code": item_code,
            "qty": item_qty,
            "uom": frappe.db.get_value("Item", item_code, "stock_uom"),
        })
    
    bundle_doc.save(ignore_permissions=True)
    
    return bundle_doc


def get_bundle_items(parent_item):
    """Get items in a Product Bundle.
    
    Args:
        parent_item (str): Parent item code
        
    Returns:
        list: List of bundle items with details
    """
    if not frappe.db.exists("Product Bundle", parent_item):
        return []
    
    bundle_doc = frappe.get_doc("Product Bundle", parent_item)
    
    items = []
    for item in bundle_doc.items:
        item_details = frappe.db.get_value(
            "Item", 
            item.item_code,
            ["item_name", "standard_rate", "image"],
            as_dict=True
        )
        
        items.append({
            "item_code": item.item_code,
            "item_name": item_details.item_name if item_details else item.item_code,
            "qty": item.qty,
            "uom": item.uom,
            "rate": item_details.standard_rate if item_details else 0,
            "image": item_details.image if item_details else None
        })
    
    return items


def validate_bundle(parent_item):
    """Validate a Product Bundle.
    
    Args:
        parent_item (str): Parent item code
        
    Returns:
        dict: Validation result with status and messages
    """
    if not frappe.db.exists("Product Bundle", parent_item):
        return {
            "valid": False,
            "message": _("Product Bundle not found for {0}").format(parent_item)
        }
    
    bundle_doc = frappe.get_doc("Product Bundle", parent_item)
    issues = []
    
    # Check if bundle has items
    if not bundle_doc.items:
        issues.append(_("Bundle has no items"))
    
    # Check if all items exist and are not disabled
    for item in bundle_doc.items:
        if not frappe.db.exists("Item", item.item_code):
            issues.append(_("Item {0} does not exist").format(item.item_code))
        else:
            is_disabled = frappe.db.get_value("Item", item.item_code, "disabled")
            if is_disabled:
                issues.append(_("Item {0} is disabled").format(item.item_code))
        
        # Check quantities
        if flt(item.qty) <= 0:
            issues.append(_("Item {0} has invalid quantity").format(item.item_code))
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }


def get_bundle_price(parent_item, calculate_from_items=False):
    """Get price for a Product Bundle.
    
    Args:
        parent_item (str): Parent item code
        calculate_from_items (bool): Calculate from sum of component items
        
    Returns:
        float: Bundle price
    """
    if calculate_from_items:
        items = get_bundle_items(parent_item)
        total = sum(flt(item.get("rate", 0)) * flt(item.get("qty", 1)) for item in items)
        return total
    else:
        # Get from parent item standard rate
        return flt(frappe.db.get_value("Item", parent_item, "standard_rate"))


def delete_product_bundle(parent_item):
    """Delete a Product Bundle.
    
    Args:
        parent_item (str): Parent item code
        
    Returns:
        bool: True if deleted successfully
    """
    if not frappe.db.exists("Product Bundle", parent_item):
        return False
    
    bundle_doc = frappe.get_doc("Product Bundle", parent_item)
    bundle_doc.delete()
    
    return True


def is_bundle(item_code):
    """Check if an item is a product bundle.
    
    Args:
        item_code (str): Item code
        
    Returns:
        bool: True if item is a bundle
    """
    return frappe.db.exists("Product Bundle", item_code)


def expand_bundle(parent_item):
    """Expand bundle into individual items for order processing.
    
    Args:
        parent_item (str): Parent item code
        
    Returns:
        list: List of individual items with quantities
    """
    if not is_bundle(parent_item):
        return [{
            "item_code": parent_item,
            "qty": 1
        }]
    
    return get_bundle_items(parent_item)
