# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import uuid
import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from frappe.realtime import publish_realtime
from imogi_pos.utils.permissions import validate_branch_access
from imogi_pos.kitchen.kot_service import (
    KOTService,
    update_kot_item_state as service_update_kot_item_state,
)
from imogi_pos.utils.options import format_options_for_display
from imogi_pos.utils.kitchen_routing import get_menu_category_kitchen_station

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


def _normalise_kot_item(item):
    """Return a serialisable representation of a KOT Item."""
    attr = getattr(item, "as_dict", None)
    if callable(attr):
        item = attr()

    if isinstance(item, dict):
        normalised = dict(item)
    else:
        normalised = {"value": item}

    status = (
        normalised.get("workflow_state")
        or normalised.get("status")
        or normalised.get("state")
    )

    if status:
        normalised.setdefault("workflow_state", status)
        normalised.setdefault("status", status)

    return normalised


def publish_kitchen_update(
    kot_ticket,
    kitchen=None,
    station=None,
    event_type="kot_updated",
    changed_items=None,
):
    """
    Publishes realtime updates to kitchen display systems.

    Args:
        kot_ticket (Union[dict, str, Document]): KOT ticket details or name
        kitchen (str, optional): Kitchen name for targeted updates
        station (str, optional): Kitchen station name for targeted updates
        event_type (str, optional): Type of event being broadcast
        changed_items (list, optional): Collection of KOT items affected by the event
    """
    if not kot_ticket:
        return

    ticket_doc = None

    if isinstance(kot_ticket, str):
        try:
            ticket_doc = frappe.get_doc("KOT Ticket", kot_ticket)
            kot_ticket = ticket_doc.as_dict()
        except Exception:
            kot_ticket = {"name": kot_ticket}
    elif callable(getattr(kot_ticket, "as_dict", None)):
        ticket_doc = kot_ticket
        kot_ticket = ticket_doc.as_dict()
    elif isinstance(kot_ticket, dict):
        kot_ticket = dict(kot_ticket)
    else:
        return

    ticket_name = kot_ticket.get("name")
    if not ticket_name:
        return

    if ticket_doc is None:
        try:
            ticket_doc = frappe.get_doc("KOT Ticket", ticket_name)
        except Exception:
            ticket_doc = None

    items = kot_ticket.get("items") or []
    if not isinstance(items, list):
        items = []

    if not items and ticket_doc is not None:
        items = [
            _normalise_kot_item(item)
            for item in getattr(ticket_doc, "items", [])
        ]
    else:
        items = [_normalise_kot_item(item) for item in items]

    kot_ticket["items"] = items

    branch = kot_ticket.get("branch") or frappe.db.get_value(
        "KOT Ticket", ticket_name, "branch"
    )

    kitchen = (
        kitchen
        or kot_ticket.get("kitchen")
        or (ticket_doc and getattr(ticket_doc, "kitchen", None))
        or frappe.db.get_value("KOT Ticket", ticket_name, "kitchen")
    )

    station = (
        station
        or kot_ticket.get("kitchen_station")
        or (ticket_doc and getattr(ticket_doc, "kitchen_station", None))
        or frappe.db.get_value("KOT Ticket", ticket_name, "kitchen_station")
    )

    changed_items_payload = []
    for changed in changed_items or []:
        if isinstance(changed, str):
            try:
                changed = frappe.get_doc("KOT Item", changed)
            except Exception:
                continue
        changed_items_payload.append(_normalise_kot_item(changed))

    event_id = None
    generate_hash = getattr(frappe, "generate_hash", None)
    if callable(generate_hash):
        event_id = generate_hash(16)
    else:
        event_id = uuid.uuid4().hex

    action_alias = {
        "kot_created": "new_kot",
        "kot_updated": "kot_updated",
        "kot_item_updated": "kot_item_updated",
        "kot_removed": "delete_kot",
    }.get(event_type, event_type)

    payload = {
        "event_id": event_id,
        "event_type": event_type,
        "action": action_alias,
        "kot_ticket": kot_ticket,
        "kot": kot_ticket,
        "kot_name": ticket_name,
        "ticket": ticket_name,
        "branch": branch,
        "kitchen": kitchen,
        "station": station,
        "timestamp": now_datetime().isoformat(),
    }

    if changed_items_payload:
        payload["changed_items"] = changed_items_payload
        payload["updated_items"] = changed_items_payload

    publish_realtime("kitchen:all", payload)

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
def get_kitchens_and_stations(branch=None):
    """Return active kitchens and kitchen stations for the kitchen display.

    Args:
        branch (str, optional): Branch name to filter results by.

    Returns:
        dict: A dictionary with ``kitchens`` and ``stations`` lists ready for the
            kitchen display frontend.
    """

    if branch in ("", "null", "None"):
        branch = None

    if branch:
        validate_branch_access(branch)

    kitchen_filters = {"is_active": 1}
    if branch:
        kitchen_filters["branch"] = branch

    kitchens = frappe.get_all(
        "Kitchen",
        filters=kitchen_filters,
        fields=[
            "name",
            "kitchen_name",
            "branch",
            "default_station",
            "default_target_queue_time",
            "default_target_prep_time",
        ],
        order_by="kitchen_name asc",
    )

    stations = frappe.get_all(
        "Kitchen Station",
        filters={"is_active": 1},
        fields=["name", "station_name", "kitchen", "branch"],
        order_by="station_name asc",
    )

    if branch:
        kitchen_names = {kitchen["name"] for kitchen in kitchens}
        filtered_stations = []

        for station in stations:
            station_branch = station.get("branch")
            if station_branch == branch or station.get("kitchen") in kitchen_names:
                filtered_stations.append(station)

        stations = filtered_stations

    kitchen_lookup = {kitchen["name"]: kitchen["kitchen_name"] for kitchen in kitchens}
    for station in stations:
        kitchen_name = kitchen_lookup.get(station.get("kitchen"))
        if kitchen_name:
            station.setdefault("kitchen_name", kitchen_name)

    return {
        "kitchens": kitchens,
        "stations": stations,
    }


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

    ticket_fields = [
        "name",
        "table",
        "workflow_state",
        "creation",
        "pos_order",
        "branch",
        "kitchen",
        "kitchen_station",
        "floor",
        "order_type",
        "customer",
        "creation_time",
        "created_by",
        "owner",
    ]

    has_priority_field = False
    has_column = getattr(getattr(frappe, "db", None), "has_column", None)
    if callable(has_column):
        try:
            has_priority_field = bool(has_column("KOT Ticket", "priority"))
        except Exception:
            has_priority_field = False

    if has_priority_field:
        ticket_fields.insert(11, "priority")

    tickets = frappe.get_all(
        "KOT Ticket",
        filters=filters,
        fields=ticket_fields,
        order_by="creation asc",
        limit_page_length=0,
    )

    for ticket in tickets:
        ticket.setdefault("priority", 0)

        items = frappe.get_all(
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
                "options_display",
            ],
            order_by="idx asc",
            limit_page_length=0,
        )

        for item in items:
            raw_options = item.get("item_options")
            if not raw_options and item.get("options_display"):
                raw_options = item.get("options_display")
            item["options_display"] = format_options_for_display(raw_options)

        ticket.update(
            {
                "pos_order": ticket.get("pos_order"),
                "items": items,
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

        kitchen = item_details.get("kitchen")
        station = item_details.get("kitchen_station")

        if not station or not kitchen:
            item_defaults = frappe.db.get_value(
                "Item",
                item_code,
                ["default_kitchen_station", "default_kitchen"],
                as_dict=True,
            ) or {}

            default_kitchen = item_defaults.get("default_kitchen")
            default_station = item_defaults.get("default_kitchen_station")

            if not kitchen and default_kitchen:
                kitchen = default_kitchen

            if not station and default_station:
                station = default_station

        if (not station or not kitchen) and item_code:
            mapped_kitchen, mapped_station = get_menu_category_kitchen_station(item_code)

            if not kitchen and mapped_kitchen:
                kitchen = mapped_kitchen

            if not station and mapped_station:
                station = mapped_station

        if not station and kitchen:
            try:
                kitchen_doc = frappe.get_doc("Kitchen", kitchen)
            except Exception:
                kitchen_doc = None

            if kitchen_doc:
                station = getattr(kitchen_doc, "default_station", None) or station

        if not station:
            station = frappe.db.get_single_value(
                "Restaurant Settings", "default_kitchen_station"
            )
            if not station:
                station = "Main"

        if kitchen:
            item_details["kitchen"] = kitchen
        if station:
            item_details["kitchen_station"] = station

        if not getattr(kot_doc, "kitchen", None) and kitchen:
            kot_doc.kitchen = kitchen
        if not getattr(kot_doc, "kitchen_station", None) and station:
            kot_doc.kitchen_station = station

        if not item_details.get("kitchen_station") and not missing_station_item:
            missing_station_item = item_code

        options = item_details.get("item_options")
        if isinstance(options, dict):
            cleaned = {}
            for key, val in options.items():
                if isinstance(val, dict):
                    cleaned[key] = val
                else:
                    cleaned[key] = {"name": val}
            options = cleaned

        options_display = format_options_for_display(options)
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
                "options_display": options_display,
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
    publish_kitchen_update(
        kot_ticket,
        event_type="kot_created",
        kitchen=kot_ticket.get("kitchen"),
        station=kot_ticket.get("kitchen_station"),
    )
    
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

def _apply_ticket_state_change(kot_ticket, state):
    """Validate permissions and change the KOT Ticket state."""

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


@frappe.whitelist()
def start_preparing_kot_ticket(kot_ticket):
    """Move a KOT Ticket from *Queued* to *In Progress*."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["IN_PROGRESS"],
    )


@frappe.whitelist()
def mark_kot_ticket_ready(kot_ticket):
    """Mark a KOT Ticket as *Ready*."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["READY"],
    )


@frappe.whitelist()
def mark_kot_ticket_served(kot_ticket):
    """Mark a KOT Ticket as *Served*."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["SERVED"],
    )


@frappe.whitelist()
def return_kot_ticket_to_queue(kot_ticket):
    """Return a KOT Ticket to the *Queued* state."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["QUEUED"],
    )


@frappe.whitelist()
def return_kot_ticket_to_kitchen(kot_ticket):
    """Return a *Ready* KOT Ticket back to *In Progress*."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["IN_PROGRESS"],
    )


@frappe.whitelist()
def cancel_kot_ticket(kot_ticket):
    """Cancel a KOT Ticket."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["CANCELLED"],
    )


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

    return _apply_ticket_state_change(kot_ticket, state)

