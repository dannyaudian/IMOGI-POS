# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from frappe.realtime import publish_realtime
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.kitchen.kot_service import update_kot_item_state as service_update_kot_item_state

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
        frappe.throw(_("Kitchen operations are only available for Restaurant domain"), 
                    frappe.ValidationError)


def publish_kitchen_update(kot_ticket, kitchen=None, station=None):
    """
    Publishes realtime updates to kitchen display systems.
    
    Args:
        kot_ticket (dict): KOT ticket details
        kitchen (str, optional): Kitchen name for targeted updates
        station (str, optional): Kitchen station name for targeted updates
    """
    # Get branch information to include in payload
    branch = frappe.db.get_value("KOT Ticket", kot_ticket["name"], "branch")
    
    # Basic payload with branch context
    payload = {
        "kot_ticket": kot_ticket,
        "branch": branch,
        "timestamp": now_datetime().isoformat()
    }
    
    # Publish to all relevant channels
    publish_realtime(f"kitchen:all", payload)
    
    if kitchen:
        publish_realtime(f"kitchen:{kitchen}", payload)
    
    if station:
        publish_realtime(f"kitchen:station:{station}", payload)

def publish_table_update(pos_order, table, event_type="kot_update"):
    """
    Publishes realtime updates to table displays.
    
    Args:
        pos_order (str): POS Order name
        table (str): Table name
        event_type (str, optional): Type of event (kot_update, state_change)
    """
    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    # Get order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    
    # Basic payload
    payload = {
        "pos_order": pos_order,
        "table": table,
        "floor": frappe.db.get_value("Restaurant Table", table, "floor"),
        "event_type": event_type,
        "branch": order_doc.branch,
        "workflow_state": order_doc.workflow_state,
        "timestamp": now_datetime().isoformat()
    }
    
    # Publish to table channel
    publish_realtime(f"table:{table}", payload)
    
    # Publish to floor channel if available
    if payload["floor"]:
        publish_realtime(f"table_display:floor:{payload['floor']}", payload)


@frappe.whitelist()
def get_kots_for_kitchen(kitchen=None, station=None, branch=None):
    """Get KOT tickets for a specific kitchen or station.

    Args:
        kitchen (str, optional): Kitchen name to filter by.
        station (str, optional): Kitchen Station to filter by.
        branch (str, optional): Branch to filter by.

    Returns:
        list: List of KOT tickets with their items, ordered by creation time.
    """

    filters = {}
    if kitchen:
        filters["kitchen"] = kitchen
    if station:
        filters["kitchen_station"] = station
    if branch:
        filters["branch"] = branch

    tickets = frappe.get_all(
        "KOT Ticket",
        filters=filters,
        fields=["name", "table", "workflow_state", "creation", "pos_order"],
        order_by="creation asc",
    )

    for ticket in tickets:
        ticket.update(
            {
                "pos_order": ticket.get("pos_order"),
                "items": frappe.get_all(
                    "KOT Item",
                    filters={"parent": ticket["name"]},
                    fields=[
                        "idx",
                        "item_code as item",
                        "item_name",
                        "workflow_state as status",
                        "qty",
                        "notes",
                        "item_options",
                    ],
                    order_by="idx asc",
                ),
            }
        )

    return tickets


@frappe.whitelist()
def send_items_to_kitchen(pos_order=None, item_rows=None, order=None):
    """
    Creates a KOT Ticket and sends selected items to the kitchen.

    Args:
        pos_order (str, optional): POS Order name. Provide this or ``order``.
        item_rows (list or str): List of POS Order Item rows to include in the KOT.
        order (dict or object, optional): Full POS Order data. If provided,
            its ``name`` field is used as ``pos_order``.

    Returns:
        dict: Created KOT Ticket details

    Raises:
        frappe.ValidationError: If any selected item is a template (not a variant)
    """

    # Parse JSON if item_rows is passed as string
    if isinstance(item_rows, str):
        item_rows = frappe.parse_json(item_rows)

    # Allow passing full order data instead of just the name
    if not pos_order and order:
        if isinstance(order, dict):
            pos_order = order.get("name")
        else:
            pos_order = getattr(order, "name", None)

    if not pos_order:
        frappe.throw(_("POS Order is required"), frappe.ValidationError)

    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    check_restaurant_domain(order_doc.pos_profile)
    validate_branch_access(order_doc.branch)
    
    # Validate items for templates
    for row_name in item_rows:
        # POS Order Item uses "item" as the primary identifier. Fetch only this
        # field by default and include the legacy "item_code" field if it exists
        # in the table to maintain backwards compatibility.
        fields = ["item"]
        if frappe.db.has_column("POS Order Item", "item_code"):
            fields.append("item_code")

        item_data = frappe.db.get_value(
            "POS Order Item",
            row_name,
            fields,
            as_dict=True,
        )

        item_identifier = item_data.get("item")
        if not item_identifier and "item_code" in item_data:
            item_identifier = item_data.get("item_code")

        is_template = frappe.db.get_value("Item", item_identifier, "has_variants")
        if is_template:
            frappe.throw(
                _(
                    "Cannot send template item to kitchen. Please select a variant for: {0}"
                ).format(item_identifier)
            )
    
    # Create KOT Ticket document
    kot_doc = frappe.new_doc("KOT Ticket")
    kot_doc.pos_order = pos_order
    kot_doc.branch = order_doc.branch
    kot_doc.table = getattr(order_doc, "table", None)
    kot_doc.floor = getattr(order_doc, "floor", None)
    kot_doc.order_type = getattr(order_doc, "order_type", None)
    kot_doc.customer = getattr(order_doc, "customer", None)

    # Build KOT Item records from selected POS Order Items
    missing_station_item = None
    for row_name in item_rows:
        item_details = frappe.db.get_value(
            "POS Order Item",
            row_name,
            ["item", "qty", "notes", "kitchen", "kitchen_station", "item_options"],
            as_dict=True,
        )

        item_code = item_details.get("item")
        item_name = frappe.db.get_value("Item", item_code, "item_name")

        if not item_details.get("kitchen_station") and not missing_station_item:
            missing_station_item = item_code
        if not getattr(kot_doc, "kitchen_station", None):
            kot_doc.kitchen_station = item_details.get("kitchen_station")
        if not getattr(kot_doc, "kitchen", None):
            kot_doc.kitchen = item_details.get("kitchen")

        options = item_details.get("item_options")
        if isinstance(options, dict):
            cleaned = {}
            for key, val in options.items():
                if isinstance(val, dict):
                    cleaned[key] = val
                else:
                    cleaned[key] = {"name": val}
            options = cleaned

        kot_doc.append(
            "items",
            {
                "item_code": item_code,
                "item_name": item_name,
                "qty": item_details.get("qty"),
                "pos_order_item": row_name,
                "workflow_state": "Queued",
                "notes": item_details.get("notes"),
                "item_options": options,
            },
        )

    if not kot_doc.kitchen_station:
        if missing_station_item:
            frappe.throw(
                _(
                    "No kitchen station assigned for selected items. Missing for item: {0}"
                ).format(missing_station_item),
                frappe.ValidationError,
            )
        frappe.throw(
            _("No kitchen station assigned for selected items"),
            frappe.ValidationError,
        )

    kot_doc.insert()
    kot_ticket = kot_doc.as_dict()
    
    # Publish updates to kitchen and table displays
    publish_kitchen_update(kot_ticket)
    
    if order_doc.table:
        publish_table_update(pos_order, order_doc.table, "kot_created")
    
    # Update POS Order workflow state if it's still in Draft
    if order_doc.workflow_state == "Draft":
        if hasattr(order_doc, "db_set"):
            order_doc.db_set('workflow_state', 'In Progress', update_modified=False)
        else:
            order_doc.workflow_state = "In Progress"
    
    return kot_ticket

@frappe.whitelist()
def update_kot_item_state(kot_item, state):
    """
    Updates the state of a single KOT Item.
    
    Args:
        kot_item (str): KOT Item name
        state (str): New state (Queued/In Progress/Ready/Served/Cancelled)
    
    Returns:
        dict: Updated KOT Item details
    
    Raises:
        frappe.ValidationError: If the state transition is not allowed
    """
    # Get KOT Item details for validation context
    parent_kot = frappe.db.get_value("KOT Item", kot_item, "parent")
    kot_ticket = frappe.get_doc("KOT Ticket", parent_kot)
    
    pos_order = frappe.get_doc("POS Order", kot_ticket.pos_order)

    check_restaurant_domain(pos_order.pos_profile)
    validate_branch_access(pos_order.branch)

    # Use service logic to perform the update and emit realtime events
    return service_update_kot_item_state(kot_item, state)

@frappe.whitelist()
def bulk_update_kot_item_state(kot_items, state):
    """
    Updates the state of multiple KOT Items at once.
    
    Args:
        kot_items (list or str): List of KOT Item names
        state (str): New state (Queued/In Progress/Ready/Served/Cancelled)
    
    Returns:
        dict: Summary of updates
    """
    if isinstance(kot_items, str):
        kot_items = frappe.parse_json(kot_items)

    if not kot_items:
        frappe.throw(_("No KOT items provided for update"))

    results = {"total": len(kot_items), "updated": [], "failed": []}

    for kot_item in kot_items:
        try:
            update_kot_item_state(kot_item, state)
            results["updated"].append(kot_item)
        except Exception as e:
            results["failed"].append({"item": kot_item, "error": str(e)})

    results["updated_count"] = len(results["updated"])
    results["failed_count"] = len(results["failed"])
    return results

@frappe.whitelist()
def update_kot_status(kot_ticket, state):
    """
    Updates the overall status of a KOT Ticket.
    
    Args:
        kot_ticket (str): KOT Ticket name
        state (str): New state (Queued/In Progress/Ready/Served/Cancelled)
    
    Returns:
        dict: Updated KOT Ticket details
    
    Raises:
        frappe.ValidationError: If the state transition is not allowed
    """
    # Get KOT Ticket details
    ticket_doc = frappe.get_doc("KOT Ticket", kot_ticket)
    pos_order = frappe.get_doc("POS Order", ticket_doc.pos_order)

    check_restaurant_domain(pos_order.pos_profile)
    validate_branch_access(pos_order.branch)

    service = KOTService()
    result = service.update_kot_ticket_state(kot_ticket, state)

    return {
        "ticket": result["ticket"],
        "old_state": result["old_state"],
        "new_state": result["new_state"],
        "updated_items": result.get("updated_items", [])
    }

