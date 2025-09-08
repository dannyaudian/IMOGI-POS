# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from frappe.realtime import publish_realtime
from imogi_pos.utils.permissions import validate_branch_access

__all__ = [
    "get_kitchens_and_stations",
    "send_items_to_kitchen",
    "update_kot_item_state",
    "bulk_update_kot_item_state",
    "update_kot_status",
]

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
def get_kitchens_and_stations(branch=None):
    """
    Retrieve kitchens and kitchen stations for the given branch.

    Args:
        branch (str): Branch name to filter by.

    Returns:
        dict: {
            "kitchens": [{"name": ..., "kitchen_name": ...}, ...],
            "stations": [{"name": ..., "station_name": ..., "kitchen": ...}, ...]
        }
    """
    if not branch:
        return {"kitchens": [], "stations": []}

    validate_branch_access(branch)

    kitchens = frappe.get_all(
        "Kitchen",
        filters={"branch": branch},
        fields=["name", "kitchen_name"],
    )
    stations = frappe.get_all(
        "Kitchen Station",
        filters={"branch": branch},
        fields=["name", "station_name", "kitchen"],
    )

    return {"kitchens": kitchens, "stations": stations}

@frappe.whitelist()
def get_kots_for_kitchen(kitchen=None, station=None, branch=None):
    """Return KOT tickets for a specific kitchen/station/branch.

    Args:
        kitchen (str, optional): Kitchen name to filter by.
        station (str, optional): Kitchen station name to filter by.
        branch (str, optional): Branch name to filter by and validate access.

    Returns:
        list: List of KOT Ticket dicts with requested fields and their items.
    """
    filters = {}
    if kitchen:
        filters["kitchen"] = kitchen
    if station:
        filters["kitchen_station"] = station
    if branch:
        filters["branch"] = branch
        validate_branch_access(branch)

    tickets = frappe.get_all(
        "KOT Ticket",
        filters=filters,
        fields=["name", "table", "workflow_state"],
        order_by="creation asc",
    )

    for ticket in tickets:
        items = frappe.get_all(
            "KOT Item",
            filters={"parent": ticket["name"]},
            fields=["item_name", "qty", "notes", "workflow_state"],
        )
        ticket["items"] = [
            {
                "item_name": i.get("item_name"),
                "qty": i.get("qty"),
                "notes": i.get("notes"),
                "status": i.get("workflow_state"),
            }
            for i in items
        ]

    return tickets

@frappe.whitelist()
def send_items_to_kitchen(pos_order, item_rows):
    """
    Creates a KOT Ticket and sends selected items to the kitchen.
    
    Args:
        pos_order (str): POS Order name
        item_rows (list or str): List of POS Order Item rows to include in the KOT
    
    Returns:
        dict: Created KOT Ticket details
    
    Raises:
        frappe.ValidationError: If any selected item is a template (not a variant)
    """
    # Parse JSON if item_rows is passed as string
    if isinstance(item_rows, str):
        item_rows = frappe.parse_json(item_rows)
    
    # Get POS Order details
    order_doc = frappe.get_doc("POS Order", pos_order)
    check_restaurant_domain(order_doc.pos_profile)
    validate_branch_access(order_doc.branch)
    
    # Validate items for templates
    for row_name in item_rows:
        # POS Order Item uses 'item' as the identifier. Older versions may
        # still reference 'item_code', so fetch both and use whichever exists.
        item_data = frappe.db.get_value(
            "POS Order Item",
            row_name,
            ["item", "item_code"],
            as_dict=True,
        )
        item_identifier = item_data.get("item") or item_data.get("item_code")

        is_template = frappe.db.get_value("Item", item_identifier, "has_variants")
        if is_template:
            frappe.throw(
                _(
                    "Cannot send template item to kitchen. Please select a variant for: {0}"
                ).format(item_identifier)
            )
    
    # STUB: Create KOT Ticket logic will go here
    # For now, create a minimal response
    kot_ticket = {
        "name": f"KOT-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}",
        "pos_order": pos_order,
        "status": "Queued",
        "items": item_rows,
        "branch": order_doc.branch,
        "creation": now_datetime()
    }
    
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
    # Get KOT Item details
    item_details = frappe.db.get_value("KOT Item", kot_item, 
                                      ["parent", "kitchen", "kitchen_station", "item_name", "item_code", "qty"], 
                                      as_dict=True)
    
    kot_ticket = frappe.get_doc("KOT Ticket", item_details.parent)
    pos_order = frappe.get_doc("POS Order", kot_ticket.pos_order)
    
    check_restaurant_domain(pos_order.pos_profile)
    validate_branch_access(pos_order.branch)
    
    # STUB: Validate state transition
    # STUB: Update KOT Item state
    
    # Prepare updated KOT Item data
    updated_item = {
        "name": kot_item,
        "kot_ticket": item_details.parent,
        "previous_state": "Unknown",  # In actual implementation, get current state
        "new_state": state,
        "item_name": item_details.item_name,
        "qty": item_details.qty,
        "updated_at": now_datetime()
    }
    
    # Prepare KOT Ticket data for realtime updates
    kot_ticket_data = {
        "name": kot_ticket.name,
        "pos_order": kot_ticket.pos_order,
        "updated_items": [updated_item]
    }
    
    # Publish updates
    publish_kitchen_update(
        kot_ticket_data, 
        kitchen=item_details.kitchen, 
        station=item_details.kitchen_station
    )
    
    if pos_order.table:
        publish_table_update(pos_order.name, pos_order.table, "kot_item_update")
    
    return updated_item

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
    
    if not kot_items or len(kot_items) == 0:
        frappe.throw(_("No KOT items provided for update"))
    
    # Group items by KOT Ticket for efficient updates
    items_by_kot = {}
    
    for kot_item in kot_items:
        parent = frappe.db.get_value("KOT Item", kot_item, "parent")
        if not parent in items_by_kot:
            items_by_kot[parent] = []
        items_by_kot[parent].append(kot_item)
    
    results = {
        "total": len(kot_items),
        "updated": 0,
        "failed": 0,
        "tickets_affected": len(items_by_kot)
    }
    
    # Process each group of items by KOT Ticket
    for kot_ticket, items in items_by_kot.items():
        try:
            # Get branch information for validation
            pos_order = frappe.db.get_value("KOT Ticket", kot_ticket, "pos_order")
            order_doc = frappe.get_doc("POS Order", pos_order)
            
            check_restaurant_domain(order_doc.pos_profile)
            validate_branch_access(order_doc.branch)
            
            # STUB: Bulk update logic for items within the same KOT
            
            # Update individual items
            for kot_item in items:
                # In actual implementation, update item state
                results["updated"] += 1
            
            # Get any kitchen/station info for targeted updates
            sample_item = frappe.db.get_value("KOT Item", items[0], 
                                             ["kitchen", "kitchen_station"], 
                                             as_dict=True)
            
            # Prepare KOT Ticket data for realtime updates
            kot_ticket_data = {
                "name": kot_ticket,
                "pos_order": pos_order,
                "bulk_update": True,
                "bulk_state": state,
                "items_updated": items
            }
            
            # Publish updates
            publish_kitchen_update(
                kot_ticket_data, 
                kitchen=sample_item.kitchen, 
                station=sample_item.kitchen_station
            )
            
            if order_doc.table:
                publish_table_update(pos_order, order_doc.table, "kot_bulk_update")
                
        except Exception as e:
            frappe.log_error(f"Error updating KOT items: {str(e)}")
            results["failed"] += len(items)
            
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

    # Validate state transition
    current_state = ticket_doc.workflow_state
    allowed_transitions = {
        "Queued": ["In Progress", "Cancelled"],
        "In Progress": ["Ready", "Cancelled"],
        "Ready": ["Served", "Cancelled"],
        "Served": [],
        "Cancelled": []
    }

    if state not in allowed_transitions.get(current_state, []):
        frappe.throw(
            _("Invalid status transition from {0} to {1}").format(current_state, state)
        )

    # Update ticket status and save
    ticket_doc.workflow_state = state
    ticket_doc.save(ignore_permissions=True)

    # Prepare updated KOT Ticket data
    updated_ticket = {
        "name": ticket_doc.name,
        "pos_order": ticket_doc.pos_order,
        "workflow_state": ticket_doc.workflow_state,
        "updated_at": now_datetime()
    }

    # Get kitchen/station info for targeted updates
    kitchen = None
    station = None

    kot_items = frappe.get_all(
        "KOT Item",
        filters={"parent": kot_ticket},
        fields=["kitchen", "kitchen_station"],
        limit=1
    )
    if kot_items:
        kitchen = kot_items[0].kitchen
        station = kot_items[0].kitchen_station

    # Publish updates
    publish_kitchen_update(updated_ticket, kitchen=kitchen, station=station)

    if pos_order.table:
        publish_table_update(pos_order.name, pos_order.table, "kot_status_update")

    # Update POS Order workflow state based on all related KOTs
    tickets = frappe.get_all(
        "KOT Ticket",
        filters={"pos_order": ticket_doc.pos_order},
        pluck="workflow_state"
    )
    new_pos_state = None
    if tickets:
        if all(s == "Cancelled" for s in tickets):
            new_pos_state = "Cancelled"
        elif all(s == "Served" for s in tickets):
            new_pos_state = "Served"
        elif all(s in ["Ready", "Served"] for s in tickets):
            new_pos_state = "Ready"
        elif any(s == "In Progress" for s in tickets):
            new_pos_state = "In Progress"

    if new_pos_state and pos_order.workflow_state != new_pos_state:
        frappe.db.set_value(
            "POS Order", pos_order.name, "workflow_state", new_pos_state
        )
        pos_order.workflow_state = new_pos_state

    return updated_ticket
