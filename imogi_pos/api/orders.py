# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import copy
import frappe
from frappe import _
from frappe.utils import now_datetime, flt
from imogi_pos.utils.permissions import validate_branch_access

def validate_item_is_sales_item(doc, method=None):
    """Ensure the linked Item is a sales item before saving POS Order Item.

    Args:
        doc: POS Order Item document being saved
        method: Frappe hook method (unused)

    Raises:
        frappe.ValidationError: If the Item is not marked as a sales item
    """
    identifier = getattr(doc, "item", None)
    if not identifier:
        frappe.throw(_("Item is required"), frappe.ValidationError)

    if not frappe.db.exists("Item", identifier):
        frappe.throw(_("Item {0} not found").format(identifier), frappe.ValidationError)

    is_sales_item = frappe.db.get_value("Item", identifier, "is_sales_item")
    if not is_sales_item:
        frappe.throw(
            _("Item {0} is not a sales item").format(identifier),
            frappe.ValidationError,
        )

def check_restaurant_domain(pos_profile):
    """
    Validates that the POS Profile has Restaurant domain enabled.
    
    Args:
        pos_profile (str): POS Profile name
    
    Raises:
        frappe.ValidationError: If domain is not Restaurant
    """
    domain = frappe.db.get_value("POS Profile", pos_profile, "imogi_pos_domain")
    if domain != "Restaurant":
        frappe.throw(_("This operation is only available for Restaurant domain"), 
                    frappe.ValidationError)


def ensure_update_stock_enabled(pos_profile):
    """Ensure the POS Profile is configured to update stock."""
    if not frappe.db.get_value("POS Profile", pos_profile, "update_stock"):
        frappe.throw(
            _("POS Profile {0} is not configured to update stock").format(pos_profile),
            frappe.ValidationError,
        )

@frappe.whitelist()
def create_order(order_type, branch, pos_profile, table=None, customer=None, items=None, discount_amount=0, discount_percent=0, promo_code=None):
    """
    Creates a new POS Order.
    
    Args:
        order_type (str): Order type (Dine-in/Takeaway/Kiosk)
        branch (str): Branch name
        pos_profile (str): POS Profile name
        table (str, optional): Restaurant Table name. Required for Dine-in.
        customer (str, optional): Customer identifier.
        items (list | dict, optional): Items to be added to the order.
    
    Returns:
        dict: Created POS Order details
    
    Raises:
        frappe.ValidationError: If table is missing for Dine-in orders
    """
    validate_branch_access(branch)
    ensure_update_stock_enabled(pos_profile)
    
    if order_type == "Dine-in" and not table:
        frappe.throw(_("Table is required for Dine-in orders"), frappe.ValidationError)
    
    # For restaurant-specific features like table assignment
    table_doc = None
    if table:
        check_restaurant_domain(pos_profile)
        table_doc = frappe.get_doc("Restaurant Table", table)

        # Table must belong to branch and be available
        if table_doc.branch != branch:
            frappe.throw(
                _("Table {0} does not belong to branch {1}").format(table, branch),
                frappe.ValidationError,
            )

        if table_doc.status == "Occupied" and table_doc.current_pos_order:
            frappe.throw(
                _("Table {0} is already occupied").format(table),
                frappe.ValidationError,
            )
    # Ensure numeric discounts to avoid type issues
    try:
        discount_amount = float(discount_amount or 0)
    except Exception:
        discount_amount = 0
    try:
        discount_percent = float(discount_percent or 0)
    except Exception:
        discount_percent = 0

    # Create POS Order document
    order_doc = frappe.new_doc("POS Order")
    order_doc.update(
        {
            "order_type": order_type,
            "branch": branch,
            "pos_profile": pos_profile,
            "table": table,
            "customer": customer,
            "workflow_state": "Draft",
            "discount_amount": discount_amount,
            "discount_percent": discount_percent,
            "promo_code": promo_code,
        }
    )
    if table_doc:
        order_doc.floor = table_doc.floor

    if items:
        if isinstance(items, str):
            items = frappe.parse_json(items)
        if isinstance(items, dict):
            items = [items]
        for item in items:
            row = order_doc.append("items", item)
            if item.get("rate") is not None:
                row.rate = item.get("rate")
            validate_item_is_sales_item(row)

    order_doc.insert()
    # Allow downstream apps to reserve or deduct stock before invoicing
    frappe.call_hook("after_create_order", order=order_doc)

    if table_doc:
        table_doc.set_status("Occupied", pos_order=order_doc.name)

    return order_doc.as_dict()

@frappe.whitelist()
def open_or_create_for_table(table, floor, pos_profile):
    """
    Opens an existing POS Order for a table or creates a new one if none exists.
    Used by Waiter Order flow.
    
    Args:
        table (str): Restaurant Table name
        floor (str): Restaurant Floor name
        pos_profile (str): POS Profile name
    
    Returns:
        dict: POS Order details (existing or new)
    """
    check_restaurant_domain(pos_profile)
    
    # Get branch from POS Profile
    branch = frappe.db.get_value("POS Profile", pos_profile, "imogi_branch")
    if not branch:
        frappe.throw(_("Branch not configured in POS Profile"), frappe.ValidationError)
    
    validate_branch_access(branch)
    
    # STUB: Check for existing open order for this table
    # For demo, assume no existing order and create a new one
    return create_order("Dine-in", branch, pos_profile, table)

@frappe.whitelist()
def switch_table(pos_order, from_table, to_table):
    """
    Moves a POS Order from one table to another.
    
    Args:
        pos_order (str): POS Order name
        from_table (str): Source table name
        to_table (str): Destination table name
    
    Returns:
        dict: Updated POS Order details
    
    Raises:
        frappe.ValidationError: If tables are not available or order status doesn't allow switch
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    check_restaurant_domain(order_doc.pos_profile)
    validate_branch_access(order_doc.branch)
    
    # Validate that the from_table matches the order's current table
    if order_doc.table != from_table:
        frappe.throw(_("Order is not currently at table {0}").format(from_table),
                    frappe.ValidationError)

    # Check destination table availability
    to_table_doc = frappe.get_doc("Restaurant Table", to_table)
    if to_table_doc.status == "Occupied" and to_table_doc.current_pos_order:
        frappe.throw(
            _("Table {0} is already occupied").format(to_table),
            frappe.ValidationError,
        )

    from_table_doc = frappe.get_doc("Restaurant Table", from_table)

    # Update order and table assignments
    order_doc.table = to_table
    order_doc.floor = to_table_doc.floor
    order_doc.save()

    from_table_doc.set_status("Available")
    to_table_doc.set_status("Occupied", pos_order=order_doc.name)

    return order_doc.as_dict()

@frappe.whitelist()
def merge_tables(target_table, source_tables):
    """
    Merges orders from multiple tables into a single target table.
    
    Args:
        target_table (str): Destination table name
        source_tables (list): List of source table names to merge
    
    Returns:
        dict: Merged order details
    
    Raises:
        frappe.ValidationError: If any table has items in Ready state
                              or tables don't have open orders
    """
    if isinstance(source_tables, str):
        source_tables = frappe.parse_json(source_tables)
    
    # Ensure we have at least one source table
    if not source_tables or len(source_tables) == 0:
        frappe.throw(_("No source tables provided for merge"), frappe.ValidationError)
    
    target_order_name = frappe.db.get_value(
        "Restaurant Table", target_table, "current_pos_order"
    )
    if not target_order_name:
        frappe.throw(_("No open order found for target table"), frappe.ValidationError)

    target_order = frappe.get_doc("POS Order", target_order_name)
    check_restaurant_domain(target_order.pos_profile)
    validate_branch_access(target_order.branch)

    target_table_doc = frappe.get_doc("Restaurant Table", target_table)

    for table in source_tables:
        if table == target_table:
            frappe.throw(_("Source table list cannot include the target table"), frappe.ValidationError)

        source_order_name = frappe.db.get_value(
            "Restaurant Table", table, "current_pos_order"
        )
        if not source_order_name:
            frappe.throw(
                _("No open order found for table {0}").format(table),
                frappe.ValidationError,
            )

        source_order = frappe.get_doc("POS Order", source_order_name)

        if any(
            getattr(item, "workflow_state", None) == "Ready"
            for item in getattr(source_order, "items", [])
        ):
            frappe.throw(
                _("Cannot merge table {0} with items in Ready state").format(table),
                frappe.ValidationError,
            )

        for item in getattr(source_order, "items", []):
            target_order.append("items", copy.deepcopy(item))
        target_order.save()

        frappe.db.set_value("POS Order", source_order_name, "workflow_state", "Merged")
        source_table_doc = frappe.get_doc("Restaurant Table", table)
        source_table_doc.set_status("Available")

    target_table_doc.set_status("Occupied", pos_order=target_order.name)

    return {
        "name": target_order.name,
        "target_table": target_table,
        "source_tables": source_tables,
        "merged_at": now_datetime(),
        "status": "Merged",
    }

@frappe.whitelist()
def set_order_type(pos_order, order_type):
    """
    Updates the order type of an existing POS Order.
    
    Args:
        pos_order (str): POS Order name
        order_type (str): New order type (Dine-in/Takeaway/Kiosk)
    
    Returns:
        dict: Updated POS Order details
    
    Raises:
        frappe.ValidationError: If the order type change is not allowed for the current state
    """
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)
    
    # If changing to or from Dine-in, check restaurant domain
    if order_type == "Dine-in" or order_doc.order_type == "Dine-in":
        check_restaurant_domain(order_doc.pos_profile)
    
    # STUB: Validate if order type change is allowed in current state
    # STUB: Update order type and handle table assignment changes
    
    return {
        "name": pos_order,
        "previous_type": order_doc.order_type,
        "new_type": order_type,
        "updated_at": now_datetime()
    }
