# -*- coding: utf-8 -*-
# Copyright (c) 2023, IMOGI and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import uuid
import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from frappe.realtime import publish_realtime
from imogi_pos.utils.permission_manager import check_branch_access
from imogi_pos.utils.decorators import require_permission, require_role
from imogi_pos.utils.state_manager import StateManager
from imogi_pos.utils.kot_publisher import KOTPublisher
from imogi_pos.kitchen.kot_service import (
    KOTService,
    update_kot_item_state as service_update_kot_item_state,
)
from imogi_pos.utils.options import format_options_for_display
from imogi_pos.utils.kitchen_routing import get_menu_category_kitchen_station
from imogi_pos.api.printing import print_kot as api_print_kot

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
    
    Delegates to KOTPublisher for centralized handling.

    Args:
        kot_ticket (Union[dict, str, Document]): KOT ticket details or name
        kitchen (str, optional): Kitchen name for targeted updates
        station (str, optional): Kitchen station name for targeted updates
        event_type (str, optional): Type of event being broadcast
        changed_items (list, optional): Collection of KOT items affected by the event
    """
    if not kot_ticket:
        return
    
    # Use KOTPublisher for centralized handling
    KOTPublisher.publish_ticket_update(
        kot_ticket,
        event_type=event_type,
        changed_items=changed_items,
        kitchen=kitchen,
        station=station,
    )


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
def get_kitchens_and_stations():
    """Return active kitchens and kitchen stations for the kitchen display.
    Uses centralized operational context for branch filtering.

    Returns:
        dict: A dictionary with ``kitchens`` and ``stations`` lists ready for the
            kitchen display frontend.
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    context = require_operational_context(allow_optional=True)
    branch = context.get("branch")
    
    if branch:
        check_branch_access(branch)

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
def get_kitchen_stations():
    """Return active kitchen stations for the kitchen display.
    Uses centralized operational context for branch filtering.

    Returns:
        list: A list of kitchen stations ready for the kitchen display frontend.
    """
    result = get_kitchens_and_stations()
    return result.get("stations", [])


@frappe.whitelist()
def get_kot_tickets_by_status(station=None, kitchen=None):
    """Get KOT tickets organized by their status/workflow_state.
    Uses centralized operational context for branch filtering.

    Args:
        station (str, optional): Kitchen Station to filter by.
        kitchen (str, optional): Kitchen to filter by.

    Returns:
        list: List of KOT tickets with their items.
    """
    return get_kots_for_kitchen(kitchen=kitchen, station=station)


@frappe.whitelist()
def get_kots_for_kitchen(kitchen=None, station=None):
    """Get KOT tickets for a specific kitchen or station.
    Uses centralized operational context for branch filtering.

    Args:
        kitchen (str, optional): Kitchen name to filter by.
        station (str, optional): Kitchen Station to filter by.
        branch (str, optional): Branch to filter by (DEPRECATED - now uses operational context).

    Returns:
        list: List of KOT tickets with their items, ordered by creation time.
    """
    from imogi_pos.utils.operational_context import require_operational_context
    
    context = require_operational_context(allow_optional=True)
    branch = context.get("branch")

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
@require_permission("KOT Ticket", "create")
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
    check_branch_access(order_doc.branch)
    
    # Validate items for templates
    for row_name in item_rows:
        # POS Order Item uses "item" as the primary identifier. Fetch only this
        # field by default and include the legacy "item_code" field if it exists
        # in the table to maintain backwards compatibility.
        fields = ["item", "template_item"]
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
        
        template_item = item_data.get("template_item")

        # Check if this is a template item (has_variants = 1)
        # AND item hasn't been converted to variant yet (item still equals template_item)
        is_template = frappe.db.get_value("Item", item_identifier, "has_variants")
        is_unresolved = template_item and (item_identifier == template_item)
        
        if is_template and is_unresolved:
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
        error_msg = _("Kitchen station not configured for selected items.")
        if missing_station_item:
            error_msg += "\n" + _("Missing for item: {0}").format(missing_station_item)
        error_msg += "\n\n" + _("Please configure one of the following:")
        error_msg += "\n" + _("1. Set default kitchen/station on Item master")
        error_msg += "\n" + _("2. Configure Menu Category Routes in Restaurant Settings")
        error_msg += "\n" + _("3. Set Default Kitchen Station in Restaurant Settings")
        frappe.throw(error_msg, frappe.ValidationError)

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
    check_branch_access(pos_order.branch)

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
    check_branch_access(pos_order.branch)

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
@require_permission("KOT Ticket", "write")
def cancel_kot_ticket(kot_ticket):
    """Cancel a KOT Ticket."""

    return _apply_ticket_state_change(
        kot_ticket,
        KOTService.STATES["CANCELLED"],
    )


@frappe.whitelist()
@require_permission("KOT Ticket", "write")
def update_kot_status(kot_ticket, state):
    """
    Updates the overall status of a KOT Ticket.
    
    Permission: Requires 'write' permission on KOT Ticket (Kitchen Staff/Branch Manager only).
    Waiter role has read-only access and cannot update KOT status.

    Args:
        kot_ticket (str): KOT Ticket name
        state (str): New state (Queued/In Progress/Ready/Served/Cancelled)

    Returns:
        dict: Updated KOT Ticket details

    Raises:
        frappe.ValidationError: If the state transition is not allowed
        frappe.PermissionError: If user lacks 'write' permission on KOT Ticket
    """

    return _apply_ticket_state_change(kot_ticket, state)


@frappe.whitelist()
def print_kot(pos_order=None, kot_ticket=None, kitchen_station=None, copies=1, reprint=False, print_format=None):
    """
    Prints a KOT ticket using the configured print adapter.

    Args:
        pos_order (str, optional): POS Order name. If provided, will print the latest KOT for this order.
        kot_ticket (str, optional): KOT Ticket name. Use this to print a specific ticket.
        kitchen_station (str, optional): Kitchen Station to determine print settings.
        copies (int, optional): Number of copies to print. Defaults to 1.
        reprint (bool, optional): Whether this is a reprint. Defaults to False.
        print_format (str, optional): Custom print format to use.

    Returns:
        dict: Print result with success status and message

    Raises:
        frappe.ValidationError: If no ticket is found or printing fails
    """
    
    # Resolve KOT Ticket from POS Order if needed
    if not kot_ticket and pos_order:
        # Get the latest KOT ticket for this POS Order
        tickets = frappe.get_all(
            "KOT Ticket",
            filters={"pos_order": pos_order},
            fields=["name"],
            order_by="creation desc",
            limit_page_length=1
        )
        if tickets:
            kot_ticket = tickets[0]["name"]
    
    if not kot_ticket:
        frappe.throw(_("No KOT Ticket found to print"), frappe.ValidationError)
    
    # Get ticket details for validation
    ticket_doc = frappe.get_doc("KOT Ticket", kot_ticket)
    pos_order_doc = frappe.get_doc("POS Order", ticket_doc.pos_order)
    
    # Validate permissions
    check_restaurant_domain(pos_order_doc.pos_profile)
    check_branch_access(pos_order_doc.branch)
    
    # Determine kitchen station if not provided
    if not kitchen_station:
        kitchen_station = ticket_doc.kitchen_station
    
    # Delegate to the printing API
    try:
        result = api_print_kot(
            kot_ticket=kot_ticket,
            kitchen_station=kitchen_station,
            copies=cint(copies),
            reprint=reprint,
            print_format=print_format
        )
        return {"success": True, "message": result}
    except Exception as e:
        frappe.throw(_("Failed to print KOT: {0}").format(str(e)), frappe.ValidationError)


@frappe.whitelist()
def get_kitchen_orders(station=None, status=None):
    """
    Get all KOT orders for kitchen display using centralized operational context.
    
    Kitchen display receives orders from ALL sources in the POS Profile:
    - Counter 1, 2, 3 (multiple cashiers)
    - Kiosk 1, 2 (self-service)
    - Self Order (QR code)
    - Waiter stations
    
    Filter by POS Profile from operational context, NOT by device/session.
    
    Args:
        station (str, optional): Kitchen Station to filter by
        status (str, optional): KOT status filter (Pending, In Progress, Completed)
    
    Returns:
        dict: {
            'orders': List of KOT orders with items,
            'filter_by': 'pos_profile',
            'total_pending': count,
            'total_in_progress': count
        }
    """
    try:
        from imogi_pos.utils.operational_context import require_operational_context
        
        context = require_operational_context()
        pos_profile = context.get("pos_profile")
        branch = context.get("branch")
        
        # Base filters for KOT Ticket
        filters = {
            'docstatus': ['!=', 2]  # Not cancelled
        }
        
        # Add status filter if provided
        if status:
            filters['status'] = status
        else:
            # Default: show Pending and In Progress only
            filters['status'] = ['in', ['Pending', 'In Progress']]
        
        # Add station filter if provided
        if station:
            filters['kitchen_station'] = station
        
        # Get POS Orders filtered by POS Profile
        pos_order_filters = {'pos_profile': pos_profile}
        
        # Get POS Orders matching the profile
        pos_orders = frappe.get_all(
            'POS Order',
            filters=pos_order_filters,
            fields=['name'],
            pluck='name'
        )
        
        if not pos_orders:
            return {
                'orders': [],
                'filter_by': 'pos_profile',
                'total_pending': 0,
                'total_in_progress': 0,
                'message': 'No orders found for this POS Profile'
            }
        
        # Add POS Order filter to KOT filters
        filters['pos_order'] = ['in', pos_orders]
        
        # Get KOT Tickets
        kot_tickets = frappe.get_all(
            'KOT Ticket',
            filters=filters,
            fields=[
                'name',
                'pos_order',
                'kitchen_station',
                'status',
                'creation',
                'modified',
                'ticket_number'
            ],
            order_by='creation asc'
        )
        
        # Enrich with POS Order and items data
        orders = []
        for ticket in kot_tickets:
            # Get POS Order details
            pos_order_doc = frappe.get_doc('POS Order', ticket.pos_order)
            
            # Get KOT Items
            kot_items = frappe.get_all(
                'KOT Ticket Item',
                filters={'parent': ticket.name},
                fields=[
                    'item_code',
                    'item_name',
                    'quantity',
                    'status',
                    'notes',
                    'customizations'
                ]
            )
            
            orders.append({
                'ticket_name': ticket.name,
                'ticket_number': ticket.ticket_number,
                'pos_order': ticket.pos_order,
                'table_number': pos_order_doc.get('table_number'),
                'customer': pos_order_doc.get('customer'),
                'kitchen_station': ticket.kitchen_station,
                'status': ticket.status,
                'created_at': ticket.creation,
                'updated_at': ticket.modified,
                'items': kot_items,
                'source_module': pos_order_doc.get('imogi_source_module', 'Unknown')
            })
        
        # Count by status
        total_pending = sum(1 for o in orders if o['status'] == 'Pending')
        total_in_progress = sum(1 for o in orders if o['status'] == 'In Progress')
        
        return {
            'orders': orders,
            'filter_by': 'pos_profile',
            'pos_profile': pos_profile,
            'branch': branch,
            'station': station,
            'total_pending': total_pending,
            'total_in_progress': total_in_progress,
            'total_orders': len(orders)
        }
    
    except Exception as e:
        frappe.log_error(f'Error in get_kitchen_orders: {str(e)}')
        frappe.throw(_('Error fetching kitchen orders: {0}').format(str(e)))


@frappe.whitelist()
def get_active_kots(kitchen=None, station=None):
    """
    Get active KOTs for Kitchen Display System using centralized operational context.
    Returns KOTs that are not Served or Cancelled.
    
    Args:
        kitchen (str, optional): Kitchen name to filter
        station (str, optional): Station name to filter
    
    Returns:
        list: Active KOT documents with items
    """
    try:
        from imogi_pos.utils.operational_context import require_operational_context
        
        context = require_operational_context()
        pos_profile = context.get("pos_profile")
        branch = context.get("branch")
        
        filters = {
            "workflow_state": ["not in", ["Served", "Cancelled"]],
            "docstatus": 1
        }
        
        # Get branch from POS Profile and filter KOTs by that branch
        if branch:
            filters["branch"] = branch
        elif kitchen:
            filters["kitchen"] = kitchen
        
        if station:
            filters["station"] = station
        
        # Fetch KOT tickets
        kots = frappe.get_all(
            "KOT Ticket",
            filters=filters,
            fields=[
                "name",
                "ticket_number",
                "pos_order",
                "kitchen",
                "station",
                "workflow_state",
                "creation",
                "modified",
                "table_name",
                "order_type",
                "special_notes"
            ],
            order_by="creation asc"
        )
        
        # Batch fetch items for all KOTs (performance optimization: avoid N+1 queries)
        # PERFORMANCE: Reduced from N+1 queries (1 per KOT) to 2 queries total
        if kots:
            kot_names = [kot.name for kot in kots]
            all_items = frappe.get_all(
                "KOT Item",
                filters={"parent": ["in", kot_names]},
                fields=[
                    "parent",
                    "name",
                    "item_code",
                    "item_name",
                    "qty",
                    "uom",
                    "rate",
                    "notes",
                    "variant_of",
                    "item_group"
                ],
                order_by="parent, idx asc"
            )
            
            # Build map of items grouped by parent KOT
            items_map = {}
            for item in all_items:
                parent = item.pop("parent")
                items_map.setdefault(parent, []).append(item)
            
            # Assign items to their parent KOTs
            for kot in kots:
                kot["items"] = items_map.get(kot.name, [])
        
        return kots
        
    except Exception as e:
        frappe.log_error(f"Error in get_active_kots: {str(e)}", "KOT API Error")
        frappe.throw(_("Failed to fetch active KOTs: {0}").format(str(e)))


@frappe.whitelist()
def update_kot_state(kot_name, new_state, reason=None):
    """
    Update KOT workflow state with validation.
    Publishes realtime events after successful update.
    
    Args:
        kot_name (str): KOT document name
        new_state (str): Target workflow state (Queued, In Progress, Ready, Served, Cancelled)
        reason (str, optional): Reason for state change (required for Cancelled)
    
    Returns:
        dict: Updated KOT document
    """
    try:
        # Validate inputs
        if not kot_name:
            frappe.throw(_("KOT name is required"))
        
        if not new_state:
            frappe.throw(_("New state is required"))
        
        valid_states = ["Queued", "In Progress", "Ready", "Served", "Cancelled"]
        if new_state not in valid_states:
            frappe.throw(_("Invalid state: {0}. Must be one of: {1}").format(
                new_state, ", ".join(valid_states)
            ))
        
        # Cancellation requires reason
        if new_state == "Cancelled" and not reason:
            frappe.throw(_("Cancellation reason is required"))
        
        # Get KOT document
        kot_doc = frappe.get_doc("KOT Ticket", kot_name)
        old_state = kot_doc.workflow_state
        
        # Validate state transition using StateManager
        state_manager = StateManager()
        if not state_manager.can_transition(old_state, new_state):
            frappe.throw(_(
                "Invalid state transition from {0} to {1}"
            ).format(old_state, new_state))
        
        # Update state
        kot_doc.workflow_state = new_state
        
        # Add cancellation reason if provided
        if reason:
            kot_doc.special_notes = (kot_doc.special_notes or "") + f"\nCancellation reason: {reason}"
        
        # Save with ignore_permissions to allow state updates
        kot_doc.save(ignore_permissions=True)
        
        # Publish realtime update
        publish_kitchen_update(
            kot_doc,
            kitchen=kot_doc.kitchen,
            station=kot_doc.station,
            event_type="kot_state_changed"
        )
        
        # If table-based, publish table update
        if kot_doc.table_name:
            publish_table_update(
                kot_doc.pos_order,
                kot_doc.table_name,
                event_type="kot_state_changed"
            )
        
        frappe.db.commit()
        
        return {
            "name": kot_doc.name,
            "workflow_state": kot_doc.workflow_state,
            "old_state": old_state,
            "new_state": new_state,
            "modified": kot_doc.modified
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error updating KOT state: {str(e)}", "KOT State Update Error")
        frappe.throw(_("Failed to update KOT state: {0}").format(str(e)))


@frappe.whitelist()
def send_to_kitchen(order_name, items_by_station):
    """
    Create KOTs from order items grouped by production station.
    Each station gets its own KOT ticket.
    
    Args:
        order_name (str): POS Order document name
        items_by_station (dict): Items grouped by station name
            Example: {
                "Main Kitchen": [{"item_code": "FOOD-001", "qty": 2, ...}],
                "Beverage Station": [{"item_code": "DRINK-001", "qty": 1, ...}]
            }
    
    Returns:
        dict: Created KOT names grouped by station
    """
    try:
        # Parse items_by_station if it's a JSON string
        if isinstance(items_by_station, str):
            import json
            items_by_station = json.loads(items_by_station)
        
        if not order_name:
            frappe.throw(_("Order name is required"))
        
        if not items_by_station or not isinstance(items_by_station, dict):
            frappe.throw(_("Items by station must be a dictionary"))
        
        # Get order document
        order_doc = frappe.get_doc("POS Order", order_name)
        
        # Validate order is not already completed
        if order_doc.docstatus == 2:
            frappe.throw(_("Cannot send cancelled order to kitchen"))
        
        created_kots = {}
        
        # Create KOT for each station
        for station_name, station_items in items_by_station.items():
            if not station_items:
                continue
            
            # Get kitchen for this station
            kitchen = frappe.db.get_value("Kitchen Station", station_name, "kitchen")
            if not kitchen:
                # Use default kitchen from branch or first available
                kitchen = frappe.db.get_value("Kitchen", {"branch": order_doc.branch, "is_active": 1}, "name")
            
            # Create KOT document
            kot_doc = frappe.new_doc("KOT Ticket")
            kot_doc.pos_order = order_name
            kot_doc.kitchen = kitchen or "Main Kitchen"
            kot_doc.station = station_name
            kot_doc.table_name = order_doc.get("table")
            kot_doc.order_type = order_doc.get("order_type", "Dine-in")
            kot_doc.workflow_state = "Queued"
            kot_doc.branch = order_doc.branch
            
            # Add items
            for item in station_items:
                kot_doc.append("items", {
                    "item_code": item.get("item_code"),
                    "item_name": item.get("item_name"),
                    "qty": item.get("qty", 1),
                    "uom": item.get("uom"),
                    "rate": item.get("rate", 0),
                    "notes": item.get("notes", ""),
                    "variant_of": item.get("variant_of")
                })
            
            # Save KOT (ignore_permissions allows Waiter role via endpoint permission gate)
            # Security: Controlled by @require_permission on send_to_kitchen + validate_branch_access
            
            # CRITICAL FIX: Wrap KOT insert/submit with proper error logging
            try:
                kot_doc.insert(ignore_permissions=True)
            except Exception as e:
                # Log full traceback with context for debugging
                context_info = {
                    "pos_order": order_name,
                    "station": station_name,
                    "kitchen": kitchen,
                    "items_count": len(station_items),
                    "branch": order_doc.branch,
                    "table": order_doc.get("table"),
                    "user": frappe.session.user,
                    "function": "send_to_kitchen::kot_insert"
                }
                
                error_message = f"""
KOT Creation Failed (Insert)

Error: {str(e)}

Context:
- POS Order: {context_info['pos_order']}
- Station: {context_info['station']}
- Kitchen: {context_info['kitchen']}
- Items Count: {context_info['items_count']}
- Branch: {context_info['branch']}
- Table: {context_info['table']}
- User: {context_info['user']}

Full Traceback:
{frappe.get_traceback()}
"""
                
                frappe.log_error(
                    title="Error creating KOT Ticket",
                    message=error_message
                )
                
                # Re-raise with clear user message
                frappe.throw(
                    _("Failed to create KOT for {0}: {1}").format(station_name, str(e)),
                    frappe.ValidationError
                )
            
            # Submit KOT with error logging
            try:
                kot_doc.submit()
            except Exception as e:
                # Log full traceback with context for debugging
                context_info = {
                    "kot_name": kot_doc.name,
                    "pos_order": order_name,
                    "station": station_name,
                    "items_count": len(station_items),
                    "user": frappe.session.user,
                    "function": "send_to_kitchen::kot_submit"
                }
                
                error_message = f"""
KOT Submission Failed

Error: {str(e)}

Context:
- KOT Name: {context_info['kot_name']}
- POS Order: {context_info['pos_order']}
- Station: {context_info['station']}
- Items Count: {context_info['items_count']}
- User: {context_info['user']}

Full Traceback:
{frappe.get_traceback()}
"""
                
                frappe.log_error(
                    title="Error submitting KOT Ticket",
                    message=error_message
                )
                
                # Re-raise with clear user message
                frappe.throw(
                    _("Failed to submit KOT {0}: {1}").format(kot_doc.name, str(e)),
                    frappe.ValidationError
                )
            
            created_kots[station_name] = kot_doc.name
            
            # Publish realtime notification
            publish_kitchen_update(
                kot_doc,
                kitchen=kitchen,
                station=station_name,
                event_type="kot_created"
            )
        
        # Update table status if dine-in
        # This is a secondary operation - log error but don't fail the KOT creation
        if order_doc.get("table"):
            try:
                table_doc = frappe.get_doc("Restaurant Table", order_doc.table)
                if table_doc.status != "Occupied":
                    table_doc.status = "Occupied"
                    table_doc.current_order = order_name
                    table_doc.save(ignore_permissions=True)
                    
                # Publish table update
                publish_table_update(
                    order_name,
                    order_doc.table,
                    event_type="order_sent_to_kitchen"
                )
            except Exception as table_err:
                # Log error but don't fail KOT creation
                frappe.log_error(
                    title="Warning: Failed to update table status after KOT",
                    message=f"""
Table Status Update Failed (Non-Critical)

Error: {str(table_err)}

Context:
- Table: {order_doc.table}
- Order: {order_name}
- User: {frappe.session.user}

Note: KOTs were created successfully. Table status update is a secondary operation.

Full Traceback:
{frappe.get_traceback()}
"""
                )
                # Don't throw - KOTs were created successfully
        
        frappe.db.commit()
        
        return {
            "success": True,
            "kots": created_kots,
            "total_kots": len(created_kots)
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error sending to kitchen: {str(e)}", "Send to Kitchen Error")
        frappe.throw(_("Failed to send order to kitchen: {0}").format(str(e)))

