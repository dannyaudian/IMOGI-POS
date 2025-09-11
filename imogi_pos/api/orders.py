# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import copy
import frappe
from frappe import _
from frappe.utils import now_datetime, flt
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.api.queue import get_next_queue_number
from frappe.exceptions import TimestampMismatchError

WORKFLOW_CLOSED_STATES = ("Closed", "Cancelled", "Returned")
def validate_item_is_sales_item(doc, method=None):
    """Ensure the linked Item is a sales item before saving POS Order Item.

    Args:
        doc: POS Order Item document being saved
        method: Frappe hook method (unused)

    Raises:
        frappe.ValidationError: If the Item is not marked as a sales item
    """

    identifier = getattr(doc, "item", None) or getattr(doc, "item_code", None)
    if not identifier:
        frappe.throw(_("Item is required"), frappe.ValidationError)

    # Ensure downstream logic can rely on doc.item being populated
    doc.item = identifier


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
def get_next_available_table(branch):
    """Return the lowest-numbered available table for a branch."""
    validate_branch_access(branch)
    tables = frappe.get_all(
        "Restaurant Table",
        filters={"branch": branch, "status": "Available"},
        pluck="name",
    )

    if not tables:
        frappe.throw(_("No tables are currently available"), frappe.ValidationError)

    numbers = []
    for name in tables:
        try:
            numbers.append(int(name))
        except (ValueError, TypeError):
            try:
                number = frappe.db.get_value("Restaurant Table", name, "table_number")
                numbers.append(int(number))
            except Exception:
                pass

    if not numbers:
        frappe.throw(_("No tables are currently available"), frappe.ValidationError)

    return str(min(numbers))

@frappe.whitelist()
def create_order(order_type, branch, pos_profile, table=None, customer=None, items=None, discount_amount=0, discount_percent=0, promo_code=None, service_type=None):
    """
    Creates a new POS Order.
    
    Args:
        order_type (str): Order type (Dine-in/Takeaway/Kiosk)
        branch (str): Branch name
        pos_profile (str): POS Profile name
        table (str, optional): Restaurant Table name.
        customer (str, optional): Customer identifier.
        items (list | dict, optional): Items to be added to the order.
        service_type (str, optional): Service type for kiosk orders (Takeaway/Dine-in).
    
    Returns:
        dict: Created POS Order details

    """
    validate_branch_access(branch)
    ensure_update_stock_enabled(pos_profile)

    # For restaurant-specific features like table assignment
    table_doc = None
    def _safe_throw(message):
        try:
            frappe.throw(message, frappe.ValidationError)
        except BrokenPipeError:
            frappe.log_error(frappe.get_traceback())
            raise frappe.ValidationError(message)

    if table:
        check_restaurant_domain(pos_profile)
        table_doc = frappe.get_doc("Restaurant Table", table)

        # Table must belong to branch and be available
        if table_doc.branch != branch:
            _safe_throw(
                _("Table {0} does not belong to branch {1}").format(table, branch)
            )

        # Resolve any lingering order linked to this table
        table_doc.ensure_available_for_new_order()

        if table_doc.current_pos_order:
            _safe_throw(
                _("Table {0} is already occupied").format(table)
            )
    elif order_type == "Dine-in":
        # Allow Dine-in orders without specifying a table, but ensure Restaurant domain
        check_restaurant_domain(pos_profile)
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

    if order_type == "Kiosk":
        order_doc.queue_number = get_next_queue_number(branch)

    if service_type:
        order_doc.service_type = service_type

    if items:
        if isinstance(items, str):
            items = frappe.parse_json(items)
        if isinstance(items, dict):
            items = [items]
        for item in items:
            if not item.get("item") and item.get("item_code"):
                item["item"] = item.get("item_code")
            row = order_doc.append("items", item)
            if item.get("rate") is not None:
                row.rate = item.get("rate")
            validate_item_is_sales_item(row)

    # Validate customer before inserting the order
    if customer:
        # Check if the provided customer exists
        if not frappe.db.exists("Customer", customer):
            if customer == "Walk-in Customer":
                # Remove link to allow inserting the order without a customer
                order_doc.customer = None
            else:
                _safe_throw(
                    _("Customer {0} not found").format(customer)
                )

    order_doc.insert()
    # Allow downstream apps to reserve or deduct stock before invoicing
    call_hook = getattr(frappe, "call_hook", None)
    if call_hook:
        call_hook("after_create_order", order=order_doc)
    else:
        for hook in frappe.get_hooks("after_create_order") or []:
            frappe.get_attr(hook)(order=order_doc)

    if table_doc:
        table_doc.reload()
        if table_doc.status != "Available":
            _safe_throw(_("Table already occupied"))
        try:
            table_doc.set_status("Occupied", pos_order=order_doc.name)
        except TimestampMismatchError:
            _safe_throw(_("Table already occupied"))

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

    table_doc = frappe.get_doc("Restaurant Table", table)

    if table_doc.current_pos_order:
        state = frappe.db.get_value(
            "POS Order", table_doc.current_pos_order, "workflow_state"
        )
        if state in WORKFLOW_CLOSED_STATES:
            table_doc.set_status("Available")
        else:
            existing_order = frappe.get_doc("POS Order", table_doc.current_pos_order)
            validate_branch_access(existing_order.branch)
            return existing_order.as_dict()

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
def update_order_status(pos_order, status):
    """Update an order's workflow state and free its table when completed."""
    order_doc = frappe.get_doc("POS Order", pos_order)
    validate_branch_access(order_doc.branch)

    order_doc.db_set("workflow_state", status, update_modified=False)
    order_doc.workflow_state = status

    if status in WORKFLOW_CLOSED_STATES and order_doc.table:
        table_doc = frappe.get_doc("Restaurant Table", order_doc.table)
        table_doc.set_status("Available")

    return {"name": order_doc.name, "workflow_state": order_doc.workflow_state}

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
