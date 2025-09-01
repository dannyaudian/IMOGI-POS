# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now_datetime

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

def validate_branch_access(branch):
    """
    Validates that the current user has access to the specified branch.
    
    Args:
        branch (str): Branch name
    
    Raises:
        frappe.PermissionError: If user doesn't have access to the branch
    """
    # User permission check for branch access
    if not frappe.has_permission("Branch", doc=branch):
        frappe.throw(_("You don't have access to branch: {0}").format(branch), 
                    frappe.PermissionError)

@frappe.whitelist()
def create_order(order_type, branch, pos_profile, table=None):
    """
    Creates a new POS Order.
    
    Args:
        order_type (str): Order type (Dine-in/Takeaway/Kiosk)
        branch (str): Branch name
        pos_profile (str): POS Profile name
        table (str, optional): Restaurant Table name. Required for Dine-in.
    
    Returns:
        dict: Created POS Order details
    
    Raises:
        frappe.ValidationError: If table is missing for Dine-in orders
    """
    validate_branch_access(branch)
    
    if order_type == "Dine-in" and not table:
        frappe.throw(_("Table is required for Dine-in orders"), frappe.ValidationError)
    
    # For restaurant-specific features like table assignment
    if table:
        check_restaurant_domain(pos_profile)
    
    # STUB: Create POS Order logic will go here
    # For now, return a minimal success response
    return {
        "name": f"POS-ORD-STUB-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}",
        "order_type": order_type,
        "branch": branch,
        "pos_profile": pos_profile,
        "table": table,
        "status": "Draft",
        "creation": now_datetime()
    }

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
    
    # STUB: Check if destination table is available
    # STUB: Update table assignments and references
    
    return {
        "name": pos_order,
        "table": to_table,
        "previous_table": from_table,
        "status": order_doc.workflow_state,
        "switched_at": now_datetime()
    }

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
    
    # STUB: Get orders for each table
    # STUB: Check if any order has items in Ready state (should prevent merge)
    # STUB: Perform merge operation
    
    # Get one order to check domain and branch access
    # In actual implementation, we'd check all orders
    target_order = frappe.get_value("Restaurant Table", target_table, "current_pos_order")
    if not target_order:
        frappe.throw(_("No open order found for target table"), frappe.ValidationError)
    
    order_doc = frappe.get_doc("POS Order", target_order)
    check_restaurant_domain(order_doc.pos_profile)
    validate_branch_access(order_doc.branch)
    
    return {
        "name": f"MERGED-{target_order}",
        "target_table": target_table,
        "source_tables": source_tables,
        "merged_at": now_datetime(),
        "status": "Merged"
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